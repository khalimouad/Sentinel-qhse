-- A provider request can have an ambiguous result; never retry it automatically.
ALTER TABLE identity.platform_invitations DROP CONSTRAINT platform_invitations_status_check;
ALTER TABLE identity.platform_invitations ADD CONSTRAINT platform_invitations_status_check CHECK(status IN ('pending','sending','uncertain','sent','cancelled'));
ALTER TABLE identity.platform_invitations ADD COLUMN delivery_attempt_id uuid;
ALTER TABLE identity.platform_invitations ADD COLUMN delivery_started_at timestamptz;
ALTER TABLE identity.platform_invitations ADD COLUMN provider_subject uuid;
ALTER TABLE identity.platform_invitations ADD COLUMN delivered_at timestamptz;
CREATE FUNCTION identity.platform_invitation_reserve(company_id uuid,invitation_id uuid,attempt_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation identity.platform_invitations;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF attempt_id IS NULL THEN RAISE EXCEPTION 'Attempt ID required' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM app.tenants WHERE id=company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO invitation FROM identity.platform_invitations WHERE tenant_id=company_id AND id=invitation_id FOR UPDATE;
 IF invitation.id IS NULL THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE='P0002'; END IF;
 IF invitation.status<>'pending' THEN RAISE EXCEPTION 'Invitation is not pending' USING ERRCODE='40001'; END IF;
 UPDATE identity.platform_invitations SET status='sending',delivery_attempt_id=attempt_id,delivery_started_at=clock_timestamp() WHERE id=invitation_id RETURNING * INTO invitation;
 INSERT INTO identity.platform_events(actor_id,tenant_id,operation,note,after_data) VALUES(identity.actor_id(),company_id,'invitation_delivery_started','Envoi réservé',to_jsonb(invitation)-'email'-'idempotency_key');
 RETURN jsonb_build_object('id',invitation.id,'attemptId',invitation.delivery_attempt_id,'email',invitation.email,'status',invitation.status);
END $$;
REVOKE ALL ON FUNCTION identity.platform_invitation_reserve(uuid,uuid,uuid) FROM PUBLIC;
-- No runtime grant: delivery remains disabled until the provider and reconciliation paths are implemented.
