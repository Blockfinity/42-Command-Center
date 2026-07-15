"use client";

import * as React from "react";
import { ScanEye } from "lucide-react";
import { NavButton } from "./nav-button";
import type { NavView } from "./nav-types";

/**
 * IntelNavItem — Faction Intel nav entry (hotkey 6).
 */
export function IntelNavItem({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (v: NavView) => void;
}) {
  return (
    <NavButton
      icon={ScanEye}
      label="Faction Intel"
      hotkey="6"
      active={active}
      onClick={() => onChange("INTEL")}
    />
  );
}
