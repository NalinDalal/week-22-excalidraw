import { z } from "zod";
import { prismaClient } from "@repo/db/client";
import { middleware } from "./middleware";
import { corsResponse } from "./response";

const CreateRoomSchema = z.object({
  name: z.string().min(3).max(20),
});

export async function createRoomHandler(req: Request) {
  const userId = middleware(req);
  if (!userId) {
    return corsResponse({ message: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const parsedData = CreateRoomSchema.safeParse(body);
  if (!parsedData.success) {
    return corsResponse({ message: "Incorrect inputs" }, { status: 400 });
  }

  try {
    const room = await prismaClient.room.create({
      data: { slug: parsedData.data.name, adminId: userId },
    });
    return corsResponse({ roomId: room.id });
  } catch {
    return corsResponse(
      { message: "Room already exists with this name" },
      { status: 411 },
    );
  }
}

export async function getChatsHandler(url: URL) {
  const roomId = Number(url.pathname.split("/")[2]);
  try {
    const messages = await prismaClient.chat.findMany({
      where: { roomId },
      orderBy: { id: "asc" },
      take: 1000,
    });
    return corsResponse({ messages });
  } catch {
    return corsResponse({ messages: [] });
  }
}

export async function getRoomHandler(url: URL) {
  const slug = url.pathname.split("/")[2];
  const room = await prismaClient.room.findFirst({ where: { slug } });
  return corsResponse({ room });
}
