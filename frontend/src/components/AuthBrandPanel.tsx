import { Logo } from "./Logo";

// Shared left panel across Login/Setup/Reset — one place this app spends
// visual boldness, kept identical everywhere so moving between these
// screens doesn't feel like landing on three different products.
export function AuthBrandPanel({ headline }: { headline: string }) {
  return (
    <div className="login-brand">
      <div className="login-brand-watermark"><Logo size={340} /></div>
      <div className="login-brand-mark">
        <div className="logo-mark"><Logo size={40} /></div>
        <div>
          <div className="login-brand-name">Zentinel</div>
          <div className="login-brand-sub">Zoffec Infotech Pvt. Ltd.</div>
        </div>
      </div>
      <div className="login-brand-headline">{headline}</div>
      <div className="login-brand-foot">
        <span>Leads, clients, invoices, and delivery — one system, every role sees only their part.</span>
        <span className="login-brand-tag">Intelligent. Protected. Connected.</span>
      </div>
    </div>
  );
}
