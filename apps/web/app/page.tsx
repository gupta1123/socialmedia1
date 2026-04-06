"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase-browser";

export default function HomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;

      if (data.session) {
        router.replace("/studio");
        return;
      }

      setReady(true);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace("/studio");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (!ready) {
    return (
      <main className="shell">
        <section className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Briefly Social</p>
            <h1>Loading workspace…</h1>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Briefly Social</p>
          <h1>Creative ops without the prompt-box ceiling.</h1>
          <p className="lede">
            Build seeds, finals, and brand-specific references in one control room. The system keeps
            track of the brief, brand, references, prompt package, model, and feedback trail.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/login">
              Enter Briefly Social
            </Link>
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-chip">Workflow</div>
          <ol className="timeline">
            <li>Load brand profile and references.</li>
            <li>Compile a model-ready prompt package.</li>
            <li>Generate style seeds.</li>
            <li>Pick a seed or use uploaded references.</li>
            <li>Generate finals and capture verdicts.</li>
          </ol>
        </div>
      </section>
    </main>
  );
}
