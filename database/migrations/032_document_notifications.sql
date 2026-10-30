CREATE TABLE app.document_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,site_id uuid NOT NULL,
 version_id uuid NOT NULL,recipient_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES identity.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),read_at timestamptz,
 UNIQUE(tenant_id,version_id,recipient_id),
 FOREIGN KEY(tenant_id,version_id,recipient_id) REFERENCES app.document_distribution(tenant_id,version_id,recipient_id),
 FOREIGN KEY(tenant_id,version_id,site_id) REFERENCES app.document_versions(tenant_id,id,site_id)
);
CREATE INDEX document_notifications_inbox_idx ON app.document_notifications(tenant_id,recipient_id,created_at DESC,id DESC);
CREATE INDEX document_notifications_unread_idx ON app.document_notifications(tenant_id,recipient_id) WHERE read_at IS NULL;
CREATE INDEX document_notifications_version_idx ON app.document_notifications(tenant_id,version_id,site_id);
CREATE INDEX document_notifications_actor_idx ON app.document_notifications(actor_id);
ALTER TABLE app.document_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY document_notifications_read ON app.document_notifications FOR SELECT USING(
 recipient_id=identity.actor_id() AND identity.has_site_access(tenant_id,site_id) AND EXISTS(
 SELECT 1 FROM app.document_versions v WHERE v.tenant_id=document_notifications.tenant_id AND v.id=document_notifications.version_id AND v.status='published'));
CREATE POLICY document_notifications_update ON app.document_notifications FOR UPDATE USING(
 recipient_id=identity.actor_id() AND identity.has_site_access(tenant_id,site_id) AND EXISTS(
 SELECT 1 FROM app.document_versions v WHERE v.tenant_id=document_notifications.tenant_id AND v.id=document_notifications.version_id AND v.status='published'))
 WITH CHECK(recipient_id=identity.actor_id() AND identity.has_site_access(tenant_id,site_id) AND EXISTS(
 SELECT 1 FROM app.document_versions v WHERE v.tenant_id=document_notifications.tenant_id AND v.id=document_notifications.version_id AND v.status='published'));
CREATE POLICY document_notifications_append ON app.document_notifications FOR INSERT WITH CHECK(
 actor_id=identity.actor_id() AND identity.can_write_site(tenant_id,site_id));
CREATE FUNCTION app.notify_document_distribution() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.recipient_id<>NEW.assigned_by THEN
  INSERT INTO app.document_notifications(tenant_id,site_id,version_id,recipient_id,actor_id)
  VALUES(NEW.tenant_id,NEW.site_id,NEW.version_id,NEW.recipient_id,NEW.assigned_by);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER document_distribution_notify AFTER INSERT ON app.document_distribution FOR EACH ROW EXECUTE FUNCTION app.notify_document_distribution();
CREATE TRIGGER document_notification_receipt_guard BEFORE UPDATE OR DELETE ON app.document_notifications FOR EACH ROW EXECUTE FUNCTION app.guard_notification_receipt();
REVOKE ALL ON app.document_notifications FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION app.notify_document_distribution() FROM PUBLIC;
GRANT SELECT,UPDATE(read_at) ON app.document_notifications TO sentinelle_app;
