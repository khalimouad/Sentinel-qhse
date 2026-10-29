ALTER TABLE app.actions ADD COLUMN obligation_id uuid;
ALTER TABLE app.actions ADD CONSTRAINT action_obligation_scope FOREIGN KEY(tenant_id,obligation_id,site_id) REFERENCES app.obligations(tenant_id,id,site_id);
ALTER TABLE app.actions DROP CONSTRAINT action_single_origin;
ALTER TABLE app.actions ADD CONSTRAINT action_single_origin CHECK(num_nonnulls(report_id,risk_id,obligation_id)<=1);
CREATE INDEX actions_obligation_idx ON app.actions(tenant_id,obligation_id,site_id);
ALTER TABLE app.obligations ADD COLUMN treatment_revision integer NOT NULL DEFAULT 0 CHECK(treatment_revision>=0);
ALTER TABLE app.obligations ADD COLUMN last_treatment_action_id uuid;
ALTER TABLE app.obligations ADD CONSTRAINT obligation_last_treatment_scope FOREIGN KEY(tenant_id,last_treatment_action_id,site_id) REFERENCES app.actions(tenant_id,id,site_id);
CREATE INDEX obligation_last_treatment_idx ON app.obligations(tenant_id,last_treatment_action_id,site_id);
DROP POLICY actions_read ON app.actions;
CREATE POLICY actions_read ON app.actions FOR SELECT USING(identity.has_site_access(tenant_id,site_id)
  AND (report_id IS NULL OR EXISTS(SELECT 1 FROM app.reports r WHERE r.tenant_id=actions.tenant_id AND r.id=actions.report_id))
  AND (risk_id IS NULL OR EXISTS(SELECT 1 FROM app.risks r WHERE r.tenant_id=actions.tenant_id AND r.id=actions.risk_id))
  AND (obligation_id IS NULL OR EXISTS(SELECT 1 FROM app.obligations o WHERE o.tenant_id=actions.tenant_id AND o.id=actions.obligation_id)));
CREATE OR REPLACE FUNCTION app.guard_obligation_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE linked_action app.actions;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.source_status<>'unverified' OR NEW.assessment_status<>'not_assessed' OR NEW.lifecycle<>'active'
      OR NEW.verified_by IS NOT NULL OR NEW.verified_at IS NOT NULL OR NEW.assessed_by IS NOT NULL OR NEW.assessed_at IS NOT NULL
      OR NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.owner_id) THEN RAISE EXCEPTION 'Invalid initial obligation state' USING ERRCODE='23514'; END IF;
    NEW.source_sha256:=encode(sha256(convert_to(jsonb_build_object('jurisdiction',NEW.jurisdiction,'title',NEW.source_title,'version',NEW.source_version,
      'article',NEW.article,'url',NEW.source_url,'excerpt',NEW.excerpt)::text,'UTF8')),'hex');
    RETURN NEW;
  END IF;
  IF NEW.treatment_revision IS DISTINCT FROM OLD.treatment_revision THEN
    IF pg_trigger_depth()<=1 OR NEW.treatment_revision<>OLD.treatment_revision+1 OR NEW.last_treatment_action_id IS NULL
      OR ROW(NEW.lifecycle,NEW.source_status,NEW.verification_note,NEW.verified_by,NEW.verified_at,NEW.owner_id,NEW.next_review_on,
        NEW.assessment_status,NEW.assessment_note,NEW.evidence_reference,NEW.assessed_by,NEW.assessed_at)
      IS DISTINCT FROM ROW(OLD.lifecycle,OLD.source_status,OLD.verification_note,OLD.verified_by,OLD.verified_at,OLD.owner_id,OLD.next_review_on,
        OLD.assessment_status,OLD.assessment_note,OLD.evidence_reference,OLD.assessed_by,OLD.assessed_at) THEN
      RAISE EXCEPTION 'Invalid internal treatment change' USING ERRCODE='42501'; END IF;
    SELECT * INTO linked_action FROM app.actions WHERE tenant_id=NEW.tenant_id AND id=NEW.last_treatment_action_id AND obligation_id=NEW.id AND site_id=NEW.site_id;
    IF linked_action.id IS NULL THEN RAISE EXCEPTION 'Treatment action does not match the obligation' USING ERRCODE='23514'; END IF;
    IF linked_action.status='open' THEN
      NEW.lifecycle:='active';NEW.assessment_status:='not_assessed';NEW.assessment_note:=NULL;NEW.evidence_reference:=NULL;NEW.assessed_by:=NULL;NEW.assessed_at:=NULL;
    END IF;
    NEW.revision:=OLD.revision+1;NEW.updated_at:=clock_timestamp();RETURN NEW;
  END IF;
  IF NEW.last_treatment_action_id IS DISTINCT FROM OLD.last_treatment_action_id THEN RAISE EXCEPTION 'Treatment metadata is server managed' USING ERRCODE='42501'; END IF;
  IF NEW.lifecycle<>OLD.lifecycle THEN
    IF NEW.lifecycle='archived' AND EXISTS(SELECT 1 FROM app.actions WHERE tenant_id=NEW.tenant_id AND obligation_id=NEW.id AND status='open') THEN RAISE EXCEPTION 'Complete treatment actions before archiving' USING ERRCODE='23514'; END IF;
    IF NEW.source_status<>OLD.source_status OR NEW.verification_note IS DISTINCT FROM OLD.verification_note
      OR ROW(NEW.owner_id,NEW.next_review_on,NEW.assessment_status,NEW.assessment_note,NEW.evidence_reference)
      IS DISTINCT FROM ROW(OLD.owner_id,OLD.next_review_on,OLD.assessment_status,OLD.assessment_note,OLD.evidence_reference) THEN
      RAISE EXCEPTION 'Change lifecycle separately from verification and assessment' USING ERRCODE='23514'; END IF;
    IF NEW.lifecycle='active' THEN
      NEW.assessment_status:='not_assessed';NEW.assessment_note:=NULL;NEW.evidence_reference:=NULL;NEW.assessed_by:=NULL;NEW.assessed_at:=NULL;
    END IF;
  ELSE
    IF OLD.lifecycle='archived' THEN RAISE EXCEPTION 'Reopen obligation before changing it' USING ERRCODE='23514'; END IF;
    IF NEW.source_status<>OLD.source_status THEN
      IF OLD.source_status<>'unverified' OR NEW.source_status<>'verified' OR identity.actor_id()=OLD.created_by
        OR length(btrim(coalesce(NEW.verification_note,'')))=0 THEN RAISE EXCEPTION 'A distinct named source verifier and note are required' USING ERRCODE='42501'; END IF;
      NEW.verified_by:=identity.actor_id();NEW.verified_at:=clock_timestamp();
    ELSE
      IF NEW.verification_note IS DISTINCT FROM OLD.verification_note THEN RAISE EXCEPTION 'Source verification is immutable' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  NEW.revision:=OLD.revision+1;NEW.updated_at:=clock_timestamp();RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION app.assess_obligation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.lifecycle<>'active' OR NEW.lifecycle<>'active' OR OLD.source_status<>'verified' OR NEW.source_status<>'verified'
    OR NEW.verification_note IS DISTINCT FROM OLD.verification_note OR NEW.assessment_status='not_assessed'
    OR length(btrim(coalesce(NEW.assessment_note,'')))=0 OR length(btrim(coalesce(NEW.evidence_reference,'')))=0
    OR NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.owner_id) THEN
    RAISE EXCEPTION 'Assessment requires a verified active obligation, eligible owner and evidence' USING ERRCODE='23514'; END IF;
  IF NEW.assessment_status IN ('compliant','not_applicable') AND EXISTS(SELECT 1 FROM app.actions WHERE tenant_id=NEW.tenant_id AND obligation_id=NEW.id AND status='open') THEN RAISE EXCEPTION 'Complete linked actions before a positive assessment' USING ERRCODE='23514'; END IF;
  IF NEW.next_review_on<(statement_timestamp() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'Next review must not be overdue' USING ERRCODE='23514'; END IF;
  NEW.assessed_by:=identity.actor_id();NEW.assessed_at:=clock_timestamp();RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION app.record_obligation_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_name text:=TG_OP;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.treatment_revision<>OLD.treatment_revision THEN operation_name:='TREATMENT';
    ELSIF NEW.lifecycle<>OLD.lifecycle THEN operation_name:=CASE WHEN NEW.lifecycle='archived' THEN 'ARCHIVE' ELSE 'REOPEN' END;
    ELSIF NEW.source_status<>OLD.source_status THEN operation_name:='VERIFY_SOURCE';
    ELSIF NEW.assessed_at IS DISTINCT FROM OLD.assessed_at THEN operation_name:='ASSESS';END IF;
  END IF;
  INSERT INTO app.obligation_events(tenant_id,site_id,obligation_id,actor_id,operation,before_data,after_data)
    VALUES(NEW.tenant_id,NEW.site_id,NEW.id,identity.actor_id(),operation_name,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
  RETURN NEW;
END $$;
CREATE FUNCTION app.guard_obligation_action() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE parent app.obligations;
BEGIN
  IF NEW.obligation_id IS NOT NULL THEN
    SELECT * INTO parent FROM app.obligations WHERE tenant_id=NEW.tenant_id AND id=NEW.obligation_id FOR UPDATE;
    IF parent.id IS NULL OR parent.lifecycle<>'active' OR parent.source_status<>'verified'
      OR NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.owner_id) THEN
      RAISE EXCEPTION 'Treatment requires a verified active obligation and eligible assignee' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER obligation_action_guard BEFORE INSERT ON app.actions FOR EACH ROW EXECUTE FUNCTION app.guard_obligation_action();
CREATE FUNCTION app.sync_obligation_action() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.obligation_id IS NOT NULL AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE app.obligations SET treatment_revision=treatment_revision+1,last_treatment_action_id=NEW.id,
      last_change_note=CASE WHEN TG_OP='INSERT' THEN 'Action de traitement ajoutée : ' ELSE CASE WHEN NEW.status='open' THEN 'Action de traitement rouverte : ' ELSE 'Action de traitement clôturée : ' END END||NEW.id::text
      WHERE tenant_id=NEW.tenant_id AND id=NEW.obligation_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER obligation_action_sync AFTER INSERT OR UPDATE ON app.actions FOR EACH ROW EXECUTE FUNCTION app.sync_obligation_action();
REVOKE ALL ON FUNCTION app.guard_obligation_action(),app.sync_obligation_action() FROM PUBLIC;
GRANT INSERT(obligation_id) ON app.actions TO sentinelle_app;
-- No runtime UPDATE on treatment_revision or last_treatment_action_id. Only the
-- narrow AFTER action trigger manages them; assessment UPDATE OF is not invoked.
