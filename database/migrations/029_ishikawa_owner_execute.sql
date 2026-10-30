-- Security-definer report triggers execute constraints as the report table owner.
DO $$
DECLARE owner_role text;
BEGIN
  SELECT pg_get_userbyid(c.relowner) INTO owner_role
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='app' AND c.relname='reports';
  IF owner_role IS NULL THEN RAISE EXCEPTION 'Report table owner missing'; END IF;
  EXECUTE format('GRANT EXECUTE ON FUNCTION app.valid_ishikawa(jsonb) TO %I',owner_role);
END $$;
