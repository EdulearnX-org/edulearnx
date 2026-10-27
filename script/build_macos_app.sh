#!/usr/bin/env bash
set -euo pipefail

APP_NAME="EduLearnX"
BUNDLE_ID="com.edulearnx.app"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIST="$ROOT_DIR/dist"
APP_DIST="$ROOT_DIR/dist/mac"
APP_BUNDLE="$APP_DIST/$APP_NAME.app"
CONTENTS_DIR="$APP_BUNDLE/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
APP_RESOURCES="$RESOURCES_DIR/app"

if command -v pnpm >/dev/null 2>&1; then
  pnpm build:client
else
  npm run build:client
fi

rm -rf "$APP_BUNDLE"
mkdir -p "$MACOS_DIR" "$APP_RESOURCES"

cp -R "$WEB_DIST/assets" "$APP_RESOURCES/assets"
cp "$WEB_DIST/index.html" "$APP_RESOURCES/index.html"

cat > "$CONTENTS_DIR/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>$APP_NAME</string>
  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
</dict>
</plist>
PLIST

cat > "$MACOS_DIR/$APP_NAME" <<'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INDEX_FILE="$APP_DIR/Resources/app/index.html"

/usr/bin/open "$INDEX_FILE"
LAUNCHER

chmod +x "$MACOS_DIR/$APP_NAME"

echo "Created $APP_BUNDLE"
