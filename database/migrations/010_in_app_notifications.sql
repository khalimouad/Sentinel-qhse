ALTER TABLE app.action_comments ADD CONSTRAINT action_comment_notification_scope UNIQUE(tenant_id,id,site_id,action_id);
CREATE TABLE app.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, site_id uuid NOT NULL,
  recipient_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES identity.users(id), action_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('action_assigned','action_comment')), comment_id uuid,
  source_key uuid GENERATED ALWAYS AS (coalesce(comment_id,action_id)) STORED,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), read_at timestamptz,
  CHECK(recipient_id<>actor_id), CHECK((kind='action_assigned' AND comment_id IS NULL) OR (kind='action_comment' AND comment_id IS NOT NULL)),
  UNIQUE(tenant_id,recipient_id,kind,source_key),
  FOREIGN KEY(tenant_id,recipient_id) REFERENCES identity.memberships(tenant_id,user_id),
  FOREIGN KEY(tenant_id,action_id,site_id) REFERENCES app.actions(tenant_id,id,site_id),
  FOREIGN KEY(tenant_id,comment_id,site_id,action_id) REFERENCES app.action_comments(tenant_id,id,site_id,action_id)
);
CREATE INDEX notifications_inbox_idx ON app.notifications(tenant_id,recipient_id,created_at DESC,id DESC);
CREATE INDEX notifications_unread_idx ON app.notifications(tenant_id,recipient_id) WHERE read_at IS NULL;
CREATE INDEX notifications_action_idx ON app.notifications(tenant_id,action_id,site_id);
CREATE INDEX notifications_comment_idx ON app.notifications(tenant_id,comment_id,site_id,action_id);
CREATE INDEX notifications_site_idx ON app.notifications(tenant_id,site_id);
CREATE INDEX notifications_actor_idx ON app.notifications(actor_id);
ALTER TABLE app.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_read ON app.notifications FOR SELECT USING(
  recipient_id=identity.actor_id() AND identity.has_site_access(tenant_id,site_id) AND EXISTS(
    SELECT 1 FROM app.actions a WHERE a.tenant_id=notifications.tenant_id AND a.id=notifications.action_id));
CREATE POLICY notifications_update ON app.notifications FOR UPDATE USING(
  recipient_id=identity.actor_id() AND identity.has_site_access(tenant_id,site_id) AND EXISTS(
    SELECT 1 FROM app.actions a WHERE a.tenant_id=notifications.tenant_id AND a.id=notifications.action_id))
  WITH CHECK(recipient_id=identity.actor_id() AND identity.has_site_access(tenant_id,site_id) AND EXISTS(
    SELECT 1 FROM app.actions a WHERE a.tenant_id=notifications.tenant_id AND a.id=notifications.action_id));
-- Only trigger owners can INSERT. No runtime INSERT privilege is granted.
CREATE POLICY notifications_append ON app.notifications FOR INSERT WITH CHECK(
  identity.can_write_site(tenant_id,site_id) AND actor_id=identity.actor_id());
CREATE FUNCTION app.notify_action_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.owner_id<>identity.actor_id() THEN
    INSERT INTO app.notifications(tenant_id,site_id,recipient_id,actor_id,action_id,kind)
      VALUES(NEW.tenant_id,NEW.site_id,NEW.owner_id,identity.actor_id(),NEW.id,'action_assigned')
      ON CONFLICT(tenant_id,recipient_id,kind,source_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER action_assignment_notification AFTER INSERT ON app.actions FOR EACH ROW EXECUTE FUNCTION app.notify_action_assignment();
CREATE FUNCTION app.notify_action_comment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recipient uuid;
BEGIN
  SELECT owner_id INTO recipient FROM app.actions WHERE tenant_id=NEW.tenant_id AND id=NEW.action_id;
  IF recipient IS NOT NULL AND recipient<>NEW.author_id THEN
    INSERT INTO app.notifications(tenant_id,site_id,recipient_id,actor_id,action_id,kind,comment_id)
      VALUES(NEW.tenant_id,NEW.site_id,recipient,NEW.author_id,NEW.action_id,'action_comment',NEW.id)
      ON CONFLICT(tenant_id,recipient_id,kind,source_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER action_comment_notification AFTER INSERT ON app.action_comments FOR EACH ROW EXECUTE FUNCTION app.notify_action_comment();
CREATE FUNCTION app.guard_notification_receipt() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Notifications cannot be deleted'; END IF;
  IF OLD.read_at IS NOT NULL THEN
    IF NEW.read_at IS DISTINCT FROM OLD.read_at THEN RAISE EXCEPTION 'Notification receipts cannot be rewritten' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW.read_at IS NULL THEN RAISE EXCEPTION 'A read receipt is required' USING ERRCODE='23514'; END IF;
    NEW.read_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER notification_receipt_guard BEFORE UPDATE OR DELETE ON app.notifications FOR EACH ROW EXECUTE FUNCTION app.guard_notification_receipt();
REVOKE ALL ON app.notifications FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION app.notify_action_assignment(),app.notify_action_comment(),app.guard_notification_receipt() FROM PUBLIC;
GRANT SELECT ON app.notifications TO sentinelle_app;
GRANT UPDATE(read_at) ON app.notifications TO sentinelle_app;
