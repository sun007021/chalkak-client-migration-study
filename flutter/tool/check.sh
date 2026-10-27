#!/usr/bin/env bash
# format → analyze → test. PR마다 통과해야 머지한다.
set -euo pipefail
cd "$(dirname "$0")/.."
dart format --output=none --set-exit-if-changed lib test
flutter analyze --fatal-infos
flutter test "$@"
