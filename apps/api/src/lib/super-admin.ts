import type {
  AdminAuditEntry,
  AdminFailedJob,
  AdminOpsJobItem,
  AdminOpsSummary,
  AdminOrgDetail,
  AdminOrgListResponse,
  AdminOrgMember,
  AdminOrgSummary,
  AdminOverview,
  AdminPlatformAdmin,
  WorkspaceCreditLedgerEntry,
  WorkspaceCreditWallet,
  WorkspaceRole
} from "@image-lab/contracts";
import { getWorkspaceCreditWallet, listAdminCreditWorkspaces, listWorkspaceCreditLedger } from "./credits.js";
import { invalidateRuntimeCache } from "./runtime-cache.js";
import { supabaseAdmin } from "./supabase.js";

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  created_by: string | null;
};

type MembershipRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
};

type WalletRow = {
  workspace_id: string;
  balance: number | string;
};

type CreditLedgerRow = {
  id: string;
  workspace_id: string;
  direction: WorkspaceCreditLedgerEntry["direction"];
  entry_kind: WorkspaceCreditLedgerEntry["entryKind"];
  amount: number | string;
  balance_after: number | string;
  actor_user_id: string | null;
  reservation_id: string | null;
  source: string | null;
  source_ref: string | null;
  note: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
};

type JobRow = {
  id: string;
  workspace_id: string;
  brand_id: string | null;
  job_type: AdminFailedJob["jobType"];
  status: AdminFailedJob["status"];
  error_json: Record<string, unknown> | null;
  created_at: string;
  created_by?: string | null;
};

type PlatformAdminRoleRow = {
  user_id: string;
  role: "super_admin";
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function coerceInt(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }

  return 0;
}

function sanitizeSearchTerm(input: string) {
  return input.replace(/[^a-zA-Z0-9 _-]/g, "").trim();
}

function extractErrorMessage(errorJson: unknown) {
  if (!errorJson) {
    return null;
  }

  if (typeof errorJson === "string") {
    const trimmed = errorJson.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof errorJson === "object") {
    const record = errorJson as Record<string, unknown>;
    const messageCandidate =
      (typeof record.message === "string" && record.message) ||
      (typeof record.error === "string" && record.error) ||
      (typeof record.detail === "string" && record.detail) ||
      (typeof record.reason === "string" && record.reason) ||
      null;

    if (messageCandidate) {
      const trimmed = messageCandidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  try {
    const serialized = JSON.stringify(errorJson);
    return serialized.length > 240 ? `${serialized.slice(0, 237)}...` : serialized;
  } catch {
    return null;
  }
}

function minutesSince(isoTimestamp: string) {
  const createdAtMs = Date.parse(isoTimestamp);
  if (!Number.isFinite(createdAtMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - createdAtMs) / 60_000));
}

function mapLedgerRow(row: CreditLedgerRow): WorkspaceCreditLedgerEntry {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    direction: row.direction,
    entryKind: row.entry_kind,
    amount: coerceInt(row.amount),
    balanceAfter: coerceInt(row.balance_after),
    actorUserId: row.actor_user_id,
    reservationId: row.reservation_id,
    source: row.source,
    sourceRef: row.source_ref,
    note: row.note,
    metadataJson: row.metadata_json ?? {},
    createdAt: row.created_at
  };
}

function mapJobRowToFailedJob(row: JobRow): AdminFailedJob {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    jobType: row.job_type,
    status: row.status,
    errorMessage: extractErrorMessage(row.error_json),
    createdAt: row.created_at
  };
}

async function listProfilesByIds(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, ProfileRow>();
  }

  const uniqueIds = Array.from(new Set(userIds));
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, display_name")
    .in("id", uniqueIds);

  if (error) {
    throw error;
  }

  const profileMap = new Map<string, ProfileRow>();
  for (const row of (data ?? []) as ProfileRow[]) {
    profileMap.set(row.id, row);
  }

  return profileMap;
}

async function listWorkspacesByIds(workspaceIds: string[]) {
  if (workspaceIds.length === 0) {
    return new Map<string, { id: string; name: string; slug: string }>();
  }

  const uniqueIds = Array.from(new Set(workspaceIds));
  const { data, error } = await supabaseAdmin.from("workspaces").select("id, name, slug").in("id", uniqueIds);
  if (error) {
    throw error;
  }

  const workspaceMap = new Map<string, { id: string; name: string; slug: string }>();
  for (const row of (data ?? []) as Array<{ id: string; name: string; slug: string }>) {
    workspaceMap.set(row.id, row);
  }

  return workspaceMap;
}

export async function listAdminGlobalCreditLedger(params?: {
  limit?: number;
  offset?: number;
  workspaceId?: string;
}) {
  const boundedLimit = Math.min(200, Math.max(1, params?.limit ?? 50));
  const boundedOffset = Math.max(0, params?.offset ?? 0);

  let query = supabaseAdmin
    .from("workspace_credit_ledger")
    .select(
      "id, workspace_id, direction, entry_kind, amount, balance_after, actor_user_id, reservation_id, source, source_ref, note, metadata_json, created_at"
    )
    .order("created_at", { ascending: false });

  if (params?.workspaceId) {
    query = query.eq("workspace_id", params.workspaceId);
  }

  const { data, error } = await query.range(boundedOffset, boundedOffset + boundedLimit - 1);

  if (error) {
    throw error;
  }

  return ((data ?? []) as CreditLedgerRow[]).map(mapLedgerRow);
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const last24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    workspaceCountResult,
    membershipCountResult,
    superAdminCountResult,
    pendingReviewCountResult,
    failedJobsCountResult,
    walletsResult,
    topWorkspaces,
    recentCreditEntries,
    recentFailedJobsResult
  ] = await Promise.all([
    supabaseAdmin.from("workspaces").select("id", { head: true, count: "exact" }),
    supabaseAdmin.from("workspace_memberships").select("id", { head: true, count: "exact" }),
    supabaseAdmin
      .from("platform_admin_roles")
      .select("user_id", { head: true, count: "exact" })
      .eq("active", true)
      .eq("role", "super_admin"),
    supabaseAdmin
      .from("creative_outputs")
      .select("id", { head: true, count: "exact" })
      .eq("review_state", "pending_review"),
    supabaseAdmin.from("creative_jobs").select("id", { head: true, count: "exact" }).eq("status", "failed").gte("created_at", last24hIso),
    supabaseAdmin.from("workspace_credit_wallets").select("balance"),
    listAdminCreditWorkspaces({ limit: 8 }),
    listAdminGlobalCreditLedger({ limit: 10, offset: 0 }),
    supabaseAdmin
      .from("creative_jobs")
      .select("id, workspace_id, brand_id, job_type, status, error_json, created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  if (workspaceCountResult.error) throw workspaceCountResult.error;
  if (membershipCountResult.error) throw membershipCountResult.error;
  if (superAdminCountResult.error) throw superAdminCountResult.error;
  if (pendingReviewCountResult.error) throw pendingReviewCountResult.error;
  if (failedJobsCountResult.error) throw failedJobsCountResult.error;
  if (walletsResult.error) throw walletsResult.error;
  if (recentFailedJobsResult.error) throw recentFailedJobsResult.error;

  const totalCreditBalance = ((walletsResult.data ?? []) as WalletRow[]).reduce(
    (sum, wallet) => sum + coerceInt(wallet.balance),
    0
  );

  return {
    totals: {
      workspaceCount: workspaceCountResult.count ?? 0,
      memberCount: membershipCountResult.count ?? 0,
      superAdminCount: superAdminCountResult.count ?? 0,
      totalCreditBalance,
      pendingReviewOutputs: pendingReviewCountResult.count ?? 0,
      failedJobsLast24h: failedJobsCountResult.count ?? 0
    },
    topWorkspaces,
    recentCreditEntries,
    recentFailedJobs: ((recentFailedJobsResult.data ?? []) as JobRow[]).map(mapJobRowToFailedJob)
  };
}

export async function listAdminOrgs(params?: {
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminOrgListResponse> {
  const rawQuery = params?.query?.trim() ?? "";
  const query = sanitizeSearchTerm(rawQuery);
  const limit = Math.min(200, Math.max(1, params?.limit ?? 50));
  const offset = Math.max(0, params?.offset ?? 0);

  let workspaceCountQuery = supabaseAdmin.from("workspaces").select("id", { count: "exact", head: true });
  let workspaceListQuery = supabaseAdmin
    .from("workspaces")
    .select("id, name, slug, created_at, created_by")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (query.length > 0) {
    workspaceCountQuery = workspaceCountQuery.or(`name.ilike.%${query}%,slug.ilike.%${query}%`);
    workspaceListQuery = workspaceListQuery.or(`name.ilike.%${query}%,slug.ilike.%${query}%`);
  }

  const [{ count, error: countError }, { data, error: listError }] = await Promise.all([workspaceCountQuery, workspaceListQuery]);
  if (countError) {
    throw countError;
  }
  if (listError) {
    throw listError;
  }

  const workspaces = (data ?? []) as WorkspaceRow[];
  const workspaceIds = workspaces.map((workspace) => workspace.id);

  const [membershipResult, walletResult] = await Promise.all([
    workspaceIds.length > 0
      ? supabaseAdmin.from("workspace_memberships").select("id, workspace_id, user_id, role, created_at, updated_at").in("workspace_id", workspaceIds)
      : Promise.resolve({ data: [], error: null }),
    workspaceIds.length > 0
      ? supabaseAdmin.from("workspace_credit_wallets").select("workspace_id, balance").in("workspace_id", workspaceIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (membershipResult.error) throw membershipResult.error;
  if (walletResult.error) throw walletResult.error;

  const memberships = (membershipResult.data ?? []) as MembershipRow[];
  const wallets = (walletResult.data ?? []) as WalletRow[];

  const walletByWorkspace = new Map<string, number>();
  for (const wallet of wallets) {
    walletByWorkspace.set(wallet.workspace_id, coerceInt(wallet.balance));
  }

  const memberCountByWorkspace = new Map<string, number>();
  const adminCountByWorkspace = new Map<string, number>();
  const ownerByWorkspace = new Map<string, string>();

  for (const membership of memberships) {
    memberCountByWorkspace.set(membership.workspace_id, (memberCountByWorkspace.get(membership.workspace_id) ?? 0) + 1);

    if (membership.role === "owner" || membership.role === "admin") {
      adminCountByWorkspace.set(membership.workspace_id, (adminCountByWorkspace.get(membership.workspace_id) ?? 0) + 1);
    }

    if (membership.role === "owner" && !ownerByWorkspace.has(membership.workspace_id)) {
      ownerByWorkspace.set(membership.workspace_id, membership.user_id);
    }
  }

  const ownerIds = Array.from(ownerByWorkspace.values());
  const ownerProfiles = await listProfilesByIds(ownerIds);

  const items: AdminOrgSummary[] = workspaces.map((workspace) => {
    const ownerUserId = ownerByWorkspace.get(workspace.id) ?? null;
    const ownerProfile = ownerUserId ? ownerProfiles.get(ownerUserId) : null;

    return {
      workspaceId: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      createdAt: workspace.created_at,
      balance: walletByWorkspace.get(workspace.id) ?? 0,
      memberCount: memberCountByWorkspace.get(workspace.id) ?? 0,
      adminCount: adminCountByWorkspace.get(workspace.id) ?? 0,
      ownerUserId,
      ownerEmail: ownerProfile?.email ?? null
    };
  });

  return {
    items,
    total: count ?? 0,
    limit,
    offset
  };
}

export async function getAdminOrgDetail(workspaceId: string): Promise<AdminOrgDetail> {
  const workspaceResult = await supabaseAdmin
    .from("workspaces")
    .select("id, name, slug, created_at, created_by")
    .eq("id", workspaceId)
    .maybeSingle();
  if (workspaceResult.error) {
    throw workspaceResult.error;
  }

  const workspace = workspaceResult.data as WorkspaceRow | null;
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const [wallet, membershipsResult, recentCreditEntries, recentFailedJobsResult] = await Promise.all([
    getWorkspaceCreditWallet(workspaceId),
    supabaseAdmin
      .from("workspace_memberships")
      .select("id, workspace_id, user_id, role, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
    listWorkspaceCreditLedger(workspaceId, 20, 0),
    supabaseAdmin
      .from("creative_jobs")
      .select("id, workspace_id, brand_id, job_type, status, error_json, created_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(12)
  ]);

  if (membershipsResult.error) {
    throw membershipsResult.error;
  }
  if (recentFailedJobsResult.error) {
    throw recentFailedJobsResult.error;
  }

  const memberships = (membershipsResult.data ?? []) as MembershipRow[];
  const profileMap = await listProfilesByIds(memberships.map((membership) => membership.user_id));

  const members: AdminOrgMember[] = memberships.map((membership) => {
    const profile = profileMap.get(membership.user_id);

    return {
      userId: membership.user_id,
      email: profile?.email ?? "unknown@example.com",
      displayName: profile?.display_name ?? null,
      role: membership.role,
      createdAt: membership.created_at,
      updatedAt: membership.updated_at
    };
  });

  const ownerMembership = memberships.find((membership) => membership.role === "owner") ?? null;
  const ownerProfile = ownerMembership ? profileMap.get(ownerMembership.user_id) : null;
  const adminCount = memberships.filter((membership) => membership.role === "owner" || membership.role === "admin").length;

  return {
    workspace: {
      workspaceId: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      createdAt: workspace.created_at,
      createdByUserId: workspace.created_by,
      balance: wallet.balance,
      memberCount: memberships.length,
      adminCount,
      ownerUserId: ownerMembership?.user_id ?? null,
      ownerEmail: ownerProfile?.email ?? null
    },
    wallet,
    members,
    recentCreditEntries,
    recentFailedJobs: ((recentFailedJobsResult.data ?? []) as JobRow[]).map(mapJobRowToFailedJob)
  };
}

export async function listPlatformAdmins(): Promise<AdminPlatformAdmin[]> {
  const { data, error } = await supabaseAdmin
    .from("platform_admin_roles")
    .select("user_id, role, active, created_by, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as PlatformAdminRoleRow[];
  const userIds = rows.flatMap((row) => [row.user_id, row.created_by]).filter((value): value is string => Boolean(value));
  const profileMap = await listProfilesByIds(userIds);

  return rows.map((row) => {
    const profile = profileMap.get(row.user_id);
    const createdByProfile = row.created_by ? profileMap.get(row.created_by) : null;

    return {
      userId: row.user_id,
      email: profile?.email ?? "unknown@example.com",
      displayName: profile?.display_name ?? null,
      role: "super_admin",
      active: row.active,
      createdByUserId: row.created_by,
      createdByEmail: createdByProfile?.email ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });
}

async function getPlatformAdminByUserId(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("platform_admin_roles")
    .select("user_id, role, active, created_by, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as PlatformAdminRoleRow | null;
  if (!row) {
    throw new Error("Platform admin role not found");
  }

  const profileMap = await listProfilesByIds([row.user_id, ...(row.created_by ? [row.created_by] : [])]);
  const profile = profileMap.get(row.user_id);
  const createdByProfile = row.created_by ? profileMap.get(row.created_by) : null;

  return {
    userId: row.user_id,
    email: profile?.email ?? "unknown@example.com",
    displayName: profile?.display_name ?? null,
    role: "super_admin",
    active: row.active,
    createdByUserId: row.created_by,
    createdByEmail: createdByProfile?.email ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  } satisfies AdminPlatformAdmin;
}

export async function upsertPlatformAdminByEmail(params: { actorUserId: string; email: string; active?: boolean }) {
  const normalizedEmail = params.email.trim().toLowerCase();
  const { data: profileRow, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!profileRow) {
    throw new Error("Profile not found for this email. Ask the user to sign in once before granting super admin.");
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin.from("platform_admin_roles").upsert(
    {
      user_id: profileRow.id,
      role: "super_admin",
      active: params.active ?? true,
      created_by: params.actorUserId,
      updated_at: nowIso
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw error;
  }

  invalidateRuntimeCache(`platform-admin:${profileRow.id}`);
  return getPlatformAdminByUserId(profileRow.id);
}

export async function setPlatformAdminActive(params: { actorUserId: string; userId: string; active: boolean }) {
  const { data: existingRow, error: existingError } = await supabaseAdmin
    .from("platform_admin_roles")
    .select("user_id, role, active")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (!existingRow) {
    throw new Error("Platform admin role not found");
  }

  if (!params.active && existingRow.active) {
    const { count, error: countError } = await supabaseAdmin
      .from("platform_admin_roles")
      .select("user_id", { head: true, count: "exact" })
      .eq("active", true)
      .eq("role", "super_admin");

    if (countError) {
      throw countError;
    }

    if ((count ?? 0) <= 1) {
      throw new Error("Cannot deactivate the last active super admin");
    }
  }

  const { error } = await supabaseAdmin
    .from("platform_admin_roles")
    .update({
      active: params.active,
      created_by: params.actorUserId,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", params.userId);

  if (error) {
    throw error;
  }

  invalidateRuntimeCache(`platform-admin:${params.userId}`);
  return getPlatformAdminByUserId(params.userId);
}

function mapJobRowToOpsJobItem(row: JobRow): AdminOpsJobItem {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    jobType: row.job_type,
    status: row.status,
    ageMinutes: minutesSince(row.created_at),
    errorMessage: extractErrorMessage(row.error_json),
    createdAt: row.created_at
  };
}

export async function getAdminOpsSummary(): Promise<AdminOpsSummary> {
  const last24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const stuckThresholdIso = new Date(Date.now() - 20 * 60 * 1000).toISOString();

  const [
    queuedCountResult,
    processingCountResult,
    failedLast24hResult,
    completedLast24hResult,
    pendingReviewCountResult,
    reservedCreditsCountResult,
    recentFailedJobsResult,
    stuckJobsResult
  ] = await Promise.all([
    supabaseAdmin.from("creative_jobs").select("id", { head: true, count: "exact" }).eq("status", "queued"),
    supabaseAdmin.from("creative_jobs").select("id", { head: true, count: "exact" }).eq("status", "processing"),
    supabaseAdmin.from("creative_jobs").select("id", { head: true, count: "exact" }).eq("status", "failed").gte("created_at", last24hIso),
    supabaseAdmin.from("creative_jobs").select("id", { head: true, count: "exact" }).eq("status", "completed").gte("created_at", last24hIso),
    supabaseAdmin.from("creative_outputs").select("id", { head: true, count: "exact" }).eq("review_state", "pending_review"),
    supabaseAdmin
      .from("workspace_credit_reservations")
      .select("id", { head: true, count: "exact" })
      .eq("status", "reserved"),
    supabaseAdmin
      .from("creative_jobs")
      .select("id, workspace_id, brand_id, job_type, status, error_json, created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(12),
    supabaseAdmin
      .from("creative_jobs")
      .select("id, workspace_id, brand_id, job_type, status, error_json, created_at")
      .eq("status", "processing")
      .lte("created_at", stuckThresholdIso)
      .order("created_at", { ascending: true })
      .limit(12)
  ]);

  if (queuedCountResult.error) throw queuedCountResult.error;
  if (processingCountResult.error) throw processingCountResult.error;
  if (failedLast24hResult.error) throw failedLast24hResult.error;
  if (completedLast24hResult.error) throw completedLast24hResult.error;
  if (pendingReviewCountResult.error) throw pendingReviewCountResult.error;
  if (reservedCreditsCountResult.error) throw reservedCreditsCountResult.error;
  if (recentFailedJobsResult.error) throw recentFailedJobsResult.error;
  if (stuckJobsResult.error) throw stuckJobsResult.error;

  return {
    metrics: {
      queuedJobs: queuedCountResult.count ?? 0,
      processingJobs: processingCountResult.count ?? 0,
      failedJobsLast24h: failedLast24hResult.count ?? 0,
      completedJobsLast24h: completedLast24hResult.count ?? 0,
      pendingReviewOutputs: pendingReviewCountResult.count ?? 0,
      reservedCreditTransactions: reservedCreditsCountResult.count ?? 0
    },
    recentFailedJobs: ((recentFailedJobsResult.data ?? []) as JobRow[]).map(mapJobRowToOpsJobItem),
    stuckJobs: ((stuckJobsResult.data ?? []) as JobRow[]).map(mapJobRowToOpsJobItem)
  };
}

export async function listAdminAuditEntries(limit = 60, offset = 0) {
  const boundedLimit = Math.min(200, Math.max(1, limit));
  const boundedOffset = Math.max(0, offset);
  const fetchSize = Math.min(300, Math.max(80, boundedOffset + boundedLimit * 3));

  const [creditRowsResult, platformRolesResult, membershipRowsResult, failedJobsResult] = await Promise.all([
    supabaseAdmin
      .from("workspace_credit_ledger")
      .select("id, workspace_id, direction, entry_kind, amount, actor_user_id, note, metadata_json, created_at")
      .order("created_at", { ascending: false })
      .limit(fetchSize),
    supabaseAdmin
      .from("platform_admin_roles")
      .select("user_id, active, created_by, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(fetchSize),
    supabaseAdmin
      .from("workspace_memberships")
      .select("id, workspace_id, user_id, role, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(fetchSize),
    supabaseAdmin
      .from("creative_jobs")
      .select("id, workspace_id, created_by, error_json, created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(fetchSize)
  ]);

  if (creditRowsResult.error) throw creditRowsResult.error;
  if (platformRolesResult.error) throw platformRolesResult.error;
  if (membershipRowsResult.error) throw membershipRowsResult.error;
  if (failedJobsResult.error) throw failedJobsResult.error;

  const creditRows = (creditRowsResult.data ?? []) as Array<{
    id: string;
    workspace_id: string;
    direction: "credit" | "debit";
    entry_kind: string;
    amount: number | string;
    actor_user_id: string | null;
    note: string | null;
    metadata_json: Record<string, unknown> | null;
    created_at: string;
  }>;
  const platformRows = (platformRolesResult.data ?? []) as Array<{
    user_id: string;
    active: boolean;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  }>;
  const membershipRows = (membershipRowsResult.data ?? []) as MembershipRow[];
  const failedRows = (failedJobsResult.data ?? []) as Array<{
    id: string;
    workspace_id: string;
    created_by: string | null;
    error_json: Record<string, unknown> | null;
    created_at: string;
  }>;

  const userIds = [
    ...creditRows.map((row) => row.actor_user_id),
    ...platformRows.map((row) => row.user_id),
    ...platformRows.map((row) => row.created_by),
    ...membershipRows.map((row) => row.user_id),
    ...failedRows.map((row) => row.created_by)
  ].filter((value): value is string => Boolean(value));

  const workspaceIds = [
    ...creditRows.map((row) => row.workspace_id),
    ...membershipRows.map((row) => row.workspace_id),
    ...failedRows.map((row) => row.workspace_id)
  ];

  const [profileMap, workspaceMap] = await Promise.all([listProfilesByIds(userIds), listWorkspacesByIds(workspaceIds)]);

  const profileLabel = (userId: string | null) => {
    if (!userId) {
      return null;
    }

    const profile = profileMap.get(userId);
    if (!profile) {
      return null;
    }

    return profile.display_name ?? profile.email;
  };

  const auditEntries: AdminAuditEntry[] = [];

  for (const row of creditRows) {
    const workspace = workspaceMap.get(row.workspace_id);
    const signedAmount = `${row.direction === "credit" ? "+" : "-"}${coerceInt(row.amount)}`;
    auditEntries.push({
      id: `credit:${row.id}`,
      kind: "credit",
      action: row.entry_kind,
      workspaceId: row.workspace_id,
      workspaceName: workspace?.name ?? null,
      actorUserId: row.actor_user_id,
      actorLabel: profileLabel(row.actor_user_id),
      targetUserId: null,
      targetLabel: null,
      description: `${signedAmount} credits (${row.entry_kind.replace(/_/g, " ")})`,
      metadataJson: row.metadata_json ?? {},
      createdAt: row.created_at
    });
  }

  for (const row of platformRows) {
    const action = row.active ? "activated" : "deactivated";
    auditEntries.push({
      id: `platform-admin:${row.user_id}:${row.updated_at}`,
      kind: "platform_admin",
      action,
      workspaceId: null,
      workspaceName: null,
      actorUserId: row.created_by,
      actorLabel: profileLabel(row.created_by),
      targetUserId: row.user_id,
      targetLabel: profileLabel(row.user_id),
      description: `Super admin ${action}`,
      metadataJson: {
        active: row.active
      },
      createdAt: row.updated_at
    });
  }

  for (const row of membershipRows) {
    const workspace = workspaceMap.get(row.workspace_id);
    const action = row.updated_at > row.created_at ? "updated" : "added";
    auditEntries.push({
      id: `workspace-member:${row.id}:${row.updated_at}`,
      kind: "workspace_member",
      action,
      workspaceId: row.workspace_id,
      workspaceName: workspace?.name ?? null,
      actorUserId: null,
      actorLabel: null,
      targetUserId: row.user_id,
      targetLabel: profileLabel(row.user_id),
      description: `Workspace member ${action} (${row.role})`,
      metadataJson: {
        role: row.role
      },
      createdAt: row.updated_at
    });
  }

  for (const row of failedRows) {
    const workspace = workspaceMap.get(row.workspace_id);
    auditEntries.push({
      id: `job-failure:${row.id}`,
      kind: "job_failure",
      action: "failed",
      workspaceId: row.workspace_id,
      workspaceName: workspace?.name ?? null,
      actorUserId: row.created_by,
      actorLabel: profileLabel(row.created_by),
      targetUserId: null,
      targetLabel: null,
      description: extractErrorMessage(row.error_json) ?? "Creative job failed",
      metadataJson: row.error_json ?? {},
      createdAt: row.created_at
    });
  }

  auditEntries.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return auditEntries.slice(boundedOffset, boundedOffset + boundedLimit);
}

export async function getWorkspaceCreditWalletSafe(workspaceId: string): Promise<WorkspaceCreditWallet> {
  return getWorkspaceCreditWallet(workspaceId);
}
