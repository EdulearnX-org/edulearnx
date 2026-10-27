import { query } from "./server/db/connection.js";

(async () => {
  try {
    console.log("Testing Singapore database connection...");
    console.log("DATABASE_URL:", process.env.DATABASE_URL ? "configured" : "missing");
    
    const start = Date.now();
    const result = await query("SELECT 1 AS test");
    const latency = Date.now() - start;
    
    console.log(`✓ Connected successfully in ${latency}ms!`);
    console.log("Result:", result.rows);
    process.exit(0);
  } catch (error: any) {
    console.error("✗ Connection failed:", error.message);
    console.error("Full error:", error);
    process.exit(1);
  }
})();
