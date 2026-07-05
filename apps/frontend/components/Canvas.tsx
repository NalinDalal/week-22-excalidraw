import { useEffect, useRef, useState } from "react";
import { IconButton } from "./IconButton";
import {
  Circle,
  Minus,
  Pencil,
  Plus,
  RectangleHorizontalIcon,
  Redo2,
  Undo2,
} from "lucide-react";
import { Game } from "@/draw/Game";

export type Tool = "circle" | "rect" | "pencil";

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
    <div
      style={{
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        width={window.innerWidth}
        height={window.innerHeight}
      ></canvas>
      <Topbar setSelectedTool={setSelectedTool} selectedTool={selectedTool} />
      <ZoomBar game={game} />
      <UndoRedoBar game={game} />
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
    <div
      style={{
        position: "fixed",
        top: 10,
        left: 10,
      }}
    >
      <div className="flex gap-t">
        <IconButton
          onClick={() => {
            setSelectedTool("pencil");
          }}
          activated={selectedTool === "pencil"}
          icon={<Pencil />}
        />
        <IconButton
          onClick={() => {
            setSelectedTool("rect");
          }}
          activated={selectedTool === "rect"}
          icon={<RectangleHorizontalIcon />}
        />
        <IconButton
          onClick={() => {
            setSelectedTool("circle");
          }}
          activated={selectedTool === "circle"}
          icon={<Circle />}
        />
      </div>
    </div>
  );
}

function UndoRedoBar({ game }: { game: Game | undefined }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        display: "flex",
        gap: 8,
        background: "rgba(0,0,0,0.7)",
        padding: "8px 12px",
        borderRadius: 8,
      }}
    >
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

function ZoomBar({ game }: { game: Game | undefined }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: 8,
        alignItems: "center",
        background: "rgba(0,0,0,0.7)",
        padding: "8px 12px",
        borderRadius: 8,
      }}
    >
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
