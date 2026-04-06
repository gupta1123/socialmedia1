"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace("/studio");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="shell auth-shell">
      <section className="auth-card">
        <h1>Sign in</h1>
        <p className="lede" style={{ marginTop: "8px", marginBottom: "28px" }}>
          Welcome back. Sign in to access your workspace.
        </p>

        <form className="stack-form" onSubmit={onSubmit}>
          <label className="field-label">
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="you@example.com" />
          </label>
          <label className="field-label">
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              minLength={6}
              required
              placeholder="••••••••"
            />
          </label>
          <button className="button button-primary" disabled={pending} type="submit" style={{ width: "100%", marginTop: "8px" }}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {message && <p className="status status-error" style={{ marginTop: "16px" }}>{message}</p>}
      </section>
    </main>
  );
}
