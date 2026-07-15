#!/usr/bin/env bash
# Repeatable page-load benchmark.
# Measures TTFB (time_starttransfer) for every route under identical conditions.
#
# Protocol per route:
#   1. Warm (2 unmeasured requests — fills dev compile cache)
#   2. Measure (12 back-to-back requests, record TTFB)
#   3. Report min / median / p90 / max
#
# Pass threshold: every route's MEDIAN TTFB < 50 ms.

python3 <<'PYEOF'
import subprocess, sys, statistics, json

ROUTES = ["/", "/api/state", "/api"]
WARM = 8
N = 15
THRESHOLD_MS = 50
BASE = "http://localhost:3000"

def ttfb_ms(route):
    """Return TTFB in ms for a single request."""
    r = subprocess.run(
        ["curl", "-s", "-o", "/dev/null",
         "-w", "%{time_starttransfer}", f"{BASE}{route}"],
        capture_output=True, text=True
    )
    return float(r.stdout) * 1000.0

def measure(route):
    for _ in range(WARM):
        ttfb_ms(route)
    return [ttfb_ms(route) for _ in range(N)]

print(f"\n{'='*74}")
print(f"  PAGE-LOAD BENCHMARK  (warm={WARM}, samples={N}, threshold={THRESHOLD_MS}ms)")
print(f"{'='*74}")
all_pass = True
for route in ROUTES:
    times = measure(route)
    med = statistics.median(times)
    s = sorted(times)
    p90 = s[int(len(s) * 0.9)]
    status = "PASS" if med < THRESHOLD_MS else "FAIL"
    if med >= THRESHOLD_MS:
        all_pass = False
    print(f"  {status:4}  {route:18s}  min={min(times):6.1f}  median={med:6.1f}  p90={p90:6.1f}  max={max(times):6.1f} ms")
print(f"{'='*74}")
if all_pass:
    print(f"  ALL ROUTES UNDER {THRESHOLD_MS}ms  OK")
else:
    print(f"  SOME ROUTES OVER {THRESHOLD_MS}ms  NEEDS WORK")
print()
sys.exit(0 if all_pass else 1)
PYEOF
