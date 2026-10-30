-- Six cause families stay on the protected report and in its existing immutable event history.
CREATE FUNCTION app.valid_ishikawa(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN jsonb_typeof(value) <> 'object' THEN false ELSE NOT EXISTS (
    SELECT 1 FROM jsonb_each(value) AS item(key, val)
    WHERE key NOT IN ('people','methods','machines','materials','environment','measurement')
      OR jsonb_typeof(val) <> 'string' OR length(val #>> '{}') > 1000
  ) END
$$;
REVOKE ALL ON FUNCTION app.valid_ishikawa(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.valid_ishikawa(jsonb) TO sentinelle_app;
ALTER TABLE app.reports ADD COLUMN ishikawa jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (app.valid_ishikawa(ishikawa));
GRANT UPDATE(ishikawa) ON app.reports TO sentinelle_app;
