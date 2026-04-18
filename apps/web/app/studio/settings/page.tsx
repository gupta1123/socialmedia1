"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CreativeChannel,
  PostingWindowRecord,
  WorkspaceCreditLedgerEntry,
  WorkspaceCreditWallet,
  WeekdayCode,
  WorkspaceMemberRecord
} from "@image-lab/contracts";
import {
  addWorkspaceMember,
  getWorkspaceCreditLedger,
  getWorkspaceCreditWallet,
  createPostingWindow,
  deletePostingWindow,
  getPostingWindows,
  getWorkspaceMembers,
  removeWorkspaceMember,
  setWorkspaceMemberPassword,
  updatePostingWindow,
  updateWorkspaceMemberRole
} from "../../../lib/api";
import {
  formatLocalTimeLabel,
  formatWeekdayLabel,
  weekdayOptions
} from "../../../lib/posting-windows";
import { supabase } from "../../../lib/supabase-browser";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions } from "../topbar-actions-context";

type PostingWindowFormState = {
  channel: CreativeChannel;
  weekday: WeekdayCode;
  localTime: string;
  timezone: string;
  label: string;
  active: boolean;
  sortOrder: number;
};

type WorkspaceUiRole = "admin" | "team";
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

export default function SettingsPage() {
  const { sessionToken, activeBrandId, bootstrap, setMessage } = useStudio();
  const [postingWindows, setPostingWindows] = useState<PostingWindowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPostingWindowId, setEditingPostingWindowId] = useState<string | null>(null);
  const [formState, setFormState] = useState<PostingWindowFormState>(createDefaultPostingWindowForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRecord[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [addMemberRole, setAddMemberRole] = useState<WorkspaceUiRole>("team");
  const [addingMember, setAddingMember] = useState(false);
  const [memberActionKey, setMemberActionKey] = useState<string | null>(null);
  const [editingMemberPasswordId, setEditingMemberPasswordId] = useState<string | null>(null);
  const [memberPasswordDraft, setMemberPasswordDraft] = useState("");
  const [memberPasswordConfirmDraft, setMemberPasswordConfirmDraft] = useState("");
  const [creditWallet, setCreditWallet] = useState<WorkspaceCreditWallet | null>(null);
  const [creditLedger, setCreditLedger] = useState<WorkspaceCreditLedgerEntry[]>([]);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [creditsError, setCreditsError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const workspaceRole = bootstrap?.workspace?.role ?? null;
  const isWorkspaceAdmin = workspaceRole === "owner" || workspaceRole === "admin";
  const isPlatformAdmin = bootstrap?.viewer.isPlatformAdmin ?? false;
  const viewerUserId = bootstrap?.viewer.id ?? null;

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

    const token = sessionToken;
    const brandId = activeBrandId;
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

  const topbarActions = useMemo(
    () => (
      <button
        className="button button-primary"
        disabled={!activeBrandId || saving}
        onClick={() => {
          setEditingPostingWindowId(null);
          setFormState(createDefaultPostingWindowForm());
          setIsEditorOpen(true);
        }}
        type="button"
      >
        {saving ? "Saving…" : "New slot"}
      </button>
    ),
    [activeBrandId, saving]
  );

  useRegisterTopbarActions(topbarActions);

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
    const records = await getPostingWindows(sessionToken, activeBrandId);
    setPostingWindows(records);
  }

  async function reloadMembers() {
    if (!sessionToken) {
      return;
    }

    const members = await getWorkspaceMembers(sessionToken);
    setWorkspaceMembers(members);
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

  function startMemberPasswordEdit(memberId: string) {
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
      setMessage(`Password updated for ${member.email}.`);
      cancelMemberPasswordEdit();
    } catch (actionError) {
      setMessage(actionError instanceof Error ? actionError.message : "Failed to set password");
    } finally {
      setMemberActionKey(null);
    }
  }

  async function handleUpdateOwnPassword(event: React.FormEvent) {
    event.preventDefault();

    if (!password || !confirmPassword) {
      setMessage("Enter and confirm your new password.");
      return;
    }

    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setUpdatingPassword(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password
      });

      if (updateError) {
        throw updateError;
      }

      setPassword("");
      setConfirmPassword("");
      setMessage("Password updated.");
    } catch (updateError) {
      setMessage(updateError instanceof Error ? updateError.message : "Password update failed");
    } finally {
      setUpdatingPassword(false);
    }
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

  return (
    <div className="page-stack">
      <section className="panel settings-panel">
        <div className="settings-panel-header">
          <div>
            <p className="panel-label">Posting windows</p>
            <h3>{activeBrand?.name ?? "Active brand"}</h3>
          </div>
          <span className="pill">{postingWindows.length} slots</span>
        </div>

        <div className="settings-note">
          <span>Saved slots show up as quick scheduling suggestions in deliverable create and edit flows.</span>
        </div>

        {!activeBrandId ? (
          <div className="empty-state empty-state-tall">
            <strong>Pick a brand first</strong>
            <p>Posting windows are saved per brand.</p>
          </div>
        ) : loading ? (
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
      </section>

      <section className="panel settings-panel settings-team-panel">
        <div className="settings-panel-header">
          <div>
            <p className="panel-label">Admin</p>
            <h3>Team management</h3>
          </div>
          <span className="pill">{workspaceMembers.length} users</span>
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
            <form className="planner-form settings-inline-form" onSubmit={handleAddMember}>
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
                  Role
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
                <button className="button button-primary" disabled={addingMember} type="submit">
                  {addingMember ? "Adding…" : "Add user"}
                </button>
              </div>
            </form>

            {workspaceMembers.length > 0 ? (
              <div className="settings-window-list">
                {workspaceMembers.map((member) => {
                  const roleKey = `member:${member.id}:role`;
                  const removeKey = `member:${member.id}:remove`;
                  const setPasswordKey = `member:${member.id}:set-password`;
                  const roleLabel = mapWorkspaceRoleLabel(member.role);
                  const owner = member.role === "owner";
                  const roleActionLabel =
                    mapWorkspaceRoleToUiRole(member.role) === "admin"
                      ? "Set Team Access"
                      : "Grant Admin Access";

                  return (
                    <article className="settings-window-row settings-member-row" key={member.id}>
                      <div className="settings-window-copy">
                        <strong>{member.displayName ?? member.email}</strong>
                        <span>{member.email}</span>
                      </div>
                      <div className="settings-window-actions">
                        <span className="pill">{roleLabel}</span>
                        {owner ? <span className="pill">Owner</span> : null}
                        <button
                          className="button button-ghost"
                          disabled={owner || memberActionKey !== null}
                          onClick={() => void handleToggleMemberRole(member)}
                          type="button"
                        >
                          {memberActionKey === roleKey ? "Saving…" : roleActionLabel}
                        </button>
                        <button
                          className="button button-ghost"
                          disabled={memberActionKey !== null}
                          onClick={() => startMemberPasswordEdit(member.id)}
                          type="button"
                        >
                          Set password
                        </button>
                        <button
                          className="button button-ghost delete-button"
                          disabled={owner || member.id === viewerUserId || memberActionKey !== null}
                          onClick={() => void handleRemoveMember(member)}
                          type="button"
                        >
                          {memberActionKey === removeKey ? "Removing…" : "Remove"}
                        </button>
                      </div>
                      {editingMemberPasswordId === member.id ? (
                        <div className="settings-member-password-editor">
                          <label className="field-label">
                            New password
                            <input
                              minLength={8}
                              type="password"
                              value={memberPasswordDraft}
                              onChange={(event) => setMemberPasswordDraft(event.target.value)}
                              placeholder="At least 8 characters"
                            />
                          </label>
                          <label className="field-label">
                            Confirm password
                            <input
                              minLength={8}
                              type="password"
                              value={memberPasswordConfirmDraft}
                              onChange={(event) => setMemberPasswordConfirmDraft(event.target.value)}
                              placeholder="Re-enter password"
                            />
                          </label>
                          <div className="planner-form-actions">
                            <button
                              className="button button-primary"
                              disabled={memberActionKey !== null}
                              onClick={() => void handleSetMemberPassword(member)}
                              type="button"
                            >
                              {memberActionKey === setPasswordKey ? "Saving…" : "Save password"}
                            </button>
                            <button
                              className="button button-ghost"
                              disabled={memberActionKey !== null}
                              onClick={cancelMemberPasswordEdit}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
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
          </>
        )}
      </section>

      <section className="panel settings-panel settings-credits-panel">
        <div className="settings-panel-header">
          <div>
            <p className="panel-label">Credits</p>
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

      <section className="panel settings-panel settings-password-panel">
        <div className="settings-panel-header">
          <div>
            <p className="panel-label">Security</p>
            <h3>Change your password</h3>
          </div>
        </div>

        <form className="planner-form settings-inline-form" onSubmit={handleUpdateOwnPassword}>
          <div className="planner-form-grid">
            <label className="field-label">
              New password
              <input
                required
                minLength={8}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="field-label">
              Confirm password
              <input
                required
                minLength={8}
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          </div>
          <div className="planner-form-actions">
            <button className="button button-primary" disabled={updatingPassword} type="submit">
              {updatingPassword ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </section>

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
    </div>
  );
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

function mapWorkspaceRoleToUiRole(role: WorkspaceMemberRecord["role"]): WorkspaceUiRole {
  return role === "owner" || role === "admin" ? "admin" : "team";
}

function mapWorkspaceRoleLabel(role: WorkspaceMemberRecord["role"]) {
  return mapWorkspaceRoleToUiRole(role) === "admin" ? "Admin access" : "Team access";
}

function formatCreditEntryKind(kind: WorkspaceCreditLedgerEntry["entryKind"]) {
  if (kind === "usage_reserve") {
    return "Usage reserve";
  }

  if (kind === "usage_release") {
    return "Usage release";
  }

  if (kind === "adjustment") {
    return "Adjustment";
  }

  return "Grant";
}
