-- Updating the declared amount invalidates any earlier decision in the application transaction.
GRANT UPDATE(amount,currency) ON app.ethics_records TO sentinelle_app;
