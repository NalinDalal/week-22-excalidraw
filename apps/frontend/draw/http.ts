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

/**
 * Redirect to sign-in and clear stale token on 401 responses.
 */
function handleUnauthorized() {
  localStorage.removeItem("token");
  window.location.href = "/signin";
}

// Axios interceptor: if any request gets a 401, redirect to signin
axios.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      handleUnauthorized();
    }
    return Promise.reject(err);
  },
);

/**
 * Persist the current shapes as a full-state snapshot via HTTP.
 * Called by the auto-save debounce timer in Game.
 */
export async function saveShapes(roomId: string, shapes: Shape[]) {
  const token = localStorage.getItem("token");
  await axios.post(
    `${HTTP_BACKEND}/shapes/${roomId}`,
    { shapes },
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );
}

/**
 * Retrieve the latest full-state snapshot from the server.
 * Used as an alternative load path (currently unused by default).
 */
export async function getSavedShapes(roomId: string): Promise<Shape[]> {
  try {
    const res = await axios.get(`${HTTP_BACKEND}/shapes/${roomId}`);
    return res.data.shapes ?? [];
  } catch {
    return [];
  }
}

/**
 * Load all shapes from the chat history.
 * Handles both individual shape messages and full-state snapshots.
 * If a full-state snapshot is found, it takes precedence over individual messages.
 */
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
