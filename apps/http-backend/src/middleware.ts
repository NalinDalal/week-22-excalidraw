import jwt from "jsonwebtoken";

/** Shared JWT secret used across HTTP and WS backends */
const JWT_SECRET = process.env.JWT_SECRET || "123123";

/**
 * Extract and verify the JWT from the Authorization header.
 * Returns the userId on success, or null if the header is missing or the token is invalid.
 */
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
