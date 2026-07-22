import { Point } from "./types";

export class Viewport {
  panX = 0;
  panY = 0;
  zoom = 1;

  getCanvasCoords(clientX: number, clientY: number): Point {
    return [
      (clientX - this.panX) / this.zoom,
      (clientY - this.panY) / this.zoom,
    ];
  }

  zoomIn(canvasWidth: number, canvasHeight: number) {
    const newZoom = Math.min(this.zoom * 1.2, 10);
    this.panX =
      canvasWidth / 2 - ((canvasWidth / 2 - this.panX) * newZoom) / this.zoom;
    this.panY =
      canvasHeight / 2 -
      ((canvasHeight / 2 - this.panY) * newZoom) / this.zoom;
    this.zoom = newZoom;
  }

  zoomOut(canvasWidth: number, canvasHeight: number) {
    const newZoom = Math.max(this.zoom / 1.2, 0.1);
    this.panX =
      canvasWidth / 2 - ((canvasWidth / 2 - this.panX) * newZoom) / this.zoom;
    this.panY =
      canvasHeight / 2 -
      ((canvasHeight / 2 - this.panY) * newZoom) / this.zoom;
    this.zoom = newZoom;
  }

  handleWheel(
    e: WheelEvent,
    canvasWidth: number,
    canvasHeight: number,
  ): boolean {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(Math.max(this.zoom * delta, 0.1), 10);

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
    this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;
    return true;
  }
}
