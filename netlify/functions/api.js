import serverless from "serverless-http";
import { createServer, initializeServer } from "../../server/index.js";

const app = createServer();

const handle = serverless(app, {
  request(req) {
    const url = (req.url ?? "").replace(/^\/\.netlify\/functions\/api(?=\/|$)/, "");
    req.url = url;
    if (!/^\/api(?:\/|$)/.test(url)) {
      req.url = `/api${url.startsWith("/") ? url : `/${url}`}`;
    }
  },
});

export const handler = async (event, context) => {
  try {
    await initializeServer();
  } catch (error) {
    console.error("API initialization failed", error);
    return { statusCode: 503, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Service is not ready" }) };
  }
  return handle(event, context);
};
