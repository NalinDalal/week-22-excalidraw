"use client";

import { WS_URL } from "@/config";
import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas } from "./Canvas";

const MAX_RECONNECT_DELAY = 30_000;
const INITIAL_RECONNECT_DELAY = 1_000;

export function RoomCanvas({ roomId }: { roomId: string }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(INITIAL_RECONNECT_DELAY);
  const unmounted = useRef(false);

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("You must be signed in to join a room.");
      return;
    }

    const ws = new WebSocket(WS_URL, ["token", token]);

    ws.onerror = () => {
      // onclose will handle reconnection
    };

    ws.onclose = (ev) => {
      if (unmounted.current) return;

      // Auth failure — redirect to sign in
      if (ev.code === 4001 || ev.code === 1008) {
        localStorage.removeItem("token");
        window.location.href = "/signin";
        return;
      }

      // Normal close after intentional disconnect — don't reconnect
      if (ev.code === 1000) return;

      // Connection lost — attempt reconnect
      setSocket(null);
      setReconnecting(true);

      reconnectTimer.current = setTimeout(() => {
        if (unmounted.current) return;
        reconnectDelay.current = Math.min(
          reconnectDelay.current * 2,
          MAX_RECONNECT_DELAY,
        );
        connect();
      }, reconnectDelay.current);
    };

    ws.onopen = () => {
      if (unmounted.current) {
        ws.close(1000);
        return;
      }

      reconnectDelay.current = INITIAL_RECONNECT_DELAY;
      setReconnecting(false);
      setSocket(ws);
      ws.send(
        JSON.stringify({
          type: "join_room",
          roomId,
        }),
      );
    };
  }, [roomId]);

  useEffect(() => {
    unmounted.current = false;
    connect();

    return () => {
      unmounted.current = true;
      cleanup();
      setSocket((prev) => {
        if (prev) prev.close(1000);
        return null;
      });
    };
  }, [connect, cleanup]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!socket) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">
          {reconnecting ? "Reconnecting..." : "Connecting to server..."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <Canvas roomId={roomId} socket={socket} />
    </div>
  );
}
