# Flutter 구현 구조와 규칙

찰캌 Flutter 클라이언트의 코드 구조와 테스트 규칙이다. 동작 기준은 [docs/spec/00-overview.md](../docs/spec/00-overview.md) §7 순서(decisions.md가 기존 앱보다 우선)를 따르고, 이 문서는 "Flutter에서 그걸 어떻게 짜는가"만 정한다.

## 1. 기술 선택

| 항목 | 선택 | 이유 |
| --- | --- | --- |
| 상태 관리 | `ChangeNotifier` ViewModel + `ListenableBuilder` | 프레임워크 기본 기능만으로 생성자 주입·Fake 교체가 된다. 외부 상태 관리 라이브러리 없음 |
| 의존성 주입 | `AppDependencies`(생성자 주입) + `AppScope`(InheritedWidget)로 화면에 전달 | 테스트에서 Fake 묶음으로 통째로 교체 |
| HTTP | `dio` | 연결·응답 타임아웃 분리(D-21), 취소(`CancelToken`), `HttpClientAdapter`로 Fake 교체 |
| 라우팅 | `go_router` | 딥링크·푸시 목적지 이동(D-11), redirect로 인증 게이트 |
| 시간 | `package:clock` + 테스트는 `fake_async` | 폴링 3초·300초, 토스트 2.5초, 스플래시 700ms, KST 자정을 실제로 기다리지 않는다 |
| 보안 저장소 | `flutter_secure_storage` (D-17) | `TokenStore` 인터페이스 뒤에 둔다 |
| 카카오 | `kakao_flutter_sdk_user` | `SocialLoginClient` 인터페이스 뒤. E2E 빌드는 Fake |

새 패키지를 추가할 때는 PR 본문에 이유를 적는다.

## 2. 폴더

```text
flutter/
├── lib/
│   ├── main.dart                 실제 의존성으로 AppDependencies를 만들어 실행
│   ├── app/                      App 위젯, 라우터, AppDependencies, AppScope
│   ├── core/
│   │   ├── config/               API_BASE_URL 등 빌드 설정(--dart-define)
│   │   ├── constants/            00-overview §6 상수(하드코딩 금지, 여기서만)
│   │   ├── time/                 KST 계산·표시(TIME)
│   │   ├── text/                 code point 길이(D-01)
│   │   ├── network/              ApiClient, ApiError, 재시도, 401 갱신(NET)
│   │   ├── auth/                 Session, TokenStore
│   │   ├── analytics/            AnalyticsTracker(ANL)
│   │   └── ui/                   토스트, 오류·빈·로딩 상태 위젯, TestIds
│   └── features/<영역>/
│       ├── data/                 DTO, Repository 구현(ApiClient 사용)
│       ├── domain/               모델, Repository 인터페이스
│       └── presentation/         ViewModel(ChangeNotifier), Screen(Widget)
├── test/                         lib/와 같은 구조. *_test.dart
└── tool/check.sh                 format → analyze → test 한 번에
```

## 3. 테스트하기 쉬운 코드 규칙

- ViewModel·Repository·서비스는 의존성을 **생성자로만** 받는다. 전역 싱글턴, `DateTime.now()` 직접 호출 금지(`clock.now()` 사용), `Random()` 직접 생성 금지(주입).
- Screen(Widget)은 ViewModel 상태를 그리기만 한다. 분기·상태 전이·문구 선택은 ViewModel에 있고 `U` 테스트로 검증한다.
- ViewModel 상태는 불변 값 객체(또는 sealed class)로 노출한다. 화면 일회성 이벤트(토스트, 이동)는 별도 이벤트 스트림/콜백으로 내보내고 상태에 섞지 않는다.
- Fake 우선. mocktail 등 mock은 "API를 부르지 않았다", 분석 이벤트처럼 호출 자체가 요구사항일 때만 쓴다.
- 모든 상호작용 요소에 [testids.md](../docs/testing/testids.md)의 id를 `TestIds` 상수로 단다: `Semantics(identifier: id, ...)` + `Key(id)`. 상태 표시 요소는 해당 상태일 때만 트리에 존재한다.
- 사용자 문구는 `shared/copy/ko.json`이 생기면 그 키를 쓴다. 그 전에는 `lib/core/copy/` 한 곳에 모은다.

## 4. 테스트 이름과 실행

- 테스트 이름에 카탈로그 `TC-` ID를 넣는다: `test('TC-TIME-001 UTC 15:00Z는 KST 다음 날이다', ...)`.
- 한 테스트가 여러 TC를 덮으면 이름에 모두 적는다(`TC-NET-012 TC-NET-021 ...`).
- `tool/check.sh`: `dart format --set-exit-if-changed`, `flutter analyze`, `flutter test`. PR마다 통과해야 머지한다.
- fixture는 `shared/fixtures/`가 생기면 `test/support/fixtures.dart`의 로더로 `../shared/fixtures/<영역>/<파일>.json`을 읽는다. 복제하지 않는다.
