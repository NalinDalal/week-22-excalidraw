import { Tool } from "@/components/Canvas";
import { getExistingShapes } from "./http";

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

  socket: WebSocket;

  constructor(canvas: HTMLCanvasElement, roomId: string, socket: WebSocket) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.existingShapes = [];
    this.roomId = roomId;
    this.socket = socket;
    this.clicked = false;
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

      this.ctx.strokeStyle = isSelected
        ? "rgba(59, 130, 246)"
        : "rgba(255, 255, 255)";
      this.ctx.lineWidth = (isSelected ? 3 : 2) / this.zoom;

      if (shape.type === "rect") {
        this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
      } else if (shape.type === "circle") {
        this.ctx.beginPath();
        this.ctx.arc(
          shape.centerX,
          shape.centerY,
          Math.abs(shape.radius),
          0,
          Math.PI * 2,
        );
        this.ctx.stroke();
        this.ctx.closePath();
      } else if (shape.type === "pencil") {
        this.drawPencilPath(shape.points);
      }
    }

    this.ctx.restore();
  }

  private drawPencilPath(points: Point[]) {
    if (points.length < 2) return;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    this.ctx.stroke();
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
      this.ctx.strokeStyle = "rgba(255, 255, 255)";
      this.ctx.lineWidth = 2 / this.zoom;
      this.drawPencilPath(this.pencilPoints);
      this.ctx.restore();
      return;
    }

    const width = coords.x - this.startX;
    const height = coords.y - this.startY;
    this.clearCanvas();

    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);
    this.ctx.strokeStyle = "rgba(255, 255, 255)";
    this.ctx.lineWidth = 2 / this.zoom;

    if (this.selectedTool === "rect") {
      this.ctx.strokeRect(this.startX, this.startY, width, height);
    } else if (this.selectedTool === "circle") {
      const radius = Math.max(width, height) / 2;
      const centerX = this.startX + radius;
      const centerY = this.startY + radius;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, Math.abs(radius), 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.closePath();
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
