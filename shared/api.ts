/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

// User types
export interface User {
  id: number | string;
  email: string;
  full_name: string;
  role: "admin" | "teacher" | "student";
  profile_image_url?: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRegisterRequest {
  email: string;
  password: string;
  full_name: string;
  role: "admin" | "teacher" | "student";
  phone?: string;
}

export interface UserLoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: User;
  token?: string;
}

// Course types
export interface Course {
  id: number | string;
  title: string;
  description?: string;
  instructor_id: number | string | null;
  instructor_name?: string;
  category?: string;
  duration_weeks?: number;
  start_date?: string;
  end_date?: string;
  thumbnail_url?: string;
  meeting_id?: string;
  is_published: boolean;
  enrollment_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCourseRequest {
  title: string;
  description?: string;
  category?: string;
  duration_weeks?: number;
  start_date?: string;
  end_date?: string;
  thumbnail_url?: string;
}

export interface UpdateCourseRequest {
  title?: string;
  description?: string;
  category?: string;
  duration_weeks?: number;
  start_date?: string;
  end_date?: string;
  is_published?: boolean;
  thumbnail_url?: string;
}

// Category types
export interface Category {
  id: number;
  name: string;
  description?: string;
  slug: string;
  created_at: string;
}

export interface CreateCategoryRequest {
  name: string;
  description?: string;
  slug: string;
}

// Tag types
export interface Tag {
  id: number;
  name: string;
  slug: string;
  created_at: string;
}

export interface CreateTagRequest {
  name: string;
  slug: string;
}

// Course Module types
export interface CourseModule {
  id: number;
  course_id: number | string;
  title: string;
  description?: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface CreateModuleRequest {
  course_id: number | string;
  title: string;
  description?: string;
  order_index: number;
}

// Lesson types
export interface Lesson {
  id: number;
  module_id: number;
  title: string;
  content_type: "video" | "text" | "quiz" | "interactive";
  content_text?: string;
  video_url?: string;
  duration_minutes?: number;
  order_index: number;
  is_preview: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateLessonRequest {
  module_id: number;
  title: string;
  content_type: "video" | "text" | "quiz" | "interactive";
  content_text?: string;
  video_url?: string;
  duration_minutes?: number;
  order_index: number;
  is_preview?: boolean;
}

// Lesson Progress types
export interface LessonProgress {
  id: number;
  student_id: number | string;
  lesson_id: number;
  is_completed: boolean;
  progress_percentage: number;
  last_watched_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateLessonProgressRequest {
  is_completed?: boolean;
  progress_percentage?: number;
  last_watched_at?: string;
}

// Enrollment types
export interface Enrollment {
  id: number;
  student_id: number | string;
  course_id: number | string;
  progress_percentage: number;
  is_completed: boolean;
  enrolled_at: string;
  completed_at?: string;
}

// Assignment types
export interface Assignment {
  id: number;
  course_id: number | string;
  title: string;
  description?: string;
  due_date?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface LiveClass {
  id: number;
  course_id: number | string;
  teacher_id: number | string | null;
  title: string;
  description?: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: "scheduled" | "active" | "cancelled" | "completed";
  room_id: string;
  meeting_id?: string;
  started_at?: string | null;
  ended_at?: string | null;
  course_title?: string;
  teacher_name?: string | null;
  can_join?: boolean;
  join_opens_at?: string;
  has_ended?: boolean;
  created_at: string;
  updated_at: string;
}

export interface LiveClassAttendance {
  id: number;
  live_class_id: number;
  user_id: number | string;
  role: "admin" | "teacher" | "student";
  joined_at: string;
  left_at?: string | null;
  duration_seconds: number;
}

export interface LiveClassJoinResponse {
  live_class: LiveClass;
  attendance: LiveClassAttendance;
  participants: Array<{
    user_id: number | string;
    full_name: string;
    role: "admin" | "teacher" | "student";
  }>;
  room: {
    room_id: string;
    meeting_id?: string;
    signaling_url: string;
  };
}

export interface StudentRewards {
  totalCoins: number;
  classCoins: number;
  bonusCoins: number;
  attendedClasses: number;
  completedWeeks: number;
  coinsPerClass: number;
  fullWeekBonus: number;
}

// API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}
