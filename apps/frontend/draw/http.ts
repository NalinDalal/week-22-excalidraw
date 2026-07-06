import { HTTP_BACKEND } from "@/config";
import axios from "axios";

/** Visual style properties shared by all shape types */
interface ShapeStyle {
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
  roughness: number;
  opacity: number;
}

/** Discriminated union of every drawable shape in the whiteboard */
type Shape =
  | { type: "rect"; x: number; y: number; width: number; height: number; style?: ShapeStyle; groupId?: string; id?: string }
  | { type: "circle"; centerX: number; centerY: number; radius: number; style?: ShapeStyle; groupId?: string; id?: string }
  | { type: "pencil"; points: [number, number][]; style?: ShapeStyle; groupId?: string; id?: string }
  | { type: "diamond"; centerX: number; centerY: number; width: number; height: number; style?: ShapeStyle; groupId?: string; id?: string }
  | { type: "arrow"; startX: number; startY: number; endX: number; endY: number; arrowHeadSize: number; style?: ShapeStyle; groupId?: string; id?: string }
  | { type: "line"; startX: number; startY: number; endX: number; endY: number; style?: ShapeStyle; groupId?: string; id?: string }
  | { type: "text"; x: number; y: number; text: string; fontSize: number; style?: ShapeStyle; groupId?: string; id?: string }
  | { type: "image"; x: number; y: number; width: number; height: number; imageData: string; style?: ShapeStyle; groupId?: string; id?: string }
  | { type: "eraser"; points: [number, number][]; strokeWidth: number; style?: ShapeStyle; groupId?: string; id?: string };

/** Build auth headers from the stored token */
function authHeaders(): Record<string, string> | undefined {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

/**
 * Persist the current shapes as a full-state snapshot via HTTP.
 * Called by the auto-save debounce timer in Game.
 */
export async function saveShapes(roomId: string, shapes: Shape[], baseVersion: number) {
  const res = await axios.post(
    `${HTTP_BACKEND}/shapes/${roomId}`,
    { shapes, baseVersion },
    { headers: authHeaders() },
  );
  return res.data;
}

export interface ShapesResponse {
  shapes: Shape[];
  version: number;
}

/**
 * Load all shapes from the chat history.
 * Handles both individual shape messages and full-state snapshots.
 * If a full-state snapshot is found, it takes precedence over individual messages.
 * Returns the shapes and the latest message ID (used for optimistic concurrency).
 */
export async function getExistingShapes(roomId: string): Promise<ShapesResponse> {
  const res = await axios.get(`${HTTP_BACKEND}/chats/${roomId}`, {
    headers: authHeaders(),
  });
  const messages = res.data.messages;
  if (!messages || messages.length === 0) return { shapes: [], version: 0 };

  const shapes: Shape[] = [];
  let latestFullState: Shape[] | null = null;
  let latestVersion = 0;

  for (const { id, message } of messages) {
    try {
      const data = JSON.parse(message);
      if (data.type === "full-state" && Array.isArray(data.shapes)) {
        latestFullState = data.shapes;
        latestVersion = id;
      } else if (data.shape) {
        shapes.push(data.shape);
      }
    } catch {
      // skip malformed messages
    }
  }

  if (latestFullState) return { shapes: latestFullState, version: latestVersion };
  return { shapes, version: latestVersion };
}
