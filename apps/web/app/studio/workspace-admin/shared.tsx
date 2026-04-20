"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BrandAssetRecord,
  CreativeChannel,
  PostingWindowRecord,
  ProjectRecord,
  ProjectReraRegistrationRecord,
  WeekdayCode,
  WorkspaceCreditLedgerEntry,
  WorkspaceCreditWallet,
  WorkspaceMemberRecord
} from "@image-lab/contracts";
import {
  addWorkspaceMember,
  createPostingWindow,
  deleteProjectReraRegistration,
  deletePostingWindow,
  getBrandAssets,
  getProjectReraRegistrations,
  getProjects,
  getWorkspaceCreditLedger,
  getWorkspaceCreditWallet,
  getWorkspaceMembers,
  getPostingWindows,
  removeWorkspaceMember,
  setDefaultProjectReraRegistration,
  setWorkspaceMemberPassword,
  updateProjectReraRegistration,
  updateWorkspaceComplianceSettings,
  updatePostingWindow,
  updateWorkspaceMemberRole
} from "../../../lib/api";
import { formatLocalTimeLabel, formatWeekdayLabel, weekdayOptions } from "../../../lib/posting-windows";
import { useStudio } from "../studio-context";
import { useRegisterTopbarControls } from "../topbar-actions-context";

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

export function WorkspaceCompliancePanel() {
  const { sessionToken, bootstrap, activeBrandId, refresh, setMessage } = useStudio();
  const complianceSettings = bootstrap?.workspaceComplianceSettings ?? null;
  const [reraAuthorityLabel, setReraAuthorityLabel] = useState(complianceSettings?.reraAuthorityLabel ?? "MahaRERA");
  const [reraWebsiteUrl, setReraWebsiteUrl] = useState(complianceSettings?.reraWebsiteUrl ?? "https://maharera.maharashtra.gov.in");
  const [reraTextColor, setReraTextColor] = useState(complianceSettings?.reraTextColor ?? "#111111");
  const [savingComplianceSettings, setSavingComplianceSettings] = useState(false);
  const [brandAssets, setBrandAssets] = useState<BrandAssetRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [reraRegistrations, setReraRegistrations] = useState<ProjectReraRegistrationRecord[]>([]);
  const [selectedReraRegistrationId, setSelectedReraRegistrationId] = useState("");
  const [loadingReraPreview, setLoadingReraPreview] = useState(true);
  const [reraPreviewError, setReraPreviewError] = useState<string | null>(null);
  const [registrationActionKey, setRegistrationActionKey] = useState<string | null>(null);
  const [editingRegistrationId, setEditingRegistrationId] = useState<string | null>(null);
  const [editingRegistrationLabel, setEditingRegistrationLabel] = useState("");
  const [editingRegistrationNumber, setEditingRegistrationNumber] = useState("");
  const [editingRegistrationQrAssetId, setEditingRegistrationQrAssetId] = useState("");

  useEffect(() => {
    setReraAuthorityLabel(complianceSettings?.reraAuthorityLabel ?? "MahaRERA");
    setReraWebsiteUrl(complianceSettings?.reraWebsiteUrl ?? "https://maharera.maharashtra.gov.in");
    setReraTextColor(complianceSettings?.reraTextColor ?? "#111111");
  }, [complianceSettings?.reraAuthorityLabel, complianceSettings?.reraTextColor, complianceSettings?.reraWebsiteUrl]);

  async function reloadReraPreviewData() {
    if (!sessionToken || !activeBrandId) {
      setBrandAssets([]);
      setProjects([]);
      setReraRegistrations([]);
      setSelectedReraRegistrationId("");
      setLoadingReraPreview(false);
      return;
    }

    setLoadingReraPreview(true);
    try {
      const [assetRecords, projectRecords, registrationRecords] = await Promise.all([
        getBrandAssets(sessionToken, activeBrandId),
        getProjects(sessionToken, { brandId: activeBrandId }),
        getProjectReraRegistrations(sessionToken, activeBrandId)
      ]);

      setBrandAssets(assetRecords);
      setProjects(projectRecords);
      setReraRegistrations(registrationRecords);
      setSelectedReraRegistrationId((current) => {
        if (current && registrationRecords.some((registration) => registration.id === current)) {
          return current;
        }
        return registrationRecords.find((registration) => registration.isDefault)?.id ?? registrationRecords[0]?.id ?? "";
      });
      setReraPreviewError(null);
    } catch (loadError) {
      setReraPreviewError(loadError instanceof Error ? loadError.message : "Failed to load RERA registrations");
    } finally {
      setLoadingReraPreview(false);
    }
  }

  useEffect(() => {
    void reloadReraPreviewData();
  }, [activeBrandId, sessionToken]);

  const reraQrAssetById = useMemo(
    () => new Map(brandAssets.filter((asset) => asset.kind === "rera_qr").map((asset) => [asset.id, asset])),
    [brandAssets]
  );
  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects]
  );
  const reraPreviewOptions = useMemo(
    () =>
      reraRegistrations.map((registration) => ({
        registration,
        qrAsset: registration.qrAssetId ? reraQrAssetById.get(registration.qrAssetId) ?? null : null,
        projectName: registration.projectId ? projectNameById.get(registration.projectId) ?? "Project" : "General RERA"
      })),
    [projectNameById, reraQrAssetById, reraRegistrations]
  );
  const selectedReraPreview = useMemo(
    () => reraPreviewOptions.find((option) => option.registration.id === selectedReraRegistrationId) ?? reraPreviewOptions[0] ?? null,
    [reraPreviewOptions, selectedReraRegistrationId]
  );
  const reraRegistrationGroups = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; registrations: typeof reraPreviewOptions }>();
    for (const option of reraPreviewOptions) {
      const key = option.registration.projectId ?? "general";
      const name = option.projectName;
      const existing = groups.get(key);
      if (existing) {
        existing.registrations.push(option);
      } else {
        groups.set(key, { key, name, registrations: [option] });
      }
    }
    return Array.from(groups.values());
  }, [reraPreviewOptions]);
  const editingRegistration = useMemo(
    () => reraPreviewOptions.find((option) => option.registration.id === editingRegistrationId) ?? null,
    [editingRegistrationId, reraPreviewOptions]
  );
  const editableQrAssets = useMemo(
    () =>
      brandAssets.filter(
        (asset) =>
          asset.kind === "rera_qr" &&
          (!editingRegistration?.registration.projectId ||
            asset.projectId === editingRegistration.registration.projectId ||
            asset.projectId === null)
      ),
    [brandAssets, editingRegistration]
  );
  const selectedQrUrl = selectedReraPreview?.qrAsset?.thumbnailUrl ?? selectedReraPreview?.qrAsset?.previewUrl ?? selectedReraPreview?.qrAsset?.originalUrl;
  const previewReraNumber = selectedReraPreview?.registration.registrationNumber?.trim() || "P5210054534";

  function startEditingRegistration(option: (typeof reraPreviewOptions)[number]) {
    setEditingRegistrationId(option.registration.id);
    setEditingRegistrationLabel(option.registration.label);
    setEditingRegistrationNumber(option.registration.registrationNumber ?? "");
    setEditingRegistrationQrAssetId(option.registration.qrAssetId ?? "");
  }

  function closeRegistrationEditor() {
    setEditingRegistrationId(null);
    setEditingRegistrationLabel("");
    setEditingRegistrationNumber("");
    setEditingRegistrationQrAssetId("");
  }

  async function handleSaveComplianceSettings(event: React.FormEvent) {
    event.preventDefault();

    if (!sessionToken) {
      return;
    }

    setSavingComplianceSettings(true);
    try {
      await updateWorkspaceComplianceSettings(sessionToken, {
        reraAuthorityLabel,
        reraWebsiteUrl,
        reraTextColor
      });
      await refresh(activeBrandId ?? bootstrap?.brands[0]?.id);
      setMessage("RERA compliance settings saved.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Failed to save RERA compliance settings");
    } finally {
      setSavingComplianceSettings(false);
    }
  }

  async function handleSetDefaultRegistration(registration: ProjectReraRegistrationRecord) {
    if (!sessionToken || !activeBrandId || !registration.projectId) {
      return;
    }

    const actionKey = `registration:${registration.id}:default`;
    setRegistrationActionKey(actionKey);
    try {
      await setDefaultProjectReraRegistration(sessionToken, activeBrandId, registration.id);
      await reloadReraPreviewData();
      setMessage(`Default RERA registration updated for this project.`);
    } catch (actionError) {
      setMessage(actionError instanceof Error ? actionError.message : "Failed to update default RERA registration");
    } finally {
      setRegistrationActionKey(null);
    }
  }

  async function handleSaveRegistration() {
    if (!sessionToken || !activeBrandId || !editingRegistration) {
      return;
    }

    const trimmedLabel = editingRegistrationLabel.trim();
    if (!trimmedLabel) {
      setMessage("Registration label is required.");
      return;
    }

    const actionKey = `registration:${editingRegistration.registration.id}:save`;
    setRegistrationActionKey(actionKey);
    try {
      await updateProjectReraRegistration(sessionToken, activeBrandId, editingRegistration.registration.id, {
        label: trimmedLabel,
        registrationNumber: editingRegistrationNumber.trim() || null,
        qrAssetId: editingRegistrationQrAssetId || null
      });
      await reloadReraPreviewData();
      setMessage("RERA registration updated.");
      closeRegistrationEditor();
    } catch (actionError) {
      setMessage(actionError instanceof Error ? actionError.message : "Failed to update RERA registration");
    } finally {
      setRegistrationActionKey(null);
    }
  }

  async function handleDeleteRegistration(registration: ProjectReraRegistrationRecord) {
    if (!sessionToken || !activeBrandId) {
      return;
    }

    const confirmed = window.confirm(`Remove ${registration.label} from compliance registrations?`);
    if (!confirmed) {
      return;
    }

    const actionKey = `registration:${registration.id}:delete`;
    setRegistrationActionKey(actionKey);
    try {
      await deleteProjectReraRegistration(sessionToken, activeBrandId, registration.id);
      await reloadReraPreviewData();
      setMessage("RERA registration removed.");
      if (editingRegistrationId === registration.id) {
        closeRegistrationEditor();
      }
    } catch (actionError) {
      setMessage(actionError instanceof Error ? actionError.message : "Failed to remove RERA registration");
    } finally {
      setRegistrationActionKey(null);
    }
  }

  const topbarControls = useMemo(
    () => (
      <button
        className="button button-primary"
        disabled={!sessionToken || savingComplianceSettings}
        form="workspace-compliance-settings-form"
        type="submit"
      >
        {savingComplianceSettings ? "Saving..." : "Save settings"}
      </button>
    ),
    [savingComplianceSettings, sessionToken]
  );

  useRegisterTopbarControls(topbarControls);

  return (
    <section className="workspace-admin-team-page">
      <form className="workspace-admin-compliance-card" id="workspace-compliance-settings-form" onSubmit={handleSaveComplianceSettings}>
        <div className="workspace-admin-compliance-header">
          <div>
            <span className="workspace-admin-action-kicker">RERA compliance block</span>
            <strong>Workspace defaults</strong>
            <p>These defaults control the shared label, website, and text color used when a project registration is inserted.</p>
          </div>
          {loadingReraPreview ? (
            <div className="settings-note workspace-admin-compliance-status">
              <span>Loading project preview...</span>
            </div>
          ) : reraPreviewError ? (
            <div className="settings-note workspace-admin-compliance-status">
              <span>{reraPreviewError}</span>
            </div>
          ) : reraPreviewOptions.length > 0 ? (
            <div className="workspace-admin-compliance-preview-wrap">
              <label className="field-label workspace-admin-compliance-selector">
                Preview project
                <select value={selectedReraRegistrationId} onChange={(event) => setSelectedReraRegistrationId(event.target.value)}>
                  {reraPreviewOptions.map((option) => (
                    <option key={option.registration.id} value={option.registration.id}>
                      {option.projectName} - {option.registration.registrationNumber ?? option.registration.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="workspace-admin-compliance-preview" aria-label="RERA compliance preview">
                <span style={{ color: reraTextColor || "#111111" }}>{reraAuthorityLabel || "MahaRERA"}</span>
                <strong style={{ color: reraTextColor || "#111111" }}>{previewReraNumber}</strong>
                <small style={{ color: reraTextColor || "#111111" }}>{reraWebsiteUrl || "https://maharera.maharashtra.gov.in"}</small>
                {selectedQrUrl ? <img alt={selectedReraPreview?.qrAsset?.label ?? "RERA QR"} src={selectedQrUrl} /> : <i aria-hidden="true" />}
              </div>
            </div>
          ) : (
            <div className="settings-note workspace-admin-compliance-status">
              <span>No project RERA QR found yet. Upload one from Library / Media / RERA QR to preview it here.</span>
            </div>
          )}
        </div>
        <div className="planner-form-grid workspace-admin-compliance-fields">
          <label className="field-label">
            Authority label
            <input
              value={reraAuthorityLabel}
              onChange={(event) => setReraAuthorityLabel(event.target.value)}
              placeholder="MahaRERA"
            />
          </label>
          <label className="field-label">
            Website URL
            <input
              required
              type="url"
              value={reraWebsiteUrl}
              onChange={(event) => setReraWebsiteUrl(event.target.value)}
              placeholder="https://maharera.maharashtra.gov.in"
            />
          </label>
          <label className="field-label workspace-admin-compliance-color-field">
            Text color
            <div className="workspace-admin-color-input">
              <input
                aria-label="RERA text color"
                onChange={(event) => setReraTextColor(event.target.value)}
                type="color"
                value={reraTextColor}
              />
              <input
                onChange={(event) => setReraTextColor(event.target.value.startsWith("#") ? event.target.value : `#${event.target.value}`)}
                pattern="^#?[0-9A-Fa-f]{6}$"
                placeholder="#111111"
                value={reraTextColor}
              />
            </div>
          </label>
        </div>
      </form>
      <section className="workspace-admin-rera-registry">
        <div className="workspace-admin-rera-registry-header">
          <div>
            <span className="workspace-admin-action-kicker">Project registrations</span>
            <strong>Manage project RERA number and QR mappings</strong>
            <p>Each project can keep multiple registrations. Pick the default one used in scoped generation flows and update the mapped QR here.</p>
          </div>
        </div>
        {loadingReraPreview ? (
          <div className="empty-state">
            <strong>Loading registrations…</strong>
          </div>
        ) : reraRegistrationGroups.length === 0 ? (
          <div className="empty-state">
            <strong>No RERA registrations yet</strong>
            <p>Upload project-linked RERA QR assets from Library / Media to create registrations.</p>
          </div>
        ) : (
          <div className="workspace-admin-rera-group-list">
            {reraRegistrationGroups.map((group) => (
              <section className="workspace-admin-rera-group" key={group.key}>
                <div className="workspace-admin-rera-group-header">
                  <strong>{group.name}</strong>
                  <span className="pill">{group.registrations.length} registrations</span>
                </div>
                <div className="workspace-admin-rera-card-grid">
                  {group.registrations.map((option) => {
                    const saveKey = `registration:${option.registration.id}:save`;
                    const defaultKey = `registration:${option.registration.id}:default`;
                    const deleteKey = `registration:${option.registration.id}:delete`;
                    const busy = registrationActionKey === saveKey || registrationActionKey === defaultKey || registrationActionKey === deleteKey;

                    return (
                      <article className="workspace-admin-rera-card" key={option.registration.id}>
                        <div className="workspace-admin-rera-card-top">
                          <div className="workspace-admin-rera-card-copy">
                            <strong>{option.registration.label}</strong>
                            <span>{option.registration.registrationNumber ?? "No number set"}</span>
                          </div>
                          <div className="workspace-admin-rera-card-badges">
                            {option.registration.isDefault ? <span className="pill">Default</span> : null}
                            {option.registration.projectId ? <span className="pill pill-muted">Project</span> : <span className="pill pill-muted">General</span>}
                          </div>
                        </div>
                        <div className="workspace-admin-rera-card-meta">
                          <span>{option.qrAsset ? option.qrAsset.label : "No QR linked"}</span>
                          <span>{option.registration.projectId ? "Project-linked" : "General registration"}</span>
                        </div>
                        <div className="workspace-admin-rera-card-actions">
                          <button className="button button-secondary" onClick={() => startEditingRegistration(option)} type="button">
                            Edit
                          </button>
                          <button
                            className="button button-ghost"
                            disabled={busy || option.registration.isDefault || !option.registration.projectId}
                            onClick={() => void handleSetDefaultRegistration(option.registration)}
                            type="button"
                          >
                            {registrationActionKey === defaultKey ? "Saving..." : "Make default"}
                          </button>
                          <button
                            className="button button-ghost button-danger"
                            disabled={busy}
                            onClick={() => void handleDeleteRegistration(option.registration)}
                            type="button"
                          >
                            {registrationActionKey === deleteKey ? "Removing..." : "Remove"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
      {editingRegistration ? (
        <div className="drawer-overlay" onClick={closeRegistrationEditor}>
          <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <span className="workspace-admin-action-kicker">Edit registration</span>
                <h2>{editingRegistration.projectName}</h2>
              </div>
              <button className="drawer-close" onClick={closeRegistrationEditor} type="button">
                ×
              </button>
            </div>
            <div className="drawer-body">
              <div className="drawer-form">
                <label className="field-label">
                  Label
                  <input onChange={(event) => setEditingRegistrationLabel(event.target.value)} value={editingRegistrationLabel} />
                </label>
                <label className="field-label">
                  Registration number
                  <input onChange={(event) => setEditingRegistrationNumber(event.target.value)} placeholder="P52100012345" value={editingRegistrationNumber} />
                </label>
                <label className="field-label">
                  QR asset
                  <select onChange={(event) => setEditingRegistrationQrAssetId(event.target.value)} value={editingRegistrationQrAssetId}>
                    <option value="">No QR selected</option>
                    {editableQrAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.label}{asset.projectId ? "" : " (general)"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="drawer-footer">
              <button className="button button-ghost" onClick={closeRegistrationEditor} type="button">
                Cancel
              </button>
              <button
                className="button button-primary"
                disabled={registrationActionKey === `registration:${editingRegistration.registration.id}:save`}
                onClick={() => void handleSaveRegistration()}
                type="button"
              >
                {registrationActionKey === `registration:${editingRegistration.registration.id}:save` ? "Saving..." : "Save registration"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

  const topbarControls = useMemo(
    () => (
      <div className="settings-window-actions">
        <span className="pill">{workspaceMembers.length} users</span>
        {isWorkspaceAdmin ? (
          <button className="button button-primary" onClick={() => setIsInviteDrawerOpen(true)} type="button">
            Add employee
          </button>
        ) : null}
      </div>
    ),
    [isWorkspaceAdmin, workspaceMembers.length]
  );

  useRegisterTopbarControls(topbarControls);

  return (
    <section className="workspace-admin-team-page">
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

  const topbarControls = useMemo(
    () => (
      <div className="settings-window-actions">
        <span className="pill">{postingWindows.length} slots</span>
        <button className="button button-primary" disabled={!activeBrandId || saving} onClick={openCreateDrawer} type="button">
          {saving ? "Saving…" : "New slot"}
        </button>
      </div>
    ),
    [activeBrandId, postingWindows.length, saving]
  );

  useRegisterTopbarControls(topbarControls);

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
    <section className="workspace-admin-team-page">
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
