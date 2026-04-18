"use client";

import { useStudio } from "../studio-context";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { loading, bootstrap } = useStudio();
  const isPlatformAdmin = bootstrap?.viewer.isPlatformAdmin === true;

  if (loading) {
    return (
      <div className="page-stack">
        <section className="panel settings-panel">
          <div className="empty-state empty-state-tall">
            <strong>Loading admin tools…</strong>
          </div>
        </section>
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="page-stack">
        <section className="panel settings-panel">
          <div className="empty-state empty-state-tall">
            <strong>Super admin access required</strong>
            <p>This area is only available to platform super admins.</p>
          </div>
        </section>
      </div>
    );
  }

  return <>{children}</>;
}
