"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CreativeOutputRecord, HomeOverview } from "@image-lab/contracts";
import { getHomeOverview } from "../../lib/api";
import { useStudio } from "./studio-context";
import { useRegisterTopbarActions } from "./topbar-actions-context";

const EMPTY_HOME_OVERVIEW: HomeOverview = {
  dueToday: { count: 0, items: [] },
  needsReview: { count: 0, items: [] },
  approvedNotScheduled: { count: 0, items: [] },
  thisWeek: { count: 0, items: [] },
  blocked: { count: 0, items: [] }
};

export default function StudioHomePage() {
  const { bootstrap, activeBrand, activeBrandId, recentOutputs, sessionToken, setMessage } = useStudio();
  const [overview, setOverview] = useState<HomeOverview>(EMPTY_HOME_OVERVIEW);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const userFirstName = bootstrap?.viewer.email?.split("@")[0] ?? "Creative";

  const topbarActions = useMemo(
    () => (
      <>
        <Link className="button button-ghost" href="/studio/calendar">View Calendar</Link>
        <Link className="button button-primary" href="/studio/create-v3">New Creation</Link>
      </>
    ),
    []
  );

  useRegisterTopbarActions(topbarActions);

  const brandName = activeBrand?.name ?? "your brand";
  const workspaceName = bootstrap?.workspace?.name ?? "Workspace";
  const approvedThisWeek = overview.thisWeek.count;
  const pendingReview = overview.needsReview.count;
  const dueToday = overview.dueToday.count;
  const blockedCount = overview.blocked.count;
  const recentActivity = useMemo(() => buildRecentGalleryItems(recentOutputs), [recentOutputs]);

  useEffect(() => {
    if (!sessionToken) return;

    let cancelled = false;
    setOverviewLoading(true);
    getHomeOverview(sessionToken, activeBrandId ?? undefined)
      .then((payload) => {
        if (!cancelled) setOverview(payload);
      })
      .catch((error) => {
        if (!cancelled) {
          setOverview(EMPTY_HOME_OVERVIEW);
          setMessage(error instanceof Error ? error.message : "Could not load home overview.");
        }
      })
      .finally(() => {
        if (!cancelled) setOverviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeBrandId, sessionToken, setMessage]);

  return (
    <div className="studio-home">
      <header className="studio-home-hero">
        <div className="home-hero-content">
          <h1>Good morning, {userFirstName.charAt(0).toUpperCase() + userFirstName.slice(1)}</h1>

        </div>
      </header>

      <section className="home-grid">
        <div className="home-main-stack">
          <div className="home-actions-grid">
            <Link href="/studio/create-v3" className="home-action-card is-primary">
              <div className="action-card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
              </div>
              <div className="action-card-body">
                <h3>Create Images</h3>
                <p>Generate grounded real-estate post options from a brief, project context, and selected assets.</p>
              </div>
              <div className="action-card-arrow">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </div>
            </Link>

            <Link href="/studio/ai-edit" className="home-action-card">
              <div className="action-card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="m16 5 3 3"/><path d="M8 16l8.5-8.5a2.12 2.12 0 1 1 3 3L11 19l-4 1 1-4Z"/></svg>
              </div>
              <div className="action-card-body">
                <h3>Visual Editor</h3>
                <p>Open a saved output and continue refining the image when the creative direction is close.</p>
              </div>
            </Link>

            <Link href="/studio/review" className="home-action-card">
              <div className="action-card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M3 9h18"/></svg>
              </div>
              <div className="action-card-body">
                <h3>Approval Queue</h3>
                <p>Check posts that need approval, changes, or a final publishing decision.</p>
              </div>
            </Link>
          </div>


        </div>

        <aside className="home-side-panel">
          <div className="home-stats-card">
            <div className="stats-header">
              <span>Workspace snapshot</span>
            </div>
            <div className="stats-body">
              <div className="stats-row">
                <span>Needs review</span>
                <strong>{overviewLoading ? "Loading" : `${pendingReview} ${pendingReview === 1 ? "item" : "items"}`}</strong>
              </div>
              <div className="stats-row">
                <span>Due today</span>
                <strong>{overviewLoading ? "Loading" : `${dueToday} ${dueToday === 1 ? "post" : "posts"}`}</strong>
              </div>
              <div className="stats-row">
                <span>Scheduled or published this week</span>
                <strong>{overviewLoading ? "Loading" : `${approvedThisWeek} ${approvedThisWeek === 1 ? "post" : "posts"}`}</strong>
              </div>
              <div className="stats-row">
                <span>Recent gallery outputs</span>
                <strong>{recentOutputs.length} {recentOutputs.length === 1 ? "output" : "outputs"}</strong>
              </div>
            </div>
          </div>

          <div className="home-tip-card">
            <div className="tip-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            </div>
            <strong>Grounded creation</strong>
            <p>
              The image generator works best when the brief names the post goal. Select a project or reference asset only when it should guide the output.
            </p>
          </div>
          {blockedCount > 0 ? (
            <Link className="home-alert-card" href="/studio/queue?statusGroup=blocked">
              <strong>{blockedCount} blocked {blockedCount === 1 ? "item" : "items"}</strong>
              <span>Review missing details before these can move forward.</span>
            </Link>
          ) : null}
        </aside>
      </section>
    </div>
  );
}

type ActivityItem = {
  id: string;
  href: string;
  title: string;
  meta: string;
  previewUrl: string | null;
  statusLabel: string;
  statusTone: "ready" | "default";
};

function buildRecentGalleryItems(outputs: CreativeOutputRecord[]): ActivityItem[] {
  const stripIds = outputs.slice(0, 5).map((o) => o.id).join(",");
  return outputs.slice(0, 5).map((output): ActivityItem => ({
    id: output.id,
    href: `/studio/outputs/${output.id}?from=gallery${stripIds ? `&stripIds=${encodeURIComponent(stripIds)}` : ""}`,
    title: output.previewContext?.projectName ?? output.previewContext?.postTypeName ?? `Generated output #${output.outputIndex + 1}`,
    meta: [
      "Generated",
      output.previewContext?.format ? formatLabel(output.previewContext.format) : null,
      output.createdAt ? formatRelativeDate(output.createdAt) : null
    ]
      .filter(Boolean)
      .join(" · "),
    previewUrl: output.thumbnailUrl ?? output.previewUrl ?? output.originalUrl ?? null,
    statusLabel: formatLabel(output.reviewState),
    statusTone: output.reviewState === "approved" ? "ready" : "default"
  }));
}

function formatLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  if (diffDays > 1 && diffDays < 7) return `in ${diffDays} days`;
  if (diffDays < -1 && diffDays > -7) return `${Math.abs(diffDays)} days ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
