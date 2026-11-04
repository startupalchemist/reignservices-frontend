import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Loader2, ArrowLeft, ArrowRight } from "lucide-react";
export default function Login() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const { login } = useAuth(),
    [, setLocation] = useLocation(),
    form = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const center = () => {
      requestAnimationFrame(() =>
        form.current?.scrollIntoView({
          block: "center",
          behavior: "instant" as ScrollBehavior,
        }),
      );
    };
    center();
    const viewport = window.visualViewport;
    const onResize = () => {
      if (form.current?.contains(document.activeElement)) center();
    };
    viewport?.addEventListener("resize", onResize);
    return () => viewport?.removeEventListener("resize", onResize);
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      setLocation("/admin");
    } catch {
      setError(
        "We couldn’t sign you in. Check your email and password, then try again.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="reign-login">
      <a href="/" className="reign-login-back">
        <ArrowLeft size={14} />
        Back to Reign Services
      </a>
      <div ref={form} className="reign-login-card">
        <div className="reign-login-mark">R</div>
        <p className="reign-login-brand">REIGN SERVICES</p>
        <h1 data-testid="text-login-headline">Your work. One workspace.</h1>
        <p className="reign-login-intro">
          Sign in to manage clients, projects, and the work ahead.
        </p>
        <form onSubmit={submit} data-testid="form-login">
          <label htmlFor="reign-email">Work email</label>
          <input
            id="reign-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            data-testid="input-login-email"
          />
          <label htmlFor="reign-password">Password</label>
          <input
            id="reign-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="input-login-password"
          />
          {error && (
            <p role="alert" data-testid="text-login-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            data-testid="button-login-submit"
          >
            {loading ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <>
                Sign in <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
        <small>Secure access for Reign Services team members.</small>
      </div>
      <p className="reign-login-footer">
        REIGN SERVICES · Built for the work ahead.
      </p>
      <style>{`
.reign-login{min-height:100svh;background:#f6f7fb;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:70px 22px;color:#384154;font:14px Manrope,system-ui,sans-serif}.reign-login-back{position:absolute;top:25px;left:25px;display:flex;align-items:center;gap:8px;font-size:11px;color:#8d95a6}.reign-login-card{width:100%;max-width:420px;background:#fff;border:1px solid #e8eaf1;border-radius:17px;padding:42px 37px;box-shadow:0 10px 40px #302c4f05;scroll-margin:20px}.reign-login-mark{width:45px;height:48px;display:grid;place-items:center;background:#6845d6;color:white;border-radius:12px;font-size:30px;font-weight:800;font-style:italic;margin-bottom:22px}.reign-login-brand{font-size:9px;letter-spacing:2px;color:#9a8ab9;font-weight:750;margin-bottom:12px}.reign-login h1{font-size:24px;letter-spacing:-.8px;font-weight:750;line-height:1.35}.reign-login-intro{color:#9ba2b0;font-size:11px;line-height:1.9;margin:12px 0 28px}.reign-login form{display:flex;flex-direction:column}.reign-login label{font-size:11px;font-weight:650;color:#8490a2;margin-bottom:8px}.reign-login input{width:100%;min-height:45px;border:1px solid #dfe3ed;border-radius:7px;background:#fff;padding:10px 12px;color:#435065;font-size:14px;margin-bottom:21px}.reign-login input:focus{outline:2px solid #d3c3f5;border-color:#a18bd4;outline-offset:1px}.reign-login form>p{font-size:11px;color:#b36273;margin:0 0 18px;line-height:1.8}.reign-login form>button{min-height:45px;display:flex;justify-content:center;align-items:center;gap:10px;background:#6845d6;border:0;border-radius:7px;color:white;font-size:12px;font-weight:650;margin-top:4px}.reign-login form>button:disabled{opacity:.6}.reign-login-card>small{display:block;color:#adb3be;text-align:center;font-size:9px;margin-top:24px}.reign-login-footer{font-size:8px;letter-spacing:1.2px;color:#a6adbb;margin-top:26px}@media(max-width:500px){.reign-login{padding:70px 17px 35px}.reign-login-card{padding:32px 26px}.reign-login input{font-size:16px}.reign-login-back{left:20px;top:22px}}
`}</style>
    </div>
  );
}
