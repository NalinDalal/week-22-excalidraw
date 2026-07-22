import { Point } from "./types";

export interface TextEditCallbacks {
  removeTextOverlay: () => void;
  pushUndo: (prev: any[]) => void;
  syncShapes: () => void;
  commitShape: (shape: any) => void;
  setClicked: (v: boolean) => void;
}

export function startTextEdit(
  canvasX: number,
  canvasY: number,
  zoom: number,
  panX: number,
  panY: number,
  isDark: boolean,
  existingText: string | undefined,
  existingIndex: number | undefined,
  callbacks: TextEditCallbacks,
  shapes: any[],
): HTMLTextAreaElement | null {
  callbacks.setClicked(false);
  callbacks.removeTextOverlay();
  const screenX = canvasX * zoom + panX;
  const screenY = (canvasY - 16) * zoom + panY;
  const ta = document.createElement("textarea");
  ta.value = existingText ?? "";
  ta.style.cssText = `
    position: fixed;
    left: ${screenX}px;
    top: ${screenY}px;
    font: 20px Arial;
    color: ${isDark ? "white" : "black"};
    background: transparent;
    border: 1px dashed rgba(59,130,246,0.5);
    outline: none;
    padding: 2px;
    resize: none;
    overflow: hidden;
    white-space: pre-wrap;
    word-wrap: break-word;
    min-width: 30px;
    min-height: 24px;
    z-index: 50;
    caret-color: ${isDark ? "white" : "black"};
  `;
  document.body.appendChild(ta);
  ta.focus();
  ta.select();

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    const text = ta.value.trim();
    ta.removeEventListener("blur", finish);
    callbacks.removeTextOverlay();
    if (!text) return;
    if (existingIndex !== undefined) {
      const prev = structuredClone(shapes);
      const shape = shapes[existingIndex];
      if (shape && shape.type === "text") {
        shape.text = text;
        callbacks.pushUndo(prev);
        callbacks.syncShapes();
      }
    } else {
      callbacks.commitShape({
        type: "text",
        x: canvasX,
        y: canvasY,
        text,
        fontSize: 20,
      });
    }
    callbacks.setClicked(false);
  };

  ta.addEventListener("blur", finish);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      ta.removeEventListener("blur", finish);
      callbacks.removeTextOverlay();
      callbacks.setClicked(false);
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      finish();
    }
  });
  return ta;
}

export function removeTextOverlayFn(textEditOverlay: HTMLTextAreaElement | null) {
  if (textEditOverlay) {
    textEditOverlay.remove();
  }
}

export function offsetShapeCopy(copy: any, offset: number) {
  if (copy.type === "rect") {
    copy.x += offset;
    copy.y += offset;
  } else if (copy.type === "circle") {
    copy.centerX += offset;
    copy.centerY += offset;
  } else if (copy.type === "pencil") {
    copy.points = copy.points.map(([x, y]: [number, number]) => [x + offset, y + offset]);
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
}

export function moveShape(shape: any, dx: number, dy: number) {
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
    for (const pt of shape.points) {
      pt[0] += dx;
      pt[1] += dy;
    }
  }
}
