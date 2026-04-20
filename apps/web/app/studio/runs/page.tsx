"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CreativeRunSummary } from "@image-lab/contracts";
import { getCreativeRuns } from "../../../lib/api";
import { formatDisplayDate } from "../../../lib/formatters";
import { DataTable } from "../data-table";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions } from "../topbar-actions-context";
import { PlacementIcons } from "../placement-icons";

export default function RunsPage() {
  const { sessionToken, activeBrandId } = useStudio();
  const [runs, setRuns] = useState<CreativeRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const topbarActions = useMemo(
    () => <Link className="button button-primary" href="/studio/create">Start a run</Link>,
    []
  );

  useRegisterTopbarActions(topbarActions);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const records = await getCreativeRuns(sessionToken);
        if (!cancelled) {
          setRuns(records);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load runs");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  const visibleRuns = useMemo(
    () => (activeBrandId ? runs.filter((run) => run.brandId === activeBrandId) : runs),
    [activeBrandId, runs]
  );
  
  const tableColumns = useMemo(
    () => [
      {
        id: "run",
        header: "Run",
        sortValue: (run: CreativeRunSummary) => run.promptSummary,
        cell: (run: CreativeRunSummary) => (
          <div className="data-table-primary">
            <strong className="data-table-title">
              {run.promptSummary.length > 90 ? run.promptSummary.slice(0, 87) + "..." : run.promptSummary}
            </strong>
             <span className="data-table-subtitle">{run.brandName}</span>
          </div>
        )
      },
      {
        id: "placement",
        header: "Placement",
        cell: (run: CreativeRunSummary) => <PlacementIcons channel={run.channel} format={run.format} />
      },
      {
        id: "stats",
        header: "Stats",
        cell: (run: CreativeRunSummary) => (
          <div className="data-table-primary">
            <span className="data-table-subtitle">{run.optionCount} options</span>
            <span className="data-table-subtitle">{run.finalOutputCount} finals</span>
          </div>
        )
      },
      {
        id: "status",
        header: "Status",
        sortValue: (run: CreativeRunSummary) => run.status,
        cell: (run: CreativeRunSummary) => (
          <span className={`planner-status planner-status-${run.status}`}>{run.status}</span>
        )
      },
      {
        id: "created",
        header: "Created",
        sortValue: (run: CreativeRunSummary) => run.createdAt,
        cell: (run: CreativeRunSummary) => <span>{formatDisplayDate(run.createdAt)}</span>
      }
    ],
    []
  );

  if (error) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Runs</p>
          <h3>Unable to load runs</h3>
          <p>{error}</p>
        </article>
      </div>
    );
  }

  return (
    <div className="page-stack runs-page">
      <section className="page-grid">
        <article className="panel page-span-12">
          <div className="panel-header">
            <div>
              <h3>Creative history</h3>
            </div>
            <span className="panel-count">{visibleRuns.length} runs</span>
          </div>

          <DataTable
            columns={tableColumns}
            defaultSort={{ columnId: "created", direction: "desc" }}
            emptyAction={
              <Link className="button button-primary" href="/studio/create">
                Start first run
              </Link>
            }
            emptyBody="Create a brief to start the first creative run for this brand."
            emptyTitle="No runs yet"
            filters={[
              {
                id: "status",
                label: "Status",
                options: [
                  { label: "Active", value: "active" },
                  { label: "Completed", value: "completed" },
                  { label: "Draft", value: "draft" }
                ],
                getValue: (run) => run.status
              }
            ]}
            loading={loading}
            rowHref={(run) => `/studio/runs/${run.id}`}
            rowKey={(run) => run.id}
            rows={visibleRuns}
            search={{
              placeholder: "Search summaries, brands and placements",
              getText: (run) => [run.promptSummary, run.brandName, run.channel].filter(Boolean).join(" ")
            }}
          />
        </article>
      </section>
    </div>
  );
}
