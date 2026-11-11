/** Process liveness only. Database/auth/integration readiness is a separate release gate. */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
