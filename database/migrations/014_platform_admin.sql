-- Platform provisioning is separate from tenant business access.
CREATE TABLE identity.platform_admins(user_id uuid PRIMARY KEY REFERENCES identity.users(id),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE identity.memberships ADD COLUMN enabled boolean NOT NULL DEFAULT true;
ALTER TABLE identity.memberships ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
CREATE TABLE identity.platform_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES identity.users(id),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),operation text NOT NULL,note text NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 2000),
 before_data jsonb,after_data jsonb NOT NULL,occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX platform_events_tenant_idx ON identity.platform_events(tenant_id,occurred_at DESC,id);
CREATE TRIGGER immutable_platform_events BEFORE UPDATE OR DELETE ON identity.platform_events FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
CREATE FUNCTION identity.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM identity.platform_admins WHERE user_id=identity.actor_id())
$$;
CREATE OR REPLACE FUNCTION identity.is_member(target_tenant uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM identity.memberships WHERE tenant_id=$1 AND user_id=identity.actor_id() AND enabled)
$$;
CREATE OR REPLACE FUNCTION identity.current_role(target_tenant uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT role FROM identity.memberships WHERE tenant_id=$1 AND user_id=identity.actor_id() AND enabled
$$;
CREATE OR REPLACE FUNCTION identity.has_site_access(target_tenant uuid,target_site uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT $1=identity.tenant_id() AND EXISTS(SELECT 1 FROM identity.memberships m WHERE m.tenant_id=$1 AND m.user_id=identity.actor_id() AND m.enabled
 AND (m.all_sites OR EXISTS(SELECT 1 FROM identity.site_grants g WHERE g.tenant_id=$1 AND g.user_id=m.user_id AND g.site_id=$2)))
$$;
CREATE OR REPLACE FUNCTION identity.can_assign_site(target_tenant uuid,target_site uuid,target_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT identity.has_site_access($1,$2) AND EXISTS(SELECT 1 FROM identity.memberships m WHERE m.tenant_id=$1 AND m.user_id=$3 AND m.enabled
 AND (m.all_sites OR EXISTS(SELECT 1 FROM identity.site_grants g WHERE g.tenant_id=$1 AND g.user_id=$3 AND g.site_id=$2)))
$$;
CREATE OR REPLACE FUNCTION identity.can_review_site(target_tenant uuid,target_site uuid,target_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT identity.can_assign_site($1,$2,$3) AND EXISTS(SELECT 1 FROM identity.memberships WHERE tenant_id=$1 AND user_id=$3 AND enabled AND role IN ('admin','manager'))
$$;
CREATE OR REPLACE FUNCTION identity.list_members(target_tenant uuid) RETURNS TABLE(id uuid,name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT u.id,u.name FROM identity.users u JOIN identity.memberships m ON m.user_id=u.id
 WHERE m.tenant_id=$1 AND m.enabled AND $1=identity.tenant_id() AND identity.is_member($1) ORDER BY u.name,u.id
$$;
CREATE FUNCTION identity.platform_companies(search_text text,page_limit integer,page_offset integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF page_limit NOT BETWEEN 1 AND 100 OR page_offset NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='23514'; END IF;
 SELECT jsonb_build_object('total',(SELECT count(*) FROM app.tenants WHERE strpos(lower(name),lower(search_text))>0),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT id,name,region,jurisdictions FROM app.tenants WHERE strpos(lower(name),lower(search_text))>0 ORDER BY name,id LIMIT page_limit OFFSET page_offset)t),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION identity.platform_company(company_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(t)||jsonb_build_object(
 'sites',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.name,s.id) FROM (SELECT id,name,country_code AS "countryCode" FROM app.sites WHERE tenant_id=company_id)s),'[]'::jsonb),
 'accounts',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.name,a.id) FROM (
 SELECT u.id,u.name,u.issuer,u.subject,m.role,m.enabled,m.revision,m.all_sites AS "allSites",
 coalesce((SELECT jsonb_agg(site_id ORDER BY site_id) FROM identity.site_grants WHERE tenant_id=company_id AND user_id=u.id),'[]'::jsonb) AS "siteIds"
 FROM identity.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.tenant_id=company_id)a),'[]'::jsonb),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e."occurredAt" DESC,e.id) FROM (
 SELECT e.id,e.operation,e.note,e.occurred_at AS "occurredAt",u.name AS "actorName" FROM identity.platform_events e JOIN identity.users u ON u.id=e.actor_id WHERE e.tenant_id=company_id ORDER BY e.occurred_at DESC,e.id LIMIT 50)e),'[]'::jsonb)) INTO result
 FROM app.tenants t WHERE t.id=company_id;
 RETURN result;
END $$;
CREATE FUNCTION identity.platform_provision(command text,company_id uuid,payload jsonb,reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_id uuid;old_data jsonb;new_data jsonb;site_ids uuid[];account identity.memberships;existing_name text;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF length(btrim(reason)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'A reason is required' USING ERRCODE='23514'; END IF;
 IF command='company' THEN
  IF length(btrim(payload->>'name')) NOT BETWEEN 1 AND 200 OR length(btrim(payload->>'region')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid company' USING ERRCODE='23514'; END IF;
  INSERT INTO app.tenants(name,region,jurisdictions) VALUES(payload->>'name',payload->>'region',ARRAY(SELECT jsonb_array_elements_text(payload->'jurisdictions'))) RETURNING id,to_jsonb(tenants.*) INTO company_id,new_data;
  target_id:=company_id;
 ELSE
  -- Serialize provisioning per company, including membership/grant replacements.
  PERFORM 1 FROM app.tenants WHERE id=company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company not found' USING ERRCODE='23514'; END IF;
  IF command='site' THEN
   INSERT INTO app.sites(tenant_id,name,country_code) VALUES(company_id,payload->>'name',payload->>'countryCode') RETURNING id,to_jsonb(sites.*) INTO target_id,new_data;
  ELSIF command IN ('account','access') THEN
   SELECT coalesce(array_agg(DISTINCT value::uuid),'{}'::uuid[]) INTO site_ids FROM jsonb_array_elements_text(payload->'siteIds');
   IF (payload->>'allSites')::boolean AND cardinality(site_ids)>0 THEN RAISE EXCEPTION 'Choose all sites or explicit sites' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM unnest(site_ids) x WHERE NOT EXISTS(SELECT 1 FROM app.sites WHERE tenant_id=company_id AND id=x)) THEN RAISE EXCEPTION 'Site outside company' USING ERRCODE='23514'; END IF;
   IF command='account' THEN
    IF length(btrim(payload->>'name')) NOT BETWEEN 1 AND 200 OR length(btrim(payload->>'subject')) NOT BETWEEN 1 AND 500 OR length(payload->>'issuer') NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid identity' USING ERRCODE='23514'; END IF;
    INSERT INTO identity.users(issuer,subject,name) VALUES(payload->>'issuer',payload->>'subject',payload->>'name') ON CONFLICT(issuer,subject) DO NOTHING;
    SELECT id,name INTO target_id,existing_name FROM identity.users WHERE issuer=payload->>'issuer' AND subject=payload->>'subject';
    IF existing_name<>payload->>'name' THEN RAISE EXCEPTION 'Existing identity name differs' USING ERRCODE='23514'; END IF;
    INSERT INTO identity.memberships(tenant_id,user_id,role,all_sites) VALUES(company_id,target_id,payload->>'role',(payload->>'allSites')::boolean);
   ELSE
    target_id:=(payload->>'userId')::uuid;
    SELECT * INTO account FROM identity.memberships WHERE tenant_id=company_id AND user_id=target_id FOR UPDATE;
    IF account.user_id IS NULL OR account.revision<>(payload->>'revision')::integer THEN RAISE EXCEPTION 'Membership changed' USING ERRCODE='40001'; END IF;
    SELECT to_jsonb(account)||jsonb_build_object('siteIds',coalesce(jsonb_agg(site_id ORDER BY site_id),'[]'::jsonb)) INTO old_data FROM identity.site_grants WHERE tenant_id=company_id AND user_id=target_id;
    UPDATE identity.memberships SET role=payload->>'role',all_sites=(payload->>'allSites')::boolean,enabled=(payload->>'enabled')::boolean,revision=revision+1 WHERE tenant_id=company_id AND user_id=target_id;
    DELETE FROM identity.site_grants WHERE tenant_id=company_id AND user_id=target_id;
   END IF;
   INSERT INTO identity.site_grants(tenant_id,user_id,site_id) SELECT company_id,target_id,x FROM unnest(site_ids)x;
   SELECT to_jsonb(m)||jsonb_build_object('siteIds',to_jsonb(site_ids)) INTO new_data FROM identity.memberships m WHERE tenant_id=company_id AND user_id=target_id;
  ELSE RAISE EXCEPTION 'Unknown provisioning command' USING ERRCODE='23514'; END IF;
 END IF;
 INSERT INTO identity.platform_events(actor_id,tenant_id,operation,note,before_data,after_data) VALUES(identity.actor_id(),company_id,command,reason,old_data,new_data);
 RETURN target_id;
END $$;
REVOKE ALL ON identity.platform_admins,identity.platform_events FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION identity.is_platform_admin(),identity.platform_companies(text,integer,integer),identity.platform_company(uuid),identity.platform_provision(text,uuid,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.is_platform_admin(),identity.platform_companies(text,integer,integer),identity.platform_company(uuid),identity.platform_provision(text,uuid,jsonb,text) TO sentinelle_app;
-- The first platform administrator is provisioned by the database owner, never by a tenant admin.
