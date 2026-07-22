import rough from "roughjs";
import { Shape, ShapeStyle, Bounds, Point, defaultStyle, getShapeBounds, distToSegment } from "./types";
import { Viewport } from "./viewport";

export function renderShape(
  shape: Shape,
  ctx: CanvasRenderingContext2D,
  roughInstance: ReturnType<typeof rough.canvas>,
  viewport: Viewport,
  isDark: boolean,
  imageCache: Map<string, HTMLImageElement>,
) {
  const st = shape.style ?? defaultStyle(isDark);
  const opts = {
    stroke: st.strokeColor,
    strokeWidth: st.strokeWidth / viewport.zoom,
    roughness: st.roughness,
    bowing: 1.5,
    fill: st.backgroundColor !== "transparent" ? st.backgroundColor : undefined,
  };
  ctx.globalAlpha = st.opacity;
  if (shape.type === "rect") {
    const x = Math.min(shape.x, shape.x + shape.width);
    const y = Math.min(shape.y, shape.y + shape.height);
    const w = Math.abs(shape.width);
    const h = Math.abs(shape.height);
    roughInstance.rectangle(x, y, w, h, opts);
  } else if (shape.type === "circle") {
    roughInstance.circle(shape.centerX, shape.centerY, Math.abs(shape.radius) * 2, opts);
  } else if (shape.type === "diamond") {
    const cx = shape.centerX;
    const cy = shape.centerY;
    const hw = shape.width / 2;
    const hh = shape.height / 2;
    roughInstance.polygon(
      [[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]],
      opts,
    );
  } else if (shape.type === "pencil") {
    roughInstance.linearPath(shape.points, opts);
  } else if (shape.type === "line") {
    roughInstance.line(shape.startX, shape.startY, shape.endX, shape.endY, opts);
  } else if (shape.type === "arrow") {
    const dx = shape.endX - shape.startX;
    const dy = shape.endY - shape.startY;
    const angle = Math.atan2(dy, dx);
    roughInstance.line(shape.startX, shape.startY, shape.endX, shape.endY, opts);
    const headLen = shape.arrowHeadSize;
    const a1 = angle - Math.PI / 6;
    const a2 = angle + Math.PI / 6;
    ctx.beginPath();
    ctx.moveTo(shape.endX, shape.endY);
    ctx.lineTo(shape.endX - headLen * Math.cos(a1), shape.endY - headLen * Math.sin(a1));
    ctx.lineTo(shape.endX - headLen * Math.cos(a2), shape.endY - headLen * Math.sin(a2));
    ctx.closePath();
    ctx.fillStyle = st.strokeColor;
    ctx.fill();
  } else if (shape.type === "text") {
    ctx.font = `${shape.fontSize}px Arial`;
    ctx.fillStyle = st.strokeColor;
    ctx.fillText(shape.text, shape.x, shape.y);
  } else if (shape.type === "image") {
    const img = imageCache.get(shape.imageData);
    if (img?.complete) {
      ctx.drawImage(img, shape.x, shape.y, shape.width, shape.height);
    }
  } else if (shape.type === "eraser") {
    // Legacy eraser strokes are no longer rendered
  }
  ctx.globalAlpha = 1;
}

export function drawSelection(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  selectedIndices: Set<number>,
  viewport: Viewport,
) {
  ctx.save();
  ctx.translate(viewport.panX, viewport.panY);
  ctx.scale(viewport.zoom, viewport.zoom);
  for (const i of selectedIndices) {
    const bounds = getShapeBounds(shapes[i]);
    if (!bounds) continue;
    ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
    ctx.lineWidth = 2 / viewport.zoom;
    ctx.setLineDash([5 / viewport.zoom, 5 / viewport.zoom]);
    ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

export function drawDragSelect(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  viewport: Viewport,
) {
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const w = Math.abs(currentX - startX);
  const h = Math.abs(currentY - startY);
  ctx.strokeStyle = "rgba(59, 130, 246, 0.8)";
  ctx.lineWidth = 1.5 / viewport.zoom;
  ctx.setLineDash([4 / viewport.zoom, 4 / viewport.zoom]);
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
  ctx.fillRect(x, y, w, h);
  ctx.setLineDash([]);
}

export function hitTest(
  point: Point,
  shapes: Shape[],
  zoom: number,
): number | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    if (shape.type === "rect") {
      const minX = Math.min(shape.x, shape.x + shape.width);
      const maxX = Math.max(shape.x, shape.x + shape.width);
      const minY = Math.min(shape.y, shape.y + shape.height);
      const maxY = Math.max(shape.y, shape.y + shape.height);
      if (
        point[0] >= minX &&
        point[0] <= maxX &&
        point[1] >= minY &&
        point[1] <= maxY
      ) {
        return i;
      }
    } else if (shape.type === "circle") {
      const dx = point[0] - shape.centerX;
      const dy = point[1] - shape.centerY;
      if (Math.sqrt(dx * dx + dy * dy) <= Math.abs(shape.radius)) {
        return i;
      }
    } else if (shape.type === "pencil") {
      for (let j = 1; j < shape.points.length; j++) {
        const dist = distToSegment(point, shape.points[j - 1], shape.points[j]);
        if (dist < 10 / zoom) return i;
      }
    } else if (shape.type === "text") {
      const textWidth = shape.text.length * (shape.fontSize * 0.6);
      const textHeight = shape.fontSize;
      if (
        point[0] >= shape.x &&
        point[0] <= shape.x + textWidth &&
        point[1] >= shape.y - textHeight &&
        point[1] <= shape.y
      ) {
        return i;
      }
    } else if (shape.type === "image") {
      if (
        point[0] >= shape.x &&
        point[0] <= shape.x + shape.width &&
        point[1] >= shape.y &&
        point[1] <= shape.y + shape.height
      ) {
        return i;
      }
    } else if (shape.type === "diamond") {
      const hw = shape.width / 2;
      const hh = shape.height / 2;
      if (
        point[0] >= shape.centerX - hw &&
        point[0] <= shape.centerX + hw &&
        point[1] >= shape.centerY - hh &&
        point[1] <= shape.centerY + hh
      ) {
        return i;
      }
    } else if (shape.type === "arrow" || shape.type === "line") {
      const dist = distToSegment(
        point,
        [shape.startX, shape.startY],
        [shape.endX, shape.endY],
      );
      if (dist < 10 / zoom) return i;
    } else if (shape.type === "eraser") {
      for (let j = 1; j < shape.points.length; j++) {
        const dist = distToSegment(point, shape.points[j - 1], shape.points[j]);
        if (dist < shape.strokeWidth / 2) return i;
      }
    }
  }
  return null;
}

export function hitTestWithRadius(
  point: Point,
  shapes: Shape[],
  radius: number,
): number | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const bounds = getShapeBounds(shapes[i]);
    if (!bounds) continue;
    const closestX = Math.max(bounds.x, Math.min(point[0], bounds.x + bounds.w));
    const closestY = Math.max(bounds.y, Math.min(point[1], bounds.y + bounds.h));
    const dx = point[0] - closestX;
    const dy = point[1] - closestY;
    if (dx * dx + dy * dy <= radius * radius) {
      return i;
    }
  }
  return null;
}

export function eraserIntersectsShape(
  eraserPoints: Point[],
  shape: Shape,
  eraserRadius: number,
): boolean {
  const bounds = getShapeBounds(shape);
  if (!bounds) return false;
  const pad = eraserRadius;
  const bx = bounds.x - pad;
  const by = bounds.y - pad;
  const bw = bounds.w + pad * 2;
  const bh = bounds.h + pad * 2;

  for (const pt of eraserPoints) {
    if (
      pt[0] >= bx &&
      pt[0] <= bx + bw &&
      pt[1] >= by &&
      pt[1] <= by + bh
    ) {
      return true;
    }
  }
  return false;
}
