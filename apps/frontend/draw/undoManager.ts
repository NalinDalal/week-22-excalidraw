import { Shape, ShapeDiff, ShapeStyle } from "./shapes";

function styleEqual(a: ShapeStyle | undefined, b: ShapeStyle | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.strokeColor === b.strokeColor &&
    a.backgroundColor === b.backgroundColor &&
    a.strokeWidth === b.strokeWidth &&
    a.roughness === b.roughness &&
    a.opacity === b.opacity
  );
}

function pointsEqual(a: [number, number][], b: [number, number][]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}

export function shapesEqual(a: Shape, b: Shape): boolean {
  if (a.type !== b.type) return false;
  if (!styleEqual(a.style, b.style)) return false;
  if (a.groupId !== b.groupId) return false;

  switch (a.type) {
    case "rect": {
      const r = b as typeof a;
      return a.x === r.x && a.y === r.y && a.width === r.width && a.height === r.height;
    }
    case "circle": {
      const c = b as typeof a;
      return a.centerX === c.centerX && a.centerY === c.centerY && a.radius === c.radius;
    }
    case "diamond": {
      const d = b as typeof a;
      return a.centerX === d.centerX && a.centerY === d.centerY && a.width === d.width && a.height === d.height;
    }
    case "pencil": {
      return pointsEqual(a.points, (b as typeof a).points);
    }
    case "arrow": {
      const ar = b as typeof a;
      return (
        a.startX === ar.startX && a.startY === ar.startY &&
        a.endX === ar.endX && a.endY === ar.endY &&
        a.arrowHeadSize === ar.arrowHeadSize
      );
    }
    case "line": {
      const l = b as typeof a;
      return a.startX === l.startX && a.startY === l.startY && a.endX === l.endX && a.endY === l.endY;
    }
    case "text": {
      const t = b as typeof a;
      return a.x === t.x && a.y === t.y && a.text === t.text && a.fontSize === t.fontSize;
    }
    case "image": {
      const im = b as typeof a;
      return a.x === im.x && a.y === im.y && a.width === im.width && a.height === im.height && a.imageData === im.imageData;
    }
    case "eraser": {
      const e = b as typeof a;
      return a.strokeWidth === e.strokeWidth && pointsEqual(a.points, e.points);
    }
  }
}

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
    } else if (!shapesEqual(shape, prevMap.get(id)!)) {
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
