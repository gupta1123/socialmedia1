"use client";

import { useStudio } from "../studio-context";

export default function WorkspaceAdminLayout({ children }: { children: React.ReactNode }) {
  const { loading, bootstrap } = useStudio();
  const workspaceRole = bootstrap?.workspace?.role ?? null;
  const isWorkspaceAdmin = workspaceRole === "owner" || workspaceRole === "admin";

  if (loading) {
    return (
      <div className="page-stack">
        <section className="panel settings-panel">
          <div className="empty-state empty-state-tall">
            <strong>Loading settings…</strong>
          </div>
        </section>
      </div>
    );
  }

  if (!isWorkspaceAdmin) {
    return (
      <div className="page-stack">
        <section className="panel settings-panel">
          <div className="empty-state empty-state-tall">
            <strong>Settings access required</strong>
            <p>Only owner and admin roles can open this area.</p>
          </div>
        </section>
      </div>
    );
  }

  return <div className="page-stack">{children}</div>;
}
