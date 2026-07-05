import { Tool } from "@/components/Canvas";
import { getExistingShapes } from "./http";
import rough from "roughjs";

type Point = [number, number];

export interface ShapeStyle {
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
  roughness: number;
  opacity: number;
}

export function defaultStyle(): ShapeStyle {
  return {
    strokeColor: "#ffffff",
    backgroundColor: "transparent",
    strokeWidth: 1.5,
    roughness: 2,
    opacity: 1,
  };
}

type Shape =
  | {
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      style: ShapeStyle;
      groupId?: string;
    }
  | {
      type: "circle";
      centerX: number;
      centerY: number;
      radius: number;
      style: ShapeStyle;
      groupId?: string;
    }
  | {
      type: "pencil";
      points: Point[];
      style: ShapeStyle;
      groupId?: string;
    }
  | {
      type: "diamond";
      centerX: number;
      centerY: number;
      width: number;
      height: number;
      style: ShapeStyle;
      groupId?: string;
    }
  | {
      type: "arrow";
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      arrowHeadSize: number;
      style: ShapeStyle;
      groupId?: string;
    }
  | {
      type: "line";
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      style: ShapeStyle;
      groupId?: string;
    }
  | {
      type: "text";
      x: number;
      y: number;
      text: string;
      fontSize: number;
      style: ShapeStyle;
      groupId?: string;
    }
  | {
      type: "image";
      x: number;
      y: number;
      width: number;
      height: number;
      imageData: string;
      style: ShapeStyle;
      groupId?: string;
    }
  | {
      type: "eraser";
      x: number;
      y: number;
      radius: number;
      style: ShapeStyle;
      groupId?: string;
    };

function ensureShapesHaveStyle(shapes: Shape[]): Shape[] {
  return shapes.map((s) => {
    if (!("style" in s)) {
      (s as any).style = defaultStyle();
    }
    return s;
  });
}

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private existingShapes: Shape[];
  private roomId: string;
  private clicked: boolean;
  private startX = 0;
  private startY = 0;
  private selectedTool: Tool = "circle";
  private pencilPoints: Point[] = [];
  private panX = 0;
  private panY = 0;
  private zoom = 1;
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private spacePressed = false;
  private undoStack: Shape[][] = [];
  private redoStack: Shape[][] = [];
  private selectedShapeIndices: Set<number> = new Set();
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private clipboard: Shape[] = [];
  private rc: ReturnType<typeof rough.canvas>;
  private selectionChangeCallback: ((shape: Shape | null) => void) | null = null;

  socket: WebSocket;

  constructor(canvas: HTMLCanvasElement, roomId: string, socket: WebSocket) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.existingShapes = [];
    this.roomId = roomId;
    this.socket = socket;
    this.clicked = false;
    this.rc = rough.canvas(this.canvas);
    this.init();
    this.initHandlers();
    this.initMouseHandlers();
    this.initKeyboardHandlers();
    this.initWheelHandler();
  }

  destroy() {
    this.canvas.removeEventListener("mousedown", this.mouseDownHandler);
    this.canvas.removeEventListener("mouseup", this.mouseUpHandler);
    this.canvas.removeEventListener("mousemove", this.mouseMoveHandler);
    this.canvas.removeEventListener("dblclick", this.dblClickHandler);
    this.canvas.removeEventListener("wheel", this.wheelHandler);
    window.removeEventListener("keydown", this.keyDownHandler);
    window.removeEventListener("keyup", this.keyUpHandler);
  }

  setSelectionChangeCallback(cb: (shape: Shape | null) => void) {
    this.selectionChangeCallback = cb;
  }

  getSelectedShape(): Shape | null {
    if (this.selectedShapeIndices.size === 0) return null;
    const first = [...this.selectedShapeIndices][0];
    return this.existingShapes[first] ?? null;
  }

  getSelectedShapes(): Shape[] {
    return [...this.selectedShapeIndices]
      .map((i) => this.existingShapes[i])
      .filter(Boolean);
  }

  updateShapeStyle(updates: Partial<ShapeStyle>) {
    if (this.selectedShapeIndices.size === 0) return;
    this.undoStack.push([...this.existingShapes]);
    this.redoStack = [];
    for (const i of this.selectedShapeIndices) {
      const shape = this.existingShapes[i];
      if (shape) Object.assign(shape.style, updates);
    }
    this.syncShapes();
  }

  setTool(tool: Tool) {
    this.selectedTool = tool;
    if (tool !== "select") {
      this.selectedShapeIndices.clear();
      this.notifySelection();
      this.clearCanvas();
    }
  }

  zoomIn() {
    const newZoom = Math.min(this.zoom * 1.2, 10);
    this.panX =
      this.canvas.width / 2 -
      ((this.canvas.width / 2 - this.panX) * newZoom) / this.zoom;
    this.panY =
      this.canvas.height / 2 -
      ((this.canvas.height / 2 - this.panY) * newZoom) / this.zoom;
    this.zoom = newZoom;
    this.clearCanvas();
  }

  zoomOut() {
    const newZoom = Math.max(this.zoom / 1.2, 0.1);
    this.panX =
      this.canvas.width / 2 -
      ((this.canvas.width / 2 - this.panX) * newZoom) / this.zoom;
    this.panY =
      this.canvas.height / 2 -
      ((this.canvas.height / 2 - this.panY) * newZoom) / this.zoom;
    this.zoom = newZoom;
    this.clearCanvas();
  }

  async init() {
    const shapes = await getExistingShapes(this.roomId);
    this.existingShapes = ensureShapesHaveStyle(shapes);
    this.clearCanvas();
  }

  private notifySelection() {
    this.selectionChangeCallback?.(this.getSelectedShape());
  }

  initHandlers() {
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type == "chat") {
        const inner = JSON.parse(message.message);
        if (inner.type === "full-state") {
          this.undoStack = [];
          this.redoStack = [];
          this.existingShapes = ensureShapesHaveStyle(inner.shapes);
        } else {
          inner.shape = ensureShapesHaveStyle([inner.shape])[0];
          this.existingShapes.push(inner.shape);
        }
        this.selectedShapeIndices.clear();
        this.notifySelection();
        this.clearCanvas();
      }
    };
  }

  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "rgba(0, 0, 0)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);

    for (let i = 0; i < this.existingShapes.length; i++) {
      const shape = this.existingShapes[i];
      const st = shape.style;
      const isSelected = this.selectedShapeIndices.has(i);
      const stroke = isSelected ? "rgba(59, 130, 246)" : st.strokeColor;
      const opts = {
        stroke,
        strokeWidth: st.strokeWidth / this.zoom,
        roughness: st.roughness,
        bowing: 1.5,
        fill: st.backgroundColor !== "transparent" ? st.backgroundColor : undefined,
      };

      this.ctx.globalAlpha = st.opacity;

      if (shape.type === "rect") {
        const x = Math.min(shape.x, shape.x + shape.width);
        const y = Math.min(shape.y, shape.y + shape.height);
        const w = Math.abs(shape.width);
        const h = Math.abs(shape.height);
        this.rc.rectangle(x, y, w, h, opts);
      } else if (shape.type === "circle") {
        this.rc.circle(
          shape.centerX,
          shape.centerY,
          Math.abs(shape.radius) * 2,
          opts,
        );
      } else if (shape.type === "diamond") {
        const x = shape.centerX - shape.width / 2;
        const y = shape.centerY - shape.height / 2;
        this.rc.rectangle(x, y, shape.width, shape.height, opts);
      } else if (shape.type === "pencil") {
        this.rc.linearPath(shape.points, opts);
      } else if (shape.type === "line") {
        this.rc.line(shape.startX, shape.startY, shape.endX, shape.endY, opts);
      } else if (shape.type === "arrow") {
        const dx = shape.endX - shape.startX;
        const dy = shape.endY - shape.startY;
        const angle = Math.atan2(dy, dx);
        this.rc.line(shape.startX, shape.startY, shape.endX, shape.endY, opts);
      } else if (shape.type === "text") {
        this.ctx.font = `${shape.fontSize}px Arial`;
        this.ctx.fillStyle = st.strokeColor;
        this.ctx.globalAlpha = st.opacity;
        this.ctx.fillText(shape.text, shape.x, shape.y);
      } else if (shape.type === "eraser") {
        this.ctx.save();
        this.ctx.translate(this.panX, this.panY);
        this.ctx.scale(this.zoom, this.zoom);
        this.ctx.globalAlpha = st.opacity;
        this.ctx.globalCompositeOperation = "destination-out";
        this.ctx.beginPath();
        this.ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }

      this.ctx.globalAlpha = 1;

      if (isSelected) {
        this.ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
        this.ctx.lineWidth = 2 / this.zoom;
        this.ctx.setLineDash([5 / this.zoom, 5 / this.zoom]);
        const bounds = this.getShapeBounds(shape);
        if (bounds) {
          this.ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
        }
        this.ctx.setLineDash([]);
      }
    }

    this.ctx.restore();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    this.selectedShapeIndices.clear();
    this.notifySelection();
    this.redoStack.push([...this.existingShapes]);
    this.existingShapes = this.undoStack.pop()!;
    this.syncShapes();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.selectedShapeIndices.clear();
    this.notifySelection();
    this.undoStack.push([...this.existingShapes]);
    this.existingShapes = this.redoStack.pop()!;
    this.syncShapes();
  }

  deleteSelectedShape() {
    if (this.selectedShapeIndices.size === 0) return;
    this.undoStack.push([...this.existingShapes]);
    this.redoStack = [];
    const sorted = [...this.selectedShapeIndices].sort((a, b) => b - a);
    for (const i of sorted) {
      this.existingShapes.splice(i, 1);
    }
    this.selectedShapeIndices.clear();
    this.notifySelection();
    this.syncShapes();
  }

  copySelectedShape() {
    if (this.selectedShapeIndices.size === 0) return;
    this.clipboard = [];
    for (const i of this.selectedShapeIndices) {
      const shape = this.existingShapes[i];
      if (shape) this.clipboard.push(JSON.parse(JSON.stringify(shape)));
    }
  }

  pasteClipboard() {
    if (this.clipboard.length === 0) return;
    const offset = 20;
    for (const original of this.clipboard) {
      const copy = JSON.parse(JSON.stringify(original)) as Shape;
      if (copy.type === "rect") {
        copy.x += offset;
        copy.y += offset;
      } else if (copy.type === "circle") {
        copy.centerX += offset;
        copy.centerY += offset;
      } else if (copy.type === "pencil") {
        copy.points = copy.points.map(([x, y]) => [x + offset, y + offset]);
      } else if (copy.type === "diamond") {
        copy.centerX += offset;
        copy.centerY += offset;
      } else if (copy.type === "arrow" || copy.type === "line") {
        copy.startX += offset;
        copy.startY += offset;
        copy.endX += offset;
        copy.endY += offset;
      } else if (copy.type === "text") {
        copy.x += offset;
        copy.y += offset;
      } else if (copy.type === "image") {
        copy.x += offset;
        copy.y += offset;
      }
      delete (copy as any).groupId;
      this.commitShape(copy);
    }
  }

  group() {
    if (this.selectedShapeIndices.size < 2) return;
    const groupId = crypto.randomUUID();
    this.undoStack.push([...this.existingShapes]);
    this.redoStack = [];
    for (const i of this.selectedShapeIndices) {
      const shape = this.existingShapes[i];
      if (shape) (shape as any).groupId = groupId;
    }
    this.syncShapes();
  }

  ungroup() {
    if (this.selectedShapeIndices.size === 0) return;
    this.undoStack.push([...this.existingShapes]);
    this.redoStack = [];
    for (const i of this.selectedShapeIndices) {
      const shape = this.existingShapes[i];
      if (shape) delete (shape as any).groupId;
    }
    this.syncShapes();
  }

  private syncShapes() {
    this.clearCanvas();
    this.socket.send(
      JSON.stringify({
        type: "chat",
        message: JSON.stringify({
          type: "full-state",
          shapes: this.existingShapes,
        }),
        roomId: this.roomId,
      }),
    );
  }

  exportToPng() {
    const allX: number[] = [];
    const allY: number[] = [];
    
    for (const s of this.existingShapes) {
      if (s.type === "rect") {
        allX.push(s.x, s.x + s.width);
        allY.push(s.y, s.y + s.height);
      } else if (s.type === "circle") {
        allX.push(s.centerX - Math.abs(s.radius), s.centerX + Math.abs(s.radius));
        allY.push(s.centerY - Math.abs(s.radius), s.centerY + Math.abs(s.radius));
      } else if (s.type === "pencil") {
        allX.push(...s.points.map(p => p[0]));
        allY.push(...s.points.map(p => p[1]));
      } else if (s.type === "diamond") {
        allX.push(s.centerX - s.width / 2, s.centerX + s.width / 2);
        allY.push(s.centerY - s.height / 2, s.centerY + s.height / 2);
      } else if (s.type === "arrow" || s.type === "line") {
        allX.push(s.startX, s.endX);
        allY.push(s.startY, s.endY);
      } else if (s.type === "text") {
        allX.push(s.x, s.x + 100);
        allY.push(s.y, s.y + 16);
      } else if (s.type === "eraser") {
        allX.push(s.x - s.radius, s.x + s.radius);
        allY.push(s.y - s.radius, s.y + s.radius);
      }
    }
    const pad = 20;
    const minX = Math.min(...allX) - pad;
    const minY = Math.min(...allY) - pad;
    const maxX = Math.max(...allX) + pad;
    const maxY = Math.max(...allY) + pad;
    const w = maxX - minX;
    const h = maxY - minY;

    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.translate(-minX, -minY);

    const rc = rough.canvas(offscreen);
    const opts = { stroke: "#fff", strokeWidth: 1.5, roughness: 2, bowing: 1.5 };


    for (const shape of this.existingShapes) {
      if (shape.type === "rect") {
        const x = Math.min(shape.x, shape.x + shape.width);
        const y = Math.min(shape.y, shape.y + shape.height);
        rc.rectangle(x, y, Math.abs(shape.width), Math.abs(shape.height), opts);
      } else if (shape.type === "circle") {
        rc.circle(shape.centerX, shape.centerY, Math.abs(shape.radius) * 2, opts);
      } else if (shape.type === "pencil" && shape.points.length > 1) {
        rc.linearPath(shape.points, opts);
      }
    }
    this.download(offscreen.toDataURL("image/png"), "drawing.png");
  }

  exportToSvg() {
    const allX: number[] = [];
    const allY: number[] = [];
    
    for (const s of this.existingShapes) {
      if (s.type === "rect") {
        allX.push(s.x, s.x + s.width);
        allY.push(s.y, s.y + s.height);
      } else if (s.type === "circle") {
        allX.push(s.centerX - Math.abs(s.radius), s.centerX + Math.abs(s.radius));
        allY.push(s.centerY - Math.abs(s.radius), s.centerY + Math.abs(s.radius));
      } else if (s.type === "pencil") {
        allX.push(...s.points.map(p => p[0]));
        allY.push(...s.points.map(p => p[1]));
      } else if (s.type === "diamond") {
        allX.push(s.centerX - s.width / 2, s.centerX + s.width / 2);
        allY.push(s.centerY - s.height / 2, s.centerY + s.height / 2);
      } else if (s.type === "arrow" || s.type === "line") {
        allX.push(s.startX, s.endX);
        allY.push(s.startY, s.endY);
      } else if (s.type === "text") {
        allX.push(s.x, s.x + 100);
        allY.push(s.y, s.y + 16);
      } else if (s.type === "image") {
        allX.push(s.x, s.x + s.width);
        allY.push(s.y, s.y + s.height);
      } else if (s.type === "eraser") {
        allX.push(s.x - s.radius, s.x + s.radius);
        allY.push(s.y - s.radius, s.y + s.radius);
      }
    }
    const pad = 20;
    const minX = Math.min(...allX) - pad;
    const minY = Math.min(...allY) - pad;
    const maxX = Math.max(...allX) + pad;
    const maxY = Math.max(...allY) + pad;
    const w = maxX - minX;
    const h = maxY - minY;

    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("width", String(w));
    svgEl.setAttribute("height", String(h));
    svgEl.setAttribute("viewBox", `${minX} ${minY} ${w} ${h}`);

    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", "black");
    svgEl.appendChild(bg);

    const rs = rough.svg(svgEl);
    const opts = { stroke: "white", strokeWidth: 1.5, roughness: 2, bowing: 1.5 };

    for (const shape of this.existingShapes) {
      if (shape.type === "rect") {
        const x = Math.min(shape.x, shape.x + shape.width);
        const y = Math.min(shape.y, shape.y + shape.height);
        svgEl.appendChild(
          rs.rectangle(x, y, Math.abs(shape.width), Math.abs(shape.height), opts),
        );
      } else if (shape.type === "circle") {
        svgEl.appendChild(
          rs.circle(shape.centerX, shape.centerY, Math.abs(shape.radius) * 2, opts),
        );
      } else if (shape.type === "diamond" && shape.width && shape.height) {
        const x = shape.centerX - shape.width / 2;
        const y = shape.centerY - shape.height / 2;
        svgEl.appendChild(
          rs.rectangle(x, y, shape.width, shape.height, opts),
        );
      } else if (shape.type === "pencil" && shape.points.length > 1) {
        svgEl.appendChild(rs.linearPath(shape.points, opts));
      } else if (shape.type === "arrow" && shape.startX && shape.endX && shape.startY && shape.endY) {
        svgEl.appendChild(
          rs.line(shape.startX, shape.startY, shape.endX, shape.endY, opts),
        );
      } else if (shape.type === "line" && shape.startX && shape.endX && shape.startY && shape.endY) {
        svgEl.appendChild(
          rs.line(shape.startX, shape.startY, shape.endX, shape.endY, opts),
        );
      } else if (shape.type === "text" && shape.text) {
        const tspan = document.createElementNS("http://www.w3.org/2000/svg", "text");
        tspan.setAttribute("x", String(shape.x));
        tspan.setAttribute("y", String(shape.y));
        tspan.setAttribute("font-family", "Arial");
        tspan.setAttribute("font-size", String(shape.fontSize));
        tspan.setAttribute("fill", "white");
        tspan.textContent = shape.text;
        svgEl.appendChild(tspan);
      } else if (shape.type === "eraser" && shape.radius) {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", String(shape.x));
        circle.setAttribute("cy", String(shape.y));
        circle.setAttribute("r", String(shape.radius));
        circle.setAttribute("fill", "none");
        circle.setAttribute("stroke", "none");
        svgEl.appendChild(circle);
      }
    }

    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    this.download(URL.createObjectURL(blob), "drawing.svg");
  }

  private download(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private getCanvasCoords(clientX: number, clientY: number): Point {
    return [
      (clientX - this.panX) / this.zoom,
      (clientY - this.panY) / this.zoom,
    ];
  }

  private hitTest(point: Point): number | null {
    for (let i = this.existingShapes.length - 1; i >= 0; i--) {
      const shape = this.existingShapes[i];
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
          const dist = this.distToSegment(
            point,
            shape.points[j - 1],
            shape.points[j],
          );
          if (dist < 10 / this.zoom) return i;
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
      }
    }
    return null;
  }

  private getShapeBounds(
    shape: Shape,
  ): { x: number; y: number; w: number; h: number } | null {
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
    }
    return null;
  }

  private distToSegment(p: Point, a: Point, b: Point): number {
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

  mouseDownHandler = (e: MouseEvent) => {
    if (this.spacePressed || e.button === 1) {
      this.isPanning = true;
      this.panStartX = e.clientX - this.panX;
      this.panStartY = e.clientY - this.panY;
      return;
    }

    this.clicked = true;
    const coords = this.getCanvasCoords(e.clientX, e.clientY);
    this.startX = coords[0];
    this.startY = coords[1];

    if (this.selectedTool === "select") {
      const hit = this.hitTest(coords);
      if (hit !== null) {
        const hitShape = this.existingShapes[hit];

        if (e.shiftKey) {
          if (this.selectedShapeIndices.has(hit)) {
            this.selectedShapeIndices.delete(hit);
          } else {
            this.selectedShapeIndices.add(hit);
          }
          this.notifySelection();
          this.clearCanvas();
          return;
        }

        if (hitShape.groupId) {
          const groupIndices: number[] = [];
          for (let i = 0; i < this.existingShapes.length; i++) {
            if (this.existingShapes[i].groupId === hitShape.groupId) {
              groupIndices.push(i);
            }
          }
          this.selectedShapeIndices = new Set(groupIndices);
        } else {
          this.selectedShapeIndices = new Set([hit]);
        }
        this.notifySelection();
        this.isDragging = true;
        this.dragOffsetX = coords[0];
        this.dragOffsetY = coords[1];
        this.undoStack.push([...this.existingShapes]);
        this.redoStack = [];
      } else {
        this.selectedShapeIndices.clear();
        this.notifySelection();
        this.clearCanvas();
      }
      return;
    }

    if (this.selectedTool === "text") {
      const text = window.prompt("Enter text:", "Hello");
      if (text) {
        this.commitShape({
          type: "text",
          x: coords[0],
          y: coords[1],
          text,
          fontSize: 20,
          style: defaultStyle(),
        });
      }
      this.clicked = false;
      return;
    }

    if (this.selectedTool === "pencil") {
      this.pencilPoints = [[coords[0], coords[1]]];
    }
  };

  private commitShape(shape: Shape) {
    this.undoStack.push([...this.existingShapes]);
    this.redoStack = [];
    this.existingShapes.push(shape);
    this.socket.send(
      JSON.stringify({
        type: "chat",
        message: JSON.stringify({ shape }),
        roomId: this.roomId,
      }),
    );
  }

  mouseUpHandler = (e: MouseEvent) => {
    this.isPanning = false;
    this.isDragging = false;
    this.clicked = false;

    if (this.selectedTool === "select") {
      if (this.selectedShapeIndices.size > 0) {
        this.syncShapes();
      }
      return;
    }

    if (this.selectedTool === "pencil") {
      if (this.pencilPoints.length < 2) return;
      this.commitShape({
        type: "pencil",
        points: [...this.pencilPoints],
        style: defaultStyle(),
      });
      this.pencilPoints = [];
      return;
    }

    const coords = this.getCanvasCoords(e.clientX, e.clientY);
    const width = coords[0] - this.startX;
    const height = coords[1] - this.startY;

    let shape: Shape | null = null;
    if (this.selectedTool === "rect") {
      shape = {
        type: "rect",
        x: this.startX,
        y: this.startY,
        height,
        width,
        style: defaultStyle(),
      };
    } else if (this.selectedTool === "circle") {
      const radius = Math.max(width, height) / 2;
      shape = {
        type: "circle",
        radius: radius,
        centerX: this.startX + radius,
        centerY: this.startY + radius,
        style: defaultStyle(),
      };
    } else if (this.selectedTool === "diamond") {
      shape = {
        type: "diamond",
        centerX: this.startX + width / 2,
        centerY: this.startY + height / 2,
        width: Math.abs(width),
        height: Math.abs(height),
        style: defaultStyle(),
      };
    } else if (this.selectedTool === "arrow") {
      shape = {
        type: "arrow",
        startX: this.startX,
        startY: this.startY,
        endX: coords[0],
        endY: coords[1],
        arrowHeadSize: 10,
        style: defaultStyle(),
      };
    } else if (this.selectedTool === "line") {
      shape = {
        type: "line",
        startX: this.startX,
        startY: this.startY,
        endX: coords[0],
        endY: coords[1],
        style: defaultStyle(),
      };
    }

    if (!shape) return;
    this.commitShape(shape);
  };

  mouseMoveHandler = (e: MouseEvent) => {
    if (this.isPanning) {
      this.panX = e.clientX - this.panStartX;
      this.panY = e.clientY - this.panStartY;
      this.clearCanvas();
      return;
    }

    if (!this.clicked) return;

    const coords = this.getCanvasCoords(e.clientX, e.clientY);

    if (this.selectedTool === "select" && this.isDragging) {
      const dx = coords[0] - this.dragOffsetX;
      const dy = coords[1] - this.dragOffsetY;

      for (const i of this.selectedShapeIndices) {
        const shape = this.existingShapes[i];
        if (!shape) continue;

        if (shape.type === "rect") {
          shape.x += dx;
          shape.y += dy;
        } else if (shape.type === "circle") {
          shape.centerX += dx;
          shape.centerY += dy;
        } else if (shape.type === "diamond") {
          shape.centerX += dx;
          shape.centerY += dy;
        } else if (shape.type === "pencil") {
          for (const pt of shape.points) {
            pt[0] += dx;
            pt[1] += dy;
          }
        } else if (shape.type === "arrow" || shape.type === "line") {
          shape.startX += dx;
          shape.startY += dy;
          shape.endX += dx;
          shape.endY += dy;
        } else if (shape.type === "text" || shape.type === "image") {
          shape.x += dx;
          shape.y += dy;
        } else if (shape.type === "eraser") {
          shape.x += dx;
          shape.y += dy;
        }
      }

      this.dragOffsetX = coords[0];
      this.dragOffsetY = coords[1];
      this.clearCanvas();
      return;
    }

    if (this.selectedTool === "pencil") {
      this.pencilPoints.push([coords[0], coords[1]]);
      this.clearCanvas();
      this.ctx.save();
      this.ctx.translate(this.panX, this.panY);
      this.ctx.scale(this.zoom, this.zoom);
      this.rc.linearPath(this.pencilPoints, {
        stroke: "rgba(255, 255, 255)",
        strokeWidth: 1.5 / this.zoom,
        roughness: 2,
        bowing: 1.5,
      });
      this.ctx.restore();
      return;
    }

    const width = coords[0] - this.startX;
    const height = coords[1] - this.startY;
    this.clearCanvas();

    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);

    const prevOpts = {
      stroke: "rgba(255, 255, 255)",
      strokeWidth: 1.5 / this.zoom,
      roughness: 2,
      bowing: 1.5,
    };

    if (this.selectedTool === "rect") {
      const x = Math.min(this.startX, this.startX + width);
      const y = Math.min(this.startY, this.startY + height);
      const w = Math.abs(width);
      const h = Math.abs(height);
      this.rc.rectangle(x, y, w, h, prevOpts);
    } else if (this.selectedTool === "circle") {
      const radius = Math.max(width, height) / 2;
      const centerX = this.startX + radius;
      const centerY = this.startY + radius;
      this.rc.circle(centerX, centerY, Math.abs(radius) * 2, prevOpts);
    } else if (this.selectedTool === "diamond") {
      const centerX = (this.startX + width / 2);
      const centerY = (this.startY + height / 2);
      this.rc.rectangle(centerX - 25, centerY - 25, 50, 50, prevOpts);
    } else if (this.selectedTool === "arrow") {
      this.rc.line(this.startX, this.startY, coords[0], coords[1], prevOpts);
    } else if (this.selectedTool === "line") {
      this.rc.line(this.startX, this.startY, coords[0], coords[1], prevOpts);
    } else if (this.selectedTool === "text") {
      this.ctx.font = "20px Arial";
      this.ctx.fillStyle = "rgba(255,255,255,0.4)";
      this.ctx.fillText("|", this.startX, this.startY);
    } else if (this.selectedTool === "eraser") {
      this.ctx.save();
      this.ctx.translate(this.panX, this.panY);
      this.ctx.scale(this.zoom, this.zoom);
      this.ctx.globalCompositeOperation = "destination-out";
      this.ctx.beginPath();
      this.ctx.arc(coords[0], coords[1], 20, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    this.ctx.restore();
  };

  dblClickHandler = (e: MouseEvent) => {
    if (this.selectedTool !== "select") return;
    const coords = this.getCanvasCoords(e.clientX, e.clientY);
    const hit = this.hitTest(coords);
    if (hit === null) return;
    const shape = this.existingShapes[hit];
    if (shape.type !== "text") return;
    const newText = window.prompt("Edit text:", shape.text);
    if (newText) {
      this.undoStack.push([...this.existingShapes]);
      this.redoStack = [];
      shape.text = newText;
      this.syncShapes();
    }
  };

  initMouseHandlers() {
    this.canvas.addEventListener("mousedown", this.mouseDownHandler);
    this.canvas.addEventListener("mouseup", this.mouseUpHandler);
    this.canvas.addEventListener("mousemove", this.mouseMoveHandler);
    this.canvas.addEventListener("dblclick", this.dblClickHandler);
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  wheelHandler = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(Math.max(this.zoom * delta, 0.1), 10);

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
    this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;
    this.clearCanvas();
  };

  initWheelHandler() {
    this.canvas.addEventListener("wheel", this.wheelHandler, {
      passive: false,
    });
  }

  keyDownHandler = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      e.preventDefault();
      this.spacePressed = true;
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      e.preventDefault();
      this.copySelectedShape();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      e.preventDefault();
      this.pasteClipboard();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "g") {
      e.preventDefault();
      if (e.shiftKey) {
        this.ungroup();
      } else {
        this.group();
      }
      return;
    }

    if (
      (e.code === "Delete" || e.code === "Backspace") &&
      this.selectedShapeIndices.size > 0
    ) {
      e.preventDefault();
      this.deleteSelectedShape();
    }
  };

  keyUpHandler = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      this.spacePressed = false;
    }
  };

  initKeyboardHandlers() {
    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);
  }
}
