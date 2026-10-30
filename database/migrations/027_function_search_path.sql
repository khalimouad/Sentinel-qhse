-- Fix the search path of functions flagged by the hosted security advisor.
ALTER FUNCTION identity.actor_id() SET search_path = '';
ALTER FUNCTION identity.tenant_id() SET search_path = '';
ALTER FUNCTION app.protect_audit_history() SET search_path = '';
