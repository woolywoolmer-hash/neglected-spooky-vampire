'use client';
import { useState } from 'react';
import { ArrowRight, Layers } from 'lucide-react';
export default function Login() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <div className="login-art">
        <span className="brand">
          <Layers /> Fieldwork<span className="brand-dot">®</span>
        </span>
        <div>
          <div className="eyebrow">SPACE TO DO MORE</div>
          <h1>
            Great facilities.
            <br />
            Better connected.
          </h1>
          <p>One place for your spaces, people, and everything on the calendar.</p>
        </div>
        <small>FACILITIES MANAGEMENT, THOUGHTFULLY SIMPLIFIED.</small>
      </div>
      <div className="login-form">
        <div className="eyebrow">YOUR WORKSPACE AWAITS</div>
        <h2>Welcome back.</h2>
        <p>Sign in with your school or sports centre account.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            const f = new FormData(e.currentTarget);
            try {
              const r = await fetch('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: f.get('email'), password: f.get('password') }),
              });
              const j = await r.json();
              if (!r.ok) throw new Error(j.error);
              location.href = '/';
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder="you@school.org"
            />
          </label>
          <label>
            Password
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
            <ArrowRight size={17} />
          </button>
        </form>
        <p className="muted">Accounts are managed by your administrator.</p>
      </div>
    </main>
  );
}
