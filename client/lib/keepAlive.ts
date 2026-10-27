/**
 * Database Keep-Alive Service
 * 
 * Pings the /api/keep-alive endpoint every 4 minutes to prevent
 * Neon database from going to sleep and causing cold start delays.
 * 
 * This ensures the database stays warm and responsive within the
 * 10-second Vercel free plan timeout limit.
 */

const KEEP_ALIVE_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes
const KEEP_ALIVE_ENDPOINT = "/api/keep-alive";

let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

/**
 * Start the keep-alive ping service
 * Call this once when the app initializes
 */
export function startKeepAliveService(): void {
  if (keepAliveInterval) {
    console.log("[Keep-Alive] Service already running");
    return;
  }

  console.log("[Keep-Alive] Starting database keep-alive service (every 4 minutes)");
  
  // Ping immediately on start
  pingKeepAlive();

  // Then ping every 4 minutes
  keepAliveInterval = setInterval(() => {
    pingKeepAlive();
  }, KEEP_ALIVE_INTERVAL_MS);
  
  isRunning = true;
}

/**
 * Stop the keep-alive ping service
 * Call this when cleaning up (e.g., in useEffect cleanup)
 */
export function stopKeepAliveService(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    isRunning = false;
    console.log("[Keep-Alive] Service stopped");
  }
}

/**
 * Check if the keep-alive service is currently running
 */
export function isKeepAliveRunning(): boolean {
  return isRunning && keepAliveInterval !== null;
}

/**
 * Single ping to the keep-alive endpoint
 */
async function pingKeepAlive(): Promise<void> {
  try {
    const startTime = Date.now();
    const response = await fetch(KEEP_ALIVE_ENDPOINT, {
      method: "GET",
      cache: "no-store",
    });

    const data = await response.json();
    const latency = Date.now() - startTime;

    if (response.ok && data.success) {
      console.log(`[Keep-Alive] ✓ Database pinged successfully (${latency}ms)`);
    } else {
      console.warn(`[Keep-Alive] ⚠ Database ping failed:`, data.error);
    }
  } catch (error) {
    // Don't show error to user - this is a background service
    // Only log in development
    if (process.env.NODE_ENV === "development") {
      console.error("[Keep-Alive] ✗ Connection error:", error);
    }
  }
}
