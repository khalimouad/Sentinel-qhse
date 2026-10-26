-- Existing completed snapshots are deliberately preserved. Names are captured only
-- for future completions; historical exports keep identifiers when names are absent.
ALTER TABLE app.audits ADD COLUMN replan_reason text NOT NULL DEFAULT '' CHECK(length(replan_reason)<=2000);
CREATE OR REPLACE FUNCTION app.guard_audit_session() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item jsonb; previous jsonb; finding record; plan_changed boolean;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.lead_id) OR NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.auditee_id)
      OR NEW.status<>'planned' OR NEW.report_snapshot IS NOT NULL OR NEW.completed_at IS NOT NULL
      OR NEW.conclusion<>'' OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.checklist) x WHERE x->>'result'<>'pending' OR x->>'evidence'<>'') THEN
      RAISE EXCEPTION 'Invalid audit plan or participants' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Audit is frozen' USING ERRCODE='23514'; END IF;
  IF NEW.status<>OLD.status THEN
    IF NOT ((OLD.status='planned' AND NEW.status IN ('in_progress','cancelled')) OR (OLD.status='in_progress' AND NEW.status='completed')) THEN
      RAISE EXCEPTION 'Invalid audit transition' USING ERRCODE='23514'; END IF;
  END IF;
  plan_changed := ROW(NEW.title,NEW.standard,NEW.scope,NEW.starts_on,NEW.ends_on,NEW.lead_id,NEW.auditee_id)
    IS DISTINCT FROM ROW(OLD.title,OLD.standard,OLD.scope,OLD.starts_on,OLD.ends_on,OLD.lead_id,OLD.auditee_id);
  IF plan_changed THEN
    IF NOT identity.can_write_site(NEW.tenant_id,NEW.site_id) THEN RAISE EXCEPTION 'Audit planning requires site management access' USING ERRCODE='42501'; END IF;
    IF OLD.status<>'planned' OR NEW.status<>OLD.status OR NEW.checklist<>OLD.checklist OR NEW.conclusion<>OLD.conclusion THEN
      RAISE EXCEPTION 'Replan separately before starting the audit' USING ERRCODE='23514'; END IF;
    IF length(btrim(NEW.replan_reason))=0 THEN RAISE EXCEPTION 'A replan reason is required' USING ERRCODE='23514'; END IF;
    IF NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.lead_id) OR NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.auditee_id) THEN
      RAISE EXCEPTION 'Invalid replanned participants' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW.replan_reason IS DISTINCT FROM OLD.replan_reason THEN RAISE EXCEPTION 'A reason must accompany a plan change' USING ERRCODE='23514'; END IF;
    IF NEW.status<>'cancelled' AND identity.actor_id()<>OLD.lead_id THEN RAISE EXCEPTION 'Only the lead auditor can execute this audit' USING ERRCODE='42501'; END IF;
  END IF;
  IF OLD.status='planned' AND NEW.status='in_progress' AND
    (NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.lead_id) OR NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.auditee_id)) THEN
    RAISE EXCEPTION 'Participants must still be eligible when starting' USING ERRCODE='23514'; END IF;
  IF OLD.status='in_progress' THEN
    IF jsonb_array_length(NEW.checklist)<>jsonb_array_length(OLD.checklist) THEN RAISE EXCEPTION 'Checklist questions are frozen after start' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(OLD.checklist) LOOP
      SELECT value INTO previous FROM jsonb_array_elements(NEW.checklist) WHERE value->>'id'=item->>'id';
      IF previous IS NULL OR (previous - ARRAY['result','evidence'])<>(item - ARRAY['result','evidence']) THEN
        RAISE EXCEPTION 'Checklist questions are frozen after start' USING ERRCODE='23514'; END IF;
    END LOOP;
  END IF;
  IF OLD.status='planned' AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.checklist) x WHERE x->>'result'<>'pending' OR x->>'evidence'<>'') THEN
    RAISE EXCEPTION 'Start audit before recording evidence' USING ERRCODE='23514'; END IF;
  IF NEW.status='in_progress' AND jsonb_array_length(NEW.checklist)=0 THEN RAISE EXCEPTION 'Checklist required' USING ERRCODE='23514'; END IF;
  FOR finding IN SELECT item_id FROM app.audit_findings WHERE tenant_id=NEW.tenant_id AND audit_id=NEW.id LOOP
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.checklist) x WHERE x->>'id'=finding.item_id::text AND x->>'result'='nonconform') THEN
      RAISE EXCEPTION 'Linked findings cannot be removed or reclassified' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF NEW.status IN ('completed','cancelled') AND length(btrim(NEW.conclusion))=0 THEN RAISE EXCEPTION 'Conclusion or cancellation reason required' USING ERRCODE='23514'; END IF;
  IF NEW.status='completed' THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.checklist) x WHERE x->>'result'='pending' OR length(btrim(x->>'evidence'))=0
      OR (x->>'result'='nonconform' AND NOT EXISTS(SELECT 1 FROM app.audit_findings f WHERE f.audit_id=NEW.id AND f.item_id::text=x->>'id'))) THEN
      RAISE EXCEPTION 'Answer every question with evidence and register each nonconformity' USING ERRCODE='23514'; END IF;
    NEW.completed_at:=clock_timestamp();
    NEW.report_snapshot:=jsonb_build_object('title',NEW.title,'standard',NEW.standard,'scope',NEW.scope,'siteId',NEW.site_id,
      'startsOn',NEW.starts_on,'endsOn',NEW.ends_on,'leadId',NEW.lead_id,'auditeeId',NEW.auditee_id,'completedBy',identity.actor_id(),
      'completedAt',NEW.completed_at,'conclusion',NEW.conclusion,'checklist',NEW.checklist,
      'schemaVersion',2,'auditId',NEW.id,
      'siteName',(SELECT name FROM app.sites WHERE tenant_id=NEW.tenant_id AND id=NEW.site_id),
      'tenantName',(SELECT name FROM app.tenants WHERE id=NEW.tenant_id),
      'leadName',(SELECT name FROM identity.list_members(NEW.tenant_id) WHERE id=NEW.lead_id),
      'auditeeName',(SELECT name FROM identity.list_members(NEW.tenant_id) WHERE id=NEW.auditee_id),
      'completedByName',(SELECT name FROM identity.list_members(NEW.tenant_id) WHERE id=identity.actor_id()),
      'findings',coalesce((SELECT jsonb_agg(jsonb_build_object('itemId',f.item_id,'reportId',f.report_id) ORDER BY f.item_id) FROM app.audit_findings f WHERE f.audit_id=NEW.id),'[]'::jsonb));
  END IF;
  NEW.revision:=OLD.revision+1; NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION app.record_audit_session() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_name text := TG_OP;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.title,NEW.standard,NEW.scope,NEW.starts_on,NEW.ends_on,NEW.lead_id,NEW.auditee_id)
      IS DISTINCT FROM ROW(OLD.title,OLD.standard,OLD.scope,OLD.starts_on,OLD.ends_on,OLD.lead_id,OLD.auditee_id) THEN
      operation_name := 'REPLAN';
    END IF;
  END IF;
  INSERT INTO app.audit_session_events(tenant_id,site_id,audit_id,actor_id,operation,before_data,after_data)
    VALUES(NEW.tenant_id,NEW.site_id,NEW.id,identity.actor_id(),operation_name,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
  RETURN NEW;
END $$;
GRANT UPDATE(title,standard,scope,starts_on,ends_on,lead_id,auditee_id,replan_reason) ON app.audits TO sentinelle_app;
