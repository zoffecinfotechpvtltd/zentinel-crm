// Shield + Z + signal — the one signature mark the whole app is built
// around (sidebar, login panel, browser icon). Cropped straight from the
// client's brand sheet rather than redrawn, so it stays pixel-identical to
// the approved mark.
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <img
      src="/brand/zentinel-mark.png"
      alt=""
      aria-hidden="true"
      style={{ height: size, width: "auto", display: "block" }}
    />
  );
}
