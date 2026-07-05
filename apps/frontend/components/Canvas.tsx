import { useEffect, useRef, useState } from "react";
import { IconButton } from "./IconButton";
import {
  Circle,
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
} from "lucide-react";
import { Game } from "@/draw/Game";

export type Tool = "select" | "circle" | "rect" | "pencil";

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

  useEffect(() => {
    game?.setTool(selectedTool);
  }, [selectedTool, game]);

  useEffect(() => {
    if (canvasRef.current) {
      const g = new Game(canvasRef.current, roomId, socket);
      setGame(g);

      return () => {
        g.destroy();
      };
    }
  }, [canvasRef]);

  return (
    <div className="h-screen overflow-hidden">
      <canvas
        ref={canvasRef}
        width={window.innerWidth}
        height={window.innerHeight}
      />
      <Topbar setSelectedTool={setSelectedTool} selectedTool={selectedTool} />
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
