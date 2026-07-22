import { ShapeStyle } from "@/draw/types";

/** Predefined color palette for stroke and background swatches */
const COLORS = [
  "#000000",
  "#1e1e1e",
  "#495057",
  "#868e96",
  "#ffffff",
  "#ff6b6b",
  "#ffa94d",
  "#ffd43b",
  "#69db7c",
  "#4dabf7",
  "#9775fa",
  "#f783ac",
];

/** Human-readable labels for each shape type shown in the panel header */
const LABELS: Record<string, string> = {
  rect: "Rectangle",
  circle: "Circle",
  diamond: "Diamond",
  arrow: "Arrow",
  line: "Line",
  text: "Text",
  pencil: "Free draw",
};

/**
 * A single color circle in the palette.
 * Shows a checkerboard pattern for "transparent".
 */
function Swatch({
  color,
  selected,
  onClick,
}: {
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  const isTransparent = color === "transparent";
  return (
    <button
      onClick={onClick}
      className={`w-6 h-6 rounded-full border-2 transition-all ${
        selected
          ? "border-blue-400 scale-110"
          : "border-white/20 hover:border-white/50"
      }`}
      style={{
        background: isTransparent
          ? "repeating-conic-gradient(#ccc 0% 25%, transparent 0% 50%) 50% / 8px 8px"
          : color,
      }}
    />
  );
}

/**
 * Left-side panel showing shape properties.
 *
 * Displays:
 *   - Stroke color swatches
 *   - Background color swatches
 *   - Thickness slider
 *   - Arrowhead size slider (only for arrows)
 *   - Roughness slider
 *   - Opacity slider
 */
export function PropertiesPanel({
  shapeType,
  style,
  onStyleChange,
  arrowHeadSize,
  onArrowHeadSizeChange,
}: {
  shapeType: string;
  style: ShapeStyle;
  onStyleChange: (updates: Partial<ShapeStyle>) => void;
  arrowHeadSize?: number;
  onArrowHeadSizeChange?: (size: number) => void;
}) {
  return (
    <div className="fixed left-16 top-2.5 w-56 bg-black/80 backdrop-blur-md rounded-xl border border-white/10 p-4 text-white select-none z-10">
      <div className="text-xs text-white/50 uppercase tracking-wider mb-3">
        {LABELS[shapeType] ?? shapeType}
      </div>

      <div className="mb-3">
        <div className="text-xs text-white/60 mb-1.5">Stroke</div>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => (
            <Swatch
              key={c}
              color={c}
              selected={style.strokeColor === c}
              onClick={() => onStyleChange({ strokeColor: c })}
            />
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="text-xs text-white/60 mb-1.5">Background</div>
        <div className="flex flex-wrap gap-1.5">
          <Swatch
            color="transparent"
            selected={style.backgroundColor === "transparent"}
            onClick={() => onStyleChange({ backgroundColor: "transparent" })}
          />
          {COLORS.map((c) => (
            <Swatch
              key={c}
              color={c}
              selected={style.backgroundColor === c}
              onClick={() => onStyleChange({ backgroundColor: c })}
            />
          ))}
        </div>
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-xs text-white/60 mb-1">
          <span>Thickness</span>
          <span>{style.strokeWidth.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="8"
          step="0.5"
          value={style.strokeWidth}
          onChange={(e) =>
            onStyleChange({ strokeWidth: parseFloat(e.target.value) })
          }
          className="w-full accent-blue-400"
        />
      </div>

      {shapeType === "arrow" && onArrowHeadSizeChange && arrowHeadSize !== undefined && (
        <div className="mb-2">
          <div className="flex justify-between text-xs text-white/60 mb-1">
            <span>Arrowhead</span>
            <span>{arrowHeadSize}</span>
          </div>
          <input
            type="range"
            min="4"
            max="30"
            step="1"
            value={arrowHeadSize}
            onChange={(e) => onArrowHeadSizeChange(parseInt(e.target.value))}
            className="w-full accent-blue-400"
          />
        </div>
      )}

      <div className="mb-2">
        <div className="flex justify-between text-xs text-white/60 mb-1">
          <span>Roughness</span>
          <span>{style.roughness.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min="0"
          max="5"
          step="0.5"
          value={style.roughness}
          onChange={(e) =>
            onStyleChange({ roughness: parseFloat(e.target.value) })
          }
          className="w-full accent-blue-400"
        />
      </div>

      <div className="mb-0">
        <div className="flex justify-between text-xs text-white/60 mb-1">
          <span>Opacity</span>
          <span>{Math.round(style.opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={style.opacity}
          onChange={(e) =>
            onStyleChange({ opacity: parseFloat(e.target.value) })
          }
          className="w-full accent-blue-400"
        />
      </div>
    </div>
  );
}
