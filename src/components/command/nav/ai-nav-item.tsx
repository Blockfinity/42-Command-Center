"use client";

import * as React from "react";
import { BrainCircuit } from "lucide-react";
import { NavButton } from "./nav-button";
import type { NavView } from "./nav-types";

/**
 * AiNavItem — AI Briefing nav entry (hotkey 5).
 */
export function AiNavItem({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (v: NavView) => void;
}) {
  return (
    <NavButton
      icon={BrainCircuit}
      label="AI Briefing"
      hotkey="5"
      active={active}
      onClick={() => onChange("AI")}
    />
  );
}
