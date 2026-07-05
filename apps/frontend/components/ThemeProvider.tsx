"use client";

import { useEffect, type ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored) {
      document.documentElement.classList.toggle("dark", stored === "dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  }, []);

  return <>{children}</>;
}
