"use client";

import * as React from "react";
import { Rocket } from "lucide-react";
import { NavButton } from "./nav-button";
import type { NavView } from "./nav-types";

/**
 * DeployNavItem — Deploy Outpost nav entry (hotkey 7).
 */
export function DeployNavItem({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (v: NavView) => void;
}) {
  return (
    <NavButton
      icon={Rocket}
      label="Deploy Outpost"
      hotkey="7"
      active={active}
      onClick={() => onChange("DEPLOY")}
    />
  );
}
