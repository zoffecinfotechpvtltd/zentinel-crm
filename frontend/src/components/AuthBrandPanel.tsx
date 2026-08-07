// Shared left panel across Login/Setup/Reset — one place this app spends
// visual boldness, kept identical everywhere so moving between these
// screens doesn't feel like landing on three different products.
export function AuthBrandPanel({ headline }: { headline: string }) {
  return (
    <div className="login-brand">
      <div className="login-brand-mark">
        <div className="logo-mark">Z</div>
        <div>
          <div className="login-brand-name">Zoffec Sentinel</div>
          <div className="login-brand-sub">Zoffec Infotech Pvt. Ltd.</div>
        </div>
      </div>
      <div className="login-brand-headline">{headline}</div>
      <div className="login-brand-foot">Leads, clients, invoices, and delivery — one system, every role sees only their part.</div>
    </div>
  );
}
