CREATE OR REPLACE FUNCTION identity.platform_history(company_id uuid,search_text text,operation_filter text,page_limit integer,page_offset integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT identity.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.tenants WHERE id=company_id) THEN RAISE EXCEPTION 'Company not found' USING ERRCODE='P0002'; END IF;
 IF page_limit IS NULL OR page_limit NOT BETWEEN 1 AND 100 OR page_offset IS NULL OR page_offset NOT BETWEEN 0 AND 100000
  OR operation_filter IS NULL OR operation_filter NOT IN ('all','company','site','account','access','company_metadata','site_metadata','invitation_request','invitation_cancel','invitation_delivery_started','invitation_delivery_result','invitation_reconcile','invitation_linked')
  OR search_text IS NULL OR length(search_text)>200 THEN RAISE EXCEPTION 'Invalid history filters' USING ERRCODE='23514'; END IF;
 WITH filtered AS MATERIALIZED (
  SELECT e.id,e.operation,e.note,e.occurred_at AS "occurredAt",u.name AS "actorName"
  FROM identity.platform_events e JOIN identity.users u ON u.id=e.actor_id WHERE e.tenant_id=company_id
   AND (operation_filter='all' OR e.operation=operation_filter) AND strpos(lower(e.note||' '||u.name),lower(search_text))>0
 ),page AS (SELECT * FROM filtered ORDER BY "occurredAt" DESC,id DESC LIMIT page_limit OFFSET page_offset)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'items',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('before',e.before_data,'after',e.after_data) ORDER BY p."occurredAt" DESC,p.id DESC) FROM page p JOIN identity.platform_events e ON e.id=p.id),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
