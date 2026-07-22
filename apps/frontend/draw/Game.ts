import { getExistingShapes, saveShapes } from "./http";
import rough from "roughjs";
import {
  Tool,
  Shape,
  ShapeStyle,
  Point,
  defaultStyle,
  ensureShapesHaveStyle,
  getShapeBounds,
} from "./types";
import { UndoManager, shapesEqual } from "./undo-manager";
import { Viewport } from "./viewport";
import {
  renderShape,
  drawSelection,
  drawDragSelect,
  hitTest,
  eraserIntersectsShape,
} from "./renderer";
import { exportToPng, exportToSvg, exportToJson } from "./exporter";
import {
  startTextEdit,
  removeTextOverlayFn,
  offsetShapeCopy,
  moveShape,
} from "./input-handler";

/**
 * Core drawing engine.
 *
 * Composes focused modules for viewport, undo, rendering, export, and input.
 * Manages the HTML Canvas, shape state, selection, grouping, pan/zoom,
 * WebSocket sync, and auto-save persistence.
 */
export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private existingShapes: Shape[];
  private roomId: string;
  private clicked = false;
  private startX = 0;
  private startY = 0;
  private selectedTool: Tool = "circle";
  private pencilPoints: Point[] = [];
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private spacePressed = false;
  private selectedShapeIndices: Set<number> = new Set();
  private isDragging = false;
  private isSelecting = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private dragStartShapes: Shape[] | null = null;
  private clipboard: Shape[] = [];
  private rc: ReturnType<typeof rough.canvas>;
  private selectionChangeCallback: ((shape: Shape | null) => void) | null = null;
  private themeChangeCallback: ((isDark: boolean) => void) | null = null;
  private eraserPoints: Point[] = [];
  private eraserRadius = 20;
  private imageCache: Map<string, HTMLImageElement> = new Map();
  private textEditOverlay: HTMLTextAreaElement | null = null;
  private cacheCanvas: HTMLCanvasElement;
  private cacheCtx: CanvasRenderingContext2D;
  private cacheRc: ReturnType<typeof rough.canvas>;
  private cacheValid = false;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private autoSaveDisabled = false;
  private lastSavedVersion = 0;
  private lastSyncedShapes: Shape[] = [];
  private pinchStartDist = 0;
  private pinchStartZoom = 1;
  private lastTapTime = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  isDark: boolean;
  currentStyle: ShapeStyle;

  socket: WebSocket;

  private undoManager = new UndoManager();
  private viewport = new Viewport();

  constructor(canvas: HTMLCanvasElement, roomId: string, socket: WebSocket) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.existingShapes = [];
    this.roomId = roomId;
    this.socket = socket;
    this.isDark = document.documentElement.classList.contains("dark");
    this.currentStyle = defaultStyle(this.isDark);
    this.rc = rough.canvas(this.canvas);
    this.cacheCanvas = document.createElement("canvas");
    this.cacheCanvas.width = canvas.width;
    this.cacheCanvas.height = canvas.height;
    this.cacheCtx = this.cacheCanvas.getContext("2d")!;
    this.cacheRc = rough.canvas(this.cacheCanvas);
    this.init();
    this.initHandlers();
    this.initMouseHandlers();
    this.initKeyboardHandlers();
    this.initWheelHandler();
    this.initTouchHandlers();
  }

  destroy() {
    this.removeTextOverlay();
    this.cancelAutoSave();
    this.canvas.removeEventListener("mousedown", this.mouseDownHandler);
    this.canvas.removeEventListener("mouseup", this.mouseUpHandler);
    this.canvas.removeEventListener("mousemove", this.mouseMoveHandler);
    this.canvas.removeEventListener("dblclick", this.dblClickHandler);
    this.canvas.removeEventListener("wheel", this.wheelHandler);
    this.canvas.removeEventListener("touchstart", this.touchStartHandler);
    this.canvas.removeEventListener("touchmove", this.touchMoveHandler);
    this.canvas.removeEventListener("touchend", this.touchEndHandler);
    this.canvas.removeEventListener("touchcancel", this.touchEndHandler);
    window.removeEventListener("keydown", this.keyDownHandler);
    window.removeEventListener("keyup", this.keyUpHandler);
  }

  setSelectionChangeCallback(cb: (shape: Shape | null) => void) {
    this.selectionChangeCallback = cb;
  }

  setThemeChangeCallback(cb: (isDark: boolean) => void) {
    this.themeChangeCallback = cb;
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
    const prev = [...this.existingShapes];
    for (const i of this.selectedShapeIndices) {
      const shape = this.existingShapes[i];
      if (!shape) continue;
      if (!shape.style) shape.style = { ...this.currentStyle };
      Object.assign(shape.style, updates);
    }
    this.undoManager.push(prev, this.existingShapes);
    this.syncShapes();
  }

  setTool(tool: Tool) {
    this.selectedTool = tool;
    this.removeTextOverlay();
    if (tool !== "select") {
      this.selectedShapeIndices.clear();
      this.notifySelection();
      this.clearCanvas();
    }
  }

  setTheme(isDark: boolean) {
    this.isDark = isDark;
    this.currentStyle = defaultStyle(this.isDark);
    this.themeChangeCallback?.(this.isDark);
    this.invalidateCache();
    this.clearCanvas();
  }

  setCurrentStyle(style: ShapeStyle) {
    this.currentStyle = style;
  }

  zoomIn() {
    this.viewport.zoomIn(this.canvas.width, this.canvas.height);
    this.invalidateCache();
    this.clearCanvas();
  }

  zoomOut() {
    this.viewport.zoomOut(this.canvas.width, this.canvas.height);
    this.invalidateCache();
    this.clearCanvas();
  }

  async init() {
    const { shapes, version } = await getExistingShapes(this.roomId);
    this.existingShapes = ensureShapesHaveStyle(
      shapes.filter((s) => s.type !== "eraser"),
    );
    this.lastSyncedShapes = structuredClone(this.existingShapes);
    this.lastSavedVersion = version;
    this.invalidateCache();
    this.clearCanvas();
  }

  private notifySelection() {
    this.selectionChangeCallback?.(this.getSelectedShape());
  }

  initHandlers() {
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "shape-diff") {
        const { added, modified, removed } = message;

        if (Array.isArray(removed)) {
          for (const id of removed) {
            const idx = this.existingShapes.findIndex((s) => s.id === id);
            if (idx !== -1) this.existingShapes.splice(idx, 1);
          }
        }

        if (Array.isArray(added)) {
          for (const shape of ensureShapesHaveStyle(added)) {
            this.existingShapes.push(shape);
          }
        }

        if (Array.isArray(modified)) {
          for (const shape of ensureShapesHaveStyle(modified)) {
            if (!shape.id) continue;
            const idx = this.existingShapes.findIndex((s) => s.id === shape.id);
            if (idx !== -1) {
              this.existingShapes[idx] = shape;
            } else {
              this.existingShapes.push(shape);
            }
          }
        }

        this.lastSyncedShapes = structuredClone(this.existingShapes);
        this.selectedShapeIndices.clear();
        this.notifySelection();
        this.invalidateCache();
        this.clearCanvas();
        return;
      }

      if (message.type == "chat") {
        const inner = JSON.parse(message.message);
        if (inner.type === "full-state") {
          this.undoManager.clear();
          this.existingShapes = ensureShapesHaveStyle(inner.shapes);
          this.lastSyncedShapes = structuredClone(this.existingShapes);
          this.selectedShapeIndices.clear();
          this.notifySelection();
          this.invalidateCache();
          this.clearCanvas();
        } else {
          inner.shape = ensureShapesHaveStyle([inner.shape])[0];
          if (
            !inner.shape.id ||
            !this.existingShapes.some((s) => (s as any).id === inner.shape.id)
          ) {
            this.existingShapes.push(inner.shape);
            this.lastSyncedShapes = structuredClone(this.existingShapes);
            this.selectedShapeIndices.clear();
            this.notifySelection();
            this.invalidateCache();
            this.clearCanvas();
          }
        }
      }
    };
  }

  private invalidateCache() {
    this.cacheValid = false;
  }

  private cancelAutoSave() {
    if (this.autoSaveTimer !== null) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  private scheduleAutoSave() {
    if (this.autoSaveDisabled) return;
    this.cancelAutoSave();
    this.autoSaveTimer = setTimeout(() => {
      saveShapes(this.roomId, this.existingShapes, this.lastSavedVersion)
        .then((res) => {
          this.lastSavedVersion = res.data.version ?? this.lastSavedVersion;
        })
        .catch((err) => {
          if (err?.response?.status === 409) {
            const remoteShapes: Shape[] = err.response.data.shapes ?? [];
            const localIds = new Set(this.existingShapes.map((s) => s.id));
            const merged = [
              ...remoteShapes,
              ...this.existingShapes.filter((s) => !localIds.has(s.id)),
            ];
            this.existingShapes = merged;
            this.lastSavedVersion = err.response.data.version ?? this.lastSavedVersion;
            this.invalidateCache();
            this.clearCanvas();
          }
          this.scheduleAutoSave();
        });
    }, 2000);
  }

  disableAutoSave() {
    this.autoSaveDisabled = true;
    this.cancelAutoSave();
  }

  private buildCache() {
    this.cacheCanvas.width = this.canvas.width;
    this.cacheCanvas.height = this.canvas.height;
    this.cacheCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.cacheCtx.fillStyle = this.isDark ? "rgba(0, 0, 0)" : "rgba(255, 255, 255)";
    this.cacheCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.cacheCtx.save();
    this.cacheCtx.translate(this.viewport.panX, this.viewport.panY);
    this.cacheCtx.scale(this.viewport.zoom, this.viewport.zoom);
    for (const shape of this.existingShapes) {
      renderShape(shape, this.cacheCtx, this.cacheRc, this.viewport.zoom, this.isDark, this.imageCache);
    }
    this.cacheCtx.restore();
    this.cacheValid = true;
  }

  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = this.isDark ? "rgba(0, 0, 0)" : "rgba(255, 255, 255)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (
      !this.cacheValid ||
      this.cacheCanvas.width !== this.canvas.width ||
      this.cacheCanvas.height !== this.canvas.height
    ) {
      this.buildCache();
    }
    this.ctx.drawImage(this.cacheCanvas, 0, 0);
    drawSelection(this.ctx, this.existingShapes, this.selectedShapeIndices, this.viewport);
  }

  private removeTextOverlay() {
    removeTextOverlayFn(this.textEditOverlay);
    this.textEditOverlay = null;
  }

  private syncShapes() {
    this.invalidateCache();
    this.clearCanvas();
    this.scheduleAutoSave();

    const added: Shape[] = [];
    const modified: Shape[] = [];
    const removed: string[] = [];

    const prevMap = new Map<string, Shape>();
    for (const s of this.lastSyncedShapes) {
      if (s.id) prevMap.set(s.id, s);
    }

    const seen = new Set<string>();
    for (const shape of this.existingShapes) {
      if (!shape.id) continue;
      seen.add(shape.id);
      const prev = prevMap.get(shape.id);
      if (!prev) {
        added.push(shape);
      } else if (!shapesEqual(prev, shape)) {
        modified.push(shape);
      }
    }
    for (const [id] of prevMap) {
      if (!seen.has(id)) removed.push(id);
    }

    if (added.length === 0 && modified.length === 0 && removed.length === 0) return;

    this.socket.send(
      JSON.stringify({
        type: "shape-diff",
        roomId: this.roomId,
        added,
        modified,
        removed,
      }),
    );

    this.lastSyncedShapes = structuredClone(this.existingShapes);
  }

  private commitShape(shape: Shape) {
    (shape as any).id = crypto.randomUUID();
    if (!shape.style) {
      shape.style = { ...this.currentStyle };
    }
    const prev = [...this.existingShapes];
    this.existingShapes.push(shape);
    this.undoManager.push(prev, this.existingShapes);
    this.syncShapes();
  }

  undo() {
    const result = this.undoManager.undo(this.existingShapes);
    if (!result) return;
    this.removeTextOverlay();
    this.selectedShapeIndices.clear();
    this.notifySelection();
    this.existingShapes = result;
    this.syncShapes();
  }

  redo() {
    const result = this.undoManager.redo(this.existingShapes);
    if (!result) return;
    this.removeTextOverlay();
    this.selectedShapeIndices.clear();
    this.notifySelection();
    this.existingShapes = result;
    this.syncShapes();
  }

  deleteSelectedShape() {
    if (this.selectedShapeIndices.size === 0) return;
    const prev = [...this.existingShapes];
    const sorted = [...this.selectedShapeIndices].sort((a, b) => b - a);
    for (const i of sorted) {
      this.existingShapes.splice(i, 1);
    }
    this.undoManager.push(prev, this.existingShapes);
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
      offsetShapeCopy(copy, offset);
      delete (copy as any).groupId;
      this.commitShape(copy);
    }
  }

  setArrowHeadSize(size: number) {
    if (this.selectedShapeIndices.size === 0) return;
    const prev = [...this.existingShapes];
    for (const i of this.selectedShapeIndices) {
      const shape = this.existingShapes[i];
      if (shape?.type === "arrow") {
        shape.arrowHeadSize = size;
      }
    }
    this.undoManager.push(prev, this.existingShapes);
    this.syncShapes();
  }

  group() {
    if (this.selectedShapeIndices.size < 2) return;
    const groupId = crypto.randomUUID();
    const prev = [...this.existingShapes];
    for (const i of this.selectedShapeIndices) {
      const shape = this.existingShapes[i];
      if (shape) (shape as any).groupId = groupId;
    }
    this.undoManager.push(prev, this.existingShapes);
    this.syncShapes();
  }

  ungroup() {
    if (this.selectedShapeIndices.size === 0) return;
    const prev = [...this.existingShapes];
    for (const i of this.selectedShapeIndices) {
      const shape = this.existingShapes[i];
      if (shape) delete (shape as any).groupId;
    }
    this.undoManager.push(prev, this.existingShapes);
    this.syncShapes();
  }

  exportToPng() {
    exportToPng(this.existingShapes, this.isDark, this.imageCache);
  }

  exportToSvg() {
    exportToSvg(this.existingShapes, this.isDark);
  }

  exportToJson() {
    exportToJson(this.existingShapes);
  }

  importFromJson(jsonString: string) {
    try {
      const parsed = JSON.parse(jsonString);
      const shapes = parsed.shapes ?? (Array.isArray(parsed) ? parsed : [parsed]);
      const prev = [...this.existingShapes];
      this.existingShapes = ensureShapesHaveStyle(
        shapes.filter((s: Shape) => s.type !== "eraser"),
      );
      this.undoManager.push(prev, this.existingShapes);
      this.selectedShapeIndices.clear();
      this.notifySelection();
      this.syncShapes();
    } catch {
      alert("Invalid JSON file");
    }
  }

  // ─── Input handlers ────────────────────────────────────────────

  private startTextEdit(
    canvasX: number,
    canvasY: number,
    existingText?: string,
    existingIndex?: number,
  ) {
    this.textEditOverlay = startTextEdit(
      canvasX,
      canvasY,
      this.viewport.zoom,
      this.viewport.panX,
      this.viewport.panY,
      this.isDark,
      existingText,
      existingIndex,
      {
        removeTextOverlay: () => this.removeTextOverlay(),
        pushUndo: (prev) => this.undoManager.push(prev, this.existingShapes),
        syncShapes: () => this.syncShapes(),
        commitShape: (shape) => this.commitShape(shape),
        setClicked: (v) => (this.clicked = v),
      },
      this.existingShapes,
    );
  }

  mouseDownHandler = (e: MouseEvent) => {
    if (this.spacePressed || e.button === 1) {
      this.isPanning = true;
      this.panStartX = e.clientX - this.viewport.panX;
      this.panStartY = e.clientY - this.viewport.panY;
      return;
    }
    this.handlePointerDown(e.clientX, e.clientY, e.shiftKey);
  };

  private handlePointerDown(clientX: number, clientY: number, shiftKey: boolean) {
    this.clicked = true;
    this.lastPointerX = clientX;
    this.lastPointerY = clientY;
    const coords = this.viewport.getCanvasCoords(clientX, clientY);
    this.startX = coords[0];
    this.startY = coords[1];

    if (this.selectedTool === "select") {
      const hit = hitTest(coords, this.existingShapes, this.viewport.zoom);
      if (hit !== null) {
        const hitShape = this.existingShapes[hit];

        if (shiftKey) {
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
        this.dragStartShapes = [...this.existingShapes];
      } else {
        this.selectedShapeIndices.clear();
        this.notifySelection();
        this.isSelecting = true;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
      }
      return;
    }

    if (this.selectedTool === "text") {
      this.startTextEdit(coords[0], coords[1]);
      return;
    }

    if (this.selectedTool === "image") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const img = new Image();
          img.onload = () => {
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            const maxDim = 400;
            const scale = Math.min(1, maxDim / Math.max(w, h));
            this.imageCache.set(dataUrl, img);
            this.commitShape({
              type: "image",
              x: coords[0],
              y: coords[1],
              width: w * scale,
              height: h * scale,
              imageData: dataUrl,
            });
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      };
      input.click();
      this.clicked = false;
      return;
    }

    if (this.selectedTool === "pencil") {
      this.pencilPoints = [[coords[0], coords[1]]];
    }

    if (this.selectedTool === "eraser") {
      this.eraserPoints = [[coords[0], coords[1]]];
    }
  }

  mouseUpHandler = (e: MouseEvent) => {
    this.isPanning = false;
    this.isDragging = false;
    this.clicked = false;
    this.handlePointerUp();
  };

  private handlePointerUp() {
    if (this.selectedTool === "select") {
      if (this.isSelecting) {
        this.isSelecting = false;
        const selX = Math.min(this.startX, this.startX + this.dragOffsetX);
        const selY = Math.min(this.startY, this.startY + this.dragOffsetY);
        const selW = Math.abs(this.dragOffsetX);
        const selH = Math.abs(this.dragOffsetY);
        for (let i = 0; i < this.existingShapes.length; i++) {
          const bounds = getShapeBounds(this.existingShapes[i]);
          if (bounds) {
            const overlap =
              bounds.x < selX + selW &&
              bounds.x + bounds.w > selX &&
              bounds.y < selY + selH &&
              bounds.y + bounds.h > selY;
            if (overlap) this.selectedShapeIndices.add(i);
          }
        }
        this.notifySelection();
        this.clearCanvas();
      } else if (this.selectedShapeIndices.size > 0) {
        if (this.dragStartShapes) {
          this.undoManager.push(this.dragStartShapes, this.existingShapes);
          this.dragStartShapes = null;
        }
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

    if (this.selectedTool === "eraser") {
      if (this.eraserPoints.length === 0) return;

      const prev = [...this.existingShapes];
      this.existingShapes = this.existingShapes.filter(
        (shape) => !eraserIntersectsShape(this.eraserPoints, shape, this.eraserRadius),
      );
      this.undoManager.push(prev, this.existingShapes);
      this.selectedShapeIndices.clear();
      this.notifySelection();
      this.eraserPoints = [];
      this.syncShapes();
      return;
    }

    const coords = this.viewport.getCanvasCoords(this.lastPointerX, this.lastPointerY);
    const width = coords[0] - this.startX;
    const height = coords[1] - this.startY;

    let shape: Shape | null = null;
    if (this.selectedTool === "rect") {
      shape = { type: "rect", x: this.startX, y: this.startY, height, width };
    } else if (this.selectedTool === "circle") {
      const radius = Math.max(width, height) / 2;
      shape = { type: "circle", radius, centerX: this.startX + radius, centerY: this.startY + radius };
    } else if (this.selectedTool === "diamond") {
      shape = {
        type: "diamond",
        centerX: this.startX + width / 2,
        centerY: this.startY + height / 2,
        width: Math.abs(width),
        height: Math.abs(height),
      };
    } else if (this.selectedTool === "arrow") {
      shape = {
        type: "arrow",
        startX: this.startX,
        startY: this.startY,
        endX: coords[0],
        endY: coords[1],
        arrowHeadSize: 10,
      };
    } else if (this.selectedTool === "line") {
      shape = {
        type: "line",
        startX: this.startX,
        startY: this.startY,
        endX: coords[0],
        endY: coords[1],
      };
    }

    if (!shape) return;
    this.commitShape(shape);
  }

  mouseMoveHandler = (e: MouseEvent) => {
    if (this.isPanning) {
      this.viewport.panX = e.clientX - this.panStartX;
      this.viewport.panY = e.clientY - this.panStartY;
      this.invalidateCache();
      this.clearCanvas();
      return;
    }
    this.handlePointerMove(e.clientX, e.clientY);
  };

  private handlePointerMove(clientX: number, clientY: number) {
    if (!this.clicked) return;

    this.lastPointerX = clientX;
    this.lastPointerY = clientY;
    const coords = this.viewport.getCanvasCoords(clientX, clientY);

    if (this.selectedTool === "select" && this.isSelecting) {
      this.dragOffsetX = coords[0] - this.startX;
      this.dragOffsetY = coords[1] - this.startY;
      this.clearCanvas();
      this.ctx.save();
      this.ctx.translate(this.viewport.panX, this.viewport.panY);
      this.ctx.scale(this.viewport.zoom, this.viewport.zoom);
      drawDragSelect(this.ctx, this.startX, this.startY, coords[0], coords[1], this.viewport);
      this.ctx.restore();
      return;
    }

    if (this.selectedTool === "select" && this.isDragging) {
      const dx = coords[0] - this.dragOffsetX;
      const dy = coords[1] - this.dragOffsetY;

      for (const i of this.selectedShapeIndices) {
        const shape = this.existingShapes[i];
        if (!shape) continue;
        moveShape(shape, dx, dy);
      }

      this.dragOffsetX = coords[0];
      this.dragOffsetY = coords[1];
      this.invalidateCache();
      this.clearCanvas();
      return;
    }

    if (this.selectedTool === "pencil") {
      this.pencilPoints.push([coords[0], coords[1]]);
      this.clearCanvas();
      this.ctx.save();
      this.ctx.translate(this.viewport.panX, this.viewport.panY);
      this.ctx.scale(this.viewport.zoom, this.viewport.zoom);
      this.rc.linearPath(this.pencilPoints, {
        stroke: this.currentStyle.strokeColor,
        strokeWidth: 1.5 / this.viewport.zoom,
        roughness: 2,
        bowing: 1.5,
      });
      this.ctx.restore();
      return;
    }

    if (this.selectedTool === "eraser") {
      this.eraserPoints.push([coords[0], coords[1]]);
    }

    const width = coords[0] - this.startX;
    const height = coords[1] - this.startY;
    this.clearCanvas();

    this.ctx.save();
    this.ctx.translate(this.viewport.panX, this.viewport.panY);
    this.ctx.scale(this.viewport.zoom, this.viewport.zoom);

    const prevOpts = {
      stroke: this.currentStyle.strokeColor,
      strokeWidth: 1.5 / this.viewport.zoom,
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
      const cx = this.startX + width / 2;
      const cy = this.startY + height / 2;
      const hw = Math.abs(width) / 2;
      const hh = Math.abs(height) / 2;
      this.rc.polygon(
        [[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]],
        prevOpts,
      );
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
      this.ctx.translate(this.viewport.panX, this.viewport.panY);
      this.ctx.scale(this.viewport.zoom, this.viewport.zoom);
      this.ctx.beginPath();
      this.ctx.arc(coords[0], coords[1], this.eraserRadius, 0, Math.PI * 2);
      this.ctx.strokeStyle = this.isDark
        ? "rgba(255, 255, 255, 0.8)"
        : "rgba(0, 0, 0, 0.8)";
      this.ctx.lineWidth = 1.5 / this.viewport.zoom;
      this.ctx.stroke();
      if (this.eraserPoints.length > 1) {
        this.ctx.beginPath();
        this.ctx.moveTo(this.eraserPoints[0][0], this.eraserPoints[0][1]);
        for (let i = 1; i < this.eraserPoints.length; i++) {
          this.ctx.lineTo(this.eraserPoints[i][0], this.eraserPoints[i][1]);
        }
        this.ctx.strokeStyle = this.isDark
          ? "rgba(255, 255, 255, 0.4)"
          : "rgba(0, 0, 0, 0.4)";
        this.ctx.lineWidth = this.eraserRadius * 2;
        this.ctx.lineCap = "round";
        this.ctx.lineJoin = "round";
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    this.ctx.restore();
  };

  dblClickHandler = (e: MouseEvent) => {
    if (this.selectedTool !== "select") return;
    const coords = this.viewport.getCanvasCoords(e.clientX, e.clientY);
    const hit = hitTest(coords, this.existingShapes, this.viewport.zoom);
    if (hit === null) return;
    const shape = this.existingShapes[hit];
    if (shape.type !== "text") return;
    this.startTextEdit(shape.x, shape.y, shape.text, hit);
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
    this.viewport.handleWheel(e, this.canvas.width, this.canvas.height);
    this.invalidateCache();
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

  // ─── Touch handlers ────────────────────────────────────────────

  private getTouchPos(e: TouchEvent): { x: number; y: number } | null {
    const t = e.touches[0] || e.changedTouches[0];
    return t ? { x: t.clientX, y: t.clientY } : null;
  }

  private getTwoFingerCenter(e: TouchEvent): { cx: number; cy: number; dist: number } | null {
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    if (!t0 || !t1) return null;
    const cx = (t0.clientX + t1.clientX) / 2;
    const cy = (t0.clientY + t1.clientY) / 2;
    const dx = t1.clientX - t0.clientX;
    const dy = t1.clientY - t0.clientY;
    return { cx, cy, dist: Math.sqrt(dx * dx + dy * dy) };
  }

  touchStartHandler = (e: TouchEvent) => {
    e.preventDefault();

    if (e.touches.length === 2) {
      this.clicked = false;
      this.isDragging = false;
      this.isSelecting = false;
      const gesture = this.getTwoFingerCenter(e);
      if (gesture) {
        this.pinchStartDist = gesture.dist;
        this.pinchStartZoom = this.viewport.zoom;
        this.isPanning = true;
        this.panStartX = gesture.cx - this.viewport.panX;
        this.panStartY = gesture.cy - this.viewport.panY;
      }
      return;
    }

    if (e.touches.length > 2) return;

    const pos = this.getTouchPos(e);
    if (!pos) return;

    // Double-tap detection (for text editing on touch)
    const now = Date.now();
    if (now - this.lastTapTime < 300) {
      this.lastTapTime = 0;
      if (this.selectedTool === "select") {
        const coords = this.viewport.getCanvasCoords(pos.x, pos.y);
        const hit = hitTest(coords, this.existingShapes, this.viewport.zoom);
        if (hit !== null) {
          const shape = this.existingShapes[hit];
          if (shape.type === "text") {
            this.startTextEdit(shape.x, shape.y, shape.text, hit);
            return;
          }
        }
      }
      return;
    }
    this.lastTapTime = now;

    // Single touch — delegate to pointer handler
    this.handlePointerDown(pos.x, pos.y, false);
  };

  touchMoveHandler = (e: TouchEvent) => {
    e.preventDefault();

    if (e.touches.length === 2 && this.isPanning) {
      const gesture = this.getTwoFingerCenter(e);
      if (gesture) {
        const scale = gesture.dist / this.pinchStartDist;
        const newZoom = Math.min(Math.max(this.pinchStartZoom * scale, 0.1), 10);
        this.viewport.zoom = newZoom;
        this.viewport.panX = gesture.cx - this.panStartX;
        this.viewport.panY = gesture.cy - this.panStartY;

        this.invalidateCache();
        this.clearCanvas();
      }
      return;
    }

    if (e.touches.length !== 1) return;
    const pos = this.getTouchPos(e);
    if (!pos) return;

    this.handlePointerMove(pos.x, pos.y);
  };

  touchEndHandler = (e: TouchEvent) => {
    e.preventDefault();

    if (e.touches.length === 0 && this.isPanning && e.changedTouches.length >= 2) {
      this.isPanning = false;
      return;
    }

    if (e.touches.length >= 1) return;

    this.isPanning = false;
    this.handlePointerUp();
  };

  initTouchHandlers() {
    this.canvas.addEventListener("touchstart", this.touchStartHandler, { passive: false });
    this.canvas.addEventListener("touchmove", this.touchMoveHandler, { passive: false });
    this.canvas.addEventListener("touchend", this.touchEndHandler, { passive: false });
    this.canvas.addEventListener("touchcancel", this.touchEndHandler, { passive: false });
  }
}
