import type { FastifyInstance } from "fastify";
import { CreateProjectSchema, ProjectDetailSchema, ProjectSchema, ProjectProfileSchema, UpdateProjectSchema } from "@image-lab/contracts";
import { assertWorkspaceRole, getBrand, getPrimaryWorkspace } from "../lib/repository.js";
import { getActiveProjectProfile, getProject, listWorkspaceProjects } from "../lib/planning-repository.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { randomId, slugify } from "../lib/utils.js";

export async function registerProjectRoutes(app: FastifyInstance) {
  app.get("/api/projects", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const query = request.query as { brandId?: string };
    const projects = await listWorkspaceProjects(workspace.id);
    const visibleProjects = query.brandId ? projects.filter((project) => project.brandId === query.brandId) : projects;
    return visibleProjects.map((project) => ProjectSchema.parse(project));
  });

  app.get("/api/projects/:projectId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const project = await getProject((request.params as { projectId: string }).projectId);
    await assertWorkspaceRole(viewer, project.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);

    const activeProfile = project.currentProfileVersionId
      ? await getActiveProjectProfile(project.id).catch(() => null)
      : null;

    return ProjectDetailSchema.parse({
      project,
      activeProfile
    });
  });

  app.post("/api/projects", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const body = CreateProjectSchema.parse(request.body);
    const brand = await getBrand(body.brandId);
    const workspace = body.workspaceId ? { id: body.workspaceId } : await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return reply.badRequest("No workspace available");
    }

    if (workspace.id !== brand.workspaceId) {
      return reply.badRequest("Brand does not belong to the target workspace");
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor"], request.log);

    const projectId = randomId();
    const profileId = randomId();

    const { error: projectError } = await supabaseAdmin.from("projects").insert({
      id: projectId,
      workspace_id: workspace.id,
      brand_id: brand.id,
      name: body.name,
      slug: slugify(body.name),
      city: body.city ?? null,
      micro_location: body.microLocation ?? null,
      project_type: body.projectType ?? null,
      stage: body.stage,
      status: "active",
      description: body.description ?? null,
      created_by: viewer.userId
    });

    if (projectError) {
      throw projectError;
    }

    const { error: profileError } = await supabaseAdmin.from("project_profile_versions").insert({
      id: profileId,
      workspace_id: workspace.id,
      project_id: projectId,
      version_number: 1,
      profile_json: ProjectProfileSchema.parse(body.profile),
      created_by: viewer.userId
    });

    if (profileError) {
      throw profileError;
    }

    const { error: updateError } = await supabaseAdmin
      .from("projects")
      .update({ current_profile_version_id: profileId })
      .eq("id", projectId);

    if (updateError) {
      throw updateError;
    }

    const project = await getProject(projectId);
    const activeProfile = await getActiveProjectProfile(projectId);

    return ProjectDetailSchema.parse({
      project,
      activeProfile
    });
  });

  app.patch("/api/projects/:projectId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const project = await getProject((request.params as { projectId: string }).projectId);
    const body = UpdateProjectSchema.parse(request.body);
    await assertWorkspaceRole(viewer, project.workspaceId, ["owner", "admin", "editor"], request.log);

    const { data: latestProfileRow, error: latestProfileError } = await supabaseAdmin
      .from("project_profile_versions")
      .select("version_number")
      .eq("project_id", project.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestProfileError) {
      throw latestProfileError;
    }

    const nextVersionNumber = typeof latestProfileRow?.version_number === "number" ? latestProfileRow.version_number + 1 : 1;
    const profileId = randomId();

    const { error: profileError } = await supabaseAdmin.from("project_profile_versions").insert({
      id: profileId,
      workspace_id: project.workspaceId,
      project_id: project.id,
      version_number: nextVersionNumber,
      profile_json: ProjectProfileSchema.parse(body.profile),
      created_by: viewer.userId
    });

    if (profileError) {
      throw profileError;
    }

    const { error: updateError } = await supabaseAdmin
      .from("projects")
      .update({
        name: body.name,
        slug: slugify(body.name),
        description: body.description ?? null,
        city: body.city ?? null,
        micro_location: body.microLocation ?? null,
        project_type: body.projectType ?? null,
        stage: body.stage,
        status: body.status,
        current_profile_version_id: profileId
      })
      .eq("id", project.id);

    if (updateError) {
      throw updateError;
    }

    return ProjectDetailSchema.parse({
      project: await getProject(project.id),
      activeProfile: await getActiveProjectProfile(project.id)
    });
  });
}
