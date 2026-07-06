import { z } from "zod";
import { prismaClient } from "@repo/db/client";
import { middleware } from "./middleware";
import { corsResponse } from "./response";
import { readJsonBody } from "./body";
import { rateLimit } from "./ratelimit";

/** Maximum serialized message size written to the DB (512 KB) */
const MAX_DB_ROW_SIZE = 512 * 1024;

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

  if (!rateLimit(`shapes:${userId}`, 10, 60_000)) {
    return corsResponse(
      { message: "Too many saves. Please slow down." },
      { status: 429 },
      req,
    );
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
    const parsed = await readJsonBody<{ shapes?: any[]; baseVersion?: number }>(req);
    if ("error" in parsed) return parsed.error;

    // Optimistic concurrency: reject if another save happened since the client last loaded
    if (parsed.data.baseVersion != null) {
      const latest = await prismaClient.chat.findFirst({
        where: {
          roomId,
          message: { startsWith: '{"type":"full-state"' },
        },
        orderBy: { id: "desc" },
        select: { id: true, message: true },
      });
      const currentVersion = latest?.id ?? 0;
      if (parsed.data.baseVersion !== currentVersion) {
        const currentShapes = latest
          ? (JSON.parse(latest.message).shapes ?? [])
          : [];
        return corsResponse(
          { message: "Conflict — shapes changed", version: currentVersion, shapes: currentShapes },
          { status: 409 },
          req,
        );
      }
    }

    const message = JSON.stringify({ type: "full-state", shapes: parsed.data.shapes ?? [] });
    if (Buffer.byteLength(message, "utf-8") > MAX_DB_ROW_SIZE) {
      return corsResponse(
        { message: "Payload too large — reduce image sizes or remove images" },
        { status: 413 },
        req,
      );
    }
    const created = await prismaClient.chat.create({
      data: { roomId, message, userId },
    });
    return corsResponse({ ok: true, version: created.id }, {}, req);
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
      return corsResponse({ shapes: [], version: 0 }, {}, req);
    }
    const parsed = JSON.parse(msg.message);
    return corsResponse({ shapes: parsed.shapes ?? [], version: msg.id }, {}, req);
  } catch {
    return corsResponse({ shapes: [] }, {}, req);
  }
}
