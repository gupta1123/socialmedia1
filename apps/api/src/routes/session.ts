import type { FastifyInstance } from "fastify";
import { BootstrapResponseSchema } from "@image-lab/contracts";
import {
  assertWorkspaceRole,
  getPrimaryWorkspace,
  listWorkspaceAssets,
  listWorkspaceBrands,
  listWorkspaceJobs,
  listWorkspaceOutputs,
  listWorkspaceTemplates
} from "../lib/repository.js";
import { env } from "../lib/config.js";
import { createSignedUrl } from "../lib/storage.js";
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

    if (!viewer) {
      return reply.unauthorized();
    }

    const viewerResponse = toViewerResponse(viewer);
    const workspace = await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return BootstrapResponseSchema.parse({
        viewer: viewerResponse,
        aiEdit: {
          flow: env.AI_EDIT_FLOW
        },
        workspace: null,
        brands: [],
        brandAssets: [],
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
        aiEdit: {
          flow: env.AI_EDIT_FLOW
        },
        workspace,
        brands,
        brandAssets: [],
        styleTemplates: [],
        recentJobs: [],
        recentOutputs: []
      });
    }

    const [brandAssets, styleTemplates, recentJobs, recentOutputs] = await Promise.all([
      listWorkspaceAssets(workspace.id, scopedBrandId),
      listWorkspaceTemplates(workspace.id, scopedBrandId),
      listWorkspaceJobs(workspace.id, scopedBrandId),
      isCreateView ? Promise.resolve([]) : listWorkspaceOutputs(workspace.id, scopedBrandId)
    ]);

    const [assetUrls, templateUrls, outputUrls] = await Promise.all([
      Promise.all(brandAssets.map((asset) => createSignedUrl(asset.storagePath).catch(() => null))),
      Promise.all(styleTemplates.map((template) => createSignedUrl(template.storagePath).catch(() => null))),
      isCreateView
        ? Promise.resolve([])
        : Promise.all(recentOutputs.map((output) => createSignedUrl(output.storagePath).catch(() => null)))
    ]);

    const response = BootstrapResponseSchema.parse({
      viewer: viewerResponse,
      aiEdit: {
        flow: env.AI_EDIT_FLOW
      },
      workspace,
      brands,
      brandAssets: brandAssets.map((asset, index) => ({
        ...asset,
        previewUrl: assetUrls[index] ?? undefined
      })),
      styleTemplates: styleTemplates.map((template, index) => ({
        ...template,
        previewUrl: templateUrls[index] ?? undefined
      })),
      recentJobs,
      recentOutputs: recentOutputs.map((output, index) => ({
        ...output,
        previewUrl: outputUrls[index] ?? undefined
      }))
    });

    return response;
  });
}
