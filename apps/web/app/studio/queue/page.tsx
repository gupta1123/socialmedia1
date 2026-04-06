"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { QueueEntry } from "@image-lab/contracts";
import { getQueue } from "../../../lib/api";
import { deriveCreativeFormatFromDeliverable } from "../../../lib/deliverable-helpers";
import { formatDisplayDateTime } from "../../../lib/formatters";
import { getQueueNextActionHref } from "../../../lib/workflow";
import { DataTable } from "../data-table";
import { PlacementIcons } from "../placement-icons";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions } from "../topbar-actions-context";

const SCOPES = [
  { id: "my", label: "My queue" },
  { id: "team", label: "Team queue" },
  { id: "unassigned", label: "Unassigned" }
] as const;

export default function QueuePage() {
  const searchParams = useSearchParams();
  const { sessionToken, activeBrandId } = useStudio();
  const initialScope = (searchParams.get("scope") as (typeof SCOPES)[number]["id"] | null) ?? "my";
  const [scope, setScope] = useState<(typeof SCOPES)[number]["id"]>(initialScope);
  const [rows, setRows] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const statusGroup = searchParams.get("statusGroup") as "todo" | "in_progress" | "ready_to_ship" | "done" | "blocked" | null;
  const planningMode = searchParams.get("planningMode") as "campaign" | "series" | "one_off" | "always_on" | "ad_hoc" | null;
  const dueWindow = searchParams.get("dueWindow") as "today" | "week" | "overdue" | null;

  const topbarActions = useMemo(
    () => (
      <>
        <Link className="button button-ghost" href="/studio/plan">Open plan</Link>
        <Link className="button button-primary" href="/studio/deliverables?new=1&planningMode=one_off">New one-off post task</Link>
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

    getQueue(sessionToken, {
      scope,
      ...(statusGroup ? { statusGroup } : {}),
      ...(planningMode ? { planningMode } : {}),
      ...(dueWindow ? { dueWindow } : {}),
      ...(activeBrandId ? { brandId: activeBrandId } : {})
    })
      .then((data) => {
        if (!cancelled) {
          setRows(data);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load queue");
          setRows([]);
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
  }, [activeBrandId, dueWindow, planningMode, scope, sessionToken, statusGroup]);

  const columns = useMemo(
    () => [
      {
        id: "task",
        header: "Post task",
        cell: (row: QueueEntry) => (
          <div className="table-primary-cell">
            <strong>{row.deliverable.title}</strong>
            <p>{row.projectName ?? "No project"}{row.series ? ` · ${row.series.name}` : row.campaign ? ` · ${row.campaign.name}` : ""}</p>
          </div>
        ),
        sortValue: (row: QueueEntry) => row.deliverable.title
      },
      {
        id: "assignee",
        header: "Assignee",
        cell: (row: QueueEntry) => row.assignee?.displayName || row.assignee?.email || "Unassigned",
        sortValue: (row: QueueEntry) => row.assignee?.displayName || row.assignee?.email || ""
      },
      {
        id: "placement",
        header: "Placement",
        cell: (row: QueueEntry) => (
          <PlacementIcons
            channel={row.deliverable.placementCode}
            compact
            format={deriveCreativeFormatFromDeliverable(
              row.deliverable.placementCode,
              row.deliverable.contentFormat,
              row.deliverable.sourceJson
            )}
            interactive={false}
          />
        ),
        sortValue: (row: QueueEntry) => row.deliverable.placementCode
      },
      {
        id: "due",
        header: "Due",
        cell: (row: QueueEntry) => formatDisplayDateTime(row.deliverable.dueAt ?? row.deliverable.scheduledFor),
        sortValue: (row: QueueEntry) => row.deliverable.dueAt ?? row.deliverable.scheduledFor
      },
      {
        id: "status",
        header: "Workflow",
        cell: (row: QueueEntry) => <span className={`pill pill-${row.deliverable.status}`}>{row.deliverable.status.replace("_", " ")}</span>,
        sortValue: (row: QueueEntry) => row.deliverable.status
      },
      {
        id: "action",
        header: "Next action",
        cell: (row: QueueEntry) => (
          <Link className="button button-ghost table-action-button" href={nextActionHref(row)}>
            {row.nextActionLabel}
          </Link>
        ),
        align: "end" as const
      }
    ],
    []
  );

  return (
    <div className="page-stack">
      <section className="queue-hero">
        <div className="queue-hero-content">
          <p className="panel-label">Work queue</p>
          <h2>Today's work queue</h2>
          <p>
            See who owns what, what is due next, and the next step for each post task.
          </p>
        </div>
        <div className="queue-scope-switch" role="tablist" aria-label="Queue scope">
          {SCOPES.map((item) => (
            <button
              className={`filter-chip ${scope === item.id ? "is-active" : ""}`}
              key={item.id}
              onClick={() => setScope(item.id)}
              type="button"
              role="tab"
              aria-selected={scope === item.id}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <div className="status-banner">
          <span>{error}</span>
        </div>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="panel-label">Queue</p>
            <h3>{scope === "my" ? "Assigned to you" : scope === "team" ? "Team queue" : "Unassigned work"}</h3>
          </div>
          <span className="panel-count">{rows.length} items</span>
        </div>

        {loading ? (
          <div className="empty-state compact">
            <strong>Loading</strong>
            <p>Building the current queue.</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            emptyAction={<Link className="button button-ghost" href="/studio/plan">Open plan</Link>}
            emptyBody="When post tasks are planned, approved, or scheduled, they will show up here."
            emptyTitle="Queue is clear"
            filters={[
              {
                id: "statusGroup",
                label: "Status",
                options: [
                  { label: "To do", value: "todo" },
                  { label: "In progress", value: "in_progress" },
                  { label: "Ready to schedule", value: "ready_to_ship" },
                  { label: "Blocked", value: "blocked" }
                ],
                getValue: (row) => row.statusGroup
              },
              {
                id: "planningMode",
                label: "Mode",
                options: [
                  { label: "Campaign", value: "campaign" },
                  { label: "Series", value: "series" },
                  { label: "One-off", value: "one_off" },
                  { label: "Always-on", value: "always_on" },
                  { label: "Ad hoc", value: "ad_hoc" }
                ],
                getValue: (row) => row.deliverable.planningMode
              }
            ]}
            initialPageSize={12}
            resultLabel={(showing, total) => `${showing} of ${total} post tasks`}
            rowHref={(row) => `/studio/deliverables/${row.deliverable.id}`}
            rowKey={(row) => row.deliverable.id}
            rows={rows}
            search={{
              placeholder: "Search post tasks, projects, assignees",
              getText: (row) =>
                [
                  row.deliverable.title,
                  row.projectName,
                  row.assignee?.displayName,
                  row.assignee?.email,
                  row.campaign?.name,
                  row.series?.name
                ]
                  .filter(Boolean)
                  .join(" ")
            }}
          />
        )}
      </section>
    </div>
  );
}

function nextActionHref(row: QueueEntry) {
  return getQueueNextActionHref(row.deliverable.id, row.deliverable.status);
}
