import type { FastifyInstance } from "fastify";
import { AssetKindSchema, BrandAssetSchema, BrandDetailSchema, CreateBrandSchema, BrandProfileSchema, UpdateBrandSchema } from "@image-lab/contracts";
import {
  getPrimaryWorkspace,
  assertWorkspaceRole,
  getBrand,
  getBrandAssetCounts,
  getBrandProfileVersion,
  listBrandAssets
} from "../lib/repository.js";
import { getProject } from "../lib/planning-repository.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { createSignedImageUrls, removeStorageObjects, uploadBufferToStorage } from "../lib/storage.js";
import { createThumbnailFromBuffer } from "../lib/thumbnails.js";
import { buildStoragePath, randomId, slugify } from "../lib/utils.js";
import { invalidateRuntimeCache } from "../lib/runtime-cache.js";

export async function registerBrandRoutes(app: FastifyInstance) {
  app.get("/api/brands/:brandId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const brand = await getBrand((request.params as { brandId: string }).brandId);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);

    const [assetCounts, activeProfile] = await Promise.all([
      getBrandAssetCounts(brand.id),
      brand.currentProfileVersionId ? getBrandProfileVersion(brand.currentProfileVersionId) : Promise.resolve(null)
    ]);

    return BrandDetailSchema.parse({
      brand,
      activeProfile,
      assetCounts
    });
  });

  app.get("/api/brands/:brandId/assets", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const brand = await getBrand((request.params as { brandId: string }).brandId);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);

    const assets = await listBrandAssets(brand.id);
    const assetUrls = await Promise.all(
      assets.map((asset) => createSignedImageUrls(asset.storagePath, asset.thumbnailStoragePath))
    );

    return BrandAssetSchema.array().parse(
      assets.map((asset, index) => ({
        ...asset,
        previewUrl: assetUrls[index]?.originalUrl,
        thumbnailUrl: assetUrls[index]?.thumbnailUrl,
        originalUrl: assetUrls[index]?.originalUrl
      }))
    );
  });

  app.post("/api/brands", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const body = CreateBrandSchema.parse(request.body);
    const workspace = body.workspaceId
      ? { id: body.workspaceId }
      : await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return reply.badRequest("No workspace available");
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor"], request.log);

    const brandId = randomId();
    const profileId = randomId();

    const { error: brandError } = await supabaseAdmin.from("brands").insert({
      id: brandId,
      workspace_id: workspace.id,
      name: body.name,
      slug: slugify(body.name),
      description: body.description ?? null
    });

    if (brandError) {
      throw brandError;
    }

    const { error: profileError } = await supabaseAdmin.from("brand_profile_versions").insert({
      id: profileId,
      workspace_id: workspace.id,
      brand_id: brandId,
      version_number: 1,
      profile_json: BrandProfileSchema.parse(body.profile),
      created_by: viewer.userId
    });

    if (profileError) {
      throw profileError;
    }

    const { error: updateError } = await supabaseAdmin
      .from("brands")
      .update({ current_profile_version_id: profileId })
      .eq("id", brandId);

    if (updateError) {
      throw updateError;
    }

    invalidateRuntimeCache(`workspace-brands:${workspace.id}`);

    return { id: brandId, currentProfileVersionId: profileId };
  });

  app.patch("/api/brands/:brandId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const brand = await getBrand((request.params as { brandId: string }).brandId);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor"], request.log);

    const body = UpdateBrandSchema.parse(request.body);

    const { data: latestProfileRow, error: latestProfileError } = await supabaseAdmin
      .from("brand_profile_versions")
      .select("version_number")
      .eq("brand_id", brand.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestProfileError) {
      throw latestProfileError;
    }

    const nextVersionNumber =
      typeof latestProfileRow?.version_number === "number" ? latestProfileRow.version_number + 1 : 1;
    const profileId = randomId();

    const { error: profileError } = await supabaseAdmin.from("brand_profile_versions").insert({
      id: profileId,
      workspace_id: brand.workspaceId,
      brand_id: brand.id,
      version_number: nextVersionNumber,
      profile_json: BrandProfileSchema.parse(body.profile),
      created_by: viewer.userId
    });

    if (profileError) {
      throw profileError;
    }

    const { error: updateError } = await supabaseAdmin
      .from("brands")
      .update({
        name: body.name,
        slug: slugify(body.name),
        description: body.description ?? null,
        current_profile_version_id: profileId
      })
      .eq("id", brand.id);

    if (updateError) {
      throw updateError;
    }

    invalidateRuntimeCache(`workspace-brands:${brand.workspaceId}`);

    return { id: brand.id, currentProfileVersionId: profileId };
  });

  app.post("/api/brands/:brandId/assets", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const brand = await getBrand((request.params as { brandId: string }).brandId);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor"], request.log);

    let filePart:
      | {
          filename: string;
          mimetype: string;
          buffer: Buffer;
        }
      | null = null;
    let labelValue: string | null = null;
    let kindValue: string | null = null;
    let projectIdValue: string | null = null;
    let metadataJsonValue: Record<string, unknown> = {};

    for await (const part of request.parts()) {
      if (part.type === "file") {
        const buffer = await part.toBuffer();

        if (!filePart) {
          filePart = {
            filename: part.filename,
            mimetype: part.mimetype,
            buffer
          };
        }
        continue;
      }

      if (part.fieldname === "kind") {
        kindValue = typeof part.value === "string" ? part.value : String(part.value ?? "");
      }

      if (part.fieldname === "label") {
        labelValue = typeof part.value === "string" ? part.value : String(part.value ?? "");
      }

      if (part.fieldname === "projectId") {
        projectIdValue = typeof part.value === "string" ? part.value : String(part.value ?? "");
      }

      if (part.fieldname === "metadataJson") {
        const raw = typeof part.value === "string" ? part.value : String(part.value ?? "");
        if (raw.trim()) {
          try {
            const parsed = JSON.parse(raw);
            metadataJsonValue = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
          } catch {
            return reply.badRequest("metadataJson must be valid JSON");
          }
        }
      }
    }

    if (!filePart) {
      return reply.badRequest("File upload is required");
    }

    const kind = AssetKindSchema.parse(kindValue?.trim() || "reference");
    const label = labelValue?.trim() || filePart.filename;
    const projectId = projectIdValue?.trim() || null;
    const buffer = filePart.buffer;
    const assetId = randomId();

    if (projectId) {
      const project = await getProject(projectId);
      if (project.workspaceId !== brand.workspaceId || project.brandId !== brand.id) {
        return reply.badRequest("Project does not belong to the target brand/workspace");
      }
    }

    const storagePath = buildStoragePath({
      workspaceId: brand.workspaceId,
      brandId: brand.id,
      section:
        kind === "logo"
          ? "logos"
          : kind === "rera_qr"
            ? "compliance"
            : kind === "product"
              ? "product"
              : kind === "inspiration"
                ? "inspiration"
                : "references",
      id: assetId,
      fileName: filePart.filename
    });

    await uploadBufferToStorage(storagePath, buffer, filePart.mimetype);
    const thumbnail = await createThumbnailFromBuffer(storagePath, buffer).catch(() => null);

    const { error } = await supabaseAdmin.from("brand_assets").insert({
      id: assetId,
      workspace_id: brand.workspaceId,
      brand_id: brand.id,
      project_id: projectId,
      kind,
      label,
      file_name: filePart.filename,
      mime_type: filePart.mimetype,
      storage_path: storagePath,
      thumbnail_storage_path: thumbnail?.thumbnailStoragePath ?? null,
      thumbnail_width: thumbnail?.thumbnailWidth ?? null,
      thumbnail_height: thumbnail?.thumbnailHeight ?? null,
      thumbnail_bytes: thumbnail?.thumbnailBytes ?? null,
      metadata_json: metadataJsonValue,
      created_by: viewer.userId
    });

    if (error) {
      throw error;
    }

    invalidateRuntimeCache(`brand-asset-counts:${brand.id}`);

    return { id: assetId, storagePath };
  });

  app.delete("/api/brands/:brandId/assets/:assetId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const { brandId, assetId } = request.params as { brandId: string; assetId: string };
    const brand = await getBrand(brandId);
    await assertWorkspaceRole(viewer, brand.workspaceId, ["owner", "admin", "editor"], request.log);

    const { data: asset, error: assetError } = await supabaseAdmin
      .from("brand_assets")
      .select("storage_path, thumbnail_storage_path")
      .eq("id", assetId)
      .eq("brand_id", brandId)
      .maybeSingle();

    if (assetError) {
      throw assetError;
    }

    const { error } = await supabaseAdmin
      .from("brand_assets")
      .delete()
      .eq("id", assetId)
      .eq("brand_id", brandId);

    if (error) {
      throw error;
    }

    await removeStorageObjects([
      (asset as { storage_path?: string | null; thumbnail_storage_path?: string | null } | null)?.storage_path ?? "",
      (asset as { storage_path?: string | null; thumbnail_storage_path?: string | null } | null)?.thumbnail_storage_path ?? ""
    ]);

    invalidateRuntimeCache(`brand-asset-counts:${brand.id}`);

    return { success: true };
  });
}
