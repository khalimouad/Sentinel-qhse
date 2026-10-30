ALTER TABLE app.ethics_records DROP CONSTRAINT ethics_decision_consistent;
ALTER TABLE app.ethics_records ADD CONSTRAINT ethics_decision_consistent CHECK(
 (decision IS NULL AND decision_note IS NULL AND decided_by IS NULL AND decided_at IS NULL) OR
 (decision IS NOT NULL AND decision_note IS NOT NULL AND length(btrim(decision_note))>0 AND decided_by IS NOT NULL AND decided_at IS NOT NULL));
