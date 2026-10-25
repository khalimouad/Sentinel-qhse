-- Local development only. Provision production identities outside this file.
CREATE ROLE sentinelle_app LOGIN PASSWORD 'sentinelle-local-only' NOSUPERUSER NOBYPASSRLS;
