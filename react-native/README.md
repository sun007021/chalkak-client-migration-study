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

## 홈·배너·하단 탭 (`src/features/home`, `src/features/banner`, `src/app`)

- **홈 불러오기 규칙(한 곳)**: 응답이 성공하면 교체, 실패하면 "이미 내용이 있으면 유지 + (당겨서 새로고침일 때만) 토스트, 내용이 없으면 그 섹션만 error". 최초·복귀·날짜 변경은 조용히(`quietReload`), 당겨서 새로고침만 `refreshing`과 토스트를 쓴다. 토스트는 한 번에 최대 1건(화면 순서상 첫 실패 섹션, 연결 실패면 `common.error.network`).
- **요청 세트와 세대 번호**: `HomeViewModel`은 요청을 한 세트(`RequestContext`: 세대 번호 + `AbortSignal`)로 묶는다. 새로고침·이탈(`onHidden`)·날짜 변경·`clearAll`이 세대를 올려 이전 세트를 취소하고, 그 응답은 버린다. 취소는 오류가 아니다(`CancelledError` -> 조용히 끝).
- **히어로 = 오늘 응답 + 주간 달력**: 히어로 썸네일은 달력의 같은 `postId`에서 오므로 두 응답이 따로 와도 `publishHero()`가 합쳐서 낸다(달력이 늦으면 썸네일만 나중에 채워진다).
- **ViewModel 소유**: `HomeViewModelOwner`가 `BootViewModel` phase가 `main`에 들어갈 때(회원/게스트 모드와 함께) 홈을 만들어 `UserDataCacheRegistry`에 올리고, 떠나면 해제·dispose한다. `AuthRepository`의 캐시 목록은 생성 시점에 고정되므로 레지스트리 하나만 넣고 나중에 생기는 캐시는 거기에 등록한다. `HomeScreen`은 마운트=`onShown`, 언마운트=`onHidden`만 부른다. 홈 탭은 포커스일 때만 마운트해(`useIsFocused`) 탭 복귀·알림함/상세에서 돌아옴이 모두 "다시 보임"이 된다(REQ-NAV-004, REQ-HOME-040).
- **ISSUE 다음 페이지**: 카드는 세로로 쌓이므로 `HomeScreen`이 스크롤 위치와 카드 위치로 "보이는 마지막 카드"를 계산해 `BannerFeedViewModel.onLastVisibleIndexChanged`에 넘긴다(같은 카드가 마지막인 동안은 되풀이하지 않는다).
- **웹뷰(`react-native-webview` 14.0.1)**: 어댑터(`IssueWebContent`)는 이벤트를 `issueWebBridge`의 순수 함수로 `IssueNavigationRequest`로 바꿔 `IssueWebViewModel.onNavigationRequest`에 넘긴다.
  - `originWhitelist={['*']}`가 필수다. 기본(http/https만)이면 `tel:`·`intent:` 같은 스킴을 라이브러리가 정책을 거치지 않고 `Linking.openURL`로 열어 버린다(REQ-BANR-017).
  - 사용자 제스처: iOS는 `navigationType`(`click`·`formsubmit`). **Android는 `onShouldStartLoadWithRequest`에 제스처가 없다**(네이티브 `hasGesture()`를 버림, `isTopFrame`도 항상 true, 첫 `loadUrl`은 이벤트 자체가 없음). 그래서 Android는 `injectedJavaScriptBeforeContentLoaded`로 신뢰된(`isTrusted`) 링크 클릭을 페이지 안에서 잡아 `preventDefault` 후 메시지로 보내고, 네이티브 요청은 모두 "제스처 없음"(리다이렉트·스크립트 이동 -> block)으로 둔다. 메시지로 제스처만 먼저 알리는 방식은 쓰지 않는다: 메시지(이벤트 디스패처)와 shouldOverrideUrlLoading(JS 직접 호출)의 도착 순서가 보장되지 않는다. **Android 실기기/에뮬레이터 E2E로 확정 필요.**
  - `javaScriptCanOpenWindowsAutomatically={false}`: 제스처 없는 `window.open`은 플랫폼이 막으므로 `onOpenWindow`로 오는 새 창은 제스처가 있는 것으로 본다.
  - jest에서는 `jest.setup.ts`의 가짜 `WebView`가 마지막 props를 `WebView.lastProps`에 남긴다(네이티브 모듈이 없으면 import에서 던진다).
- **jest 함정**: RN jest 목에서 `AppState.currentState`와 `Linking.*`는 `jest.fn`이다. `jest.replaceProperty`/`spyOn`이 거부하므로 값을 직접 넣고 afterEach에서 되돌린다. `Linking`의 호출 기록은 `restoreAllMocks`로 지워지지 않아 `mockClear`가 필요하다.
- **타입 함정(RN 0.88)**: `StyleSheet.absoluteFillObject`가 타입에서 사라졌다. 필요하면 `position: 'absolute', top/left/right/bottom: 0`을 직접 쓴다. `ScrollView` ref 타입은 `ScrollViewInstance`다.
- **React Compiler lint(`react-hooks/refs`)**: 컨테이너처럼 `...Ref` 이름의 프로퍼티(내비게이션 ref)를 가진 객체를 렌더 중 읽으면 "refs during render" 오류가 난다. 그런 값은 `useAppContainer()`로 자식 컴포넌트에서 꺼내 쓰고, 프로퍼티 이름도 `navigationHandle`처럼 Ref로 끝내지 않는다.
- **토스트**: `ToastCenter`(ToastPresenter 구현)가 상태를 들고 `ToastHost`가 그린다(`toast.container`/`toast.message`, 2.5초, 같은 문구도 id가 달라 다시 그림, 백그라운드면 버림).
- **앱 생명주기**: `ReactNativeAppVisibility`는 `active`/`background` 전환만 알린다. iOS `inactive`(알림 센터·앱 전환기)는 곧 돌아오는 상태라 알리지 않는다(알리면 그때마다 홈이 다시 불러온다).

## 전시·피드·좋아요 (`src/features/display`, `src/features/feed`, `src/features/like`, `src/features/post`)

- **좋아요 컨트롤러(`DefaultLikeController`)는 앱 전체가 하나를 공유한다.** 기본 `AppContainer.likes`가 실제 구현이고 로그아웃·계정 전환 때 `UserDataCacheRegistry`가 `clearAll`을 불러 진행 중 요청(abort)과 값을 버린다. 게시물마다 요청은 한 번에 하나, 진행 중 탭은 마지막 의도만 기억한다. 응답 뒤 의도와 서버 값이 다르면 한 번 더 보내고, **실패하면 롤백만 하고 자동으로 다시 보내지 않는다**(LIKE-022). 롤백 대상은 "요청을 시작하기 직전 값"이다. 404는 롤백 뒤 `removed`, PUT 403은 정지 문구, 인증 오류는 아래 공통 정책(롤백만 하고 토스트 없음), 이벤트 밖 취소(`CancelledError`)는 토스트 없이 롤백만 한다. 끝난(idle) 항목은 지우지 않는다: 진행 중인 목록 요청의 `latestSince(id, since)`가 revision으로 찾기 때문이며 `clearAll`에서 비운다. 진행 중에 원래 상태로 되돌렸는데 요청이 실패하면 TC-LIKE-020대로 토스트를 띄운다(검토 요청은 조용히 처리였으나 카탈로그와 충돌해 카탈로그를 따랐다).
- **인증 오류 정책은 `features/common/AuthErrorPolicy` 한 곳**(홈·전시·피드·좋아요 공통): `ReauthenticationRequiredError`는 화면이 아무것도 하지 않고(session-expired 이벤트가 부트 흐름을 로그인으로 보낸다), 남은 401(`AuthenticationRequiredError`)은 `toLogin()`을 같은 세대에서 한 번만 부른다. 두 경우 모두 오류 화면·토스트는 없다. `BootViewModel.toLogin`은 같은 phase로의 전환이라 여러 번 불려도 안전하다.
- **목록·상세 응답과 좋아요 병합은 revision으로 한다.** 요청을 보내기 **전에 동기로** `likes.revision()`을 읽어 두고(첫 `await` 앞), 응답이 오면 `latestSince(id, since)`가 있는 게시물만 덮는다. 요청 시작 뒤에 `await`로 읽으면 그 사이 끝난 좋아요를 "이전 것"으로 오인한다. 홈은 예전 방식(`snapshot()`)이라 이 규칙을 쓰지 않는다.
- **전시 ViewModel은 생성부터 dispose까지 좋아요·`PostChanges`를 구독한다**(상세가 위에 있어 전시가 가려진 동안에도 반영해야 한다). 반대로 **피드는 `onShown`~`onHidden` 동안만** 좋아요를 구독한다(화면 언마운트 시 리스너 0). 둘 다 만들고 버리는 쪽은 소유자다: 전시는 `DisplayViewModelOwner`(메인 단계 동안 유지, `MainPhaseViewModelOwner` 공통), 피드는 `PostDetailRoute`(`useOwnedViewModel`, IssueWebRoute와 같은 StrictMode 안전 방식).
- **전시의 세대 번호와 취소**: 날짜·정렬 선택은 세대 번호만 올리고 **요청은 취소하지 않는다**. 밀려난 요청도 끝까지 받아 (랜덤이 아니면) 캐시에 남겨야 같은 (날짜, 정렬)을 다시 골랐을 때 즉시 보인다(TC-DISP-047). 화면 이탈·`clearAll`·dispose만 abort한다. abort된 요청은 `CancelledError`로 끝나 캐시에도 남지 않는다.
- **랜덤 시드는 (날짜, 랜덤) 캐시 항목에 붙어 있다.** 랜덤이 아닌 정렬로 **확정되면**(응답이 와서 화면이 바뀐 시점) 모든 랜덤 항목을 버린다. 확정 전에 지우면 이동 실패 복원 때 시드 없는 목록이 남는다. 첫 페이지 재검증은 저장된 시드를 보내고, 응답 시드가 같으면 받아 둔 뒤쪽 페이지를 유지한다.
- **날짜 이동은 날짜를 먼저 바꾼다.** `state.date`는 요청 전에 새 날짜가 되어 연타(TC-DISP-038)가 "대기 중인 날짜" 기준으로 이어지고, 실패(404 주제 없음·네트워크)는 `lastGood`(마지막 확정 상태)로 복원한다. 첫 로딩(복원할 것이 없음)만 `navigationLocked`로 이동을 막는다. 오늘이 바뀐 뒤 복귀하면 상한(`today`)만 갱신하고 보던 날짜는 유지해 아카이브(popular)로 취급한다.
- **탭 연동**: 전시 탭은 라우트 파라미터(`date`, `sort`)를 화면을 그리기 **전에** `openDate`로 넘기고 비운다(안 비우면 탭에 돌아올 때마다 같은 날짜로 열림). 소유자가 이미 같은 전시를 불러오는 중이면 `onShown`이 그 요청을 이어받는다. 전시 탭 재선택은 `tabPress` 이벤트 + `navigation.isFocused()`로 구분한다(다른 탭에서 올 때도 이벤트가 온다).
- **접근성 라벨 "좋아요 N개"**는 `shared/copy/ko.json`에 키가 없어 `features/like/likeLabel.ts`의 상수(`LIKE_COUNT_LABEL`)로 조립한다. 키가 생기면 `t()`로 바꾼다.
- **제목 수정 400은 모두 상태 문구(`feed.edit.error.state`)다**(spec §5.2 표·D-02 우선, Android와 동일). 서버 `message`로 분기하지 않고, 다이얼로그는 열린 채 입력을 유지한다.
- **핀치 줌은 제스처 라이브러리 없이** `View`의 `onTouch*`와 `Animated`(JS 구동)로 구현했고, 계산은 `PinchTracker`(순수)가 맡는다. 터치 좌표는 `pageX/Y`라서 `measureInWindow`로 컨테이너 원점을 빼야 컨테이너 좌표가 된다. 원점은 레이아웃 때 미리 재고, 제스처 도중 늦게 온 값은 그리기 전이면 반영·그린 뒤면 다음 제스처로 미룬다(첫 핀치가 튀지 않게). 돌아오는 애니메이션 중 새 핀치는 보이는 중간 배율에서 이어지고, 언마운트 때 애니메이션을 멈춘다. 변환 순서는 `[translateX, translateY, scale]`(CSS와 같은 순서)이라 `photoZoom`의 `translate(pan) -> scale` 정의와 맞는다. **실기기에서 부드러움·한 손가락 제스처와의 충돌은 확인이 필요하다.** 날짜 선택 시트도 네이티브 휠이 아니라 세 열 목록(탭해서 선택)이다.
- **테스트 함정**
  - `void act(async () => …)`처럼 `await` 없는 `act`는 React의 act 범위가 닫히지 않아 **이후 같은 파일의 모든 테스트가 렌더 갱신을 못 본다**(엉뚱한 "요소 없음"으로 실패). 반드시 `await act(...)`.
  - `FixtureRouter.set`은 그 키의 **호출 기록을 새로 시작**한다. 게이트 라우트를 건 뒤의 `callsOf`는 게이트 이후 호출만 센다.
  - 가짜 전송은 응답이 즉시라 `await fireEvent.press(...)`가 끝나기 전에 요청 체인(재시도·롤백 포함)이 모두 끝난다. 중간 상태(낙관 값)를 보려면 라우트를 게이트로 잡아 두었다가 확인한 뒤 풀어야 한다.
  - `toHaveTextContent(문자열)`는 전체 일치다. 다이얼로그처럼 제목·본문이 한 요소에 같이 있으면 `{ exact: false }`를 쓴다.
  - RN 0.88에서 `View`는 함수 컴포넌트 타입이라 `useRef<View>`로는 `measureInWindow`를 못 쓴다. `HostInstance`를 쓴다.
- **`PostChanges`(삭제·제목 변경)는 전시와 홈(랭킹·이번 주 기록)이 구독한다.** 요청이 진행 중일 때 도착한 변경은 그 응답에도 덧입힌다(제목은 변경 순서 번호로 "요청을 보낸 뒤"인 것만, 삭제는 `isDeleted`로 거른다). 전시의 (날짜, 정렬) 캐시는 최근 20개만 둔다(LRU). **미결**: 기록 탭은 아직 없어 구독하지 않는다(해당 PR에서 `container.postChanges`를 구독시킨다). 홈의 히어로(오늘 기록)는 삭제를 즉시 반영하지 않고 다음 복귀 때 서버 값으로 맞춘다. 전시/홈 복귀 재검증을 "1초 안에 끝난 같은 요청이면 생략"하는 최적화는 시계를 고정하는 기존 테스트(TC-DISP-045 등)와 충돌해 넣지 않았다.

## 가입·사인 (`src/features/onboarding`, `src/features/signature`, `src/data/auth/SignUpRepository`)

- 흐름: `SignUpFlowOwner`가 phase `sign-up`(pending과 함께)에 들어갈 때 `SignUpFlowViewModel`을 만들고 버린다(약관 -> 사인 흐름). 사인 흐름(`SignatureFlowViewModel`)은 가입(`onboarding`)과 설정의 사인 변경(`change`)이 같이 쓰고, `AppContainer.createSignatureChangeFlow(host)`로 만든다(호출한 설정 내비게이션이 소유). 화면(`SignUpRoute`)은 구독만 한다.
- 사인 PNG: 순수 TS `SoftwareSignatureRasterizer`(RGBA 버퍼 + 이차 곡선 근사 + 둥근 끝 캡슐의 합집합 + `pako` deflate). 네이티브 의존성이 없어 다섯 플랫폼이 같은 알고리즘을 쓰기 쉽다. 일반 사인(획 수십 개)은 jest에서 1초 안쪽이다. 무압축이면 1024x512 RGBA가 2 MiB라 1 MiB 한도를 넘으므로 압축이 필수다.
- 정규화 식(`fitStrokesToPng`)은 **기존 iOS/Android `SignaturePngEncoder`와 같다**: 점을 캔버스 크기로 나눈 비율로 바꾸고, 박스 한 변이 0.02보다 작으면 0.02로 올리며, 배율 `min((W-2P)/박스폭, (H-2P)/박스높이)`를 비율 좌표에 곱한다. 박스(올린 크기)를 가운데에 두고 점은 박스 왼쪽 위 모서리 기준이라 **한 점이나 직선은 정확히 중앙이 아니다**(원본 동작 그대로). 그리기 영역은 정사각형(`SIGNATURE_CANVAS`)이어야 화면 비율이 유지된다.
- **사인 정규화는 원본 재현**이다(스펙 문서는 고치지 않았다): 한 점·직선은 정확히 중앙이 아니라 최소 박스(0.02)의 왼쪽/위 변에 놓인다. 플랫폼 간 합의가 필요한 "확인 필요 1"(onboarding-signature.md)로 남아 있다.
- 약관 URL 판정(`decideDocumentTarget`)은 Hermes의 `URL` 접근자에 기대지 않고 authority를 직접 해석한다. `\`·공백·제어문자, 소문자 `^[a-z0-9-]+(\.[a-z0-9-]+)*$`에 맞지 않는 호스트(IPv6·유니코드·퍼센트)는 reject, userinfo(`@`)·비 443 포트·http는 external이다. 웹뷰 안 이동도 같은 함수로 다시 판정한다(`onShouldStartLoadWithRequest`). `isAllowedTransportUrl`도 같은 호스트 문법을 쓴다.
- 세션 세대 번호(`SessionStore.generation()`): userId가 바뀌는 저장·삭제에서만 올라간다(같은 계정의 토큰 교체는 아님). `ApiClient`는 Authorization을 붙인 요청의 시작·응답 세대를 비교해 다르면 성공·오류 모두 `CancelledError`로 바꾼다(저장소를 다시 읽지 않는다).
- 가입이 서버에서 받아들여진 뒤 세션 저장 구간(`committing`)에는 뒤로가기를 막는다. 그 전의 진행 중 요청은 뒤로가기로 취소된다.
- 웹뷰는 `react-native-webview`(Expo 번들 버전 고정). `jest.setup.ts`가 네이티브 모듈이 없을 때 던지는 import를 mock으로 막는다.
- 화면 테스트는 `toHaveTextContent('문자열')`이 **전체 일치**라서, 여러 줄 제목·안내(`\n`)는 첫 줄만 testID 요소에 두고 나머지는 다음 요소에 둔다.

## 업로드·편집 (`src/features/upload`, `src/features/photo-edit`, `src/data/post/PostCreationRepository`, `src/core/media`)

**구조.** `UploadEntryGateOwner`(`AppContainer.uploadGateOwner`)가 메인 단계 동안 `UploadEntryGateViewModel`을 소유하고, 하단 + 버튼(`BottomBar`)과 홈 히어로 버튼(`NavigationHomeNavigator.openUploadGate`)이 **같은 게이트**를 누른다(연타는 한 번, 확인 중 표시는 `UploadEntryOverlay`의 `upload-entry.loading`). 게이트를 지나면 `NavigationUploadNavigator`가 `Upload {topicDate}`를 연다. `Upload`/`UploadSuccess` 라우트는 `useOwnedViewModel`로 ViewModel을 만들고 버린다(StrictMode 안전, 화면을 나가면 진행 중 작업·임시 파일 정리). 성공은 `StackActions.replace`라 뒤로 가도 업로드 화면이 없다. 편집기는 별도 화면이 아니라 `PhotoUploadScreen`이 `viewModel.editor`를 위에 덮어 그린다.

**네이티브 라이브러리(정확한 버전).** `expo-image-picker 58.0.10`(시스템 포토 피커/카메라), `expo-image-manipulator 58.0.15`(방향·축소·회전·자르기·WebP 저장), `expo-media-library 58.0.12`(촬영본 갤러리 저장, iOS 사진 추가 권한), `expo-file-system 58.0.11`(임시 파일 읽기·삭제). 실제 구현은 `core/media/Expo*.ts`와 `features/photo-edit/ExpoImageEngine.ts`, 조립은 `createDefaultMediaServices`다. `AppContainer.media`는 `overrides.media ?? 기본 구현`이고 jest는 전부 Fake를 쓴다(Expo 모듈은 jest에서 호출되지 않는다).

**Skia를 쓰지 않았다.** 색 파이프라인(노출·따뜻함·채도 → 감마 → 톤 곡선 → 필터 행렬)은 순수 TS(`PhotoColorTransform`, `renderPixels`)이고, 오라클 테스트가 검증한 **같은 코드**가 업로드 결과를 칠한다. 색이 있는 편집만 `manipulator(기하) → 무손실 PNG → decodePng(pako) → renderPixels → encodePng → manipulator(WebP)`를 거치고, 색이 없는 편집(회전·자르기만, 또는 원본)은 manipulator 한 번으로 끝난다. 중간에 JPEG 같은 손실 압축을 끼우지 않는다. 미리보기도 512px 표본에 같은 함수를 적용한다. **위험**: 12MP 사진에 색을 칠하는 TS 루프는 느릴 수 있다(품질 사다리가 내려가면 같은 칠하기를 다시 한다). 실기기에서 시간·메모리가 문제면 `ExpoImageEngine.paint`만 `@shopify/react-native-skia`(2.14.0, RuntimeShader + 오프스크린 서피스)로 바꾸면 된다. 경계(`ImageEngine`)는 그대로다.

**편집 상수의 단일 출처는 `src/features/photo-edit/filters.json`이다**(원래 `shared/photo-edit/filters.json`; RN이 `shared/`에 파일을 더하지 않는 규칙에 따라 옮김). 스펙 부록 표와 Android(`FilterMatrices.kt`, `PhotoEditConstants`)를 대조해 **차이가 없었다**(필터 5개 행렬, 노출 1.5 EV, 따뜻함 0.25, 블랙 포인트 0.3, 그림자·하이라이트 0.25, 대비 0.6, 최소 자르기 0.1, 분석 긴 변 256, 자동 노출 −0.5~1.0, 목표 흰색 0.96). 스펙 본문(REQ-EDIT-029, 부록 첫 문단)은 아직 `shared/photo-edit/filters.json`을 가리킨다 — 백엔드/공통 문서에서 정리가 필요하다.

**권한(`app.config.ts`).** iOS: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`(앨범은 PHPicker라 실제로는 필요 없지만 라이브러리가 키를 요구), `NSPhotoLibraryAddUsageDescription`(촬영본 저장). Android: 앨범은 시스템 포토 피커, 촬영은 시스템 카메라 앱이라 `CAMERA`·`READ_MEDIA_*`·`RECORD_AUDIO`·`ACCESS_MEDIA_LOCATION`을 `blockedPermissions`로 지운다(라이브러리 매니페스트가 넣는 권한이 설치 화면에 남지 않게). 문구는 스펙에 정해진 카피가 없어 임시 한국어 문구다 — 확정되면 바꾼다.

### ko.json 키 필요

이 PR은 `shared/copy/ko.json`을 고치지 않고 `src/features/upload/localCopy.ts` 상수로 둔다. 키가 생기면 `t()`로 바꾸고 파일을 지운다.

- 앨범 버튼 라벨(`albumButton`), 카메라 버튼 라벨(`cameraButton`), 닫기 접근성 라벨(`closeA11y`)
- 제목 글자 수 형식(`titleCounter`, `{현재}/{최대}`)
- 사진 미리보기 접근성 라벨(`previewA11y`)
- iOS 촬영 저장 권한 안내 본문(`permissionBody`)과 "취소"(`permissionCancel`)
- 편집기 로딩(`editorLoading`)·렌더링(`editorRendering`) 문구, 오류 알림의 "다시 시도"(`editorErrorRetry`)
- 업로드 진입 확인 중 접근성 라벨(`gateChecking`)

### 스펙 충돌·미결

- **REQ-UPL-050 vs TC-UPL-070/072(다시 제출).** 스펙은 "PUT 뒤 POST가 실패하면 같은 uploadId로 POST만 다시"인데 테스트는 다시 제출 때 PUT이 1회 이상 나가는 것을 기대한다. 인코딩 바이트를 **메모리**에 두고(임시 파일은 PUT 직후 지움 — TC-UPL-031이 허용하는 범위 밖의 파일을 남기지 않기 위해) 다시 제출할 때 URL이 아직 유효하면(단조 시계, `expiresInSeconds*1000 − 5000`) 같은 URL로 PUT을 다시 하고, 만료됐으면 PUT 없이 같은 uploadId로 POST한다. 어느 쪽이든 uploadId는 같다. 스펙을 "PUT은 멱등이라 다시 해도 된다"로 고치거나 테스트를 바꿔 하나로 정리해야 한다.
- **생성 404.** 카탈로그(TC-UPL-065)를 따라 `GET /posts/today`로 판정하고 서버 메시지를 보인다. 스펙 표는 일반 생성 오류 문구라고 한다.
- **S3 PUT 403은 재시도하지 않는다**(REQ-UPL-045, `ApiClient`는 네트워크 오류와 5xx만 재시도). TC-UPL-055의 "3회 시도"는 5xx 케이스로 나누어 고쳤다. PUT 403은 `errorCode === 'FORBIDDEN'`일 때만 이용 정지로 본다.
- **`PostChanges`에 `created`를 넣지 않았다.** 구독자(홈·전시)가 `deleted`가 아니면 모두 제목 변경으로 읽는다. 별도 `DefaultPostCreationNotifier`로 알리고, 컨테이너가 구독해 홈 ViewModel을 `refresh()`한다(홈은 복귀 때 `onShown`으로도 다시 불러온다). 기록 PR이 같은 채널을 구독하면 된다.
- 카메라 사용 가능 여부는 동기로 알 수 없어 `ExpoImagePicker.cameraAvailable`은 항상 true다(시뮬레이터에서는 촬영이 실패해 준비 실패 문구가 보인다). iOS 카메라 권한 거부는 던져서 같은 문구가 된다.

### 함정

- 편집값은 "원본 기준 중심 + 돌린 사진 기준 크기"(`CropWindow`)다. 화면 자르기 영역(`CropRect`)은 **돌린 사진 기준 비율**이라 `cropRectToWindow`/`windowToCropRect`로만 오간다. 네이티브 자르기와 TS 렌더러가 같은 픽셀 사각형을 쓰도록 `cropPixelRect` 한 곳에서 정수로 푼다.
- 편집기는 편집값만 확정한다(`onDone(edit)`). 픽셀은 업로드 준비 때 **원본에서 한 번에** 다시 만든다. 편집용 JPEG는 미리보기 전용이다.
- 자동 보정은 분석 키(회전·자르기)가 같으면 다시 하지 않는다. "완료" 때만 최신 자르기로 한 번 더 분석하고 그동안 `rendering-indicator`가 보인다.
- `UploadPreparation`은 세대 번호로 늦은 결과를 버리고, URL 만료는 단조 시계로 본다(`SystemMonotonicClock`은 `performance.now()`를 쓰는 유일한 파일 `core/time/Clock.ts`). POST /posts와 복구용 `GET /posts/today`는 취소 신호를 무시한다(화면을 나가도 서버 결과는 확정해 알린다).
- `useOwnedViewModel`은 구독 시점에 ViewModel을 만들어서 첫 프레임은 null이다. 라우트 컴포넌트는 null이면 아무것도 그리지 않는다.
- `PhotoEditScreen`은 마운트 때 `status === 'loading'`일 때만 `start()`를 부른다(이미 실패한 편집기를 자동으로 다시 시도하면 TC-EDIT-008 오류 알림이 사라진다).
- 이 프로젝트의 eslint는 React Compiler 규칙(`react-hooks/refs`, `set-state-in-effect`)을 켜 둔다. 렌더 중 `ref.current`를 읽거나 쓰는 `PanResponder.create(...)`, effect 안의 동기 `setState`는 막힌다. 끌기 제스처는 `onResponder*` 핸들러를 JSX에 직접 쓰고(`CropFrame`의 `Drag`, `RulerSlider`), 비동기 결과는 `{key, value}`로 저장해 현재 키와 맞을 때만 쓴다.
- `toHaveTextContent(문자열)`는 전체 일치라서, 같은 요소에 다른 텍스트(버튼 등)를 넣으면 실패한다(`photo-edit.error-dialog`와 권한 안내 제목은 텍스트만 가진 요소에 testID를 둔다).
- `AppContainer.create`는 `overrides`를 키별로 옮겨 담는다. 새 의존성(`media` 등)은 `Dependencies`뿐 아니라 `create`의 객체에도 넣어야 테스트의 Fake가 반영된다.
- **실기기 확인 필요**: `readBounds`는 manipulator로 한 번 디코드해 크기를 읽는다(EXIF 방향 반영과 메모리), 90도 회전 방향, 색 칠하기 시간, 눈금자·자르기 제스처의 감도, 시스템 카메라(Android)에서 CAMERA 권한 없이 촬영되는지, 촬영본 HEIC/JPEG 저장 이름.

## Android OkHttp 자동 재시도 끄기 (`plugins/withOkHttpNoRetry.js`, D-21)

- 이유: Android의 RN `fetch`는 OkHttp를 거치고, OkHttp 기본값 `retryOnConnectionFailure(true)`는 연결 실패 때 `POST` 같은 비멱등 요청도 조용히 다시 보낸다. D-21은 재시도를 `ApiClient` 한 곳에서 멱등 요청만 최대 2회로 제한하므로 prebuild 때 `MainApplication.kt`의 `onCreate`(`super.onCreate()` 직후, `loadReactNative` 전)에 `OkHttpClientProvider.setOkHttpClientFactory { createClientBuilder().retryOnConnectionFailure(false).build() }`를 넣는다. `createClientBuilder()`라서 RN 기본 쿠키 저장소(`ReactCookieJarContainer`)와 타임아웃 0은 유지된다.
- 마커 주석(`@generated begin chalkak-okhttp-no-retry`)으로 멱등이다. 삽입 위치를 못 찾으면(템플릿 변경) prebuild가 오류로 멈춘다. Java `MainApplication`은 지원하지 않고 오류를 낸다.
- **E2E 확인 항목(Android)**: 응답을 받기 전에 연결을 끊는 서버로 `POST`(예: `POST /posts`)를 보냈을 때 서버에 요청이 **한 번만** 도착하는지 본다(재전송 없음). 멱등 요청(GET)은 `ApiClient`의 재시도(최대 2회)만 일어나는지도 확인한다.
