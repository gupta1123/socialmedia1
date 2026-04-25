"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStudio } from "../studio-context";

export default function WorkspaceAdminPage() {
  const router = useRouter();
  const { loading, bootstrap } = useStudio();
  const isPlatformAdmin = bootstrap?.viewer.isPlatformAdmin === true;

  useEffect(() => {
    if (loading) {
      return;
    }
    router.replace(isPlatformAdmin ? "/studio/workspace-admin/team" : "/studio/workspace-admin/compliance");
  }, [isPlatformAdmin, loading, router]);

  return null;
}
