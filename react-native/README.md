# 찰캌 React Native

Expo SDK 58 + TypeScript(strict). CNG(prebuild) 방식이라 `ios/`, `android/`는 커밋하지 않는다(카카오 로그인 네이티브 모듈 때문에 Expo Go가 아니라 dev client로 실행).

## 실행

Node 22(`.nvmrc`)가 필요하다.

```bash
cd react-native
nvm use                    # Node 22
npm ci
cp .env.example .env       # API_BASE_URL 설정(아래 참고). .env는 커밋되지 않는다
npx expo prebuild          # ios/, android/ 생성(gitignore)
npx expo run:ios           # 또는 run:android (dev client 빌드)
```

### API_BASE_URL

- 값은 **서버 origin**이다(예: `https://chalkak-dev.pysun.kr`). 앱이 `/api/v1/`을 붙이며, 끝 슬래시나 `/api/v1` 접미가 이미 붙어 있어도 중복 없이 정규화한다(REQ-NET-003).
- https만 허용한다(REQ-NET-001). 예외로 **E2E mock 서버**를 위해 loopback 호스트(`localhost`, `127.0.0.1`, `10.0.2.2`)의 http는 허용한다(팀장 결정). mock 서버가 개발 머신에 평문 http로 뜨고 외부로 나가지 않는 주소이기 때문이다. 같은 규칙이 `src/core/config/AppConfig.ts` 주석에도 있다.
- **기본값이 없다**(REQ-NET-002). 값이 없거나 잘못되면 개발 서버로 대신하지 않고 요청 없이 설정 오류 화면(`common.error.config`)을 보인다. 그래서 `app.config.ts`도 환경변수를 `extra`로 그대로 넘기기만 한다.
- 로컬 실행: `.env.example`을 `.env`로 복사하거나 셸에서 지정한다. 환경변수는 `expo start`/`prebuild` 시점의 app config 평가에서 읽히므로 값을 바꾸면 다시 시작한다.

```bash
API_BASE_URL=http://localhost:4010 npx expo start   # E2E mock 서버(loopback http)로 덮어쓰기
API_BASE_URL=http://10.0.2.2:4010 npx expo run:android   # Android 에뮬레이터에서 호스트의 mock 서버
```

## 스크립트

| 명령                   | 내용                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | ESLint(flat config, eslint-config-expo + prettier). 시스템 시계 직접 호출 금지 규칙 포함                                                                      |
| `npm run format`       | Prettier 적용                                                                                                                                                 |
| `npm run format:check` | Prettier 검사(`prettier --check .`)                                                                                                                           |
| `npm run typecheck`    | `tsc --noEmit`                                                                                                                                                |
| `npm test`             | Jest(`jest-expo`, 설정은 `jest.config.ts`) + `@testing-library/react-native`                                                                                  |
| `npm run test:tz`      | `src/core/time` 테스트만 TZ를 America/Los_Angeles, Pacific/Kiritimati, Pacific/Pago_Pago, UTC, Asia/Seoul로 바꿔 5번 실행(기기 시간대 독립 검증, TC-TIME-003) |
| `npm run verify`       | `lint` -> `format:check` -> `typecheck` -> `test` -> `test:tz` (CI와 동일)                                                                                    |

도구류(typescript, jest, eslint, prettier, @testing-library/react-native, ts-node)는 정확한 버전으로 고정한다(`.npmrc`의 `save-exact=true`).

## 폴더 구조와 레이어 규칙

```
src/core/      플랫폼·인프라 인터페이스와 구현(Clock, 저장소, http, 토스트, 분석, config, state)
src/data/      API DTO, 클라이언트, 리포지토리
src/features/<영역>/   ViewModel(순수 TS 클래스) + 화면 컴포넌트
src/app/       루트 컴포넌트, 내비게이션, AppContainer(DI) + React Context
src/shared/    공통 UI 컴포넌트·상수
```

- 의존 방향: `app` -> `features` -> `data` -> `core`, `shared`는 어디서든 사용 가능. 아래 층이 위 층을 import하지 않는다.
- 의존성(네트워크, 저장소, 시계, 토스트, 분석 등)은 인터페이스 뒤에 두고 생성자로 주입한다. 조립은 `AppContainer`에서만 하고 화면은 `useAppContainer()`로 받는다.
- 시간 의존 로직은 `Clock`과 `jest.useFakeTimers`로 테스트한다. 실제로 기다리지 않는다. `src/core/time/__testing__/advanceTime(fakeClock, ms)`가 둘을 함께 전진시킨다.
- 시스템 시계(`new Date()`, `Date.now()`, `performance.now()`)는 `Clock.ts`와 테스트 코드 밖에서 ESLint 오류다(TC-TIME-029).
- `AppContainer.create(config, overrides?)`가 의존성을 조립한다. 전역 설정(`expo-constants`)은 앱 루트 `index.ts`의 `readAppConfig()` 한 곳에서만 읽는다.

## ViewModel 패턴

React와 무관한 TS 클래스가 `Observable<State>`를 상속해 상태를 들고 `subscribe/getSnapshot`을 노출한다. 상태 전이는 `setState`로만 한다. 화면은 `useViewModelState(vm)`(`useSyncExternalStore`)로 구독만 하고 분기 로직을 갖지 않는다. `useViewModelState(vm, selector)`는 선택 결과를 `Object.is`로 비교해 바뀔 때만 리렌더한다(selector는 기본형이나 기존 참조를 돌려줘야 한다). 구독자 0->1/1->0 시점에 `onFirstSubscribe`/`onLastUnsubscribe` 훅이 불리고 `dispose()`가 모든 구독을 해제한다. 리스너 예외는 격리되어 `reportError`(기본 `console.error`)로 보고된다. 예시는 `src/core/state/*.test.ts(x)`, 테스트 헬퍼는 `src/core/state/__testing__/`.

## 테스트 규칙

- 테스트 위치는 소스 옆 `*.test.ts(x)`로 통일한다.
- 테스트 이름에 카탈로그 `TC-` ID를 넣는다: `it('TC-TIME-001 ...')`. (골격 단계의 기반 테스트는 ID 없음)
- 요소는 `docs/testing/testids.md` 그대로 `testID` prop으로 단다. 조회는 `getByTestId`.
- RNTL 14에서는 `render`, `act`, `fireEvent` 등이 비동기라 `await`가 필요하다.
- `react-native-safe-area-context`는 `jest.setup.ts`에서 공식 mock으로 대체한다(없으면 SafeAreaProvider가 아무것도 그리지 않는다).

## shared 연결

- `src/shared/constants.ts`는 `../shared/constants.json`을, `src/shared/copy.ts`는 `../shared/copy/ko.json`을 직접 import한다(값 복제 없음). 화면은 `t('키')`로 문구를 읽는다.
- 프로젝트 밖(`react-native/` 위 폴더) JSON을 import하려면 세 곳 설정이 필요하다: `metro.config.js`의 `watchFolders`(없으면 번들 때 해석 실패), `tsconfig.json`의 `resolveJsonModule`과 `include`, Jest는 별도 설정 없이 동작.
- 상수 이름이 JSON 키와 다르면 `src/shared/constants.test.ts`의 매핑 표에 적는다. JSON에 키가 늘면 이 테스트가 실패해 RN 반영을 강제한다.

## 네트워크 계층·세션 저장소 (`src/core/http`, `src/core/session`)

- 진입점은 `ApiClient`(`AppContainer.api`). 성공은 값, 실패는 `ApiError` 하위 클래스 throw. 경로·메서드에 따른 인증 수준·재시도 여부는 `RequestPolicy`, 타임아웃·백오프·재시도 횟수는 `src/shared/constants.ts`(shared/constants.json)에서 가져온다.
- `Retry-After`가 공용 상수 `RETRY_AFTER_MAX_MS`(30초)보다 길면 자르지 않고 재시도를 포기해 실패로 돌려준다. `Retry-After` 없는 429는 재시도하지 않고 503은 백오프한다.
- 세션은 `chalkak.session` 키 하나에 JSON으로 저장해 원자적이다(`SecureSessionStore`). JWT 두 개(각 약 300~500자)와 메타를 합쳐 약 1~1.5KB로 추정해 expo-secure-store의 2KB 경고선 안쪽이다. 넘으면 저장은 하되 `warn`으로 경고만 남긴다.
- 보안 저장소 읽기 예외·손상 값은 "세션 없음"으로 보고 항목을 지운다. 세션이 바뀐 뒤 도착한 응답은 `CancelledError`로 조용히 끝나며 다른 계정 토큰으로 재전송하지 않는다.
- 401 갱신: single-flight만으로는 부족하다. 401 처리 중 저장소를 읽는 사이 다른 요청의 갱신이 끝나면 옛 refresh token으로 두 번째 refresh가 나가 서버가 세션 전체를 폐기한다. 그래서 `TokenRefresher`가 refresh 직전에 저장소를 다시 읽어 이미 회전됐으면 네트워크 없이 새 세션을 돌려준다.
- **한계**: RN `fetch`(네이티브 네트워킹)는 `redirect: 'manual'` 옵션을 무시하고 리다이렉트를 자동으로 따라간다. 그래서 REQ-NET-016(비 https 리다이렉트 금지)을 요청 전에는 막을 수 없고, `FetchTransport`가 응답 후 최종 `response.url`을 검사해 https(또는 loopback http)가 아니면 `NetworkError`로 처리한다(이미 평문 요청이 나갔을 수 있다는 점은 남는다). presigned 업로드 URL은 보내기 전에 같은 규칙으로 거부한다.
- 경로 규약: `ApiRequest.path`는 `/`로 시작하고 쿼리·후행 `/`가 없어야 한다(어기면 `RequestPolicy`가 바로 throw). 동적 조각은 `apiPath\`/posts/${id}\``로 인코딩한다.
- 저장소 읽기 실패로 세션을 버린 경우, 인증 상태였던 요청은 `ReauthenticationRequiredError` + `session-expired` 이벤트로 끝난다(`SessionStore.loadChecked().discarded`).
- 테스트: fixture는 `src/core/http/__testing__/loadFixture.ts`로 `shared/fixtures`를 읽는다(상태·헤더는 manifest). `FakeSecureKeyValueStorage.holdNextRead()`/`failNextRead`로 경쟁·읽기 예외를 결정적으로 재현한다.

## 앱 시작·인증 (`src/features/boot`, `src/features/auth`, `src/core/auth`)

- 흐름: `BootViewModel`(phase `splash -> update-required|login|sign-up|main`)이 단일 출처이고 `AuthFlowNavigator`를 구현한다. `App.tsx`의 `AppShell`이 `start()`를 부르고 `BootHost`가 phase별로 하나만 그린다. 스플래시 700ms 상한은 프리로드 시작부터 센다.
- 강제 업데이트: 설정 `FORCE_UPDATE_CHECK_ENABLED=true`(app.config `extra.forceUpdateCheckEnabled`)일 때만 조회한다(기본 꺼짐). iOS는 iTunes lookup, Android는 `PlayUpdateClient` 인터페이스 + 항상 "조회 불가 -> 통과"인 기본 구현(Play In-App Update 네이티브 모듈 미연결).
- 카카오 로그인: `@react-native-seoul/kakao-login`이 `login({nonce})`/`loginWithKakaoAccount({nonce})`로 OIDC nonce를 받는다(iOS `loginWithKakaoTalk(nonce:)`, Android `loginWithKakaoTalk(nonce=)`). SDK에는 SHA-256 hex(`nonceHash`), 서버에는 `rawNonce` 원문을 보낸다. 라이브러리가 톡 설치 여부를 노출하지 않아 `SeoulKakaoSdk.isTalkAvailable()`은 true 고정이고 톡->계정 폴백은 `login()` 내부와 `KakaoSocialLoginClient`가 함께 처리한다. 취소·설정 누락은 네이티브가 코드 없이 메시지만 주므로 `mapKakaoSdkError`가 메시지로 분류한다.
- 환경변수(모두 커밋 금지): `KAKAO_NATIVE_APP_KEY`(없으면 config plugin을 빼고 로그인은 설정 오류로 끝남), `APP_STORE_ID`, `APP_VARIANT`·`E2E_KAKAO_ID_TOKEN`(E2E 빌드 전용, 카카오 SDK 대신 fixture idToken 사용).
- SHA-256은 동기 계약(`NonceGenerator.generate()`) 때문에 순수 TS 구현(`sha256Hex`)이고 난수만 `expo-crypto.getRandomBytes`를 쓴다.
- **ViewModel 소유 규칙: ViewModel은 화면이 아니라 내비게이션/소유자가 만들고 버린다.** 화면 컴포넌트는 받은 ViewModel을 `useViewModelState`로 구독만 하고 생성·`dispose()`·`screen_view` 전송을 하지 않는다(StrictMode의 effect 이중 실행에 흔들리지 않게). 로그인은 `LoginViewModelOwner`가 `BootViewModel`의 phase가 `login`에 들어갈 때 만들고 `screen_view login`을 1번 보내며 떠날 때 dispose한다. `AccountActionsViewModel`(설정 PR)도 설정 화면 소유자(내비게이션)가 만들고 버린다. 화면 이탈 중 도착한 결과는 ViewModel의 dispose 뒤 무시된다.
- 로그아웃: `AuthRepository.clearLocalSession()`(세션·캐시·푸시 등록 캐시, 한 단계가 실패해도 나머지를 시도)을 await한 직후 `toLogin()`하고, 서버 폐기(`revokeRefreshToken`, 실패 무시·절대 reject 없음)는 기다리지 않는다. 로컬 정리가 실패해도 로그인으로 보내고 오류는 `reportError`(기본 console.error)로만 남긴다.
- 카카오 오류 분류(`mapKakaoSdkError`)는 라이브러리 6.0.4 네이티브 소스에서 확인한 토큰(iOS `ClientFailed(Cancelled)`·`MustInitAppKey`, Android `Cancelled`·`kakao_app_key`)만 쓴다. Android 실제 문구와 시뮬레이터(카카오톡 없음)에서 계정 로그인으로 넘어가는지는 E2E에서 확정한다(`SeoulKakaoSdk.isTalkAvailable()`은 true 고정이라 `login()` 내부 폴백에 의존).
- E2E 빌드: `APP_VARIANT=e2e E2E_KAKAO_ID_TOKEN=<fixture idToken> API_BASE_URL=http://localhost:4010 npx expo prebuild && npx expo run:ios`. `app.config.ts`는 `APP_VARIANT=e2e`일 때만 토큰을 `extra`에 싣고, `selectSocialLoginClient`도 `appVariant === 'e2e'`일 때만 Fake를 고른다(배포 빌드에서 우회 불가).
