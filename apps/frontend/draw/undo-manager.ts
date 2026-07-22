import { Shape, ShapeDiff } from "./types";

function computeDiff(prev: Shape[], next: Shape[]): ShapeDiff {
  const prevMap = new Map<string, Shape>();
  for (const s of prev) {
    if (s.id) prevMap.set(s.id, s);
  }
  const nextMap = new Map<string, Shape>();
  for (const s of next) {
    if (s.id) nextMap.set(s.id, s);
  }

  const added = new Map<string, Shape>();
  const removed = new Map<string, Shape>();
  const modified = new Map<string, { prev: Shape; next: Shape }>();

  for (const [id, shape] of nextMap) {
    if (!prevMap.has(id)) {
      added.set(id, shape);
    } else if (JSON.stringify(shape) !== JSON.stringify(prevMap.get(id))) {
      modified.set(id, { prev: prevMap.get(id)!, next: shape });
    }
  }
  for (const [id, shape] of prevMap) {
    if (!nextMap.has(id)) {
      removed.set(id, shape);
    }
  }
  return { added, removed, modified };
}

function applyDiff(shapes: Shape[], diff: ShapeDiff): Shape[] {
  const result = [...shapes];
  for (const [id, shape] of diff.removed) {
    const idx = result.findIndex((s) => s.id === id);
    if (idx !== -1) result.splice(idx, 1);
  }
  for (const [id, shape] of diff.added) {
    if (!result.some((s) => s.id === id)) result.push(shape);
  }
  for (const [id, { next }] of diff.modified) {
    const idx = result.findIndex((s) => s.id === id);
    if (idx !== -1) result[idx] = next;
  }
  return result;
}

function applyReverseDiff(shapes: Shape[], diff: ShapeDiff): Shape[] {
  const result = [...shapes];
  for (const [id, shape] of diff.added) {
    const idx = result.findIndex((s) => s.id === id);
    if (idx !== -1) result.splice(idx, 1);
  }
  for (const [id, shape] of diff.removed) {
    if (!result.some((s) => s.id === id)) result.push(shape);
  }
  for (const [id, { prev }] of diff.modified) {
    const idx = result.findIndex((s) => s.id === id);
    if (idx !== -1) result[idx] = prev;
  }
  return result;
}

export class UndoManager {
  private undoStack: ShapeDiff[] = [];
  private redoStack: ShapeDiff[] = [];

  push(currentShapes: Shape[], nextShapes: Shape[]) {
    const diff = computeDiff(currentShapes, nextShapes);
    if (diff.added.size > 0 || diff.removed.size > 0 || diff.modified.size > 0) {
      this.undoStack.push(diff);
      this.redoStack = [];
    }
  }

  undo(shapes: Shape[]): Shape[] | null {
    if (this.undoStack.length === 0) return null;
    const diff = this.undoStack.pop()!;
    this.redoStack.push(diff);
    return applyReverseDiff(shapes, diff);
  }

  redo(shapes: Shape[]): Shape[] | null {
    if (this.redoStack.length === 0) return null;
    const diff = this.redoStack.pop()!;
    this.undoStack.push(diff);
    return applyDiff(shapes, diff);
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
