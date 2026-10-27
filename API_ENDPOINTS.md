# Course Management API Endpoints

All endpoints are prefixed with `/api` and return JSON responses.

## Authentication

All authenticated endpoints use the HTTP-only app session cookie. Authentication responses contain a public profile in `data`; no session token or password hash is returned.

- `POST /auth/register`: `{ email, password, full_name }`; always creates a student.
- `POST /auth/login`: `{ email, password }`.
- `GET /auth/session`: current active profile, or 401.
- `POST /auth/logout`: revokes the current session.
- `POST /auth/forgot-password`: `{ email }`; requires SMTP configuration.
- `POST /auth/reset-password`: `{ token, password }`; single-use email token, revokes all sessions.
- `POST /auth/change-password`: `{ current_password, password }`; requires a session and rotates it.

Auth mutation bodies use JSON. Administrative mutations require the corresponding feature permission. Users may edit their own safe profile fields through `PUT /users/:id`; role, email, and credentials cannot be changed there.

`GET /instructors` is available to admins with course-management permission. `POST /contact` accepts `{ name, email, subject, message }` and stores the message for support.

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
- `GET /courses` - Get all courses
- `GET /courses/:id` - Get course by ID
- `POST /courses` - Create course
- `PUT /courses/:id` - Update course
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
- `GET /auth/me` - Get current user

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
