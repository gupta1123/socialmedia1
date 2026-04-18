import type {
  AdminCreditAdjustRequest,
  AdminCreditGrantRequest,
  AdminCreditWorkspaceSummary,
  WorkspaceCreditLedgerEntry,
  WorkspaceCreditWallet
} from "@image-lab/contracts";
import type { FastifyBaseLogger } from "fastify";
import { getOrPopulateRuntimeCache } from "./runtime-cache.js";
import { supabaseAdmin } from "./supabase.js";
import type { AuthenticatedViewer } from "./viewer.js";

const PLATFORM_ADMIN_CACHE_TTL_MS = 30_000;

type WalletRow = {
  workspace_id: string;
  balance: number | string;
  lifetime_credited: number | string;
  lifetime_debited: number | string;
  updated_at: string;
};

type LedgerRow = {
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

type ReservationRpcRow = {
  reservation_id: string;
  status: "reserved" | "settled" | "released";
  amount: number | string;
  balance?: number | string;
  workspace_id?: string;
};

type CreditMutationRpcRow = {
  ledger_id: string;
  balance: number | string;
};

export class InsufficientWorkspaceCreditsError extends Error {
  required: number | null;
  available: number | null;

  constructor(message: string, required: number | null = null, available: number | null = null) {
    super(message);
    this.name = "InsufficientWorkspaceCreditsError";
    this.required = required;
    this.available = available;
  }
}

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

function firstRpcRow<T>(payload: unknown): T {
  if (Array.isArray(payload)) {
    return (payload[0] ?? null) as T;
  }

  return payload as T;
}

function mapWalletRow(row: WalletRow): WorkspaceCreditWallet {
  return {
    workspaceId: row.workspace_id,
    balance: coerceInt(row.balance),
    lifetimeCredited: coerceInt(row.lifetime_credited),
    lifetimeDebited: coerceInt(row.lifetime_debited),
    updatedAt: row.updated_at
  };
}

function mapLedgerRow(row: LedgerRow): WorkspaceCreditLedgerEntry {
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

function parseInsufficientCreditsError(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error && typeof error.message === "string"
      ? error.message
      : error instanceof Error
        ? error.message
        : "";

  if (!message.toLowerCase().includes("insufficient credits")) {
    return null;
  }

  const match = message.match(/required\s+(\d+)\s*,\s*available\s+(\d+)/i);
  const required = match ? Number(match[1]) : null;
  const available = match ? Number(match[2]) : null;
  return new InsufficientWorkspaceCreditsError(message, required, available);
}

async function getWalletRow(workspaceId: string): Promise<WalletRow> {
  const { data, error } = await supabaseAdmin
    .from("workspace_credit_wallets")
    .select("workspace_id, balance, lifetime_credited, lifetime_debited, updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as WalletRow | null;
  if (row) {
    return row;
  }

  const { data: ensured, error: ensureError } = await supabaseAdmin.rpc("ensure_workspace_credit_wallet", {
    p_workspace_id: workspaceId
  });

  if (ensureError) {
    throw ensureError;
  }

  const ensuredRow = firstRpcRow<WalletRow | null>(ensured);
  if (!ensuredRow) {
    throw new Error("Credit wallet is unavailable for this workspace");
  }

  return ensuredRow;
}

async function getLedgerEntryById(ledgerId: string) {
  const { data, error } = await supabaseAdmin
    .from("workspace_credit_ledger")
    .select(
      "id, workspace_id, direction, entry_kind, amount, balance_after, actor_user_id, reservation_id, source, source_ref, note, metadata_json, created_at"
    )
    .eq("id", ledgerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as LedgerRow | null;
  if (!row) {
    throw new Error("Credit ledger entry not found after mutation");
  }

  return mapLedgerRow(row);
}

export async function isPlatformAdminUser(userId: string) {
  return getOrPopulateRuntimeCache(`platform-admin:${userId}`, PLATFORM_ADMIN_CACHE_TTL_MS, async () => {
    const { data, error } = await supabaseAdmin
      .from("platform_admin_roles")
      .select("user_id")
      .eq("user_id", userId)
      .eq("active", true)
      .eq("role", "super_admin")
      .maybeSingle();

    if (error) {
      throw error;
    }

    return Boolean(data);
  });
}

export async function assertPlatformAdmin(viewer: AuthenticatedViewer, logger?: FastifyBaseLogger) {
  const allowed = await isPlatformAdminUser(viewer.userId);
  if (!allowed) {
    logger?.warn({ viewerId: viewer.userId }, "platform admin access denied");
    throw new Error("Super admin access is required");
  }
}

export async function getWorkspaceCreditWallet(workspaceId: string) {
  return mapWalletRow(await getWalletRow(workspaceId));
}

export async function listWorkspaceCreditLedger(workspaceId: string, limit = 30, offset = 0) {
  const { data, error } = await supabaseAdmin
    .from("workspace_credit_ledger")
    .select(
      "id, workspace_id, direction, entry_kind, amount, balance_after, actor_user_id, reservation_id, source, source_ref, note, metadata_json, created_at"
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as LedgerRow[];
  return rows.map(mapLedgerRow);
}

export async function grantWorkspaceCredits(params: {
  actorUserId: string;
  input: AdminCreditGrantRequest;
}) {
  const { data, error } = await supabaseAdmin.rpc("grant_workspace_credits", {
    p_workspace_id: params.input.workspaceId,
    p_amount: params.input.amount,
    p_actor_user_id: params.actorUserId,
    p_note: params.input.note ?? null,
    p_source_ref: params.input.sourceRef ?? null,
    p_metadata: {
      scope: "admin",
      action: "grant"
    }
  });

  if (error) {
    const insufficient = parseInsufficientCreditsError(error);
    if (insufficient) {
      throw insufficient;
    }

    throw error;
  }

  const row = firstRpcRow<CreditMutationRpcRow | null>(data);
  if (!row) {
    throw new Error("Credit grant did not return a ledger entry");
  }

  const [wallet, entry] = await Promise.all([
    getWorkspaceCreditWallet(params.input.workspaceId),
    getLedgerEntryById(row.ledger_id)
  ]);

  return {
    wallet,
    entry
  };
}

export async function adjustWorkspaceCredits(params: {
  actorUserId: string;
  input: AdminCreditAdjustRequest;
}) {
  const { data, error } = await supabaseAdmin.rpc("adjust_workspace_credits", {
    p_workspace_id: params.input.workspaceId,
    p_delta: params.input.delta,
    p_actor_user_id: params.actorUserId,
    p_note: params.input.note ?? null,
    p_source_ref: params.input.sourceRef ?? null,
    p_metadata: {
      scope: "admin",
      action: "adjust"
    }
  });

  if (error) {
    const insufficient = parseInsufficientCreditsError(error);
    if (insufficient) {
      throw insufficient;
    }

    throw error;
  }

  const row = firstRpcRow<CreditMutationRpcRow | null>(data);
  if (!row) {
    throw new Error("Credit adjustment did not return a ledger entry");
  }

  const [wallet, entry] = await Promise.all([
    getWorkspaceCreditWallet(params.input.workspaceId),
    getLedgerEntryById(row.ledger_id)
  ]);

  return {
    wallet,
    entry
  };
}

export async function reserveWorkspaceCredits(params: {
  workspaceId: string;
  source: string;
  sourceRef: string;
  amount: number;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabaseAdmin.rpc("reserve_workspace_credits", {
    p_workspace_id: params.workspaceId,
    p_source: params.source,
    p_source_ref: params.sourceRef,
    p_amount: params.amount,
    p_actor_user_id: params.actorUserId ?? null,
    p_metadata: params.metadata ?? {}
  });

  if (error) {
    const insufficient = parseInsufficientCreditsError(error);
    if (insufficient) {
      throw insufficient;
    }

    throw error;
  }

  const row = firstRpcRow<ReservationRpcRow | null>(data);
  if (!row) {
    throw new Error("Credit reservation failed");
  }

  return {
    reservationId: row.reservation_id,
    status: row.status,
    amount: coerceInt(row.amount),
    balance: coerceInt(row.balance)
  };
}

export async function settleWorkspaceCreditReservation(params: {
  reservationId: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.rpc("settle_workspace_credit_reservation", {
    p_reservation_id: params.reservationId,
    p_metadata: params.metadata ?? {}
  });

  if (error) {
    throw error;
  }
}

export async function releaseWorkspaceCreditReservation(params: {
  reservationId: string;
  actorUserId?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.rpc("release_workspace_credit_reservation", {
    p_reservation_id: params.reservationId,
    p_actor_user_id: params.actorUserId ?? null,
    p_note: params.note ?? null,
    p_metadata: params.metadata ?? {}
  });

  if (error) {
    throw error;
  }
}

export async function listAdminCreditWorkspaces(params?: {
  query?: string;
  limit?: number;
}) {
  const query = params?.query?.trim() ?? "";
  const limit = Math.min(200, Math.max(1, params?.limit ?? 60));

  let workspaceQuery = supabaseAdmin
    .from("workspaces")
    .select("id, name, slug")
    .order("name", { ascending: true })
    .limit(limit);

  if (query.length > 0) {
    const escaped = query.replace(/[^a-zA-Z0-9 _-]/g, "");
    workspaceQuery = workspaceQuery.or(`name.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
  }

  const { data, error } = await workspaceQuery;
  if (error) {
    throw error;
  }

  const workspaces = (data ?? []) as Array<{ id: string; name: string; slug: string }>;
  const workspaceIds = workspaces.map((workspace) => workspace.id);

  const walletLookup = new Map<string, { balance: number; updatedAt: string | null }>();

  if (workspaceIds.length > 0) {
    const { data: wallets, error: walletError } = await supabaseAdmin
      .from("workspace_credit_wallets")
      .select("workspace_id, balance, updated_at")
      .in("workspace_id", workspaceIds);

    if (walletError) {
      throw walletError;
    }

    for (const wallet of wallets ?? []) {
      walletLookup.set(wallet.workspace_id as string, {
        balance: coerceInt((wallet as { balance: number | string }).balance),
        updatedAt: (wallet as { updated_at: string | null }).updated_at
      });
    }
  }

  return workspaces.map((workspace) => {
    const wallet = walletLookup.get(workspace.id);
    return {
      workspaceId: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      balance: wallet?.balance ?? 0,
      updatedAt: wallet?.updatedAt ?? null
    } satisfies AdminCreditWorkspaceSummary;
  });
}

export function isInsufficientWorkspaceCreditsError(error: unknown): error is InsufficientWorkspaceCreditsError {
  return error instanceof InsufficientWorkspaceCreditsError;
}

export function isReservationAlreadySettledError(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error && typeof error.message === "string"
      ? error.message
      : error instanceof Error
        ? error.message
        : "";

  return message.toLowerCase().includes("settled reservation cannot be released");
}
