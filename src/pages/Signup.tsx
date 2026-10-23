
import { useState, type FormEvent } from "react";
import { BookOpen } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!isSupabaseConfigured) {
      setError("Supabase is not configured. Check your environment variables.");
      return;
    }

    if (password.length < 12) {
      setError("Use a password with at least 12 characters.");
      return;
    }

    setBusy(true);

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { display_name: name.trim() },
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (data.session) {
        navigate("/books", { replace: true });
        return;
      }

      navigate("/verify-email", {
        replace: true,
        state: { email: normalizedEmail },
      });
    } catch {
      setError("Something went wrong while creating your account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-art">
        <Link to="/" className="brand brand-light">
          <span className="brand-mark"><BookOpen size={19} /></span>
          <span>elibrary<span className="brand-period">.</span></span>
        </Link>
        <div className="art-copy">
          <span className="eyebrow light-eyebrow">A LIBRARY THAT GROWS WITH YOU</span>
          <h1>Read more.<br /><em>Discover more.</em></h1>
          <p>One account to find books, share your own, and keep your place.</p>
        </div>
        <div className="art-bottom">
          <span>YOUR STORIES BELONG HERE</span>
          <span>01 — ∞</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="mobile-brand"><BookOpen size={20} /> elibrary.</div>
          <span className="eyebrow">JOIN THE LIBRARY</span>
          <h2>Create your account</h2>
          <p className="muted">Read, discover, and share books with one account.</p>

          <form onSubmit={submit} className="form-stack">
            <label>
              Your name
              <input
                required
                autoComplete="name"
                placeholder="How should we call you?"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </label>

            <label>
              Email address
              <input
                required
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </label>

            <label>
              Password
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={12}
                placeholder="At least 12 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </label>

            {error && <div className="alert error">{error}</div>}
            {notice && <div className="alert success">{notice}</div>}

            <button className="button button-primary button-full" disabled={busy}>
              {busy ? "Creating account…" : "Create account"} <span>↗</span>
            </button>
          </form>

          <p className="auth-switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
          <p className="auth-legal">
            By creating an account, you agree to respect copyright and platform guidelines.
          </p>
        </div>
      </section>
    </div>
  );
}
