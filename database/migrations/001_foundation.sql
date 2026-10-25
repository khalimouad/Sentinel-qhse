-- Run as the migration owner. The API must use sentinelle_app, never this owner.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sentinelle_app') THEN
    CREATE ROLE sentinelle_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
CREATE SCHEMA identity;
CREATE SCHEMA app;
REVOKE ALL ON SCHEMA identity, app FROM PUBLIC;
GRANT USAGE ON SCHEMA identity, app TO sentinelle_app;

CREATE TABLE app.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  region text NOT NULL,
  jurisdictions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE identity.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL, subject text NOT NULL, name text NOT NULL,
  UNIQUE (issuer, subject)
);
CREATE TABLE identity.memberships (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  user_id uuid NOT NULL REFERENCES identity.users(id),
  role text NOT NULL CHECK (role IN ('admin', 'manager', 'reader')),
  all_sites boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX memberships_user_idx ON identity.memberships (user_id, tenant_id);
CREATE TABLE app.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, name)
);
CREATE TABLE identity.site_grants (
  tenant_id uuid NOT NULL, user_id uuid NOT NULL, site_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, user_id, site_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES identity.memberships(tenant_id, user_id),
  FOREIGN KEY (tenant_id, site_id) REFERENCES app.sites(tenant_id, id)
);
CREATE INDEX site_grants_site_idx ON identity.site_grants (tenant_id, site_id);

CREATE FUNCTION identity.actor_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.actor_id', true), '')::uuid
$$;
CREATE FUNCTION identity.tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;
-- The API invokes this only after cryptographic OIDC verification. Identity and
-- grants have no direct table privileges for the runtime role.
CREATE FUNCTION identity.resolve_actor(issuer text, subject text)
RETURNS TABLE(id uuid, name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.id, u.name FROM identity.users u WHERE u.issuer = $1 AND u.subject = $2
$$;
CREATE FUNCTION identity.is_member(target_tenant uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM identity.memberships m
    WHERE m.tenant_id = $1 AND m.user_id = identity.actor_id())
$$;
CREATE FUNCTION identity.current_role(target_tenant uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.role FROM identity.memberships m
    WHERE m.tenant_id = $1 AND m.user_id = identity.actor_id()
$$;
CREATE FUNCTION identity.has_site_access(target_tenant uuid, target_site uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT $1 = identity.tenant_id() AND EXISTS (
    SELECT 1 FROM identity.memberships m WHERE m.tenant_id = $1 AND m.user_id = identity.actor_id()
      AND (m.all_sites OR EXISTS (SELECT 1 FROM identity.site_grants g
        WHERE g.tenant_id = m.tenant_id AND g.user_id = m.user_id AND g.site_id = $2)))
$$;
CREATE FUNCTION identity.can_write_site(target_tenant uuid, target_site uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT identity.has_site_access($1, $2) AND identity.current_role($1) IN ('admin', 'manager')
$$;
CREATE FUNCTION identity.can_assign_site(target_tenant uuid, target_site uuid, target_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT identity.has_site_access($1, $2) AND EXISTS (
    SELECT 1 FROM identity.memberships m WHERE m.tenant_id = $1 AND m.user_id = $3
      AND (m.all_sites OR EXISTS (SELECT 1 FROM identity.site_grants g
        WHERE g.tenant_id = $1 AND g.user_id = $3 AND g.site_id = $2)))
$$;
CREATE FUNCTION identity.list_members(target_tenant uuid) RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.id, u.name FROM identity.users u JOIN identity.memberships m ON m.user_id = u.id
  WHERE m.tenant_id = $1 AND $1 = identity.tenant_id() AND identity.is_member($1)
  ORDER BY u.name
$$;

CREATE TABLE app.actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  site_id uuid NOT NULL, owner_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 500),
  origin text NOT NULL DEFAULT 'Saisie manuelle' CHECK (length(origin) BETWEEN 1 AND 200),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  due_date date, version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, site_id) REFERENCES app.sites(tenant_id, id),
  FOREIGN KEY (tenant_id, owner_id) REFERENCES identity.memberships(tenant_id, user_id)
);
CREATE INDEX actions_list_idx ON app.actions (tenant_id, created_at DESC, id);
CREATE INDEX actions_site_idx ON app.actions (tenant_id, site_id, status);
CREATE INDEX actions_owner_idx ON app.actions (tenant_id, owner_id);
CREATE TABLE app.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id), site_id uuid NOT NULL,
  action_id uuid NOT NULL REFERENCES app.actions(id), actor_id uuid NOT NULL REFERENCES identity.users(id),
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  before_data jsonb, after_data jsonb NOT NULL,
  FOREIGN KEY (tenant_id, site_id) REFERENCES app.sites(tenant_id, id)
);
CREATE INDEX audit_action_idx ON app.audit_events (tenant_id, action_id, occurred_at DESC);
CREATE INDEX audit_site_idx ON app.audit_events (tenant_id, site_id);
CREATE INDEX audit_actor_idx ON app.audit_events (actor_id);

ALTER TABLE app.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_read ON app.tenants FOR SELECT USING (identity.is_member(id));
ALTER TABLE app.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sites FORCE ROW LEVEL SECURITY;
CREATE POLICY sites_read ON app.sites FOR SELECT USING (identity.has_site_access(tenant_id, id));
ALTER TABLE app.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.actions FORCE ROW LEVEL SECURITY;
CREATE POLICY actions_read ON app.actions FOR SELECT USING (identity.has_site_access(tenant_id, site_id));
CREATE POLICY actions_create ON app.actions FOR INSERT WITH CHECK (
  identity.can_write_site(tenant_id, site_id) AND identity.can_assign_site(tenant_id, site_id, owner_id));
CREATE POLICY actions_update ON app.actions FOR UPDATE USING (identity.can_write_site(tenant_id, site_id))
  WITH CHECK (identity.can_write_site(tenant_id, site_id) AND identity.can_assign_site(tenant_id, site_id, owner_id));
ALTER TABLE app.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON app.audit_events FOR SELECT USING (identity.has_site_access(tenant_id, site_id));
-- Only the trigger owner has INSERT privileges. The application role cannot append manually.
CREATE POLICY audit_append ON app.audit_events FOR INSERT WITH CHECK (identity.can_write_site(tenant_id, site_id));

-- Explicit owner-only provisioning policies allow a non-superuser migration
-- owner to maintain organizations/sites despite FORCE RLS. Never grant this
-- owner role to the application role.
DO $$ BEGIN
  EXECUTE format('CREATE POLICY tenants_provision ON app.tenants FOR ALL TO %I USING (true) WITH CHECK (true)',current_user);
  EXECUTE format('CREATE POLICY sites_provision ON app.sites FOR ALL TO %I USING (true) WITH CHECK (true)',current_user);
END $$;

CREATE FUNCTION app.record_action_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO app.audit_events (tenant_id, site_id, action_id, actor_id, operation, before_data, after_data)
  VALUES (NEW.tenant_id, NEW.site_id, NEW.id, identity.actor_id(), TG_OP,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW));
  RETURN NEW;
END $$;
CREATE TRIGGER actions_audit AFTER INSERT OR UPDATE ON app.actions
FOR EACH ROW EXECUTE FUNCTION app.record_action_change();
CREATE FUNCTION app.protect_audit_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit events cannot be changed or deleted'; END $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON app.audit_events
FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();

REVOKE ALL ON ALL TABLES IN SCHEMA app, identity FROM PUBLIC, sentinelle_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA identity, app FROM PUBLIC;
GRANT SELECT ON app.tenants, app.sites, app.actions, app.audit_events TO sentinelle_app;
GRANT INSERT (id, tenant_id, site_id, owner_id, title, origin, priority, due_date) ON app.actions TO sentinelle_app;
GRANT UPDATE (status, version, updated_at) ON app.actions TO sentinelle_app;
GRANT EXECUTE ON FUNCTION identity.actor_id(), identity.tenant_id(), identity.resolve_actor(text,text),
  identity.is_member(uuid), identity.current_role(uuid), identity.has_site_access(uuid,uuid),
  identity.can_write_site(uuid,uuid), identity.can_assign_site(uuid,uuid,uuid), identity.list_members(uuid)
TO sentinelle_app;
