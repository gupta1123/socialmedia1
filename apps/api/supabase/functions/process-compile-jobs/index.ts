import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SOCIAL_PYTHON_URL = Deno.env.get("AGNO_AGENT_V2_SERVER_URL")?.trim() ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resolveCompilePayload(inputBrief: Record<string, unknown>) {
  const payload = asRecord(inputBrief.payload);
  if (Object.keys(payload).length > 0) {
    return payload;
  }
  return inputBrief;
}

interface CompileJob {
  id: string;
  workspace_id: string;
  brand_id: string;
  status: string;
  input_brief: Record<string, unknown>;
}

async function processCompileJob(job: CompileJob): Promise<void> {
  const { id, workspace_id, brand_id, input_brief } = job;

  try {
    if (!SOCIAL_PYTHON_URL) {
      throw new Error("AGNO_AGENT_V2_SERVER_URL is not configured for the process-compile-jobs edge function.");
    }

    const payload = resolveCompilePayload(input_brief);
    if (Object.keys(payload).length === 0) {
      throw new Error("Compile job payload is missing. Recompile before generating options.");
    }

    const response = await fetch(SOCIAL_PYTHON_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({
        payload
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Social python error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    await supabaseClient
      .from("compile_jobs")
      .update({
        status: "completed",
        result: result,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await supabaseClient
      .from("compile_jobs")
      .update({
        status: "failed",
        error_json: { message: errorMessage },
        updated_at: new Date().toISOString()
      })
      .eq("id", id);
  }
}

async function pollAndProcess(): Promise<number> {
  const { data: pendingJobs, error } = await supabaseClient
    .from("compile_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    console.error("Error fetching pending jobs:", error);
    return 0;
  }

  if (!pendingJobs || pendingJobs.length === 0) {
    return 0;
  }

  console.log(`Processing ${pendingJobs.length} pending compile jobs`);

  for (const job of pendingJobs) {
    await supabaseClient
      .from("compile_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", job.id);

    await processCompileJob(job as CompileJob);
  }

  return pendingJobs.length;
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    const processed = await pollAndProcess();
    return new Response(JSON.stringify({ success: true, processed }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });
  }

  if (req.method === "POST") {
    await pollAndProcess();
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    headers: { "Content-Type": "application/json" },
    status: 405
  });
});
