# 패리티 매트릭스

다섯 클라이언트가 카탈로그의 `TC-` 중 몇 개를 자동 테스트로(또는 `A` 항목은 에이전트 시나리오로) 통과했는지 영역별로 센다. 칸 값은 `통과/전체`.

- 갱신 방법: 각 구현 스레드가 PR 머지 전에 `shared/scripts/check-tc-coverage <platform>`을 돌려 자기 열만 고친다(스크립트는 구현 첫 주에 만든다. 그 전까지는 손으로 센다). 다른 플랫폼 열은 건드리지 않는다.
- `차이 허용`으로 처리한 TC는 아래 "허용된 차이" 표에 링크와 함께 적고 분모에서 빼지 않는다.
- 2026-10-27 작성 시점 합계: TC 1090개, 그중 `A` 포함 43개, 에이전트 시나리오 44개.

| 영역 | 카탈로그 | TC | A 포함 | AG | iOS | Android | Flutter | RN | Web |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BOOT | [boot-auth.md](catalog/boot-auth.md) | 39 | 2 | 2 | 30/39 | 29/39 | 34/39 | 33/39 | 17/39 |
| AUTH | [boot-auth.md](catalog/boot-auth.md) | 65 | 5 | 5 | 48/65 | 53/65 | 56/65 | 53/65 | 54/65 |
| ONB | [onboarding-signature.md](catalog/onboarding-signature.md) | 52 | 3 | 2 | 44/52 | 47/52 | 46/52 | 49/52 | 47/52 |
| SIGN | [onboarding-signature.md](catalog/onboarding-signature.md) | 45 | 2 | 2 | 38/45 | 42/45 | 42/45 | 43/45 | 42/45 |
| NAV | [navigation.md](catalog/navigation.md) | 50 | 0 | 0 | 30/50 | 40/50 | 29/50 | 0/50 | 27/50 |
| HOME | [home.md](catalog/home.md) | 60 | 2 | 2 | 52/60 | 55/60 | 53/60 | 54/60 | 55/60 |
| BANR | [home.md](catalog/home.md) | 31 | 1 | 1 | 27/31 | 27/31 | 28/31 | 27/31 | 20/31 |
| DISP | [display-feed.md](catalog/display-feed.md) | 62 | 1 | 1 | 56/62 | 58/62 | 55/62 | 58/62 | 0/62 |
| FEED | [display-feed.md](catalog/display-feed.md) | 58 | 2 | 2 | 45/58 | 50/58 | 50/58 | 51/58 | 0/58 |
| LIKE | [display-feed.md](catalog/display-feed.md) | 35 | 1 | 1 | 32/35 | 34/35 | 34/35 | 34/35 | 0/35 |
| UPL | [upload-edit.md](catalog/upload-edit.md) | 92 | 3 | 3 | 76/92 | 83/92 | 83/92 | 82/92 | 0/92 |
| EDIT | [upload-edit.md](catalog/upload-edit.md) | 51 | 4 | 4 | 25/51 | 42/51 | 45/51 | 46/51 | 0/51 |
| AIR | [ai-review.md](catalog/ai-review.md) | 61 | 2 | 2 | 47/61 | 53/61 | 54/61 | 54/61 | 0/61 |
| REC | [record.md](catalog/record.md) | 45 | 2 | 2 | 38/45 | 42/45 | 41/45 | 41/45 | 0/45 |
| NOTI | [notification-push.md](catalog/notification-push.md) | 57 | 2 | 2 | 44/57 | 48/57 | 50/57 | 0/57 | 0/57 |
| PUSH | [notification-push.md](catalog/notification-push.md) | 77 | 4 | 6 | 64/77 | 67/77 | 67/77 | 0/77 | 0/77 |
| SET | [settings-feedback.md](catalog/settings-feedback.md) | 56 | 3 | 3 | 33/56 | 47/56 | 51/56 | 0/56 | 0/56 |
| FDBK | [settings-feedback.md](catalog/settings-feedback.md) | 37 | 2 | 2 | 29/37 | 31/37 | 34/37 | 0/37 | 0/37 |
| NET | [common-infra.md](catalog/common-infra.md) | 62 | 2 | 2 | 55/62 | 55/62 | 56/62 | 56/62 | 59/62 |
| TIME | [common-infra.md](catalog/common-infra.md) | 30 | 0 | 0 | 17/30 | 23/30 | 21/30 | 16/30 | 22/30 |
| ANL | [common-infra.md](catalog/common-infra.md) | 25 | 0 | 0 | 11/25 | 23/25 | 8/25 | 0/25 | 16/25 |

## 허용된 차이

| TC | 플랫폼 | 차이 | 근거 |
| --- | --- | --- | --- |
| (예) TC-PUSH-0xx | Web | 웹 푸시 미지원 | open-questions Q-04 |
