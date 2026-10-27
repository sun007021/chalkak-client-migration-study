#!/usr/bin/env bash
# gen_copy --check → format → analyze → test → (node 있으면) testID 검사. PR마다 통과해야 머지한다.
# TC 커버리지는 별도: node ../shared/scripts/check-tc-coverage.mjs flutter
set -euo pipefail
cd "$(dirname "$0")/.."
dart run tool/gen_copy.dart --check
dart format --output=none --set-exit-if-changed lib test tool
flutter analyze --fatal-infos
flutter test "$@"
if command -v node >/dev/null 2>&1; then
  node ../shared/scripts/check-testids.mjs flutter --root ..
fi
