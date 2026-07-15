"use client";

import * as React from "react";
import { Orbit } from "lucide-react";
import { NavButton } from "./nav-button";
import type { NavView } from "./nav-types";

/**
 * MapNavItem — Orbital Map nav entry (hotkey 1).
 */
export function MapNavItem({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (v: NavView) => void;
}) {
  return (
    <NavButton
      icon={Orbit}
      label="Orbital Map"
      hotkey="1"
      active={active}
      onClick={() => onChange("MAP")}
    />
  );
}
