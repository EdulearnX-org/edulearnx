ALTER TABLE public.enrollment_applications
  ADD COLUMN IF NOT EXISTS class_time_slot VARCHAR(5);

ALTER TABLE public.enrollment_applications
  DROP CONSTRAINT IF EXISTS enrollment_applications_class_time_slot_check;

ALTER TABLE public.enrollment_applications
  ADD CONSTRAINT enrollment_applications_class_time_slot_check
  CHECK (class_time_slot IS NULL OR class_time_slot IN ('08:00', '14:00', '15:00', '16:00', '17:00'));
