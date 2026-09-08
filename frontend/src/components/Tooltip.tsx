import { type ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";

// Radix's Tooltip primitive (redesign spec, Component Library category) -
// real hover/focus-delay behavior and correct ARIA (aria-describedby wired
// to the trigger automatically) instead of a title attribute, which
// screen readers announce inconsistently and which can't be styled at all.
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RadixTooltip.Provider delayDuration={300}>{children}</RadixTooltip.Provider>;
}

export function Tooltip({ label, children, side = "right" }: { label: string; children: ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className="tooltip-content" side={side} sideOffset={6}>
          {label}
          <RadixTooltip.Arrow className="tooltip-arrow" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
