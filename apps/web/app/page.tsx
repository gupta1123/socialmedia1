import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Brand-aware image generation</p>
          <h1>Creative ops without the prompt-box ceiling.</h1>
          <p className="lede">
            Build seeds, finals, and brand-specific references in one control room. The system keeps
            track of the brief, brand, references, prompt package, model, and feedback trail.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/login">
              Enter Studio
            </Link>
            <Link className="button button-ghost" href="/studio">
              View Workspace
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

