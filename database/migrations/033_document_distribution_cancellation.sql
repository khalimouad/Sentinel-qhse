CREATE TABLE app.document_distribution_cancellations (
 tenant_id uuid NOT NULL,site_id uuid NOT NULL,version_id uuid NOT NULL,recipient_id uuid NOT NULL,
 cancelled_by uuid NOT NULL,reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),request_key uuid NOT NULL,
 cancelled_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,version_id,recipient_id),
 UNIQUE(tenant_id,version_id,cancelled_by,request_key),
 FOREIGN KEY(tenant_id,version_id,recipient_id) REFERENCES app.document_distribution(tenant_id,version_id,recipient_id),
 FOREIGN KEY(tenant_id,version_id,site_id) REFERENCES app.document_versions(tenant_id,id,site_id),
 FOREIGN KEY(tenant_id,cancelled_by) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE INDEX distribution_cancellations_site_idx ON app.document_distribution_cancellations(tenant_id,site_id);
CREATE INDEX distribution_cancellations_actor_idx ON app.document_distribution_cancellations(tenant_id,cancelled_by);
ALTER TABLE app.document_distribution_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_distribution_cancellations FORCE ROW LEVEL SECURITY;
CREATE POLICY distribution_cancellation_read ON app.document_distribution_cancellations FOR SELECT USING(
 identity.has_site_access(tenant_id,site_id) AND (identity.can_write_site(tenant_id,site_id) OR recipient_id=identity.actor_id())
 AND EXISTS(SELECT 1 FROM app.document_versions v WHERE v.tenant_id=document_distribution_cancellations.tenant_id AND v.id=document_distribution_cancellations.version_id));
CREATE POLICY distribution_cancellation_create ON app.document_distribution_cancellations FOR INSERT WITH CHECK(
 cancelled_by=identity.actor_id() AND identity.can_write_site(tenant_id,site_id)
 AND EXISTS(SELECT 1 FROM app.document_versions v WHERE v.tenant_id=document_distribution_cancellations.tenant_id AND v.id=document_distribution_cancellations.version_id AND v.status='published')
 AND EXISTS(SELECT 1 FROM app.document_distribution d WHERE d.tenant_id=document_distribution_cancellations.tenant_id AND d.version_id=document_distribution_cancellations.version_id AND d.recipient_id=document_distribution_cancellations.recipient_id));
CREATE TRIGGER distribution_cancellation_immutable BEFORE UPDATE OR DELETE ON app.document_distribution_cancellations FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
REVOKE ALL ON app.document_distribution_cancellations FROM PUBLIC,sentinelle_app;
GRANT SELECT,INSERT(tenant_id,site_id,version_id,recipient_id,cancelled_by,reason,request_key) ON app.document_distribution_cancellations TO sentinelle_app;
DROP POLICY document_notifications_read ON app.document_notifications;
DROP POLICY document_notifications_update ON app.document_notifications;
CREATE POLICY document_notifications_read ON app.document_notifications FOR SELECT USING(
 recipient_id=identity.actor_id() AND identity.has_site_access(tenant_id,site_id) AND EXISTS(SELECT 1 FROM app.document_versions v WHERE v.tenant_id=document_notifications.tenant_id AND v.id=document_notifications.version_id AND v.status='published')
 AND NOT EXISTS(SELECT 1 FROM app.document_distribution_cancellations c WHERE c.tenant_id=document_notifications.tenant_id AND c.version_id=document_notifications.version_id AND c.recipient_id=document_notifications.recipient_id));
CREATE POLICY document_notifications_update ON app.document_notifications FOR UPDATE USING(
 recipient_id=identity.actor_id() AND identity.has_site_access(tenant_id,site_id) AND EXISTS(SELECT 1 FROM app.document_versions v WHERE v.tenant_id=document_notifications.tenant_id AND v.id=document_notifications.version_id AND v.status='published')
 AND NOT EXISTS(SELECT 1 FROM app.document_distribution_cancellations c WHERE c.tenant_id=document_notifications.tenant_id AND c.version_id=document_notifications.version_id AND c.recipient_id=document_notifications.recipient_id))
 WITH CHECK(recipient_id=identity.actor_id() AND identity.has_site_access(tenant_id,site_id) AND EXISTS(SELECT 1 FROM app.document_versions v WHERE v.tenant_id=document_notifications.tenant_id AND v.id=document_notifications.version_id AND v.status='published')
 AND NOT EXISTS(SELECT 1 FROM app.document_distribution_cancellations c WHERE c.tenant_id=document_notifications.tenant_id AND c.version_id=document_notifications.version_id AND c.recipient_id=document_notifications.recipient_id));
