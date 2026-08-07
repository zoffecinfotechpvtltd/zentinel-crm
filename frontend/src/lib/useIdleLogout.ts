import { useEffect, useRef } from "react";

const IDLE_LIMIT_MS = 10 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "wheel"] as const;

export function useIdleLogout(onIdle: () => void): void {
  const lastActivity = useRef(Date.now());
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    function markActive() {
      lastActivity.current = Date.now();
    }
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, markActive, { passive: true }));

    const interval = setInterval(() => {
      if (Date.now() - lastActivity.current >= IDLE_LIMIT_MS) {
        onIdleRef.current();
      }
    }, 15000);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActive));
      clearInterval(interval);
    };
  }, []);
}
