-- Named distribution lists are append-only, bound to one published version.
CREATE TABLE app.document_distribution (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,version_id uuid NOT NULL,recipient_id uuid NOT NULL,assigned_by uuid NOT NULL,
 assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,version_id,recipient_id),
 FOREIGN KEY(tenant_id,version_id,site_id) REFERENCES app.document_versions(tenant_id,id,site_id),
 FOREIGN KEY(tenant_id,recipient_id) REFERENCES identity.memberships(tenant_id,user_id),
 FOREIGN KEY(tenant_id,assigned_by) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE INDEX document_distribution_recipient_idx ON app.document_distribution(tenant_id,recipient_id,version_id);
CREATE INDEX document_distribution_site_idx ON app.document_distribution(tenant_id,site_id);
CREATE INDEX document_distribution_assigner_idx ON app.document_distribution(tenant_id,assigned_by);
ALTER TABLE app.document_distribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_distribution FORCE ROW LEVEL SECURITY;
CREATE POLICY document_distribution_read ON app.document_distribution FOR SELECT USING(
 identity.has_site_access(tenant_id,site_id) AND (identity.can_write_site(tenant_id,site_id) OR recipient_id=identity.actor_id())
 AND EXISTS(SELECT 1 FROM app.document_versions v WHERE v.tenant_id=document_distribution.tenant_id AND v.id=document_distribution.version_id));
CREATE POLICY document_distribution_create ON app.document_distribution FOR INSERT WITH CHECK(
 assigned_by=identity.actor_id() AND identity.can_write_site(tenant_id,site_id) AND identity.can_assign_site(tenant_id,site_id,recipient_id)
 AND EXISTS(SELECT 1 FROM app.document_versions v WHERE v.tenant_id=document_distribution.tenant_id AND v.id=document_distribution.version_id AND v.status='published'));
CREATE TRIGGER document_distribution_immutable BEFORE UPDATE OR DELETE ON app.document_distribution FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
REVOKE ALL ON app.document_distribution FROM PUBLIC,sentinelle_app;
GRANT SELECT,INSERT(tenant_id,site_id,version_id,recipient_id,assigned_by) ON app.document_distribution TO sentinelle_app;
