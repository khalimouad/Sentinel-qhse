CREATE FUNCTION identity.platform_invitation_cancel(company_id uuid, invitation_id uuid, reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE record identity.platform_invitations;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF reason IS NULL OR length(btrim(reason)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'A reason is required' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM app.tenants WHERE id=company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO record FROM identity.platform_invitations WHERE tenant_id=company_id AND id=invitation_id FOR UPDATE;
 IF record.id IS NULL THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE='P0002'; END IF;
 IF record.status<>'pending' THEN RAISE EXCEPTION 'Invitation is no longer pending' USING ERRCODE='40001'; END IF;
 UPDATE identity.platform_invitations SET status='cancelled',cancelled_at=clock_timestamp() WHERE tenant_id=company_id AND id=invitation_id RETURNING * INTO record;
 INSERT INTO identity.platform_events(actor_id,tenant_id,operation,note,after_data) VALUES(identity.actor_id(),company_id,'invitation_cancel',reason,to_jsonb(record)-'email'-'idempotency_key');
 RETURN jsonb_build_object('id',record.id,'status',record.status,'cancelledAt',record.cancelled_at);
END $$;
REVOKE ALL ON FUNCTION identity.platform_invitation_cancel(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.platform_invitation_cancel(uuid,uuid,text) TO sentinelle_app;
