ALTER TABLE app.ethics_records DROP CONSTRAINT ethics_records_check;
ALTER TABLE app.ethics_records ADD CONSTRAINT ethics_records_party_kind CHECK(
 (kind='assessment' AND party_id IS NOT NULL) OR (kind IN ('gift','conflict','donation')) OR (kind IN ('third_party','control') AND party_id IS NULL));
CREATE OR REPLACE FUNCTION app.guard_ethics_record() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.owner_id) THEN RAISE EXCEPTION 'Owner not eligible' USING ERRCODE='23514'; END IF;
 IF NEW.party_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.ethics_records p WHERE p.tenant_id=NEW.tenant_id AND p.site_id=NEW.site_id AND p.id=NEW.party_id AND p.kind='third_party') THEN RAISE EXCEPTION 'Third party not found' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN NEW.revision:=OLD.revision+1;NEW.updated_at:=clock_timestamp(); END IF;
 RETURN NEW;
END $$;
