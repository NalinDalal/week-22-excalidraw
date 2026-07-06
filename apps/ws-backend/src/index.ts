import jwt from "jsonwebtoken";
import { prismaClient } from "@repo/db/client";

const JWT_SECRET = process.env.JWT_SECRET;

/** Data attached to each WebSocket connection */
type WebSocketData = {
  userId: string;
  rooms: string[];
};

/** Track all active connections so we can broadcast to rooms */
const clients = new Set<ServerWebSocket<WebSocketData>>();

// ─── Rate limiting (in-memory, per IP) ──────────────────────
type RateEntry = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateEntry>();

function wsRateLimit(
  key: string,
  limit: number = 30,
  windowMs: number = 60_000,
): boolean {
  const now = Date.now();
  const entry = rateBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateBuckets) {
    if (now > entry.resetAt) rateBuckets.delete(key);
  }
}, 60_000);

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "127.0.0.1";
}

// ─── HTTP handler ───────────────────────────────────────────
function handleHttp(req: Request): Response | undefined {
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname === "/health") {
    return new Response("ok", { status: 200 });
  }
  return undefined;
}

const server = Bun.serve<WebSocketData>({
  port: 8080,

  /**
   * HTTP handler — used for health checks and WebSocket upgrade.
   * JWT is extracted from the Sec-WebSocket-Protocol header (not query param).
   * This prevents the token from appearing in server logs or URLs.
   */
  fetch(req, server) {
    const httpResp = handleHttp(req);
    if (httpResp) return httpResp;

    // Rate-limit WebSocket upgrades per IP
    const ip = getClientIp(req);
    if (!wsRateLimit(`ws:${ip}`)) {
      return new Response("Too many requests", { status: 429 });
    }

    // Extract JWT from Sec-WebSocket-Protocol header
    const protoHeader = req.headers.get("sec-websocket-protocol") || "";
    const parts = protoHeader.split(",").map((p) => p.trim());
    let token = "";
    if (parts.length === 2 && parts[0] === "token") {
      token = parts[1];
    }

    if (!token) {
      return new Response("Unauthorized", { status: 401 });
    }

    const userId = checkUser(token);
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Echo back the subprotocol so the browser accepts the connection
    const success = server.upgrade(req, {
      data: { userId, rooms: [] },
      headers: {
        "Sec-WebSocket-Protocol": protoHeader,
      },
    });
    return success
      ? undefined
      : new Response("WebSocket upgrade failed", { status: 400 });
  },

  websocket: {
    open(ws) {
      clients.add(ws);
    },

    message(ws, message) {
      if (typeof message !== "string") return;

      let parsedData: any;
      try {
        parsedData = JSON.parse(message);
      } catch {
        return;
      }

      if (parsedData.type === "join_room") {
        ws.data.rooms.push(parsedData.roomId);
      }

      if (parsedData.type === "leave_room") {
        ws.data.rooms = ws.data.rooms.filter(
          (x) => x !== parsedData.room,
        );
      }

      if (parsedData.type === "chat") {
        const roomId = parsedData.roomId;
        const chatMessage = parsedData.message;

        if (!roomId || !chatMessage) return;

        prismaClient.chat
          .create({
            data: {
              roomId,
              message: chatMessage,
              userId: ws.data.userId,
            },
          })
          .catch(console.error);

        for (const client of clients) {
          if (client.data.rooms.includes(roomId)) {
            client.send(
              JSON.stringify({
                type: "chat",
                message: chatMessage,
                roomId,
              }),
            );
          }
        }
      }
    },

    close(ws) {
      clients.delete(ws);
    },
  },
});

function checkUser(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "string") return null;
    if (!decoded || !decoded.userId) return null;
    return decoded.userId as string;
  } catch {
    return null;
  }
}

console.log(`WebSocket server running on ws://localhost:${server.port}`);
