CREATE TABLE app.processes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,site_id uuid NOT NULL,
 code text NOT NULL CHECK(length(btrim(code)) BETWEEN 1 AND 50),title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 300),
 category text NOT NULL CHECK(category IN ('management','operational','support')),purpose text NOT NULL DEFAULT '' CHECK(length(purpose)<=4000),
 inputs text NOT NULL DEFAULT '' CHECK(length(inputs)<=4000),outputs text NOT NULL DEFAULT '' CHECK(length(outputs)<=4000),
 owner_id uuid NOT NULL,created_by uuid NOT NULL,status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id,site_id),UNIQUE(tenant_id,site_id,code),FOREIGN KEY(tenant_id,site_id) REFERENCES app.sites(tenant_id,id),
 FOREIGN KEY(tenant_id,owner_id) REFERENCES identity.memberships(tenant_id,user_id),FOREIGN KEY(tenant_id,created_by) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE INDEX processes_list_idx ON app.processes(tenant_id,site_id,status,created_at DESC,id DESC);
CREATE INDEX processes_owner_idx ON app.processes(tenant_id,owner_id);
CREATE INDEX processes_creator_idx ON app.processes(tenant_id,created_by);
CREATE TABLE app.process_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,site_id uuid NOT NULL,process_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES identity.users(id),
 operation text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),before_data jsonb,after_data jsonb NOT NULL,
 FOREIGN KEY(tenant_id,process_id,site_id) REFERENCES app.processes(tenant_id,id,site_id)
);
CREATE INDEX process_events_parent_idx ON app.process_events(tenant_id,process_id,occurred_at DESC,id DESC);
CREATE INDEX process_events_actor_idx ON app.process_events(actor_id);
CREATE TABLE app.process_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,site_id uuid NOT NULL,process_id uuid NOT NULL,
 risk_id uuid,document_id uuid,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(num_nonnulls(risk_id,document_id)=1),FOREIGN KEY(tenant_id,process_id,site_id) REFERENCES app.processes(tenant_id,id,site_id),
 FOREIGN KEY(tenant_id,risk_id,site_id) REFERENCES app.risks(tenant_id,id,site_id),FOREIGN KEY(tenant_id,document_id,site_id) REFERENCES app.documents(tenant_id,id,site_id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE UNIQUE INDEX process_link_risk_unique ON app.process_links(tenant_id,process_id,risk_id) WHERE risk_id IS NOT NULL;
CREATE UNIQUE INDEX process_link_document_unique ON app.process_links(tenant_id,process_id,document_id) WHERE document_id IS NOT NULL;
CREATE INDEX process_links_site_idx ON app.process_links(tenant_id,site_id);
CREATE INDEX process_links_risk_idx ON app.process_links(tenant_id,risk_id,site_id);
CREATE INDEX process_links_document_idx ON app.process_links(tenant_id,document_id,site_id);
CREATE INDEX process_links_actor_idx ON app.process_links(tenant_id,created_by);
ALTER TABLE app.processes ENABLE ROW LEVEL SECURITY;ALTER TABLE app.processes FORCE ROW LEVEL SECURITY;
ALTER TABLE app.process_events ENABLE ROW LEVEL SECURITY;ALTER TABLE app.process_events FORCE ROW LEVEL SECURITY;
ALTER TABLE app.process_links ENABLE ROW LEVEL SECURITY;ALTER TABLE app.process_links FORCE ROW LEVEL SECURITY;
CREATE POLICY process_read ON app.processes FOR SELECT USING(identity.can_write_site(tenant_id,site_id));
CREATE POLICY process_insert ON app.processes FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id) AND created_by=identity.actor_id());
CREATE POLICY process_update ON app.processes FOR UPDATE USING(identity.can_write_site(tenant_id,site_id)) WITH CHECK(identity.can_write_site(tenant_id,site_id));
CREATE POLICY process_event_read ON app.process_events FOR SELECT USING(identity.can_write_site(tenant_id,site_id));
CREATE POLICY process_event_insert ON app.process_events FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id));
CREATE POLICY process_link_read ON app.process_links FOR SELECT USING(identity.can_write_site(tenant_id,site_id) AND EXISTS(SELECT 1 FROM app.processes p WHERE p.tenant_id=process_links.tenant_id AND p.id=process_links.process_id) AND (risk_id IS NULL OR EXISTS(SELECT 1 FROM app.risks r WHERE r.tenant_id=process_links.tenant_id AND r.id=process_links.risk_id)) AND (document_id IS NULL OR EXISTS(SELECT 1 FROM app.documents d WHERE d.tenant_id=process_links.tenant_id AND d.id=process_links.document_id)));
CREATE POLICY process_link_insert ON app.process_links FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id) AND created_by=identity.actor_id() AND EXISTS(SELECT 1 FROM app.processes p WHERE p.tenant_id=process_links.tenant_id AND p.id=process_links.process_id AND p.status='active') AND (risk_id IS NULL OR EXISTS(SELECT 1 FROM app.risks r WHERE r.tenant_id=process_links.tenant_id AND r.id=process_links.risk_id)) AND (document_id IS NULL OR EXISTS(SELECT 1 FROM app.documents d WHERE d.tenant_id=process_links.tenant_id AND d.id=process_links.document_id)));
CREATE FUNCTION app.guard_process() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.owner_id) THEN RAISE EXCEPTION 'Process owner not eligible' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN NEW.revision:=OLD.revision+1;NEW.updated_at:=clock_timestamp(); END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION app.record_process_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO app.process_events(tenant_id,site_id,process_id,actor_id,operation,before_data,after_data) VALUES(NEW.tenant_id,NEW.site_id,NEW.id,identity.actor_id(),TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));RETURN NEW;
END $$;
CREATE TRIGGER process_guard BEFORE INSERT OR UPDATE ON app.processes FOR EACH ROW EXECUTE FUNCTION app.guard_process();
CREATE TRIGGER process_history AFTER INSERT OR UPDATE ON app.processes FOR EACH ROW EXECUTE FUNCTION app.record_process_event();
CREATE TRIGGER process_event_immutable BEFORE UPDATE OR DELETE ON app.process_events FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
CREATE TRIGGER process_link_immutable BEFORE UPDATE OR DELETE ON app.process_links FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
REVOKE ALL ON app.processes,app.process_events,app.process_links FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION app.guard_process(),app.record_process_event() FROM PUBLIC;
GRANT SELECT ON app.processes,app.process_events,app.process_links TO sentinelle_app;
GRANT INSERT(id,tenant_id,site_id,code,title,category,purpose,inputs,outputs,owner_id,created_by) ON app.processes TO sentinelle_app;
GRANT UPDATE(title,category,purpose,inputs,outputs,owner_id,status) ON app.processes TO sentinelle_app;
GRANT INSERT(id,tenant_id,site_id,process_id,risk_id,document_id,created_by) ON app.process_links TO sentinelle_app;
