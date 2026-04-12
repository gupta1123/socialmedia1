"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-browser";

// Real-estate Unsplash images
const POLAROIDS = [
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&q=80&w=400",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=400",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=400",
];

type Phase = "typing" | "flash" | "polaroids" | "publish" | "fadeout";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // ── Animation states ────────────────────────────────────────────────────────
  const [promptText, setPromptText] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");
  const [pol1, setPol1] = useState(false);
  const [pol2, setPol2] = useState(false);
  const [pol3, setPol3] = useState(false);
  const [nodesActive, setNodesActive] = useState(false);

  const FULL_PROMPT =
    "\"Golden-hour luxury penthouse exterior, Mumbai skyline, editorial photography\"";

  // ── Typing effect ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "typing") return;
    if (promptText.length < FULL_PROMPT.length) {
      const t = setTimeout(
        () => setPromptText(FULL_PROMPT.slice(0, promptText.length + 1)),
        18
      );
      return () => clearTimeout(t);
    }
    // Done typing — wait 700ms then flash
    const t = setTimeout(() => setPhase("flash"), 700);
    return () => clearTimeout(t);
  }, [phase, promptText]);

  // ── Flash → polaroids ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "flash") return;
    const t = setTimeout(() => setPhase("polaroids"), 160);
    return () => clearTimeout(t);
  }, [phase]);

  // ── Polaroids shuffle ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "polaroids") return;
    setPol1(false); setPol2(false); setPol3(false); setNodesActive(false);
    // stagger them in
    const t1 = setTimeout(() => setPol1(true), 80);
    const t2 = setTimeout(() => setPol2(true), 200);
    const t3 = setTimeout(() => setPol3(true), 340);
    const t4 = setTimeout(() => setNodesActive(true), 720);
    // after hold, fade out and reset
    const t5 = setTimeout(() => setPhase("fadeout"), 4200);
    return () => { [t1,t2,t3,t4,t5].forEach(clearTimeout); };
  }, [phase]);

  // ── Fade out → reset ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "fadeout") return;
    setPol1(false); setPol2(false); setPol3(false); setNodesActive(false);
    const t = setTimeout(() => {
      setPromptText("");
      setPhase("typing");
    }, 500);
    return () => clearTimeout(t);
  }, [phase]);

  // ── Form submit ────────────────────────────────────────────────────────────
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace("/studio");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setPending(false);
    }
  }

  const showPrompt   = phase === "typing" || phase === "flash";
  const showPolaroid = phase === "polaroids" || phase === "publish" || phase === "fadeout";

  return (
    <main className="auth-shell">
      {/* ─── LEFT VISUAL PANEL ─────────────────────────────────────────────── */}
      <section className="auth-showcase" aria-hidden="true">

        {/* Brand */}
        <div className="auth-showcase-brand">
          <div className="auth-logo-mark" />
          <span style={{ fontSize: "1.1rem" }}>Briefly Social.</span>
        </div>

        {/* ── Demo canvas ─────────────────────────────────────────────────── */}
        <div className="auth-studio-demo">

          {/* Flash overlay */}
          <div className={`auth-flash ${phase === "flash" ? "is-flashing" : ""}`} />

          {/* Scene 1 — Prompt box */}
          {showPrompt && (
            <div
              className="auth-prompt-box"
              style={{
                opacity: phase === "flash" ? 0 : 1,
                transform: phase === "flash" ? "translateY(-16px)" : "none",
                transition: "opacity 200ms ease, transform 200ms ease",
              }}
            >
              <div className="auth-prompt-dots">
                <span /><span /><span />
              </div>
              <div className="auth-prompt-label">CONTENT_BRIEF / REAL_ESTATE</div>
              <div className="auth-prompt-text">
                <span className="auth-prompt-cmd">&gt; </span>
                {promptText}
                <span className="auth-cursor" />
              </div>
            </div>
          )}

          {/* Scene 2 — Polaroid stage */}
          <div className={`auth-polaroid-stage ${showPolaroid ? "is-visible" : ""}`}>

            <div className={`auth-polaroid ${pol1 ? "is-in-1" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={POLAROIDS[0]} alt="" />
            </div>

            <div className={`auth-polaroid ${pol2 ? "is-in-2" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={POLAROIDS[1]} alt="" />
            </div>

            <div className={`auth-polaroid ${pol3 ? "is-in-3" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={POLAROIDS[2]} alt="" />
            </div>

            {/* Publish nodes */}
            <div className="auth-pub-nodes">
              {/* Instagram */}
              <div className={`auth-pub-node ${nodesActive ? "is-active" : ""}`}>
                <div className="auth-pub-icon">
                  <svg width="18" height="18" fill="#E1306C" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                  </svg>
                </div>
                <span className="auth-pub-label">Live</span>
              </div>

              {/* X / Twitter */}
              <div className={`auth-pub-node ${nodesActive ? "is-active" : ""}`}>
                <div className="auth-pub-icon">
                  <svg width="15" height="15" fill="#000" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 5.96H5.078z"/>
                  </svg>
                </div>
                <span className="auth-pub-label">Live</span>
              </div>

              {/* Facebook */}
              <div className={`auth-pub-node ${nodesActive ? "is-active" : ""}`}>
                <div className="auth-pub-icon">
                  <svg width="18" height="18" fill="#1877F2" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </div>
                <span className="auth-pub-label">Live</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="auth-showcase-copy">
          <h2 style={{ fontSize: "2.2rem" }}>
            Create. Review.<br />
            <span style={{ color: "#d9a45f" }}>Publish everything.</span>
          </h2>
          <p style={{ fontSize: "0.82rem", opacity: 0.5 }}>
            The specialized studio for real-estate content workflows.
          </p>
        </div>
      </section>

      {/* ─── RIGHT LOGIN PANEL ─────────────────────────────────────────────── */}
      <section className="auth-login-panel">
        <div className="auth-status-line">
          <span />
          Workspace active
        </div>

        {/* Card + footer grouped so they move as one centered block */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "24px", width: "100%" }}>
          <section className="auth-card auth-access-card">

            <div className="auth-card-header">
              <h1 style={{ marginBottom: "4px" }}>Workspace.</h1>
              <p>Access your AI content studio and scheduling suite.</p>
            </div>

            <form className="stack-form auth-form" onSubmit={onSubmit}>
              <label className="field-label auth-field-label">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", opacity: 0.5 }}>
                  WORKSPACE EMAIL
                </span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                  placeholder="name@company.com"
                />
              </label>

              <label className="field-label auth-field-label">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", opacity: 0.5 }}>
                    SECURITY KEY
                  </span>
                  <a
                    href="#"
                    style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 700, color: "#d9a45f", letterSpacing: "0.06em" }}
                  >
                    FORGOT?
                  </a>
                </div>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  minLength={6}
                  required
                  placeholder="••••••••"
                />
              </label>

              <button className="button button-primary auth-submit-button" disabled={pending} type="submit">
                {pending ? "Launching..." : "Enter Studio"}
              </button>
            </form>

            {message && (
              <p className="status status-error auth-error" style={{ fontSize: "12px" }}>
                {message}
              </p>
            )}
          </section>

          <div style={{ display: "flex", gap: "20px" }}>
            <a href="#" style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Legal</a>
            <a href="#" style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Privacy</a>
          </div>
        </div>
      </section>

    </main>
  );
}
