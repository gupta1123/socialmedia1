import { supabaseAdmin } from "../lib/supabase.js";
import { removeStorageObjects } from "../lib/storage.js";

type BrandRow = {
  id: string;
  name: string;
  workspace_id: string;
};

type OutputRow = {
  id: string;
  storage_path: string;
  thumbnail_storage_path: string | null;
  kind: "style_seed" | "final";
  created_at: string;
};

const args = process.argv.slice(2);
const brandName = readStringArg("--brand");
const shouldExecute = args.includes("--execute");
const batchSize = readNumberArg("--batch", 100);

async function main() {
  if (!brandName) {
    throw new Error("Missing required --brand argument");
  }

  const brand = await findBrandByName(brandName);
  if (!brand) {
    throw new Error(`Brand not found: ${brandName}`);
  }

  const outputs = await listBrandOutputs(brand.id);
  const summary = summarizeOutputs(outputs);

  console.info(
    JSON.stringify(
      {
        mode: shouldExecute ? "execute" : "dry-run",
        brandId: brand.id,
        brandName: brand.name,
        workspaceId: brand.workspace_id,
        outputCount: outputs.length,
        finalCount: summary.finalCount,
        styleSeedCount: summary.styleSeedCount,
        oldestCreatedAt: summary.oldestCreatedAt,
        newestCreatedAt: summary.newestCreatedAt,
        sampleOutputIds: outputs.slice(0, 10).map((row) => row.id)
      },
      null,
      2
    )
  );

  if (!shouldExecute) {
    return;
  }

  let removedRows = 0;
  let removedFiles = 0;

  for (let index = 0; index < outputs.length; index += batchSize) {
    const batch = outputs.slice(index, index + batchSize);
    const outputIds = batch.map((row) => row.id);
    const storagePaths = batch.flatMap((row) => [row.storage_path, row.thumbnail_storage_path ?? ""]);

    await removeStorageObjects(storagePaths);

    const { data, error } = await supabaseAdmin
      .from("creative_outputs")
      .delete()
      .in("id", outputIds)
      .select("id")
      .returns<Array<{ id: string }>>();

    if (error) {
      throw error;
    }

    removedRows += data?.length ?? 0;
    removedFiles += Array.from(new Set(storagePaths.filter(Boolean))).length;

    console.info(
      `[brand-gallery-cleanup] removed batch ${Math.floor(index / batchSize) + 1}: rows=${data?.length ?? 0} files=${Array.from(
        new Set(storagePaths.filter(Boolean))
      ).length}`
    );
  }

  console.info(
    JSON.stringify(
      {
        ok: true,
        brandId: brand.id,
        brandName: brand.name,
        removedRows,
        removedFiles
      },
      null,
      2
    )
  );
}

async function findBrandByName(name: string) {
  const { data, error } = await supabaseAdmin
    .from("brands")
    .select("id, name, workspace_id")
    .ilike("name", name)
    .returns<BrandRow[]>();

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return null;
  }

  if (data.length > 1) {
    throw new Error(`Multiple brands matched "${name}". Use a unique brand name.`);
  }

  return data[0];
}

async function listBrandOutputs(brandId: string) {
  const { data, error } = await supabaseAdmin
    .from("creative_outputs")
    .select("id, storage_path, thumbnail_storage_path, kind, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .returns<OutputRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

function summarizeOutputs(outputs: OutputRow[]) {
  const finalCount = outputs.filter((row) => row.kind === "final").length;
  const styleSeedCount = outputs.length - finalCount;

  return {
    finalCount,
    styleSeedCount,
    newestCreatedAt: outputs[0]?.created_at ?? null,
    oldestCreatedAt: outputs.at(-1)?.created_at ?? null
  };
}

function readStringArg(name: string) {
  const raw = args.find((value) => value.startsWith(`${name}=`));
  if (!raw) {
    return null;
  }

  const value = raw.slice(name.length + 1).trim();
  return value.length > 0 ? value : null;
}

function readNumberArg(name: string, fallback: number) {
  const raw = readStringArg(name);
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

void main().catch((error) => {
  console.error("[brand-gallery-cleanup] fatal", error instanceof Error ? error.message : error);
  process.exit(1);
});
