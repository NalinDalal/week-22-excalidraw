import jwt from "jsonwebtoken";

/** Shared JWT secret used across HTTP and WS backends */
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Extract and verify the JWT from the Authorization header.
 * Accepts both raw token and "Bearer <token>" format.
 * Returns the userId on success, or null if the header is missing or the token is invalid.
 */
export function middleware(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  // Support both "Bearer <token>" and raw token formats
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "string") return null;
    return (decoded as jwt.JwtPayload).userId as string;
  } catch {
    return null;
  }
}
