"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCreativeJob } from "../../../../lib/api";
import { useStudio } from "../../studio-context";

export default function LegacyJobRedirectPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const { sessionToken } = useStudio();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken || typeof params.jobId !== "string") {
      return;
    }

    let cancelled = false;

    const redirectToRun = async () => {
      try {
        const job = await getCreativeJob(sessionToken, params.jobId);
        if (!cancelled) {
          router.replace(`/studio/runs/${job.promptPackageId}`);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to locate this run");
        }
      }
    };

    void redirectToRun();

    return () => {
      cancelled = true;
    };
  }, [params.jobId, router, sessionToken]);

  return (
    <div className="page-stack">
      <article className="panel">
        <p className="panel-label">Redirecting</p>
        <h3>{error ? "Unable to open this run" : "Opening run detail…"}</h3>
        <p>{error ?? "Legacy job links now open the owning creative run."}</p>
      </article>
    </div>
  );
}
