-- Invitation requests are private platform data, separate from tenant business records.
CREATE TABLE identity.platform_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 email text NOT NULL CHECK(length(email) BETWEEN 3 AND 254), name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 role text NOT NULL CHECK(role IN ('admin','manager','reader')), all_sites boolean NOT NULL, site_ids uuid[] NOT NULL DEFAULT '{}',
 requested_by uuid NOT NULL REFERENCES identity.users(id), note text NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 2000),
 idempotency_key uuid NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','cancelled')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), cancelled_at timestamptz,
 UNIQUE(tenant_id,requested_by,idempotency_key), CHECK(NOT all_sites OR cardinality(site_ids)=0)
);
CREATE INDEX platform_invitations_tenant_idx ON identity.platform_invitations(tenant_id,created_at DESC,id);
CREATE FUNCTION identity.platform_invitation_create(company_id uuid,payload jsonb,request_key uuid,reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing identity.platform_invitations; sites uuid[]; result identity.platform_invitations;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF request_key IS NULL OR reason IS NULL OR length(btrim(reason)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM app.tenants WHERE id=company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company not found' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(array_agg(DISTINCT value::uuid ORDER BY value::uuid),'{}'::uuid[]) INTO sites FROM jsonb_array_elements_text(payload->'siteIds');
 IF payload->>'email' IS NULL OR length(payload->>'email') NOT BETWEEN 3 AND 254 OR payload->>'name' IS NULL OR length(btrim(payload->>'name')) NOT BETWEEN 1 AND 200
  OR payload->>'role' NOT IN ('admin','manager','reader') OR jsonb_typeof(payload->'allSites') IS DISTINCT FROM 'boolean'
  OR cardinality(sites)>500 OR ((payload->>'allSites')::boolean AND cardinality(sites)>0)
  OR EXISTS(SELECT 1 FROM unnest(sites) x WHERE NOT EXISTS(SELECT 1 FROM app.sites WHERE tenant_id=company_id AND id=x)) THEN
  RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='23514'; END IF;
 SELECT * INTO existing FROM identity.platform_invitations WHERE tenant_id=company_id AND requested_by=identity.actor_id() AND idempotency_key=request_key;
 IF existing.id IS NOT NULL THEN
  IF ROW(existing.email,existing.name,existing.role,existing.all_sites,existing.site_ids,existing.note) IS DISTINCT FROM
    ROW(lower(btrim(payload->>'email')),payload->>'name',payload->>'role',(payload->>'allSites')::boolean,sites,reason) THEN
   RAISE EXCEPTION 'Idempotency key reused with different data' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('id',existing.id,'status',existing.status,'createdAt',existing.created_at);
 END IF;
 INSERT INTO identity.platform_invitations(tenant_id,email,name,role,all_sites,site_ids,requested_by,note,idempotency_key)
 VALUES(company_id,lower(btrim(payload->>'email')),payload->>'name',payload->>'role',(payload->>'allSites')::boolean,sites,identity.actor_id(),reason,request_key) RETURNING * INTO result;
 INSERT INTO identity.platform_events(actor_id,tenant_id,operation,note,after_data) VALUES(identity.actor_id(),company_id,'invitation_request',reason,to_jsonb(result)-'email'-'idempotency_key');
 RETURN jsonb_build_object('id',result.id,'status',result.status,'createdAt',result.created_at);
END $$;
CREATE FUNCTION identity.platform_invitation_list(company_id uuid,page_limit integer,page_offset integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.tenants WHERE id=company_id) THEN RAISE EXCEPTION 'Company not found' USING ERRCODE='P0002'; END IF;
 IF page_limit IS NULL OR page_limit NOT BETWEEN 1 AND 100 OR page_offset IS NULL OR page_offset NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='23514'; END IF;
 SELECT jsonb_build_object('total',(SELECT count(*) FROM identity.platform_invitations WHERE tenant_id=company_id),
  'items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p."createdAt" DESC,p.id DESC) FROM
   (SELECT id,email,name,role,status,created_at AS "createdAt" FROM identity.platform_invitations WHERE tenant_id=company_id ORDER BY created_at DESC,id DESC LIMIT page_limit OFFSET page_offset)p),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON identity.platform_invitations FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION identity.platform_invitation_create(uuid,jsonb,uuid,text),identity.platform_invitation_list(uuid,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.platform_invitation_create(uuid,jsonb,uuid,text),identity.platform_invitation_list(uuid,integer,integer) TO sentinelle_app;
