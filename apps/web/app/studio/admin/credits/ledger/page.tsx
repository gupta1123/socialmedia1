"use client";

import { useEffect, useState } from "react";
import type { WorkspaceCreditLedgerResponse } from "@image-lab/contracts";
import { getSuperAdminCreditLedger } from "../../../../../lib/api";
import { useStudio } from "../../../studio-context";

function formatCreditEntryKind(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function SuperAdminCreditLedgerPage() {
  const { sessionToken } = useStudio();
  const [ledgerResponse, setLedgerResponse] = useState<WorkspaceCreditLedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken) {
      setLedgerResponse(null);
      setLoading(false);
      return;
    }

    const token = sessionToken;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const response = await getSuperAdminCreditLedger(token, { limit: 100, offset: 0 });
        if (!cancelled) {
          setLedgerResponse(response);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load credit ledger");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  return (
    <section className="panel settings-panel">
      <div className="settings-panel-header">
        <div>
          <p className="panel-label">Credit ledger</p>
          <h3>Cross-organization history</h3>
        </div>
      </div>

      {loading ? (
        <div className="empty-state empty-state-tall">
          <strong>Loading ledger…</strong>
        </div>
      ) : error ? (
        <div className="empty-state empty-state-tall">
          <strong>Unable to load ledger</strong>
          <p>{error}</p>
        </div>
      ) : !ledgerResponse || ledgerResponse.items.length === 0 ? (
        <div className="empty-state">
          <strong>No ledger entries found</strong>
        </div>
      ) : (
        <div className="settings-window-list">
          {ledgerResponse.items.map((entry) => (
            <article className="settings-window-row" key={entry.id}>
              <div className="settings-window-copy">
                <strong>{formatCreditEntryKind(entry.entryKind)}</strong>
                <span>Workspace: {entry.workspaceId}</span>
                <span>{new Date(entry.createdAt).toLocaleString()}</span>
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
        </div>
      )}
    </section>
  );
}
