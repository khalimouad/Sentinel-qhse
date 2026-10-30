-- INSERT ... ON CONFLICT needs a SELECT policy for its arbiter. Permit only
-- the non-login table owner used by notification triggers to see notifications
-- created by the current actor on a site where that actor can write. The
-- application role keeps the recipient-only SELECT policy.
DO $$
DECLARE owner_role text;
BEGIN
 SELECT pg_get_userbyid(c.relowner) INTO owner_role FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname='notifications';
 IF owner_role IS NULL THEN RAISE EXCEPTION 'Notification table owner missing'; END IF;
 EXECUTE format('CREATE POLICY notifications_trigger_owner_read ON app.notifications FOR SELECT TO %I USING (actor_id=identity.actor_id() AND identity.can_write_site(tenant_id,site_id))',owner_role);
END $$;
