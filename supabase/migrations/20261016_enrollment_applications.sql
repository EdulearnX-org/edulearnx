CREATE TABLE IF NOT EXISTS public.enrollment_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_email TEXT NOT NULL,
  student_phone TEXT NOT NULL,
  course_id TEXT NOT NULL,
  course_title TEXT NOT NULL,
  transfer_reference VARCHAR(255),
  sender_account_title VARCHAR(255) NOT NULL,
  sender_account_number VARCHAR(255) NOT NULL,
  receipt_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  submission_state TEXT NOT NULL DEFAULT 'uploading'
    CHECK (submission_state IN ('uploading', 'complete', 'failed')),
  cleanup_status TEXT NOT NULL DEFAULT 'none'
    CHECK (cleanup_status IN ('none', 'queued', 'cleaning', 'failed', 'complete')),
  cleanup_attempts INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_attempts >= 0),
  cleanup_error TEXT,
  next_cleanup_at TIMESTAMPTZ,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

CREATE INDEX IF NOT EXISTS enrollment_applications_status_requested_idx
  ON public.enrollment_applications (status, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS enrollment_applications_one_pending_per_course_idx
  ON public.enrollment_applications (student_id, course_id)
  WHERE status = 'pending' AND submission_state = 'complete';
CREATE INDEX IF NOT EXISTS enrollment_applications_cleanup_idx
  ON public.enrollment_applications (cleanup_status, next_cleanup_at)
  WHERE cleanup_status IN ('queued', 'failed', 'cleaning');

ALTER TABLE public.enrollment_applications ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.enrollment_applications TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-receipts',
  'payment-receipts',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
