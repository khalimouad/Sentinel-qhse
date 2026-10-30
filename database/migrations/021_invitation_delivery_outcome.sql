-- This owner-only function is intentionally not granted to the API runtime.
-- A future trusted delivery worker must verify the provider result before use.
CREATE FUNCTION identity.platform_invitation_record_outcome(company_id uuid, invitation_id uuid, attempt_id uuid, outcome text, provider_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation identity.platform_invitations;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF outcome IS NULL OR outcome NOT IN ('uncertain','sent') OR (outcome='sent' AND provider_user IS NULL) OR (outcome='uncertain' AND provider_user IS NOT NULL) THEN
  RAISE EXCEPTION 'Invalid delivery outcome' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM app.tenants WHERE id=company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO invitation FROM identity.platform_invitations WHERE tenant_id=company_id AND id=invitation_id FOR UPDATE;
 IF invitation.id IS NULL THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE='P0002'; END IF;
 IF invitation.status<>'sending' OR invitation.delivery_attempt_id IS DISTINCT FROM attempt_id THEN RAISE EXCEPTION 'Delivery attempt changed' USING ERRCODE='40001'; END IF;
 UPDATE identity.platform_invitations SET status=outcome,provider_subject=provider_user,delivered_at=CASE WHEN outcome='sent' THEN clock_timestamp() ELSE NULL END
  WHERE tenant_id=company_id AND id=invitation_id RETURNING * INTO invitation;
 INSERT INTO identity.platform_events(actor_id,tenant_id,operation,note,after_data)
 VALUES(identity.actor_id(),company_id,'invitation_delivery_result',CASE WHEN outcome='sent' THEN 'Envoi confirmé par le fournisseur' ELSE 'Résultat d’envoi incertain' END,to_jsonb(invitation)-'email'-'idempotency_key');
 RETURN jsonb_build_object('id',invitation.id,'status',invitation.status,'attemptId',invitation.delivery_attempt_id);
END $$;
REVOKE ALL ON FUNCTION identity.platform_invitation_record_outcome(uuid,uuid,uuid,text,uuid) FROM PUBLIC,sentinelle_app;
