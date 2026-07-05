import jwt from "jsonwebtoken";
import { prismaClient } from "@repo/db/client";

const JWT_SECRET = process.env.JWT_SECRET || "123123";

/** Data attached to each WebSocket connection */
type WebSocketData = {
  userId: string;
  rooms: string[];
};

/** Track all active connections so we can broadcast to rooms */
const clients = new Set<ServerWebSocket<WebSocketData>>();

const server = Bun.serve<WebSocketData>({
  port: 8080,

  /**
   * HTTP handler — only used to upgrade requests to WebSocket.
   * Extracts JWT from ?token=, verifies it, then upgrades.
   */
  fetch(req, server) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";
    const userId = checkUser(token);
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const success = server.upgrade(req, {
      data: { userId, rooms: [] },
    });
    return success
      ? undefined
      : new Response("WebSocket upgrade failed", { status: 400 });
  },

  websocket: {
    /** Register the new connection for broadcasting */
    open(ws) {
      clients.add(ws);
    },

    /**
     * Handle incoming messages.
     * Supports: join_room, leave_room, chat.
     */
    message(ws, message) {
      if (typeof message !== "string") return;
      const parsedData = JSON.parse(message);

      if (parsedData.type === "join_room") {
        // Add the room to this client's room list
        ws.data.rooms.push(parsedData.roomId);
      }

      if (parsedData.type === "leave_room") {
        // Remove the room from this client's room list
        ws.data.rooms = ws.data.rooms.filter(
          (x) => x !== parsedData.room,
        );
      }

      if (parsedData.type === "chat") {
        const roomId = parsedData.roomId;
        const chatMessage = parsedData.message;

        // Persist message to database (fire-and-forget)
        prismaClient.chat
          .create({
            data: {
              roomId,
              message: chatMessage,
              userId: ws.data.userId,
            },
          })
          .catch(console.error);

        // Broadcast to all clients in the same room
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

    /** Remove the disconnected client from the broadcast set */
    close(ws) {
      clients.delete(ws);
    },
  },
});

/** Verify a JWT token and return the userId, or null if invalid */
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
