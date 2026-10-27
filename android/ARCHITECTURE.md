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
| `:app` | Android | Compose 화면, `ViewModel` 래퍼, Keystore 토큰 저장소, 카카오 SDK·FCM·Play In-App Update 어댑터, DI |

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
