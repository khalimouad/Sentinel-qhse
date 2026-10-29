-- Keep company details bounded independently of the number of accounts/events.
CREATE INDEX memberships_platform_filter_idx ON identity.memberships(tenant_id,enabled,role,user_id);
CREATE INDEX platform_events_operation_idx ON identity.platform_events(tenant_id,operation,occurred_at DESC,id);
CREATE OR REPLACE FUNCTION identity.platform_company(company_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(t)||jsonb_build_object(
 'sites',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.name,s.id) FROM (SELECT id,name,revision,country_code AS "countryCode" FROM app.sites WHERE tenant_id=company_id)s),'[]'::jsonb),
 'accountCount',(SELECT count(*) FROM identity.memberships WHERE tenant_id=company_id),
 'eventCount',(SELECT count(*) FROM identity.platform_events WHERE tenant_id=company_id)) INTO result FROM app.tenants t WHERE t.id=company_id;
 RETURN result;
END $$;
CREATE FUNCTION identity.platform_accounts(company_id uuid,search_text text,role_filter text,status_filter text,page_limit integer,page_offset integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.tenants WHERE id=company_id) THEN RAISE EXCEPTION 'Company not found' USING ERRCODE='P0002'; END IF;
 IF page_limit IS NULL OR page_limit NOT BETWEEN 1 AND 100 OR page_offset IS NULL OR page_offset NOT BETWEEN 0 AND 100000
  OR role_filter IS NULL OR role_filter NOT IN ('all','admin','manager','reader') OR status_filter IS NULL OR status_filter NOT IN ('all','active','suspended')
  OR search_text IS NULL OR length(search_text)>200 THEN RAISE EXCEPTION 'Invalid account filters' USING ERRCODE='23514'; END IF;
 WITH filtered AS MATERIALIZED (
  SELECT u.id,u.name,u.issuer,u.subject,m.role,m.enabled,m.revision,m.all_sites AS "allSites"
  FROM identity.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.tenant_id=company_id
   AND (role_filter='all' OR m.role=role_filter) AND (status_filter='all' OR m.enabled=(status_filter='active'))
   AND strpos(lower(u.name||' '||u.subject),lower(search_text))>0
 ),page AS (
  SELECT f.*,coalesce((SELECT jsonb_agg(site_id ORDER BY site_id) FROM identity.site_grants WHERE tenant_id=company_id AND user_id=f.id),'[]'::jsonb) AS "siteIds"
  FROM filtered f ORDER BY f.name,f.id LIMIT page_limit OFFSET page_offset
 ) SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.name,p.id) FROM page p),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION identity.platform_history(company_id uuid,search_text text,operation_filter text,page_limit integer,page_offset integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.tenants WHERE id=company_id) THEN RAISE EXCEPTION 'Company not found' USING ERRCODE='P0002'; END IF;
 IF page_limit IS NULL OR page_limit NOT BETWEEN 1 AND 100 OR page_offset IS NULL OR page_offset NOT BETWEEN 0 AND 100000
  OR operation_filter IS NULL OR operation_filter NOT IN ('all','company','site','account','access','company_metadata','site_metadata')
  OR search_text IS NULL OR length(search_text)>200 THEN RAISE EXCEPTION 'Invalid history filters' USING ERRCODE='23514'; END IF;
 WITH filtered AS MATERIALIZED (
  SELECT e.id,e.operation,e.note,e.occurred_at AS "occurredAt",u.name AS "actorName"
  FROM identity.platform_events e JOIN identity.users u ON u.id=e.actor_id WHERE e.tenant_id=company_id
   AND (operation_filter='all' OR e.operation=operation_filter) AND strpos(lower(e.note||' '||u.name),lower(search_text))>0
 ),page AS (SELECT * FROM filtered ORDER BY "occurredAt" DESC,id DESC LIMIT page_limit OFFSET page_offset)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'items',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('before',e.before_data,'after',e.after_data) ORDER BY p."occurredAt" DESC,p.id DESC) FROM page p JOIN identity.platform_events e ON e.id=p.id),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION identity.platform_accounts(uuid,text,text,text,integer,integer),identity.platform_history(uuid,text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.platform_accounts(uuid,text,text,text,integer,integer),identity.platform_history(uuid,text,text,integer,integer) TO sentinelle_app;
