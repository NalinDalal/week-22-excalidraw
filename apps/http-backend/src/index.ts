import { signupHandler, signinHandler } from "./auth";
import {
  createRoomHandler,
  getChatsHandler,
  getRoomHandler,
  saveShapesHandler,
  getShapesHandler,
} from "./room";
import { corsResponse } from "./response";

// ─── Startup validation ─────────────────────────────────────
function validateEnv() {
  const required = ["JWT_SECRET"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (process.env.JWT_SECRET === "your-secret-key-change-me") {
    console.error("JWT_SECRET must be changed from the default value");
    process.exit(1);
  }
}
validateEnv();

/** Maximum allowed request body size (1 MB) */
const MAX_BODY_SIZE = 1 * 1024 * 1024;

/**
 * HTTP API server (Bun, port 3001).
 *
 * Routes:
 *   POST /signup          – Create account
 *   POST /signin          – Login, returns JWT
 *   POST /room            – Create a new room
 *   GET  /room/:slug      – Lookup room by slug
 *   GET  /chats/:roomId   – Fetch chat/shape history
 *   GET  /shapes/:roomId  – Latest full-state snapshot
 *   POST /shapes/:roomId  – Save full-state snapshot (auto-save)
 *   GET  /health          – Health check
 */
const server = Bun.serve({
  port: Number(process.env.HTTP_PORT) || 3001,
  async fetch(req) {
    const url = new URL(req.url);

    // --- Health check (no body size limit) ---
    if (req.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    // --- CORS preflight ---
    if (req.method === "OPTIONS") {
      return corsResponse(null, { status: 204 }, req);
    }

    // --- Body size limit for write requests ---
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (["POST", "PUT", "PATCH"].includes(req.method) && contentLength > MAX_BODY_SIZE) {
      return corsResponse({ error: "Request body too large" }, { status: 413 }, req);
    }

    if (req.method === "POST" && url.pathname === "/signup") {
      return signupHandler(req);
    }

    if (req.method === "POST" && url.pathname === "/signin") {
      return signinHandler(req);
    }

    if (req.method === "POST" && url.pathname === "/room") {
      return createRoomHandler(req);
    }

    if (req.method === "GET" && url.pathname.startsWith("/chats/")) {
      return getChatsHandler(url, req);
    }

    if (req.method === "GET" && url.pathname.startsWith("/room/")) {
      return getRoomHandler(url, req);
    }

    if (req.method === "POST" && url.pathname.startsWith("/shapes/")) {
      return saveShapesHandler(req, url);
    }

    if (req.method === "GET" && url.pathname.startsWith("/shapes/")) {
      return getShapesHandler(url, req);
    }

    return corsResponse({ error: "Not found" }, { status: 404 }, req);
  },
});

console.log(`HTTP server running on http://localhost:${server.port}`);
