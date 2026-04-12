"use client";

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

      router.replace("/login");
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
          <h1>Redirecting to sign in…</h1>
        </div>
      </section>
    </main>
  );
}
