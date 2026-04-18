"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { AdminOrgDetail } from "@image-lab/contracts";
import { getSuperAdminOrgDetail } from "../../../../../lib/api";
import { useStudio } from "../../../studio-context";

function formatCreditEntryKind(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function SuperAdminOrgDetailPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params?.workspaceId ?? "";
  const { sessionToken } = useStudio();
  const [detail, setDetail] = useState<AdminOrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken || !workspaceId) {
      setDetail(null);
      setLoading(false);
      return;
    }

    const token = sessionToken;
    const selectedWorkspaceId = workspaceId;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const result = await getSuperAdminOrgDetail(token, selectedWorkspaceId);
        if (!cancelled) {
          setDetail(result);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load organization details");
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
  }, [sessionToken, workspaceId]);

  return (
    <section className="panel settings-panel">
      <div className="settings-panel-header">
        <div>
          <p className="panel-label">Organization detail</p>
          <h3>{detail?.workspace.name ?? "Workspace"}</h3>
        </div>
        {detail ? <span className="pill">{detail.workspace.balance} credits</span> : null}
      </div>

      {loading ? (
        <div className="empty-state empty-state-tall">
          <strong>Loading workspace details…</strong>
        </div>
      ) : error ? (
        <div className="empty-state empty-state-tall">
          <strong>Unable to load workspace details</strong>
          <p>{error}</p>
        </div>
      ) : !detail ? (
        <div className="empty-state">
          <strong>Workspace not found</strong>
        </div>
      ) : (
        <>
          <div className="settings-window-list">
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Workspace slug</strong>
                <span>{detail.workspace.slug}</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{detail.workspace.memberCount} users</span>
              </div>
            </article>
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Owner</strong>
                <span>{detail.workspace.ownerEmail ?? "unknown"}</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{detail.workspace.adminCount} admins</span>
              </div>
            </article>
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Lifetime credits</strong>
                <span>Credited: {detail.wallet.lifetimeCredited}</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">Debited: {detail.wallet.lifetimeDebited}</span>
              </div>
            </article>
          </div>

          <div className="settings-window-list">
            {detail.members.map((member) => (
              <article className="settings-window-row" key={member.userId}>
                <div className="settings-window-copy">
                  <strong>{member.displayName ?? member.email}</strong>
                  <span>{member.email}</span>
                </div>
                <div className="settings-window-actions">
                  <span className="pill">{member.role}</span>
                </div>
              </article>
            ))}
            {detail.members.length === 0 ? (
              <div className="empty-state">
                <strong>No members found</strong>
              </div>
            ) : null}
          </div>

          <div className="settings-window-list">
            {detail.recentCreditEntries.map((entry) => (
              <article className="settings-window-row" key={entry.id}>
                <div className="settings-window-copy">
                  <strong>{formatCreditEntryKind(entry.entryKind)}</strong>
                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
                <div className="settings-window-actions">
                  <span className="pill">
                    {entry.direction === "credit" ? "+" : "-"}
                    {entry.amount}
                  </span>
                </div>
              </article>
            ))}
            {detail.recentCreditEntries.length === 0 ? (
              <div className="empty-state">
                <strong>No credit entries yet</strong>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
