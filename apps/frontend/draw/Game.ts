import { Tool } from "@/components/Canvas";
import { getExistingShapes } from "./http";
import rough from "roughjs";

type Point = { x: number; y: number };

type Shape =
  | {
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      type: "circle";
      centerX: number;
      centerY: number;
      radius: number;
    }
  | {
      type: "pencil";
      points: Point[];
    };

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
  private selectedShapeIndex: number | null = null;
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private rc: ReturnType<typeof rough.canvas>;

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
    this.canvas.removeEventListener("wheel", this.wheelHandler);
    window.removeEventListener("keydown", this.keyDownHandler);
    window.removeEventListener("keyup", this.keyUpHandler);
  }

  setTool(tool: Tool) {
    this.selectedTool = tool;
    if (tool !== "select") {
      this.selectedShapeIndex = null;
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
    this.existingShapes = await getExistingShapes(this.roomId);
    this.clearCanvas();
  }

  initHandlers() {
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type == "chat") {
        const inner = JSON.parse(message.message);
        if (inner.type === "full-state") {
          this.undoStack = [];
          this.redoStack = [];
          this.existingShapes = inner.shapes;
        } else {
          this.existingShapes.push(inner.shape);
        }
        this.selectedShapeIndex = null;
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
      const isSelected = i === this.selectedShapeIndex;
      const strokeColor = isSelected
        ? "rgba(59, 130, 246)"
        : "rgba(255, 255, 255)";
      const opts = {
        stroke: strokeColor,
        strokeWidth: 1.5,
        roughness: 2,
        bowing: 1.5,
      };

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
      } else if (shape.type === "pencil") {
        this.rc.linearPath(shape.points, opts);
      }
    }

    this.ctx.restore();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    this.selectedShapeIndex = null;
    this.redoStack.push([...this.existingShapes]);
    this.existingShapes = this.undoStack.pop()!;
    this.syncShapes();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.selectedShapeIndex = null;
    this.undoStack.push([...this.existingShapes]);
    this.existingShapes = this.redoStack.pop()!;
    this.syncShapes();
  }

  deleteSelectedShape() {
    if (this.selectedShapeIndex === null) return;
    this.undoStack.push([...this.existingShapes]);
    this.redoStack = [];
    this.existingShapes.splice(this.selectedShapeIndex, 1);
    this.selectedShapeIndex = null;
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
    const allX = this.existingShapes.flatMap((s) =>
      s.type === "rect"
        ? [Math.min(s.x, s.x + s.width), Math.max(s.x, s.x + s.width)]
        : s.type === "circle"
          ? [s.centerX - Math.abs(s.radius), s.centerX + Math.abs(s.radius)]
          : s.points.map((p) => p.x),
    );
    const allY = this.existingShapes.flatMap((s) =>
      s.type === "rect"
        ? [Math.min(s.y, s.y + s.height), Math.max(s.y, s.y + s.height)]
        : s.type === "circle"
          ? [s.centerY - Math.abs(s.radius), s.centerY + Math.abs(s.radius)]
          : s.points.map((p) => p.y),
    );
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
    const allX = this.existingShapes.flatMap((s) =>
      s.type === "rect"
        ? [Math.min(s.x, s.x + s.width), Math.max(s.x, s.x + s.width)]
        : s.type === "circle"
          ? [s.centerX - Math.abs(s.radius), s.centerX + Math.abs(s.radius)]
          : s.points.map((p) => p.x),
    );
    const allY = this.existingShapes.flatMap((s) =>
      s.type === "rect"
        ? [Math.min(s.y, s.y + s.height), Math.max(s.y, s.y + s.height)]
        : s.type === "circle"
          ? [s.centerY - Math.abs(s.radius), s.centerY + Math.abs(s.radius)]
          : s.points.map((p) => p.y),
    );
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
      } else if (shape.type === "pencil" && shape.points.length > 1) {
        svgEl.appendChild(rs.linearPath(shape.points, opts));
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

  private getCanvasCoords(clientX: number, clientY: number) {
    return {
      x: (clientX - this.panX) / this.zoom,
      y: (clientY - this.panY) / this.zoom,
    };
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
          point.x >= minX &&
          point.x <= maxX &&
          point.y >= minY &&
          point.y <= maxY
        ) {
          return i;
        }
      } else if (shape.type === "circle") {
        const dx = point.x - shape.centerX;
        const dy = point.y - shape.centerY;
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
      }
    }
    return null;
  }

  private distToSegment(p: Point, a: Point, b: Point): number {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const ab2 = abx * abx + aby * aby;
    let t = (apx * abx + apy * aby) / ab2;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * abx;
    const cy = a.y + t * aby;
    const dx = p.x - cx;
    const dy = p.y - cy;
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
    this.startX = coords.x;
    this.startY = coords.y;

    if (this.selectedTool === "select") {
      const hit = this.hitTest(coords);
      if (hit !== null) {
        this.selectedShapeIndex = hit;
        this.isDragging = true;
        this.dragOffsetX = coords.x;
        this.dragOffsetY = coords.y;
        this.undoStack.push([...this.existingShapes]);
        this.redoStack = [];
      } else {
        this.selectedShapeIndex = null;
        this.clearCanvas();
      }
      return;
    }

    if (this.selectedTool === "pencil") {
      this.pencilPoints = [{ x: coords.x, y: coords.y }];
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
      if (this.selectedShapeIndex !== null) {
        this.syncShapes();
      }
      return;
    }

    if (this.selectedTool === "pencil") {
      if (this.pencilPoints.length < 2) return;
      this.commitShape({
        type: "pencil",
        points: [...this.pencilPoints],
      });
      this.pencilPoints = [];
      return;
    }

    const coords = this.getCanvasCoords(e.clientX, e.clientY);
    const width = coords.x - this.startX;
    const height = coords.y - this.startY;

    let shape: Shape | null = null;
    if (this.selectedTool === "rect") {
      shape = {
        type: "rect",
        x: this.startX,
        y: this.startY,
        height,
        width,
      };
    } else if (this.selectedTool === "circle") {
      const radius = Math.max(width, height) / 2;
      shape = {
        type: "circle",
        radius: radius,
        centerX: this.startX + radius,
        centerY: this.startY + radius,
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
      const dx = coords.x - this.dragOffsetX;
      const dy = coords.y - this.dragOffsetY;
      const shape = this.existingShapes[this.selectedShapeIndex!];
      if (!shape) return;

      if (shape.type === "rect") {
        shape.x += dx;
        shape.y += dy;
      } else if (shape.type === "circle") {
        shape.centerX += dx;
        shape.centerY += dy;
      } else if (shape.type === "pencil") {
        for (const pt of shape.points) {
          pt.x += dx;
          pt.y += dy;
        }
      }

      this.dragOffsetX = coords.x;
      this.dragOffsetY = coords.y;
      this.clearCanvas();
      return;
    }

    if (this.selectedTool === "pencil") {
      this.pencilPoints.push({ x: coords.x, y: coords.y });
      this.clearCanvas();
      this.ctx.save();
      this.ctx.translate(this.panX, this.panY);
      this.ctx.scale(this.zoom, this.zoom);
      this.rc.linearPath(this.pencilPoints, {
        stroke: "rgba(255, 255, 255)",
        strokeWidth: 1.5,
        roughness: 2,
        bowing: 1.5,
      });
      this.ctx.restore();
      return;
    }

    const width = coords.x - this.startX;
    const height = coords.y - this.startY;
    this.clearCanvas();

    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);

    const prevOpts = {
      stroke: "rgba(255, 255, 255)",
      strokeWidth: 1.5,
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
    }

    this.ctx.restore();
  };

  initMouseHandlers() {
    this.canvas.addEventListener("mousedown", this.mouseDownHandler);
    this.canvas.addEventListener("mouseup", this.mouseUpHandler);
    this.canvas.addEventListener("mousemove", this.mouseMoveHandler);
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

    if (
      (e.code === "Delete" || e.code === "Backspace") &&
      this.selectedShapeIndex !== null
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
