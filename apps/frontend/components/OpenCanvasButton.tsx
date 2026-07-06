"use client";

import { HTTP_BACKEND } from "@/config";
import { Button } from "@repo/ui/button";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import axios from "axios";

export function OpenCanvasButton() {
  const router = useRouter();

  async function handleClick() {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/signin");
      return;
    }

    try {
      const res = await axios.post(
        `${HTTP_BACKEND}/room`,
        { name: `room-${Date.now()}` },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      router.push(`/canvas/${res.data.roomId}`);
    } catch {
      router.push("/signin");
    }
  }

  return (
    <Button
      size="lg"
      variant="secondary"
      className="px-6 h-12"
      onClick={handleClick}
    >
      Open Canvas
      <Pencil className="ml-2 w-4 h-4" />
    </Button>
  );
}
