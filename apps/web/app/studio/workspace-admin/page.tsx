"use client";

import Link from "next/link";
import { useMemo } from "react";
import { WorkspaceAdminOverviewPanel } from "./shared";
import { useRegisterTopbarActions } from "../topbar-actions-context";

export default function WorkspaceAdminPage() {
  const topbarActions = useMemo(
    () => (
      <Link className="button button-primary" href="/studio/workspace-admin/team" prefetch={false}>
        Manage team
      </Link>
    ),
    []
  );

  useRegisterTopbarActions(topbarActions);

  return <WorkspaceAdminOverviewPanel />;
}
