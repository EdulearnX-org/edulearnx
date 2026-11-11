// Vercel bundles api/index.ts natively; only the SPA belongs in static output.
import { execFileSync } from "node:child_process";

execFileSync("npm", ["run", "build:client"], { stdio: "inherit" });
