import type { ComponentType } from "react";
import { Orbit, SatelliteDish, Target, ListChecks, BrainCircuit, ScanEye, Rocket, Terminal } from "lucide-react";
import type { NavView } from "./nav-types";
import { NavButton } from "./nav-button";

/**
 * NAV_ITEMS — ordered registry of nav-rail items.
 *
 * Each item declares its view id, icon, label, and hotkey, and is rendered
 * by the shared `NavButton` shell. To add / remove / reorder nav items,
 * edit this array only.
 *
 * Icons use the gamified lucide set (Orbit, SatelliteDish, Target, …) for a
 * more cinematic command-deck aesthetic than the basic geometric set.
 */
export const NAV_ITEMS: {
  view: NavView;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  hotkey: string;
}[] = [
  { view: "MAP", icon: Orbit, label: "Orbital Map", hotkey: "1" },
  { view: "FEED", icon: SatelliteDish, label: "Discovery Feed", hotkey: "2" },
  { view: "STRIKE", icon: Target, label: "Strike Console", hotkey: "3" },
  { view: "QUEUE", icon: ListChecks, label: "Mission Queue", hotkey: "4" },
  { view: "AI", icon: BrainCircuit, label: "AI Briefing", hotkey: "5" },
  { view: "INTEL", icon: ScanEye, label: "Faction Intel", hotkey: "6" },
  { view: "DEPLOY", icon: Rocket, label: "Deploy Outpost", hotkey: "7" },
  { view: "CONFIG", icon: Terminal, label: "System Config", hotkey: "8" },
];
