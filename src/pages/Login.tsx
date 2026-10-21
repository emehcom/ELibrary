import { useState, type FormEvent } from "react";
import { BookOpen, Eye, EyeOff } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { isSupabaseConfigured } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const destination = (location.state as { from?: string } | null)?.from || "/books";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!isSupabaseConfigured) {
      setError("Connect your Supabase project first. Copy .env.example to .env.local and add your project URL and anon key.");
      return;
    }
    setBusy(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (authError) setError(authError.message);
    else navigate(destination, { replace: true });
  }

  return (
    <div className="auth-layout">
      <section className="auth-art">
        <Link to="/" className="brand brand-light"><span className="brand-mark"><BookOpen size={19} /></span><span>elibrary<span className="brand-period">.</span></span></Link>
        <div className="art-copy"><span className="eyebrow light-eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><h1>Good books.<br /><em>Open worlds.</em></h1><p>A considered space for stories, ideas, and the people who share them.</p></div>
        <div className="art-bottom"><span>READ AT YOUR OWN PACE</span><span>01 — ∞</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="mobile-brand"><BookOpen size={20} /> elibrary.</div>
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to Elibrary</h2>
          <p className="muted">Your reading space is waiting.</p>
          <form onSubmit={submit} className="form-stack">
            <label>Email address<input type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} /></label>
            <label>Password<span className="password-wrap"><input type={showPassword ? "text" : "password"} autoComplete="current-password" required placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} /><button type="button" className="password-toggle" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
            {error && <div className="alert error">{error}</div>}
            <button className="button button-primary button-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"} <span>↗</span></button>
          </form>
          <p className="auth-switch"><Link to="/reset-password">Forgot password?</Link></p>
          <p className="auth-switch">New to Elibrary? <Link to="/signup">Create an account</Link></p>
          <p className="auth-legal">By continuing, you agree to use Elibrary responsibly and respect authors' rights.</p>
        </div>
      </section>
    </div>
  );
}