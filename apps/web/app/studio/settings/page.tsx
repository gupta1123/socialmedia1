"use client";

import { useEffect, useMemo, useState } from "react";
import type { CreativeChannel, PostingWindowRecord, WeekdayCode } from "@image-lab/contracts";
import {
  createPostingWindow,
  deletePostingWindow,
  getPostingWindows,
  updatePostingWindow
} from "../../../lib/api";
import {
  formatLocalTimeLabel,
  formatWeekdayLabel,
  weekdayOptions
} from "../../../lib/posting-windows";
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

    const brandId = activeBrandId!;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const records = await getPostingWindows(sessionToken as string, brandId as string);
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

  if (!activeBrandId && !loading) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Settings</p>
          <h3>Pick a brand first</h3>
          <p>Posting windows are saved per brand.</p>
        </article>
      </div>
    );
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
