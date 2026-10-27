# 찰칵(Chalkak) Android 앱 분석 (재구현용)

> 원본: `woowacourse-teams/2026-Chalkak` main(2026-10-27) 읽기 전용 분석. 경로는 원본 레포 기준이다. 정리·결정은 [`../spec/`](../spec/)가 우선한다.

- 대상: `원본 레포 client/android` (읽기 전용 분석, 레포 수정 없음)
- 경로 표기: 별도 표기가 없으면 `app/src/main/java/com/stonefive/chalkak/`(이하 `{pkg}/`) 기준. 줄 번호는 확인한 범위만 `L숫자`로, 대략치는 `L~숫자`로 표기.
- `[추정]` = 코드에서 직접 확인하지 못한 추론. 비밀값(키/계정)은 기재하지 않았다.
- 범위: 소셜 로그인은 Kakao만. Apple/Google은 "보류"(Android 코드에는 Google 구현이 남아 있음).

---

## 0. 기술 스택 및 빌드 요약

| 항목 | 값 | 근거 |
|---|---|---|
| 언어/UI | Kotlin 2.2.10, Jetpack Compose (BOM 2026.02.01), Navigation Compose 2.9.8 (type-safe `@Serializable` 라우트) | `gradle/libs.versions.toml` |
| 네트워크 | Retrofit 3.0.0 + kotlinx-serialization + OkHttp 5.5.0 | 동일 |
| 이미지/저장 | Coil 3, DataStore Preferences | 동일 |
| Firebase | Analytics, Messaging (BoM 34.18.0) | 동일 |
| 앱 업데이트 | Play In-App Update 2.1.0 | 동일 |
| 소셜 | Kakao SDK v2-user 2.24.0 (Google은 Credentials/googleid, 범위 밖) | 동일 |
| DI | 수동 DI `AppContainer` (Hilt 없음). Route/Screen/ViewModel/UiState 계층 | `{pkg}/AppContainer.kt` |
| SDK | minSdk 26, targetSdk/compileSdk 37, versionName 1.1.0, versionCode 26, applicationId `com.stonefive.chalkak` | `app/build.gradle.kts` |
| 린트 | ktlint 1.8.0 | `libs.versions.toml` |

### 빌드 설정 키 이름 (값 미기재)
- `local.properties` 키: `API_BASE_URL`, `GOOGLE_SERVER_CLIENT_ID`(Google, 보류), `KAKAO_NATIVE_APP_KEY`.
- `API_BASE_URL`은 HTTPS만 허용(`toHttpsBaseUrl`, HTTP는 거부) - `{pkg}/data/remote/NetworkModule.kt`, 테스트 `NetworkModuleTest`.
- `KAKAO_NATIVE_APP_KEY`는 매니페스트 placeholder로 `kakao${KAKAO_NATIVE_APP_KEY}` 스킴(host `oauth`)을 만든다 - `AndroidManifest.xml` `AuthCodeHandlerActivity`.
- `google-services` 플러그인 적용(Firebase 설정 파일 사용, 내용 미기재).

### 매니페스트 요점 (`app/src/main/AndroidManifest.xml`)
- 권한: `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WRITE_EXTERNAL_STORAGE`(maxSdk 28).
- `CAMERA` 권한 없음: 시스템 카메라 앱을 `TakePicture` + FileProvider로 호출.
- `MainActivity`는 `singleTop`, Firebase 자동 screen reporting 비활성(수동 `screen_view`).
- 딥링크 intent-filter는 Kakao 인증용 하나뿐. 푸시 탭 Intent의 data URI는 `chalkak://notification/{key}`지만 명시적 Intent이며 외부 딥링크로는 동작하지 않는다.
- 레거시 리마인더 `ReminderAlarmReceiver`, `ReminderRescheduleReceiver`(BOOT_COMPLETED, MY_PACKAGE_REPLACED, TIME_SET, TIMEZONE_CHANGED)는 잔존하며 `LegacyReminderCleanup.cancel`이 `Application.onCreate`에서 기존 알람을 취소만 한다(신규 예약 없음).
- FCM 서비스 `ChalkakFirebaseMessagingService`, 기본 알림 채널 id `moderation_push`.
- 문자열 리소스: `app/src/main/res/values/strings.xml`에는 `app_name`과 하단바 라벨 4개(홈, 전시, 기록, 설정)만 있다. 나머지 모든 사용자 문구는 Kotlin 소스에 하드코딩되어 있어 재구현 시 소스에서 추출해야 한다(본 문서 2장에 주요 문구 수록).

---

## 1. 화면 목록과 내비게이션 구조

### 1.1 라우트 (`{pkg}/navigation/Chalkak.kt`, 호스트 `ChalkakNavHost.kt` 약 1053줄)

| 라우트 | 인자 | 설명 | 진입 조건 |
|---|---|---|---|
| Login | - | 로그인(카카오/Google/게스트) | 세션 SignedOut 또는 재인증 필요 |
| Terms | - | 약관 동의 | 소셜 로그인 응답이 SIGN_UP_REQUIRED |
| OnboardingSignature | - | 가입 시 사인 그리기 | Terms 다음 |
| OnboardingSignaturePreview | - | 가입 시 사인 미리보기 + 가입 완료 | |
| ChangeSignature / ChangeSignaturePreview | - | 설정에서 사인 변경 | Settings(회원) |
| Home | - | 홈 탭 | Authenticated 또는 Guest |
| WebPage | title, url | 배너(이슈) 웹뷰 | 홈 배너 클릭 |
| Notifications | - | 알림 목록 | 홈 상단 알림 진입 및 푸시 fallback |
| NotificationDetail | id | 알림 상세 | 공지/반려 알림 |
| Display | date, sort | 전시 탭 | 하단바, 홈 랭킹 링크, 업로드 완료 확인 |
| Feed | 다수 필드(선택 게시물 컨텍스트) | 전시/홈 랭킹에서 연 피드 | 로그인 필요 |
| FeedById | postId, isOwned, thumb, openAiReviewResult | 기록/푸시에서 연 단건 피드 | 로그인 필요 |
| Record | - | 기록(캘린더) 탭 | 로그인 필요 |
| Settings | - | 설정 탭 | |
| Feedback | - | 피드백 보내기 | 로그인 필요 |
| PhotoUpload | topicDate | 사진 업로드 | 진입 게이트 통과 |
| PhotoUploadSuccess | 제출/편집 결과 필드 | 업로드 완료 | |

(`ChalkakRouteTest`가 Feed/FeedById/Display/PhotoUpload/PhotoUploadSuccess/서명 라우트의 직렬화 왕복을 검증한다.)

### 1.2 탭 구조 (`navigation/MainBottomBarLayout.kt`, `ChalkakNavHost.kt` navigateToBottomBar L~890)
- 하단바: 홈, 전시, 기록, 설정(strings.xml 라벨) + 가운데 "+" 추가 버튼. "+"는 `openPhotoUpload`(진입 게이트)를 호출한다.
- 탭 이동: `popUpTo(Home){ saveState = true }`, `launchSingleTop = true`, `restoreState = (item != HOME)`. 홈 탭은 상태 복원 없이 항상 새로 보인다.
- 전시 탭에서 전시 탭을 다시 누르면 맨 위로 스크롤(`DisplayScreenTest.displayReselectRestoresTop...`).
- Feed 화면에서는 하단바 숨김, 전시로 돌아오면 복귀(`ChalkakNavHostTest.bottomBarIsHiddenInFeedAndReturnsWithDisplay`).
- 게스트 제한(토스트 문구):
  - 기록 탭: "기록을 보려면 로그인이 필요해요"
  - 전시/홈에서 Feed 진입: "게시물 피드를 보려면 로그인이 필요해요"
  - 피드백: "피드백을 보내려면 로그인이 필요해요"
  - 업로드: "게시물을 추가하려면 로그인이 필요해요"

### 1.3 앱 시작 흐름 (`MainActivity.kt`, `ChalkakApp.kt`)
1. 스플래시: `installSplashScreen`을 (a) 버전 게이트 Checking 동안, (b) Accessible이면서 `HomeViewModel.isReadyForInitialDisplay == false`인 동안 유지. 홈 프리로드 대기는 최대 700ms(데드라인 후 해제, `HomeViewModelTest`의 "initial display is released after deadline").
2. 버전 게이트 `VersionGateRoute` (`feature/versiongate`, `core/appupdate`):
   - Play Core In-App Update. `updatePriority >= 1`이면 IMMEDIATE 강제 업데이트(`isForcedUpdatePriority`), 0이면 통과.
   - 디버그 빌드는 `DisabledAppUpdateGateway`(항상 업데이트 불필요).
   - 오프라인이면 Accessible로 간주(게이트 통과), 온라인 전환 시 재검사.
   - 온라인인데 확인 실패(CheckFailed): "업데이트를 확인할 수 없어요" / "네트워크 연결을 확인한 후 다시 시도해 주세요." / 버튼 "다시 시도". 앱 진입 차단.
   - 업데이트 플로우 실패/취소 시 `finish()`(앱 종료). 업데이트 후에도 잔존하면 다시 강제 시작. 한 번 통과한 뒤 업데이트가 발견돼도 통과 이력 유지.
3. 인증 게이트 `AuthGateRoute` (`feature/authgate`): 세션 4상태 Loading(빈 화면) / SignedOut(NavHost startDestination=Login) / Guest(홈) / Authenticated(홈).
4. 신규 가입: Login -> Terms -> OnboardingSignature -> OnboardingSignaturePreview("시작하기") -> 가입 성공 -> Home(`popUpTo(Terms)`). 재인증 필요 시 Login.
5. 로그인 성공 -> Home (`popUpTo(Login){inclusive}`).
6. 알림 권한: 첫 Authenticated 진입 후 Android 13+에서 1회 요청. SharedPreferences `push_notification_permission_prompt` / `requested`로 1회 제한 (`core/notification`).

### 1.4 화면 간 이동 규칙
- Settings -> ChangeSignature -> Preview -> 완료 시 Settings로 pop, 새 사인 URL을 `savedStateHandle`로 전달. 토스트 "사인 반영까지 시간이 좀 걸릴 수 있어요!".
- PhotoUpload -> PhotoUploadSuccess(`popUpTo(PhotoUpload)`) -> 확인 시 Display(date) (`popUpTo(Home)` 비포함).
- 게시물 삭제: Feed pop 후 이전 엔트리 `savedStateHandle`에 `POST_DELETED_KEY` 설정, 토스트 "게시물을 삭제했어요".
- Display에서 연 Feed는 선택 게시물을 미리 전달하고 `fetchDetail=true`로 상세 재검증. 기록에서 열면 Display/Feed 후 Record로 복귀(`ChalkakNavHostTest.displayOpenedFromRecordReturnsToRecordAndKeepsTabsNavigable`).

### 1.5 푸시 탭 라우팅 (`ChalkakNavHost.kt` L~150-230, `openNotificationTarget` L~820)
- 푸시 데이터 키: `eventId`, `notificationId`, `type`, `sourceType`, `sourceId`. 백그라운드 탭은 인텐트 extra `google.message_id`로 판별.
- 대기 저장: `PendingNotificationNavigationStore`(인스턴스 상태에 저장/복원, `NotificationNavigationSavedStateTest`).
- 소비 시점: 세션이 Authenticated이고 현재 목적지가 Login/Terms/OnboardingSignature/OnboardingSignaturePreview가 아닐 때만 소비.
- 이동 규칙:

| type / sourceType | 이동 |
|---|---|
| TOPIC | Home (이미 Home이면 중복 추가 안 함) |
| POST_APPROVED + sourceType POST | FeedById(owned) |
| AI_REVIEW_COMPLETED / AI_REVIEW_FAILED + POST | FeedById(openAiReviewResult=true), 같은 게시물 Feed가 위에 있으면 먼저 pop 후 교체 |
| POST_REJECTED / NOTICE | NotificationDetail(notificationId) |
| 그 외 | Notifications 목록 |

- TOPIC 외 푸시는 이동 전에 `PATCH notifications/{id}/read`를 먼저 호출:
  - 성공: 이동.
  - 네트워크 실패: 토스트 "읽음 상태를 저장하지 못했어요. 네트워크 연결을 확인해 주세요." 후 그래도 이동.
  - 그 외 실패: 토스트 "알림이 만료되었거나 현재 계정에서 확인할 수 없어요." (404이면 추가로 알림 목록으로 이동).
  - notificationId 없음: 토스트 "알림 정보를 확인할 수 없어요.".
- 포그라운드 FCM 수신: 앱이 직접 알림 생성(채널명 "게시물 검수 알림", 기본 본문 "새 알림이 있어요. 알림함에서 확인해 주세요."). `POST_NOTIFICATIONS` 미허용이면 아무것도 표시 안 함.

### 1.6 푸시 기기 등록 (`data/remote/notification/PushDeviceRegistrationCoordinator.kt`)
- `PUT /push-devices/current {fcmToken}`.
- 트리거: 세션 변경, `MainActivity.onResume`, FCM `onNewToken`.
- 뮤텍스 + (userId, token) 중복 제거. JWT에 `session_id` 클레임이 없으면 먼저 토큰 갱신. 갱신 결과 ReauthenticationRequired면 세션 clear (`PushSessionReadinessTest`).
- 로그아웃/탈퇴 시 기기 해제(unregister) 호출 없음 -> 5장 참고.

---

## 2. 기능별 상세 (화면 단위)

공통 UI 메시지 규약: 토스트(`UiMessage.Toast`)/스낵바는 라이프사이클이 RESUMED일 때만 표시하고 id로 중복 제거 (`core/ui/UiMessage.kt`). 코루틴 try/catch는 모두 `CancellationException`을 재던진다. 콘텐츠가 이미 있는 상태의 네트워크 실패는 콘텐츠를 유지하고 토스트, 콘텐츠가 없으면 오류 화면 + "다시 시도".

### 2.1 로그인 (`feature/login`, `core/auth`)
- 화면 문구: 태그라인 "매일 하나의 주제,\n각자의 한 장", 버튼 "카카오로 계속하기", "Google로 계속하기"(보류), 게스트 "로그인 없이 사진 둘러보기".
- 동작:
  - Kakao: 카카오톡 앱 로그인 가능하면 사용, 불가하면 카카오 계정 로그인. 톡 로그인 실패(취소 제외)는 계정 로그인으로 fallback. 취소는 Cancelled(재시도 가능 상태 복귀). idToken이 없으면 CONFIGURATION 실패 (`KakaoIdTokenClientTest` 6건).
  - nonce: 랜덤 32바이트를 base64url(패딩 없음) -> 원문 nonce는 서버로, SHA-256 hex는 SDK로 전달.
  - `POST auth/social-login {provider, idToken, rawNonce}` -> `status`: `LOGIN_SUCCESS`(userId, accessToken, expiresIn, refreshToken, refreshTokenExpiresIn) 또는 `SIGN_UP_REQUIRED`.
  - 게스트: `continueAsGuest`가 자격증명 제거 후 is_guest 플래그 저장.
- 오류 문구: 네트워크 "네트워크 연결을 확인해 주세요."; 401 "{카카오|Google} 계정을 확인할 수 없어요. 다시 시도해 주세요."; 미지원 "아직 지원하지 않는 로그인 방식이에요."; 기타 "로그인하지 못했어요. 다시 시도해 주세요."; Kakao 설정 "카카오 로그인 설정을 확인해 주세요."; Kakao 실패 "카카오 로그인에 실패했어요. 다시 시도해 주세요."; 액티비티 없음 "카카오 로그인을 시작할 수 없어요."; 게스트 실패 "화면을 불러오지 못했어요. 다시 시도해 주세요.".
- 메시지는 새 ID를 부여해 같은 문구가 다시 나와도 재표시 (`LoginViewModelTest`).

### 2.2 약관 (`feature/terms`, `core/legal`, `core/web`)
- 문구: "찰칵에\n오신 것을 환영합니다.", "전체 동의", "(필수) 서비스 이용약관", "(필수) 개인정보 처리방침", "보기", "다음". 두 항목 모두 동의해야 "다음" 활성화.
- 동의 여부는 로컬 상태일 뿐 서버 전송/영속 없음 (서버 동의 API 호출 없음).
- 약관 문서는 Notion URL을 WebView 다이얼로그로 표시(notion.com/.so/.site 호스트만 내부, 그 외는 외부 브라우저). 실패 문구 "문서를 불러오지 못했어요" / "다시 시도" / "문서를 열 수 없어요".
- 분석 screen: `terms`, 약관 다이얼로그는 `terms_of_service` / `privacy_policy`.

### 2.3 사인 (가입/변경) (`feature/signature`)
- 그리기 화면 문구: "작가님의\n사인을 그려주세요", "모든 사진에 함께할 사인이에요.\n자유롭게 남겨주시고, 실제 서명은 피해 주세요.", 패드 힌트 "여기에 손가락으로 그리기", 버튼 "되돌리기", "전체 지우기", "이 사인으로 할래요"(획이 없으면 비활성).
- 미리보기: "이렇게 보여요", "다시 그리기", 온보딩 "시작하기"; 변경 모드 확인 버튼 "사인 변경하기" + 안내 "사인 변경까지 시간이 조금 걸릴 수 있어요".
- PNG 인코딩(`SignaturePngEncoder`): 1024x512 ARGB, 투명 배경, **흰색** 획, 패딩 48px, 획 두께 14px(둥근 캡/조인), `quadTo`로 스무딩, 콘텐츠 박스 정규화(최소 0.02), 점 하나는 원으로 그림. 1 MiB(1024*1024) 초과는 로컬에서 거절(SIGNATURE_TOO_LARGE).
- 가입 플로우 `completeSocialSignUp` (`data/repository/AuthRepositoryImpl.kt`):
  1. `POST auth/social-signup/signature/uploads {provider, idToken, rawNonce}` -> uploadId, uploadUrl, signupToken
  2. `PUT uploadUrl` (Content-Type `image/png`, 인증 헤더 없음, `presignedUploadClient`)
  3. `POST auth/social-signup {signupToken}`; 400 + `errorCode == SIGNATURE_PROCESSING_PENDING`이면 1초 간격으로 최대 10회 재시도, 소진 시 SIGNATURE_PROCESSING_TIMEOUT
  4. 보류해 둔 idToken/nonce로 재로그인, userId가 다르면 REAUTHENTICATION_REQUIRED (실패 시 보류 가입 컨텍스트 제거)
- 오류 문구(가입): 타임아웃 "사인 처리에 시간이 걸리고 있어요. 다시 시도해 주세요.", 업로드 없음 "사인을 다시 업로드해 주세요.", 기타 "회원가입을 완료하지 못했어요. 다시 시도해 주세요."; 공통 사인 오류 "사인 이미지가 1MB를 초과했어요.", "사용할 수 없는 사인이에요. 다시 그려주세요.", "네트워크 연결을 확인해 주세요.", "인증 정보가 만료되었어요. 다시 로그인해 주세요.", "사인 업로드를 찾을 수 없어요. 다시 시도해 주세요.".
- 변경 플로우 (`UserRepositoryImpl.updateMySignature`): `POST users/me/signature/uploads` -> PUT PNG -> `PUT users/me/signature {signatureOriginalUploadId}`; 오류 "사인을 저장하지 못했어요. 다시 시도해 주세요.". 업로드 실패 시 확정 API 호출 안 함. 연타 시 미리보기는 한 번만 열림(`ChalkakNavHostTest.rapidSignatureSubmissionsOpenOnlyOnePreview`).
- 분석 screen: `onboarding_signature`, `onboarding_signature_preview`, `change_signature`, `change_signature_preview`.

### 2.4 홈 (`feature/home`, `HomeViewModel`)
- 병렬 로드:
  - 오늘 랭킹: `GET topics?date={KST오늘}` + `GET posts?topicDate&sort=POPULAR&page=1&pageSize=20` (표시 5개)
  - 어제 랭킹: 동일 `getPostPage`
  - 개인 콘텐츠(내 오늘 사진 + 주간 기록): `GET posts/calendar?year&month` (주가 걸치는 월 모두). 주는 일요일~토요일(`HomeViewModelTest`: 연말 경계, 일요일 시작)
  - 배너: `GET banners?page&pageSize=10` (인증 없는 `publicClient`, 페이징, 끝에서 2개 앞에서 prefetch)
- Hero 상태: Loading / Empty("\"{주제}\" 사진을 공유하지 않았어요") / NoOpenTopic("지금은 참여할 수 있는 주제가 없어요") / Processing("사진을 처리하고 있어요", VALIDATING 업로드) / Error("사진 상태를 불러오지 못했어요") / Photo(PENDING은 "검수 대기" 배지).
- 게스트: 비공개 API 호출 없이 Empty hero와 빈 주간 기록, 공개 랭킹/배너만 로드.
- 문구: "{M월 d일} · 오늘의 주제", "오늘의 주제를 불러오는 중" / "오늘의 주제를 불러오지 못했어요" / "오늘의 주제가 아직 준비되지 않았어요", "이번 주 기록", "어제 랭킹", "오늘 인기있는 사진", "아직 올라온 사진이 없어요", "{title} 사진을 불러오지 못했어요", "기록을 불러오지 못했어요", 배너 섹션 헤더 "ISSUE", "다시 시도". 배너 로드 실패/빈 응답이면 ISSUE 섹션 숨김.
- 새로고침: 당겨서 새로고침(캐시 콘텐츠 유지 + 인디케이터), 화면 복귀(resume) 시 조용히 갱신, KST 날짜 변경 시 전체 재로드 (`HomeViewModelTest`: "first presentation after KST midnight...").
- 랭킹 링크는 Display(어제/오늘 날짜, POPULAR)로, 랭킹 사진은 Feed로 이동. 배너 클릭은 WebPage 라우트.
- AI 피드백 카드(오늘 승인된 내 사진일 때만): "이 사진, AI에게 피드백 받아보기", "AI 피드백이 진행중이에요", "AI 피드백이 완료되었어요", "AI 피드백을 생성하지 못했어요", "자세히 보기", "재요청". 실패 재요청은 시작 시트 없이 바로 요청. 상세 규칙은 2.9 참고.
- 분석 screen: `home`, 배너 웹은 `issue`/`IssueWeb`.

### 2.5 웹 페이지 (배너) (`feature/web`, `core/web`)
- WebView. 사용자 제스처 없는 자동 네비게이션 차단, 클릭 링크는 외부 브라우저(같은 호스트/같은 URL 포함), 같은 문서 앵커는 내부, http(s) 외/비정상 URL 차단, 서브프레임은 내부 (`IssueLinkNavigationTest` 6건).
- 토스트: "링크를 열 수 있는 브라우저가 없어요", "브라우저에서 링크를 열지 못했어요".

### 2.6 전시 (`feature/display`, `DisplayViewModel`)
- `FIRST_TOPIC_DATE`는 2026-09-17(KST) 하드코딩, 이동 가능한 가장 이른 날짜. 선택 날짜는 최초 전시일~오늘로 clamp (`DisplayViewModelTest`, `DisplayDatePickerSheetTest`).
- 정렬: LATEST(최신순), POPULAR(인기순), RANDOM(랜덤순). RANDOM은 첫 페이지 응답의 seed를 저장하고 2페이지 이후 `randomSeed` 쿼리로 전송; RANDOM 외에는 seed 폐기.
- 오늘(최신) 날짜는 정렬 탭 표시, 과거 날짜는 Archive 모드(POPULAR만, 상위 5개 featured 페이저 + 그리드). 날짜 이동은 좌/우 화살표와 "날짜 선택" 휠(년/월/일). 말일 보정(없는 날은 말일로).
- 페이징 pageSize 20, 끝 임계 도달 시 추가 로드(중복 호출 방지), (date, sort) 키 캐시, 좋아요 revision 병합.
- API: `GET topics?date=`, `GET posts?topicDate&sort&page&pageSize[&randomSeed]`, `PUT/DELETE posts/{id}/likes`.
- 문구: 오류 "전시를 불러오지 못했어요"(이미 콘텐츠가 있으면 토스트), 좋아요 실패 "좋아요를 반영하지 못했어요", 빈 상태 "이 날 올라온 사진이 없어요", 헤더 "가장 사람들이 좋아했던 사진들이에요" / "같은 주제에서 다른 시선을 느껴보세요". 주제 없는 날짜로 이동 시 기존 전시 유지.
- 낙관적 좋아요: 즉시 카운트 변경, 실패 시 복원, 요청 이후 도착한 재검증 응답이 완료된 좋아요 상태를 덮어쓰지 않도록 revision 병합.
- 분석 screen: `display`.

### 2.7 피드 (`feature/feed`, `FeedViewModel`)
- API:
  - `GET posts/{id}` -> {id, topic{id,title,topicDate}, originalImageUrl, thumbnailImageUrl, signatureOriginalImageUrl, title?, likeCount, isLiked, isMine}
  - `PUT posts/{id}` {title?} (제목 수정), `DELETE posts/{id}`
  - `PUT/DELETE posts/{id}/likes` -> {postId, likeCount, isLiked}
- 내 게시물 + 오늘 주제일 때만 제목 수정 버튼 표시(지난 주제는 요청 자체를 보내지 않음). 삭제는 내 게시물만.
- 제목 수정 다이얼로그: "게시물 제목 수정", 최대 10자, 플레이스홀더 "제목을 입력해 주세요.", 버튼 "취소"/"저장"("저장 중..."), 성공 토스트 "제목을 수정했어요". 삭제 다이얼로그 "게시물 삭제" / "게시물을 삭제하시겠어요?" / "삭제".
- 오류 문구:
  - 로드: 404 "게시물을 찾을 수 없어요", 일반 "게시물을 불러오지 못했어요", 계약 위반 "게시물 정보를 불러오지 못했어요". 상세 갱신 실패는 기존 콘텐츠 유지 + 토스트.
  - 삭제(스낵바): 400 "삭제할 수 없는 상태의 게시물이에요", 403 "본인이 작성한 게시물만 삭제할 수 있어요", 404 "게시물을 찾을 수 없어요", 401 "로그인이 필요해요", 네트워크 "네트워크 연결을 확인해 주세요", 기타 "게시물을 삭제하지 못했어요".
  - 제목 수정: 400 "수정할 수 없는 상태이거나 주제 참여 기간이 끝났어요", 403 "본인의 게시물만 수정할 수 있어요", 404 "게시물을 찾을 수 없어요", 401 "로그인이 필요해요", 네트워크 "네트워크 연결을 확인해 주세요", 기타 "게시물 제목을 수정하지 못했어요".
- 표시: 날짜 라벨 "{M}월 {d}일의 주제", 제목 없으면 "무제", 접근성 설명 "작품 이미지: {title}" / "무제 작품 이미지". 핀치 줌 1x~4x(손 떼면 복귀), 두 손가락 팬은 확대 범위 내 (`FeedPhotoZoomTest`).
- 낙관적 좋아요: 즉시 카운트/상태 변경, generation 카운터로 오래된 롤백 차단, 실패 시 **무음 롤백**(Feed에는 메시지 없음; Display는 토스트). 서버 기준 쓰기 순서 보장은 TODO로 남아 있음(주석) [추정: 연타 시 서버 최종 상태와 어긋날 수 있음].
- 오늘 날짜 판정은 KST(`Asia/Seoul`) dateProvider.
- 분석 screen: `feed` (Feed, FeedById 공통).

### 2.8 업로드 (`feature/upload`, `feature/photoedit`, `data/post`)
**진입 게이트** (`PhotoUploadEntryGateViewModel`):
- 게스트: API 호출 없이 토스트 "게시물을 추가하려면 로그인이 필요해요".
- `GET posts/today` -> {topicDate, isPosted, postId, moderationStatus(VALIDATING|PENDING|APPROVED)}. 이미 작성: "이미 이 주제에 게시물을 작성했어요."; 404 "지금 참여할 수 있는 주제가 없어요."; 403 "이용이 정지되어 게시물을 작성할 수 없어요."; 기타 "게시물 작성 여부를 확인하지 못했어요. 다시 시도해 주세요."; 401 -> Login. 확인 중 반복 탭은 API 1회만.
- 게이트가 서버 `topicDate`를 업로드 라우트에 고정 전달: 자정이 지나도 진입 시점 주제 날짜로 제출 (`PhotoUploadViewModelTest`).

**업로드 화면** (`PhotoUploadViewModel`):
- 문구: "주제 ‘…’에 맞는 한 장", "앨범에서 고르거나 지금 찍어요", 캡션 플레이스홀더 "작품 제목은 선택이에요.", 버튼 "전시하기" / "전시 중...".
- 입력: 캡션 최대 10 (`takeGraphemes`, 자소(grapheme) 기준; 서버 POST-005는 코드포인트 기준). 사진 선택 없으면 제출 불가.
- 사진 소스: 갤러리 `ActivityResultContracts.GetContent("image/*")`; 카메라 `TakePicture` + FileProvider(cacheDir `photo-upload/camera/{UUID}.jpg`). 카메라 불가 기기는 카메라 버튼 숨김. 촬영본은 갤러리(Pictures/Chalkak, `chalkak-photo-*.jpg`, JPEG)에 저장; API<=28이면 `WRITE_EXTERNAL_STORAGE` 요청, 거부/실패 시 토스트 "사진을 갤러리에 저장하지 못했어요."(업로드 선택 상태는 유지) (`CameraCaptureTest`).
- 편집기(`feature/photoedit`): 업로드 화면 안 전체화면, 탭 "자르기/조정/필터", 상단 "취소/완료", "90도 회전", "초기화". 사진 탭하면 현재 편집값으로 재편집. 처음 고른 사진 편집 취소 = 선택 안 함, 다른 사진 편집 취소 = 기존 선택/준비 결과 유지.
  - 필터(4x5 컬러 매트릭스): 원본, 흑백, 따뜻하게, 차갑게, 빈티지, 선명하게.
  - 조정(-1..1, 표시값 x100): 노출, 대비, 하이라이트, 그림자, 블랙 포인트, 채도, 따뜻함 + "자동"(강도 0..1).
  - 자르기 비율: 원본, 자유, 1:1, 4:5, 5:4, 3:4, 4:3, 9:16, 16:9. 최소 크롭 비율 0.1. `straightenDegrees`는 항상 0(수평 보정 UI 없음).
  - 상수: 노출 1.5EV/단위, 블랙포인트 범위 0.3, 따뜻함 gain 0.25, 톤 0.25, 대비 0.6, 자동보정 분석 샘플 긴 변 256(소스 1024 로드), 미리보기 긴 변 1440, 자동보정 목표 흰색 0.96, 노출 -0.5..1.0EV. 눈금자 UI: 단위당 400dp, 50틱, 디텐트 + 햅틱. 상세는 `client/android/docs/architecture/photo-edit.md`.
- **이미지 준비/인코딩** (`data/post/AndroidPostImageEncoder.kt`, `docs/architecture/post-image-encoding.md`):
  - 편집 완료 직후 백그라운드로 로컬 WebP 준비(정책 `POST posts/uploads` 선호출 포함). S3 PUT은 "전시하기" 때만.
  - 디코드: `inSampleSize`로 긴 변 <= 4096(INITIAL_MAX_LONG_EDGE) -> EXIF 회전 적용 -> 편집 적용(`isIdentity`면 재그리기 생략).
  - 품질 단계 `QUALITY_LADDER = [90, 80, 60, 40]` (API 30+ `WEBP_LOSSY`, 이전 `WEBP`); 모두 초과하면 x0.85 축소 후 재시도, 최대 `MAX_RESCALE_ROUNDS=3`(총 4라운드), 그래도 초과면 SizeLimitExceeded. EXIF 메타데이터 제거 (`AndroidPostImageEncoderTest`).
  - `maxBytes`는 정책 응답값(현재 5 MiB). 정책 `contentType`이 `image/webp`가 아니면 인코딩 전에 거절.
- **제출 플로우** (`PostCreationRepositoryImpl`):
  1. `POST posts/uploads`(본문 없음) -> {uploadId, uploadUrl, expiresInSeconds, contentType, maxBytes}
  2. `PUT uploadUrl` (인증 헤더 없음, raw WebP)
  3. `POST posts {topicId, photoUploadId, title?}` (제목 null이면 필드 생략) -> {postId, moderationStatus: VALIDATING|PENDING}, 둘 다 성공 처리, 알 수 없는 값은 InvalidResponse
  - URL 만료 판정: expiresIn에서 5초 안전 마진, `nanoTime` 기준. 만료 시 새 정책 발급 후 호환되면 준비 파일 재사용, 새 maxBytes가 더 작으면 원본에서 재인코딩(편집값 재적용).
  - 사진 준비 중 제출하면 완료를 기다린 뒤 자동 제출. 선제 준비 실패는 즉시 표시하고 제출 시 재준비. PUT 중 취소/실패/생성 실패 시 임시 파일 삭제.
  - 제출 중 반복 탭은 repository 1회, 완료 후 반복 탭 무시.
- 오류 문구: 네트워크 "네트워크 연결을 확인해 주세요."; 이미지 준비 실패 "사진을 준비하지 못했어요. 다시 시도해 주세요."; 업로드 거절 "사진을 업로드하지 못했어요. 다시 시도해 주세요."; 생성 거절/일반 "전시를 완료하지 못했어요. 다시 시도해 주세요."; 중복 "이미 이 주제에 전시한 사진이 있어요."; 주제 종료 "주제가 변경되어 전시할 수 없어요."; 401 -> Login(입력 유지).
- 409 판별 방식: 서버 `message` 텍스트 비교(`"이미 해당 주제에 게시물을 작성했습니다."` -> AlreadySubmitted, `"현재 게시물을 작성할 수 없는 주제입니다."` -> TopicNotOpen). errorCode 아님 -> 5장.
- 알 수 없는 POST 결과(타임아웃 등) 후 `posts/today` 재확인(POST-011 복구) 없음.
- 성공 화면: "확인했어요.", "‘{topic}’을/를 기록했어요."(받침 유무로 을/를, `KoreanObjectParticleTest`), 상태 문구 PENDING "검수를 기다리고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요!" / 그 외 "사진을 확인하고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요!". 확인 -> Display(업로드한 날짜).
- 분석 screen: `photo_upload`, `photo_upload_success`.

### 2.9 AI 리뷰 (`feature/aireview/AiReviewSession.kt`, Feed/Home 공용)
- API: `GET posts/{id}/ai-review`, `POST posts/{id}/ai-review`(본문 없음, `retryOnConnectionFailure(false)`인 `aiReviewClient` 사용: 중복 POST 방지).
- 응답: {status NONE|PROCESSING|COMPLETED|FAILED, requestedAt, completedAt, result{overallScore, criteria[{key,label,score}], distinctivePerspective, feedback{summary,strength,weakness,suggestion}}, canRequestAgain}. 알 수 없는 status 또는 상태와 맞지 않는 result는 InvalidResponse. `canRequestAgain` 기본 false.
- 폴링: `POLL_INTERVAL_MS = 3000`, `POLL_WINDOW_MS = 300000`(5분, 초과 시 조용히 종료하고 Processing 유지). 화면이 resumed일 때만 동작: pause 시 취소, resume 시 새 GET 창 시작. generation/사용자 검사로 늦은 응답 폐기(계정 전환, 게시물 변경).
- 요청 조건 `canRequestReview`: 내 게시물 + 오늘 주제일 때만(자정 지나면 버튼 숨김, POST 안 보냄). 지난 사진은 기존 결과/진행 중만 표시.
- POST 오류: 404 -> 섹션 숨김; 기타 Http -> 이전 단계 유지 + 서버 `message`(없으면 상태별 문구); 네트워크(비 Http) -> 메시지 후 GET 폴링으로 동기화(자동 POST 재시도 없음). 실패(FAILED)는 자동 재요청 안 함.
- 폴링 GET 오류: 404 숨김; 일시 오류(네트워크/5xx)는 Processing 중이면 계속 폴링하고 메시지는 1회만; 401 폴링 중단; pause 시 실패 메시지 클리어.
- 오류 문구: 네트워크 "네트워크 연결을 확인해 주세요."; 계약 위반 "AI 피드백 정보를 불러오지 못했어요."; 401 "다시 로그인해 주세요."; 403 "이용이 정지된 회원은 AI 리뷰를 요청할 수 없습니다."; 404 "AI 피드백을 확인할 수 없는 게시물이에요."; 기타 "AI 피드백 정보를 불러오지 못했어요.".
- Feed 알약 라벨: "AI 피드백 받기", "AI 분석중"(비활성), "AI 피드백 보기", "AI 피드백 재요청", "AI 피드백 실패". 시작 시트: "AI 피드백을 시작할까요?" / "AI 피드백을 재요청할까요?", 안내 "결과가 나오기까지 최대 1~2분 소요될 수 있어요", "앱을 나가도 분석은 계속되니 걱정마세요", "분석이 끝나면 알림으로 알려드릴게요", 버튼 "분석 시작하기". 실패 시트: "AI 피드백을 생성하지 못했어요", "이 사진은 더 이상 AI 피드백을 요청할 수 없어요.", "AI 피드백은 오늘 올린 사진만 재요청할 수 있어요.", "확인". 결과 시트 섹션: "좋았던 점", "아쉬운 점", "다음엔 이렇게"; distinctivePerspective true일 때 배지 "작가님의 해석이 돋보이는 작품이에요"; 점수 접근성 문구 "전체 점수 10점 만점에 X점"; 기준 다이얼로그 "찰칵AI는 어떤 기준으로 점수를 내나요?".
- 푸시로 `openAiReviewResult=true`로 진입하면 최신 GET 결과 기준으로 결과/실패 시트를 한 번만 자동 오픈 (`FeedScreenTest.notificationEntry...`).

### 2.10 기록 (`feature/record`, `RecordViewModel`)
- 게스트 접근 불가(토스트). API: `GET posts/calendar/months`(기록 있는 월; 현재 월은 항상 포함), `GET posts/calendar?year&month` -> [{topicDate, postId, thumbnailImageUrl, status APPROVED|PENDING|REJECTED|UNKNOWN}]. 응답의 월이 요청 월과 다르면 InvalidResponse.
- UI: 일요일 시작 달력(요일 헤더 일~토), 이전/다음 월 이동(기록 없는 달로도 이동 가능), 월 선택 휠, 날짜 선택 시 사진 표시. PENDING: 배지 "사진 반영 중" + 안내 "사진을 반영하고 있어요.\n표시되기까지 조금 시간이 걸릴 수도 있어요!"(액션 숨김). 승인 사진: 버튼 "피드에서 보기" / "전시 보러가기".
- 달력 이미지 저장: "이미지로 저장" -> MediaStore `Pictures/Chalkak/chalkak-calendar-{yyyy-MM}.png`; API<=28은 `WRITE_EXTERNAL_STORAGE` 요청. 토스트 "달력을 이미지로 저장했어요", "이미지 저장에 실패했어요", "이미지 저장 권한이 필요해요".
- 오류: 401 "로그인이 필요해요"(버튼 "로그인 하기"), 400 "조회할 수 없는 연월이에요", 기타 "기록을 불러오지 못했어요"(버튼 "다시 시도"). 캐시된 월 실패는 기존 기록 유지 + 토스트, 현재 월 실패는 이전 달 내용 제거.
- 월별 캐시, 삭제한 postId 기억(캐시 월에도 반영), resume 시 재검증(요청한 날짜 선택 유지), 늦은 응답은 다른 월 화면을 덮지 않음.
- `INITIAL_RECORD_MONTH`가 최상위 val이라 클래스 로드 시점 고정 -> 5장.
- 분석 screen: `record`.

### 2.11 설정 (`feature/settings`)
- 섹션: 앱 설정(사인 "사인 재설정"/"변경하기"), 푸시 알림, 계정, 피드백, 정보 및 약관(피드백 보내기, 개인정보처리방침, 이용약관, 버전정보=versionName).
- 푸시 스위치 3개: 주제 알림, 승인·반려 알림, AI 피드백 알림 -> `GET notification-settings`, `PATCH notification-settings` {topicPushEnabled, moderationPushEnabled, aiReviewPushEnabled}. 낙관적 갱신 + 실패한 항목만 복원, 같은 항목 저장 중 중복 입력 무시, 다른 항목은 독립 요청 (`SettingsViewModelTest`). 토스트 "푸시 알림 설정을 불러오지 못했어요." / "푸시 알림 설정을 저장하지 못했어요.". 기기 알림이 꺼져 있을 때 스위치를 켜면 시스템 알림 설정 화면으로 이동.
- 사인 로드 `GET users/me/signature`; 실패 문구 "사인을 불러오지 못했어요. 다시 시도해 주세요."(재진입 시 재조회, 갱신 중 중복 방지, 실패해도 기존 사인 유지, 401이면 로그아웃 상태).
- 계정: 로그아웃(다이얼로그 "정말 로그아웃 하시겠습니까?") -> `POST auth/logout {refreshToken}`(실패 무시) 후 세션 clear; 회원탈퇴(다이얼로그 "정말 회원탈퇴 하시겠습니까?") -> `DELETE users/me`(204) 성공 후에만 세션 삭제, 실패 시 세션 유지 + 토스트 "요청을 처리하지 못했어요. 다시 시도해 주세요.". 게스트는 "로그인" 버튼만 노출, 누르면 게스트 세션 해제 후 Login.
- 분석 screen: `settings`.

### 2.12 피드백 (`feature/feedback`)
- API: `POST feedbacks {content}` -> {feedbackId, createdAt}. 내용은 trim, 1~1000자(글자 수 카운터 표시), 비면 전송 불가.
- 문구: "찰칵을 사용하며\n느낀 점을 알려주세요.", "서비스 이용 중 불편한 점이나 개선되었으면 하는 점을\n자유롭게 남겨주세요.", "피드백 내용", "내용을 입력해 주세요.", 버튼 "보내기"/"보내는 중...", 성공 토스트 "피드백을 보내주셔서 감사해요.".
- 오류: 400 "피드백은 1자 이상 1000자 이하로 입력해 주세요.", 기타 "피드백을 보내지 못했어요. 다시 시도해 주세요.", 401 -> Login.
- 분석 screen: `feedback`.

### 2.13 알림 (`feature/notification`)
- API: `GET notifications?page&pageSize=20`(마지막 4개 근처에서 추가 로드), `GET notifications/unread-status`, `GET notifications/{id}`, `PATCH notifications/{id}/read`, `PATCH notifications/read-all`.
- 시간 표기 "M월 d일 HH:mm"(KST). 빈 상태 "아직 알림이 없어요.". 항목 탭 -> 읽음 처리 후 유형별 이동(1.5절 규칙).
- 읽음 실패: 네트워크 -> 토스트 "읽음 상태를 저장하지 못했어요. 네트워크 연결을 확인해 주세요." (목록/읽음 상태 유지); 404 -> 토스트 "삭제된 게시물입니다" + 목록/미읽음 갱신; 401 -> 로그인 오류 표시, 읽음 처리 안 함. 네트워크 이외 실패는 상세 이동 불허.
- 목록 오류: 네트워크 "네트워크 연결을 확인해 주세요."; 계약 위반 "알림을 불러오지 못했어요."; 401/403 "로그인이 필요해요."; 404 "알림이 만료되었거나 삭제됐어요. 목록을 새로고침해 주세요.".
- 상세(타이틀 "알림 상세"): 404 "알림이 만료되었거나 게시물이 삭제됐어요."; 반려 사진은 "반려 사유"와 버튼 "알림함으로".
- 미사용 코드: `markAllAsRead()`는 ViewModel에만 있고 UI 연결 없음; `hasUnread`는 조회하지만 홈 벨 배지 등 어디에도 표시하지 않음.
- 분석 screen: `notifications`, `notification_detail`.

---

## 3. 공통 인프라

### 3.1 네트워크 계층 (`{pkg}/data/remote/NetworkModule.kt`)
- Json: `ignoreUnknownKeys`. Base URL은 `API_BASE_URL`(HTTPS 강제). 경로 접두사 `/api/v1`은 base URL에 포함되는 것으로 보임 [추정].
- 타임아웃 설정 없음 -> OkHttp 기본(연결/읽기/쓰기 10초 [추정]). 로깅 인터셉터 없음.
- 클라이언트 5종:

| 클라이언트 | 인터셉터/특성 | 용도 |
|---|---|---|
| `backendClient` | `AuthorizationHeaderInterceptor` + `TokenAuthenticator` | 일반 백엔드 API |
| `refreshClient` | 없음 | `POST auth/refresh` |
| `aiReviewClient` | `retryOnConnectionFailure(false)` | `POST posts/{id}/ai-review` |
| `publicClient` | 인증/갱신 없음 | 배너 (`NetworkModuleTest`: 401에도 자격증명 전송/갱신 안 함) |
| `presignedUploadClient` | 없음 | S3 presigned PUT (사인 PNG, 게시물 WebP) |

- `AuthorizationHeaderInterceptor`: 저장된 access token을 `Authorization: Bearer`로 첨부. 만료(`expiresAt <= now`)된 토큰은 헤더를 생략하고 401 -> authenticator에 맡김. 요청에 `AuthorizationRequestContext` 태그를 달아 사용한 토큰 식별. HTTP(비 TLS) 요청에는 헤더 미첨부 (`AuthorizationHeaderInterceptorTest`).
- `TokenAuthenticator`: 최대 2회 시도. 사용한 토큰이 이미 최신이 아니면 재발급 없이 새 토큰으로 재시도. 401 응답 body의 `errorCode == "REAUTHENTICATION_REQUIRED"`이면 재발급 없이 세션 clear. 그 외 `SessionRefreshCoordinator`(뮤텍스, single-flight)로 `POST auth/refresh {refreshToken}`. 재발급 도중 로그아웃/계정 전환되면 세션 되살리지 않음.
- 갱신 결과: Success / ReauthenticationRequired(401 또는 errorCode REAUTHENTICATION_REQUIRED -> `sessionStore.clear()`) / TransientFailure(네트워크, 5xx, 필수 토큰 누락 -> 요청만 실패, 로그아웃 안 함).
- `ApiRequestExecutor` -> `ApiResult.Success | Failure(ApiError)`; `ApiError.Network`(IOException), `InvalidResponse`(빈 body, SerializationException), `Http(status, errorCode?, message?)`. 오류 body 형식 `{errorCode, message}`; body가 달라도 status 보존.
- 연결 상태: `core/network/ConnectivityObserver.kt`(ConnectivityManager 기본 네트워크 콜백) -> 버전 게이트의 오프라인 처리에 사용.

### 3.2 토큰 저장소 (`data/local/auth/`)
- DataStore Preferences `auth_session`: `user_id`, `encrypted_access_token`, `expires_at_epoch_seconds`, `encrypted_refresh_token`, `refresh_token_expires_at_epoch_seconds`, `is_guest`, 레거시 평문 `access_token`(제거 대상).
- 암호화: AES/GCM/NoPadding, Android Keystore 256비트 키(별칭 `chalkak_access_token`), IV 12바이트 (`TokenCipher.kt`). 손상된 암호문은 null (`AndroidKeystoreTokenCipherTest`).
- 만료된 refresh token 또는 복호화 불가 데이터는 SignedOut으로 취급하고 clear.
- JWT `session_id` 클레임 유무로 푸시 등록 가능 여부를 판단(디코드만, 서명 검증 없음 [추정]).

### 3.3 에러 매핑 표 (errorCode / HTTP 상태 -> 문구/동작)
Android는 서버 `errorCode`를 거의 쓰지 않고 **HTTP 상태 + 일부 message 텍스트**로 분기한다. errorCode로 분기하는 것은 아래 2개뿐이다.

| 키 | 위치 | 동작 |
|---|---|---|
| errorCode `REAUTHENTICATION_REQUIRED` (401 body 또는 refresh 응답) | `TokenAuthenticator`, `TokenRefresher` | 세션 clear -> AuthGate가 Login 표시 |
| errorCode `SIGNATURE_PROCESSING_PENDING` (400) | `AuthRepositoryImpl` | 1초 간격 최대 10회 재시도, 소진 시 타임아웃 문구 |
| message `"이미 해당 주제에 게시물을 작성했습니다."` | `PostCreationRepositoryImpl` | AlreadySubmitted -> "이미 이 주제에 전시한 사진이 있어요." |
| message `"현재 게시물을 작성할 수 없는 주제입니다."` | 동일 | TopicNotOpen -> "주제가 변경되어 전시할 수 없어요." |

HTTP 상태 기반 매핑 요약(상세 문구는 2장):

| 상태 | 화면 | 사용자 문구/동작 |
|---|---|---|
| 401 (갱신 실패 후) | 전역 | 세션 clear -> Login. 화면별로는 업로드/피드백/게이트가 UiEvent로 Login 이동 |
| 400 | 피드 삭제/수정, 기록, 피드백, 사인 | 각 2장의 개별 문구 |
| 403 | 업로드 게이트 | "이용이 정지되어 게시물을 작성할 수 없어요." |
| 403 | AI 리뷰 | "이용이 정지된 회원은 AI 리뷰를 요청할 수 없습니다." |
| 403 | 피드 삭제/수정 | 소유자 아님 문구 |
| 404 | 업로드 게이트 | "지금 참여할 수 있는 주제가 없어요." |
| 404 | 피드/알림/AI 리뷰/삭제 | 각 화면 개별 문구(AI 404는 섹션 숨김) |
| 5xx | AI 폴링 | 일시 오류로 보고 계속 폴링(메시지 1회) |
| 네트워크(IOException) | 전역 | "네트워크 연결을 확인해 주세요." 계열 |
| InvalidResponse | 전역 | 화면별 "...불러오지 못했어요" 계열 |

### 3.4 아키텍처 규칙 (`client/android/CLAUDE.md`, `AGENTS.md`, Konsist 테스트)
- `ArchitectureKonsistTest`: feature -> data 직접 참조 금지, domain -> feature/data/core 의존 금지, `core.designsystem` -> feature 금지, domain은 `android.*` 사용 금지(주석/문자열/import는 코드 참조 아님, 완전 수식 참조/문자열 보간 내 참조는 위반으로 감지).
- `ComposeKonsistTest`: `*Screen` 컴포저블은 ViewModel/NavController 직접 사용 금지(Route에서 주입).
- 규칙: Route/Screen 분리, 디자인시스템 토큰만 사용, `modifier`는 첫 번째 선택 파라미터, 상태 없는 Screen에는 `@Preview`.

### 3.5 분석(Analytics) (`core/analytics/AnalyticsTracker.kt`, `FirebaseAnalyticsTracker.kt`)
- 이벤트는 2종뿐, 호출은 `ChalkakNavHost.kt`(L~171, L~912)에서만:
  - `screen_view` {screen_name, screen_class}: 백스택 변경 시와 약관 다이얼로그 표시 시.
  - `bottom_navigation_selected` {destination: home|display|record|settings}.
- screen_name 매핑: login(Login), terms(Terms), onboarding_signature, change_signature, onboarding_signature_preview, change_signature_preview, home, issue(IssueWeb), notifications, notification_detail, display, feed(Feed/FeedById), record, settings, feedback, photo_upload, photo_upload_success, privacy_policy, terms_of_service.
- 업로드/좋아요/AI 리뷰 등 도메인 이벤트는 없음.

### 3.6 날짜/KST
- "오늘"은 `ZoneId.of("Asia/Seoul")`로 계산(Home, Feed, Display, Record, Notifications). 토픽 요청은 KST 날짜 ISO 형식(`TopicRemoteDataSourceImplTest`). 홈은 KST 자정 경계에서 재로드 및 주 이동.

---

## 4. 기존 테스트

### 4.1 실행 명령 (`client/android`에서)
- 단위 테스트 + 린트(CI와 동일 조합): `./gradlew ktlintCheck testDebugUnitTest`
- 단위 테스트만: `./gradlew testDebugUnitTest`
- 계측 테스트(에뮬레이터/기기 필요): `./gradlew connectedDebugAndroidTest` [추정: 표준 AGP 태스크]
- Konsist 아키텍처 검사는 `testDebugUnitTest`에 포함.

### 4.2 단위 테스트 (`app/src/test/java/com/stonefive/chalkak/`, 약 480개 @Test)
(경로는 위 `{test}/` 기준, 괄호는 개수)

| 파일 | 검증 요약 |
|---|---|
| ArchitectureKonsistTest (7) | 4개 계층 의존 규칙 + 패키지명 문자열/주석/import는 위반 아님, 완전수식·문자열 보간 참조는 위반 감지 |
| ComposeKonsistTest (1) | Screen이 ViewModel/NavController를 직접 쓰지 않음 |
| navigation/ChalkakRouteTest (8) | Feed/FeedById/Display/PhotoUpload/Success/서명 라우트 직렬화 왕복, 구버전 FeedById(썸네일 없음) 호환 |
| core/appupdate/DisabledAppUpdateGatewayTest (1) | 디버그 게이트가 업데이트 불필요 반환 |
| core/auth/KakaoIdTokenClientTest (6) | 톡 성공/취소(계정 fallback 없음)/실패 fallback/톡 불가 시 계정/가용성 확인 실패=Unknown/idToken 없음=Configuration |
| core/designsystem/component/image/FittedPhotoCardShapeTest (5), PhotoTransitionTest (5), scroll/CollapsingScrollTest (8) | 카드 도형, 공유 사진 전환, 접히는 헤더 스크롤 계산 |
| core/legal/LegalDocumentLauncherTest (1) | 표시 실패 시 콜백 |
| core/web/IssueLinkNavigationTest (6) | 웹뷰 링크 정책(외부/앵커/자동 네비게이션 차단/비 http 차단/서브프레임/새 창) |
| data/remote/AuthTokenRefresherTest (4) | 갱신 성공/REAUTH 코드/5xx=일시 실패/토큰 누락=일시 실패 |
| data/remote/AuthorizationHeaderInterceptorTest (4) | 토큰 첨부/HTTP 미첨부/토큰 없음/만료 토큰 생략 |
| data/remote/NetworkModuleTest (3) | public client 무자격증명, HTTPS 허용, HTTP 거부 |
| data/remote/TokenAuthenticatorTest (9) | 401 재발급 후 재시도, REAUTH 시 세션 정리, 재로그인 필요/일시 실패, 선행 갱신 재사용, 갱신 중 로그아웃/계정 전환, 재시도 실패 시 중단, 동시 401 single-flight |
| data/remote/aireview/AiReviewDataSourceImplTest (2) | GET 역직렬화, POST 본문 없음 |
| data/remote/auth/AuthDataSourceImplTest (6) | 로그인/Kakao body, 필수 필드 누락=InvalidResponse, 서명 업로드 응답, 로그아웃 204, errorCode 구조화 |
| data/remote/post/OkHttpPostImageUploaderTest (2), signature/OkHttpSignatureUploaderTest (2) | 인증 헤더 없는 raw PUT, 잘못된 Content-Type/URL 실패 |
| data/remote/post/PostCreationRemoteDataSourceImplTest (6) | maxBytes Long 보존, POST body, title null 생략, 401/오류 body 보존, 잘못된 body |
| data/remote/post/PostRemoteDataSourceImplTest (17) | today/상세/삭제/제목수정/캘린더/정렬·seed 쿼리/좋아요 PUT·DELETE/Bearer/HTTP 오류/빈·깨진 body/썸네일 필수/네트워크 |
| data/remote/topic/TopicRemoteDataSourceImplTest (6) | KST 날짜 쿼리, 캐시 유지, 오류 보존 |
| data/remote/user/UserDataSourceImplTest (8) | 서명 조회/업로드 URL/변경 확정/탈퇴 경로·오류 |
| data/repository/AiReviewRepositoryImplTest (5) | 매핑, 미완료 결과 없음, 잘못된 상태=InvalidResponse, HTTP/네트워크 보존 |
| data/repository/AuthRepositoryImplTest (10) | 로그인 userId 저장, Kakao provider 전달, 신규 가입(업로드 1회, PENDING 재시도), 10회 타임아웃, 잘못된 업로드 URL, 로그아웃(서버 호출/무세션), 게스트, 재인증 실패 시 컨텍스트 제거 |
| data/repository/BannerRepositoryImplTest (5) | 매핑, 빈/범위 밖 페이지, hasNext 기본값, HTTP 오류, 깨진 응답 |
| data/repository/FeedbackRepositoryImplTest (6) | trim, 빈/초과 길이, 401/400/네트워크 변환 |
| data/repository/PostCreationRepositoryImplTest (20) | 정책/인코딩/PUT/생성 순서, 캐시 주제, 실패별 파일 삭제, 중복/닫힌 주제 매핑, VALIDATING·PENDING, 만료 URL 재발급, 편집값 전달, 취소 시 파일 삭제 |
| data/repository/PostRepositoryImplTest (23) | today 계약, 캘린더 정렬/월 불일치, 상세 매핑, 삭제 결과, 제목 trim, 랭킹 페이지/seed 규칙, 좋아요 응답 검증 |
| data/repository/UserRepositoryImplTest (6) | 사인 프로필 변환, 401, 변경 플로우, 탈퇴 성공/실패 시 세션 처리 |
| domain/model/HomeContractTest (2), photoedit/ PhotoAdjustmentLayersTest (7), PhotoAdjustmentsTest (8), PhotoAutoAdjusterTest (6), PhotoColorGoldenTest (8), PhotoEditTransformTest (5) | 홈 계약, 보정 레이어/값 범위, 자동 보정, 컬러 매트릭스 golden, 회전/크롭 변환 |
| feature/authgate/AuthGateViewModelTest (1) | 로그아웃/게스트/회원 상태 구분 |
| feature/versiongate/VersionGateViewModelTest (7) | 우선순위 규칙, 오프라인 통과/온라인 재검사, 통과 이력, 강제 업데이트, 복귀 시 재확인, 실패 후 재시도, 업데이트 후 잔존 |
| feature/login/LoginViewModelTest (9), KakaoLoginActionTest (3), GoogleLoginActionTest (1) | 로그인 성공/가입 필요/취소 복귀/오류 문구 변환/메시지 ID/게스트 |
| feature/signature/SignatureViewModelTest (4), SignatureChangeViewModelTest (2), SignUpViewModelTest (2) | 제출 가능 조건/되돌리기/전체 지우기/PNG 이벤트, 변경 성공·실패 토스트, 가입 성공·실패 |
| feature/home/HomeViewModelTest (34), HomeAiReviewTest (14) | 랭킹, 주간 경계, hero 상태, 게스트, 초기 표시 데드라인, KST 자정, 새로고침, 배너 페이징·오류, AI 폴링/5분/pause·resume/실패·재요청/늦은 응답 |
| feature/display/DisplayViewModelTest (46), component/DisplayDatePickerSheetTest (3) | 날짜 이동/clamp, 정렬 재조회, 랜덤 seed 유지, 좋아요 낙관/롤백/병합, 페이징, 재검증 실패, 날짜 피커 범위 |
| feature/feed/FeedViewModelTest (18), FeedAiReviewTest (22), component/FeedPhotoZoomTest (4) | 상세 로드/캐시, 좋아요 낙관/롤백/순서, 삭제/제목 수정 권한, AI 폴링/POST 오류/자정/계정 전환, 핀치 줌 |
| feature/feedback/FeedbackViewModelTest (8) | 전송 조건, trim, 401/400/네트워크, 토스트 소비 |
| feature/notification/NotificationViewModelTest (9) | 삭제 알림 토스트/갱신, 토스트 id, 네트워크 실패, 취소 전파, 인증 오류, 읽음 변경 범위, AI 결과 알림 |
| feature/photoedit/CropGeometryTest (18), PhotoEditViewModelTest (21), component/RulerScaleTest (4) | 크롭 기하, 편집 상태/초기화/자동 보정, 눈금자 디텐트 |
| feature/record/RecordViewModelTest (38), component/RecordMonthPickerSheetTest (1) | 월 이동/캐시/삭제 반영/재검증/늦은 응답/저장 권한 토스트 |
| feature/settings/SettingsViewModelTest (21) | 서명 조회/재진입/401, 계정 작업, 로그아웃/탈퇴, 게스트 로그인, 알림 토글 독립 저장·부분 복원 |
| feature/upload/PhotoUploadEntryGateViewModelTest (7), PhotoUploadViewModelTest (30), CameraCaptureTest (3), KoreanObjectParticleTest (2) | 게이트 분기, 주제 선조회, 편집/준비/취소, 제출/중복 탭/실패 메시지/401, 카메라 저장 권한·파일명, 을/를 |
| feature/today/* (TodayViewModelTest 24, TodayScrollBehaviorTest 2, TodayPhotoCardTest 2) | **앱에서 쓰이지 않는 죽은 코드**(`feature/today`)의 테스트 |

### 4.3 계측 테스트 (`app/src/androidTest/java/com/stonefive/chalkak/`, 약 230개)
| 파일 | 검증 요약 |
|---|---|
| ExampleInstrumentedTest (1) | 패키지명 확인 |
| SignatureFlowTest (1) | 약관 -> 사인 -> 미리보기 -> 홈 -> 전시 |
| navigation/ChalkakNavHostTest (18) | 하단바 인스턴스 유지, Feed에서 하단바 숨김, 연타 방지, 알림 열기/뒤로, 랭킹 링크, 기록에서 전시 복귀, 업로드 성공 후 전시, 푸시 라우팅(공지 상세/TOPIC/AI 결과 FeedById/같은 게시물 교체/Home 중복 방지), 이슈 웹 screen_view |
| navigation/MainBottomBarLayoutTest (3) | 하단바 오프셋/높이 |
| core/notification/NotificationNavigationSavedStateTest (6) | 대기 푸시 프로세스 복원/소비 후 비저장/신규 푸시 보존 |
| core/legal/LegalDocumentLauncherTest (3) | 문서-URL 매핑, 요청, 실패 콜백 |
| core/designsystem/component/image/PhotoTransitionUiTest (3), PhotoMotionContinuityTest (1) | 사진 전환 시각 검증 |
| data/local/auth/AndroidKeystoreTokenCipherTest (2) | 실제 Keystore 암복호화, 손상 암호문 null |
| data/local/notification/PushNotificationIconTest (3) | 알림 아이콘 |
| data/local/reminder/LegacyReminderCleanupTest (5) | 레거시 알람 취소, 패키지 교체/부팅 시 취소, 무관한 알람 보존, 푸시 알림 보존 |
| data/post/AndroidPostImageEncoderTest (8), AndroidPhotoEditImageRepositoryTest (2) | 실제 WebP 인코딩/EXIF 제거, 회전 8모드, 용량 초과 실패, 크롭/회전/흑백/노출 |
| data/remote/PushSessionReadinessTest (3) | session_id 클레임 없음=등록 생략, 갱신 거절=재인증, 클레임 있으면 등록 |
| feature/aireview/AiReviewComponentsTest (4) | 파형/리플/기준 다이얼로그 |
| feature/display/DisplayScreenTest (13), DisplayPhotoCardTest (3) | 정렬/빈 상태/헤더 접힘/날짜 내비/좋아요 영역 |
| feature/feed/FeedScreenTest (20) | 기록 진입 로딩, 삭제/수정 버튼 노출, AI 알약/시트/알림 진입 |
| feature/home/HomeScreenTest (22), HomePhotoTransitionTest (1) | hero 상태, AI 카드, 랭킹 링크, 배너 섹션/페이징 |
| feature/login/LoginScreenTest (5) | 버튼 표시/카카오·Google·게스트 콜백 |
| feature/notification/NotificationScreenTest (4) | 목록 표시/뒤로/스크롤/터치 영역 |
| feature/record/RecordScreenTest (9) | 달력/월 이동/PENDING 상태/피드·전시 열기/미인증 |
| feature/settings/SettingsScreenTest (8), component/SettingsPushNotificationCardTest (7) | 회원/게스트 표시, 다이얼로그, 푸시 스위치 독립성 |
| feature/signature/SignaturePngEncoderTest (1), SignaturePreviewScreenTest (4), SignatureScreenTest (5) | 투명 배경 PNG, 미리보기 문구/버튼, 그리기 입력 |
| feature/terms/TermsScreenTest (5) | 필수 동의 -> 다음 활성화, 보기 버튼 |
| feature/upload/PhotoUploadScreenTest (10), PhotoUploadSuccessScreenTest (1) | 제출 버튼 상태, 카메라 숨김, 캡션 포커스, 완료 화면 문구 |
| feature/versiongate/VersionGateScreenTest (1) | 확인 실패 시 재시도 화면 |
| feature/today/TodayScreenTest (12) | 죽은 코드 화면 테스트 |

### 4.4 테스트되지 않거나 약한 영역
- **Terms**: ViewModel/상태 단위 테스트 없음(화면 계측 테스트만). 동의 영속/서버 전송 자체가 없음.
- **NotificationDetail** 화면/ViewModel: 전용 테스트 없음.
- **푸시 수신/등록**: `ChalkakFirebaseMessagingService`, `PushDeviceRegistrationCoordinator`(중복 제거/뮤텍스), `PushNotificationManager` 포그라운드 알림 구성 단위 테스트 없음(`PushSessionReadinessTest`, 아이콘 테스트만).
- **푸시 읽음 처리 오류 분기**(네트워크/404/id 없음 토스트): NavHost 계측 테스트가 일부 라우팅만 커버, 오류 토스트 분기는 미확인 [추정: 미테스트].
- **알림 권한 1회 요청 로직**, 설정의 "기기 알림 꺼짐 -> 시스템 설정 이동" 흐름: 테스트 없음.
- **UserSessionStore / SessionRefreshCoordinator / ConnectivityObserver / TokenCipher 인터페이스 단위**: 직접 테스트 없음(Keystore 계측만, 코디네이터는 `TokenAuthenticatorTest`에서 간접 커버).
- **WebPage 화면 / SinglePageWebView**, **법률 문서 WebView 다이얼로그 UI**: 링크 정책 외 UI 테스트 없음.
- **분석 이벤트**(`screen_view`, `bottom_navigation_selected`): 이슈 웹 1건만 확인.
- **피드백 화면 UI**, **PhotoEdit 화면 UI**(제스처/드래그): ViewModel/기하만 테스트.
- **Record 달력 이미지 저장 실제 MediaStore 쓰기**: 권한 토스트만 테스트.
- **AI 리뷰 폴링 시간(3초/5분)**: Home/Feed 단위 테스트(가상 시간)로 커버됨.
- **VersionGate 실제 Play Core 연동**: 가짜 게이트로만 검증.
- **회원탈퇴/로그아웃 후 푸시 기기 해제**: 기능 자체가 없음.

---

## 5. Android 고유/iOS 분기 가능 동작 및 의심 버그

### 5.1 Android 고유 동작 (iOS와 다를 가능성)
1. **강제 업데이트**: Play In-App Update `updatePriority >= 1` IMMEDIATE. iOS는 App Store 구조상 다른 방식(서버 최소 버전 등)이 필요 [추정]. 오프라인이면 게이트 통과, 확인 실패(온라인)면 진입 차단 (`feature/versiongate`).
2. **스플래시 보류**: 홈 프리로드 최대 700ms 동안 `installSplashScreen` 유지 (`MainActivity.kt`).
3. **카메라**: CAMERA 권한 없이 시스템 카메라 인텐트(`TakePicture`) 사용, 촬영본은 별도로 갤러리에 저장하며 API<=28에서만 저장 권한 요청 (`feature/upload/CameraCapture*`).
4. **갤러리**: `GetContent("image/*")`(시스템 파일 선택기), 별도 사진 권한 없음.
5. **WebP 인코딩**: `Bitmap.CompressFormat.WEBP_LOSSY`(API 30+)/`WEBP`(이전). iOS는 기본 WebP 인코더가 없어 별도 라이브러리가 필요 [추정]. 정책 `contentType=image/webp` 필수.
6. **알림 권한**: Android 13+ `POST_NOTIFICATIONS`, 1회만 요청 후 SharedPreferences 플래그. 거부 후 설정의 스위치 ON 시 시스템 알림 설정으로 이동. 포그라운드 FCM은 앱이 직접 알림 생성, 권한 없으면 무표시.
7. **푸시 탭 라우팅**: 백그라운드 탭은 `google.message_id` extra로 판별, 인스턴스 상태에 대기 저장(프로세스 복원 대응), 로그인/약관/사인 화면에서는 소비 보류.
8. **하단바**: 가운데 "+" 버튼이 있는 5요소 구조, 홈 탭은 상태 복원 없음.
9. **토큰 저장**: Android Keystore AES-GCM + DataStore (iOS는 Keychain 등 [추정]).
10. **FCM 토큰 등록 타이밍**: onResume마다 확인, JWT `session_id` 클레임 필요.
11. **Kakao**: 카카오톡 앱 로그인 우선 + 계정 로그인 fallback, `AuthCodeHandlerActivity` 스킴. 취소 시 fallback하지 않음.
12. **뒤로가기 및 하드웨어 백**: Compose Navigation 기본 백스택 의존 [추정].
13. **레거시 리마인더 정리**: 과거 로컬 알람 기능 잔존 정리 코드(신규 플랫폼은 불필요).

### 5.2 의심 버그 / 주의 사항

| # | 내용 | 근거 |
|---|---|---|
| 1 | 사인 변경 시 `thumbnail`을 original URL로 대입(별도 썸네일 미사용) | `data/repository/UserRepositoryImpl.kt` `updateMySignature` |
| 2 | `INITIAL_RECORD_MONTH`가 최상위 val이라 프로세스 수명 중 고정(월 변경 후에도 이전 월이 "현재"가 될 수 있음) [추정] | `feature/record/RecordViewModel.kt` |
| 3 | 게시물 생성 충돌을 서버 message 한글 텍스트로 판별(문구 변경/다국어에 취약). errorCode 미사용 | `data/repository/PostCreationRepositoryImpl.kt` |
| 4 | Feed 좋아요 실패 시 사용자 메시지 없이 무음 롤백(Display는 토스트 있음). 서버 쓰기 순서 보장 TODO | `feature/feed/FeedViewModel.kt` |
| 5 | 제목 수정 시 trim 적용(POST-005는 비어 있지 않은 제목을 trim하지 않는다고 규정). 빈 제목은 null 전송 | `PostRepositoryImpl`, 테스트 `게시물 제목은 앞뒤 공백을 제거하고 빈 제목은 null로 변환` |
| 6 | 캡션 길이를 grapheme 기준으로 자름(서버는 코드포인트 기준 10자) -> 결합 이모지 등에서 서버 한도와 차이 가능 | `feature/upload/PhotoUploadViewModel.kt` `takeGraphemes` |
| 7 | `markAllAsRead()`, `hasUnread` UI 미연결(모두 읽음 버튼, 벨 배지 없음) | `feature/notification` |
| 8 | `feature/today` 패키지 전체가 앱 코드에서 참조되지 않는 죽은 코드(자체 테스트만 존재) [grep 확인] | `{pkg}/feature/today/*`, 테스트 `TodayViewModelTest`, `TodayScreenTest` |
| 9 | `FIRST_TOPIC_DATE = 2026-09-17` 하드코딩(서버 데이터와 불일치 위험) | `feature/display/DisplayViewModel.kt` |
| 10 | `TodayPostModerationStatus`에 REJECTED가 없어 서버가 REJECTED를 내리면 InvalidResponse로 처리될 수 있음 [추정] | `domain/model`, `PostRepositoryImpl`(today 응답 계약 위반 테스트 존재) |
| 11 | 게시물 생성의 불명확한 결과(타임아웃 등) 후 `posts/today` 재확인(POST-011 복구) 없음 | `PostCreationRepositoryImpl` |
| 12 | 작가 공개 게시물 조회(`GET /users/{userId}/posts`, POST-012) 미구현 | 전체 소스 검색 결과 없음 |
| 13 | 로그아웃/탈퇴 시 푸시 기기 해제 호출 없음(서버가 처리하는지 [추정]) | `PushDeviceRegistrationCoordinator`, `AuthRepositoryImpl.logout` |
| 14 | OkHttp 타임아웃 미설정(기본값) -> 대용량 WebP PUT/느린 망에서 사용자 경험 불확실 [추정] | `NetworkModule.kt` |
| 15 | 약관 동의가 로컬 상태일 뿐 영속/서버 전송 없음(서버 가입 API에 동의 필드가 없다면 문제 없음 [추정]) | `feature/terms` |
| 16 | Google 로그인 버튼과 구현이 코드에 남아 있음(범위 밖: 보류로 표기) | `feature/login`, `core/auth` |
| 17 | 서명 PNG 획 색이 흰색(투명 배경)이라 미리보기는 사진 위에서만 보임 - 다른 플랫폼 구현 시 동일 규격 필요 | `feature/signature` `SignaturePngEncoder` |
| 18 | `TokenAuthenticator`는 에러 body 파싱으로 REAUTH 판별 - body가 JSON이 아니면 일반 갱신 경로 | `data/remote/TokenAuthenticator.kt` |
| 19 | 알림 읽음 404 문구 "삭제된 게시물입니다"가 알림 종류와 무관하게 고정(다른 문구 체계와 불일치) | `feature/notification` |

### 5.3 비즈니스 규칙 대응(참조용, 읽기 전용)
POST-004(WebP, 5 MiB, URL 5분, 업로드 ID 1시간) / POST-005(제목 10 코드포인트) / SIGN-002(PNG 1 MiB) / USER-003, 004(탈퇴) / NOTIFICATION-005, 006, 015 / AIREVIEW / TOPIC-002, 005(KST). 원본: `원본 레포 docs/business-rules/rules/*.md`, 기능-API 대응표: `원본 레포 devwiki/wiki/chalkak/feature-map.md`.

### 5.4 참고 문서 (레포 내)
- `client/android/docs/architecture/post-image-encoding.md`, `photo-edit.md`, `ui-state-navigation.md`
- `client/android/CLAUDE.md`, `AGENTS.md`
