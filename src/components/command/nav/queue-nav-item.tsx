"use client";

import * as React from "react";
import { ListChecks } from "lucide-react";
import { NavButton } from "./nav-button";
import type { NavView } from "./nav-types";

/**
 * QueueNavItem — Mission Queue nav entry (hotkey 4).
 */
export function QueueNavItem({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (v: NavView) => void;
}) {
  return (
    <NavButton
      icon={ListChecks}
      label="Mission Queue"
      hotkey="4"
      active={active}
      onClick={() => onChange("QUEUE")}
    />
  );
}
