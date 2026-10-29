CREATE TABLE app.obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, site_id uuid NOT NULL,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 300),
  jurisdiction text NOT NULL CHECK(jurisdiction ~ '^[A-Z][A-Z0-9_-]{1,19}$'),
  source_title text NOT NULL CHECK(length(btrim(source_title)) BETWEEN 1 AND 500),
  source_version text NOT NULL CHECK(length(btrim(source_version)) BETWEEN 1 AND 200),
  article text NOT NULL CHECK(length(btrim(article)) BETWEEN 1 AND 200),
  source_url text NOT NULL CHECK(length(source_url)<=2000 AND source_url ~ '^https://[^[:space:]]+$' AND source_url !~ '^https://[^/?#]*@'),
  excerpt text NOT NULL CHECK(length(btrim(excerpt)) BETWEEN 1 AND 8000), source_sha256 text NOT NULL,
  owner_id uuid NOT NULL, created_by uuid NOT NULL, next_review_on date NOT NULL,
  lifecycle text NOT NULL DEFAULT 'active' CHECK(lifecycle IN ('active','archived')),
  source_status text NOT NULL DEFAULT 'unverified' CHECK(source_status IN ('unverified','verified')),
  verification_note text CHECK(length(verification_note)<=4000), verified_by uuid, verified_at timestamptz,
  assessment_status text NOT NULL DEFAULT 'not_assessed' CHECK(assessment_status IN ('not_assessed','compliant','partial','noncompliant','not_applicable')),
  assessment_note text CHECK(length(assessment_note)<=4000), evidence_reference text CHECK(length(evidence_reference)<=2000),
  assessed_by uuid, assessed_at timestamptz,
  last_change_note text NOT NULL CHECK(length(btrim(last_change_note)) BETWEEN 1 AND 4000),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id,site_id),
  FOREIGN KEY(tenant_id,site_id) REFERENCES app.sites(tenant_id,id),
  FOREIGN KEY(tenant_id,owner_id) REFERENCES identity.memberships(tenant_id,user_id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES identity.memberships(tenant_id,user_id),
  FOREIGN KEY(tenant_id,verified_by) REFERENCES identity.memberships(tenant_id,user_id),
  FOREIGN KEY(tenant_id,assessed_by) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE INDEX obligations_list_idx ON app.obligations(tenant_id,site_id,updated_at DESC,id);
CREATE INDEX obligations_review_idx ON app.obligations(tenant_id,next_review_on) WHERE lifecycle='active';
CREATE INDEX obligations_owner_idx ON app.obligations(tenant_id,owner_id);
CREATE INDEX obligations_creator_idx ON app.obligations(tenant_id,created_by);
CREATE INDEX obligations_verifier_idx ON app.obligations(tenant_id,verified_by);
CREATE INDEX obligations_assessor_idx ON app.obligations(tenant_id,assessed_by);
CREATE TABLE app.obligation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, site_id uuid NOT NULL, obligation_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES identity.users(id), operation text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),before_data jsonb,after_data jsonb NOT NULL,
  FOREIGN KEY(tenant_id,obligation_id,site_id) REFERENCES app.obligations(tenant_id,id,site_id)
);
CREATE INDEX obligation_events_parent_idx ON app.obligation_events(tenant_id,obligation_id,occurred_at DESC);
CREATE INDEX obligation_events_site_idx ON app.obligation_events(tenant_id,site_id);
CREATE INDEX obligation_events_actor_idx ON app.obligation_events(actor_id);
ALTER TABLE app.obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.obligations FORCE ROW LEVEL SECURITY;
ALTER TABLE app.obligation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.obligation_events FORCE ROW LEVEL SECURITY;
CREATE POLICY obligations_read ON app.obligations FOR SELECT USING(identity.can_write_site(tenant_id,site_id));
CREATE POLICY obligations_create ON app.obligations FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id) AND created_by=identity.actor_id());
CREATE POLICY obligations_update ON app.obligations FOR UPDATE USING(identity.can_write_site(tenant_id,site_id)) WITH CHECK(identity.can_write_site(tenant_id,site_id));
CREATE POLICY obligation_events_read ON app.obligation_events FOR SELECT USING(identity.can_write_site(tenant_id,site_id));
CREATE POLICY obligation_events_append ON app.obligation_events FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id));
CREATE FUNCTION app.guard_obligation_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.source_status<>'unverified' OR NEW.assessment_status<>'not_assessed' OR NEW.lifecycle<>'active'
      OR NEW.verified_by IS NOT NULL OR NEW.verified_at IS NOT NULL OR NEW.assessed_by IS NOT NULL OR NEW.assessed_at IS NOT NULL
      OR NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.owner_id) THEN RAISE EXCEPTION 'Invalid initial obligation state' USING ERRCODE='23514'; END IF;
    NEW.source_sha256:=encode(sha256(convert_to(jsonb_build_object('jurisdiction',NEW.jurisdiction,'title',NEW.source_title,'version',NEW.source_version,
      'article',NEW.article,'url',NEW.source_url,'excerpt',NEW.excerpt)::text,'UTF8')),'hex');
    RETURN NEW;
  END IF;
  IF NEW.lifecycle<>OLD.lifecycle THEN
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
-- UPDATE OF fires even when the human re-evaluates with identical values.
CREATE FUNCTION app.assess_obligation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.lifecycle<>'active' OR NEW.lifecycle<>'active' OR OLD.source_status<>'verified' OR NEW.source_status<>'verified'
    OR NEW.verification_note IS DISTINCT FROM OLD.verification_note OR NEW.assessment_status='not_assessed'
    OR length(btrim(coalesce(NEW.assessment_note,'')))=0 OR length(btrim(coalesce(NEW.evidence_reference,'')))=0
    OR NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.owner_id) THEN
    RAISE EXCEPTION 'Assessment requires a verified active obligation, eligible owner and evidence' USING ERRCODE='23514'; END IF;
  IF NEW.next_review_on<(statement_timestamp() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'Next review must not be overdue' USING ERRCODE='23514'; END IF;
  NEW.assessed_by:=identity.actor_id();NEW.assessed_at:=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER obligation_assessment_guard BEFORE UPDATE OF owner_id,next_review_on,assessment_status,assessment_note,evidence_reference ON app.obligations
  FOR EACH ROW EXECUTE FUNCTION app.assess_obligation();
CREATE TRIGGER obligation_change_guard BEFORE INSERT OR UPDATE ON app.obligations FOR EACH ROW EXECUTE FUNCTION app.guard_obligation_change();
CREATE FUNCTION app.record_obligation_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_name text:=TG_OP;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.lifecycle<>OLD.lifecycle THEN operation_name:=CASE WHEN NEW.lifecycle='archived' THEN 'ARCHIVE' ELSE 'REOPEN' END;
    ELSIF NEW.source_status<>OLD.source_status THEN operation_name:='VERIFY_SOURCE';
    ELSIF NEW.assessed_at IS DISTINCT FROM OLD.assessed_at THEN operation_name:='ASSESS';END IF;
  END IF;
  INSERT INTO app.obligation_events(tenant_id,site_id,obligation_id,actor_id,operation,before_data,after_data)
    VALUES(NEW.tenant_id,NEW.site_id,NEW.id,identity.actor_id(),operation_name,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
  RETURN NEW;
END $$;
CREATE TRIGGER obligation_history AFTER INSERT OR UPDATE ON app.obligations FOR EACH ROW EXECUTE FUNCTION app.record_obligation_change();
CREATE TRIGGER immutable_obligation_history BEFORE UPDATE OR DELETE ON app.obligation_events FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
REVOKE ALL ON app.obligations,app.obligation_events FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION app.guard_obligation_change(),app.assess_obligation(),app.record_obligation_change() FROM PUBLIC;
GRANT SELECT ON app.obligations,app.obligation_events TO sentinelle_app;
GRANT INSERT(id,tenant_id,site_id,title,jurisdiction,source_title,source_version,article,source_url,excerpt,owner_id,created_by,next_review_on,last_change_note) ON app.obligations TO sentinelle_app;
GRANT UPDATE(source_status,verification_note,assessment_status,assessment_note,evidence_reference,owner_id,next_review_on,lifecycle,last_change_note) ON app.obligations TO sentinelle_app;
