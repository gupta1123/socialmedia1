import type { FastifyInstance } from "fastify";
import { BootstrapResponseSchema } from "@image-lab/contracts";
import {
  assertWorkspaceRole,
  getWorkspaceComplianceSettings,
  getPrimaryWorkspace,
  listWorkspaceAssets,
  listWorkspaceBrands,
  listWorkspaceJobs,
  listWorkspaceOutputs,
  listProjectReraRegistrations,
  listWorkspaceTemplates
} from "../lib/repository.js";
import { isPlatformAdminUser } from "../lib/credits.js";
import { createSignedImageUrls, createSignedPreviewUrl, createSignedUrl } from "../lib/storage.js";
import { toViewerResponse } from "../lib/viewer.js";

export async function registerSessionRoutes(app: FastifyInstance) {
  app.get("/api/session/bootstrap", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    const query = (request.query as { view?: string; brandId?: string } | undefined) ?? {};
    const view = typeof query.view === "string"
      ? query.view
      : "full";
    const isLightView = view === "light";
    const isCreateView = view === "create";
    const isEditorView = view === "editor";

    if (!viewer) {
      return reply.unauthorized();
    }

    const isPlatformAdmin = await isPlatformAdminUser(viewer.userId);
    const viewerResponse = toViewerResponse({
      ...viewer,
      isPlatformAdmin
    });
    const workspace = await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return BootstrapResponseSchema.parse({
        viewer: viewerResponse,
        workspace: null,
        workspaceComplianceSettings: null,
        brands: [],
        brandAssets: [],
        projectReraRegistrations: [],
        styleTemplates: [],
        recentJobs: [],
        recentOutputs: []
      });
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"]);

    const brands = await listWorkspaceBrands(workspace.id);
    const scopedBrandId =
      typeof query.brandId === "string" && brands.some((brand) => brand.id === query.brandId)
        ? query.brandId
        : brands[0]?.id;

    if (isLightView) {
      return BootstrapResponseSchema.parse({
        viewer: viewerResponse,
        workspace,
        workspaceComplianceSettings: await getWorkspaceComplianceSettings(workspace.id),
        brands,
        brandAssets: [],
        projectReraRegistrations: [],
        styleTemplates: [],
        recentJobs: [],
        recentOutputs: []
      });
    }

    const shouldLoadStyleTemplates = view === "full";
    const shouldLoadRecentJobs = view === "full" || isCreateView;
    const shouldLoadRecentOutputs = view === "full";

    const [workspaceComplianceSettings, brandAssets, projectReraRegistrations, styleTemplates, recentJobs, recentOutputs] = await Promise.all([
      getWorkspaceComplianceSettings(workspace.id),
      listWorkspaceAssets(workspace.id, scopedBrandId),
      listProjectReraRegistrations(workspace.id, scopedBrandId),
      shouldLoadStyleTemplates ? listWorkspaceTemplates(workspace.id, scopedBrandId) : Promise.resolve([]),
      shouldLoadRecentJobs ? listWorkspaceJobs(workspace.id, scopedBrandId) : Promise.resolve([]),
      shouldLoadRecentOutputs ? listWorkspaceOutputs(workspace.id, scopedBrandId) : Promise.resolve([])
    ]);

    const [assetUrls, templateUrls, outputUrls] = await Promise.all([
      Promise.all(
        brandAssets.map((asset) =>
          isEditorView
            ? createSignedPreviewUrl(asset.storagePath, asset.thumbnailStoragePath).then((previewUrl) => ({
                previewUrl: previewUrl ?? undefined,
                thumbnailUrl: previewUrl ?? undefined
              }))
            : createSignedImageUrls(asset.storagePath, asset.thumbnailStoragePath)
        )
      ),
      Promise.all(styleTemplates.map((template) => createSignedUrl(template.storagePath).catch(() => null))),
      isCreateView
        ? Promise.resolve([])
        : Promise.all(recentOutputs.map((output) => createSignedImageUrls(output.storagePath, output.thumbnailStoragePath)))
    ]);

    const response = BootstrapResponseSchema.parse({
      viewer: viewerResponse,
      workspace,
      workspaceComplianceSettings,
      brands,
      brandAssets: brandAssets.map((asset, index) => ({
        ...asset,
        previewUrl:
          assetUrls[index] && "originalUrl" in assetUrls[index]
            ? assetUrls[index]?.originalUrl
            : assetUrls[index]?.previewUrl,
        thumbnailUrl: assetUrls[index]?.thumbnailUrl,
        ...(assetUrls[index] && "originalUrl" in assetUrls[index] && assetUrls[index]?.originalUrl
          ? { originalUrl: assetUrls[index]?.originalUrl }
          : {})
      })),
      projectReraRegistrations,
      styleTemplates: styleTemplates.map((template, index) => ({
        ...template,
        previewUrl: templateUrls[index] ?? undefined
      })),
      recentJobs,
      recentOutputs: recentOutputs.map((output, index) => ({
        ...output,
        previewUrl: outputUrls[index]?.originalUrl,
        thumbnailUrl: outputUrls[index]?.thumbnailUrl,
        originalUrl: outputUrls[index]?.originalUrl
      })),
      workspaceMembers: []
    });

    return response;
  });
}
