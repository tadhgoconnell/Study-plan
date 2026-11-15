"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { Logo } from "@/components/shell";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const body = await res.json();
      if (body.ok) window.location.href = "/dashboard";
      else setError(body.error ?? "That did not work.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <form onSubmit={submit} className="clay animate-pop w-full max-w-sm p-7">
        <Logo />
        <h1 className="mt-6 flex items-center gap-2 text-2xl"><Lock size={22} strokeWidth={2.8} /> Enter your password</h1>
        <p className="mt-1 text-sm text-ink-soft">This planner is private.</p>
        <Field label="Password" className="mt-5"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required autoComplete="current-password" /></Field>
        {error && <p role="alert" className="mt-3 rounded-2xl bg-coral-soft px-3 py-2 text-sm font-bold text-bad">{error}</p>}
        <Button variant="primary" type="submit" className="mt-5 w-full" disabled={busy}>Open my planner</Button>
      </form>
    </main>
  );
}
