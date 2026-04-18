"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AdminOrgListResponse } from "@image-lab/contracts";
import { getSuperAdminOrgs } from "../../../../lib/api";
import { useStudio } from "../../studio-context";

export default function SuperAdminOrgsPage() {
  const { sessionToken } = useStudio();
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<AdminOrgListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken) {
      setResponse(null);
      setLoading(false);
      return;
    }

    const token = sessionToken;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const result = await getSuperAdminOrgs(token, {
          ...(query.trim().length > 0 ? { query: query.trim() } : {}),
          limit: 100,
          offset: 0
        });

        if (!cancelled) {
          setResponse(result);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load organizations");
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
  }, [query, sessionToken]);

  return (
    <section className="panel settings-panel">
      <div className="settings-panel-header">
        <div>
          <p className="panel-label">Organizations</p>
          <h3>Client workspaces</h3>
        </div>
        {response ? <span className="pill">{response.total} total</span> : null}
      </div>

      <form className="planner-form settings-inline-form" onSubmit={(event) => event.preventDefault()}>
        <div className="planner-form-grid">
          <label className="field-label planner-form-span-2">
            Search organization
            <input
              type="search"
              placeholder="Search by workspace name or slug"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      </form>

      {loading ? (
        <div className="empty-state empty-state-tall">
          <strong>Loading organizations…</strong>
        </div>
      ) : error ? (
        <div className="empty-state empty-state-tall">
          <strong>Unable to load organizations</strong>
          <p>{error}</p>
        </div>
      ) : !response || response.items.length === 0 ? (
        <div className="empty-state">
          <strong>No organizations found</strong>
          <p>Try a different search query.</p>
        </div>
      ) : (
        <div className="settings-window-list">
          {response.items.map((org) => (
            <Link className="settings-window-row" href={`/studio/admin/orgs/${org.workspaceId}`} key={org.workspaceId} prefetch={false}>
              <span className="settings-window-copy">
                <strong>{org.name}</strong>
                <span>
                  {org.slug} · Owner: {org.ownerEmail ?? "unknown"}
                </span>
              </span>
              <span className="settings-window-actions">
                <span className="pill">{org.memberCount} users</span>
                <span className="pill">{org.balance} credits</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
