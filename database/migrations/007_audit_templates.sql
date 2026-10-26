-- Each row is a published, immutable version of a site-scoped checklist template.
CREATE FUNCTION app.valid_audit_template(items jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
  IF NOT app.valid_audit_checklist(items) THEN RETURN false; END IF;
  RETURN jsonb_array_length(items)>0 AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(items) x WHERE x->>'result'<>'pending' OR x->>'evidence'<>'');
END $$;
CREATE TABLE app.audit_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, site_id uuid NOT NULL,
  code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{1,39}$'),
  number integer NOT NULL CHECK(number>0), title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 300),
  standard text NOT NULL CHECK(length(btrim(standard)) BETWEEN 1 AND 200),
  change_note text NOT NULL CHECK(length(btrim(change_note)) BETWEEN 1 AND 2000),
  checklist jsonb NOT NULL CHECK(app.valid_audit_template(checklist)),
  content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id,site_id), UNIQUE(tenant_id,site_id,code,number),
  FOREIGN KEY(tenant_id,site_id) REFERENCES app.sites(tenant_id,id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE INDEX audit_templates_list_idx ON app.audit_templates(tenant_id,site_id,code,number DESC);
CREATE INDEX audit_templates_creator_idx ON app.audit_templates(tenant_id,created_by);
CREATE TABLE app.audit_template_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, site_id uuid NOT NULL,
  audit_id uuid NOT NULL, template_id uuid NOT NULL, applied_revision integer NOT NULL CHECK(applied_revision>0),
  applied_by uuid NOT NULL REFERENCES identity.users(id), applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,audit_id,applied_revision),
  FOREIGN KEY(tenant_id,audit_id,site_id) REFERENCES app.audits(tenant_id,id,site_id),
  FOREIGN KEY(tenant_id,template_id,site_id) REFERENCES app.audit_templates(tenant_id,id,site_id)
);
CREATE INDEX audit_template_uses_template_idx ON app.audit_template_uses(tenant_id,template_id,site_id);
CREATE INDEX audit_template_uses_site_idx ON app.audit_template_uses(tenant_id,site_id);
CREATE INDEX audit_template_uses_actor_idx ON app.audit_template_uses(applied_by);
ALTER TABLE app.audit_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE app.audit_template_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_template_uses FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_templates_read ON app.audit_templates FOR SELECT USING(identity.can_write_site(tenant_id,site_id));
CREATE POLICY audit_templates_create ON app.audit_templates FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id) AND created_by=identity.actor_id());
CREATE POLICY audit_template_uses_read ON app.audit_template_uses FOR SELECT USING(identity.can_write_site(tenant_id,site_id));
CREATE POLICY audit_template_uses_create ON app.audit_template_uses FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id) AND applied_by=identity.actor_id());
CREATE FUNCTION app.guard_audit_template() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE latest integer;
BEGIN
  -- The same canonical namespace is used by the API before checking expectedVersion.
  PERFORM pg_advisory_xact_lock(hashtextextended('audit-template:'||NEW.tenant_id::text||':'||NEW.site_id::text||':'||NEW.code,0));
  SELECT coalesce(max(number),0) INTO latest FROM app.audit_templates WHERE tenant_id=NEW.tenant_id AND site_id=NEW.site_id AND code=NEW.code;
  IF NEW.number<>latest+1 THEN RAISE EXCEPTION 'Template version must follow the latest version' USING ERRCODE='23514'; END IF;
  NEW.content_sha256 := encode(sha256(convert_to(NEW.checklist::text,'UTF8')),'hex');
  RETURN NEW;
END $$;
CREATE TRIGGER audit_template_guard BEFORE INSERT ON app.audit_templates FOR EACH ROW EXECUTE FUNCTION app.guard_audit_template();
CREATE TRIGGER immutable_audit_template BEFORE UPDATE OR DELETE ON app.audit_templates FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
CREATE TRIGGER immutable_audit_template_use BEFORE UPDATE OR DELETE ON app.audit_template_uses FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
CREATE FUNCTION app.guard_audit_template_use() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE parent app.audits; source app.audit_templates; copied jsonb; original jsonb;
BEGIN
  SELECT * INTO parent FROM app.audits WHERE tenant_id=NEW.tenant_id AND id=NEW.audit_id FOR UPDATE;
  SELECT * INTO source FROM app.audit_templates WHERE tenant_id=NEW.tenant_id AND id=NEW.template_id;
  IF parent.id IS NULL OR source.id IS NULL OR parent.site_id<>source.site_id OR NEW.site_id<>parent.site_id
    OR parent.status<>'planned' OR parent.lead_id<>identity.actor_id() OR NEW.applied_revision<>parent.revision OR parent.standard<>source.standard THEN
    RAISE EXCEPTION 'Template must match a planned audit in the lead auditor scope' USING ERRCODE='42501'; END IF;
  SELECT jsonb_agg(value-'id' ORDER BY ord) INTO copied FROM jsonb_array_elements(parent.checklist) WITH ORDINALITY x(value,ord);
  SELECT jsonb_agg(value-'id' ORDER BY ord) INTO original FROM jsonb_array_elements(source.checklist) WITH ORDINALITY x(value,ord);
  IF copied IS DISTINCT FROM original THEN RAISE EXCEPTION 'Applied checklist must match the immutable template' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_template_use_guard BEFORE INSERT ON app.audit_template_uses FOR EACH ROW EXECUTE FUNCTION app.guard_audit_template_use();
-- Runs after audit_session_guard (alphabetic trigger order), which creates the report.
CREATE FUNCTION app.freeze_audit_template_sources() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.status='completed' AND OLD.status='in_progress' THEN
    NEW.report_snapshot := NEW.report_snapshot || jsonb_build_object('templateSources',coalesce((
      SELECT jsonb_agg(jsonb_build_object('templateId',t.id,'code',t.code,'number',t.number,'title',t.title,
        'contentSha256',t.content_sha256,'appliedRevision',u.applied_revision,'appliedBy',u.applied_by,'appliedAt',u.applied_at) ORDER BY u.applied_revision)
      FROM app.audit_template_uses u JOIN app.audit_templates t ON t.tenant_id=u.tenant_id AND t.id=u.template_id
      WHERE u.tenant_id=NEW.tenant_id AND u.audit_id=NEW.id),'[]'::jsonb));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_template_sources BEFORE UPDATE ON app.audits FOR EACH ROW EXECUTE FUNCTION app.freeze_audit_template_sources();
REVOKE ALL ON app.audit_templates,app.audit_template_uses FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION app.valid_audit_template(jsonb),app.guard_audit_template(),app.guard_audit_template_use(),app.freeze_audit_template_sources() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.valid_audit_template(jsonb) TO sentinelle_app;
GRANT SELECT ON app.audit_templates,app.audit_template_uses TO sentinelle_app;
GRANT INSERT(id,tenant_id,site_id,code,number,title,standard,change_note,checklist,created_by) ON app.audit_templates TO sentinelle_app;
GRANT INSERT(id,tenant_id,site_id,audit_id,template_id,applied_revision,applied_by) ON app.audit_template_uses TO sentinelle_app;
