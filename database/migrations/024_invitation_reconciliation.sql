ALTER TABLE identity.platform_invitations DROP CONSTRAINT platform_invitations_status_check;
ALTER TABLE identity.platform_invitations ADD CONSTRAINT platform_invitations_status_check CHECK(status IN ('pending','sending','uncertain','sent','identity_verified','cancelled'));
ALTER TABLE identity.platform_invitations ADD COLUMN provider_issuer text;
CREATE FUNCTION identity.platform_invitation_reserve_v2(company_id uuid,invitation_id uuid,attempt_id uuid,issuer_url text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF issuer_url IS NULL OR issuer_url !~ '^https://[a-z0-9-]+[.]supabase[.]co/auth/v1$' THEN RAISE EXCEPTION 'Invalid provider issuer' USING ERRCODE='23514'; END IF;
 result:=identity.platform_invitation_reserve(company_id,invitation_id,attempt_id);
 UPDATE identity.platform_invitations SET provider_issuer=issuer_url WHERE tenant_id=company_id AND id=invitation_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION identity.platform_invitation_reserve_v2(uuid,uuid,uuid,text) FROM PUBLIC,sentinelle_app;
GRANT EXECUTE ON FUNCTION identity.platform_invitation_reserve_v2(uuid,uuid,uuid,text) TO sentinelle_invitation_worker;
REVOKE EXECUTE ON FUNCTION identity.platform_invitation_reserve(uuid,uuid,uuid) FROM sentinelle_invitation_worker;
CREATE FUNCTION identity.platform_invitation_lookup(company_id uuid,invitation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation identity.platform_invitations;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 SELECT * INTO invitation FROM identity.platform_invitations WHERE tenant_id=company_id AND id=invitation_id;
 IF invitation.id IS NULL THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('id',invitation.id,'email',invitation.email,'status',invitation.status,'attemptId',invitation.delivery_attempt_id,'providerIssuer',invitation.provider_issuer,'linkedUserId',invitation.linked_user_id);
END $$;
CREATE FUNCTION identity.platform_invitation_reconcile(company_id uuid,invitation_id uuid,attempt_id uuid,provider_user uuid,reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation identity.platform_invitations;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF attempt_id IS NULL OR provider_user IS NULL OR reason IS NULL OR length(btrim(reason)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid reconciliation' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM app.tenants WHERE id=company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO invitation FROM identity.platform_invitations WHERE tenant_id=company_id AND id=invitation_id FOR UPDATE;
 IF invitation.id IS NULL THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE='P0002'; END IF;
 IF invitation.status NOT IN ('uncertain','sending') OR invitation.delivery_attempt_id IS DISTINCT FROM attempt_id THEN RAISE EXCEPTION 'Delivery attempt changed' USING ERRCODE='40001'; END IF;
 IF invitation.status='sending' AND (invitation.delivery_started_at IS NULL OR invitation.delivery_started_at>clock_timestamp()-interval '2 minutes') THEN RAISE EXCEPTION 'Delivery still in progress' USING ERRCODE='40001'; END IF;
 UPDATE identity.platform_invitations SET status='identity_verified',provider_subject=provider_user WHERE tenant_id=company_id AND id=invitation_id RETURNING * INTO invitation;
 INSERT INTO identity.platform_events(actor_id,tenant_id,operation,note,after_data) VALUES(identity.actor_id(),company_id,'invitation_reconcile',reason,to_jsonb(invitation)-'email'-'idempotency_key');
 RETURN jsonb_build_object('id',invitation.id,'status',invitation.status,'attemptId',invitation.delivery_attempt_id);
END $$;
REVOKE ALL ON FUNCTION identity.platform_invitation_lookup(uuid,uuid),identity.platform_invitation_reconcile(uuid,uuid,uuid,uuid,text) FROM PUBLIC,sentinelle_app;
GRANT EXECUTE ON FUNCTION identity.platform_invitation_lookup(uuid,uuid),identity.platform_invitation_reconcile(uuid,uuid,uuid,uuid,text) TO sentinelle_invitation_worker;

CREATE OR REPLACE FUNCTION identity.platform_invitation_link(company_id uuid,invitation_id uuid,issuer_url text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation identity.platform_invitations;target uuid;current_name text;current_membership identity.memberships;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF issuer_url IS NULL OR issuer_url !~ '^https://[a-z0-9-]+[.]supabase[.]co/auth/v1$' THEN RAISE EXCEPTION 'Invalid provider issuer' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM app.tenants WHERE id=company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO invitation FROM identity.platform_invitations WHERE tenant_id=company_id AND id=invitation_id FOR UPDATE;
 IF invitation.id IS NULL THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE='P0002'; END IF;
 IF invitation.provider_issuer IS DISTINCT FROM issuer_url THEN RAISE EXCEPTION 'Provider issuer differs from reserved attempt' USING ERRCODE='40001'; END IF;
 IF invitation.status NOT IN ('sent','identity_verified') OR invitation.provider_subject IS NULL THEN RAISE EXCEPTION 'Confirmed provider identity required' USING ERRCODE='40001'; END IF;
 IF invitation.linked_user_id IS NOT NULL THEN RETURN jsonb_build_object('id',invitation.id,'userId',invitation.linked_user_id); END IF;
 IF EXISTS(SELECT 1 FROM unnest(invitation.site_ids) x WHERE NOT EXISTS(SELECT 1 FROM app.sites WHERE tenant_id=company_id AND id=x)) THEN RAISE EXCEPTION 'Site no longer available' USING ERRCODE='23514'; END IF;
 INSERT INTO identity.users(issuer,subject,name) VALUES(issuer_url,invitation.provider_subject::text,invitation.name) ON CONFLICT(issuer,subject) DO NOTHING;
 SELECT id,name INTO target,current_name FROM identity.users WHERE issuer=issuer_url AND subject=invitation.provider_subject::text;
 IF current_name<>invitation.name THEN RAISE EXCEPTION 'Identity name differs' USING ERRCODE='40001'; END IF;
 SELECT * INTO current_membership FROM identity.memberships WHERE tenant_id=company_id AND user_id=target;
 IF current_membership.user_id IS NOT NULL THEN RAISE EXCEPTION 'Membership already exists' USING ERRCODE='40001'; END IF;
 INSERT INTO identity.memberships(tenant_id,user_id,role,all_sites) VALUES(company_id,target,invitation.role,invitation.all_sites);
 INSERT INTO identity.site_grants(tenant_id,user_id,site_id) SELECT company_id,target,x FROM unnest(invitation.site_ids)x;
 UPDATE identity.platform_invitations SET linked_user_id=target WHERE tenant_id=company_id AND id=invitation_id;
 INSERT INTO identity.platform_events(actor_id,tenant_id,operation,note,after_data) VALUES(identity.actor_id(),company_id,'invitation_linked','Identité rattachée à la demande',jsonb_build_object('invitationId',invitation_id,'userId',target,'role',invitation.role,'allSites',invitation.all_sites,'siteIds',invitation.site_ids));
 RETURN jsonb_build_object('id',invitation.id,'userId',target);
END $$;

CREATE OR REPLACE FUNCTION identity.platform_invitation_list(company_id uuid,page_limit integer,page_offset integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.tenants WHERE id=company_id) THEN RAISE EXCEPTION 'Company not found' USING ERRCODE='P0002'; END IF;
 IF page_limit IS NULL OR page_limit NOT BETWEEN 1 AND 100 OR page_offset IS NULL OR page_offset NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='23514'; END IF;
 SELECT jsonb_build_object('total',(SELECT count(*) FROM identity.platform_invitations WHERE tenant_id=company_id),
  'items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p."createdAt" DESC,p.id DESC) FROM
   (SELECT id,email,name,role,status,provider_subject AS "providerSubject",(linked_user_id IS NOT NULL) AS "linked",created_at AS "createdAt" FROM identity.platform_invitations WHERE tenant_id=company_id ORDER BY created_at DESC,id DESC LIMIT page_limit OFFSET page_offset)p),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
