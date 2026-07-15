"use client";

import * as React from "react";
import { Target } from "lucide-react";
import { NavButton } from "./nav-button";
import type { NavView } from "./nav-types";

/**
 * StrikeNavItem — Strike Console nav entry (hotkey 3).
 */
export function StrikeNavItem({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (v: NavView) => void;
}) {
  return (
    <NavButton
      icon={Target}
      label="Strike Console"
      hotkey="3"
      active={active}
      onClick={() => onChange("STRIKE")}
    />
  );
}
