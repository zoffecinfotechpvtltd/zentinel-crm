import { API_BASE } from "../lib/api";

type AvatarUser = { name: string; avatar_url?: string | null } | null | undefined;

// `onDark`: this avatar's backdrop is permanently dark regardless of the
// page's own light/dark theme (the sidebar profile block) - av-blue's
// text/background pairing is theme-split for the PAGE's theme, which
// doesn't help here since body.dark may well be false while this still
// sits on the sidebar's always-navy background. Forces the dark-mode
// pairing unconditionally instead (was failing WCAG AA at ~2.9:1 in
// light mode, caught by axe-core).
export function UserAvatar({ user, size = 34, onDark }: { user: AvatarUser; size?: number; onDark?: boolean }) {
  const initials = user?.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() ?? "";

  if (user?.avatar_url) {
    return (
      <img
        src={`${API_BASE}${user.avatar_url}`}
        alt=""
        crossOrigin="use-credentials"
        className="avatar"
        style={{ width: size, height: size, objectFit: "cover" }}
      />
    );
  }

  return (
    <div
      className={`avatar av-blue${onDark ? " av-blue-on-dark" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}
