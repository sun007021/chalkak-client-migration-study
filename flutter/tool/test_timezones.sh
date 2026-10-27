#!/usr/bin/env bash
# 기기 시간대를 바꿔 시간 테스트를 반복 실행한다(TC-TIME-003, TC-TIME-004, D-09).
set -euo pipefail
cd "$(dirname "$0")/.."
for tz in UTC America/Los_Angeles Pacific/Kiritimati Pacific/Pago_Pago Asia/Seoul; do
  echo "== TZ=$tz"
  TZ="$tz" flutter test test/core/time
done
