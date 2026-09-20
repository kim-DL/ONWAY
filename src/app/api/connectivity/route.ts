const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "text/plain; charset=utf-8",
} as const;

// Keep the URL used by installed PWAs. Hosting serves HEAD for this static GET
// resource; the no-store policy also lives in firebase.json (export drops headers).
export const dynamic = "force-static";

export function GET() {
  return new Response("online\n", { status: 200, headers: HEADERS });
}
