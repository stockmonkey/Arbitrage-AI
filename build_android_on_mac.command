#!/bin/bash
# Compile the Android APK locally using the Android SDK installed by Android Studio.
set -euo pipefail
cd "$(dirname "$0")"
echo "ArbitrageAI for Android — local debug APK build"
echo "------------------------------------------------"
if [[ -z "${ANDROID_HOME:-}" ]]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi
if [[ ! -d "$ANDROID_HOME/platforms/android-35" ]]; then
  echo "ERROR: Android SDK Platform 35 is missing."
  echo "Install Android Studio for Intel Mac, then in SDK Manager install Android 15 (API 35)."
  exit 1
fi
if [[ -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  export PATH="$JAVA_HOME/bin:$PATH"
fi
if ! command -v java >/dev/null 2>&1; then
  echo "ERROR: Java 17+ is required. Android Studio bundles a compatible JDK."
  exit 1
fi
mkdir -p .build-tools
VERSION=8.9
DIST=".build-tools/gradle-${VERSION}"
if [[ ! -x "$DIST/bin/gradle" ]]; then
  ARCHIVE=".build-tools/gradle-${VERSION}-bin.zip"
  echo "Downloading Gradle ${VERSION} from services.gradle.org (only first build)."
  curl --fail --location --retry 3 --connect-timeout 20 \
    "https://services.gradle.org/distributions/gradle-${VERSION}-bin.zip" -o "$ARCHIVE"
  unzip -q -o "$ARCHIVE" -d .build-tools
fi
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$HOME/.gradle}"
"$DIST/bin/gradle" --no-daemon :app:assembleDebug
APK="app/build/outputs/apk/debug/app-debug.apk"
if [[ ! -f "$APK" ]]; then
  echo "ERROR: Gradle finished without generating the APK."
  exit 1
fi
echo ""
echo "SUCCESS: Debug APK created at:"
echo "$(pwd)/$APK"
echo ""
echo "Transfer app-debug.apk to your Samsung Galaxy S23 and open it."
open -R "$APK" || true
