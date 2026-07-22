export type Point = [number, number];

export type Tool =
  | "select"
  | "circle"
  | "rect"
  | "pencil"
  | "diamond"
  | "arrow"
  | "line"
  | "text"
  | "image"
  | "eraser";

export interface ShapeStyle {
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
  roughness: number;
  opacity: number;
}

export function defaultStyle(isDark = true): ShapeStyle {
  return {
    strokeColor: isDark ? "#ffffff" : "#000000",
    backgroundColor: "transparent",
    strokeWidth: 1.5,
    roughness: 0,
    opacity: 1,
  };
}

export type Shape =
  | {
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      style?: ShapeStyle;
      groupId?: string;
      id?: string;
    }
  | {
      type: "circle";
      centerX: number;
      centerY: number;
      radius: number;
      style?: ShapeStyle;
      groupId?: string;
      id?: string;
    }
  | {
      type: "pencil";
      points: Point[];
      style?: ShapeStyle;
      groupId?: string;
      id?: string;
    }
  | {
      type: "diamond";
      centerX: number;
      centerY: number;
      width: number;
      height: number;
      style?: ShapeStyle;
      groupId?: string;
      id?: string;
    }
  | {
      type: "arrow";
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      arrowHeadSize: number;
      style?: ShapeStyle;
      groupId?: string;
      id?: string;
    }
  | {
      type: "line";
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      style?: ShapeStyle;
      groupId?: string;
      id?: string;
    }
  | {
      type: "text";
      x: number;
      y: number;
      text: string;
      fontSize: number;
      style?: ShapeStyle;
      groupId?: string;
      id?: string;
    }
  | {
      type: "image";
      x: number;
      y: number;
      width: number;
      height: number;
      imageData: string;
      style?: ShapeStyle;
      groupId?: string;
      id?: string;
    }
  | {
      type: "eraser";
      points: Point[];
      strokeWidth: number;
      style?: ShapeStyle;
      groupId?: string;
      id?: string;
    };

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShapeDiff {
  added: Map<string, Shape>;
  removed: Map<string, Shape>;
  modified: Map<string, { prev: Shape; next: Shape }>;
}

export function ensureShapesHaveStyle(shapes: Shape[]): Shape[] {
  return shapes.map((s) => {
    if (!("style" in s)) {
      (s as any).style = defaultStyle();
    }
    return s;
  });
}

/** Shortest distance from point p to line segment ab */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const ab2 = abx * abx + aby * aby;
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx = a[0] + t * abx;
  const cy = a[1] + t * aby;
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

export function getShapeBounds(
  shape: Shape,
): Bounds | null {
  if (shape.type === "rect") {
    const x = Math.min(shape.x, shape.x + shape.width);
    const y = Math.min(shape.y, shape.y + shape.height);
    return { x, y, w: Math.abs(shape.width), h: Math.abs(shape.height) };
  } else if (shape.type === "circle") {
    return {
      x: shape.centerX - Math.abs(shape.radius),
      y: shape.centerY - Math.abs(shape.radius),
      w: Math.abs(shape.radius) * 2,
      h: Math.abs(shape.radius) * 2,
    };
  } else if (shape.type === "diamond") {
    return {
      x: shape.centerX - shape.width / 2,
      y: shape.centerY - shape.height / 2,
      w: shape.width,
      h: shape.height,
    };
  } else if (shape.type === "pencil" && shape.points.length > 0) {
    const xs = shape.points.map((p) => p[0]);
    const ys = shape.points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  } else if (shape.type === "arrow" || shape.type === "line") {
    return {
      x: Math.min(shape.startX, shape.endX),
      y: Math.min(shape.startY, shape.endY),
      w: Math.abs(shape.endX - shape.startX),
      h: Math.abs(shape.endY - shape.startY),
    };
  } else if (shape.type === "text") {
    const textWidth = shape.text.length * (shape.fontSize * 0.6);
    return {
      x: shape.x,
      y: shape.y - shape.fontSize,
      w: textWidth,
      h: shape.fontSize,
    };
  } else if (shape.type === "image") {
    return { x: shape.x, y: shape.y, w: shape.width, h: shape.height };
  } else if (shape.type === "eraser" && shape.points.length > 0) {
    const xs = shape.points.map((p) => p[0]);
    const ys = shape.points.map((p) => p[1]);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  }
  return null;
}
