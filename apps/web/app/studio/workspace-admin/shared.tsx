"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  CreativeChannel,
  PostingWindowRecord,
  WeekdayCode,
  WorkspaceCreditLedgerEntry,
  WorkspaceCreditWallet,
  WorkspaceMemberRecord
} from "@image-lab/contracts";
import {
  addWorkspaceMember,
  createPostingWindow,
  deletePostingWindow,
  getWorkspaceCreditLedger,
  getWorkspaceCreditWallet,
  getWorkspaceMembers,
  getPostingWindows,
  removeWorkspaceMember,
  setWorkspaceMemberPassword,
  updatePostingWindow,
  updateWorkspaceMemberRole
} from "../../../lib/api";
import { formatLocalTimeLabel, formatWeekdayLabel, weekdayOptions } from "../../../lib/posting-windows";
import { useStudio } from "../studio-context";

type WorkspaceUiRole = "admin" | "team";
type PostingWindowFormState = {
  channel: CreativeChannel;
  weekday: WeekdayCode;
  localTime: string;
  timezone: string;
  label: string;
  active: boolean;
  sortOrder: number;
};

const WORKSPACE_ROLE_OPTION_LABELS: Record<WorkspaceUiRole, string> = {
  admin: "Admin access",
  team: "Team access"
};

const channelOptions: Array<{ value: CreativeChannel; label: string }> = [
  { value: "instagram-feed", label: "Instagram feed" },
  { value: "instagram-story", label: "Instagram story" },
  { value: "linkedin-feed", label: "LinkedIn feed" },
  { value: "x-post", label: "X post" },
  { value: "tiktok-cover", label: "TikTok cover" },
  { value: "ad-creative", label: "Ad creative" }
];

export function WorkspaceAdminOverviewPanel() {
  const { sessionToken, bootstrap } = useStudio();
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken) {
      setWorkspaceMembers([]);
      setLoading(false);
      return;
    }

    const token = sessionToken;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const members = await getWorkspaceMembers(token);
        if (!cancelled) {
          setWorkspaceMembers(members);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load workspace admin overview");
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

  const adminCount = useMemo(
    () => workspaceMembers.filter((member) => member.role === "owner" || member.role === "admin").length,
    [workspaceMembers]
  );

  const workspaceName = bootstrap?.workspace?.name ?? "Workspace";
  const workspaceSlug = bootstrap?.workspace?.slug ?? "workspace";
  const teamMembers = workspaceMembers.filter((member) => member.role !== "owner" && member.role !== "admin");
  const ownerMember = workspaceMembers.find((member) => member.role === "owner") ?? null;
  const quickActions = [
    {
      href: "/studio/workspace-admin/team",
      label: "Manage team access",
      description: "Add users, change access levels, and reset passwords directly.",
      kicker: `${workspaceMembers.length} users`,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="3.5" />
          <path d="M20 8v6" />
          <path d="M17 11h6" />
        </svg>
      )
    },
    {
      href: "/studio/workspace-admin/posting-windows",
      label: "Manage posting windows",
      description: "Set default posting slots so scheduling flows can suggest brand-approved times.",
      kicker: "Scheduling setup",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4" />
          <path d="M8 2v4" />
          <path d="M3 10h18" />
          <path d="M8 14h.01" />
          <path d="M12 14h.01" />
          <path d="M16 14h.01" />
        </svg>
      )
    }
  ];

  return (
    <section className="panel settings-panel workspace-admin-home">
      <div className="workspace-admin-home-hero">
        <div className="workspace-admin-home-copy">
          <p className="panel-label">Workspace Admin</p>
          <h3>{workspaceName}</h3>
          <p>
            Manage who can access <strong>{workspaceSlug}</strong> and keep the core workspace setup clean without
            digging through general settings.
          </p>
          <div className="workspace-admin-home-meta">
            <span className="workspace-admin-home-chip">Owner: {ownerMember?.displayName ?? ownerMember?.email ?? "Not set"}</span>
            <span className="workspace-admin-home-chip">Admins: {adminCount}</span>
          </div>
        </div>
        <div className="workspace-admin-home-aside">
          <div className="workspace-admin-aside-card">
            <span className="workspace-admin-aside-label">Workspace focus</span>
            <strong>{workspaceMembers.length}</strong>
            <p>People with access to this workspace across admin and team roles.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="empty-state empty-state-tall">
          <strong>Loading workspace admin overview…</strong>
        </div>
      ) : error ? (
        <div className="empty-state empty-state-tall">
          <strong>Unable to load workspace admin overview</strong>
          <p>{error}</p>
        </div>
      ) : (
        <div className="workspace-admin-home-stack">
          <div className="workspace-admin-stats-grid">
            <article className="workspace-admin-stat-card">
              <span className="workspace-admin-stat-label">Total users</span>
              <strong>{workspaceMembers.length}</strong>
              <p>Everyone who can currently access this workspace.</p>
            </article>
            <article className="workspace-admin-stat-card">
              <span className="workspace-admin-stat-label">Admin seats</span>
              <strong>{adminCount}</strong>
              <p>Owner plus admins who can manage access and passwords.</p>
            </article>
            <article className="workspace-admin-stat-card">
              <span className="workspace-admin-stat-label">Team members</span>
              <strong>{teamMembers.length}</strong>
              <p>Non-admin collaborators using the workspace day to day.</p>
            </article>
          </div>

          <div className="workspace-admin-action-grid">
            {quickActions.map((action) => (
              <Link className="workspace-admin-action-card" href={action.href} key={action.href} prefetch={false}>
                <span className="workspace-admin-action-icon">{action.icon}</span>
                <span className="workspace-admin-action-kicker">{action.kicker}</span>
                <strong>{action.label}</strong>
                <p>{action.description}</p>
                <span className="workspace-admin-action-link">Open</span>
              </Link>
            ))}
          </div>

        </div>
      )}
    </section>
  );
}

export function WorkspaceTeamManagementPanel() {
  const { sessionToken, bootstrap, setMessage } = useStudio();
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRecord[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [isInviteDrawerOpen, setIsInviteDrawerOpen] = useState(false);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [addMemberRole, setAddMemberRole] = useState<WorkspaceUiRole>("team");
  const [addingMember, setAddingMember] = useState(false);
  const [memberActionKey, setMemberActionKey] = useState<string | null>(null);
  const [editingMemberPasswordId, setEditingMemberPasswordId] = useState<string | null>(null);
  const [openMemberMenuId, setOpenMemberMenuId] = useState<string | null>(null);
  const [memberPasswordDraft, setMemberPasswordDraft] = useState("");
  const [memberPasswordConfirmDraft, setMemberPasswordConfirmDraft] = useState("");

  const workspaceRole = bootstrap?.workspace?.role ?? null;
  const isWorkspaceAdmin = workspaceRole === "owner" || workspaceRole === "admin";
  const viewerUserId = bootstrap?.viewer.id ?? null;

  useEffect(() => {
    if (!sessionToken) {
      setWorkspaceMembers([]);
      setMembersLoading(false);
      return;
    }

    const token = sessionToken;
    let cancelled = false;

    async function loadMembers() {
      try {
        setMembersLoading(true);
        const members = await getWorkspaceMembers(token);
        if (!cancelled) {
          setWorkspaceMembers(members);
          setMembersError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setMembersError(loadError instanceof Error ? loadError.message : "Failed to load workspace members");
        }
      } finally {
        if (!cancelled) {
          setMembersLoading(false);
        }
      }
    }

    void loadMembers();

    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  async function reloadMembers() {
    if (!sessionToken) {
      return;
    }

    const members = await getWorkspaceMembers(sessionToken);
    setWorkspaceMembers(members);
  }

  async function handleAddMember(event: React.FormEvent) {
    event.preventDefault();

    if (!sessionToken || !addMemberEmail.trim()) {
      return;
    }

    setAddingMember(true);

    try {
      const response = await addWorkspaceMember(sessionToken, {
        email: addMemberEmail.trim(),
        role: addMemberRole
      });

      await reloadMembers();
      setIsInviteDrawerOpen(false);
      setAddMemberEmail("");
      setAddMemberRole("team");

      if (response.status === "exists") {
        setMessage(`${response.member.email} is already in this workspace.`);
      } else if (response.status === "invited") {
        setMessage(`Invitation sent to ${response.member.email}.`);
      } else {
        setMessage(`Added ${response.member.email} to the workspace.`);
      }
    } catch (actionError) {
      setMessage(actionError instanceof Error ? actionError.message : "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  }

  async function handleToggleMemberRole(member: WorkspaceMemberRecord) {
    if (!sessionToken || member.role === "owner") {
      return;
    }

    const nextRole: WorkspaceUiRole = mapWorkspaceRoleToUiRole(member.role) === "admin" ? "team" : "admin";
    const actionKey = `member:${member.id}:role`;
    setMemberActionKey(actionKey);

    try {
      await updateWorkspaceMemberRole(sessionToken, member.id, {
        role: nextRole
      });
      await reloadMembers();
      setMessage(`${member.email} now has ${WORKSPACE_ROLE_OPTION_LABELS[nextRole].toLowerCase()}.`);
    } catch (actionError) {
      setMessage(actionError instanceof Error ? actionError.message : "Failed to update role");
    } finally {
      setMemberActionKey(null);
    }
  }

  async function handleRemoveMember(member: WorkspaceMemberRecord) {
    if (!sessionToken || member.role === "owner") {
      return;
    }

    const confirmed = window.confirm(`Remove ${member.displayName ?? member.email} from this workspace?`);
    if (!confirmed) {
      return;
    }

    const actionKey = `member:${member.id}:remove`;
    setMemberActionKey(actionKey);

    try {
      await removeWorkspaceMember(sessionToken, member.id);
      await reloadMembers();
      setMessage(`Removed ${member.email} from the workspace.`);
    } catch (actionError) {
      setMessage(actionError instanceof Error ? actionError.message : "Failed to remove member");
    } finally {
      setMemberActionKey(null);
    }
  }

  const passwordResetMember = workspaceMembers.find((member) => member.id === editingMemberPasswordId) ?? null;
  const passwordResetActionKey = passwordResetMember ? `member:${passwordResetMember.id}:set-password` : null;

  function startMemberPasswordEdit(memberId: string) {
    setOpenMemberMenuId(null);
    setEditingMemberPasswordId(memberId);
    setMemberPasswordDraft("");
    setMemberPasswordConfirmDraft("");
  }

  function cancelMemberPasswordEdit() {
    setEditingMemberPasswordId(null);
    setMemberPasswordDraft("");
    setMemberPasswordConfirmDraft("");
  }

  async function handleSetMemberPassword(member: WorkspaceMemberRecord) {
    if (!sessionToken) {
      return;
    }

    if (memberPasswordDraft.length < 8) {
      setMessage("Member password must be at least 8 characters.");
      return;
    }

    if (memberPasswordDraft !== memberPasswordConfirmDraft) {
      setMessage("Member password confirmation does not match.");
      return;
    }

    const actionKey = `member:${member.id}:set-password`;
    setMemberActionKey(actionKey);

    try {
      await setWorkspaceMemberPassword(sessionToken, member.id, {
        newPassword: memberPasswordDraft
      });
      setMessage(`Password reset for ${member.email}.`);
      cancelMemberPasswordEdit();
    } catch (actionError) {
      setMessage(actionError instanceof Error ? actionError.message : "Failed to reset password");
    } finally {
      setMemberActionKey(null);
    }
  }

  return (
    <section className="workspace-admin-team-page">
      <div className="workspace-admin-team-header">
        <div>
          <p className="panel-label">Workspace Admin</p>
          <h3>Team management</h3>
        </div>
        <div className="workspace-admin-team-toolbar">
          <span className="pill">{workspaceMembers.length} users</span>
          {isWorkspaceAdmin ? (
            <button className="button button-primary" onClick={() => setIsInviteDrawerOpen(true)} type="button">
              Add employee
            </button>
          ) : null}
        </div>
      </div>

      {membersLoading ? (
        <div className="empty-state empty-state-tall">
          <strong>Loading workspace members…</strong>
        </div>
      ) : membersError ? (
        <div className="empty-state empty-state-tall">
          <strong>Unable to load workspace members</strong>
          <p>{membersError}</p>
        </div>
      ) : !isWorkspaceAdmin ? (
        <div className="empty-state empty-state-tall">
          <strong>No admin access</strong>
          <p>Only workspace admins can manage users.</p>
        </div>
      ) : (
        <>
          {workspaceMembers.length > 0 ? (
            <div className="workspace-admin-member-grid">
              {workspaceMembers.map((member) => {
                const roleKey = `member:${member.id}:role`;
                const removeKey = `member:${member.id}:remove`;
                const roleLabel = mapWorkspaceRoleLabel(member.role);
                const owner = member.role === "owner";
                const roleActionLabel =
                  mapWorkspaceRoleToUiRole(member.role) === "admin" ? "Set team access" : "Grant admin access";
                const isMenuOpen = openMemberMenuId === member.id;

                return (
                  <article className="workspace-admin-member-card" key={member.id}>
                    <div className="workspace-admin-member-card-top">
                      <div className="workspace-admin-member-copy">
                        <strong>{member.displayName ?? member.email}</strong>
                        <span>{member.email}</span>
                      </div>
                      <div className="workspace-admin-member-menu">
                        <button
                          aria-expanded={isMenuOpen}
                          aria-haspopup="menu"
                          className="workspace-admin-member-menu-trigger"
                          onClick={() => setOpenMemberMenuId(isMenuOpen ? null : member.id)}
                          type="button"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <circle cx="12" cy="5" r="1.5" />
                            <circle cx="12" cy="12" r="1.5" />
                            <circle cx="12" cy="19" r="1.5" />
                          </svg>
                        </button>
                        {isMenuOpen ? (
                          <div className="workspace-admin-member-menu-popover user-popover" role="menu">
                            <div className="popover-section">
                              <span>{member.displayName ?? member.email}</span>
                            </div>
                            <div className="popover-divider" />
                            <button
                              className="popover-item"
                              disabled={owner || memberActionKey !== null}
                              onClick={() => void handleToggleMemberRole(member)}
                              type="button"
                            >
                              {memberActionKey === roleKey ? "Saving…" : roleActionLabel}
                            </button>
                            <button
                              className="popover-item"
                              disabled={memberActionKey !== null}
                              onClick={() => startMemberPasswordEdit(member.id)}
                              type="button"
                            >
                              Reset password
                            </button>
                            <button
                              className="popover-item signout-btn"
                              disabled={owner || member.id === viewerUserId || memberActionKey !== null}
                              onClick={() => void handleRemoveMember(member)}
                              type="button"
                            >
                              {memberActionKey === removeKey ? "Removing…" : "Remove member"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="workspace-admin-member-meta">
                      <span className="pill">{roleLabel}</span>
                      {owner ? <span className="pill">Owner</span> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No team members yet</strong>
              <p>Add users by email to let them access this workspace.</p>
            </div>
          )}

          {isInviteDrawerOpen ? (
            <div className="drawer-overlay" onClick={() => setIsInviteDrawerOpen(false)}>
              <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
                <div className="drawer-header">
                  <div>
                    <p className="panel-label">Workspace Admin</p>
                    <h2>Add employee</h2>
                  </div>
                  <button className="drawer-close" onClick={() => setIsInviteDrawerOpen(false)} type="button">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </div>

                <div className="drawer-body">
                  <form className="planner-form" onSubmit={handleAddMember}>
                    <div className="planner-form-grid">
                      <label className="field-label planner-form-span-2">
                        Email
                        <input
                          required
                          type="email"
                          value={addMemberEmail}
                          onChange={(event) => setAddMemberEmail(event.target.value)}
                          placeholder="user@example.com"
                        />
                      </label>
                      <label className="field-label">
                        Access
                        <select
                          value={addMemberRole}
                          onChange={(event) => setAddMemberRole(event.target.value as WorkspaceUiRole)}
                        >
                          <option value="team">{WORKSPACE_ROLE_OPTION_LABELS.team}</option>
                          <option value="admin">{WORKSPACE_ROLE_OPTION_LABELS.admin}</option>
                        </select>
                      </label>
                    </div>
                    <div className="planner-form-actions">
                      <button className="button button-ghost" onClick={() => setIsInviteDrawerOpen(false)} type="button">
                        Cancel
                      </button>
                      <button className="button button-primary" disabled={addingMember} type="submit">
                        {addingMember ? "Adding…" : "Add employee"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          ) : null}

          {passwordResetMember ? (
            <div className="drawer-overlay" onClick={cancelMemberPasswordEdit}>
              <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
                <div className="drawer-header">
                  <div>
                    <p className="panel-label">Workspace Admin</p>
                    <h2>Reset password</h2>
                  </div>
                  <button className="drawer-close" onClick={cancelMemberPasswordEdit} type="button">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </div>

                <div className="drawer-body">
                  <form
                    className="planner-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSetMemberPassword(passwordResetMember);
                    }}
                  >
                    <div className="planner-form-grid">
                      <div className="workspace-admin-reset-context planner-form-span-2">
                        <strong>{passwordResetMember.displayName ?? passwordResetMember.email}</strong>
                        <span>{passwordResetMember.email}</span>
                      </div>
                      <label className="field-label planner-form-span-2">
                        New password
                        <input
                          minLength={8}
                          required
                          type="password"
                          value={memberPasswordDraft}
                          onChange={(event) => setMemberPasswordDraft(event.target.value)}
                          placeholder="At least 8 characters"
                        />
                      </label>
                      <label className="field-label planner-form-span-2">
                        Confirm password
                        <input
                          minLength={8}
                          required
                          type="password"
                          value={memberPasswordConfirmDraft}
                          onChange={(event) => setMemberPasswordConfirmDraft(event.target.value)}
                          placeholder="Re-enter password"
                        />
                      </label>
                    </div>
                    <div className="planner-form-actions">
                      <button className="button button-ghost" disabled={memberActionKey !== null} onClick={cancelMemberPasswordEdit} type="button">
                        Cancel
                      </button>
                      <button className="button button-primary" disabled={memberActionKey !== null} type="submit">
                        {memberActionKey === passwordResetActionKey ? "Resetting…" : "Reset password"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export function WorkspaceCreditsPanel() {
  const { sessionToken, bootstrap } = useStudio();
  const [creditWallet, setCreditWallet] = useState<WorkspaceCreditWallet | null>(null);
  const [creditLedger, setCreditLedger] = useState<WorkspaceCreditLedgerEntry[]>([]);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const isPlatformAdmin = bootstrap?.viewer.isPlatformAdmin ?? false;

  useEffect(() => {
    if (!sessionToken) {
      setCreditWallet(null);
      setCreditLedger([]);
      setCreditsLoading(false);
      return;
    }

    const token = sessionToken;
    let cancelled = false;

    async function loadCredits() {
      try {
        setCreditsLoading(true);
        const [walletResponse, ledgerResponse] = await Promise.all([
          getWorkspaceCreditWallet(token),
          getWorkspaceCreditLedger(token, { limit: 20, offset: 0 })
        ]);

        if (!cancelled) {
          setCreditWallet(walletResponse);
          setCreditLedger(ledgerResponse.items);
          setCreditsError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setCreditWallet(null);
          setCreditLedger([]);
          setCreditsError(loadError instanceof Error ? loadError.message : "Failed to load credit balance");
        }
      } finally {
        if (!cancelled) {
          setCreditsLoading(false);
        }
      }
    }

    void loadCredits();

    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  return (
    <section className="panel settings-panel settings-credits-panel">
      <div className="settings-panel-header">
        <div>
          <p className="panel-label">Workspace Admin</p>
          <h3>Workspace balance</h3>
        </div>
        {creditWallet ? <span className="pill">{creditWallet.balance} available</span> : null}
      </div>

      {isPlatformAdmin ? (
        <div className="settings-note">
          <span>Need platform-level controls?</span>
          <a className="button button-ghost" href="/studio/admin">
            Open super admin dashboard
          </a>
        </div>
      ) : null}

      {creditsLoading ? (
        <div className="empty-state empty-state-tall">
          <strong>Loading credit balance…</strong>
        </div>
      ) : creditsError ? (
        <div className="empty-state empty-state-tall">
          <strong>Unable to load credits</strong>
          <p>{creditsError}</p>
        </div>
      ) : !creditWallet ? (
        <div className="empty-state">
          <strong>No workspace credit wallet found</strong>
          <p>Credits will appear once a wallet is created for this workspace.</p>
        </div>
      ) : (
        <>
          <div className="settings-window-list">
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Lifetime credited</strong>
                <span>Total credits added to this workspace</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{creditWallet.lifetimeCredited}</span>
              </div>
            </article>
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Lifetime debited</strong>
                <span>Total credits consumed by generation/edit activity</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{creditWallet.lifetimeDebited}</span>
              </div>
            </article>
          </div>

          {creditLedger.length > 0 ? (
            <div className="settings-window-list">
              {creditLedger.map((entry) => (
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
            </div>
          ) : (
            <div className="empty-state">
              <strong>No credit activity yet</strong>
              <p>Ledger entries will appear here as credits are used or added.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function WorkspacePostingWindowsPanel() {
  const { sessionToken, activeBrandId, bootstrap, setMessage } = useStudio();
  const [postingWindows, setPostingWindows] = useState<PostingWindowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPostingWindowId, setEditingPostingWindowId] = useState<string | null>(null);
  const [formState, setFormState] = useState<PostingWindowFormState>(createDefaultPostingWindowForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const activeBrand = useMemo(
    () => bootstrap?.brands.find((brand) => brand.id === activeBrandId) ?? null,
    [activeBrandId, bootstrap]
  );

  useEffect(() => {
    if (!sessionToken || !activeBrandId) {
      setPostingWindows([]);
      setLoading(false);
      return;
    }

    const token: string = sessionToken;
    const brandId: string = activeBrandId;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const records = await getPostingWindows(token, brandId);
        if (!cancelled) {
          setPostingWindows(records);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load posting windows");
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
  }, [activeBrandId, sessionToken]);

  const groupedWindows = useMemo(() => {
    const groups = new Map<CreativeChannel, PostingWindowRecord[]>();
    for (const postingWindow of postingWindows) {
      const current = groups.get(postingWindow.channel) ?? [];
      current.push(postingWindow);
      groups.set(postingWindow.channel, current);
    }
    return channelOptions
      .map((option) => ({
        channel: option.value,
        label: option.label,
        items: groups.get(option.value) ?? []
      }))
      .filter((group) => group.items.length > 0);
  }, [postingWindows]);

  async function reloadPostingWindows() {
    if (!sessionToken || !activeBrandId) {
      return;
    }

    const token: string = sessionToken;
    const brandId: string = activeBrandId;
    const records = await getPostingWindows(token, brandId);
    setPostingWindows(records);
  }

  function openCreateDrawer() {
    setEditingPostingWindowId(null);
    setFormState(createDefaultPostingWindowForm());
    setIsEditorOpen(true);
  }

  function openEditor(postingWindow: PostingWindowRecord) {
    setEditingPostingWindowId(postingWindow.id);
    setFormState({
      channel: postingWindow.channel,
      weekday: postingWindow.weekday,
      localTime: postingWindow.localTime.slice(0, 5),
      timezone: postingWindow.timezone ?? "",
      label: postingWindow.label ?? "",
      active: postingWindow.active,
      sortOrder: postingWindow.sortOrder
    });
    setIsEditorOpen(true);
  }

  async function handleSavePostingWindow(event: React.FormEvent) {
    event.preventDefault();

    if (!sessionToken || !activeBrandId) {
      return;
    }

    const duplicatePostingWindow = findDuplicatePostingWindow(
      postingWindows,
      formState.channel,
      formState.weekday,
      formState.localTime,
      editingPostingWindowId
    );

    if (duplicatePostingWindow) {
      setMessage("This channel already has a slot at that day and time.");
      return;
    }

    setSaving(true);

    try {
      if (editingPostingWindowId) {
        await updatePostingWindow(sessionToken, editingPostingWindowId, {
          channel: formState.channel,
          weekday: formState.weekday,
          localTime: formState.localTime,
          timezone: formState.timezone || undefined,
          label: formState.label || undefined,
          active: formState.active,
          sortOrder: formState.sortOrder
        });
        setMessage("Posting window updated.");
      } else {
        await createPostingWindow(sessionToken, {
          brandId: activeBrandId,
          channel: formState.channel,
          weekday: formState.weekday,
          localTime: formState.localTime,
          timezone: formState.timezone || undefined,
          label: formState.label || undefined,
          active: formState.active,
          sortOrder: formState.sortOrder
        });
        setMessage("Posting window created.");
      }

      await reloadPostingWindows();
      setIsEditorOpen(false);
      setEditingPostingWindowId(null);
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Posting window update failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePostingWindow(postingWindowId: string) {
    if (!sessionToken) {
      return;
    }

    setDeletingId(postingWindowId);

    try {
      await deletePostingWindow(sessionToken, postingWindowId);
      await reloadPostingWindows();
      setMessage("Posting window removed.");
    } catch (deleteError) {
      setMessage(deleteError instanceof Error ? deleteError.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  if (!activeBrandId && !loading) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Posting windows</p>
          <h3>Pick a brand first</h3>
          <p>Posting windows are saved per brand.</p>
        </article>
      </div>
    );
  }

  return (
    <section className="panel settings-panel">
      <div className="settings-panel-header">
        <div>
          <p className="panel-label">Posting windows</p>
          <h3>{activeBrand?.name ?? "Active brand"}</h3>
        </div>
        <div className="settings-window-actions">
          <span className="pill">{postingWindows.length} slots</span>
          <button className="button button-primary" disabled={!activeBrandId || saving} onClick={openCreateDrawer} type="button">
            {saving ? "Saving…" : "New slot"}
          </button>
        </div>
      </div>

      <div className="settings-note">
        <span>Saved slots show up as quick scheduling suggestions in deliverable create and edit flows.</span>
      </div>

      {loading ? (
        <div className="empty-state empty-state-tall">
          <strong>Loading posting windows…</strong>
        </div>
      ) : error ? (
        <div className="empty-state empty-state-tall">
          <strong>Unable to load posting windows</strong>
          <p>{error}</p>
        </div>
      ) : groupedWindows.length > 0 ? (
        <div className="settings-channel-groups">
          {groupedWindows.map((group) => (
            <section className="settings-channel-group" key={group.channel}>
              <div className="settings-channel-heading">
                <h4>{group.label}</h4>
                <span>{group.items.length}</span>
              </div>
              <div className="settings-window-list">
                {group.items.map((postingWindow) => (
                  <article className="settings-window-row" key={postingWindow.id}>
                    <div className="settings-window-copy">
                      <strong>{postingWindow.label ?? formatWeekdayLabel(postingWindow.weekday)}</strong>
                      <span>
                        {formatWeekdayLabel(postingWindow.weekday)} · {formatLocalTimeLabel(postingWindow.localTime)}
                        {postingWindow.timezone ? ` · ${postingWindow.timezone}` : ""}
                      </span>
                    </div>
                    <div className="settings-window-actions">
                      {!postingWindow.active ? <span className="pill">Inactive</span> : null}
                      <button className="button button-ghost" onClick={() => openEditor(postingWindow)} type="button">
                        Edit
                      </button>
                      <button
                        className="button button-ghost delete-button"
                        disabled={deletingId === postingWindow.id}
                        onClick={() => void handleDeletePostingWindow(postingWindow.id)}
                        type="button"
                      >
                        {deletingId === postingWindow.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="empty-state empty-state-tall">
          <strong>No posting windows yet</strong>
          <p>Save your usual channel and time combinations here so create and edit forms can suggest them instantly.</p>
        </div>
      )}

      {isEditorOpen ? (
        <div className="drawer-overlay" onClick={() => setIsEditorOpen(false)}>
          <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <h2>{editingPostingWindowId ? "Edit posting window" : "Create posting window"}</h2>
              <button className="drawer-close" onClick={() => setIsEditorOpen(false)} type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="drawer-body">
              <form className="planner-form" onSubmit={handleSavePostingWindow}>
                <div className="planner-form-grid">
                  <label className="field-label">
                    Channel
                    <select
                      value={formState.channel}
                      onChange={(event) => setFormState((state) => ({ ...state, channel: event.target.value as CreativeChannel }))}
                    >
                      {channelOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field-label">
                    Day
                    <select
                      value={formState.weekday}
                      onChange={(event) => setFormState((state) => ({ ...state, weekday: event.target.value as WeekdayCode }))}
                    >
                      {weekdayOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field-label">
                    Time
                    <input
                      required
                      type="time"
                      value={formState.localTime}
                      onChange={(event) => setFormState((state) => ({ ...state, localTime: event.target.value }))}
                    />
                  </label>

                  <label className="field-label">
                    Timezone
                    <input
                      value={formState.timezone}
                      onChange={(event) => setFormState((state) => ({ ...state, timezone: event.target.value }))}
                      placeholder="Asia/Kolkata"
                    />
                  </label>

                  <label className="field-label planner-form-span-2">
                    Label
                    <input
                      value={formState.label}
                      onChange={(event) => setFormState((state) => ({ ...state, label: event.target.value }))}
                      placeholder="Evening push"
                    />
                  </label>

                  <label className="field-label">
                    Sort order
                    <input
                      min="0"
                      step="1"
                      type="number"
                      value={formState.sortOrder}
                      onChange={(event) => setFormState((state) => ({ ...state, sortOrder: Number(event.target.value) || 0 }))}
                    />
                  </label>

                  <label className="field-label field-label-checkbox">
                    <input
                      checked={formState.active}
                      onChange={(event) => setFormState((state) => ({ ...state, active: event.target.checked }))}
                      type="checkbox"
                    />
                    Active
                  </label>
                </div>

                <div className="planner-form-actions">
                  <button className="button button-ghost" onClick={() => setIsEditorOpen(false)} type="button">
                    Cancel
                  </button>
                  <button className="button button-primary" disabled={saving} type="submit">
                    {saving ? "Saving…" : editingPostingWindowId ? "Save changes" : "Save slot"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function mapWorkspaceRoleToUiRole(role: WorkspaceMemberRecord["role"]): WorkspaceUiRole {
  return role === "owner" || role === "admin" ? "admin" : "team";
}

function mapWorkspaceRoleLabel(role: WorkspaceMemberRecord["role"]) {
  if (role === "owner") {
    return "Admin";
  }

  if (role === "admin") {
    return "Admin";
  }

  return "Team";
}

function formatCreditEntryKind(entryKind: WorkspaceCreditLedgerEntry["entryKind"]) {
  return entryKind
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function createDefaultPostingWindowForm(): PostingWindowFormState {
  return {
    channel: "instagram-feed",
    weekday: "thursday",
    localTime: "18:30",
    timezone: "Asia/Kolkata",
    label: "",
    active: true,
    sortOrder: 0
  };
}

function findDuplicatePostingWindow(
  postingWindows: PostingWindowRecord[],
  channel: CreativeChannel,
  weekday: WeekdayCode,
  localTime: string,
  excludeId?: string | null
) {
  const normalizedTime = normalizeLocalTime(localTime);
  return postingWindows.find(
    (postingWindow) =>
      postingWindow.id !== excludeId &&
      postingWindow.channel === channel &&
      postingWindow.weekday === weekday &&
      normalizeLocalTime(postingWindow.localTime) === normalizedTime
  );
}

function normalizeLocalTime(localTime: string) {
  return localTime.slice(0, 5);
}
