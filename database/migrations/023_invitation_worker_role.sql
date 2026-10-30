-- Dedicated service role: no table access, owner membership or RLS bypass.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sentinelle_invitation_worker') THEN
  CREATE ROLE sentinelle_invitation_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
 END IF;
END $$;
GRANT USAGE ON SCHEMA identity TO sentinelle_invitation_worker;
GRANT EXECUTE ON FUNCTION identity.platform_invitation_reserve(uuid,uuid,uuid),identity.platform_invitation_record_outcome(uuid,uuid,uuid,text,uuid),identity.platform_invitation_link(uuid,uuid,text) TO sentinelle_invitation_worker;
