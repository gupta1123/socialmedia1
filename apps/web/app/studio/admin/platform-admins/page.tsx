"use client";

import { useEffect, useState } from "react";
import type { AdminPlatformAdmin } from "@image-lab/contracts";
import {
  createSuperAdminPlatformAdmin,
  getSuperAdminPlatformAdmins,
  updateSuperAdminPlatformAdmin
} from "../../../../lib/api";
import { useStudio } from "../../studio-context";

export default function SuperAdminUsersPage() {
  const { sessionToken, setMessage } = useStudio();
  const [admins, setAdmins] = useState<AdminPlatformAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  async function loadAdmins(token: string) {
    const response = await getSuperAdminPlatformAdmins(token);
    setAdmins(response.items);
  }

  useEffect(() => {
    if (!sessionToken) {
      setAdmins([]);
      setLoading(false);
      return;
    }

    const token = sessionToken;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const response = await getSuperAdminPlatformAdmins(token);
        if (!cancelled) {
          setAdmins(response.items);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load platform admins");
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

  async function handleAddAdmin(event: React.FormEvent) {
    event.preventDefault();
    if (!sessionToken) {
      return;
    }

    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setMessage("Enter an email address.");
      return;
    }

    try {
      setSaving(true);
      await createSuperAdminPlatformAdmin(sessionToken, {
        email: normalized,
        active: true
      });
      setEmail("");
      await loadAdmins(sessionToken);
      setMessage("Super admin access granted.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Failed to grant super admin access");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(admin: AdminPlatformAdmin) {
    if (!sessionToken) {
      return;
    }

    try {
      setActionUserId(admin.userId);
      await updateSuperAdminPlatformAdmin(sessionToken, admin.userId, {
        active: !admin.active
      });
      await loadAdmins(sessionToken);
      setMessage(admin.active ? "Super admin deactivated." : "Super admin activated.");
    } catch (toggleError) {
      setMessage(toggleError instanceof Error ? toggleError.message : "Failed to update super admin status");
    } finally {
      setActionUserId(null);
    }
  }

  return (
    <section className="panel settings-panel">
      <div className="settings-panel-header">
        <div>
          <p className="panel-label">Platform admins</p>
          <h3>Super admin access</h3>
        </div>
      </div>

      <form className="planner-form settings-inline-form" onSubmit={handleAddAdmin}>
        <div className="planner-form-grid">
          <label className="field-label planner-form-span-2">
            Email
            <input
              autoComplete="off"
              placeholder="admin@company.com"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        </div>
        <div className="planner-form-actions">
          <button className="button button-primary" disabled={saving} type="submit">
            {saving ? "Saving…" : "Grant super admin"}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="empty-state empty-state-tall">
          <strong>Loading platform admins…</strong>
        </div>
      ) : error ? (
        <div className="empty-state empty-state-tall">
          <strong>Unable to load platform admins</strong>
          <p>{error}</p>
        </div>
      ) : admins.length === 0 ? (
        <div className="empty-state">
          <strong>No platform admins found</strong>
        </div>
      ) : (
        <div className="settings-window-list">
          {admins.map((admin) => (
            <article className="settings-window-row" key={admin.userId}>
              <div className="settings-window-copy">
                <strong>{admin.displayName ?? admin.email}</strong>
                <span>{admin.email}</span>
                <span>Updated: {new Date(admin.updatedAt).toLocaleString()}</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{admin.active ? "Active" : "Inactive"}</span>
                <button
                  className="button button-ghost"
                  disabled={actionUserId !== null}
                  onClick={() => void handleToggleActive(admin)}
                  type="button"
                >
                  {actionUserId === admin.userId ? "Saving…" : admin.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
