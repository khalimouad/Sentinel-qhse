-- The delivery service must authenticate the provider response before invoking
-- this owner-only operation. The API runtime cannot execute it directly.
ALTER TABLE identity.platform_invitations ADD COLUMN linked_user_id uuid REFERENCES identity.users(id);
CREATE FUNCTION identity.platform_invitation_link(company_id uuid,invitation_id uuid,issuer_url text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation identity.platform_invitations;target uuid;current_name text;current_membership identity.memberships;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF issuer_url IS NULL OR issuer_url !~ '^https://[a-z0-9-]+[.]supabase[.]co/auth/v1$' THEN RAISE EXCEPTION 'Invalid provider issuer' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM app.tenants WHERE id=company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO invitation FROM identity.platform_invitations WHERE tenant_id=company_id AND id=invitation_id FOR UPDATE;
 IF invitation.id IS NULL THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE='P0002'; END IF;
 IF invitation.status<>'sent' OR invitation.provider_subject IS NULL THEN RAISE EXCEPTION 'Confirmed provider identity required' USING ERRCODE='40001'; END IF;
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
REVOKE ALL ON FUNCTION identity.platform_invitation_link(uuid,uuid,text) FROM PUBLIC,sentinelle_app;
