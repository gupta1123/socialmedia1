"use client";

import { useEffect, useState } from "react";
import type { AdminOverview } from "@image-lab/contracts";
import { getSuperAdminOverview } from "../../../lib/api";
import { useStudio } from "../studio-context";

export default function SuperAdminDashboardPage() {
  const { sessionToken } = useStudio();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken) {
      setOverview(null);
      setLoading(false);
      return;
    }

    const token = sessionToken;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const response = await getSuperAdminOverview(token);
        if (!cancelled) {
          setOverview(response);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load admin overview");
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
          <p className="panel-label">Dashboard</p>
          <h3>Platform summary</h3>
        </div>
      </div>

      {loading ? (
        <div className="empty-state empty-state-tall">
          <strong>Loading summary…</strong>
        </div>
      ) : error ? (
        <div className="empty-state empty-state-tall">
          <strong>Unable to load summary</strong>
          <p>{error}</p>
        </div>
      ) : !overview ? (
        <div className="empty-state">
          <strong>No data available</strong>
        </div>
      ) : (
        <>
          <div className="settings-window-list">
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Organizations</strong>
                <span>Total active workspaces</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{overview.totals.workspaceCount}</span>
              </div>
            </article>
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Users</strong>
                <span>Total workspace memberships</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{overview.totals.memberCount}</span>
              </div>
            </article>
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Active super admins</strong>
                <span>Users with platform control access</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{overview.totals.superAdminCount}</span>
              </div>
            </article>
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Credit balance</strong>
                <span>Sum of all workspace wallets</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{overview.totals.totalCreditBalance}</span>
              </div>
            </article>
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Pending review outputs</strong>
                <span>Items waiting in review queues</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{overview.totals.pendingReviewOutputs}</span>
              </div>
            </article>
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Failed jobs (24h)</strong>
                <span>Generation/edit failures in the last day</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{overview.totals.failedJobsLast24h}</span>
              </div>
            </article>
          </div>

          <div className="settings-window-list">
            {overview.topWorkspaces.map((workspace) => (
              <article className="settings-window-row" key={workspace.workspaceId}>
                <div className="settings-window-copy">
                  <strong>{workspace.name}</strong>
                  <span>{workspace.slug}</span>
                </div>
                <div className="settings-window-actions">
                  <span className="pill">{workspace.balance} credits</span>
                </div>
              </article>
            ))}
            {overview.topWorkspaces.length === 0 ? (
              <div className="empty-state">
                <strong>No workspaces found</strong>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
