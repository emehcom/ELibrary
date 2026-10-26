
import { useEffect, useState, type FormEvent } from "react";
import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"request" | "update">("request");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("update");
        setError("");
        setNotice("Choose a new password for your Elibrary account.");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);

    try {
      if (mode === "request") {
        const redirectTo =
          `${window.location.origin}${import.meta.env.BASE_URL}#/reset-password`;

        const { error: resetError } =
          await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo,
          });

        if (resetError) {
          setError(resetError.message);
        } else {
          setNotice(
            "If an account exists for that email, a password-reset link has been sent. Check your inbox and spam folder."
          );
        }

        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) {
        setError(
          "Your password-reset session is missing or expired. Request a new reset link from the sign-in page."
        );
        return;
      }

      if (password.length < 12) {
        setError("Use a password with at least 12 characters.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
      } else {
        setPassword("");
        setNotice(
          "Your password has been updated. Return to sign in with your new password."
        );
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-art">
        <Link to="/login" className="brand brand-light">
          <span className="brand-mark"><BookOpen size={19} /></span>
          <span>elibrary<span className="brand-period">.</span></span>
        </Link>
        <div className="art-copy">
          <span className="eyebrow light-eyebrow">ACCOUNT SECURITY</span>
          <h1>A fresh start.<br /><em>A secure account.</em></h1>
          <p>Reset your Elibrary password securely.</p>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="mobile-brand"><BookOpen size={20} /> elibrary.</div>
          <span className="eyebrow">PASSWORD HELP</span>
          <h2>
            {mode === "request"
              ? "Reset your password"
              : "Choose a new password"}
          </h2>

          <form className="form-stack" onSubmit={submit}>
            {mode === "request" ? (
              <label>
                Email address
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
            ) : (
              <label>
                New password
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 12 characters"
                />
              </label>
            )}

            {error && <div className="alert error">{error}</div>}
            {notice && <div className="alert success">{notice}</div>}

            <button
              className="button button-primary button-full"
              disabled={busy}
            >
              {busy
                ? "Please wait…"
                : mode === "request"
                  ? "Send reset link"
                  : "Update password"}
            </button>
          </form>

          <p className="auth-switch">
            <Link to="/login">Back to sign in</Link>
            {" · "}
            <button
              type="button"
              className="inline-button"
              onClick={() => {
                setMode(mode === "request" ? "update" : "request");
                setError("");
                setNotice("");
              }}
            >
              {mode === "request"
                ? "I have a reset link"
                : "Request another link"}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
