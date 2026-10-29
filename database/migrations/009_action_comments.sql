-- Comments inherit the action's visibility, including private report restrictions.
ALTER TABLE app.actions ADD CONSTRAINT actions_comment_scope UNIQUE(tenant_id,id,site_id);
CREATE TABLE app.action_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, site_id uuid NOT NULL, action_id uuid NOT NULL,
  author_id uuid NOT NULL, body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 4000),
  request_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,action_id,author_id,request_key),
  FOREIGN KEY(tenant_id,action_id,site_id) REFERENCES app.actions(tenant_id,id,site_id),
  FOREIGN KEY(tenant_id,author_id) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE INDEX action_comments_list_idx ON app.action_comments(tenant_id,action_id,created_at DESC,id DESC);
CREATE INDEX action_comments_site_idx ON app.action_comments(tenant_id,site_id);
CREATE INDEX action_comments_author_idx ON app.action_comments(tenant_id,author_id);
ALTER TABLE app.action_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.action_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY action_comments_read ON app.action_comments FOR SELECT USING(
  identity.has_site_access(tenant_id,site_id) AND EXISTS(
    SELECT 1 FROM app.actions a WHERE a.tenant_id=action_comments.tenant_id AND a.id=action_comments.action_id));
CREATE POLICY action_comments_create ON app.action_comments FOR INSERT WITH CHECK(
  identity.can_write_site(tenant_id,site_id) AND author_id=identity.actor_id() AND EXISTS(
    SELECT 1 FROM app.actions a WHERE a.tenant_id=action_comments.tenant_id AND a.id=action_comments.action_id));
CREATE TRIGGER immutable_action_comments BEFORE UPDATE OR DELETE ON app.action_comments
  FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
REVOKE ALL ON app.action_comments FROM PUBLIC,sentinelle_app;
GRANT SELECT ON app.action_comments TO sentinelle_app;
GRANT INSERT(id,tenant_id,site_id,action_id,author_id,body,request_key) ON app.action_comments TO sentinelle_app;
