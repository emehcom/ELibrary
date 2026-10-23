
import { useState, type FormEvent } from "react";
import { BookOpen } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();

  const initialEmail =
    (location.state as { email?: string } | null)?.email ?? "";

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const normalizedEmail = email.trim().toLowerCase();
    const token = code.trim();

    if (!isSupabaseConfigured) {
      setError("Supabase is not configured.");
      return;
    }

    if (!normalizedEmail || !token) {
      setError("Enter your email address and verification code.");
      return;
    }

    setBusy(true);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type: "signup",
      });

      if (verifyError) {
        setError(verifyError.message);
        return;
      }

      navigate("/books", { replace: true });
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setError("");
    setNotice("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Enter your email address first.");
      return;
    }

    setResending(true);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: normalizedEmail,
      });

      if (resendError) {
        setError(resendError.message);
      } else {
        setNotice("If a new verification email can be sent, it should arrive shortly. Check your inbox and spam folder.");
      }
    } catch {
      setError("Unable to request another code right now.");
    } finally {
      setResending(false);
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
          <span className="eyebrow light-eyebrow">ONE LAST STEP</span>
          <h1>Verify your<br /><em>email address.</em></h1>
          <p>Confirm your email to finish creating your Elibrary account.</p>
        </div>
        <div className="art-bottom">
          <span>YOUR STORIES BELONG HERE</span>
          <span>01 — ∞</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="mobile-brand"><BookOpen size={20} /> elibrary.</div>
          <span className="eyebrow">EMAIL VERIFICATION</span>
          <h2>Check your inbox</h2>
          <p className="muted">
            Enter the verification code sent to your email address.
          </p>

          <form onSubmit={verify} className="form-stack">
            <label>
              Email address
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </label>

            <label>
              Verification code
              <input
                required
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter the code from your email"
                value={code}
                onChange={e => setCode(e.target.value)}
              />
            </label>

            {error && <div className="alert error">{error}</div>}
            {notice && <div className="alert success">{notice}</div>}

            <button
              className="button button-primary button-full"
              disabled={busy}
            >
              {busy ? "Verifying…" : "Verify email"} <span>↗</span>
            </button>
          </form>

          <p className="auth-switch">
            Didn't receive a code?{" "}
            <button
              type="button"
              className="link-button"
              disabled={resending || busy}
              onClick={resendCode}
            >
              {resending ? "Sending…" : "Resend code"}
            </button>
          </p>

          <p className="auth-switch">
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
