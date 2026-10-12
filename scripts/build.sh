#!/usr/bin/env bash
# Builds Pawse.app and packs dist/pawse.mcpb.
#   scripts/build.sh          -> app + mcpb
#   scripts/build.sh --app    -> app only (dist/Pawse.app)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
APP="$DIST/Pawse.app"
BIN="$ROOT/.build/Pawse"
SDK_DIR="/Library/Developer/CommandLineTools/SDKs"

compile() {
  local sdk="$1"
  swiftc -O -swift-version 5 -sdk "$sdk" -target arm64-apple-macos13.0 \
    -o "$BIN" "$ROOT"/native/Sources/Pawse/*.swift
}

mkdir -p "$ROOT/.build" "$DIST"

# The newest SDK can be ahead of the installed compiler; use the newest one that compiles.
if [[ -n "${PAWSE_SDK:-}" ]]; then
  compile "$PAWSE_SDK"
else
  built=0
  for sdk in $(ls -d "$SDK_DIR"/MacOSX[0-9]*.sdk | sort -V -r); do
    if compile "$sdk" 2>/dev/null; then
      echo "compiled with $(basename "$sdk")"
      built=1
      break
    fi
  done
  [[ $built == 1 ]] || { echo "no SDK compiled; set PAWSE_SDK" >&2; exit 1; }
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/Pawse"
cp -R "$ROOT/web" "$APP/Contents/Resources/web"
# App icon (shown in System Settings → Accessibility) from icon.png.
if [[ -f "$ROOT/icon.png" ]]; then
  ICONSET="$ROOT/.build/AppIcon.iconset"
  rm -rf "$ICONSET" && mkdir -p "$ICONSET"
  for px in 16 32 128 256 512; do
    sips -z $px $px "$ROOT/icon.png" --out "$ICONSET/icon_${px}x${px}.png" >/dev/null
    sips -z $((px * 2)) $((px * 2)) "$ROOT/icon.png" --out "$ICONSET/icon_${px}x${px}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
fi
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>dev.pawse.overlay</string>
  <key>CFBundleName</key><string>Pawse</string>
  <key>CFBundleDisplayName</key><string>Pawse</string>
  <key>CFBundleExecutable</key><string>Pawse</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST
# A stable identity keeps the Accessibility grant valid across rebuilds; ad-hoc changes every build.
SIGN_ID="${PAWSE_SIGN_ID:-Claude Pets Dev}"
if security find-identity -p codesigning | grep -q "\"$SIGN_ID\""; then
  codesign --force --sign "$SIGN_ID" --timestamp=none "$APP"
else
  echo "warning: signing identity '$SIGN_ID' not found; ad-hoc signing (Accessibility must be re-granted after each build)" >&2
  codesign --force --sign - --timestamp=none "$APP"
fi
echo "built $APP"

[[ "${1:-}" == "--app" ]] && exit 0

STAGE="$DIST/mcpb"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp "$ROOT/manifest.json" "$STAGE/"
cp -R "$ROOT/server" "$STAGE/server"
cp -R "$APP" "$STAGE/Pawse.app"
[[ -f "$ROOT/icon.png" ]] && cp "$ROOT/icon.png" "$STAGE/"
npx -y @anthropic-ai/mcpb validate "$STAGE/manifest.json"
npx -y @anthropic-ai/mcpb pack "$STAGE" "$DIST/pawse.mcpb"
echo "packed $DIST/pawse.mcpb"
