import dotenv from "dotenv";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

// Must be imported before any database modules so that
// process.env is populated when the connection pool is created.
if (!process.env.VERCEL) {
  dotenv.config({ path: [".env.local", ".env"] });
}

// Node fetch does not consistently use proxy environment variables across the
// supported runtimes. Route external service requests through the configured
// proxy while respecting NO_PROXY and normal TLS certificate verification.
if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}
