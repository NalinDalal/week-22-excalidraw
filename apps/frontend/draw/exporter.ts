import rough from "roughjs";
import { Shape, defaultStyle, getShapeBounds } from "./shapes";
import { renderShape, buildRoughOpts } from "./renderer";
import { ImageCache } from "./imageCache";

function download(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function computeBounds(shapes: Shape[]) {
    const allX: number[] = [];
    const allY: number[] = [];
    for (const s of shapes) {
        const bounds = getShapeBounds(s);
        if (bounds) {
            allX.push(bounds.x, bounds.x + bounds.w);
            allY.push(bounds.y, bounds.y + bounds.h);
        }
    }
    if (allX.length === 0) return null;
    const pad = 20;
    return {
        x: Math.min(...allX) - pad,
        y: Math.min(...allY) - pad,
        w: Math.max(...allX) - Math.min(...allX) + pad * 2,
        h: Math.max(...allY) - Math.min(...allY) + pad * 2,
    };
}

export function exportToPng(shapes: Shape[], isDark: boolean, imageCache: ImageCache) {
    const bounds = computeBounds(shapes);
    if (!bounds) return;

    const offscreen = document.createElement("canvas");
    offscreen.width = bounds.w;
    offscreen.height = bounds.h;
    const ctx = offscreen.getContext("2d")!;
    ctx.fillStyle = isDark ? "#000" : "#fff";
    ctx.fillRect(0, 0, bounds.w, bounds.h);
    ctx.translate(-bounds.x, -bounds.y);

    const rc = rough.canvas(offscreen);

    for (const shape of shapes) {
        renderShape(shape, ctx, rc, 1, isDark, imageCache);
    }
    download(offscreen.toDataURL("image/png"), "drawing.png");
}

export function exportToSvg(shapes: Shape[], isDark: boolean) {
    const bounds = computeBounds(shapes);
    if (!bounds) return;

    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("width", String(bounds.w));
    svgEl.setAttribute("height", String(bounds.h));
    svgEl.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);

    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", isDark ? "black" : "white");
    svgEl.appendChild(bg);

    const rs = rough.svg(svgEl);

    for (const shape of shapes) {
        const st = shape.style ?? defaultStyle(isDark);
        const opts = buildRoughOpts(st.strokeWidth, st);

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
