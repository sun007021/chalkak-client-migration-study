# chalkak-client-migration-study

찰칵(Chalkak) 클라이언트를 iOS native, Android native, Flutter, React Native, Web app 다섯 가지로 다시 만드는 스터디 레포다. UI는 플랫폼 관례를 따를 수 있지만 **기능 동작과 예외 처리는 다섯 클라이언트가 같아야 한다.** 백엔드는 기존 찰칵 개발 서버(`https://chalkak-dev.pysun.kr/api/v1/`)를 그대로 쓴다.

## 시작점

| 문서 | 내용 |
| --- | --- |
| [docs/spec/00-overview.md](docs/spec/00-overview.md) | 범위, 기능 영역 코드, 앱 시작 흐름, 공통 상수 |
| [docs/spec/decisions.md](docs/spec/decisions.md) | 기존 iOS·Android가 다르거나 버그인 곳의 확정 동작(D-01~) |
| [docs/spec/features/](docs/spec/features/) | 기능별 요구사항(REQ-), 상태, API 호출, 문구 |
| [docs/spec/open-questions.md](docs/spec/open-questions.md) | 확인이 필요한 것과 임시 동작(Q-) |
| [docs/testing/strategy.md](docs/testing/strategy.md) | 테스트 층, 자동화 vs 에이전트 시나리오 기준, PR 단위 TDD 사이클 |
| [docs/testing/catalog/](docs/testing/catalog/) | 영역별 테스트 목록(TC-) |
| [docs/testing/agent-scenarios/](docs/testing/agent-scenarios/) | 서브에이전트가 시뮬레이터에서 직접 확인할 시나리오(AG-) |
| [docs/testing/testids.md](docs/testing/testids.md) | 다섯 플랫폼 공통 요소 식별자 |
| [docs/testing/parity-matrix.md](docs/testing/parity-matrix.md) | 플랫폼별 테스트 통과 현황 |
| [docs/reference/](docs/reference/) | 원본 분석: API 계약, 기존 iOS·Android 앱, 비즈니스 규칙 스냅샷 |

## 레포 구조

```text
docs/          명세·결정·테스트 목록
shared/        공용 fixture, mock 서버, Maestro flow, 상수, 문구, 스크립트
ios/           SwiftUI
android/       Jetpack Compose
flutter/
react-native/
web/
```

플랫폼 폴더와 `shared/`는 각 구현 작업에서 만든다.

## 원칙

- 원본 팀 레포(`woowacourse-teams/2026-Chalkak`)는 읽기만 한다.
- 비밀값(API 키, 테스트 계정, Firebase 설정 파일, xcconfig·local.properties)은 커밋하지 않는다.
- 소셜 로그인은 카카오만 구현한다. Apple·Google은 보류.
