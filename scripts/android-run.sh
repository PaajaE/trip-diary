#!/usr/bin/env bash
# Build, install, and launch Trip Diary on a connected Android device/emulator.
# Does NOT open Android Studio — use pnpm native:android for that.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE="cz.tripdiary.app"
ACTIVITY=".MainActivity"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"

export PATH="$JAVA_HOME/bin:${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools:$PATH"

if [[ ! -x "$ADB" ]]; then
  echo "adb not found. Connect a device and install Android SDK platform-tools." >&2
  exit 1
fi

DEVICES=$("$ADB" devices | awk 'NR>1 && $2=="device" { print $1 }')
if [[ -z "$DEVICES" ]]; then
  echo "No Android device/emulator connected. Enable USB debugging and reconnect." >&2
  exit 1
fi

echo "==> Syncing web build into android/"
(cd "$ROOT" && pnpm native:sync)

echo "==> Installing debug APK"
(cd "$ROOT/android" && ./gradlew installDebug)

echo "==> Launching $PACKAGE"
"$ADB" shell am start -n "$PACKAGE/$ACTIVITY"

echo "Done. Start log monitoring with: pnpm native:android:logs"
