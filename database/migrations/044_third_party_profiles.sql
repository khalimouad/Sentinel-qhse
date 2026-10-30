ALTER TABLE app.ethics_records ADD COLUMN party_type text NOT NULL DEFAULT 'unspecified' CHECK(party_type IN ('unspecified','supplier','customer','partner','intermediary','other'));
ALTER TABLE app.ethics_records ADD COLUMN registration_number text NOT NULL DEFAULT '' CHECK(length(registration_number)<=200);
ALTER TABLE app.ethics_records ADD COLUMN contact_name text NOT NULL DEFAULT '' CHECK(length(contact_name)<=200);
ALTER TABLE app.ethics_records ADD COLUMN contact_email text NOT NULL DEFAULT '' CHECK(length(contact_email)<=254);
ALTER TABLE app.ethics_records ADD COLUMN business_activity text NOT NULL DEFAULT '' CHECK(length(business_activity)<=2000);
ALTER TABLE app.ethics_records ADD COLUMN ownership_notes text NOT NULL DEFAULT '' CHECK(length(ownership_notes)<=4000);
ALTER TABLE app.ethics_records ADD CONSTRAINT ethics_party_profile_only CHECK(kind='third_party' OR (party_type='unspecified' AND registration_number='' AND contact_name='' AND contact_email='' AND business_activity='' AND ownership_notes=''));
CREATE INDEX ethics_assessment_latest_idx ON app.ethics_records(tenant_id,party_id,created_at DESC,id DESC) WHERE kind='assessment';
GRANT INSERT(party_type,registration_number,contact_name,contact_email,business_activity,ownership_notes),UPDATE(party_type,registration_number,contact_name,contact_email,business_activity,ownership_notes) ON app.ethics_records TO sentinelle_app;
