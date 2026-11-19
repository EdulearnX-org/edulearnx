BEGIN;

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS class_time_slot VARCHAR(5);

ALTER TABLE enrollments
  DROP CONSTRAINT IF EXISTS enrollments_class_time_slot_check;

ALTER TABLE enrollments
  ADD CONSTRAINT enrollments_class_time_slot_check
  CHECK (class_time_slot IS NULL OR class_time_slot IN ('08:00', '14:00', '15:00', '16:00', '17:00'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_student_time_slot
  ON enrollments(student_id, class_time_slot)
  WHERE class_time_slot IS NOT NULL;

INSERT INTO app_migrations(version)
VALUES ('20261116_student_course_slots')
ON CONFLICT DO NOTHING;

COMMIT;
