CREATE FUNCTION identity.can_review_site(target_tenant uuid, target_site uuid, target_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT identity.can_assign_site($1,$2,$3) AND EXISTS (
    SELECT 1 FROM identity.memberships m WHERE m.tenant_id=$1 AND m.user_id=$3 AND m.role IN ('admin','manager'))
$$;
REVOKE ALL ON FUNCTION identity.can_review_site(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.can_review_site(uuid,uuid,uuid) TO sentinelle_app;

CREATE TABLE app.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  site_id uuid NOT NULL, code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._-]{0,49}$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200), last_version integer NOT NULL DEFAULT 1 CHECK (last_version>0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id,site_id), UNIQUE (tenant_id,code),
  FOREIGN KEY (tenant_id,site_id) REFERENCES app.sites(tenant_id,id)
);
CREATE INDEX documents_site_idx ON app.documents(tenant_id,site_id);
CREATE TABLE app.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, site_id uuid NOT NULL, document_id uuid NOT NULL,
  number integer NOT NULL CHECK (number>0), content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 15000),
  content_sha256 text NOT NULL, status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_review','pending_approval','published','rejected','archived')),
  author_id uuid NOT NULL, reviewer_id uuid NOT NULL, approver_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0), reviewed_at timestamptz, approved_at timestamptz,
  decision_note text CHECK (length(decision_note)<=2000), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (author_id<>reviewer_id AND author_id<>approver_id AND reviewer_id<>approver_id),
  UNIQUE(document_id,number), UNIQUE(tenant_id,id,site_id),
  FOREIGN KEY (tenant_id,document_id,site_id) REFERENCES app.documents(tenant_id,id,site_id),
  FOREIGN KEY (tenant_id,author_id) REFERENCES identity.memberships(tenant_id,user_id),
  FOREIGN KEY (tenant_id,reviewer_id) REFERENCES identity.memberships(tenant_id,user_id),
  FOREIGN KEY (tenant_id,approver_id) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE UNIQUE INDEX documents_single_publication ON app.document_versions(document_id) WHERE status='published';
CREATE UNIQUE INDEX documents_single_workflow ON app.document_versions(document_id) WHERE status IN ('draft','in_review','pending_approval');
CREATE INDEX document_versions_site_idx ON app.document_versions(tenant_id,site_id);
CREATE INDEX document_versions_author_idx ON app.document_versions(tenant_id,author_id);
CREATE INDEX document_versions_reviewer_idx ON app.document_versions(tenant_id,reviewer_id);
CREATE INDEX document_versions_approver_idx ON app.document_versions(tenant_id,approver_id);
CREATE TABLE app.document_receipts (
  tenant_id uuid NOT NULL, site_id uuid NOT NULL, version_id uuid NOT NULL, user_id uuid NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(version_id,user_id),
  FOREIGN KEY (tenant_id,version_id,site_id) REFERENCES app.document_versions(tenant_id,id,site_id),
  FOREIGN KEY (tenant_id,user_id) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE INDEX document_receipts_site_idx ON app.document_receipts(tenant_id,site_id);
CREATE INDEX document_receipts_user_idx ON app.document_receipts(tenant_id,user_id);
CREATE TABLE app.document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, site_id uuid NOT NULL,
  version_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES identity.users(id), operation text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), before_data jsonb, after_data jsonb NOT NULL,
  FOREIGN KEY (tenant_id,version_id,site_id) REFERENCES app.document_versions(tenant_id,id,site_id)
);
CREATE INDEX document_events_version_idx ON app.document_events(tenant_id,version_id,occurred_at DESC);
CREATE INDEX document_events_site_idx ON app.document_events(tenant_id,site_id);
CREATE INDEX document_events_actor_idx ON app.document_events(actor_id);

ALTER TABLE app.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.documents FORCE ROW LEVEL SECURITY;
ALTER TABLE app.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE app.document_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE app.document_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_events FORCE ROW LEVEL SECURITY;
CREATE POLICY versions_read ON app.document_versions FOR SELECT USING (
  identity.has_site_access(tenant_id,site_id) AND
  (status IN ('published','archived') OR identity.actor_id() IN (author_id,reviewer_id,approver_id)));
CREATE POLICY documents_read ON app.documents FOR SELECT USING (
  identity.has_site_access(tenant_id,site_id) AND EXISTS (SELECT 1 FROM app.document_versions v WHERE v.document_id=documents.id));
CREATE POLICY documents_create ON app.documents FOR INSERT WITH CHECK (identity.can_write_site(tenant_id,site_id));
CREATE POLICY documents_update ON app.documents FOR UPDATE USING (identity.can_write_site(tenant_id,site_id)) WITH CHECK (identity.can_write_site(tenant_id,site_id));
CREATE POLICY versions_create ON app.document_versions FOR INSERT WITH CHECK (
  author_id=identity.actor_id() AND identity.can_write_site(tenant_id,site_id)
  AND identity.can_review_site(tenant_id,site_id,reviewer_id) AND identity.can_review_site(tenant_id,site_id,approver_id));
CREATE POLICY versions_update ON app.document_versions FOR UPDATE USING (identity.can_write_site(tenant_id,site_id)) WITH CHECK (identity.can_write_site(tenant_id,site_id));
CREATE POLICY receipts_read ON app.document_receipts FOR SELECT USING (
  identity.has_site_access(tenant_id,site_id) AND (user_id=identity.actor_id() OR identity.can_write_site(tenant_id,site_id)));
CREATE POLICY receipts_create ON app.document_receipts FOR INSERT WITH CHECK (
  user_id=identity.actor_id() AND identity.has_site_access(tenant_id,site_id) AND EXISTS (
    SELECT 1 FROM app.document_versions v WHERE v.id=version_id AND v.status='published'));
CREATE POLICY document_events_read ON app.document_events FOR SELECT USING (
  identity.has_site_access(tenant_id,site_id) AND EXISTS (SELECT 1 FROM app.document_versions v WHERE v.id=version_id));
CREATE POLICY document_events_append ON app.document_events FOR INSERT WITH CHECK (identity.can_write_site(tenant_id,site_id));

CREATE FUNCTION app.freeze_document_content() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.status<>'draft' AND NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'Submitted document content is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.status='draft' THEN
      IF identity.actor_id()<>OLD.author_id OR NEW.status NOT IN ('draft','in_review') THEN
        RAISE EXCEPTION 'Only the author may edit or submit a draft' USING ERRCODE='42501';
      END IF;
    ELSIF OLD.status='in_review' THEN
      IF identity.actor_id()<>OLD.reviewer_id OR NEW.status NOT IN ('pending_approval','rejected') THEN
        RAISE EXCEPTION 'Verification is reserved to the designated reviewer' USING ERRCODE='42501';
      END IF;
    ELSIF OLD.status='pending_approval' THEN
      IF identity.actor_id()<>OLD.approver_id OR NEW.status NOT IN ('published','rejected') THEN
        RAISE EXCEPTION 'Approval is reserved to the designated approver' USING ERRCODE='42501';
      END IF;
    ELSIF OLD.status='published' THEN
      IF NEW.status<>'archived' OR NOT EXISTS (SELECT 1 FROM app.document_versions other
        WHERE other.document_id=OLD.document_id AND other.number>OLD.number AND other.status='pending_approval' AND other.approver_id=identity.actor_id()) THEN
        RAISE EXCEPTION 'A publication can only be archived when its replacement is approved' USING ERRCODE='23514';
      END IF;
    ELSE
      RAISE EXCEPTION 'Archived and rejected versions are immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  NEW.content_sha256 := encode(sha256(convert_to(NEW.content,'UTF8')),'hex');
  RETURN NEW;
END $$;
CREATE TRIGGER document_content_hash BEFORE INSERT OR UPDATE ON app.document_versions FOR EACH ROW EXECUTE FUNCTION app.freeze_document_content();
CREATE FUNCTION app.record_document_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO app.document_events(tenant_id,site_id,version_id,actor_id,operation,before_data,after_data)
  VALUES(NEW.tenant_id,NEW.site_id,NEW.id,identity.actor_id(),TG_OP,
    CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)-'content' ELSE NULL END,to_jsonb(NEW)-'content');
  RETURN NEW;
END $$;
CREATE TRIGGER document_history AFTER INSERT OR UPDATE ON app.document_versions FOR EACH ROW EXECUTE FUNCTION app.record_document_change();
CREATE TRIGGER immutable_document_history BEFORE UPDATE OR DELETE ON app.document_events FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
CREATE TRIGGER immutable_document_receipts BEFORE UPDATE OR DELETE ON app.document_receipts FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
REVOKE ALL ON app.documents,app.document_versions,app.document_receipts,app.document_events FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION app.freeze_document_content(),app.record_document_change() FROM PUBLIC;
GRANT SELECT ON app.documents,app.document_versions,app.document_receipts,app.document_events TO sentinelle_app;
GRANT INSERT(id,tenant_id,site_id,code,title) ON app.documents TO sentinelle_app;
GRANT UPDATE(last_version,updated_at) ON app.documents TO sentinelle_app;
GRANT INSERT(id,tenant_id,site_id,document_id,number,content,author_id,reviewer_id,approver_id) ON app.document_versions TO sentinelle_app;
GRANT UPDATE(content,status,revision,reviewed_at,approved_at,decision_note) ON app.document_versions TO sentinelle_app;
GRANT INSERT(tenant_id,site_id,version_id,user_id) ON app.document_receipts TO sentinelle_app;
