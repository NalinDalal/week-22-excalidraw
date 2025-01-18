"use client";

export function AuthPage({ isSignin }: { isSignin: boolean }) {
  return (
    <div className="flex justify-center items-center w-screen h-screen">
      <div className="p-6 m-2 bg-white rounded">
        <div className="p-2">
          <input type="text" placeholder="Email"></input>
        </div>
        <div className="p-2"></div>

        <div className="pt-2">
          <button className="p-2 bg-red-200 rounded" onClick={() => {}}>
            {isSignin ? "Sign in" : "Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
