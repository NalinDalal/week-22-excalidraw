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

export type Tool = "select" | "circle" | "rect" | "pencil" | "diamond" | "arrow" | "line" | "text" | "image" | "eraser";

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
      setSelectedShape(
        shape
          ? {
              type: shape.type,
              style: shape.style,
              arrowHeadSize:
                shape.type === "arrow"
                  ? (shape as any).arrowHeadSize
                  : undefined,
            }
          : null,
      );
    });
    setGame(g);

    return () => {
      g.destroy();
      observer.disconnect();
    };
  }, [canvasRef]);

  return (
    <div className="h-screen overflow-hidden">
      <canvas ref={canvasRef} />
      <Topbar setSelectedTool={setSelectedTool} selectedTool={selectedTool} />
      {selectedTool === "select" && selectedShape && (
        <PropertiesPanel
          shapeType={selectedShape.type}
          style={selectedShape.style}
          onStyleChange={(updates) => game?.updateShapeStyle(updates)}
          arrowHeadSize={selectedShape.arrowHeadSize}
          onArrowHeadSizeChange={(size) => game?.setArrowHeadSize(size)}
        />
      )}
      <ThemeToggle />
      <ZoomBar game={game} />
      <UndoRedoBar game={game} />
      <ExportBar game={game} />
    </div>
  );
}

function Topbar({
  selectedTool,
  setSelectedTool,
}: {
  selectedTool: Tool;
  setSelectedTool: (s: Tool) => void;
}) {
  return (
    <div className="fixed top-2.5 left-2.5">
      <div className="flex gap-1">
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

function ThemeToggle() {
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
        }}
        activated={false}
        icon={isDark ? <Sun /> : <Moon />}
      />
    </div>
  );
}

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
