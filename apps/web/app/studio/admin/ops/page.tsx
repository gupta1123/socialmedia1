"use client";

import { useEffect, useState } from "react";
import type { AdminOpsSummary } from "@image-lab/contracts";
import { getSuperAdminOps } from "../../../../lib/api";
import { useStudio } from "../../studio-context";

export default function SuperAdminOpsPage() {
  const { sessionToken } = useStudio();
  const [ops, setOps] = useState<AdminOpsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken) {
      setOps(null);
      setLoading(false);
      return;
    }

    const token = sessionToken;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const response = await getSuperAdminOps(token);
        if (!cancelled) {
          setOps(response);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load operations summary");
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

  return (
    <section className="panel settings-panel">
      <div className="settings-panel-header">
        <div>
          <p className="panel-label">Operations</p>
          <h3>Queue and job health</h3>
        </div>
      </div>

      {loading ? (
        <div className="empty-state empty-state-tall">
          <strong>Loading operations…</strong>
        </div>
      ) : error ? (
        <div className="empty-state empty-state-tall">
          <strong>Unable to load operations</strong>
          <p>{error}</p>
        </div>
      ) : !ops ? (
        <div className="empty-state">
          <strong>No operations data found</strong>
        </div>
      ) : (
        <>
          <div className="settings-window-list">
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Queued jobs</strong>
                <span>Waiting to be picked up</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{ops.metrics.queuedJobs}</span>
              </div>
            </article>
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Processing jobs</strong>
                <span>Running currently</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{ops.metrics.processingJobs}</span>
              </div>
            </article>
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Failed jobs (24h)</strong>
                <span>Recent generation/edit failures</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{ops.metrics.failedJobsLast24h}</span>
              </div>
            </article>
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Completed jobs (24h)</strong>
                <span>Recently completed successfully</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{ops.metrics.completedJobsLast24h}</span>
              </div>
            </article>
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Pending review outputs</strong>
                <span>Outputs waiting for human review</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{ops.metrics.pendingReviewOutputs}</span>
              </div>
            </article>
            <article className="settings-window-row">
              <div className="settings-window-copy">
                <strong>Reserved credit transactions</strong>
                <span>Held credits not settled yet</span>
              </div>
              <div className="settings-window-actions">
                <span className="pill">{ops.metrics.reservedCreditTransactions}</span>
              </div>
            </article>
          </div>

          <div className="settings-window-list">
            {ops.stuckJobs.map((job) => (
              <article className="settings-window-row" key={job.id}>
                <div className="settings-window-copy">
                  <strong>Stuck job: {job.jobType}</strong>
                  <span>Workspace: {job.workspaceId}</span>
                  <span>Age: {job.ageMinutes} min</span>
                </div>
                <div className="settings-window-actions">
                  <span className="pill">{job.status}</span>
                </div>
              </article>
            ))}
            {ops.stuckJobs.length === 0 ? (
              <div className="empty-state">
                <strong>No stuck jobs detected</strong>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
