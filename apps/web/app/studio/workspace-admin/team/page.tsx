"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceTeamManagementPanel } from "../shared";
import { useStudio } from "../../studio-context";

export default function WorkspaceAdminTeamPage() {
  const router = useRouter();
  const { loading, bootstrap } = useStudio();
  const isPlatformAdmin = bootstrap?.viewer.isPlatformAdmin === true;

  useEffect(() => {
    if (!loading && !isPlatformAdmin) {
      router.replace("/studio/workspace-admin/compliance");
    }
  }, [isPlatformAdmin, loading, router]);

  if (loading || !isPlatformAdmin) {
    return null;
  }

  return <WorkspaceTeamManagementPanel />;
}
