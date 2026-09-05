import { API_BASE } from "../lib/api";

type AvatarUser = { name: string; avatar_url?: string | null } | null | undefined;

export function UserAvatar({ user, size = 34 }: { user: AvatarUser; size?: number }) {
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
    <div className="avatar av-blue" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
}
