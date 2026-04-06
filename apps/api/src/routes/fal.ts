import type { FastifyInstance } from "fastify";
import { supabaseAdmin } from "../lib/supabase.js";
import { refreshJobOutputs } from "../lib/job-sync.js";

export async function registerFalRoutes(app: FastifyInstance) {
  app.post("/api/fal/webhooks", async (request) => {
    const payload = request.body as Record<string, unknown> | undefined;
    const requestId =
      typeof payload?.request_id === "string"
        ? payload.request_id
        : typeof payload?.requestId === "string"
          ? payload.requestId
          : null;

    if (!requestId) {
      return { ok: true, ignored: true };
    }

    const rawStatus =
      typeof payload?.status === "string"
        ? payload.status.toLowerCase()
        : typeof payload?.event_type === "string"
          ? payload.event_type.toLowerCase()
          : "processing";

    const status =
      rawStatus.includes("complete") || rawStatus.includes("success")
        ? "completed"
        : rawStatus.includes("fail")
          ? "failed"
          : "processing";

    const { data: jobs, error } = await supabaseAdmin
      .from("creative_jobs")
      .update({
        status,
        webhook_payload: payload ?? {}
      })
      .eq("provider_request_id", requestId)
      .select("id");

    if (error) {
      throw error;
    }

    if (status === "completed") {
      await Promise.all(
        (jobs ?? []).map((job) =>
          refreshJobOutputs((job as { id: string }).id).catch(() => null)
        )
      );
    }

    return { ok: true };
  });
}
