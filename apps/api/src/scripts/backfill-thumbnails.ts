import { supabaseAdmin } from "../lib/supabase.js";
import { createThumbnailFromStorage } from "../lib/thumbnails.js";

type TableName = "creative_outputs" | "brand_assets";

type BackfillRow = {
  id: string;
  storage_path: string;
  thumbnail_storage_path: string | null;
};

type BackfillSummary = {
  processed: number;
  skipped: number;
  failed: number;
};

const args = new Set(process.argv.slice(2));
const batchSize = parseBatchSize(process.argv.slice(2));
const targets: TableName[] = resolveTargets(args);

async function main() {
  console.info(`[thumbnail-backfill] starting for ${targets.join(", ")} with batch size ${batchSize}`);

  const summaryByTable = new Map<TableName, BackfillSummary>();

  for (const table of targets) {
    summaryByTable.set(table, await backfillTable(table, batchSize));
  }

  const totals = Array.from(summaryByTable.values()).reduce<BackfillSummary>(
    (aggregate, summary) => ({
      processed: aggregate.processed + summary.processed,
      skipped: aggregate.skipped + summary.skipped,
      failed: aggregate.failed + summary.failed
    }),
    { processed: 0, skipped: 0, failed: 0 }
  );

  for (const [table, summary] of summaryByTable.entries()) {
    console.info(
      `[thumbnail-backfill] ${table}: processed=${summary.processed} skipped=${summary.skipped} failed=${summary.failed}`
    );
  }

  console.info(
    `[thumbnail-backfill] complete: processed=${totals.processed} skipped=${totals.skipped} failed=${totals.failed}`
  );

  if (totals.failed > 0) {
    process.exitCode = 1;
  }
}

async function backfillTable(table: TableName, limit: number): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    processed: 0,
    skipped: 0,
    failed: 0
  };

  while (true) {
    const rows = await fetchBatch(table, limit);

    if (rows.length === 0) {
      return summary;
    }

    for (const row of rows) {
      try {
        const thumbnail = await createThumbnailFromStorage(row.storage_path);
        const { data, error } = await supabaseAdmin
          .from(table)
          .update({
            thumbnail_storage_path: thumbnail.thumbnailStoragePath,
            thumbnail_width: thumbnail.thumbnailWidth,
            thumbnail_height: thumbnail.thumbnailHeight,
            thumbnail_bytes: thumbnail.thumbnailBytes
          })
          .eq("id", row.id)
          .is("thumbnail_storage_path", null)
          .select("id")
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          summary.skipped += 1;
          console.info(`[thumbnail-backfill] skipped ${table}:${row.id} because it was already updated`);
          continue;
        }

        summary.processed += 1;
        console.info(`[thumbnail-backfill] processed ${table}:${row.id}`);
      } catch (error) {
        summary.failed += 1;
        console.error(
          `[thumbnail-backfill] failed ${table}:${row.id}`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }
}

async function fetchBatch(table: TableName, limit: number) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id, storage_path, thumbnail_storage_path")
    .is("thumbnail_storage_path", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit)
    .returns<BackfillRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).filter((row) => row.storage_path && !row.thumbnail_storage_path);
}

function resolveTargets(values: Set<string>): TableName[] {
  if (values.has("--outputs-only")) {
    return ["creative_outputs"];
  }

  if (values.has("--assets-only")) {
    return ["brand_assets"];
  }

  return ["creative_outputs", "brand_assets"];
}

function parseBatchSize(values: string[]) {
  const raw = values.find((value) => value.startsWith("--batch="));
  if (!raw) {
    return 25;
  }

  const parsed = Number.parseInt(raw.slice("--batch=".length), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
}

void main().catch((error) => {
  console.error("[thumbnail-backfill] fatal", error);
  process.exit(1);
});
