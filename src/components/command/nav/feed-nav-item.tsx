"use client";

import * as React from "react";
import { SatelliteDish } from "lucide-react";
import { NavButton } from "./nav-button";
import type { NavView } from "./nav-types";

/**
 * FeedNavItem — Discovery Feed nav entry (hotkey 2).
 */
export function FeedNavItem({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (v: NavView) => void;
}) {
  return (
    <NavButton
      icon={SatelliteDish}
      label="Discovery Feed"
      hotkey="2"
      active={active}
      onClick={() => onChange("FEED")}
    />
  );
}
