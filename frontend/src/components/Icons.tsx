import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(size: number, props: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export const IconDashboard = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
);
export const IconLeads = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M13 3l7 4v6l-7 4-7-4V7z" /><path d="M6 7l7 4 7-4" /><path d="M13 11v10" /></svg>
);
export const IconClients = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2" /><circle cx="17.5" cy="7.5" r="2.6" /><path d="M15.5 13.6c2.9.4 5 2.8 5 6.4" /></svg>
);
export const IconProjects = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M8 4v-1M16 4v-1" /></svg>
);
export const IconInvoices = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M6 2.5h9l3 3v16H6z" /><path d="M15 2.5v3h3" /><path d="M9 12h6M9 15.5h6M9 8.5h3" /></svg>
);
export const IconFollowups = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></svg>
);
export const IconReports = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M4 20V10M11 20V4M18 20v-7" /><path d="M2.5 20h19" /></svg>
);
export const IconBell = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M6 9a6 6 0 1112 0c0 5 1.8 6.5 1.8 6.5H4.2S6 14 6 9z" /><path d="M10 19.5a2 2 0 004 0" /></svg>
);
export const IconUsers = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><circle cx="9" cy="7.5" r="3.2" /><path d="M2.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2" /><path d="M16 4.5a3.2 3.2 0 010 6M20 20c0-3-1.9-5.3-4.6-6" /></svg>
);
export const IconTemplate = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 9v12" /></svg>
);
export const IconSettings = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6V20a2 2 0 11-4 0v-.2a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.6-1H4a2 2 0 110-4h.2a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.9.3H10a1.7 1.7 0 001-1.6V4a2 2 0 114 0v.2a1.7 1.7 0 001 1.6 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.9v.1a1.7 1.7 0 001.6 1H20a2 2 0 110 4h-.2a1.7 1.7 0 00-1.6 1z" /></svg>
);
export const IconSearch = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
);
export const IconSun = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" /></svg>
);
export const IconMoon = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M20 14.5A8.5 8.5 0 119.5 4a7 7 0 0010.5 10.5z" /></svg>
);
export const IconPlus = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconX = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M18 6L6 18M6 6l12 12" /></svg>
);
export const IconCheck = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M4 12l5.5 5.5L20 6.5" /></svg>
);
export const IconLogout = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
);
export const IconMenu = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
);
export const IconChevronDown = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M6 9l6 6 6-6" /></svg>
);
export const IconChevronLeft = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M15 6l-6 6 6 6" /></svg>
);
export const IconChevronRight = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M9 6l6 6-6 6" /></svg>
);
export const IconAlert = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17.5v.1" /></svg>
);
export const IconInbox = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M3 12h4.5l1.5 3h6l1.5-3H21" /><path d="M5 5h14l2 7v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6z" /></svg>
);
export const IconSparkle = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" /></svg>
);
export const IconPaperclip = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M20.5 12.5l-8 8a4.5 4.5 0 01-6.4-6.4l9-9a3 3 0 014.2 4.2l-9 9a1.5 1.5 0 01-2.1-2.1l8-8" /></svg>
);
export const IconTrash = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M4 7h16M9 7V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V7M18.5 7l-.6 12.4A2 2 0 0115.9 21H8.1a2 2 0 01-2-1.6L5.5 7" /></svg>
);
export const IconCalendar = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></svg>
);
export const IconArrowRight = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconOpportunities = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>
);
export const IconUpload = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></svg>
);
export const IconDownload = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size, p)}><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></svg>
);
