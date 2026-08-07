import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { AuthBrandPanel } from "../components/AuthBrandPanel";

type SignInfo = { filename: string; status: "pending" | "signed" | "cancelled"; signer_name: string | null; signed_at: string | null };

export function SignDocument() {
  const { token } = useParams<{ token: string }>();
  const { data: info, loading, error: loadError } = useFetch<SignInfo>(`/sign/${token}`);
  const [signerName, setSignerName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/sign/${token}`, { signer_name: signerName });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't record your signature — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const alreadySigned = info?.status === "signed";

  return (
    <div className="login-shell">
      <AuthBrandPanel headline="One document, one signature, done." />
      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-card-head">
            <div className="login-card-title">Sign document</div>
          </div>

          {loading && <p style={{ fontSize: 13, color: "var(--text2)" }}>Loading…</p>}

          {!loading && loadError && (
            <div className="banner banner-error">This signing link isn't valid or has expired.</div>
          )}

          {!loading && info && (done || alreadySigned) && (
            <div className="banner banner-info">
              {done
                ? "Signed. You can close this page."
                : `Already signed by ${info.signer_name ?? "someone"}${info.signed_at ? ` on ${new Date(info.signed_at).toLocaleDateString()}` : ""}.`}
            </div>
          )}

          {!loading && info && !done && !alreadySigned && (
            <form onSubmit={onSubmit}>
              {error && <div className="banner banner-error">{error}</div>}
              <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
                Document: <strong>{info.filename}</strong>
              </p>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Your full name</label>
                <input className="form-input" required value={signerName} onChange={(e) => setSignerName(e.target.value)} autoFocus />
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 18 }}>
                <input type="checkbox" id="agree" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3 }} />
                <label htmlFor="agree" style={{ fontSize: 12, color: "var(--text2)" }}>
                  I have reviewed this document and agree to its contents. I understand that clicking "Sign" records my name, the time, and my IP address as confirmation.
                </label>
              </div>
              <button className="btn btn-primary" type="submit" disabled={submitting || !agreed || !signerName} style={{ width: "100%", justifyContent: "center" }}>
                {submitting ? "Signing…" : "Sign"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
