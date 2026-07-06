/**
 * Allowed origins for CORS. Set via ALLOWED_ORIGINS env var (comma-separated).
 * Falls back to * (open) in development if unset.
 */
function getAllowedOrigin(reqOrigin: string | null): string {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return "*";

  const allowed = raw.split(",").map((o) => o.trim());
  if (reqOrigin && allowed.includes(reqOrigin)) return reqOrigin;
  return allowed[0] || "*";
}

/**
 * Wrap an API response with CORS headers.
 * Supports preflight OPTIONS, JSON bodies, and null bodies (204).
 */
export function corsResponse(
  body: unknown,
  init: ResponseInit = {},
  req?: Request,
): Response {
  const headers = new Headers(init.headers);
  const origin = req?.headers.get("origin") ?? null;
  headers.set("Access-Control-Allow-Origin", getAllowedOrigin(origin));
  headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Max-Age", "86400");
  if (body !== null) {
    headers.set("Content-Type", "application/json");
  }
  return new Response(body !== null ? JSON.stringify(body) : null, {
    ...init,
    headers,
  });
}
