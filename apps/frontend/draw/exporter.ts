import rough from "roughjs";
import { Shape, defaultStyle, getShapeBounds } from "./types";

function download(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPng(shapes: Shape[], isDark: boolean, imageCache: Map<string, HTMLImageElement>) {
  const allX: number[] = [];
  const allY: number[] = [];

  for (const s of shapes) {
    const bounds = getShapeBounds(s);
    if (bounds) {
      allX.push(bounds.x, bounds.x + bounds.w);
      allY.push(bounds.y, bounds.y + bounds.h);
    }
  }
  if (allX.length === 0) return;
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
  ctx.fillStyle = isDark ? "#000" : "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.translate(-minX, -minY);

  const rc = rough.canvas(offscreen);

  for (const shape of shapes) {
    const st = shape.style ?? defaultStyle(isDark);
    const opts = {
      stroke: st.strokeColor,
      strokeWidth: st.strokeWidth,
      roughness: st.roughness,
      bowing: 1.5,
      fill: st.backgroundColor !== "transparent" ? st.backgroundColor : undefined,
    };
    ctx.globalAlpha = st.opacity;

    if (shape.type === "rect") {
      const x = Math.min(shape.x, shape.x + shape.width);
      const y = Math.min(shape.y, shape.y + shape.height);
      rc.rectangle(x, y, Math.abs(shape.width), Math.abs(shape.height), opts);
    } else if (shape.type === "circle") {
      rc.circle(shape.centerX, shape.centerY, Math.abs(shape.radius) * 2, opts);
    } else if (shape.type === "diamond") {
      const cx = shape.centerX;
      const cy = shape.centerY;
      const hw = shape.width / 2;
      const hh = shape.height / 2;
      rc.polygon([[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]], opts);
    } else if (shape.type === "pencil" && shape.points.length > 1) {
      rc.linearPath(shape.points, opts);
    } else if (shape.type === "line") {
      rc.line(shape.startX, shape.startY, shape.endX, shape.endY, opts);
    } else if (shape.type === "arrow") {
      rc.line(shape.startX, shape.startY, shape.endX, shape.endY, opts);
      const dx = shape.endX - shape.startX;
      const dy = shape.endY - shape.startY;
      const angle = Math.atan2(dy, dx);
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
    }
    ctx.globalAlpha = 1;
  }
  download(offscreen.toDataURL("image/png"), "drawing.png");
}

export function exportToSvg(shapes: Shape[], isDark: boolean) {
  const allX: number[] = [];
  const allY: number[] = [];

  for (const s of shapes) {
    const bounds = getShapeBounds(s);
    if (bounds) {
      allX.push(bounds.x, bounds.x + bounds.w);
      allY.push(bounds.y, bounds.y + bounds.h);
    }
  }
  if (allX.length === 0) return;
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
  bg.setAttribute("fill", isDark ? "black" : "white");
  svgEl.appendChild(bg);

  const rs = rough.svg(svgEl);

  for (const shape of shapes) {
    const st = shape.style ?? defaultStyle(isDark);
    const opts = {
      stroke: st.strokeColor,
      strokeWidth: st.strokeWidth,
      roughness: st.roughness,
      bowing: 1.5,
      fill: st.backgroundColor !== "transparent" ? st.backgroundColor : undefined,
    };

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
    } else if (shape.type === "diamond") {
      const cx = shape.centerX;
      const cy = shape.centerY;
      const hw = shape.width / 2;
      const hh = shape.height / 2;
      svgEl.appendChild(
        rs.polygon([[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]], opts),
      );
    } else if (shape.type === "pencil" && shape.points.length > 1) {
      svgEl.appendChild(rs.linearPath(shape.points, opts));
    } else if (shape.type === "arrow") {
      svgEl.appendChild(
        rs.line(shape.startX, shape.startY, shape.endX, shape.endY, opts),
      );
      const dx = shape.endX - shape.startX;
      const dy = shape.endY - shape.startY;
      const angle = Math.atan2(dy, dx);
      const hl = shape.arrowHeadSize;
      const a1 = angle - Math.PI / 6;
      const a2 = angle + Math.PI / 6;
      const pts = [
        [shape.endX, shape.endY],
        [shape.endX - hl * Math.cos(a1), shape.endY - hl * Math.sin(a1)],
        [shape.endX - hl * Math.cos(a2), shape.endY - hl * Math.sin(a2)],
      ];
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute(
        "points",
        pts.map((p) => p.join(",")).join(" "),
      );
      poly.setAttribute("fill", st.strokeColor);
      svgEl.appendChild(poly);
    } else if (shape.type === "line") {
      svgEl.appendChild(
        rs.line(shape.startX, shape.startY, shape.endX, shape.endY, opts),
      );
    } else if (shape.type === "text") {
      const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
      el.setAttribute("x", String(shape.x));
      el.setAttribute("y", String(shape.y));
      el.setAttribute("font-family", "Arial");
      el.setAttribute("font-size", String(shape.fontSize));
      el.setAttribute("fill", st.strokeColor);
      el.setAttribute("opacity", String(st.opacity));
      el.textContent = shape.text;
      svgEl.appendChild(el);
    } else if (shape.type === "eraser") {
      // skip
    } else if (shape.type === "image") {
      const el = document.createElementNS("http://www.w3.org/2000/svg", "image");
      el.setAttribute("x", String(shape.x));
      el.setAttribute("y", String(shape.y));
      el.setAttribute("width", String(shape.width));
      el.setAttribute("height", String(shape.height));
      el.setAttribute("href", shape.imageData);
      el.setAttribute("opacity", String(st.opacity));
      svgEl.appendChild(el);
    }
  }

  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgEl);
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  download(URL.createObjectURL(blob), "drawing.svg");
}

export function exportToJson(shapes: Shape[]) {
  const data = JSON.stringify({ shapes }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  download(URL.createObjectURL(blob), "drawing.json");
}
