const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "text/plain; charset=utf-8",
} as const;

export function HEAD() {
  return new Response(null, { status: 204, headers: HEADERS });
}
