"use client";

import { useEffect, useState } from "react";
import type { AdminAuditResponse } from "@image-lab/contracts";
import { getSuperAdminAudit } from "../../../../lib/api";
import { useStudio } from "../../studio-context";

function formatAuditKind(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function SuperAdminAuditPage() {
  const { sessionToken } = useStudio();
  const [audit, setAudit] = useState<AdminAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken) {
      setAudit(null);
      setLoading(false);
      return;
    }

    const token = sessionToken;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const response = await getSuperAdminAudit(token, { limit: 100, offset: 0 });
        if (!cancelled) {
          setAudit(response);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load audit entries");
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
          <p className="panel-label">Audit</p>
          <h3>Sensitive actions timeline</h3>
        </div>
      </div>

      {loading ? (
        <div className="empty-state empty-state-tall">
          <strong>Loading audit feed…</strong>
        </div>
      ) : error ? (
        <div className="empty-state empty-state-tall">
          <strong>Unable to load audit feed</strong>
          <p>{error}</p>
        </div>
      ) : !audit || audit.items.length === 0 ? (
        <div className="empty-state">
          <strong>No audit events found</strong>
        </div>
      ) : (
        <div className="settings-window-list">
          {audit.items.map((entry) => (
            <article className="settings-window-row" key={entry.id}>
              <div className="settings-window-copy">
                <strong>{entry.description}</strong>
                <span>
                  {formatAuditKind(entry.kind)} · {entry.action}
                </span>
                <span>
                  {entry.workspaceName ?? entry.workspaceId ?? "Platform"} · {new Date(entry.createdAt).toLocaleString()}
                </span>
                {entry.actorLabel ? <span>Actor: {entry.actorLabel}</span> : null}
              </div>
              <div className="settings-window-actions">
                <span className="pill">{formatAuditKind(entry.kind)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
