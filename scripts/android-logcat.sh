#!/usr/bin/env bash
# Stream filtered Android logs for Trip Diary (Capacitor hybrid app).
# Usage:
#   ./scripts/android-logcat.sh          # follow logs (Ctrl+C to stop)
#   ./scripts/android-logcat.sh --dump   # print recent buffer and exit
#   ./scripts/android-logcat.sh --clear  # clear log buffer only

set -euo pipefail

PACKAGE="cz.tripdiary.app"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"

if [[ ! -x "$ADB" ]]; then
  echo "adb not found at $ADB" >&2
  echo "Set ANDROID_HOME or install Android SDK platform-tools." >&2
  exit 1
fi

# Capacitor WebView + custom plugin + fatal Android errors
FILTER=(
  "Capacitor:V"
  "Capacitor/Console:V"
  "chromium:V"
  "cr_*:V"
  "PhotoMetadata:V"
  "AndroidRuntime:E"
  "System.err:W"
  "*:S"
)

case "${1:-}" in
  --clear)
    "$ADB" logcat -c
    echo "Log buffer cleared."
    ;;
  --dump)
    "$ADB" logcat -d -v time -t 400 "${FILTER[@]}"
    ;;
  *)
    echo "Watching logs for $PACKAGE (device: $("$ADB" get-state 2>/dev/null || echo unknown))"
    echo "Operate the app on your phone — errors and Capacitor output appear below."
    echo "---"
    "$ADB" logcat -c
    "$ADB" logcat -v time "${FILTER[@]}"
    ;;
esac
