-- File contents never pass through an application function request body.
-- Signed upload URLs are issued by the app server; public roles have no bucket policy.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('tutor-certificates','tutor-certificates',false,5242880,ARRAY['image/jpeg','image/png','application/pdf'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
