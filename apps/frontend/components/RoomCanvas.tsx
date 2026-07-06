"use client";

import { WS_URL } from "@/config";
import { useEffect, useState } from "react";
import { Canvas } from "./Canvas";

export function RoomCanvas({ roomId }: { roomId: string }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("You must be signed in to join a room.");
      return;
    }

    const ws = new WebSocket(WS_URL, ["token", token]);

    ws.onerror = () => {
      setError("Could not connect to the server.");
    };

    ws.onclose = (ev) => {
      // 4001 = custom close code our server sends on auth failure
      if (ev.code === 4001 || ev.code === 1008) {
        localStorage.removeItem("token");
        window.location.href = "/signin";
        return;
      }
    };

    ws.onopen = () => {
      setSocket(ws);
      ws.send(
        JSON.stringify({
          type: "join_room",
          roomId,
        }),
      );
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!socket) {
    return <div>Connecting to server....</div>;
  }

  return (
    <div>
      <Canvas roomId={roomId} socket={socket} />
    </div>
  );
}
