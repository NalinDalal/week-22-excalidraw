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
          username: email,
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
    <div className="flex justify-center items-center w-screen h-screen">
      <div className="p-6 m-2 bg-white rounded">
        <div className="p-2">
          <input
            type="text"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {!isSignin && (
          <div className="p-2">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}
        <div className="p-2">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="p-2 text-red-500 text-sm">{error}</p>}
        <div className="pt-2">
          <button className="p-2 bg-red-200 rounded" onClick={handleClick}>
            {isSignin ? "Sign in" : "Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
