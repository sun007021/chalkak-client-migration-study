# 찰캌 재구현 개요

기존 찰캌 서비스(iOS, Android 앱 운영 중)를 iOS native, Android native, Flutter, React Native, Web app 다섯 가지로 다시 만든다. UI는 플랫폼 관례에 맞게 달라도 되지만 **기능 동작과 예외 처리는 다섯 클라이언트가 같아야 한다.** 이 문서는 그 "같아야 하는 것"의 상위 지도다. 2026-10-27 원본 `main` 기준.

## 1. 문서 우선순위

문서끼리 다르면 위가 이긴다.

1. [decisions.md](decisions.md): 기존 iOS·Android가 서로 다르거나 버그가 있는 곳에서 이 레포가 정한 동작
2. [../reference/business-rules/](../reference/business-rules/): 서비스 정책 원본(규칙 ID)
3. [../reference/api-contract.md](../reference/api-contract.md): 서버 코드·OpenAPI에서 확인한 API 계약, errorCode 표, 경계값
4. [features/](features/): 기능별 요구사항(화면, 상태, 문구, 예외)
5. [../reference/legacy-ios.md](../reference/legacy-ios.md), [../reference/legacy-android.md](../reference/legacy-android.md): 기존 앱이 실제로 어떻게 동작하는지(근거 파일·줄 번호 포함)

규칙 문서와 서버가 다르면 **서버 동작에 맞춰 구현하고** decisions.md에 기록한다. 규칙이 없는 곳은 임의로 정책을 만들지 않고 [open-questions.md](open-questions.md)에 올린다.

## 2. 범위

| 포함 | 보류·제외 |
| --- | --- |
| 카카오 로그인, 게스트 둘러보기, 회원가입(약관·사인), 로그아웃, 탈퇴 | Apple·Google 로그인(서버는 지원, 이번 범위 밖) |
| 홈(오늘 주제, 랭킹, 이번 주 기록, 배너), 전시, 게시물 상세, 좋아요 | 작가 공개 사진 이어보기(`GET /users/{id}/posts`, POST-012). 기존 두 앱 모두 미구현이라 2차로 둔다 |
| 사진 촬영·선택·편집, WebP 업로드, 제목 수정·삭제 | 알림 "모두 읽음" UI(두 앱 모두 UI 미연결) |
| AI 리뷰 요청·폴링·결과 | 관리자 기능 전체 |
| 기록(캘린더), 달력 이미지 저장 | 레거시 로컬 리마인더 정리 코드(기존 앱 전용) |
| 알림함, 알림 상세, 푸시 수신·탭 이동, 푸시 기기 등록, 수신 설정 | |
| 사인 변경, 피드백, 약관 문서 보기, 버전 정보 | |
| 강제 업데이트 게이트(플랫폼별 방식, [decisions.md D-15](decisions.md#d-15-강제-업데이트)) | |

## 3. 레포 구조(제안)

```text
chalkak-client-migration-study/
├── docs/          명세·결정·테스트 목록(이 폴더)
├── shared/        다섯 클라이언트가 같이 쓰는 것: fixtures(JSON), mock 서버 설정, Maestro flow, 문구 표, testID 표
├── ios/           SwiftUI
├── android/       Jetpack Compose
├── flutter/
├── react-native/
└── web/
```

플랫폼 폴더는 각 구현 스레드가 첫 PR에서 만든다. `shared/`의 구성은 [../testing/strategy.md §4](../testing/strategy.md#4-공용-자산-shared)를 따른다.

## 4. 기능 영역과 ID 접두사

요구사항은 `REQ-<영역>-NNN`, 테스트는 `TC-<영역>-NNN`, 에이전트 시나리오는 `AG-<영역>-NNN`으로 부른다. 영역 코드는 아래 표로 고정한다.

| 영역 | 내용 | 규칙 ID | 요구사항 문서 |
| --- | --- | --- | --- |
| `BOOT` | 앱 시작, 스플래시, 강제 업데이트 게이트, 인증 게이트 | — | [features/boot-auth.md](features/boot-auth.md) |
| `AUTH` | 카카오 로그인, 게스트, 토큰 저장·갱신, 로그아웃, 탈퇴, 정지 회원 | USER-001~006 | [features/boot-auth.md](features/boot-auth.md) |
| `ONB` | 약관 동의, 가입 사인, 회원가입 완료 | USER-001, SIGN-001~002 | [features/onboarding-signature.md](features/onboarding-signature.md) |
| `SIGN` | 설정의 사인 변경 | SIGN-001~006 | [features/onboarding-signature.md](features/onboarding-signature.md) |
| `NAV` | 탭, 게스트 제한, 화면 간 이동 | — | [features/navigation.md](features/navigation.md) |
| `HOME` | 홈(오늘 주제 히어로, 랭킹, 이번 주 기록, AI 카드, 배너, 알림 진입) | TOPIC-*, POST-009, POST-011, BANNER-006 | [features/home.md](features/home.md) |
| `BANR` | 배너 웹뷰 | BANNER-006 | [features/home.md](features/home.md) |
| `DISP` | 전시(날짜 이동, 정렬, 랜덤 시드, 페이징, 아카이브) | POST-007, POST-008, TOPIC-* | [features/display-feed.md](features/display-feed.md) |
| `FEED` | 게시물 상세, 줌, 제목 수정, 삭제 | POST-005, POST-007, POST-010 | [features/display-feed.md](features/display-feed.md) |
| `LIKE` | 좋아요(낙관적 갱신, 롤백) | LIKE-001~005 | [features/display-feed.md](features/display-feed.md) |
| `UPL` | 업로드 진입 게이트, 사진 선택·촬영, WebP 인코딩, 업로드, 성공 화면 | POST-001~006, POST-011 | [features/upload-edit.md](features/upload-edit.md) |
| `EDIT` | 사진 편집(자르기·회전, 조정, 필터) | POST-004(결과물 규격) | [features/upload-edit.md](features/upload-edit.md) |
| `AIR` | AI 리뷰 요청·폴링·결과·재요청 | AIREVIEW-001~006 | [features/ai-review.md](features/ai-review.md) |
| `REC` | 기록 캘린더, 월 이동, 이미지 저장 | POST-009 | [features/record.md](features/record.md) |
| `NOTI` | 알림함, 알림 상세, 미읽음 표시, 읽음 처리 | NOTIFICATION-002~004 | [features/notification-push.md](features/notification-push.md) |
| `PUSH` | 알림 권한, 기기 등록, 포그라운드 표시, 탭 이동 | NOTIFICATION-005~006 | [features/notification-push.md](features/notification-push.md) |
| `SET` | 설정(푸시 수신 설정, 계정, 약관, 버전) | NOTIFICATION-006, USER-003 | [features/settings-feedback.md](features/settings-feedback.md) |
| `FDBK` | 피드백 보내기 | FEEDBACK-001~003 | [features/settings-feedback.md](features/settings-feedback.md) |
| `NET` | 공통 네트워크: 오류 파싱, 재시도, 타임아웃, 취소, 401 갱신 | — | [features/common-infra.md](features/common-infra.md) |
| `TIME` | KST 날짜 계산, 날짜 표시 | TOPIC-002, TOPIC-005 | [features/common-infra.md](features/common-infra.md) |
| `ANL` | 분석 이벤트(`screen_view`, `bottom_navigation_selected`) | — | [features/common-infra.md](features/common-infra.md) |

## 5. 앱 시작 흐름(공통)

```text
앱 실행
 └─ 스플래시(홈 데이터 프리로드 최대 700ms)
     └─ 강제 업데이트 게이트 (D-15)
         └─ 인증 게이트: 저장된 세션 읽기
             ├─ 인증 세션(userId + 만료 안 된 refresh token) → 메인(홈) + 푸시 기기 등록
             ├─ 게스트 플래그 → 메인(홈, 게스트 제한)
             └─ 없음 → 로그인
                 ├─ 카카오 → POST /auth/social-login
                 │    ├─ LOGIN_SUCCESS → 메인
                 │    └─ SIGN_UP_REQUIRED → 약관 → 사인 그리기 → 미리보기 → 가입 완료 → 메인
                 └─ 로그인 없이 둘러보기 → 게스트 플래그 저장 → 메인
```

메인은 하단 탭 4개(홈, 전시, 기록, 설정)와 가운데 업로드 버튼이다. 업로드 버튼은 탭이 아니라 진입 게이트를 거쳐 업로드 화면을 연다.

## 6. 다섯 클라이언트 공통 상수

플랫폼마다 코드에 직접 쓰지 말고 한 곳(상수 파일)에 모은다. 값은 `shared/constants.json`에도 두고 테스트로 대조한다.

| 이름 | 값 | 근거 |
| --- | --- | --- |
| `SERVICE_TIME_ZONE` | `Asia/Seoul` | TOPIC-002, TOPIC-005 |
| `FIRST_TOPIC_DATE` | `2026-09-17` | 기존 두 앱 하드코딩(D-12) |
| `POST_TITLE_MAX` | 10 (앞뒤 공백 제거 후 유니코드 code point) | POST-005, D-01 |
| `FEEDBACK_MAX` | 1000 (앞뒤 공백 제거 후 code point), 최소 1 | FEEDBACK-001 |
| `POST_IMAGE_CONTENT_TYPE` | `image/webp`(업로드 정책 응답값을 우선) | POST-004 |
| `POST_IMAGE_MAX_BYTES` | 5,242,880(정책 응답 `maxBytes` 우선) | POST-004 |
| `POST_IMAGE_MAX_LONG_EDGE` | 4096 px | 기존 두 앱 |
| `WEBP_QUALITY_LADDER` | 90, 80, 60, 40 → 실패 시 0.85배 축소, 최대 3회 | 기존 두 앱 |
| `UPLOAD_URL_SAFETY_MARGIN` | 5초(만료 5초 전이면 새로 발급) | 기존 두 앱 |
| `SIGNATURE_PNG_SIZE` | 1024 × 512, 패딩 48, 획 두께 14, 투명 배경 + 흰 획 | 기존 두 앱 |
| `SIGNATURE_MAX_BYTES` | 1,048,576 | SIGN-002 |
| `SIGNUP_PENDING_RETRY` | 1초 간격 최대 10회 | 기존 두 앱 |
| `AI_REVIEW_POLL_INTERVAL` | 3초(홈 포함, D-03) | AI 리뷰 안내 |
| `AI_REVIEW_POLL_WINDOW` | 300초 | AI 리뷰 안내 |
| `RETRY_AFTER_MAX_MS` | 30,000 (`Retry-After`가 이보다 길면 기다리지 않고 실패, 임시) | D-21 |
| `PAGE_SIZE` | 20(배너 10) | 기존 두 앱 |
| `TOAST_DURATION` | 2.5초 | iOS |
| `SPLASH_PRELOAD_MAX` | 700ms | Android |

## 7. 다음에 읽을 것

- 플랫폼 구현 스레드: 이 문서 → [decisions.md](decisions.md) → 작업할 기능의 [features/](features/) 문서 → [../testing/strategy.md](../testing/strategy.md) → 해당 영역의 [../testing/catalog/](../testing/catalog/) 표
- 서버 API가 궁금할 때: [../reference/api-contract.md](../reference/api-contract.md)
- 기존 앱이 이 경우 어떻게 했는지 궁금할 때: legacy-ios / legacy-android 문서에서 기능 절을 찾는다
