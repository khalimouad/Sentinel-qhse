ALTER TABLE app.document_versions ADD COLUMN attachments_sha256 text NOT NULL DEFAULT encode(sha256('[]'::bytea),'hex');
ALTER TABLE app.reports ADD COLUMN attachments_sha256 text NOT NULL DEFAULT encode(sha256('[]'::bytea),'hex');
CREATE TABLE app.attachments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,site_id uuid NOT NULL,
  document_version_id uuid,report_id uuid,
  filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 180 AND filename !~ '[[:cntrl:]/\\]'),
  mime_type text NOT NULL,size integer NOT NULL CHECK(size BETWEEN 1 AND 10485760),sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),
  staging_key text NOT NULL,object_key text,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','rejected','deleted')),
  revision integer NOT NULL DEFAULT 1,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',ready_at timestamptz,rejection_reason text,
  CHECK(num_nonnulls(document_version_id,report_id)=1),
  CHECK(staging_key='staging/'||tenant_id::text||'/'||id::text),
  CHECK(object_key IS NULL OR (object_key LIKE 'tenants/'||tenant_id::text||'/objects/'||id::text||'/%' AND right(object_key,36)~'^[a-f0-9-]{36}$')),
  CHECK(status<>'ready' OR (object_key IS NOT NULL AND ready_at IS NOT NULL)),
  UNIQUE(tenant_id,id,site_id),
  FOREIGN KEY(tenant_id,document_version_id,site_id) REFERENCES app.document_versions(tenant_id,id,site_id),
  FOREIGN KEY(tenant_id,report_id,site_id) REFERENCES app.reports(tenant_id,id,site_id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE INDEX attachments_version_idx ON app.attachments(tenant_id,document_version_id,status);
CREATE INDEX attachments_report_idx ON app.attachments(tenant_id,report_id,status);
CREATE INDEX attachments_creator_idx ON app.attachments(tenant_id,created_by);
CREATE INDEX attachments_expiry_idx ON app.attachments(expires_at) WHERE status='pending';
CREATE FUNCTION app.can_read_file_parent(target_tenant uuid,target_site uuid,target_version uuid,target_report uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT identity.has_site_access($1,$2) AND (
    ($3 IS NOT NULL AND EXISTS(SELECT 1 FROM app.document_versions v WHERE v.tenant_id=$1 AND v.site_id=$2 AND v.id=$3 AND
      (v.status IN ('published','archived') OR identity.actor_id() IN (v.author_id,v.reviewer_id,v.approver_id)))) OR
    ($4 IS NOT NULL AND EXISTS(SELECT 1 FROM app.reports r WHERE r.tenant_id=$1 AND r.site_id=$2 AND r.id=$4 AND
      (r.reported_by=identity.actor_id() OR identity.can_write_site($1,$2)))))
$$;
CREATE FUNCTION app.can_manage_file_parent(target_tenant uuid,target_site uuid,target_version uuid,target_report uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT identity.has_site_access($1,$2) AND (
    ($3 IS NOT NULL AND EXISTS(SELECT 1 FROM app.document_versions v WHERE v.tenant_id=$1 AND v.site_id=$2 AND v.id=$3
      AND v.status='draft' AND v.author_id=identity.actor_id() AND identity.can_write_site($1,$2))) OR
    ($4 IS NOT NULL AND EXISTS(SELECT 1 FROM app.reports r WHERE r.tenant_id=$1 AND r.site_id=$2 AND r.id=$4
      AND ((r.status IN ('reported','in_analysis','action_plan') AND identity.can_write_site($1,$2)) OR (r.status='reported' AND r.reported_by=identity.actor_id())))))
$$;
-- The trigger owner may refresh only eligible report rows under the caller's
-- verified identity. This policy does not grant the runtime role UPDATE access.
DO $$ BEGIN
  EXECUTE format('CREATE POLICY report_file_metadata ON app.reports FOR UPDATE TO %I USING (identity.has_site_access(tenant_id,site_id) AND (identity.can_write_site(tenant_id,site_id) OR (reported_by=identity.actor_id() AND status=''reported''))) WITH CHECK (identity.has_site_access(tenant_id,site_id))',current_user);
END $$;
CREATE FUNCTION app.lock_file_parent(target_tenant uuid,target_version uuid,target_report uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE document uuid;
BEGIN
  IF num_nonnulls(target_version,target_report)<>1 THEN RAISE EXCEPTION 'Invalid file parent' USING ERRCODE='23514'; END IF;
  IF target_version IS NOT NULL THEN
    SELECT document_id INTO document FROM app.document_versions WHERE tenant_id=target_tenant AND id=target_version AND identity.has_site_access(tenant_id,site_id)
      AND (status IN ('published','archived') OR identity.actor_id() IN (author_id,reviewer_id,approver_id));
    IF document IS NULL THEN RAISE EXCEPTION 'File parent unavailable' USING ERRCODE='42501'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(document::text,0));
  ELSE
    PERFORM 1 FROM app.reports WHERE tenant_id=target_tenant AND id=target_report AND identity.has_site_access(tenant_id,site_id)
      AND (reported_by=identity.actor_id() OR identity.can_write_site(tenant_id,site_id)) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'File parent unavailable' USING ERRCODE='42501'; END IF;
  END IF;
END $$;
ALTER TABLE app.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.attachments FORCE ROW LEVEL SECURITY;
CREATE POLICY attachments_read ON app.attachments FOR SELECT USING(app.can_read_file_parent(tenant_id,site_id,document_version_id,report_id)
  AND (status='ready' OR created_by=identity.actor_id() OR app.can_manage_file_parent(tenant_id,site_id,document_version_id,report_id)));
CREATE POLICY attachments_create ON app.attachments FOR INSERT WITH CHECK(created_by=identity.actor_id() AND app.can_manage_file_parent(tenant_id,site_id,document_version_id,report_id));
CREATE POLICY attachments_update ON app.attachments FOR UPDATE USING(app.can_manage_file_parent(tenant_id,site_id,document_version_id,report_id)
  AND (created_by=identity.actor_id() OR identity.can_write_site(tenant_id,site_id)))
  WITH CHECK(app.can_manage_file_parent(tenant_id,site_id,document_version_id,report_id));
CREATE TABLE app.attachment_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,site_id uuid NOT NULL,attachment_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES identity.users(id),operation text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),before_data jsonb,after_data jsonb NOT NULL,
  FOREIGN KEY(tenant_id,attachment_id,site_id) REFERENCES app.attachments(tenant_id,id,site_id)
);
CREATE INDEX attachment_events_parent_idx ON app.attachment_events(tenant_id,attachment_id,occurred_at DESC);
CREATE INDEX attachment_events_site_idx ON app.attachment_events(tenant_id,site_id);
CREATE INDEX attachment_events_actor_idx ON app.attachment_events(actor_id);
ALTER TABLE app.attachment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.attachment_events FORCE ROW LEVEL SECURITY;
CREATE POLICY attachment_events_read ON app.attachment_events FOR SELECT USING(identity.has_site_access(tenant_id,site_id) AND EXISTS(SELECT 1 FROM app.attachments a WHERE a.id=attachment_id));
CREATE POLICY attachment_events_append ON app.attachment_events FOR INSERT WITH CHECK(identity.has_site_access(tenant_id,site_id));
CREATE FUNCTION app.guard_attachment() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE active_files integer;
BEGIN
  PERFORM app.lock_file_parent(NEW.tenant_id,NEW.document_version_id,NEW.report_id);
  IF NOT app.can_manage_file_parent(NEW.tenant_id,NEW.site_id,NEW.document_version_id,NEW.report_id) THEN RAISE EXCEPTION 'File parent is immutable or unavailable' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT count(*) INTO active_files FROM app.attachments WHERE tenant_id=NEW.tenant_id AND
      (document_version_id=NEW.document_version_id OR report_id=NEW.report_id) AND status IN ('pending','ready');
    IF active_files>=20 THEN RAISE EXCEPTION 'Maximum number of attachments reached' USING ERRCODE='23514'; END IF;
  ELSE
    IF OLD.status IN ('deleted') OR (OLD.status='ready' AND NEW.status<>'deleted') OR (OLD.status='rejected' AND NEW.status<>'deleted') OR
      (OLD.status='pending' AND NEW.status NOT IN ('ready','rejected','deleted')) THEN RAISE EXCEPTION 'Invalid attachment transition' USING ERRCODE='23514'; END IF;
    IF OLD.object_key IS NOT NULL AND NEW.object_key IS DISTINCT FROM OLD.object_key THEN RAISE EXCEPTION 'Verified file identity is immutable' USING ERRCODE='23514'; END IF;
    NEW.revision:=OLD.revision+1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER attachment_guard BEFORE INSERT OR UPDATE ON app.attachments FOR EACH ROW EXECUTE FUNCTION app.guard_attachment();
CREATE FUNCTION app.file_manifest(target_tenant uuid,target_version uuid,target_report uuid) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('id',id,'filename',filename,'size',size,'mimeType',mime_type,'sha256',sha256) ORDER BY id)::text,'[]'),'UTF8')),'hex')
  FROM app.attachments WHERE tenant_id=$1 AND (document_version_id=$2 OR report_id=$3) AND status='ready'
$$;
CREATE FUNCTION app.refresh_file_parent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.document_version_id IS NOT NULL THEN
    UPDATE app.document_versions SET attachments_sha256=app.file_manifest(NEW.tenant_id,NEW.document_version_id,NULL),revision=revision+1 WHERE tenant_id=NEW.tenant_id AND id=NEW.document_version_id;
    UPDATE app.documents SET updated_at=clock_timestamp() WHERE tenant_id=NEW.tenant_id AND id=(SELECT document_id FROM app.document_versions WHERE tenant_id=NEW.tenant_id AND id=NEW.document_version_id);
  ELSE
    UPDATE app.reports SET attachments_sha256=app.file_manifest(NEW.tenant_id,NULL,NEW.report_id),last_change_note='Pièce jointe : '||NEW.status WHERE tenant_id=NEW.tenant_id AND id=NEW.report_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER attachment_parent_refresh AFTER INSERT OR UPDATE ON app.attachments FOR EACH ROW EXECUTE FUNCTION app.refresh_file_parent();
CREATE FUNCTION app.record_attachment_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO app.attachment_events(tenant_id,site_id,attachment_id,actor_id,operation,before_data,after_data)
  VALUES(NEW.tenant_id,NEW.site_id,NEW.id,identity.actor_id(),TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)-'staging_key'-'object_key' ELSE NULL END,to_jsonb(NEW)-'staging_key'-'object_key');
  RETURN NEW;
END $$;
CREATE TRIGGER attachment_audit AFTER INSERT OR UPDATE ON app.attachments FOR EACH ROW EXECUTE FUNCTION app.record_attachment_change();
CREATE TRIGGER immutable_attachment_history BEFORE UPDATE OR DELETE ON app.attachment_events FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
CREATE FUNCTION app.freeze_version_files() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.status<>'draft' AND NEW.attachments_sha256 IS DISTINCT FROM OLD.attachments_sha256 THEN RAISE EXCEPTION 'Submitted file manifest is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.status='draft' AND NEW.status='in_review' AND EXISTS(SELECT 1 FROM app.attachments WHERE tenant_id=NEW.tenant_id AND document_version_id=NEW.id AND status='pending') THEN RAISE EXCEPTION 'Finish or cancel pending uploads before submission' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_files_freeze BEFORE UPDATE ON app.document_versions FOR EACH ROW EXECUTE FUNCTION app.freeze_version_files();
CREATE FUNCTION app.freeze_report_files() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('in_analysis','effectiveness_review','closed') AND EXISTS(SELECT 1 FROM app.attachments WHERE tenant_id=NEW.tenant_id AND report_id=NEW.id AND status='pending') THEN RAISE EXCEPTION 'Finish or cancel pending uploads before proceeding' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER report_files_freeze BEFORE UPDATE ON app.reports FOR EACH ROW EXECUTE FUNCTION app.freeze_report_files();
REVOKE ALL ON app.attachments,app.attachment_events FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION app.can_read_file_parent(uuid,uuid,uuid,uuid),app.can_manage_file_parent(uuid,uuid,uuid,uuid),app.lock_file_parent(uuid,uuid,uuid),app.guard_attachment(),app.file_manifest(uuid,uuid,uuid),app.refresh_file_parent(),app.record_attachment_change(),app.freeze_version_files(),app.freeze_report_files() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_read_file_parent(uuid,uuid,uuid,uuid),app.can_manage_file_parent(uuid,uuid,uuid,uuid),app.lock_file_parent(uuid,uuid,uuid) TO sentinelle_app;
GRANT SELECT ON app.attachments,app.attachment_events TO sentinelle_app;
GRANT INSERT(id,tenant_id,site_id,document_version_id,report_id,filename,mime_type,size,sha256,staging_key,created_by) ON app.attachments TO sentinelle_app;
GRANT UPDATE(status,object_key,ready_at,rejection_reason) ON app.attachments TO sentinelle_app;
