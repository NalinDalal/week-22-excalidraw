import { signupHandler, signinHandler } from "./auth";
import {
  createRoomHandler,
  getChatsHandler,
  getRoomHandler,
  saveShapesHandler,
  getShapesHandler,
} from "./room";
import { corsResponse } from "./response";

const server = Bun.serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return corsResponse(null, { status: 204 });
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
      return getChatsHandler(url);
    }

    if (req.method === "GET" && url.pathname.startsWith("/room/")) {
      return getRoomHandler(url);
    }

    if (req.method === "POST" && url.pathname.startsWith("/shapes/")) {
      return saveShapesHandler(req, url);
    }

    if (req.method === "GET" && url.pathname.startsWith("/shapes/")) {
      return getShapesHandler(url);
    }

    return corsResponse({ error: "Not found" }, { status: 404 });
  },
});

console.log(`HTTP server running on http://localhost:${server.port}`);
