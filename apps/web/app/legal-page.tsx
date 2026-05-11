import Link from "next/link";
import type { ReactNode } from "react";

type LegalPageProps = {
  eyebrow: string;
  title: string;
  updated: string;
  intro: string;
  children: ReactNode;
};

export function LegalPage({ eyebrow, title, updated, intro, children }: LegalPageProps) {
  return (
    <main className="legal-shell">
      <nav className="legal-nav" aria-label="Legal pages">
        <Link className="legal-brand" href="/">
          Briefly Social
        </Link>
        <div className="legal-links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/data-deletion">Data deletion</Link>
        </div>
      </nav>

      <article className="legal-card">
        <header className="legal-header">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="legal-updated">Effective date: {updated}</p>
          <p className="legal-intro">{intro}</p>
        </header>

        <div className="legal-body">{children}</div>
      </article>
    </main>
  );
}
