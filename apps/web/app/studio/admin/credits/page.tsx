"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AdminCreditWorkspaceSummary, WorkspaceCreditLedgerEntry, WorkspaceCreditWallet } from "@image-lab/contracts";
import {
  adjustAdminWorkspaceCredits,
  getAdminCreditWorkspaces,
  getAdminWorkspaceCreditLedger,
  getAdminWorkspaceCreditWallet,
  grantAdminWorkspaceCredits
} from "../../../../lib/api";
import { useStudio } from "../../studio-context";

function formatCreditEntryKind(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function SuperAdminCreditsPage() {
  const { sessionToken, setMessage } = useStudio();

  const [query, setQuery] = useState("");
  const [workspaces, setWorkspaces] = useState<AdminCreditWorkspaceSummary[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  const [wallet, setWallet] = useState<WorkspaceCreditWallet | null>(null);
  const [ledger, setLedger] = useState<WorkspaceCreditLedgerEntry[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [grantAmount, setGrantAmount] = useState("100");
  const [adjustDelta, setAdjustDelta] = useState("-10");
  const [note, setNote] = useState("");
  const [savingAction, setSavingAction] = useState<"grant" | "adjust" | null>(null);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.workspaceId === selectedWorkspaceId) ?? null,
    [workspaces, selectedWorkspaceId]
  );

  useEffect(() => {
    if (!sessionToken) {
      setWorkspaces([]);
      setSelectedWorkspaceId(null);
      return;
    }

    const token = sessionToken;
    let cancelled = false;

    async function load() {
      try {
        setWorkspacesLoading(true);
        const result = await getAdminCreditWorkspaces(token, {
          ...(query.trim().length > 0 ? { query: query.trim() } : {}),
          limit: 100
        });

        if (cancelled) {
          return;
        }

        setWorkspaces(result.items);
        setWorkspacesError(null);
        setSelectedWorkspaceId((current) => {
          if (current && result.items.some((item) => item.workspaceId === current)) {
            return current;
          }

          return result.items[0]?.workspaceId ?? null;
        });
      } catch (error) {
        if (!cancelled) {
          setWorkspacesError(error instanceof Error ? error.message : "Failed to load workspaces");
        }
      } finally {
        if (!cancelled) {
          setWorkspacesLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, query]);

  useEffect(() => {
    if (!sessionToken || !selectedWorkspaceId) {
      setWallet(null);
      setLedger([]);
      return;
    }

    const token = sessionToken;
    const workspaceId = selectedWorkspaceId;
    let cancelled = false;

    async function loadDetails() {
      try {
        setDetailsLoading(true);
        const [walletResponse, ledgerResponse] = await Promise.all([
          getAdminWorkspaceCreditWallet(token, workspaceId),
          getAdminWorkspaceCreditLedger(token, workspaceId, { limit: 30, offset: 0 })
        ]);

        if (cancelled) {
          return;
        }

        setWallet(walletResponse);
        setLedger(ledgerResponse.items);
        setDetailsError(null);
      } catch (error) {
        if (!cancelled) {
          setDetailsError(error instanceof Error ? error.message : "Failed to load credit details");
        }
      } finally {
        if (!cancelled) {
          setDetailsLoading(false);
        }
      }
    }

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [sessionToken, selectedWorkspaceId]);

  async function refreshSelectedWorkspace() {
    if (!sessionToken || !selectedWorkspaceId) {
      return;
    }

    const [workspaceResult, walletResponse, ledgerResponse] = await Promise.all([
      getAdminCreditWorkspaces(sessionToken, {
        ...(query.trim().length > 0 ? { query: query.trim() } : {}),
        limit: 100
      }),
      getAdminWorkspaceCreditWallet(sessionToken, selectedWorkspaceId),
      getAdminWorkspaceCreditLedger(sessionToken, selectedWorkspaceId, { limit: 30, offset: 0 })
    ]);

    setWorkspaces(workspaceResult.items);
    setWallet(walletResponse);
    setLedger(ledgerResponse.items);
  }

  async function handleGrantCredits(event: React.FormEvent) {
    event.preventDefault();

    if (!sessionToken || !selectedWorkspaceId) {
      return;
    }

    const amount = Number(grantAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      setMessage("Enter a positive whole number for grant credits.");
      return;
    }

    try {
      setSavingAction("grant");
      await grantAdminWorkspaceCredits(sessionToken, {
        workspaceId: selectedWorkspaceId,
        amount,
        note: note.trim().length > 0 ? note.trim() : undefined
      });

      setMessage(`Added ${amount} credits.`);
      await refreshSelectedWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to add credits");
    } finally {
      setSavingAction(null);
    }
  }

  async function handleAdjustCredits(event: React.FormEvent) {
    event.preventDefault();

    if (!sessionToken || !selectedWorkspaceId) {
      return;
    }

    const delta = Number(adjustDelta);
    if (!Number.isInteger(delta) || delta === 0) {
      setMessage("Enter a non-zero whole number for credit adjustment.");
      return;
    }

    try {
      setSavingAction("adjust");
      await adjustAdminWorkspaceCredits(sessionToken, {
        workspaceId: selectedWorkspaceId,
        delta,
        note: note.trim().length > 0 ? note.trim() : undefined
      });

      setMessage(`Adjusted credits by ${delta}.`);
      await refreshSelectedWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to adjust credits");
    } finally {
      setSavingAction(null);
    }
  }

  return (
    <>
      <section className="panel settings-panel">
        <div className="settings-panel-header">
          <div>
            <p className="panel-label">Credits</p>
            <h3>Workspace balances</h3>
          </div>
          <Link className="button button-ghost" href="/studio/admin/credits/ledger" prefetch={false}>
            Open global ledger
          </Link>
        </div>

        <form className="planner-form settings-inline-form" onSubmit={(event) => event.preventDefault()}>
          <div className="planner-form-grid">
            <label className="field-label planner-form-span-2">
              Search workspace
              <input
                type="search"
                placeholder="Search by workspace name or slug"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
        </form>

        {workspacesLoading ? (
          <div className="empty-state empty-state-tall">
            <strong>Loading workspaces…</strong>
          </div>
        ) : workspacesError ? (
          <div className="empty-state empty-state-tall">
            <strong>Unable to load workspaces</strong>
            <p>{workspacesError}</p>
          </div>
        ) : workspaces.length === 0 ? (
          <div className="empty-state empty-state-tall">
            <strong>No workspaces found</strong>
            <p>Try a different search query.</p>
          </div>
        ) : (
          <div className="settings-window-list">
            {workspaces.map((workspace) => {
              const active = workspace.workspaceId === selectedWorkspaceId;
              return (
                <button
                  className="settings-window-row"
                  key={workspace.workspaceId}
                  onClick={() => setSelectedWorkspaceId(workspace.workspaceId)}
                  type="button"
                >
                  <span className="settings-window-copy" style={{ textAlign: "left" }}>
                    <strong>{workspace.name}</strong>
                    <span>{workspace.slug}</span>
                  </span>
                  <span className="settings-window-actions">
                    <span className="pill">{workspace.balance} credits</span>
                    {active ? <span className="pill">Selected</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel settings-panel">
        <div className="settings-panel-header">
          <div>
            <p className="panel-label">Selected workspace</p>
            <h3>{selectedWorkspace?.name ?? "Choose a workspace"}</h3>
          </div>
          {wallet ? <span className="pill">Balance: {wallet.balance}</span> : null}
        </div>

        {detailsLoading ? (
          <div className="empty-state empty-state-tall">
            <strong>Loading credit details…</strong>
          </div>
        ) : detailsError ? (
          <div className="empty-state empty-state-tall">
            <strong>Unable to load credit details</strong>
            <p>{detailsError}</p>
          </div>
        ) : !selectedWorkspaceId ? (
          <div className="empty-state empty-state-tall">
            <strong>Select a workspace</strong>
            <p>Pick a workspace above to manage credits.</p>
          </div>
        ) : (
          <>
            <form className="planner-form settings-inline-form" onSubmit={handleGrantCredits}>
              <div className="planner-form-grid">
                <label className="field-label">
                  Add credits
                  <input
                    min={1}
                    step={1}
                    type="number"
                    value={grantAmount}
                    onChange={(event) => setGrantAmount(event.target.value)}
                  />
                </label>
                <label className="field-label planner-form-span-2">
                  Note (optional)
                  <input maxLength={400} type="text" value={note} onChange={(event) => setNote(event.target.value)} />
                </label>
              </div>
              <div className="planner-form-actions">
                <button className="button button-primary" disabled={savingAction !== null || !selectedWorkspaceId} type="submit">
                  {savingAction === "grant" ? "Saving…" : "Add credits"}
                </button>
              </div>
            </form>

            <form className="planner-form settings-inline-form" onSubmit={handleAdjustCredits}>
              <div className="planner-form-grid">
                <label className="field-label">
                  Adjust delta
                  <input
                    step={1}
                    type="number"
                    value={adjustDelta}
                    onChange={(event) => setAdjustDelta(event.target.value)}
                  />
                </label>
                <label className="field-label planner-form-span-2">
                  Reason (recommended)
                  <input
                    maxLength={400}
                    placeholder="Example: Manual correction"
                    type="text"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
              </div>
              <div className="planner-form-actions">
                <button className="button button-ghost" disabled={savingAction !== null || !selectedWorkspaceId} type="submit">
                  {savingAction === "adjust" ? "Saving…" : "Apply adjustment"}
                </button>
              </div>
            </form>

            <div className="settings-window-list">
              {ledger.map((entry) => (
                <article className="settings-window-row" key={entry.id}>
                  <div className="settings-window-copy">
                    <strong>{formatCreditEntryKind(entry.entryKind)}</strong>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    {entry.note ? <span>{entry.note}</span> : null}
                  </div>
                  <div className="settings-window-actions">
                    <span className="pill">
                      {entry.direction === "credit" ? "+" : "-"}
                      {entry.amount}
                    </span>
                    <span className="pill">Balance: {entry.balanceAfter}</span>
                  </div>
                </article>
              ))}
              {ledger.length === 0 ? (
                <div className="empty-state">
                  <strong>No credit entries yet</strong>
                  <p>Ledger entries appear here after grants/usage.</p>
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>
    </>
  );
}
