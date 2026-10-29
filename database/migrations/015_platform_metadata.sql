-- Revisions cover company/site metadata, independently of account permissions.
ALTER TABLE app.tenants ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE app.sites ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
CREATE OR REPLACE FUNCTION identity.platform_company(company_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(t)||jsonb_build_object(
 'sites',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.name,s.id) FROM (SELECT id,name,revision,country_code AS "countryCode" FROM app.sites WHERE tenant_id=company_id)s),'[]'::jsonb),
 'accounts',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.name,a.id) FROM (
 SELECT u.id,u.name,u.issuer,u.subject,m.role,m.enabled,m.revision,m.all_sites AS "allSites",
 coalesce((SELECT jsonb_agg(site_id ORDER BY site_id) FROM identity.site_grants WHERE tenant_id=company_id AND user_id=u.id),'[]'::jsonb) AS "siteIds"
 FROM identity.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.tenant_id=company_id)a),'[]'::jsonb),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e."occurredAt" DESC,e.id) FROM (
 SELECT e.id,e.operation,e.note,e.occurred_at AS "occurredAt",u.name AS "actorName" FROM identity.platform_events e JOIN identity.users u ON u.id=e.actor_id WHERE e.tenant_id=company_id ORDER BY e.occurred_at DESC,e.id LIMIT 50)e),'[]'::jsonb)) INTO result
 FROM app.tenants t WHERE t.id=company_id;
 RETURN result;
END $$;

CREATE FUNCTION identity.platform_update_metadata(company_id uuid,site_id uuid,expected_revision integer,payload jsonb,reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE before_value jsonb;after_value jsonb;target_id uuid;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF expected_revision IS NULL OR expected_revision<1 OR reason IS NULL OR length(btrim(reason)) NOT BETWEEN 1 AND 2000
   OR payload->>'name' IS NULL OR length(btrim(payload->>'name')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid metadata change' USING ERRCODE='23514'; END IF;
 -- Same company-first lock order as account provisioning.
 SELECT to_jsonb(t) INTO before_value FROM app.tenants t WHERE id=company_id FOR UPDATE;
 IF before_value IS NULL THEN RAISE EXCEPTION 'Company not found' USING ERRCODE='P0002'; END IF;
 IF site_id IS NULL THEN
  IF (before_value->>'revision')::integer<>expected_revision THEN RAISE EXCEPTION 'Company metadata changed' USING ERRCODE='40001'; END IF;
  IF payload->>'region' IS NULL OR length(btrim(payload->>'region')) NOT BETWEEN 1 AND 100
    OR jsonb_typeof(payload->'jurisdictions') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid company metadata' USING ERRCODE='23514'; END IF;
  IF jsonb_array_length(payload->'jurisdictions')>50 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(payload->'jurisdictions') j WHERE j !~ '^[A-Z][A-Z0-9_-]{1,19}$') THEN RAISE EXCEPTION 'Invalid jurisdictions' USING ERRCODE='23514'; END IF;
  UPDATE app.tenants t SET name=payload->>'name',region=payload->>'region',jurisdictions=ARRAY(SELECT jsonb_array_elements_text(payload->'jurisdictions')),revision=t.revision+1 WHERE t.id=company_id RETURNING to_jsonb(t) INTO after_value;
  target_id:=company_id;
 ELSE
  SELECT to_jsonb(s) INTO before_value FROM app.sites s WHERE s.tenant_id=company_id AND s.id=site_id FOR UPDATE;
  IF before_value IS NULL THEN RAISE EXCEPTION 'Site not found in company' USING ERRCODE='P0002'; END IF;
  IF (before_value->>'revision')::integer<>expected_revision THEN RAISE EXCEPTION 'Site metadata changed' USING ERRCODE='40001'; END IF;
  IF payload->>'countryCode' IS NULL OR (payload->>'countryCode') !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'Invalid country' USING ERRCODE='23514'; END IF;
  UPDATE app.sites s SET name=payload->>'name',country_code=payload->>'countryCode',revision=s.revision+1 WHERE s.tenant_id=company_id AND s.id=site_id RETURNING to_jsonb(s) INTO after_value;
  target_id:=site_id;
 END IF;
 INSERT INTO identity.platform_events(actor_id,tenant_id,operation,note,before_data,after_data)
 VALUES(identity.actor_id(),company_id,CASE WHEN site_id IS NULL THEN 'company_metadata' ELSE 'site_metadata' END,reason,before_value,after_value);
 RETURN target_id;
END $$;
REVOKE ALL ON FUNCTION identity.platform_update_metadata(uuid,uuid,integer,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.platform_update_metadata(uuid,uuid,integer,jsonb,text) TO sentinelle_app;
-- No direct runtime UPDATE privileges on companies or sites.
