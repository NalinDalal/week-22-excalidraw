export function corsResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (body !== null) {
    headers.set("Content-Type", "application/json");
  }
  return new Response(body !== null ? JSON.stringify(body) : null, {
    ...init,
    headers,
  });
}
