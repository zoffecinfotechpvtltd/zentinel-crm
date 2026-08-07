// Centralized money/date formatting, per architecture doc convention
// (the prototype repeated ₹${(x/1000).toFixed(0)}K logic inline in multiple places).

export function formatMoney(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export function formatMoneyExact(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr) < today;
}

// A session list showing "Mozilla/5.0 (Windows NT 10.0; Win64; x64)
// AppleWebKit/537.36..." verbatim asks the reader to parse a raw UA string
// to answer "is this me on my laptop, or someone else." Reduce it to what
// they actually need: browser + OS. Falls back to the raw string (still
// available via title=) if nothing recognizable matches.
function detectBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  if (/curl\//.test(ua)) return "curl (script)";
  return "an app";
}

function detectOs(ua: string): string | null {
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad/.test(ua)) return "iOS";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

export function friendlyUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  return os ? `${browser} on ${os}` : browser;
}

// Session IPs come back in IPv6-mapped-IPv4 / loopback forms depending on
// how Node's http server saw the connection — technically correct, not
// what anyone reading a session list wants to see.
export function friendlyAddress(ip: string | null | undefined): string {
  if (!ip) return "Unknown address";
  if (ip === "::1") return "localhost";
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}
