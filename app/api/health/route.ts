/** Process liveness only. Database/auth/integration readiness is a separate release gate. */
export const dynamic = "force-dynamic";

export function GET() {
  const revision = process.env.RAILWAY_GIT_COMMIT_SHA;
  return Response.json({ status: "ok", ...(/^[a-f0-9]{40}$/.test(revision ?? "") ? { revision } : {}) }, { headers: { "Cache-Control": "no-store" } });
}
