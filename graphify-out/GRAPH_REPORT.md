# Graph Report - .  (2026-07-24)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1065 nodes · 2096 edges · 124 communities (49 shown, 75 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1cbe3c59`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 121
- Community 122
- Community 123

## God Nodes (most connected - your core abstractions)
1. `cn()` - 256 edges
2. `useCommand` - 45 edges
3. `react` - 31 edges
4. `FactionId` - 28 edges
5. `SfxEngine` - 24 edges
6. `compilerOptions` - 17 edges
7. `useSfx()` - 16 edges
8. `tick()` - 15 edges
9. `now()` - 14 edges
10. `Garrison` - 12 edges

## Surprising Connections (you probably didn't know these)
- `UnitInfoPanel()` --indirect_call--> `tick()`  [INFERRED]
  src/components/command/map/unit-info-panel.tsx → mini-services/game-engine/src/logic.ts
- `LayerHost()` --indirect_call--> `now()`  [INFERRED]
  src/components/command/map/layer-host.tsx → mini-services/game-engine/src/state.ts
- `useMapContext()` --references--> `react`  [EXTRACTED]
  src/components/command/map/map-context.ts → package.json
- `SeedSpec` --references--> `FactionId`  [EXTRACTED]
  mini-services/game-engine/src/data.ts → src/lib/types.ts
- `SeedSpec` --references--> `GarrisonType`  [EXTRACTED]
  mini-services/game-engine/src/data.ts → src/lib/types.ts

## Import Cycles
- None detected.

## Communities (124 total, 75 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (55): httpServer, io, state, ActionResult, costCurrency(), currencySymbol(), handleAction(), FACTION_SEED (+47 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (44): Avatar(), AvatarFallback(), AvatarImage(), BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink(), BreadcrumbList(), BreadcrumbPage() (+36 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (41): POST(), POST(), GET(), POST(), POST(), BrandData, FactionStanding, b64urlDecode() (+33 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (41): Separator(), Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay(), SheetTitle() (+33 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (36): react, react, PriorityBriefing(), Carousel(), CarouselApi, CarouselContent(), CarouselContext, CarouselContextProps (+28 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (36): bun-types, eslint, eslint-config-next, devDependencies, bun-types, eslint, eslint-config-next, tailwindcss (+28 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (14): Badge(), badgeVariants, Checkbox(), HoverCardContent(), InputOTP(), InputOTPGroup(), InputOTPSlot(), PopoverContent() (+6 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (30): dom, dom.iterable, esnext, examples, mini-services, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts (+22 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (25): AIBriefingMini(), DeployCard(), DeployPanel(), DiscoveryFeed(), FactionIntel(), LeftPanel(), MissionQueue(), SegBar() (+17 more)

### Community 9 - "Community 9"
Cohesion: 0.18
Nodes (19): HeaderArea, DetailBody(), DetailHeader(), DetailNote(), DetailRow(), HoverDetail(), useProfileData(), ProfileArea() (+11 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (19): AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay(), AlertDialogTitle() (+11 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (3): sfx, SfxEngine, SoundName

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (22): Toast, ToastAction, ToastActionElement, ToastClose, ToastDescription, ToastProps, ToastTitle, toastVariants (+14 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (16): Body, fallback(), POST(), ProfileData, StandingsData, ThreatData, THREAT_META, EventSeverity (+8 more)

### Community 14 - "Community 14"
Cohesion: 0.16
Nodes (14): CommandBar(), CommandDeck(), GarrisonDetailCard, MapView, ClockArea(), ClockData, useClockData(), HEADER_AREAS (+6 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (15): Command(), CommandDialog(), CommandGroup(), CommandInput(), CommandItem(), CommandList(), CommandSeparator(), CommandShortcut() (+7 more)

### Community 16 - "Community 16"
Cohesion: 0.19
Nodes (18): BOOT_SEQUENCE, BootScreen(), FACTION_WALLPAPER, NOTE: `phase` stays "connecting" through completion. We use a separate, _assetCache, _bufferCache, ctx(), CueName (+10 more)

### Community 17 - "Community 17"
Cohesion: 0.24
Nodes (16): gameStateToSources(), FACTION_CODE, garrisonsToGeoJSON(), halosToGeoJSON(), missionImpactsToGeoJSON(), missionsToGeoJSON(), pingsToGeoJSON(), progressHeadsToGeoJSON() (+8 more)

### Community 18 - "Community 18"
Cohesion: 0.23
Nodes (10): activityPingsLayer, buildingsLayer, missionsLayer, cachedGarrisons, garrisonsLayer, roadsLayer, territoryLayer, GAME_SOURCE_IDS (+2 more)

### Community 19 - "Community 19"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 20 - "Community 20"
Cohesion: 0.18
Nodes (15): createMap(), CreateMapOptions, MapController, oceanFeature, NOTE: touchZoomRotate (touch pinch + twist) is independent of dragRotate, NOTE: do NOT call map.stop() — calling stop() in the same tick as easeTo, worldFeat, MapView() (+7 more)

### Community 21 - "Community 21"
Cohesion: 0.16
Nodes (12): Message, User, Card(), CardAction(), CardContent(), CardDescription(), CardFooter(), CardHeader() (+4 more)

### Community 22 - "Community 22"
Cohesion: 0.17
Nodes (10): BrandArea(), useBrandData(), GarrisonDetailCard(), PRIORITY_STYLE, NOTE: No document-level pointerdown listener., StatusBadge(), FACTION_LOGO, outpostNumber() (+2 more)

### Community 23 - "Community 23"
Cohesion: 0.13
Nodes (16): dependencies, @radix-ui/react-collapsible, @radix-ui/react-hover-card, @radix-ui/react-select, @radix-ui/react-tabs, @radix-ui/react-toast, @radix-ui/react-toggle, react-syntax-highlighter (+8 more)

### Community 24 - "Community 24"
Cohesion: 0.12
Nodes (9): ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut(), ContextMenuSubContent() (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (9): DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut(), DropdownMenuSubContent() (+1 more)

### Community 26 - "Community 26"
Cohesion: 0.23
Nodes (6): BOOT_SOURCES, EventListener, SourceRegistry, gameEngineSource, MapSourceSpec, NormalizedEvent

### Community 27 - "Community 27"
Cohesion: 0.22
Nodes (9): FACTION_ICON, FACTION_OUTPOST_NUMBER, esriWorldImagery, FactionShape, graticuleFeat, makeFactionIcon(), mapStyle, oceanFeature (+1 more)

### Community 28 - "Community 28"
Cohesion: 0.24
Nodes (8): signalMeta(), statusMeta(), Tab, UnitInfoPanel(), UnitInfoPanelProps, garrisonUnitCode(), hash4(), regionCode()

### Community 29 - "Community 29"
Cohesion: 0.18
Nodes (6): DrawerContent(), DrawerDescription(), DrawerFooter(), DrawerHeader(), DrawerOverlay(), DrawerTitle()

### Community 30 - "Community 30"
Cohesion: 0.18
Nodes (7): SelectContent(), SelectItem(), SelectLabel(), SelectScrollDownButton(), SelectScrollUpButton(), SelectSeparator(), SelectTrigger()

### Community 31 - "Community 31"
Cohesion: 0.31
Nodes (8): LayerHost(), LayerHostProps, MapContext, MapContextValue, MapProvider(), useMapContext(), LAYERS, MapInteraction

### Community 32 - "Community 32"
Cohesion: 0.28
Nodes (8): createSystemMessage(), createUserMessage(), generateMessageId(), httpServer, io, Message, User, users

### Community 33 - "Community 33"
Cohesion: 0.22
Nodes (8): dependencies, socket.io, name, private, scripts, dev, version, socket.io

### Community 34 - "Community 34"
Cohesion: 0.61
Nodes (8): err(), find_first_existing(), log(), restore_from_bare(), restore_from_bundle(), restore_from_tarball(), RESTORE.sh script, warn()

### Community 35 - "Community 35"
Cohesion: 0.50
Nodes (4): NavButton(), NAV_ITEMS, NAV_HOTKEYS, NavView

### Community 36 - "Community 36"
Cohesion: 0.43
Nodes (5): ToggleGroup(), ToggleGroupContext, ToggleGroupItem(), Toggle(), toggleVariants

### Community 37 - "Community 37"
Cohesion: 0.57
Nodes (5): log_step_end(), log_step_start(), dev.sh script, start_mini_services(), wait_for_service()

### Community 38 - "Community 38"
Cohesion: 0.33
Nodes (3): main(), mini-services-start.sh script, start.sh script

### Community 39 - "Community 39"
Cohesion: 0.33
Nodes (4): geistMono, geistSans, metadata, stencil

### Community 40 - "Community 40"
Cohesion: 0.50
Nodes (4): children, root, run(), shutdown()

### Community 42 - "Community 42"
Cohesion: 0.40
Nodes (3): AccordionContent(), AccordionItem(), AccordionTrigger()

### Community 43 - "Community 43"
Cohesion: 0.50
Nodes (4): Alert(), AlertDescription(), AlertTitle(), alertVariants

### Community 44 - "Community 44"
Cohesion: 0.40
Nodes (3): CASCADE_BASE, CASCADE_INTERVAL, CascadeGroup

### Community 45 - "Community 45"
Cohesion: 0.50
Nodes (3): __dirname, eslintConfig, __filename

## Knowledge Gaps
- **250 isolated node(s):** `build.sh script`, `NEXT_TELEMETRY_DISABLED`, `bench.sh script`, `$schema`, `style` (+245 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **75 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 1` to `Community 3`, `Community 4`, `Community 6`, `Community 8`, `Community 9`, `Community 10`, `Community 12`, `Community 14`, `Community 15`, `Community 20`, `Community 21`, `Community 22`, `Community 24`, `Community 25`, `Community 28`, `Community 29`, `Community 30`, `Community 35`, `Community 36`, `Community 42`, `Community 43`?**
  _High betweenness centrality (0.374) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 23` to `Community 4`, `Community 5`, `Community 52`, `Community 53`, `Community 54`, `Community 55`, `Community 56`, `Community 57`, `Community 58`, `Community 59`, `Community 60`, `Community 61`, `Community 64`, `Community 65`, `Community 66`, `Community 67`, `Community 68`, `Community 69`, `Community 70`, `Community 71`, `Community 72`, `Community 73`, `Community 74`, `Community 75`, `Community 76`, `Community 77`, `Community 78`, `Community 79`, `Community 80`, `Community 81`, `Community 82`, `Community 83`, `Community 84`, `Community 85`, `Community 86`, `Community 87`, `Community 88`, `Community 89`, `Community 90`, `Community 91`, `Community 92`, `Community 93`, `Community 94`, `Community 95`, `Community 96`, `Community 97`, `Community 98`, `Community 99`, `Community 100`, `Community 101`, `Community 102`, `Community 103`, `Community 104`, `Community 105`, `Community 106`, `Community 107`, `Community 108`, `Community 109`, `Community 110`, `Community 111`, `Community 112`, `Community 113`, `Community 114`, `Community 115`, `Community 116`?**
  _High betweenness centrality (0.282) - this node is a cross-community bridge._
- **Why does `react` connect `Community 4` to `Community 3`, `Community 36`, `Community 6`, `Community 8`, `Community 9`, `Community 10`, `Community 14`, `Community 16`, `Community 20`, `Community 22`, `Community 23`, `Community 28`, `Community 31`?**
  _High betweenness centrality (0.259) - this node is a cross-community bridge._
- **What connects `build.sh script`, `NEXT_TELEMETRY_DISABLED`, `bench.sh script` to the rest of the system?**
  _250 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07936507936507936 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06203007518796992 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08635703918722787 - nodes in this community are weakly interconnected._