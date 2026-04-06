"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { HomeOverview } from "@image-lab/contracts";
import { getHomeOverview } from "../../lib/api";
import { formatDisplayDateTime } from "../../lib/formatters";
import { useStudio } from "./studio-context";
import { useRegisterTopbarActions } from "./topbar-actions-context";

const EMPTY_OVERVIEW: HomeOverview = {
  dueToday: { count: 0, items: [] },
  needsReview: { count: 0, items: [] },
  approvedNotScheduled: { count: 0, items: [] },
  thisWeek: { count: 0, items: [] },
  blocked: { count: 0, items: [] }
};

export default function StudioHomePage() {
  const { sessionToken, activeBrandId, activeBrand } = useStudio();
  const [overview, setOverview] = useState<HomeOverview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const topbarActions = useMemo(
    () => (
      <>
        <Link className="button button-ghost" href="/studio/plan">Open plan</Link>
        <Link className="button button-primary" href="/studio/queue?scope=my">Start with my queue</Link>
      </>
    ),
    []
  );

  useRegisterTopbarActions(topbarActions);

  useEffect(() => {
    if (!sessionToken) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getHomeOverview(sessionToken, activeBrandId ?? undefined)
      .then((data) => {
        if (!cancelled) {
          setOverview(data);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load home");
          setOverview(EMPTY_OVERVIEW);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeBrandId, sessionToken]);

  const sections = [
    {
      key: "dueToday",
      label: "Due today",
      count: overview.dueToday.count,
      items: overview.dueToday.items,
      href: "/studio/queue?dueWindow=today",
      theme: "urgent",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      )
    },
    {
      key: "needsReview",
      label: "Needs review",
      count: overview.needsReview.count,
      items: overview.needsReview.items,
      href: "/studio/review",
      theme: "review",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
      )
    },
    {
      key: "approvedNotScheduled",
      label: "Ready to schedule",
      count: overview.approvedNotScheduled.count,
      items: overview.approvedNotScheduled.items,
      href: "/studio/queue?statusGroup=ready_to_ship",
      theme: "ready",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
        </svg>
      )
    },
    {
      key: "thisWeek",
      label: "This week",
      count: overview.thisWeek.count,
      items: overview.thisWeek.items,
      href: "/studio/calendar",
      theme: "upcoming",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      )
    },
    {
      key: "blocked",
      label: "Blocked",
      count: overview.blocked.count,
      items: overview.blocked.items,
      href: "/studio/queue?statusGroup=blocked",
      theme: "blocked",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
      )
    }
  ] as const;

  return (
    <div className="page-stack">
      <section className="work-home-hero">
        <div className="work-home-copy">
          <p className="panel-label">Dashboard</p>
          <h2>{activeBrand ? `${activeBrand.name} Social Ops` : "Social Operations"}</h2>
          <p>
            An overview of active deliverables, planning status, and scheduling backlog across your team.
          </p>
          <div className="work-home-actions">
            <Link className="button button-primary" href="/studio/queue?scope=my">Start with my queue</Link>
            <Link className="button button-ghost" href="/studio/plan">Open plan</Link>
          </div>
        </div>
        <div className="work-home-signal">
          {sections.slice(0, 4).map((section) => (
            <Link className={`work-signal-card is-${section.theme}`} href={section.href} key={section.key}>
              <div className="work-signal-head">
                <span>{section.label}</span>
                {section.icon}
              </div>
              <strong>{section.count}</strong>
            </Link>
          ))}
        </div>
      </section>

      {error ? (
        <div className="status-banner">
          <span>{error}</span>
        </div>
      ) : null}

      <section className="work-summary-grid">
        {sections.map((section) => (
          <article className="panel work-summary-panel" key={section.key}>
            <div className="panel-header">
              <div>
                <p className="panel-label">{section.label}</p>
                <h3>{section.count}</h3>
              </div>
              <Link className="panel-link" href={section.href}>
                See all
              </Link>
            </div>

            {loading ? (
              <div className="empty-state compact">
                <strong>Loading</strong>
                <p>Pulling the latest team view.</p>
              </div>
            ) : section.items.length > 0 ? (
              <div className="work-list">
                {section.items.map((item) => (
                  <Link className="work-list-row" href={`/studio/deliverables/${item.id}`} key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{formatDisplayDateTime(item.dueAt ?? item.scheduledFor)}</p>
                    </div>
                    <span className={`pill pill-${item.status}`}>{item.status.replace("_", " ")}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty-state compact">
                <strong>Nothing waiting here</strong>
                <p>This lane is clear right now.</p>
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
