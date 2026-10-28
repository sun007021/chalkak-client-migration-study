#!/usr/bin/env bash
# ChalkakKit 단위·계약 테스트. 로컬 swift가 있으면 그대로, 없으면(Linux 클라우드) Docker swift 이미지로 돈다.
# 사용: ios/scripts/test.sh [swift test 인자...]   예: ios/scripts/test.sh --filter TC-NET
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${SWIFT_IMAGE:-swift:6.2-noble}"
if command -v swift >/dev/null 2>&1; then
  cd "$ROOT/ios/ChalkakKit" && exec swift test "$@"
fi
if ! docker info >/dev/null 2>&1; then
  (dockerd >/tmp/dockerd.log 2>&1 &) ; for _ in $(seq 1 20); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi
# 레포 루트를 마운트해 shared/fixtures를 상대 경로로 읽을 수 있게 한다. .build는 볼륨에 캐시한다.
exec docker run --rm -v "$ROOT":/repo -v "chalkak-ios-build-$(echo "$ROOT" | md5sum | cut -c1-8)":/repo/ios/ChalkakKit/.build \
  -w /repo/ios/ChalkakKit "$IMAGE" swift test "$@"
