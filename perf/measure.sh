#!/usr/bin/env bash
# Repeatable page-load measurement (warm dev server).
#
# Protocol (same for every run / page) — coverage & measurement behavior are
# UNCHANGED from the original harness:
#   1. W warmup requests (discarded) — get V8 JIT hot + caches compiled modules.
#      Fired CONCURRENTLY (xargs -P) so the suite wall-clock is smaller while
#      still achieving the exact same heat-up goal. Warmup results are never
#      measured, so concurrency here does not affect any reported statistic.
#   2. N measured requests — STRICTLY SEQUENTIAL (one at a time). Concurrency
#      would measure server-throughput under load, not per-request latency, so
#      samples must stay serial. This is the measured behavior; it is identical
#      to the original harness.
#   3. reports min / median / p90 / max / mean in milliseconds (TTFB + total).
#
# Usage: perf/measure.sh [URL] [N] [W] [P]
#   URL  target (default http://localhost:3000/)
#   N    measured samples        (default 40)
#   W    warmup requests         (default 15)
#   P    warmup parallelism      (default 8)
set -uo pipefail
URL="${1:-http://localhost:3000/}"
N="${2:-40}"
W="${3:-15}"
P="${4:-8}"

# Warmup: W requests, discarded, fired concurrently for speed. The goal is
# purely to populate the module cache / JIT / OS file cache; concurrent fire
# achieves that faster without touching any measured sample.
if (( W > 0 )); then
  # shellcheck disable=SC2013
  seq 1 "$W" | xargs -P "$P" -I{} curl -s -o /dev/null "$URL" 2>/dev/null || true
fi

# Measured samples — STRICTLY SEQUENTIAL. Each curl is its own process so each
# gets a fresh connection (cold-connection TTFB, the harshest valid measure).
ttfbs=()
totals=()
i=0
while (( i < N )); do
  IFS=' ' read -r ttfb total < <(curl -s -o /dev/null \
    -w "%{time_starttransfer} %{time_total}" "$URL" 2>/dev/null)
  ttfbs+=("$ttfb")
  totals+=("$total")
  i=$((i + 1))
done

stats() {
  local label="$1"; shift
  local arr=("$@")
  printf '%s\n' "${arr[@]}" | sort -n | awk -v L="$label" '{a[NR]=$1} END {
    n=NR;
    for(i=1;i<=n;i++) s+=a[i];
    p90=int(n*0.9); if(p90<1) p90=1;
    med=int((n+1)/2);
    printf "%-6s ms | min=%6.1f | median=%6.1f | p90=%6.1f | max=%6.1f | mean=%6.1f | n=%d\n",
      L, a[1]*1000, a[med]*1000, a[p90]*1000, a[n]*1000, s/n*1000, n
  }'
}

echo "URL: $URL  (warmup=$W parallel=$P, samples=$N sequential)"
stats "TTFB"  "${ttfbs[@]}"
stats "TOTAL" "${totals[@]}"
