import { z } from "zod";
import { prismaClient } from "@repo/db/client";
import { middleware } from "./middleware";
import { corsResponse } from "./response";

/** Validation schema for POST /room */
const CreateRoomSchema = z.object({
  name: z.string().min(3).max(20),
});

/**
 * POST /room
 * Create a new collaboration room. Requires authentication.
 * Returns { roomId } or errors on duplicate slug.
 */
export async function createRoomHandler(req: Request) {
  const userId = middleware(req);
  if (!userId) {
    return corsResponse({ message: "Unauthorized" }, { status: 403 }, req);
  }

  const body = await req.json();
  const parsedData = CreateRoomSchema.safeParse(body);
  if (!parsedData.success) {
    return corsResponse({ message: "Incorrect inputs" }, { status: 400 }, req);
  }

  try {
    const room = await prismaClient.room.create({
      data: { slug: parsedData.data.name, adminId: userId },
    });
    return corsResponse({ roomId: room.id }, {}, req);
  } catch {
    return corsResponse(
      { message: "Room already exists with this name" },
      { status: 411 },
      req,
    );
  }
}

/**
 * GET /chats/:roomId
 * Fetch up to 1000 chat messages (including shape data) for a room.
 * Used on page load to reconstruct the canvas.
 */
export async function getChatsHandler(url: URL, req: Request) {
  const roomId = Number(url.pathname.split("/")[2]);
  try {
    const messages = await prismaClient.chat.findMany({
      where: { roomId },
      orderBy: { id: "asc" },
      take: 1000,
    });
    return corsResponse({ messages }, {}, req);
  } catch {
    return corsResponse({ messages: [] }, {}, req);
  }
}

/**
 * GET /room/:slug
 * Look up a room by its human-readable slug name.
 */
export async function getRoomHandler(url: URL, req: Request) {
  const slug = url.pathname.split("/")[2];
  const room = await prismaClient.room.findFirst({ where: { slug } });
  return corsResponse({ room }, {}, req);
}

/**
 * POST /shapes/:roomId
 * Persist a full-state snapshot of all shapes as a Chat message.
 * Called by the frontend auto-save debounce. Requires authentication.
 */
export async function saveShapesHandler(req: Request, url: URL) {
  const roomId = Number(url.pathname.split("/")[2]);
  if (!roomId) {
    return corsResponse({ message: "Invalid roomId" }, { status: 400 }, req);
  }
  const userId = middleware(req);
  if (!userId) {
    return corsResponse({ message: "Unauthorized" }, { status: 403 }, req);
  }
  try {
    const body = await req.json();
    const message = JSON.stringify({ type: "full-state", shapes: body.shapes ?? [] });
    await prismaClient.chat.create({
      data: { roomId, message, userId },
    });
    return corsResponse({ ok: true }, {}, req);
  } catch {
    return corsResponse({ message: "Failed to save shapes" }, { status: 500 }, req);
  }
}

/**
 * GET /shapes/:roomId
 * Retrieve the latest full-state snapshot for a room.
 * Used as a lightweight alternative to fetching the entire chat history.
 */
export async function getShapesHandler(url: URL, req: Request) {
  const roomId = Number(url.pathname.split("/")[2]);
  if (!roomId) {
    return corsResponse({ message: "Invalid roomId" }, { status: 400 }, req);
  }
  try {
    const msg = await prismaClient.chat.findFirst({
      where: {
        roomId,
        message: { startsWith: '{"type":"full-state"' },
      },
      orderBy: { id: "desc" },
    });
    if (!msg) {
      return corsResponse({ shapes: [] }, {}, req);
    }
    const parsed = JSON.parse(msg.message);
    return corsResponse({ shapes: parsed.shapes ?? [] }, {}, req);
  } catch {
    return corsResponse({ shapes: [] }, {}, req);
  }
}
