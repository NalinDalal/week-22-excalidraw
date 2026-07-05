import { HTTP_BACKEND } from "@/config";
import axios from "axios";

interface ShapeStyle {
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
  roughness: number;
  opacity: number;
}

type Shape =
  | { type: "rect"; x: number; y: number; width: number; height: number; style: ShapeStyle; groupId?: string }
  | { type: "circle"; centerX: number; centerY: number; radius: number; style: ShapeStyle; groupId?: string }
  | { type: "pencil"; points: [number, number][]; style: ShapeStyle; groupId?: string }
  | { type: "diamond"; centerX: number; centerY: number; width: number; height: number; style: ShapeStyle; groupId?: string }
  | { type: "arrow"; startX: number; startY: number; endX: number; endY: number; arrowHeadSize: number; style: ShapeStyle; groupId?: string }
  | { type: "line"; startX: number; startY: number; endX: number; endY: number; style: ShapeStyle; groupId?: string }
  | { type: "text"; x: number; y: number; text: string; fontSize: number; style: ShapeStyle; groupId?: string }
  | { type: "image"; x: number; y: number; width: number; height: number; imageData: string; style: ShapeStyle; groupId?: string }
  | { type: "eraser"; x: number; y: number; radius: number; style: ShapeStyle; groupId?: string };

export async function saveShapes(roomId: string, shapes: Shape[]) {
  await axios.post(`${HTTP_BACKEND}/shapes/${roomId}`, { shapes });
}

export async function getSavedShapes(roomId: string): Promise<Shape[]> {
  try {
    const res = await axios.get(`${HTTP_BACKEND}/shapes/${roomId}`);
    return res.data.shapes ?? [];
  } catch {
    return [];
  }
}

export async function getExistingShapes(roomId: string): Promise<Shape[]> {
  const res = await axios.get(`${HTTP_BACKEND}/chats/${roomId}`);
  const messages = res.data.messages;
  if (!messages || messages.length === 0) return [];

  const shapes: Shape[] = [];
  let latestFullState: Shape[] | null = null;

  for (const { message } of messages) {
    try {
      const data = JSON.parse(message);
      if (data.type === "full-state" && Array.isArray(data.shapes)) {
        latestFullState = data.shapes;
      } else if (data.shape) {
        shapes.push(data.shape);
      }
    } catch {
      // skip malformed messages
    }
  }

  if (latestFullState) return latestFullState;
  return shapes;
}
