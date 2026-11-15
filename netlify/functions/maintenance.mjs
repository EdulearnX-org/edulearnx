import { initializeServer } from "../../server/index.js";
import { runMaintenance } from "../../server/utils/maintenance.js";

// Netlify scheduled functions cannot be invoked through a public HTTP URL.
export default async () => {
  await initializeServer();
  await runMaintenance();
};

export const config = { schedule: "@hourly" };
