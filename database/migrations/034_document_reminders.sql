CREATE TABLE app.document_reminders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,site_id uuid NOT NULL,version_id uuid NOT NULL,
 recipient_id uuid NOT NULL,actor_id uuid NOT NULL,request_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),read_at timestamptz,
 UNIQUE(tenant_id,version_id,actor_id,request_key),
 FOREIGN KEY(tenant_id,version_id,recipient_id) REFERENCES app.document_distribution(tenant_id,version_id,recipient_id),
 FOREIGN KEY(tenant_id,version_id,site_id) REFERENCES app.document_versions(tenant_id,id,site_id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES identity.memberships(tenant_id,user_id),
 CHECK(recipient_id<>actor_id)
);
CREATE INDEX document_reminders_inbox_idx ON app.document_reminders(tenant_id,recipient_id,created_at DESC,id DESC);
CREATE INDEX document_reminders_version_recipient_idx ON app.document_reminders(tenant_id,version_id,recipient_id,created_at DESC);
CREATE INDEX document_reminders_site_idx ON app.document_reminders(tenant_id,site_id);
CREATE INDEX document_reminders_actor_idx ON app.document_reminders(tenant_id,actor_id);
ALTER TABLE app.document_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_reminders FORCE ROW LEVEL SECURITY;
CREATE POLICY document_reminders_read ON app.document_reminders FOR SELECT USING (
 identity.has_site_access(tenant_id,site_id) AND EXISTS(SELECT 1 FROM app.document_versions v WHERE v.tenant_id=document_reminders.tenant_id AND v.id=document_reminders.version_id)
 AND (identity.can_write_site(tenant_id,site_id) OR (recipient_id=identity.actor_id()
 AND EXISTS(SELECT 1 FROM app.document_versions v WHERE v.tenant_id=document_reminders.tenant_id AND v.id=document_reminders.version_id AND v.status='published')
 AND NOT EXISTS(SELECT 1 FROM app.document_distribution_cancellations c WHERE c.tenant_id=document_reminders.tenant_id AND c.version_id=document_reminders.version_id AND c.recipient_id=document_reminders.recipient_id)
 AND NOT EXISTS(SELECT 1 FROM app.document_receipts r WHERE r.tenant_id=document_reminders.tenant_id AND r.version_id=document_reminders.version_id AND r.user_id=document_reminders.recipient_id))));
CREATE POLICY document_reminders_insert ON app.document_reminders FOR INSERT WITH CHECK (
 actor_id=identity.actor_id() AND recipient_id<>actor_id AND identity.can_write_site(tenant_id,site_id) AND identity.can_assign_site(tenant_id,site_id,recipient_id)
 AND EXISTS(SELECT 1 FROM app.document_versions v WHERE v.tenant_id=document_reminders.tenant_id AND v.id=document_reminders.version_id AND v.status='published')
 AND NOT EXISTS(SELECT 1 FROM app.document_distribution_cancellations c WHERE c.tenant_id=document_reminders.tenant_id AND c.version_id=document_reminders.version_id AND c.recipient_id=document_reminders.recipient_id)
 AND NOT EXISTS(SELECT 1 FROM app.document_receipts r WHERE r.tenant_id=document_reminders.tenant_id AND r.version_id=document_reminders.version_id AND r.user_id=document_reminders.recipient_id));
CREATE POLICY document_reminders_update ON app.document_reminders FOR UPDATE USING (
 recipient_id=identity.actor_id() AND identity.has_site_access(tenant_id,site_id)
 AND EXISTS(SELECT 1 FROM app.document_versions v WHERE v.tenant_id=document_reminders.tenant_id AND v.id=document_reminders.version_id AND v.status='published')
 AND NOT EXISTS(SELECT 1 FROM app.document_distribution_cancellations c WHERE c.tenant_id=document_reminders.tenant_id AND c.version_id=document_reminders.version_id AND c.recipient_id=document_reminders.recipient_id)
 AND NOT EXISTS(SELECT 1 FROM app.document_receipts r WHERE r.tenant_id=document_reminders.tenant_id AND r.version_id=document_reminders.version_id AND r.user_id=document_reminders.recipient_id))
 WITH CHECK(recipient_id=identity.actor_id() AND identity.has_site_access(tenant_id,site_id));
CREATE FUNCTION app.guard_document_reminder() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.version_id::text||':'||NEW.recipient_id::text,0));
 IF EXISTS(SELECT 1 FROM app.document_reminders r WHERE r.tenant_id=NEW.tenant_id AND r.version_id=NEW.version_id AND r.recipient_id=NEW.recipient_id AND r.created_at>clock_timestamp()-interval '24 hours') THEN
  RAISE EXCEPTION 'A reminder was already sent in the last 24 hours' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER document_reminder_guard BEFORE INSERT ON app.document_reminders FOR EACH ROW EXECUTE FUNCTION app.guard_document_reminder();
CREATE TRIGGER document_reminder_receipt_guard BEFORE UPDATE OR DELETE ON app.document_reminders FOR EACH ROW EXECUTE FUNCTION app.guard_notification_receipt();
REVOKE ALL ON app.document_reminders FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION app.guard_document_reminder() FROM PUBLIC;
GRANT SELECT,INSERT(id,tenant_id,site_id,version_id,recipient_id,actor_id,request_key),UPDATE(read_at) ON app.document_reminders TO sentinelle_app;
