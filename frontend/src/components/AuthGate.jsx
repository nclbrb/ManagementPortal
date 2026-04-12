import { apiUrl } from "../apiConfig.js";

export function AuthGate({
  mode,
  setMode,
  email,
  setEmail,
  password,
  setPassword,
  name,
  setName,
  error,
  setError,
  busy,
  setBusy,
  onAuthed,
}) {
  const submitLogin = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await fetch(apiUrl("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.error || "Sign-in failed.");
        return;
      }
      onAuthed(data.user, data.token);
    } catch {
      setError("Cannot reach the server. Start the backend and try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitSignup = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await fetch(apiUrl("/auth/signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.error || "Sign-up failed.");
        return;
      }
      onAuthed(data.user, data.token);
    } catch {
      setError("Cannot reach the server. Start the backend and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-gate">
      <div className="auth-gate-shell">
        <aside className="auth-gate-brand">
          <div className="auth-gate-brand-logo" role="img" aria-label="COMELEC logo" />
          <p className="auth-gate-brand-tag">COMELEC • Republic of the Philippines</p>
          <h1>Management Portal</h1>
          <p className="auth-gate-brand-sub">Commission on Elections</p>
          <p className="auth-gate-brand-sub2">Staff and Operations System</p>
          <div className="auth-gate-brand-pills">
            <span>Tasks</span>
            <span>OB Slips</span>
            <span>Calendar</span>
          </div>
        </aside>

        <section className="auth-gate-card">
          <header className="auth-gate-head">
            <span className="auth-gate-badge">COMELEC ACCESS</span>
            <h2>{mode === "login" ? "Admin Login" : "Create Account"}</h2>
            <p className="auth-gate-subtitle">
              {mode === "login"
                ? "Please enter your credentials to access the COMELEC management dashboard."
                : "Set up your account credentials to start using the management portal."}
            </p>
          </header>

          {mode === "login" ? (
            <form className="auth-gate-form" onSubmit={submitLogin}>
              <label>
                Email Address
                <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label>
                Security Password
                <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              {error ? <p className="form-error auth-gate-error">{error}</p> : null}
              <button type="submit" className="auth-gate-submit" disabled={busy}>
                {busy ? "Signing in..." : "Sign in to Console"}
              </button>
              <p className="auth-gate-switch">
                No account yet?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError("");
                  }}
                >
                  Sign up
                </button>
              </p>
            </form>
          ) : (
            <form className="auth-gate-form" onSubmit={submitSignup}>
              <label>
                Display Name
                <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Juan Dela Cruz" />
              </label>
              <label>
                Email Address
                <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label>
                Security Password
                <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </label>
              <p className="auth-gate-hint">Password must be at least 6 characters.</p>
              {error ? <p className="form-error auth-gate-error">{error}</p> : null}
              <button type="submit" className="auth-gate-submit" disabled={busy}>
                {busy ? "Creating account..." : "Create Account"}
              </button>
              <p className="auth-gate-switch">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                >
                  Log in
                </button>
              </p>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
