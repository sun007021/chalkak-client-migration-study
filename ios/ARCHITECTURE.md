# iOS 구조와 작업 규약

SwiftUI 앱(`App/`)과 플랫폼 독립 로직 패키지(`ChalkakKit/`)로 나눈다. **분기·상태 전이·네트워크 정책은 전부 ChalkakKit에 두고 Linux에서도 테스트한다.** 앱 타깃은 화면을 그리고 OS API(Keychain, 카카오 SDK, 사진, 푸시, WebP 인코딩)를 프로토콜 구현으로 꽂기만 한다.

명세 우선순위는 [../docs/spec/00-overview.md §1](../docs/spec/00-overview.md)을 따른다(decisions.md가 기존 앱보다 우선).

## 1. 폴더

```text
ios/
├── ChalkakKit/                 SwiftPM. Foundation + Observation만 쓴다(UIKit·SwiftUI·Security·Combine 금지)
│   ├── Sources/ChalkakCore     상수(AppConstants), 시계(AppClock), KST 날짜, 오류 모델, 문구(Copy), 분석 인터페이스
│   ├── Sources/ChalkakNetwork  HTTPTransport 프로토콜, APIClient(헤더·401 갱신·재시도·타임아웃·오류 매핑), Endpoint
│   ├── Sources/ChalkakData     DTO(Codable), Repository 프로토콜과 API 구현, SessionStore 프로토콜
│   ├── Sources/ChalkakFeatures 화면별 @MainActor @Observable ViewModel, 라우팅·토스트 상태
│   └── Tests/*Tests            Swift Testing. Fakes/는 각 테스트 타깃 안에 둔다
├── App/                        XcodeGen(project.yml). SwiftUI View, 플랫폼 구현체, 조립(AppContainer)
│   ├── Sources/Platform        KeychainSessionStore, URLSessionTransport, KakaoLoginClient, WebP 인코더 등
│   ├── Sources/Features        View. ViewModel 상태를 그리기만 한다
│   └── UITests                 XCUITest(필요한 것만, 대부분은 Maestro E2E로)
└── scripts/test.sh             ChalkakKit 테스트(로컬 swift 또는 Docker)
```

## 2. 계층 규칙

- 의존 방향: Features → Data → Network → Core. 역방향 import 금지.
- 모든 외부 효과는 프로토콜 뒤에 두고 생성자로 주입한다: `HTTPTransport`, `SessionStore`, `AppClock`, `UUIDProvider`, `SocialLoginClient`, `ImageEncoder`, `PushTokenProvider`, `PermissionChecker`, `AnalyticsTracker`, `GuestFlagStore` 등. 싱글턴·전역 상태 금지.
- ViewModel은 `@MainActor @Observable final class`. 상태는 `enum` 또는 값 타입으로 노출하고 View는 그리기만 한다. 사용자 문구는 ViewModel이 `Copy`에서 골라 상태에 담는다(View에서 분기해 문구 고르지 않음).
- 오류: 네트워크 계층은 `APIError`(`.http(status, code, message)`, `.network`, `.invalidResponse`, `.cancelled`)만 던진다. `message`는 표시·로그용이고 분기는 `status + errorCode + 호출 API`로만 한다(D-02). 취소(`CancellationError`, `URLError.cancelled`)는 오류로 바꾸지 않고 그대로 전파한다(D-20).
- 시간: `Date()`, `Task.sleep`, `Calendar.current`, `TimeZone.current`를 직접 부르지 않는다. `AppClock`(now, sleep)과 `KST` 유틸만 쓴다. 테스트는 `TestClock`으로 시간을 앞당긴다.
- 상수는 `AppConstants`, 문구는 `Copy`에 모은다. `shared/constants.json`, `shared/copy/ko.json`이 생기면 테스트로 대조한다.
- 동시성: Swift 6 strict concurrency. 공유 가변 상태는 `actor`로. `@unchecked Sendable` 금지(테스트 Fake는 actor 또는 Mutex 패턴).
- Linux 호환: URLSession 타입이 필요하면 `#if canImport(FoundationNetworking) import FoundationNetworking #endif`. 단, 실제 URLSession 호출은 App의 `URLSessionTransport`에만 둔다.

## 3. 테스트 규약

- 프레임워크: Swift Testing(`import Testing`, `@Test`, `#expect`). 이름에 TC ID: `@Test("TC-NET-012 401이면 refresh 1회 후 원 요청을 1회 재전송한다")`.
- 한 TC를 여러 테스트로 나눌 땐 같은 ID를 반복해도 된다. 카탈로그에 없는 보조 테스트는 ID 없이 쓴다.
- Fake 우선. 호출 기록은 Fake가 배열로 남기고 `#expect`로 검사한다. 실제로 기다리는 테스트(`Task.sleep` 실시간) 금지.
- fixture: `shared/fixtures/<영역>/<이름>.json`을 상대 경로로 읽는다(`Fixture.load("auth/refresh__success.json")`). 복제하지 않는다. shared/가 아직 없으면 그 TC는 `U`만 먼저 쓰고 `C`는 shared/ 머지 후 추가한다.
- 실행: `ios/scripts/test.sh` (필터: `ios/scripts/test.sh --filter "TC-NET"`). CI(`.github/workflows/ios.yml`)는 Linux에서 ChalkakKit, macOS에서 ChalkakKit + 앱 빌드 + UI 테스트를 돈다.
- 화면 요소에는 [../docs/testing/testids.md](../docs/testing/testids.md)의 식별자를 `.accessibilityIdentifier`로 단다.

## 4. 빌드(로컬 Mac)

```bash
brew install xcodegen
cp ios/App/Config/Secrets.example.xcconfig ios/App/Config/Secrets.xcconfig   # 값 채우기
cd ios/App && xcodegen generate && open Chalkak.xcodeproj
```

mock 서버 E2E 빌드는 `API_BASE_URL`을 `http://localhost:4010/api/v1/`로 바꾼다(DEBUG 빌드에서만 localhost http 허용).

## 5. PR 사이클

[../docs/testing/strategy.md §5](../docs/testing/strategy.md)대로 테스트 작성 → 구현 → `scripts/test.sh` + CI → 코드 리뷰 → 머지. PR마다 [parity-matrix.md](../docs/testing/parity-matrix.md)의 iOS 열과 testids.md의 iOS 관련 칸만 고친다.
