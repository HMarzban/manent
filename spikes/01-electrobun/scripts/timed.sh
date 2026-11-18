#!/bin/sh
# One timed run at a time on this machine, started only when the machine is quiet.
LOCK=${MANENT_TIMING_LOCK:-/tmp/manent-timing.lock}
LIMIT=4.0
WAIT=${MANENT_LOAD_WAIT:-600}
load1() {
  if [ -n "$MANENT_LOAD_FILE" ]; then cat "$MANENT_LOAD_FILE"
  elif [ -r /proc/loadavg ]; then cut -d' ' -f1 /proc/loadavg
  else sysctl -n vm.loadavg | awk '{print $2}'; fi
}
while ! mkdir "$LOCK" 2>/dev/null; do
  [ -d "$LOCK" ] || { echo "timed.sh: cannot create $LOCK" >&2; exit 73; }
  holder=$(cat "$LOCK/pid" 2>/dev/null)
  if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
    echo "timed.sh: pid $holder is gone; breaking its stale lock" >&2
    [ "$(cat "$LOCK/pid" 2>/dev/null)" = "$holder" ] && rm -rf "$LOCK"
    continue
  fi
  if [ -z "$holder" ] && [ -n "$(find "$LOCK" -maxdepth 0 -mmin +1 2>/dev/null)" ]; then
    echo "timed.sh: lock has no owner after a minute; breaking it" >&2
    rm -rf "$LOCK"; continue
  fi
  echo "timed.sh: waiting for pid ${holder:-?} ($(cat "$LOCK/cmd" 2>/dev/null))" >&2
  sleep 5
done
echo $$ > "$LOCK/pid"; echo "$*" > "$LOCK/cmd"
trap 'rm -rf "$LOCK"' EXIT
trap 'exit 130' INT TERM
waited=0
while base=$(load1); awk -v l="$base" -v m="$LIMIT" 'BEGIN { exit !(l > m) }'; do
  if [ "$waited" -ge "$WAIT" ]; then
    echo "timed.sh: 1-minute load $base stayed above $LIMIT for ${WAIT}s; nothing was measured" >&2; exit 75
  fi
  echo "timed.sh: 1-minute load $base is above $LIMIT; waiting" >&2
  sleep 15; waited=$((waited + 15))
done
export MANENT_TIMED=1 MANENT_LOAD_BASELINE="$base"
"$@"
