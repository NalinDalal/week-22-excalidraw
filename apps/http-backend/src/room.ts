import { z } from "zod";
import { prismaClient } from "@repo/db/client";
import { middleware } from "./middleware";
import { corsResponse } from "./response";
import { readJsonBody } from "./body";

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

  const parsed = await readJsonBody<{ name: string }>(req);
  if ("error" in parsed) return parsed.error;
  const parsedData = CreateRoomSchema.safeParse(parsed.data);
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
 * Verify a room exists by ID. Returns the room or null.
 */
async function requireRoom(roomId: number) {
  return prismaClient.room.findUnique({ where: { id: roomId } });
}

/**
 * GET /chats/:roomId
 * Fetch up to 1000 chat messages (including shape data) for a room.
 * Requires authentication and room must exist.
 */
export async function getChatsHandler(url: URL, req: Request) {
  const roomId = Number(url.pathname.split("/")[2]);
  if (!roomId) {
    return corsResponse({ message: "Invalid roomId" }, { status: 400 }, req);
  }

  const userId = middleware(req);
  if (!userId) {
    return corsResponse({ message: "Unauthorized" }, { status: 403 }, req);
  }

  const room = await requireRoom(roomId);
  if (!room) {
    return corsResponse({ message: "Room not found" }, { status: 404 }, req);
  }

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
 * Requires authentication.
 */
export async function getRoomHandler(url: URL, req: Request) {
  const userId = middleware(req);
  if (!userId) {
    return corsResponse({ message: "Unauthorized" }, { status: 403 }, req);
  }

  const slug = url.pathname.split("/")[2];
  const room = await prismaClient.room.findFirst({
    where: { slug },
    select: { id: true, slug: true, createdAt: true, adminId: true },
  });
  if (!room) {
    return corsResponse({ message: "Room not found" }, { status: 404 }, req);
  }
  return corsResponse({ room }, {}, req);
}

/**
 * POST /shapes/:roomId
 * Persist a full-state snapshot of all shapes as a Chat message.
 * Called by the frontend auto-save debounce.
 * Requires authentication + room must exist + user must be the room admin.
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

  const room = await requireRoom(roomId);
  if (!room) {
    return corsResponse({ message: "Room not found" }, { status: 404 }, req);
  }

  if (room.adminId !== userId) {
    return corsResponse(
      { message: "Only the room admin can save shapes" },
      { status: 403 },
      req,
    );
  }

  try {
    const parsed = await readJsonBody<{ shapes?: any[] }>(req);
    if ("error" in parsed) return parsed.error;
    const message = JSON.stringify({ type: "full-state", shapes: parsed.data.shapes ?? [] });
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
 * Requires authentication and room must exist.
 */
export async function getShapesHandler(url: URL, req: Request) {
  const roomId = Number(url.pathname.split("/")[2]);
  if (!roomId) {
    return corsResponse({ message: "Invalid roomId" }, { status: 400 }, req);
  }

  const userId = middleware(req);
  if (!userId) {
    return corsResponse({ message: "Unauthorized" }, { status: 403 }, req);
  }

  const room = await requireRoom(roomId);
  if (!room) {
    return corsResponse({ message: "Room not found" }, { status: 404 }, req);
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
