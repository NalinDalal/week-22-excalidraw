"use client";

import { HTTP_BACKEND } from "@/config";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthPage({ isSignin }: { isSignin: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const router = useRouter();

  const [error, setError] = useState("");

  async function handleClick() {
    setError("");
    try {
      const res = await axios.post(
        `${HTTP_BACKEND}/${isSignin ? "signin" : "signup"}`,
        {
          email,
          password,
          name,
        },
      );

      if (isSignin) {
        localStorage.setItem("token", res.data.token);
        router.push("/");
      } else {
        router.push("/signin");
      }
    } catch (e: any) {
      const msg =
        e.response?.data?.message ||
        e.message ||
        "Something went wrong";
      console.error("Auth error:", e.response?.status, e.response?.data, e.message);
      setError(msg);
    }
  }

  return (
    <div className="flex justify-center items-center w-screen h-screen bg-background">
      <div className="p-6 m-2 rounded-lg border bg-card text-card-foreground">
        <div className="p-2">
          <input
            type="email"
            placeholder="Email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded border bg-background text-foreground placeholder:text-muted-foreground"
          />
        </div>
        {!isSignin && (
          <div className="p-2">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded border bg-background text-foreground placeholder:text-muted-foreground"
            />
          </div>
        )}
        <div className="p-2">
          <input
            type="password"
            placeholder="Password"
            value={password}
            autoComplete={isSignin ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded border bg-background text-foreground placeholder:text-muted-foreground"
          />
        </div>
        {error && <p className="p-2 text-red-500 text-sm">{error}</p>}
        <div className="pt-2">
          <button
            className="w-full px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleClick}
          >
            {isSignin ? "Sign in" : "Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
