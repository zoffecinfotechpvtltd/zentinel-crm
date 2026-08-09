// Shield + Z + signal — the one signature mark the whole app is built
// around (sidebar, login panel, browser icon). A gradient shield carries a
// carved Z, with a small broadcast arc at the top-right standing in for
// "connected" — echoing the brand line "Intelligent. Protected. Connected."
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="zentinel-mark" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4d8bff" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <path d="M16 1.6 27.5 5.75v9.05c0 7.55-4.7 12.95-11.5 15.6C9.2 27.75 4.5 22.35 4.5 14.8V5.75Z" fill="url(#zentinel-mark)" />
      <path d="M11 10.4h9.9l-7.9 9.25h7.9" stroke="#f8fafc" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <g stroke="#a8f0ff" strokeWidth="1.6" strokeLinecap="round">
        <path d="M23.1 8.2a4.3 4.3 0 0 1 0 6" opacity=".95" />
        <path d="M24.7 6.5a6.8 6.8 0 0 1 0 9.4" opacity=".5" />
      </g>
      <circle cx="21.7" cy="11.2" r="1.4" fill="#eafcff" />
    </svg>
  );
}
