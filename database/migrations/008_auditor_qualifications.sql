CREATE TABLE app.auditor_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, site_id uuid NOT NULL, user_id uuid NOT NULL,
  standard text NOT NULL CHECK(length(btrim(standard)) BETWEEN 1 AND 200),
  valid_from date NOT NULL, valid_until date NOT NULL CHECK(valid_until>=valid_from),
  evidence_reference text NOT NULL CHECK(length(btrim(evidence_reference)) BETWEEN 1 AND 500),
  assessment text NOT NULL CHECK(length(btrim(assessment)) BETWEEN 1 AND 4000),
  assessed_by uuid NOT NULL CHECK(assessed_by<>user_id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id,site_id),
  FOREIGN KEY(tenant_id,site_id) REFERENCES app.sites(tenant_id,id),
  FOREIGN KEY(tenant_id,user_id) REFERENCES identity.memberships(tenant_id,user_id),
  FOREIGN KEY(tenant_id,assessed_by) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE INDEX auditor_qualifications_match_idx ON app.auditor_qualifications(tenant_id,site_id,user_id,standard,valid_until DESC);
CREATE INDEX auditor_qualifications_list_idx ON app.auditor_qualifications(tenant_id,site_id,created_at DESC,id);
CREATE INDEX auditor_qualifications_user_idx ON app.auditor_qualifications(tenant_id,user_id);
CREATE INDEX auditor_qualifications_assessor_idx ON app.auditor_qualifications(tenant_id,assessed_by);
CREATE TABLE app.auditor_qualification_revocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, site_id uuid NOT NULL,
  qualification_id uuid NOT NULL, reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
  revoked_by uuid NOT NULL REFERENCES identity.users(id), revoked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,qualification_id),
  FOREIGN KEY(tenant_id,qualification_id,site_id) REFERENCES app.auditor_qualifications(tenant_id,id,site_id)
);
CREATE INDEX auditor_revocations_site_idx ON app.auditor_qualification_revocations(tenant_id,site_id);
CREATE INDEX auditor_revocations_actor_idx ON app.auditor_qualification_revocations(revoked_by);
ALTER TABLE app.auditor_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.auditor_qualifications FORCE ROW LEVEL SECURITY;
ALTER TABLE app.auditor_qualification_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.auditor_qualification_revocations FORCE ROW LEVEL SECURITY;
CREATE POLICY auditor_qualifications_read ON app.auditor_qualifications FOR SELECT USING(identity.can_write_site(tenant_id,site_id));
CREATE POLICY auditor_qualifications_create ON app.auditor_qualifications FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id) AND assessed_by=identity.actor_id());
CREATE POLICY auditor_revocations_read ON app.auditor_qualification_revocations FOR SELECT USING(identity.can_write_site(tenant_id,site_id));
CREATE POLICY auditor_revocations_create ON app.auditor_qualification_revocations FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id) AND revoked_by=identity.actor_id());
CREATE FUNCTION app.lock_auditor_qualification(target_tenant uuid,target_site uuid,target_user uuid,target_standard text)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NOT identity.can_write_site(target_tenant,target_site) THEN RAISE EXCEPTION 'Qualification scope is not accessible' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('audit-qualification:'||target_tenant::text||':'||target_site::text||':'||target_user::text||':'||target_standard,0));
END $$;
CREATE FUNCTION app.guard_auditor_qualification() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  PERFORM app.lock_auditor_qualification(NEW.tenant_id,NEW.site_id,NEW.user_id,NEW.standard);
  IF NEW.assessed_by<>identity.actor_id() OR NEW.assessed_by=NEW.user_id OR NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.user_id) THEN
    RAISE EXCEPTION 'Qualification requires a distinct site assessor and eligible auditor' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER auditor_qualification_guard BEFORE INSERT ON app.auditor_qualifications FOR EACH ROW EXECUTE FUNCTION app.guard_auditor_qualification();
CREATE FUNCTION app.guard_auditor_revocation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE qualification app.auditor_qualifications;
BEGIN
  SELECT * INTO qualification FROM app.auditor_qualifications WHERE tenant_id=NEW.tenant_id AND id=NEW.qualification_id AND site_id=NEW.site_id;
  IF qualification.id IS NULL THEN RAISE EXCEPTION 'Qualification is not accessible' USING ERRCODE='42501'; END IF;
  PERFORM app.lock_auditor_qualification(qualification.tenant_id,qualification.site_id,qualification.user_id,qualification.standard);
  RETURN NEW;
END $$;
CREATE TRIGGER auditor_revocation_guard BEFORE INSERT ON app.auditor_qualification_revocations FOR EACH ROW EXECUTE FUNCTION app.guard_auditor_revocation();
CREATE TRIGGER immutable_auditor_qualification BEFORE UPDATE OR DELETE ON app.auditor_qualifications FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
CREATE TRIGGER immutable_auditor_revocation BEFORE UPDATE OR DELETE ON app.auditor_qualification_revocations FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
ALTER TABLE app.audits ADD COLUMN lead_qualification_id uuid;
ALTER TABLE app.audits ADD COLUMN lead_qualification_snapshot jsonb;
ALTER TABLE app.audits ADD CONSTRAINT audit_lead_qualification_scope FOREIGN KEY(tenant_id,lead_qualification_id,site_id) REFERENCES app.auditor_qualifications(tenant_id,id,site_id);
CREATE INDEX audits_lead_qualification_idx ON app.audits(tenant_id,lead_qualification_id,site_id);
CREATE FUNCTION app.require_auditor_qualification() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE qualification app.auditor_qualifications; today date := (statement_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
  IF OLD.status='planned' AND NEW.status='in_progress' THEN
    PERFORM app.lock_auditor_qualification(NEW.tenant_id,NEW.site_id,NEW.lead_id,NEW.standard);
    SELECT q.* INTO qualification FROM app.auditor_qualifications q
      WHERE q.tenant_id=NEW.tenant_id AND q.site_id=NEW.site_id AND q.user_id=NEW.lead_id AND q.standard=NEW.standard
      AND q.valid_from<=least(NEW.starts_on,today) AND q.valid_until>=greatest(NEW.ends_on,today)
      AND NOT EXISTS(SELECT 1 FROM app.auditor_qualification_revocations r WHERE r.tenant_id=q.tenant_id AND r.qualification_id=q.id)
      ORDER BY q.valid_until DESC,q.created_at DESC,q.id LIMIT 1;
    IF qualification.id IS NULL THEN RAISE EXCEPTION 'A valid lead qualification covering the audit is required' USING ERRCODE='23514'; END IF;
    NEW.lead_qualification_id:=qualification.id;
    NEW.lead_qualification_snapshot:=jsonb_build_object('id',qualification.id,'userId',qualification.user_id,'siteId',qualification.site_id,
      'standard',qualification.standard,'validFrom',qualification.valid_from,'validUntil',qualification.valid_until,
      'evidenceReference',qualification.evidence_reference,'assessment',qualification.assessment,'assessedBy',qualification.assessed_by,
      'assessorName',(SELECT name FROM identity.list_members(NEW.tenant_id) WHERE id=qualification.assessed_by),
      'auditorName',(SELECT name FROM identity.list_members(NEW.tenant_id) WHERE id=qualification.user_id),
      'issuedAt',qualification.created_at,'checkedAt',clock_timestamp());
  END IF;
  RETURN NEW;
END $$;
-- Gate before the session guard; the existing guard still checks lead identity,
-- participants, checklist and valid state transitions in the same transaction.
CREATE TRIGGER audit_qualification_gate BEFORE UPDATE ON app.audits FOR EACH ROW EXECUTE FUNCTION app.require_auditor_qualification();
CREATE FUNCTION app.freeze_auditor_qualification() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.status='in_progress' AND NEW.status='completed' THEN
    NEW.report_snapshot:=NEW.report_snapshot||jsonb_build_object('leadQualification',NEW.lead_qualification_snapshot);
  END IF;
  RETURN NEW;
END $$;
-- Runs after audit_session_guard and audit_template_sources.
CREATE TRIGGER audit_zqualification_report BEFORE UPDATE ON app.audits FOR EACH ROW EXECUTE FUNCTION app.freeze_auditor_qualification();
REVOKE ALL ON app.auditor_qualifications,app.auditor_qualification_revocations FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION app.lock_auditor_qualification(uuid,uuid,uuid,text),app.guard_auditor_qualification(),app.guard_auditor_revocation(),app.require_auditor_qualification(),app.freeze_auditor_qualification() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_auditor_qualification(uuid,uuid,uuid,text) TO sentinelle_app;
GRANT SELECT ON app.auditor_qualifications,app.auditor_qualification_revocations TO sentinelle_app;
GRANT INSERT(id,tenant_id,site_id,user_id,standard,valid_from,valid_until,evidence_reference,assessment,assessed_by) ON app.auditor_qualifications TO sentinelle_app;
GRANT INSERT(id,tenant_id,site_id,qualification_id,reason,revoked_by) ON app.auditor_qualification_revocations TO sentinelle_app;
