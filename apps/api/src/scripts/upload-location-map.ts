import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SUPABASE_URL = "https://xuvecgnuphvzjxtowqem.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dmVjZ251cGh2emp4dG93cWVtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQ3MzAwMiwiZXhwIjoyMDkxMDQ5MDAyfQ.E7MZXV-54P0J91WWXwhWVUdnEeZ1ACIpjpUN_5aL2Jo";
const STORAGE_BUCKET = "creative-assets";

const BRAND_ID = "71eaacfe-583c-4235-bfe8-48b027563ca6"; // Sankla Buildcoon
const PROJECT_ID = "c2ba3fe7-9f18-47aa-ab6c-2e6b2292c6df"; // East World
const WORKSPACE_ID = "610ea654-5163-4f68-a8d9-41cbd4a49b2f"; // Sankla Buildcoon workspace

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function uploadBrandAsset() {
  const imagePath = "./LA.png";
  const imageBuffer = fs.readFileSync(imagePath);
  const fileName = "LA.png";
  const mimeType = "image/png";

  const assetId = crypto.randomUUID();
  const storagePath = `brand-assets/${assetId}.png`;

  console.log("Uploading LA.png as location map asset...");
  console.log("Asset ID:", assetId);
  console.log("Storage Path:", storagePath);

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, imageBuffer, {
      contentType: mimeType,
      upsert: false
    });

  if (uploadError) {
    console.error("Storage upload failed:", uploadError);
    throw uploadError;
  }

  console.log("Storage upload successful!");

  // Insert into brand_assets
  const metadata = {
    subjectType: "location_map",
    amenityName: null,
    qualityTier: "hero",
    usageIntent: "truth_anchor",
    viewType: "map",
    tags: ["location", "map", "nearby landmarks", "area map", "connectivity", "transport"],
    preserveIdentity: true
  };

  const { error: insertError } = await supabase.from("brand_assets").insert({
    id: assetId,
    workspace_id: WORKSPACE_ID,
    brand_id: BRAND_ID,
    project_id: PROJECT_ID,
    kind: "reference",
    label: "East World - Location Map with Nearby Landmarks",
    file_name: fileName,
    mime_type: mimeType,
    storage_path: storagePath,
    thumbnail_storage_path: null,
    metadata_json: metadata,
    created_by: null
  });

  if (insertError) {
    console.error("Database insert failed:", insertError);
    throw insertError;
  }

  console.log("Brand asset record created successfully!");
  console.log("");
  console.log("=== SUMMARY ===");
  console.log("Asset ID:", assetId);
  console.log("Brand: Sankla Buildcoon (East World)");
  console.log("Kind: reference");
  console.log("Subject: location_map");
  console.log("Storage:", storagePath);
}

uploadBrandAsset().catch(console.error);