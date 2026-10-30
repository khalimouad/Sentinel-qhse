-- First operational registers: linked third-party assessments, gifts and conflicts.
CREATE TABLE app.ethics_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,site_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('third_party','assessment','gift','conflict')),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 300),description text NOT NULL DEFAULT '' CHECK(length(description)<=6000),
 country text NOT NULL DEFAULT '' CHECK(length(country)<=80),party_id uuid,
 risk text NOT NULL DEFAULT 'unassessed' CHECK(risk IN ('unassessed','low','medium','high')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','closed')),
 amount numeric(14,2),currency text CHECK(currency IN ('EUR','XOF','XAF','MAD','USD','GBP')),
 occurred_on date,review_on date,owner_id uuid NOT NULL,created_by uuid NOT NULL,
 revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id,site_id), FOREIGN KEY(tenant_id,site_id) REFERENCES app.sites(tenant_id,id),
 FOREIGN KEY(tenant_id,party_id,site_id) REFERENCES app.ethics_records(tenant_id,id,site_id),
 FOREIGN KEY(tenant_id,owner_id) REFERENCES identity.memberships(tenant_id,user_id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES identity.memberships(tenant_id,user_id),
 CHECK((kind='assessment' AND party_id IS NOT NULL) OR (kind<>'assessment' AND party_id IS NULL)),
 CHECK(amount IS NULL OR (amount>=0 AND currency IS NOT NULL))
);
CREATE INDEX ethics_records_list_idx ON app.ethics_records(tenant_id,site_id,kind,created_at DESC,id DESC);
CREATE INDEX ethics_records_party_idx ON app.ethics_records(tenant_id,party_id,site_id);
CREATE INDEX ethics_records_owner_idx ON app.ethics_records(tenant_id,owner_id);
CREATE INDEX ethics_records_creator_idx ON app.ethics_records(tenant_id,created_by);
CREATE TABLE app.ethics_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,site_id uuid NOT NULL,record_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES identity.users(id),
 operation text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),before_data jsonb,after_data jsonb NOT NULL,
 FOREIGN KEY(tenant_id,record_id,site_id) REFERENCES app.ethics_records(tenant_id,id,site_id)
);
CREATE INDEX ethics_events_record_idx ON app.ethics_events(tenant_id,record_id,occurred_at DESC);
CREATE INDEX ethics_events_actor_idx ON app.ethics_events(actor_id);
ALTER TABLE app.ethics_records ENABLE ROW LEVEL SECURITY; ALTER TABLE app.ethics_records FORCE ROW LEVEL SECURITY;
ALTER TABLE app.ethics_events ENABLE ROW LEVEL SECURITY; ALTER TABLE app.ethics_events FORCE ROW LEVEL SECURITY;
CREATE POLICY ethics_read ON app.ethics_records FOR SELECT USING(identity.can_write_site(tenant_id,site_id));
CREATE POLICY ethics_insert ON app.ethics_records FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id) AND created_by=identity.actor_id());
CREATE POLICY ethics_update ON app.ethics_records FOR UPDATE USING(identity.can_write_site(tenant_id,site_id)) WITH CHECK(identity.can_write_site(tenant_id,site_id));
CREATE POLICY ethics_event_read ON app.ethics_events FOR SELECT USING(identity.can_write_site(tenant_id,site_id));
CREATE POLICY ethics_event_insert ON app.ethics_events FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id));
CREATE FUNCTION app.guard_ethics_record() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.owner_id) THEN RAISE EXCEPTION 'Owner not eligible' USING ERRCODE='23514'; END IF;
 IF NEW.kind='assessment' AND NOT EXISTS(SELECT 1 FROM app.ethics_records p WHERE p.tenant_id=NEW.tenant_id AND p.site_id=NEW.site_id AND p.id=NEW.party_id AND p.kind='third_party') THEN RAISE EXCEPTION 'Third party not found' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN NEW.revision:=OLD.revision+1;NEW.updated_at:=clock_timestamp(); END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION app.record_ethics_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO app.ethics_events(tenant_id,site_id,record_id,actor_id,operation,before_data,after_data) VALUES(NEW.tenant_id,NEW.site_id,NEW.id,identity.actor_id(),TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));RETURN NEW;
END $$;
CREATE TRIGGER ethics_guard BEFORE INSERT OR UPDATE ON app.ethics_records FOR EACH ROW EXECUTE FUNCTION app.guard_ethics_record();
CREATE TRIGGER ethics_history AFTER INSERT OR UPDATE ON app.ethics_records FOR EACH ROW EXECUTE FUNCTION app.record_ethics_event();
CREATE TRIGGER ethics_events_immutable BEFORE UPDATE OR DELETE ON app.ethics_events FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
REVOKE ALL ON app.ethics_records,app.ethics_events FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION app.guard_ethics_record(),app.record_ethics_event() FROM PUBLIC;
GRANT SELECT ON app.ethics_records,app.ethics_events TO sentinelle_app;
GRANT INSERT(id,tenant_id,site_id,kind,title,description,country,party_id,risk,amount,currency,occurred_on,review_on,owner_id,created_by) ON app.ethics_records TO sentinelle_app;
GRANT UPDATE(status,risk,description,review_on) ON app.ethics_records TO sentinelle_app;
