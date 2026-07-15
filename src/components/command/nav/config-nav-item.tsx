"use client";

import * as React from "react";
import { Terminal } from "lucide-react";
import { NavButton } from "./nav-button";
import type { NavView } from "./nav-types";

/**
 * ConfigNavItem — System Config nav entry (hotkey 8).
 */
export function ConfigNavItem({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (v: NavView) => void;
}) {
  return (
    <NavButton
      icon={Terminal}
      label="System Config"
      hotkey="8"
      active={active}
      onClick={() => onChange("CONFIG")}
    />
  );
}
