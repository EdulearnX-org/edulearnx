import { RequestHandler } from "express";
import pool, { query } from "../db/connection.js";
import type { PoolClient } from "pg";

const bucket = "payment-receipts";
const signedUrlLifetimeSeconds = 120;
const maxReceiptBytes = 5 * 1024 * 1024;
const allowedReceiptTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

type SupabaseApplication = {
  id: string;
  student_id: string;
  course_id: string;
  student_name: string;
  student_email: string;
  student_phone: string;
  course_title: string;
  transfer_reference: string | null;
  sender_account_title: string;
  sender_account_number: string;
  receipt_path: string;
  status: "pending" | "approved" | "rejected";
  submission_state: "uploading" | "complete" | "failed";
  cleanup_status: "none" | "queued" | "cleaning" | "failed" | "complete";
  cleanup_attempts: number;
  cleanup_error: string | null;
  next_cleanup_at: string | null;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

class SupabaseRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase server configuration is missing. Set SUPABASE_URL and the server-only SUPABASE_SECRET_KEY.",
    );
  }

  return { url: url.replace(/\/+$/, ""), key };
}

async function supabaseRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...init.headers,
    },
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const detail =
      typeof body === "object" && body !== null && "message" in body
        ? String(body.message)
        : `Supabase returned HTTP ${response.status}`;
    throw new SupabaseRequestError(detail, response.status);
  }

  return body as T;
}

/** Count the current Supabase queue, including queues larger than the REST row limit. */
export async function getPendingEnrollmentRequestCount() {
  const { url, key } = supabaseConfig();
  const params = new URLSearchParams({
    select: "id",
    status: "eq.pending",
    submission_state: "eq.complete",
  });
  const response = await fetch(`${url}${tablePath(params.toString())}`, {
    method: "HEAD",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  if (!response.ok) {
    throw new SupabaseRequestError("Unable to count enrollment applications", response.status);
  }
  const count = /\/(\d+)$/.exec(response.headers.get("content-range") || "");
  if (!count) throw new Error("Supabase did not return an exact enrollment count.");
  return Number(count[1]);
}

function tablePath(queryString: string) {
  return `/rest/v1/enrollment_applications?${queryString}`;
}

function storagePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function uploadReceipt(path: string, contentType: string, data: Buffer) {
  const { url, key } = supabaseConfig();
  const response = await fetch(
    `${url}/storage/v1/object/${bucket}/${storagePath(path)}`,
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": contentType,
        "x-upsert": "false",
      },
      body: new Blob([Uint8Array.from(data)], { type: contentType }),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new SupabaseRequestError(
      detail || `Supabase Storage returned HTTP ${response.status}`,
      response.status,
    );
  }
}

async function removeReceipt(path: string) {
  try {
    await supabaseRequest<unknown>(`/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [path] }),
    });
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.status === 404) return;
    throw error;
  }
}

export function parseReceipt(dataUrl: unknown) {
  if (typeof dataUrl !== "string") {
    throw new Error("A payment receipt is required.");
  }
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match || !allowedReceiptTypes.has(match[1])) {
    throw new Error("Receipt must be a JPEG, PNG, WebP, or PDF file.");
  }

  const data = Buffer.from(match[2], "base64");
  if (!data.length) {
    throw new Error("Receipt file is empty.");
  }
  if (data.length > maxReceiptBytes) {
    throw new Error("Receipt must be smaller than 5 MB.");
  }

  const validSignature =
    (match[1] === "image/jpeg" &&
      data[0] === 0xff &&
      data[1] === 0xd8 &&
      data[2] === 0xff) ||
    (match[1] === "image/png" &&
      data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (match[1] === "image/webp" &&
      data.toString("ascii", 0, 4) === "RIFF" &&
      data.toString("ascii", 8, 12) === "WEBP") ||
    (match[1] === "application/pdf" &&
      data.toString("ascii", 0, 5) === "%PDF-");

  if (!validSignature) {
    throw new Error("Receipt file content does not match its file type.");
  }

  const extension =
    match[1] === "image/jpeg"
      ? "jpg"
      : match[1] === "image/png"
        ? "png"
        : match[1] === "image/webp"
          ? "webp"
          : "pdf";
  return { contentType: match[1], data, extension };
}

async function updateApplication(
  id: string,
  values: Partial<SupabaseApplication>,
  filters = "",
) {
  const params = new URLSearchParams({ id: `eq.${id}`, select: "*" });
  if (filters) {
    for (const [key, value] of new URLSearchParams(filters)) {
      params.set(key, value);
    }
  }
  return supabaseRequest<SupabaseApplication[]>(
    tablePath(params.toString()),
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(values),
    },
  );
}

async function processCleanup(
  id: string,
  expectedStatus: string,
  force = false,
) {
  const now = new Date().toISOString();
  const claimed = await updateApplication(
    id,
    {
      cleanup_status: "cleaning",
      next_cleanup_at: new Date(Date.now() + 2 * 60_000).toISOString(),
    },
    force
      ? `cleanup_status=eq.${expectedStatus}`
      : `cleanup_status=eq.${expectedStatus}&next_cleanup_at=lte.${now}`,
  );
  const application = claimed[0];
  if (!application) return { claimed: false, error: null };

  try {
    await removeReceipt(application.receipt_path);
    await updateApplication(id, {
      cleanup_status: "complete",
      cleanup_error: null,
      next_cleanup_at: null,
    });
    return { claimed: true, error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown receipt deletion error";
    const retryDelayMs = Math.min(
      60 * 60_000,
      30_000 * 2 ** Math.min(application.cleanup_attempts, 7),
    );
    await updateApplication(id, {
      cleanup_status: "failed",
      cleanup_attempts: application.cleanup_attempts + 1,
      cleanup_error: message.slice(0, 1000),
      next_cleanup_at: new Date(Date.now() + retryDelayMs).toISOString(),
    });
    console.error(`Receipt cleanup failed for enrollment ${id}:`, error);
    return { claimed: true, error: message };
  }
}

export async function retryEnrollmentReceiptCleanup() {
  const now = new Date().toISOString();
  const staleUploadCutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const staleParams = new URLSearchParams({
    select: "id",
    submission_state: "eq.uploading",
    requested_at: `lte.${staleUploadCutoff}`,
    limit: "25",
  });
  const staleUploads = await supabaseRequest<
    Pick<SupabaseApplication, "id">[]
  >(tablePath(staleParams.toString()));
  for (const application of staleUploads) {
    await updateApplication(
      application.id,
      {
        submission_state: "failed",
        cleanup_status: "queued",
        cleanup_error: "Receipt upload did not complete; cleanup retry queued.",
        next_cleanup_at: now,
      },
      `submission_state=eq.uploading&requested_at=lte.${staleUploadCutoff}`,
    );
  }

  const params = new URLSearchParams({
    select: "id,cleanup_status",
    cleanup_status: "in.(queued,failed,cleaning)",
    next_cleanup_at: `lte.${now}`,
    limit: "25",
  });
  const eligible = await supabaseRequest<
    Pick<SupabaseApplication, "id" | "cleanup_status">[]
  >(tablePath(params.toString()));

  for (const application of eligible) {
    const result = await processCleanup(application.id, application.cleanup_status);
    if (result.error) {
      console.error(
        `Enrollment receipt cleanup remains pending for ${application.id}: ${result.error}`,
      );
    }
  }
}

export const getEnrollmentRequests: RequestHandler = async (req, res) => {
  try {
    await retryEnrollmentReceiptCleanup();
    const params = new URLSearchParams({
      select: "*",
      order: "requested_at.desc",
    });
    if (req.query.status) {
      params.set("status", `eq.${String(req.query.status)}`);
    }
    if (req.query.student_id) {
      params.set("student_id", `eq.${String(req.query.student_id)}`);
    }

    const data = await supabaseRequest<SupabaseApplication[]>(
      tablePath(params.toString()),
    );
    res.json({
      success: true,
      data: data.map(({ receipt_path: _receiptPath, ...application }) => application),
    });
  } catch (error) {
    console.error("Error fetching enrollment applications:", error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error && error.message.includes("Supabase server configuration")
          ? error.message
          : "Failed to fetch enrollment applications",
    });
  }
};

export const createEnrollmentRequest: RequestHandler = async (req, res) => {
  let applicationId: string | undefined;
  try {
    const courseId = String(req.body.course_id || "").trim();
    const studentPhone = String(req.body.student_phone || "").trim();
    const transferReference = String(req.body.transfer_reference || "").trim();
    const senderAccountTitle = String(req.body.sender_account_title || "").trim();
    const senderAccountNumber = String(req.body.sender_account_number || "").trim();

    if (!req.user?.userId || !courseId || !studentPhone || !senderAccountTitle || !senderAccountNumber) {
      return res.status(400).json({
        success: false,
        error: "Course, phone number, sender account title, account number, and receipt are required.",
      });
    }
    if (
      studentPhone.length > 64 ||
      senderAccountTitle.length > 255 ||
      senderAccountNumber.length > 255 ||
      transferReference.length > 255
    ) {
      return res.status(400).json({ success: false, error: "One or more enrollment details are too long." });
    }

    let receipt: ReturnType<typeof parseReceipt>;
    try {
      receipt = parseReceipt(req.body.receipt_data_url);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Invalid receipt file.",
      });
    }

    const [user, course] = await Promise.all([
      query(
        "SELECT id, full_name, email, role FROM users WHERE id = $1",
        [req.user.userId],
      ),
      query("SELECT id, title FROM courses WHERE id = $1", [courseId]),
    ]);
    if (!user.rows[0] || user.rows[0].role !== "student") {
      return res.status(403).json({ success: false, error: "A student account is required." });
    }
    if (!course.rows[0]) {
      return res.status(404).json({ success: false, error: "Course not found." });
    }
    const enrolled = await query(
      "SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2",
      [user.rows[0].id, courseId],
    );
    if (enrolled.rows.length) {
      return res.status(409).json({
        success: false,
        error: "You are already enrolled in this course.",
      });
    }

    const existing = await supabaseRequest<SupabaseApplication[]>(
      tablePath(
        new URLSearchParams({
          select: "id",
          student_id: `eq.${user.rows[0].id}`,
          course_id: `eq.${courseId}`,
          status: "eq.pending",
          submission_state: "eq.complete",
          limit: "1",
        }).toString(),
      ),
    );
    if (existing.length) {
      return res.status(409).json({
        success: false,
        error: "A pending application already exists for this course.",
      });
    }

    const applicationIdValue = crypto.randomUUID();
    applicationId = applicationIdValue;
    const extension = receipt.extension;
    const receiptPath = `${user.rows[0].id}/${applicationIdValue}.${extension}`;
    const created = await supabaseRequest<SupabaseApplication[]>(
      tablePath("select=*"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          id: applicationIdValue,
          student_id: String(user.rows[0].id),
          student_name: user.rows[0].full_name,
          student_email: user.rows[0].email,
          student_phone: studentPhone,
          course_id: String(course.rows[0].id),
          course_title: course.rows[0].title,
          transfer_reference: transferReference || null,
          sender_account_title: senderAccountTitle,
          sender_account_number: senderAccountNumber,
          receipt_path: receiptPath,
          status: "pending",
          submission_state: "uploading",
          cleanup_status: "none",
          cleanup_attempts: 0,
        }),
      },
    );
    if (!created[0]) {
      throw new Error("Supabase did not return the created enrollment application.");
    }

    try {
      await uploadReceipt(receiptPath, receipt.contentType, receipt.data);
      const completed = await updateApplication(
        applicationIdValue,
        { submission_state: "complete" },
        "submission_state=eq.uploading",
      );
      if (!completed[0]) {
        throw new Error("Receipt was uploaded but the application could not be finalized.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown receipt upload error";
      await updateApplication(applicationIdValue, {
        submission_state: "failed",
        cleanup_status: "queued",
        cleanup_error: message.slice(0, 1000),
        next_cleanup_at: new Date().toISOString(),
      });
      console.error(`Receipt upload failed for enrollment ${applicationIdValue}:`, error);
      return res.status(502).json({
        success: false,
        error: "Receipt upload failed. The incomplete application is queued for automatic cleanup; please retry later.",
      });
    }

    res.status(201).json({
      success: true,
      data: { id: applicationIdValue, status: "pending" },
      message: "Enrollment application submitted for review.",
    });
  } catch (error) {
    console.error("Error creating enrollment application:", error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error && error.message.includes("Supabase server configuration")
          ? error.message
          : "Failed to create enrollment application",
    });
  }
};

export const getEnrollmentReceiptUrl: RequestHandler = async (req, res) => {
  try {
    const params = new URLSearchParams({
      select: "id,receipt_path,submission_state,cleanup_status",
      id: `eq.${String(req.params.id)}`,
      limit: "1",
    });
    const [application] = await supabaseRequest<SupabaseApplication[]>(
      tablePath(params.toString()),
    );
    if (!application) {
      return res.status(404).json({ success: false, error: "Enrollment application not found." });
    }
    if (
      application.submission_state !== "complete" ||
      application.cleanup_status === "complete"
    ) {
      return res.status(410).json({ success: false, error: "This payment receipt is no longer available." });
    }

    const signed = await supabaseRequest<{ signedURL?: string }>(
      `/storage/v1/object/sign/${bucket}/${storagePath(application.receipt_path)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: signedUrlLifetimeSeconds }),
      },
    );
    if (!signed.signedURL) {
      throw new Error("Supabase did not return a signed receipt URL.");
    }
    const { url } = supabaseConfig();
    res.json({
      success: true,
      data: {
        url: signed.signedURL.startsWith("http")
          ? signed.signedURL
          : `${url}/storage/v1${signed.signedURL}`,
        expires_in: signedUrlLifetimeSeconds,
      },
    });
  } catch (error) {
    console.error("Unable to sign enrollment receipt URL:", error);
    res.status(500).json({
      success: false,
      error: "Unable to open payment receipt.",
    });
  }
};

export const reviewEnrollmentRequest: RequestHandler = async (req, res) => {
  let client: PoolClient | undefined;
  let transactionOpen = false;
  let enrollmentGranted = false;
  let decisionFinalized = false;
  try {
    const id = String(req.params.id);
    const requestedStatus = String(req.body.status || "");
    if (!["approved", "rejected"].includes(requestedStatus)) {
      return res.status(400).json({
        success: false,
        error: "Status must be approved or rejected.",
      });
    }

    // Transaction-scoped locks also work with Neon's transaction-mode pooler.
    // A dedicated client keeps the reads, grant and lock on the same transaction.
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SELECT pg_advisory_xact_lock(1919246693, hashtext($1))", [id]);
    const params = new URLSearchParams({
      select: "*",
      id: `eq.${id}`,
      limit: "1",
    });
    const [application] = await supabaseRequest<SupabaseApplication[]>(
      tablePath(params.toString()),
    );
    if (!application || application.submission_state !== "complete" || application.status !== "pending") {
      if (application?.submission_state === "complete" && application.status === requestedStatus) {
        return res.json({ success: true, data: { id, status: application.status, cleanup_status: application.cleanup_status }, message: "This enrollment application has already been reviewed." });
      }
      return res.status(409).json({
        success: false,
        error: "This application has already been reviewed or is not ready for review.",
      });
    }

    let status = requestedStatus;
    if (requestedStatus === "approved") {
      // This INSERT commits before the decision can queue destructive cleanup.
      // Retrying after a remote finalization failure is safe and idempotent.
      await client.query(
        "INSERT INTO enrollments (student_id, course_id) VALUES ($1, $2) ON CONFLICT (student_id, course_id) DO NOTHING",
        [application.student_id, application.course_id],
      );
    } else {
      const membership = await client.query(
        "SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2",
        [application.student_id, application.course_id],
      );
      if (membership.rows.length) {
        // An earlier approval may have committed locally while Supabase was down.
        // Reconcile the durable grant rather than recording a contradictory rejection.
        status = "approved";
      }
    }
    if (status === "approved") {
      // Release the transaction lock only after course access is durable. Any
      // competing reviewer will now see the grant and also reconcile to approved.
      await client.query("COMMIT");
      transactionOpen = false;
      enrollmentGranted = true;
    }

    const finalized = await updateApplication(id, {
      status: status as "approved" | "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: String(req.user?.userId),
      cleanup_status: "queued",
      next_cleanup_at: new Date().toISOString(),
    }, "status=eq.pending&submission_state=eq.complete");
    let finalApplication = finalized[0];
    if (!finalApplication) {
      // Another reviewer may have finalized the same durable approval after
      // our transaction committed. Accept that matching decision idempotently.
      [finalApplication] = await supabaseRequest<SupabaseApplication[]>(tablePath(params.toString()));
      if (!finalApplication || finalApplication.status !== status) {
        throw new Error("The enrollment decision could not be finalized.");
      }
    }
    decisionFinalized = true;
    if (transactionOpen) {
      // Rejections hold the lock until their remote decision is saved, so an
      // approval cannot grant access while a rejection is being finalized.
      await client.query("COMMIT");
      transactionOpen = false;
    }

    const cleanup = finalApplication.cleanup_status === "complete"
      ? { claimed: true, error: null }
      : await processCleanup(id, "queued");
    if (cleanup.error) {
      return res.status(503).json({
        success: false,
        data: { id, status, cleanup_status: "failed" },
        error: "The decision was saved, but receipt deletion failed. Cleanup is scheduled to retry automatically.",
      });
    }

    const cleanupStatus = cleanup.claimed ? "complete" : "queued";
    return res.json({
      success: true,
      data: { id, status, cleanup_status: cleanupStatus },
      message: status !== requestedStatus
        ? "Course access was already granted; the application was reconciled as approved."
        : cleanup.claimed
          ? `Enrollment application ${status}; receipt deleted.`
          : `Enrollment application ${status}; receipt cleanup is being processed.`,
    });
  } catch (error) {
    console.error("Error reviewing enrollment application:", error);
    return res.status(500).json({
      success: false,
      error: decisionFinalized
        ? "The decision was saved, but receipt cleanup could not be confirmed. Refresh the applications and retry cleanup if needed."
        : enrollmentGranted
          ? "Course access was granted, but the application could not be finalized. Retry the review operation; the payment receipt has been retained."
          : "The review could not be completed. Please retry the review operation.",
    });
  } finally {
    if (client) {
      let rollbackError: Error | undefined;
      if (transactionOpen) {
        try {
          await client.query("ROLLBACK");
        } catch (error) {
          rollbackError = error instanceof Error ? error : new Error("Unable to roll back enrollment review");
          console.error("Unable to roll back enrollment review:", error);
        }
      }
      client.release(rollbackError);
    }
  }
};

export const retryEnrollmentRequestCleanup: RequestHandler = async (req, res) => {
  try {
    const params = new URLSearchParams({
      select: "id,cleanup_status",
      id: `eq.${String(req.params.id)}`,
      cleanup_status: "in.(queued,failed)",
    });
    const [application] = await supabaseRequest<
      Pick<SupabaseApplication, "id" | "cleanup_status">[]
    >(tablePath(params.toString()));
    if (!application) {
      return res.status(409).json({
        success: false,
        error: "This application has no retryable receipt cleanup.",
      });
    }
    const result = await processCleanup(application.id, application.cleanup_status, true);
    if (result.error) {
      return res.status(503).json({
        success: false,
        error: "Receipt deletion failed again; automatic retry remains scheduled.",
      });
    }
    return res.json({
      success: true,
      message: result.claimed
        ? "Receipt cleanup completed."
        : "Receipt cleanup is already being processed or is not retryable.",
    });
  } catch (error) {
    console.error("Unable to retry enrollment receipt cleanup:", error);
    return res.status(500).json({
      success: false,
      error: "Unable to retry receipt cleanup.",
    });
  }
};
