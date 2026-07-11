"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * HoverDetail — a small, smooth hover-triggered detail popover for header
 * areas.
 *
 * Wraps a header area's trigger content. On mouse enter (after a short open
 * delay to avoid flicker on pass-through), reveals a compact detail panel
 * anchored just below the trigger. On mouse leave (after a short close delay
 * so the cursor can travel into the panel), it fades out smoothly.
 *
 * Intentionally smaller and lighter than the OutpostDetailCard quick-view:
 *   • w-64 (256px) vs w-80 (320px)
 *   • pure fade + 4px translate, 160ms
 *   • no close button, no pointer-down listener — hover-gated only
 *
 * The panel inherits `pointer-events-auto` so its content (links, etc.) is
 * interactive while open.
 */
export function HoverDetail({
  children,
  detail,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  detail: React.ReactNode;
  /** horizontal alignment of the panel relative to the trigger */
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = React.useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const scheduleOpen = React.useCallback(() => {
    clearTimers();
    openTimer.current = setTimeout(() => setOpen(true), 120);
  }, [clearTimers]);

  const scheduleClose = React.useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), 220);
  }, [clearTimers]);

  React.useEffect(() => clearTimers, [clearTimers]);

  const alignClass =
    align === "right"
      ? "right-0"
      : align === "center"
        ? "left-1/2 -translate-x-1/2"
        : "left-0";

  return (
    <div
      className={cn("relative flex h-full items-center", className)}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className={cn(
              "pointer-events-auto absolute top-[calc(100%+6px)] z-50 w-64 border border-white/15 bg-black/90 backdrop-blur-md",
              alignClass,
            )}
            role="tooltip"
          >
            {detail}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── shared building blocks for detail panels ─────────────────────────────

export function DetailHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-white/10 px-3 py-2 font-mono text-[9px] tracking-mega text-white/45">
      {title}
    </div>
  );
}

export function DetailRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-1 font-mono text-[10px] tracking-wide-2">
      <span className="text-white/40">{label}</span>
      <span className={cn("tabular-nums text-white/85", valueClass)}>{value}</span>
    </div>
  );
}

export function DetailBody({ children }: { children: React.ReactNode }) {
  return <div className="py-1">{children}</div>;
}

export function DetailNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-white/10 px-3 py-2 font-mono text-[9px] leading-relaxed tracking-wide text-white/55">
      {children}
    </div>
  );
}
