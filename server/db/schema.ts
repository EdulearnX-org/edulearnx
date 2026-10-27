import { isDatabaseConfigured, query } from "./connection.js";

async function getColumnType(
  tableName: string,
  columnName: string,
  fallback: string,
) {
  const result = await query(
    `
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    `,
    [tableName, columnName],
  );

  if (result.rows.length === 0) {
    return fallback;
  }

  const { data_type, udt_name } = result.rows[0];
  return data_type === "USER-DEFINED" ? String(udt_name).toUpperCase() : String(data_type).toUpperCase();
}

export async function initializeDatabase() {
  if (!isDatabaseConfigured) {
    console.warn("DATABASE_URL is not configured; database routes will be unavailable.");
    return;
  }

  try {
    const existingUserIdType = await getColumnType("users", "id", "INTEGER");
    const userRefType = existingUserIdType === "UUID" ? "UUID" : "INTEGER";
    const existingCourseIdType = await getColumnType("courses", "id", "INTEGER");
    const courseRefType = existingCourseIdType === "UUID" ? "UUID" : "INTEGER";

    // Users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
        profile_image_url TEXT,
        phone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_permissions JSONB NOT NULL DEFAULT '{}'::jsonb",
    );
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT;`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_setup_token_hash VARCHAR(255);`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_setup_expires_at TIMESTAMP;`);
    await query(`
      UPDATE users
      SET full_name = COALESCE(full_name, name, email)
      WHERE full_name IS NULL;
    `);
    await query(`
      UPDATE users
      SET is_active = true
      WHERE is_active IS NULL;
    `);

    // Courses table
    await query(`
      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        instructor_id ${userRefType} REFERENCES users(id) ON DELETE SET NULL,
        category VARCHAR(100),
        duration_weeks INTEGER,
        start_date DATE,
        end_date DATE,
        thumbnail_url TEXT,
        meeting_id VARCHAR(32) UNIQUE,
        price_cents INTEGER NOT NULL DEFAULT 0,
        is_published BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // A course owns one stable meeting ID. All of its scheduled classes use it.
    await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS meeting_id VARCHAR(32);`);
    await query(`
      UPDATE courses
      SET meeting_id = CONCAT(
        'ELX-',
        UPPER(SUBSTRING(MD5(random()::text || id::text || clock_timestamp()::text), 1, 10))
      )
      WHERE meeting_id IS NULL;
    `);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_meeting_id ON courses(meeting_id);`);

    // Ensure price_cents column exists
    const hasPriceCol = await query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'price_cents'"
    );
    if (hasPriceCol.rows.length === 0) {
      await query("ALTER TABLE courses ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0");
      console.log("Added price_cents column to courses table.");
    }

    await query(`
      UPDATE courses
      SET meeting_id = CONCAT(
        'ELX-',
        UPPER(SUBSTRING(MD5(random()::text || id::text || clock_timestamp()::text), 1, 10))
      )
      WHERE meeting_id IS NULL;
    `);

    // Course enrollments
    await query(`
      CREATE TABLE IF NOT EXISTS enrollments (
        id SERIAL PRIMARY KEY,
        student_id ${userRefType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        progress_percentage FLOAT DEFAULT 0,
        is_completed BOOLEAN DEFAULT false,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        UNIQUE(student_id, course_id)
      );
    `);
    await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS user_id ${userRefType};`);
    await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS student_id ${userRefType} REFERENCES users(id) ON DELETE CASCADE;`);
    await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS progress_percentage FLOAT DEFAULT 0;`);
    await query(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false;`);
    await query(`
      UPDATE enrollments
      SET student_id = user_id
      WHERE student_id IS NULL
        AND user_id IS NOT NULL;
    `);
    await query(`
      UPDATE enrollments
      SET progress_percentage = 0
      WHERE progress_percentage IS NULL;
    `);
    // Only migrate status → is_completed if the status column actually exists
    const hasStatusCol = await query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'enrollments' AND column_name = 'status'
    `);
    if (hasStatusCol.rows.length > 0) {
      await query(`
        UPDATE enrollments
        SET is_completed = (status = 'completed')
        WHERE is_completed IS NULL;
      `);
    }

    // Assignments table
    await query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id SERIAL PRIMARY KEY,
        course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        due_date TIMESTAMP,
        created_by ${userRefType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Assignment submissions
    await query(`
      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        student_id ${userRefType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        submission_text TEXT,
        file_url TEXT,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        grade INTEGER,
        feedback TEXT,
        graded_at TIMESTAMP
      );
    `);

    // Announcements table
    await query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        created_by ${userRefType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        course_id ${courseRefType} REFERENCES courses(id) ON DELETE CASCADE,
        is_published BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Attendance table
    await query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        student_id ${userRefType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        attendance_date DATE,
        is_present BOOLEAN DEFAULT false,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Enrollment approval requests
    await query(`
      CREATE TABLE IF NOT EXISTS enrollment_requests (
        id SERIAL PRIMARY KEY,
        student_id ${userRefType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        screenshot_data_url TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP,
        reviewed_by ${userRefType} REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    await query(`ALTER TABLE enrollment_requests ALTER COLUMN screenshot_data_url DROP NOT NULL;`);
    await query(`ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS transfer_reference VARCHAR(255);`);
    await query(`ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS receipt_data_url TEXT;`);
    await query(`ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS sender_account_title VARCHAR(255);`);
    await query(`ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS sender_account_number VARCHAR(255);`);

    await query(`
      CREATE TABLE IF NOT EXISTS payment_settings (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        bank_name VARCHAR(255) NOT NULL DEFAULT '',
        account_name VARCHAR(255) NOT NULL DEFAULT '',
        account_number VARCHAR(255) NOT NULL DEFAULT '',
        iban VARCHAR(255) NOT NULL DEFAULT '',
        routing_code VARCHAR(255) NOT NULL DEFAULT '',
        instructions TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await query(`INSERT INTO payment_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`);
    await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS instructor_id ${userRefType} REFERENCES users(id) ON DELETE SET NULL;`);
    await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS category VARCHAR(100);`);
    await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS duration_weeks INTEGER;`);
    await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS start_date DATE;`);
    await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS end_date DATE;`);
    await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;`);
    await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;`);
    await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
    await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);

    // Admin-managed promotions
    await query(`CREATE TABLE IF NOT EXISTS bundle_deals (
      id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, description TEXT,
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0), starts_at TIMESTAMP,
      ends_at TIMESTAMP, is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`);
    await query(`CREATE TABLE IF NOT EXISTS bundle_deal_courses (
      bundle_id INTEGER NOT NULL REFERENCES bundle_deals(id) ON DELETE CASCADE,
      course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      PRIMARY KEY (bundle_id, course_id)
    );`);
    await query(`CREATE TABLE IF NOT EXISTS promo_codes (
      id SERIAL PRIMARY KEY, code VARCHAR(40) UNIQUE NOT NULL,
      discount_type VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
      discount_value INTEGER NOT NULL CHECK (discount_value > 0), starts_at TIMESTAMP,
      ends_at TIMESTAMP, max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
      redemption_count INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`);

    // Tutor applications
    await query(`
      CREATE TABLE IF NOT EXISTS tutor_applications (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        expertise VARCHAR(255) NOT NULL,
        experience_years INTEGER DEFAULT 0,
        portfolio_url TEXT,
        certificate_1 TEXT,
        certificate_2 TEXT,
        certificate_3 TEXT,
        bio TEXT NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP,
        reviewed_by ${userRefType} REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    await query(`ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS certificate_1 TEXT;`);
    await query(`ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS certificate_2 TEXT;`);
    await query(`ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS certificate_3 TEXT;`);

    // Categories table
    await query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        slug VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tags table
    await query(`
      CREATE TABLE IF NOT EXISTS tags (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        slug VARCHAR(50) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Course-Category relationship (many-to-many)
    await query(`
      CREATE TABLE IF NOT EXISTS course_categories (
        id SERIAL PRIMARY KEY,
        course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        UNIQUE(course_id, category_id)
      );
    `);

    // Course-Tags relationship (many-to-many)
    await query(`
      CREATE TABLE IF NOT EXISTS course_tags (
        id SERIAL PRIMARY KEY,
        course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        UNIQUE(course_id, tag_id)
      );
    `);

    // Course modules/sections table
    await query(`
      CREATE TABLE IF NOT EXISTS course_modules (
        id SERIAL PRIMARY KEY,
        course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        order_index INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Course lessons table
    await query(`
      CREATE TABLE IF NOT EXISTS course_lessons (
        id SERIAL PRIMARY KEY,
        module_id INTEGER NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('video', 'text', 'quiz', 'interactive')),
        content_text TEXT,
        video_url TEXT,
        duration_minutes INTEGER,
        order_index INTEGER NOT NULL,
        is_preview BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Lesson progress tracking
    await query(`
      CREATE TABLE IF NOT EXISTS lesson_progress (
        id SERIAL PRIMARY KEY,
        student_id ${userRefType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lesson_id INTEGER NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
        is_completed BOOLEAN DEFAULT false,
        progress_percentage FLOAT DEFAULT 0,
        last_watched_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, lesson_id)
      );
    `);
    await query(`ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS user_id ${userRefType};`);
    await query(`ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS student_id ${userRefType} REFERENCES users(id) ON DELETE CASCADE;`);
    await query(`ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS progress_percentage FLOAT DEFAULT 0;`);
    await query(`ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false;`);

    // Live classes
    await query(`
      CREATE TABLE IF NOT EXISTS live_classes (
        id SERIAL PRIMARY KEY,
        course_id ${courseRefType} NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        teacher_id ${userRefType} REFERENCES users(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        scheduled_start TIMESTAMP NOT NULL,
        scheduled_end TIMESTAMP NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'cancelled', 'completed')),
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        room_id VARCHAR(120) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await query(`ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;`);
    await query(`ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP;`);
    await query(`ALTER TABLE live_classes DROP CONSTRAINT IF EXISTS live_classes_status_check;`);
    await query(`
      ALTER TABLE live_classes
      ADD CONSTRAINT live_classes_status_check
      CHECK (status IN ('scheduled', 'active', 'cancelled', 'completed'));
    `);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_live_classes_one_active_per_course
      ON live_classes(course_id)
      WHERE status = 'active';
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS live_class_attendance (
        id SERIAL PRIMARY KEY,
        live_class_id INTEGER NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
        user_id ${userRefType} NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        left_at TIMESTAMP,
        duration_seconds INTEGER DEFAULT 0
      );
    `);

    // Create indexes for better query performance
    await query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_courses_instructor ON courses(instructor_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_enrollment_requests_status ON enrollment_requests(status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_enrollment_requests_student ON enrollment_requests(student_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_enrollment_requests_course ON enrollment_requests(course_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tutor_applications_status ON tutor_applications(status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tutor_applications_email ON tutor_applications(email);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_course_categories_course ON course_categories(course_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_course_categories_category ON course_categories(category_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_course_tags_course ON course_tags(course_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_course_tags_tag ON course_tags(tag_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_course_modules_course ON course_modules(course_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_course_lessons_module ON course_lessons(module_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_lesson_progress_student ON lesson_progress(student_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson ON lesson_progress(lesson_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_live_classes_course ON live_classes(course_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_live_classes_teacher ON live_classes(teacher_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_live_classes_start ON live_classes(scheduled_start);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_live_class_attendance_class ON live_class_attendance(live_class_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_live_class_attendance_user ON live_class_attendance(user_id);`);

    console.log("Database schema initialized successfully");
  } catch (error) {
    console.error("Error initializing database schema:", error);
    throw error;
  }
}
