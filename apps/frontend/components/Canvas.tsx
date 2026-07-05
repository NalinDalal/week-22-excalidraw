import { useEffect, useRef, useState } from "react";
import { IconButton } from "./IconButton";
import {
  Circle,
  Diamond,
  Download,
  ImageDown,
  Minus,
  Moon,
  MousePointer2,
  Pencil,
  Plus,
  RectangleHorizontalIcon,
  Redo2,
  Sun,
  Undo2,
  Type,
  Undo,
  Image,
  EraserIcon,
  FileJson,
  Upload,
} from "lucide-react";
import { Game, ShapeStyle } from "@/draw/Game";
import { PropertiesPanel } from "./PropertiesPanel";

/** All available drawing tools */
export type Tool = "select" | "circle" | "rect" | "pencil" | "diamond" | "arrow" | "line" | "text" | "image" | "eraser";

/**
 * Main canvas component.
 * Initializes the Game engine, manages tool selection, and wires up
 * the PropertiesPanel for editing selected shapes.
 */
export function Canvas({
  roomId,
  socket,
}: {
  socket: WebSocket;
  roomId: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game>();
  const [selectedTool, setSelectedTool] = useState<Tool>("circle");
  const [selectedShape, setSelectedShape] = useState<{
    type: string;
    style: ShapeStyle;
    arrowHeadSize?: number;
  } | null>(null);
  const [currentStyle, setCurrentStyle] = useState<ShapeStyle>({
    strokeColor: "#ffffff",
    backgroundColor: "transparent",
    strokeWidth: 1.5,
    roughness: 0,
    opacity: 1,
  });

  useEffect(() => {
    game?.setTool(selectedTool);
  }, [selectedTool, game]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement!);

    const g = new Game(canvas, roomId, socket);
    g.setSelectionChangeCallback((shape) => {
      if (shape) {
        setSelectedShape({
          type: shape.type,
          style: shape.style,
          arrowHeadSize:
            shape.type === "arrow"
              ? (shape as any).arrowHeadSize
              : undefined,
        });
        setCurrentStyle(shape.style);
      } else {
        setSelectedShape(null);
      }
    });
    g.setThemeChangeCallback((isDark) => {
      setCurrentStyle((s) => ({ ...s, strokeColor: isDark ? "#ffffff" : "#000000" }));
    });
    setGame(g);

    return () => {
      g.destroy();
      observer.disconnect();
    };
  }, [canvasRef]);

  const panelShapeType = selectedShape?.type ?? selectedTool;
  const panelStyle = selectedShape?.style ?? currentStyle;
  const panelArrowSize =
    selectedShape?.type === "arrow"
      ? (selectedShape as any).arrowHeadSize
      : undefined;

  return (
    <div className="h-screen overflow-hidden">
      <canvas ref={canvasRef} />
      <Topbar setSelectedTool={setSelectedTool} selectedTool={selectedTool} />
      <PropertiesPanel
        shapeType={panelShapeType}
        style={panelStyle}
        onStyleChange={(updates) => {
          if (selectedShape) {
            game?.updateShapeStyle(updates);
          } else {
            setCurrentStyle((s) => ({ ...s, ...updates }));
          }
        }}
        arrowHeadSize={panelArrowSize}
        onArrowHeadSizeChange={(size) => game?.setArrowHeadSize(size)}
      />
      <ThemeToggle game={game} />
      <ZoomBar game={game} />
      <UndoRedoBar game={game} />
      <ExportBar game={game} />
    </div>
  );
}

/** Floating toolbar at the top-left with all drawing tool icons */
function Topbar({
  selectedTool,
  setSelectedTool,
}: {
  selectedTool: Tool;
  setSelectedTool: (s: Tool) => void;
}) {
  return (
    <div className="fixed top-2.5 left-2.5">
      <div className="flex flex-col gap-1">
        <IconButton
          onClick={() => setSelectedTool("select")}
          activated={selectedTool === "select"}
          icon={<MousePointer2 />}
        />
        <IconButton
          onClick={() => setSelectedTool("pencil")}
          activated={selectedTool === "pencil"}
          icon={<Pencil />}
        />
        <IconButton
          onClick={() => setSelectedTool("rect")}
          activated={selectedTool === "rect"}
          icon={<RectangleHorizontalIcon />}
        />
        <IconButton
          onClick={() => setSelectedTool("circle")}
          activated={selectedTool === "circle"}
          icon={<Circle />}
        />
        <IconButton
          onClick={() => setSelectedTool("diamond")}
          activated={selectedTool === "diamond"}
          icon={<Diamond />}
        />
        <IconButton
          onClick={() => setSelectedTool("arrow")}
          activated={selectedTool === "arrow"}
          icon={<Undo />}
        />
        <IconButton
          onClick={() => setSelectedTool("line")}
          activated={selectedTool === "line"}
          icon={<Type />}
        />
        <IconButton
          onClick={() => setSelectedTool("text")}
          activated={selectedTool === "text"}
          icon={<Type />}
        />
        <IconButton
          onClick={() => setSelectedTool("image")}
          activated={selectedTool === "image"}
          icon={<Image />}
        />
        <IconButton
          onClick={() => setSelectedTool("eraser")}
          activated={selectedTool === "eraser"}
          icon={<EraserIcon />}
        />
      </div>
    </div>
  );
}

/** Toggle between dark and light theme. Persists choice to localStorage. */
function ThemeToggle({ game }: { game: Game | undefined }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  return (
    <div className="fixed top-2.5 right-2.5">
      <IconButton
        onClick={() => {
          const next = !document.documentElement.classList.contains("dark");
          document.documentElement.classList.toggle("dark", next);
          localStorage.setItem("theme", next ? "dark" : "light");
          setIsDark(next);
          game?.setTheme(next);
        }}
        activated={false}
        icon={isDark ? <Sun /> : <Moon />}
      />
    </div>
  );
}

/** Undo / redo buttons at the bottom-right */
function UndoRedoBar({ game }: { game: Game | undefined }) {
  return (
    <div className="fixed bottom-5 right-5 flex gap-2 bg-black/70 px-3 py-2 rounded-lg">
      <IconButton
        onClick={() => game?.undo()}
        activated={false}
        icon={<Undo2 />}
      />
      <IconButton
        onClick={() => game?.redo()}
        activated={false}
        icon={<Redo2 />}
      />
    </div>
  );
}

/** Export bar with PNG, SVG, JSON export and JSON import */
function ExportBar({ game }: { game: Game | undefined }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed bottom-5 left-5 flex gap-2 bg-black/70 px-3 py-2 rounded-lg">
      <IconButton
        onClick={() => game?.exportToPng()}
        activated={false}
        icon={<ImageDown />}
      />
      <IconButton
        onClick={() => game?.exportToSvg()}
        activated={false}
        icon={<Download />}
      />
      <IconButton
        onClick={() => game?.exportToJson()}
        activated={false}
        icon={<FileJson />}
      />
      <IconButton
        onClick={() => fileInputRef.current?.click()}
        activated={false}
        icon={<Upload />}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            game?.importFromJson(reader.result as string);
          };
          reader.readAsText(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Zoom in / out buttons at the bottom center */
function ZoomBar({ game }: { game: Game | undefined }) {
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 flex gap-2 items-center bg-black/70 px-3 py-2 rounded-lg">
      <IconButton
        onClick={() => game?.zoomOut()}
        activated={false}
        icon={<Minus />}
      />
      <IconButton
        onClick={() => game?.zoomIn()}
        activated={false}
        icon={<Plus />}
      />
    </div>
  );
}
