import { useState, type FormEvent } from "react";
import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"request" | "update">(() => window.location.hash.includes("type=recovery") ? "update" : "request");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    if (mode === "request") {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      setBusy(false);
      if (resetError) setError(resetError.message); else setNotice("If an account exists for that email, a password-reset link has been sent.");
      return;
    }
    if (password.length < 12) { setBusy(false); setError("Use a password with at least 12 characters."); return; }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) setError(updateError.message); else setNotice("Password updated. You can now sign in with your new password.");
  }

  return <div className="auth-layout"><section className="auth-art"><Link to="/login" className="brand brand-light"><span className="brand-mark"><BookOpen size={19} /></span><span>elibrary<span className="brand-period">.</span></span></Link><div className="art-copy"><span className="eyebrow light-eyebrow">ACCOUNT SECURITY</span><h1>A fresh start.<br /><em>A secure account.</em></h1><p>Reset your Elibrary password securely.</p></div></section><section className="auth-panel"><div className="auth-form-wrap"><div className="mobile-brand"><BookOpen size={20} /> elibrary.</div><span className="eyebrow">PASSWORD HELP</span><h2>{mode === "request" ? "Reset your password" : "Choose a new password"}</h2><form className="form-stack" onSubmit={submit}>{mode === "request" ? <label>Email address<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label> : <label>New password<input required type="password" autoComplete="new-password" minLength={12} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 12 characters" /></label>}{error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}<button className="button button-primary button-full" disabled={busy}>{busy ? "Please wait…" : mode === "request" ? "Send reset link" : "Update password"}</button></form><p className="auth-switch"><Link to="/login">Back to sign in</Link> · <button className="inline-button" onClick={() => { setMode(mode === "request" ? "update" : "request"); setError(""); setNotice(""); }}>{mode === "request" ? "I have a reset link" : "Request another link"}</button></p></div></section></div>;
}
