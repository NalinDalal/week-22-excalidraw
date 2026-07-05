import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "123123";

export function middleware(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  try {
    const decoded = jwt.verify(authHeader, JWT_SECRET);
    if (typeof decoded === "string") return null;
    return (decoded as jwt.JwtPayload).userId as string;
  } catch {
    return null;
  }
}
