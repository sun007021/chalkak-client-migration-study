# Android 구조

Kotlin + Jetpack Compose. 기존 `client/android`를 옮기지 않고 새로 작성한다. 명세는 [docs/spec](../docs/spec/), 테스트 목록은 [docs/testing/catalog](../docs/testing/catalog/)이다.

## 모듈

로직은 Android SDK 없이 JVM에서 테스트되도록 순수 Kotlin 모듈에 둔다. Android 모듈은 화면과 플랫폼 어댑터만 가진다.

| 모듈 | 종류 | 내용 |
| --- | --- | --- |
| `:core:common` | Kotlin/JVM | `Clock`, KST 날짜 계산·표시(`TIME`), 제목 길이(D-01), 공통 상수(`AppConstants`), `Result` 계열 |
| `:core:network` | Kotlin/JVM | OkHttp + kotlinx.serialization. `ApiError` 파싱, 401 갱신(single-flight), 재시도·타임아웃(D-21), 토큰 헤더 규칙(D-17) |
| `:core:data` | Kotlin/JVM | API DTO, Repository 구현, `TokenStore`·`SessionStore` 인터페이스 |
| `:feature:<영역>` | Kotlin/JVM | 화면 상태 holder(`*StateHolder`): `StateFlow<UiState>` + 이벤트 처리. 주입받은 `CoroutineScope`에서 돈다. Android `ViewModel`은 앱 모듈에서 이것을 감싸기만 한다 |
| `:feature:navigation` | Kotlin/JVM | 백스택, 탭 상태, 게스트 정책, 토스트(`ToastHost`) 등 내비게이션 로직 |
| `:app` | Android | Compose 화면, `ViewModel` 래퍼, Keystore 토큰 저장소, 카카오 SDK·FCM·Play In-App Update 어댑터, 수동 DI |

`:app`은 Android SDK가 있을 때만 `settings.gradle.kts`에 포함된다(`local.properties`의 `sdk.dir` 또는 `ANDROID_HOME`). SDK 없는 환경에서도 `./gradlew test`로 순수 모듈 테스트가 돈다.

## 규칙

- 의존성은 생성자 주입. 시계, 토큰 저장소, 네트워크, 이미지 인코더, 분석, 권한 조회는 인터페이스 뒤에 둔다([strategy §2](../docs/testing/strategy.md)).
- 시스템 시계(`System.currentTimeMillis`, `Instant.now()`, `LocalDate.now()`)를 직접 부르지 않는다. `Clock`만 쓴다.
- 상수는 `AppConstants`에만 둔다. `shared/constants.json`과 같은지 테스트로 대조한다.
- 사용자 문구는 `shared/copy/ko.json`의 키로 참조한다. 테스트는 그 파일의 값으로 문구를 검증한다.
- 테스트 이름에 TC ID를 넣는다: `` `TC-TIME-001 UTC 15시는 KST 다음 날이다`() ``.
- fixture는 `../shared/fixtures/`를 직접 읽는다(테스트 유틸 `Fixtures.read("home/posts-today__not-posted.json")`). 복제하지 않는다.
- 테스트: JUnit 5 + kotlin-test, kotlinx-coroutines-test(가상 시간), OkHttp MockWebServer, Turbine.

## 빌드·테스트 메모

- `cd android && ./gradlew :core:common:test`. 셸 로케일이 POSIX인 환경(CI 컨테이너)에서는 한글 테스트 이름이 클래스 파일 이름이 되어 Kotlin 컴파일러가 `InvalidPathException`으로 죽는다. `LC_ALL=C.UTF-8`을 지정한다.
- 테스트는 `-Dshared.dir`(= 레포의 `shared/`)로 상수와 fixture를 읽는다. `Fixtures`·`FakeClock`은 지금 `:core:common`의 `src/test/.../testing/`에 있고, 다른 모듈이 필요로 하면 `:core:testing`으로 옮긴다.
- 시스템 시계 직접 호출 금지(TC-TIME-029)는 `UploadAndSanityTest`가 `android/**/src/main/**/*.kt`를 정적 검사한다. 허용 파일은 `SystemClock.kt` 하나뿐이다.

## `:app` 모듈

`com.stonefive.chalkak`(applicationId·namespace, Q-15), minSdk 26, compile/target 36. AGP 9.3.1 · Kotlin 2.2.10 · Gradle 9.5.0 · Compose BOM 2026.02.01.

```
app/src/main/kotlin/com/stonefive/chalkak/
  ChalkakApplication.kt   AppContainer 생성
  MainActivity.kt         setContent { ChalkakTheme { ChalkakRoot(copy, deps) } }. 현재 Activity 등록·해제, Play 업데이트 결과 launcher 등록
  di/AppContainer.kt      수동 DI. 시계, OkHttp, ApiClient, 세션 저장소, Repository, BootGate, AuthEvent 릴레이(SharedFlow, 수집자 모두에게 전달),
                          UserDataResetter, SignupContext. newRootDependencies()가 화면 holder 팩토리를 만든다
  data/                   SecretCipher(Keystore AES-GCM), KeystoreRecordStorage(SecureRecordStorage 어댑터)
  platform/               플랫폼 어댑터(아래). PlatformAdapters가 묶고 headless()는 JVM 테스트용 빈 구현
  copy/Copy.kt            ko.json 조회(`copy["app.name"]`, `copy.format("display.picker.day", "n" to 5)`), LocalCopy
  ui/ChalkakRoot.kt       루트. BootState와 NavigationController.state로 화면을 고른다. `testTagsAsResourceId = true`는 여기 한 곳에만 둔다
  ui/RootSession.kt       회전을 넘어 유지되는 호스트 상태(NavigationController, 가입 시도 번호, 사인 PNG, 토스트). rememberStateHolder로 ViewModel에 둔다
  ui/boot/                SplashScreen, UpdateGateDialog
  ui/login/               LoginScreen(무상태) + LoginRoute(holder 연결)
  ui/terms/               TermsScreen, TermsRoute(문서 시트 상태), LegalDocSheet, LegalWebView
  ui/signature/           SignatureScreen(그리기), SignaturePreviewScreen, SignupPreviewRoute, ChangeSignaturePreviewRoute
  ui/components/          Controls(버튼, 알림, BlockingLayer, ScreenGoneEffect), ToastLayer(`toast.container`, `toast.message`)
  ui/theme/               ChalkakTheme, 색, Pretendard·Continuous·Griun 폰트
  viewmodel/              StateHolderViewModel, rememberStateHolder
app/src/kakaoOn/kotlin/.../platform/KakaoSdkFactory.kt    실제 Kakao SDK 어댑터 (-PkakaoNativeAppKey 있을 때만 컴파일)
app/src/kakaoOff/kotlin/.../platform/KakaoSdkFactory.kt   SDK 없는 빌드의 대체(UnconfiguredKakaoSdk → 로그인은 `auth.login.error.config`)
app/src/fcmOn/kotlin/.../platform/                         FCM 어댑터(FcmTokens, ChalkakMessagingService; -PfcmProjectId 있을 때만 컴파일)
app/src/fcmOff/kotlin/.../platform/FcmTokens.kt            Firebase 없는 빌드의 대체(토큰 없음 → 기기 등록은 건너뜀)
```

화면(`ui/**`)은 상태를 갖지 않는다. 상태와 로직은 `:feature:*` holder가 갖고, 화면은 `StateFlow`를 그리고 이벤트를 holder로 넘긴다. 예외는 문서 시트처럼 순수 표시 상태(열림, 로드 시도 번호)뿐이다. 화면을 떠날 때 holder 작업을 취소하는 `onScreenGone()`은 `ScreenGoneEffect`로 부른다. 화면 회전(Activity 재생성) 중에는 호출하지 않아 진행 중인 로그인·가입이 이어진다.

### 플랫폼 어댑터 (`platform/`)

`:feature:*`가 정의한 포트를 구현한다. `PlatformAdapters.android(context)`가 만들고 `AppContainer`가 holder에 넘긴다.

| 포트 | 구현 | 비고 |
| --- | --- | --- |
| `SocialLoginClient` | `KakaoSocialLoginClient(KakaoSdkFactory.create(...))` 또는 `FakeSocialLoginClient` | Fake는 `fakeSocialLogin=true`인 **debug** 빌드에서만(BuildConfig 두 값이 모두 참일 때). release는 항상 Kakao |
| `KakaoSdk` | kakaoOn: `KakaoSdkAdapter`(`UserApiClient.loginWithKakaoTalk`·`loginWithKakaoAccount`에 해시 nonce 전달, `OAuthToken.idToken`) / kakaoOff: `UnconfiguredKakaoSdk` | 로그인은 Activity가 필요해 `CurrentActivity`를 쓴다 |
| `UpdateChecker`·`UpdateLauncher` | `PlayUpdateSourceAdapter`, `PlayUpdateLauncher`(IMMEDIATE, 불가하면 `StoreOpener`로 스토어 열기) | `ConfiguredUpdateChecker`가 `forceUpdateCheck`가 꺼져 있으면 조회 없이 통과시킨다 |
| `ExternalBrowser` | `AndroidExternalBrowser` | 약관 URL 중 앱 안 허용 호스트가 아닌 것 |
| `SignatureImageEncoder` | `AndroidSignatureEncoder` | `android.graphics`. 규칙은 순수 `SignaturePngEncoder`와 같다 |
| `AnalyticsTracker`, `PushRegistrar`, `DeviceRegistrar`, `HomePreloader` | `LogAnalyticsTracker`, `NoopPushRegistrar`, `ReadyHomePreloader` | Firebase·FCM·홈 preload는 이후 PR이 교체 |

Activity 참조 규칙: 어댑터는 Activity를 직접 쥐지 않는다. `CurrentActivity`(WeakReference)를 `MainActivity`가 `onCreate`에 등록하고 `onDestroy`에 해제하며, Play 업데이트 결과 launcher(`UpdateFlowBridge.launcher`)도 `onDestroy`에서 해제한다(launcher가 Activity의 result registry를 붙잡기 때문).

법적 문서 `WebView`(`LegalWebView`)는 `LegalDocuments.classify`가 앱 안(InApp)으로 판정한 https `notion.com|so|site` 호스트만 로드하고, 다른 이동은 모두 막는다. JS와 DOM storage만 켜고 file·content 접근과 mixed content는 끈다.

### 빌드 설정

- `API_BASE_URL`(BuildConfig)은 서버 origin만 갖는다. 앱이 `/api/v1`을 붙인다. debug 기본값 `http://10.0.2.2:4010`(mock 서버), release 기본값 `https://chalkak-dev.pysun.kr`. `-PapiBaseUrl=https://...`로 바꾼다. 잘못된 값이면 `AppContainer`가 시작할 때 실패한다(`ApiBaseUrl.parse`, REQ-NET-001/002).
- cleartext는 debug 소스셋의 `network_security_config.xml`에서 `localhost`, `127.0.0.1`, `10.0.2.2`만 허용한다. main은 전부 금지다.
- 문구와 상수: `copySharedAssets<Variant>` Gradle 태스크가 `shared/copy/ko.json`, `shared/constants.json`을 빌드 때 `assets/shared/...`로 복사한다(`app/build/generated/sharedAssets`). 복사본을 커밋하지 않고, `shared/`가 바뀌면 태스크가 다시 돈다. 런타임에는 `Copy.load(context)`가 읽는다.
- 세션 저장: `KeystoreRecordStorage`는 `SecureRecordStorage`(`:core:data`)를 구현한다. 여섯 값을 JSON 한 덩어리로 만들어 Keystore AES-256-GCM 키(`SecretCipher`)로 암호화해 SharedPreferences(`auth_session`)에 쓴다. `androidx.security:security-crypto`는 deprecated라 쓰지 않았다. 백업·기기 이전에서 제외한다. 복호화가 실패하면 예외를 던지고, 호출 쪽(`PersistentSessionStore`)이 "세션 없음"으로 보고 지운다.
- `google()`은 SDK가 있을 때만 `settings.gradle.kts`에 들어간다(pluginManagement와 dependencyResolutionManagement 모두, 필요한 group만). SDK가 없으면 `:app`도 빠지고 순수 모듈만 빌드된다.
- AGP는 루트 `build.gradle.kts`의 `buildscript { classpath }`로 올린다(SDK가 있을 때만, 버전은 `libs.versions.toml`의 `agp`). Kotlin Gradle 플러그인과 같은 classloader에 있어야 한다. 빠지면 `NoClassDefFoundError: BaseVariant`로 죽는다. `alias(...) apply false`로 올리면 SDK 없는 환경에서도 AGP를 받으려다 실패해서 쓰지 않았다. 그래서 `:app`은 `id("com.android.application")`를 버전 없이 쓴다. AGP 9는 Kotlin을 내장하므로 `kotlin-android` 플러그인은 적용하지 않는다.
- 이 환경의 SDK는 platform 36까지라서 compileSdk 37을 요구하는 androidx 최신판(core 1.19, lifecycle 2.11)은 쓸 수 없다. core-ktx 1.17.0, lifecycle 2.10.0, activity 1.12.0을 쓴다.

### Gradle 속성

`-P`로 넘기거나 `~/.gradle/gradle.properties`에 둔다. 값은 레포에 커밋하지 않는다.

| 속성 | 기본 | 효과 |
| --- | --- | --- |
| `apiBaseUrl` | debug `http://10.0.2.2:4010`, release `https://chalkak-dev.pysun.kr` | `BuildConfig.API_BASE_URL`(서버 origin만, 앱이 `/api/v1`을 붙인다) |
| `kakaoNativeAppKey` | 없음 | 있으면 `src/kakaoOn`을 컴파일하고 `com.kakao.sdk:v2-user`를 의존성에 넣고, `settings.gradle.kts`가 Kakao Maven 저장소(`devrepo.kakao.com`)를 추가한다. `BuildConfig.KAKAO_NATIVE_APP_KEY`와 매니페스트 `AuthCodeHandlerActivity`의 scheme `kakao<키>`에 들어간다. 없으면 `src/kakaoOff`가 컴파일되고 `AuthCodeHandlerActivity` 항목은 `enabled=false` |
| `fcmProjectId` (+ `fcmApplicationId`, `fcmApiKey`, `fcmSenderId`) | 없음 | 있으면 `src/fcmOn`을 컴파일하고 Firebase BoM·`firebase-messaging`을 넣는다. Firebase는 google-services 플러그인·`google-services.json` 없이 `BuildConfig.FCM_*` 값으로 `FirebaseOptions`를 직접 만들어 초기화한다(값은 저장소에 두지 않는다). 없으면 `src/fcmOff`(토큰 없음)이고 매니페스트의 `ChalkakMessagingService`는 `enabled=false` |
| `fakeSocialLogin` | `false` | `true`이면 debug 빌드의 로그인이 SDK 없이 픽스처 idToken을 돌려준다(E2E용). release에서는 무시된다 |
| `forceUpdateCheck` | `false` | `FORCE_UPDATE_CHECK_ENABLED`. 켜야 Play In-App Update 조회가 실제로 돈다(D-15, REQ-BOOT-014) |

### 소스셋: kakaoOn / kakaoOff

Kakao 저장소는 일부 샌드박스에서 막혀 있어서, SDK가 없어도 `:app`이 빌드·테스트되도록 `KakaoSdkFactory`를 두 소스셋으로 나눴다. `app/build.gradle.kts`가 `kakaoNativeAppKey` 유무로 한쪽만 `variant.sources.kotlin`에 추가한다. 둘은 같은 이름·시그니처(`KakaoSdkFactory.create(context, nativeAppKey, activity)`)를 가져야 한다. 기본 빌드는 kakaoOn을 컴파일하지 않으므로 CI가 `./gradlew :app:compileDebugKotlin -PkakaoNativeAppKey=ci-dummy`로 따로 컴파일한다(`.github/workflows/android.yml`).

### 소스셋: fcmOn / fcmOff

kakaoOn/kakaoOff와 같은 방식이다. 두 소스셋의 `FcmTokens.create(context)`는 같은 시그니처여야 하고, CI는 `-PfcmProjectId=ci-dummy ...`로 fcmOn을 따로 컴파일한다.

### E2E 빌드 (mock 서버 + 가짜 로그인)

Maestro 같은 E2E는 실제 카카오 없이 로그인 흐름을 돌린다.

```
(cd shared && PORT=4010 node mock-server/server.mjs)            # mock 서버. 에뮬레이터에서는 10.0.2.2:4010
cd android
LC_ALL=C.UTF-8 ./gradlew :app:assembleDebug -PfakeSocialLogin=true
# 다른 서버: -PapiBaseUrl=http://10.0.2.2:PORT
```

`FakeSocialLoginClient`는 고정 idToken(`fixture-kakao-id-token`)을 돌려주고, mock 서버는 값과 무관하게 시나리오(로그인 성공, `SIGN_UP_REQUIRED` 등)로 응답한다. 이 APK는 debug라서 배포하지 않는다. 강제 업데이트 다이얼로그를 보려면 `-PforceUpdateCheck=true`를 더하되 Play 조회가 필요하다(스토어 배포 빌드가 아니면 조회가 실패해 통과한다, D-15).

### StateHolder를 ViewModel로 감싸기

`:feature:*`의 holder는 Android를 모르고 `CoroutineScope`를 생성자로 받는다. 화면에서는 아래처럼 쓴다.

```kotlin
@Composable
fun LoginScreen(container: AppContainer) {
    val holder = rememberStateHolder { scope -> LoginStateHolder(/* 의존성 */, scope = scope) }
    val state by holder.state.collectAsStateWithLifecycle()
    ...
}
```

`rememberStateHolder`는 `StateHolderViewModel<H>`를 만들고 holder에 `viewModelScope`를 준다. 화면 회전에서는 holder가 유지되고, ViewModelStoreOwner(Activity, 내비게이션 항목)가 사라질 때 scope가 취소된다. 같은 타입 holder를 여러 개 두면 `key`로 구분한다(예: 게시물 ID).

### 테스트

JVM에서 Robolectric + `createComposeRule`(JUnit4)로 돈다. `./gradlew :app:testDebugUnitTest`. 처음 한 번 Robolectric이 Maven Central에서 `android-all` jar를 받는다(`robolectric.properties`의 `sdk=36`). Robolectric에는 하드웨어 Keystore가 없어 `KeystoreRecordStorage` 테스트는 같은 AES-GCM 형식의 소프트웨어 `SecretCipher`를 쓴다. Compose 테스트는 `mainClock` 가상 시간으로 토스트 2.5초를 검증한다.

### 실행

```
cd android
export ANDROID_HOME=/opt/android-sdk   # 또는 local.properties의 sdk.dir (커밋 금지)
LC_ALL=C.UTF-8 ./gradlew test :app:assembleDebug :app:testDebugUnitTest
LC_ALL=C.UTF-8 ./gradlew :app:installDebug      # mock 서버: (cd ../shared && PORT=4010 node mock-server/server.mjs)
```

Maven Central이 간헐적으로 429를 돌려줄 수 있다. 다시 실행하면 받아 둔 파일은 캐시되어 이어서 진행된다.
