// Vercel bundles api/[...path].ts natively; only the SPA belongs in static output.
import { execFileSync } from "node:child_process";

execFileSync("npm", ["run", "build:client"], { stdio: "inherit" });
