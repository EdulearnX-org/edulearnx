# Course Management API Endpoints

All endpoints are prefixed with `/api` and return JSON responses. JSON requests are limited to 1 MB; malformed JSON returns 400 and oversized requests return 413. Resource IDs accept positive integer IDs or UUIDs where supported by the existing schema.

## Authentication

All authenticated endpoints use the HTTP-only app session cookie. Authentication responses contain a public profile in `data`; no session token or password hash is returned.

- `POST /auth/register`: `{ email, password, full_name }`; always creates a student.
- `POST /auth/login`: `{ email, password }`.
- `GET /auth/session`: current active profile, or `200` with `data: null` when signed out (including expired/revoked sessions). Database failures return `503`. Protected endpoints still require a valid session and return `401` when unauthenticated.
- `POST /auth/logout`: revokes the current session.
- `POST /auth/forgot-password`: `{ email }`; requires SMTP configuration.
- `POST /auth/reset-password`: `{ token, password }`; single-use email token, revokes all sessions.
- `POST /auth/change-password`: `{ current_password, password }`; requires a session and rotates it.

Auth mutation bodies use JSON. Administrative mutations require the corresponding feature permission. Users may edit their own safe profile fields through `PUT /users/:id`; role, email, and credentials cannot be changed there.

`GET /instructors` is available to admins with course-management permission. `POST /contact` accepts `{ name, email, subject, message }` and stores the message for support.

## Course Zoom links

- `GET /api/course-zoom-links`: authenticated students receive links for enrolled courses, teachers receive links for assigned courses, and admins with `courses` permission receive all course links. Returns `{ success: true, data: [{ course_id, zoom_link }] }`; links are never included in the public course catalog.
- `PATCH /api/courses/:id/zoom-link`: accepts `{ zoom_link: "https://zoom.us/j/..." }`. Only the assigned teacher or an admin with `courses` permission can save a link. Send `null` or an empty string to remove it. HTTPS links on Zoom domains are supported, including embedded meeting passcodes.
- Apply `server/db/migrations/20261030_course_zoom_link.sql` before deploying to an existing production database. Development startup adds the nullable column automatically.

## Statistics

Homepage totals are available without authentication at `GET /api/public-stats` (`totalStudents`, `totalCourses`, and `totalEnrollments` only). `GET /api/platform-stats` includes administrative metrics and requires an authenticated admin with the `overview` permission.

## Base URL
```
http://127.0.0.1:5173/api
```

---

## Categories

### Get All Categories
```
GET /categories
```
Returns all categories with course counts.

### Get Category by Slug
```
GET /categories/:slug
```

### Create Category
```
POST /categories
Body: { name: string, slug: string, description?: string }
```

### Update Category
```
PUT /categories/:id
Body: { name?: string, slug?: string, description?: string }
```

### Delete Category
```
DELETE /categories/:id
```

### Assign Category to Course
```
POST /course-categories
Body: { course_id: number, category_id: number }
```

### Remove Category from Course
```
DELETE /courses/:course_id/categories/:category_id
```

### Get Categories for Course
```
GET /courses/:course_id/categories
```

---

## Tags

### Get All Tags
```
GET /tags
```
Returns all tags with course counts.

### Get Tag by Slug
```
GET /tags/:slug
```

### Create Tag
```
POST /tags
Body: { name: string, slug: string }
```

### Update Tag
```
PUT /tags/:id
Body: { name?: string, slug?: string }
```

### Delete Tag
```
DELETE /tags/:id
```

### Assign Tag to Course
```
POST /course-tags
Body: { course_id: number, tag_id: number }
```

### Remove Tag from Course
```
DELETE /courses/:course_id/tags/:tag_id
```

### Get Tags for Course
```
GET /courses/:course_id/tags
```

---

## Progress Tracking

### Get Student Progress (All Courses)
```
GET /progress/student/:student_id
Query: ?course_id=123 (optional filter)
```

### Get Course Progress for Student
```
GET /progress/course/:course_id/student/:student_id
```

### Update Lesson Progress
```
PATCH /progress/lesson/:lesson_id/student/:student_id
Body: { is_completed?: boolean, progress_percentage?: number, last_watched_at?: string }
```

### Complete Course
```
POST /progress/complete-course/:course_id/student/:student_id
```

### Get Course Structure (with optional student progress)
```
GET /courses/:course_id/structure
Query: ?student_id=123 (optional)
```

---

## Course Modules

### Create Module
```
POST /modules
Body: { course_id: number, title: string, description?: string, order_index: number }
```

### Update Module
```
PUT /modules/:id
Body: { title?: string, description?: string, order_index?: number }
```

### Delete Module
```
DELETE /modules/:id
```

---

## Course Lessons

### Create Lesson
```
POST /lessons
Body: {
  module_id: number,
  title: string,
  content_type: "video" | "text" | "quiz" | "interactive",
  content_text?: string,
  video_url?: string,
  duration_minutes?: number,
  order_index: number,
  is_preview?: boolean
}
```

### Update Lesson
```
PUT /lessons/:id
Body: {
  title?: string,
  content_type?: "video" | "text" | "quiz" | "interactive",
  content_text?: string,
  video_url?: string,
  duration_minutes?: number,
  order_index?: number,
  is_preview?: boolean
}
```

### Delete Lesson
```
DELETE /lessons/:id
```

---

## Existing Endpoints

### Courses
- `GET /courses` - Public published catalog; authenticated portal users also receive drafts they are authorized to access
- `GET /courses/:id` - Get a visible course by ID; inaccessible drafts return 404
- `POST /courses` - Create course; `price_cents` is required and must be a non-negative integer
- `PUT /courses/:id` - Patch supplied fields, including `price_cents`; omitted values stay unchanged, nullable optional fields accept explicit `null`, and dates are validated against the resulting record
- `DELETE /courses/:id` - Delete course

### Enrollments
- `GET /enrollments` - Get enrollments (query: ?student_id=123 or ?course_id=456)
- `POST /enrollments` - Enroll student (body: { student_id, course_id })

### Users
- `GET /users` - Get all users
- `GET /users/:id` - Get user by ID
- `POST /users` - Create user
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user

### Auth
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/logout` - Logout user
- `GET /auth/session` - Get current user

---

## Response Format

All responses follow this format:
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... }
}
```

Error responses:
```json
{
  "success": false,
  "error": "Error message here"
}
```

---

## Database Schema

The system uses PostgreSQL (Neon) with the following main tables:
- `users` - User accounts
- `courses` - Course information
- `categories` - Course categories
- `tags` - Course tags
- `course_categories` - Many-to-many relationship
- `course_tags` - Many-to-many relationship
- `course_modules` - Course sections/modules
- `course_lessons` - Individual lessons
- `enrollments` - Student enrollments
- `lesson_progress` - Per-lesson progress tracking
- `enrollment_requests` - Pending enrollment approvals

## Uploads and enrollment applications

- `POST /uploads`: `{ purpose: "receipt" | "certificate", content_type, byte_size }`. Returns `data: { upload_id, upload_token, upload_url }`. Upload the raw file bytes with `PUT upload_url` and the matching `Content-Type`; do not base64-encode file contents into application JSON. Files are 1 byte to 5 MB. Receipts accept JPEG, PNG, WebP, or PDF and require an authenticated student. Certificates accept JPEG, PNG, or PDF. Tokens are single-use when submitting an application; abandoned uploads expire and are cleaned by maintenance.
- `POST /enrollment-requests`: authenticated student submits `{ course_id, student_phone, sender_account_title, sender_account_number, transfer_reference?, receipt: { upload_id, upload_token } }`. The course must be published. Submission creates a pending manual approval application; it does not confirm payment or enrollment.
- `GET /enrollment-requests/:id/status`: authenticated student can read only their own application's verified status.
- `GET /enrollment-requests?page=1&limit=25`: authorized `enrollmentRequests` administrator queue; `limit` is at most 100.
- `GET /enrollment-requests/:id/receipt`: authorized administrator obtains a signed receipt URL valid for 120 seconds.
- `PATCH /enrollment-requests/:id`: authorized administrator reviews the application with `{ status: "approved" | "rejected" }`.
- `GET /tutor-applications?page=1&limit=25`: authorized `tutorApplications` administrator queue. Certificate contents are omitted from list responses.
- `GET /tutor-applications/:id/certificates/:slot`: authorized administrator obtains a signed certificate URL; `slot` is 1, 2, or 3.

## Atomic class scheduling

`POST /live-classes/batch` accepts `{ request_id, course_id, teacher_id?, title, description?, sessions }`, where `request_id` is a UUID and `sessions` contains exactly five `{ scheduled_start, scheduled_end }` records. Dates must include an offset or `Z`. The server validates teacher assignment and every date window, then saves all classes in one transaction. Retrying the same request ID with the same payload returns its original classes; reusing the ID with different details returns 409. Generate a new request ID only for a new schedule.

`GET /live-classes?teacher_id=...` applies the teacher filter within the caller's existing authorization. Administrators can filter teachers; teachers and students retain their existing visibility restrictions. Starting a class persists completion of expired classes and closes their attendance before enforcing the one-active-class constraint.

## Readiness and maintenance

- `GET /health` and `GET /health-db`: return 503 until required database columns and migration `20261031_audit_repairs` are present.
- `GET /internal/maintenance`: requires the configured `CRON_SECRET` as a bearer token and processes durable cleanup queues. Schedule this independently of visitor traffic.
- `/keep-alive` has been removed; visitors no longer warm the database periodically.

Bundle and promo-code management endpoints do not redeem discounts at checkout. Revenue reporting and a lesson-player interface remain unimplemented capabilities.
