# 찰캌 원본 클라이언트 UI 스펙 (A파트)

범위: 버전 게이트·스플래시, 로그인, 약관 동의, 온보딩·사인(+설정 사인 변경), 메인 탭 셸·하단 바, 홈(전 섹션), Today(레거시), AuthorPosts.

## 0. 문서 규칙

- 근거 표기는 `파일명:줄`. 파일명은 저장소 안에서 유일하다.
  - iOS 루트: `client/iOS/chalkak/chalkak/`
  - Android 루트: `client/android/app/src/main/java/com/stonefive/chalkak/`
  - 리소스: `client/android/app/src/main/res/`, iOS `Assets.xcassets`
- 줄 번호 앞의 `~`는 여러 파일을 한 번에 출력해 줄 번호가 이어진 경우를 보정한 값이다. 오차는 ±3줄 이내다.
- 토큰은 `colors.x`, `typography.x`, `spacing.x(값)`, `shapes.x(값)`처럼 이름으로 쓴다. 하드코딩된 값은 숫자 그대로 쓴다. 단위는 iOS pt, Android dp이고 둘은 같은 수치다.
- 카피는 소스의 문자열을 그대로 옮겼다. 줄바꿈 `\n`도 원문 그대로다.

### 0.1 토큰 요약

**Spacing** (`ChalkakSpacing.swift:37-44`, Android `Spacing.kt`)
- none 0 / xs 4 / sm 8 / md 12 / lg 16 / xl 24 / xxl 40 / screenHorizontal 25

**Shape** (`ChalkakShape.swift:37-44`, Android `Shape.kt`)
- small 7 / button 12 / input 14 / photoCard 12 / large 16 / xlarge 18 / sheet 28
- pill: iOS Capsule, Android CircleShape

**Typography** (Pretendard, `ChalkakTypography.swift:52-77`, Android `Type.kt`)

| 토큰 | 굵기/크기 | 비고 |
|---|---|---|
| display | Bold 32 | |
| title1 | Bold 28 | |
| title2 | Bold 24 | |
| title3 | SemiBold 20 | |
| headline | SemiBold 18 | |
| body | 17 | |
| callout | 16 | |
| subheadline | 14 | |
| footnote | 13 | |
| caption | 12 | |
| photoCardTitle | 19 | |
| brand | "Continuous" 30 | Android lineHeight 36, letterSpacing -0.42 (`Type.kt:106-112`) |
| handwriting | "GriunXHangeulBanguri-Regular" 20 | Android lineHeight 17 (`Type.kt:114`) |

**Color 토큰** (`ChalkakColor.swift:4-30`)
- 배경: background, surface, surfaceElevated, inputBackground, bottomBar
- 텍스트: textPrimary, textSecondary, textMuted, textInactive, textOnImage
- 선·커서: border, inputCursor
- 액션·아이콘: actionPrimary, onActionPrimary, iconPrimary, iconSecondary
- 기타: scrim, error, calendarCell, calendarCellBorder, skeletonBase, skeletonHighlight, editor*

**Android 원시 색** (`Color.kt:6-17`)
- ChalkakBackground #F7F6F3
- ChalkakInputBackground #FCFAF6
- ChalkakBottomBar #8C8479
- ChalkakAction #2B2724
- ChalkakPhotoActionText #7D7D7D
- ChalkakInputCursor #B0563B
- ChalkakWhite #FFFFFF
- surfaceElevated는 White다 (`Color.kt:60`).
- Android에는 skeleton 토큰도 skeleton 컴포넌트도 없다.

---

## 1. 공통 컴포넌트

### 1.1 ChalkakButton (주 버튼)

| 항목 | iOS (`ChalkakButton.swift:3-31`) | Android (`ChalkakButton.kt:20-41`) |
|---|---|---|
| 폰트 | typography.callout | typography.callout |
| 패딩 | 가로 spacing.xl(24), 세로 17 (`verticalPadding` 파라미터) | contentPadding 24 / 17 |
| 폭 | `fillsWidth`이면 maxWidth infinity | `Modifier.fillMaxWidth`는 호출부에서 지정 |
| 모양 | shapes.button(12) | shapes.button(12) |
| 활성 | 배경 colors.actionPrimary, 글자 colors.onActionPrimary | 동일 |
| 비활성 | 배경 actionPrimary.opacity(0.12), 글자 colors.textPrimary | disabledContainer actionPrimary alpha 0.12, disabledContent textPrimary |
| 눌림 | `.buttonStyle(.plain)`이라 시각 효과 없음 | Material ripple(기본) |
| 애니메이션 | 없음 | ripple만 |

### 1.2 ChalkakOutlinedButton

iOS `ChalkakOutlinedButton.swift:11-34`, Android `ChalkakOutlinedButton.kt:21-43`.

- 폰트·패딩·모양: callout, 24/17, shapes.button(12)
- 테두리: 1pt `colors.border`. 활성·비활성 모두 같다.
- 배경: iOS는 surfaceElevated.opacity(0.001). 투명이지만 히트 영역을 확보하려는 값이다.
- 글자: 활성 colors.textPrimary, 비활성 colors.textMuted
- 눌림: iOS 효과 없음, Android ripple

### 1.3 내비게이션 버튼 (iOS 전용, `ChalkakNavigationButton.swift`)

- 지름 48.
- `back`: SF Symbol `chevron.backward`, 접근성 "뒤로 가기"
- `close`: SF Symbol `xmark`, 접근성 "닫기"
- iOS 26 이상은 `.glass` 버튼 스타일, 그 미만은 `.plain` (25-61)
- `ChalkakCloseButton`은 iOS 26에서 `Button(role: .close)`를 쓴다 (64-77).
- `ChalkakUnhighlightedButtonStyle`: 눌림 효과 없음 (91-95). 사진 셀, 랭킹 카드 등에 쓴다.

### 1.4 ChalkakFilledIconButton (Android 전용, `ChalkakFilledIconButton.kt:20-33`)

- 모양: pill(CircleShape). 컨테이너 colors.actionPrimary.
- 비활성: 컨테이너 alpha 0.12, 콘텐츠 textMuted
- 재시도 버튼에 `Icons.Filled.Refresh`와 함께 쓴다. 기본 크기는 40.

### 1.5 ChalkakCheckbox

iOS `ChalkakCheckbox.swift:7-15`, Android `ChalkakCheckbox.kt:19-29`.

- 22×22 이미지, 원본 색(template 아님)
- 에셋: `ic_checkbox_selected` / `ic_checkbox_unselected`
  - selected: radius 6 라운드 사각, 채움 #2B2724, 체크 #F7F4EE
  - unselected: stroke 1, #2B2724, opacity 0.2196
- 애니메이션 없음, 상태 즉시 교체

### 1.6 ChalkakTextField

iOS `ChalkakTextField.swift:33-76`, Android `ChalkakTextField.kt:61-117`.

- 폰트: 기본 typography.body
- 글자색: textPrimary, 비활성 textMuted
- placeholder: colors.textInactive
- 커서: tint colors.inputCursor
- 내부 패딩: spacing.lg(16). 카운터가 있으면 bottom에 spacing.xl(24)을 더한다(Android도 bottom 24).
- 배경 colors.inputBackground, 모양 shapes.input(14)
- 테두리 1pt: 포커스 시 colors.actionPrimary, 평소 colors.border
- 카운터:
  - 형식 "N / max", typography.subheadline, textInactive
  - 위치 bottomTrailing, padding lg
- 줄 수: iOS `lineLimit(1...5)`
- 길이 계산
  - iOS: characters(grapheme) 또는 unicodeScalars 중 선택
  - Android: grapheme
- 포커스 테두리 전환 애니메이션은 없다.

### 1.7 ChalkakLogo

iOS `ChalkakLogo.swift:6-10`, Android `ChalkakLogo.kt:11-16`.

- Text "Chalkak", typography.brand(30), tracking -0.42, colors.textPrimary
- 접근성 "찰캌"

### 1.8 Skeleton과 이미지 placeholder (iOS 전용)

**`ChalkakSkeleton.swift`**
- 바탕 colors.skeletonBase
- shimmer: LinearGradient [clear, skeletonHighlight, clear]
- 밴드 폭 = 0.6 × 너비
- 이동: offset −band → width(왼쪽에서 오른쪽), `linear(duration: 1.2).repeatForever(autoreverses: false)`
- clip은 호출부 책임이다.

**`loadingSkeleton` modifier** (같은 파일 29-115)
- showDelay 0.5초: 0.5초 안에 끝난 로딩은 skeleton을 띄우지 않는다.
- minVisible 0.25초: 한 번 뜨면 최소 0.25초 유지한다.
- 사라질 때: `easeOut(0.2)` + `.transition(.opacity)`

**`RemoteImage`** (`ChalkakImage.swift:287`)
- 로딩 중에 skeleton을 쓴다.
- placeholder (291-336)
  - 바탕 colors.inputBackground
  - URL 없음: SF `photo`, 실패: SF `photo.badge.exclamationmark`. 아이콘 크기 24.

**Android** (`ChalkakImage.kt`)
- skeleton이 없다. Coil AsyncImage가 썸네일 placeholder가 있으면 그것을, 없으면 빈 영역을 보여준다.

### 1.9 Toast

**iOS `ChalkakToast.swift:18-28`**
- 텍스트: typography.subheadline, colors.onActionPrimary, multiline center
- 배경: colors.actionPrimary Capsule
- 패딩: 가로 spacing.lg(16), 세로 spacing.md(12)
- 위치: 하단 overlay, 가로 spacing.screenHorizontal(25), bottom 32
- 전환: `.move(edge: .bottom).combined(with: .opacity)`, `allowsHitTesting(false)`
- 표시·숨김: `withAnimation(.snappy)`, 2.5초 뒤 자동으로 사라진다 (36-73).
- 앱 전역 `ContentView.showMessage`도 같은 방식이다 (`ContentView.swift:850-862`).

**Android** (`core/ui/UiMessage.kt:35-48`)
- 시스템 `Toast.LENGTH_SHORT`를 `UiMessageEffect`로 띄운다. 커스텀 디자인이 없다.

### 1.10 ChalkakSignedImage (사진+사인 합성)

iOS `ChalkakSignedImage.swift:16-45`, Android `ChalkakSignedImage.kt`.

- 사인은 bottomTrailing(BottomEnd)에 둔다.
- 기본 크기 56×42, padding spacing.sm(8)

### 1.11 Android 전용 보조 컴포넌트

**ChalkakEmptyPostContent** (`ChalkakEmptyPostContent.kt:16-45`)
- "아직 올라온 사진이 없어요": body, textSecondary
- 간격 spacing.sm
- "첫 번째 사진을 올려보세요": subheadline, textMuted

**ChalkakScrollToTopButton** (`ChalkakScrollToTopButton.kt:24-41`)
- 44 원, ChalkakWhite, shadowElevation 12
- 아이콘: `Icons.AutoMirrored.ArrowBack`을 90° 회전, 24, iconPrimary
- contentDescription "맨 위로"

### 1.12 하단 바

3장에서 자세히 다룬다.

---

## 2. 버전 게이트와 스플래시

### 2.1 iOS

**런치 스크린** (`Info.plist:31-39`)
- `UILaunchScreen` 배경색 `ChalkakLogoBackground`: sRGB 0.988/0.980/0.965 ≈ #FCFAF6
- 이미지 `ChalkakLaunchLogo` (xcassets, 220×220 PNG)
- `UIImageRespectsSafeAreaInsets` false

**버전 확인** (`AppVersionGate.swift`)
- `GET app-version?platform=IOS`, timeout 3초
- 실패하거나 확인할 수 없으면 차단하지 않고 통과시킨다.
- 앱 시작 시와 scenePhase가 `.active`가 될 때마다 확인한다 (`ContentView.swift:308-334`).

**강제 업데이트 alert** (`ContentView.swift:283-295`)
- 제목: "업데이트가 필요해요"
- 메시지: "최신 버전으로 업데이트하면 찰칵을 계속 이용할 수 있어요."
- 버튼: "업데이트" 하나뿐이고 누르면 App Store를 연다. 닫을 수 없다.

**초기 라우트** (`ContentView.swift:1199-1211`)
- 활성 세션이 없으면 login, 있으면 main
- 라우트 전환은 `.animation(.default, value: route)` (`ContentView.swift:218`)로 기본 cross-fade다.

### 2.2 Android

**Splash API** (`res/values/themes.xml:14-19`)
- 테마 `Theme.SplashScreen.IconBackground`
- 배경 `@color/chalkak_logo_background` #FCFAF6
- 아이콘 `@drawable/chalkak_logo_transparent` (432×432)

**스플래시 유지 조건** (`MainActivity.kt:56-67`)
- 버전 상태가 Checking이거나, Accessible이지만 홈이 준비되지 않았으면 스플래시를 유지한다.
- 홈 프리로드 최대 대기는 `HOME_PRELOAD_MAX_WAIT_MS = 700` (`HomeViewModel.kt:101-112, 414`).
- 결과적으로 첫 화면이 비어 보이지 않는다.

**edge-to-edge** (`MainActivity.kt:68-77`): 시스템 바를 투명하게 만든다.

**RequiredAppUpdateScreen** (`VersionGateScreen.kt:135-167`)
- 전체 화면 Column, 세로·가로 중앙, `safeDrawingPadding`, 가로 spacing.screenHorizontal
- "업데이트가 필요해요": typography.title3, textPrimary
- "안정적인 서비스 이용을 위해 최신 버전으로 업데이트해 주세요.": callout, textSecondary, top spacing.sm
- ChalkakButton "업데이트": fillMaxWidth, top spacing.xl

**VersionCheckFailureScreen** (`VersionGateScreen.kt:98-133`)
- 카피: "업데이트를 확인할 수 없어요" / "네트워크 연결을 확인한 후 다시 시도해 주세요." / 버튼 "다시 시도"
- 실제로는 ViewModel이 Failed를 Accessible로 매핑한다 (`VersionGateViewModel.kt:105`). CheckFailed가 방출되지 않으므로 이 화면은 도달할 수 없다.

**로딩**: 아무것도 없는 배경 Box (`VersionGateScreen.kt:88-96`)

**AuthGate** (`AuthGateRoute.kt:38-58`)
- Loading은 배경 Box다.
- 그 외에는 NavHost의 시작 목적지가 Login 또는 Home이다.

**색 리소스**: chalkak_background #F7F6F3, chalkak_logo_background #FCFAF6

### 2.3 차이와 의견

- iOS는 alert, Android는 전용 화면이다. Android 쪽이 카피와 레이아웃을 제어할 수 있다.
- Android는 스플래시 동안 홈 데이터를 최대 700ms 기다려 첫 프레임 공백을 없앤다.
- **Android가 더 정교하다.** 다만 두 플랫폼의 카피가 다르다. iOS는 "...찰칵을 계속 이용할 수 있어요.", Android는 "안정적인 서비스 이용을 위해...". 하나로 통일해야 한다.

---

## 3. 메인 탭 셸과 하단 바

### 3.1 탭 구성

순서 (iOS `ChalkakBottomBar.swift:3-37`, Android `strings.xml`):

| 위치 | 탭 | 라벨 | 아이콘 |
|---|---|---|---|
| 1 | home | "홈" (Android `bottom_bar_today`) | `ic_bottom_home` / `ic_bottom_home_selected` |
| 2 | display | "전시" | `ic_bottom_display` / `_selected` |
| 3 | add | 라벨 없음, Android 접근성 "추가" | 아래 참고 |
| 4 | record | "기록" | `ic_bottom_record` / `_selected` |
| 5 | settings | "설정" | `ic_bottom_setting` / `_selected` |

- add 아이콘: Flat/Android는 `ic_bottom_write`(40 원, #2B2724, + 표시), Liquid glass는 SF `plus`

### 3.2 iOS Liquid Glass 바 (iOS 26, `ChalkakPlatformAppearance.usesLiquidGlass`)

**구조** (`ChalkakBottomBar.swift:100-194`)
- HStack spacing 0
- barPadding: spacing.sm(8), compact일 때 spacing.xs(4)
- 프레임 높이 60, 하단 정렬
- 바 배경: Capsule을 colors.background opacity 0.3으로 채우고, `glassEffect(.regular.tint(background 0.2).interactive())`

**렌즈(선택 표시)**
- 재질: glass Capsule `.clear.interactive()`
- 위에 그라디언트: white 0.28 → clear → white 0.08
- 드래그 중 테두리: white 그라디언트 0.95 / 0.2 / 0.65, lineWidth 1.25
- 그림자:
  - 드래그 중: white 0.6, radius 2, y −1
  - 상시: iconPrimary 0.18, radius 5, y 2

**아이콘 레이어**
- selected 아이콘은 렌즈 mask 안에서만 보인다.
- 렌즈 밖에서는 현재 탭도 기본 아이콘으로 보인다. 렌즈가 지나가면서 아이콘이 바뀌는 효과다.

**Metrics** (`ChalkakBottomBar.swift:396-423`)
- 크기
  - 아이콘 26, compact 23
  - add SF `plus` weight regular 28, compact 25
  - 터치 44
- 시간
  - selectionDuration 0.5 (`.smooth`)
  - expansionDuration 0.75
  - dragAnimationDuration 0.16
- 드래그(scrub)
  - minDistance 8
  - 바 scale 1.04 (anchor bottom), 아이콘 scale 1.16
  - 렌즈 폭 ×1.06, 렌즈 높이 56
  - 속도 스트레치: velocity/1600 비례로 폭 +0.08, 높이 −0.04
  - 렌즈 추종: `interactiveSpring(response 0.42, dampingFraction 0.9, blendDuration 0.12)`

**동작** (`ChalkakBottomBar.swift:369-389`)
- 가로 드래그만 scrub으로 인정한다. 손을 떼면 그 위치의 탭을 실행하며, 슬롯 index 2가 add다.
- compact 상태에서 탭하면 먼저 0.75 smooth로 펼친다.
- `accessibilityReduceMotion`이 켜져 있으면 스트레치와 스케일을 끈다.

### 3.3 iOS Flat 바 (iOS 26 미만, `ChalkakBottomBar.swift:425-492`)

- 패딩 top 15, bottom 12, 배경 colors.surfaceElevated
- 아이템: VStack spacing 7, minHeight 48
  - 아이콘 23, template
  - 라벨 typography.footnote, 선택 시 bold
  - 색: 선택 colors.actionPrimary, 비선택 colors.bottomBar
- add: `ic_bottom_write`, original, 40×40

### 3.4 iOS 배치 (`ContentView.swift:425-480`)

- `safeAreaInset(edge: .bottom)`으로 붙인다.
- Liquid glass
  - 가로 패딩 (compact ? xxl : lg) + xs, 즉 44 또는 20
  - bottom spacing.sm(8), 배경 clear
- Flat: 패딩 0, 배경 surfaceElevated
- compact 전환: `.animation(.smooth(duration: 0.75), value: isBottomBarCompact)`
- 탭을 바꾸면 0.75로 펼친다 (302-307).
- 피드 줌이 열려 있으면 바 opacity가 `feedZoomRegistry.sourceBarOpacity`를 따라간다 (198-205).

### 3.5 iOS 스크롤 반응 (`ChalkakBottomBarScrollBehavior.swift`, 주요 줄 ~15, ~75)

- directionThreshold 16: 아래로 16pt 이상 누적되면 compact, 위로 16pt 이상이면 펼친다.
- 사용자가 직접 스크롤하는 동안만 계산한다.
- offset ≤ 0이면 무조건 펼친다. overscroll과 contentSize 변화는 무시한다.
- `setCompact`는 `.smooth(duration: 0.25)`다.

### 3.6 Android 바 (`ChalkakBottomBar.kt`)

- Row (64-72): 배경 ChalkakWhite, `navigationBarsPadding`, padding top 15, bottom 10
- 아이템 (99-145)
  - weight 1, 최소 48×48, `selectable(indication = null)`이라 ripple이 없다.
  - 아이콘 23, Spacer 7
  - 라벨 footnote, 선택 시 Bold
  - 색: 선택 ChalkakAction, 비선택 ChalkakBottomBar
- add (148-172): `ic_bottom_write` 40, indication 없음, contentDescription "추가"

**배치** (`MainBottomBarLayout.kt:32-56`)
- NavHost 위에 지속되는 overlay다. 하단에 정렬하고 `translationY = scrollState.offset`
- 탭 라우트에서만 보인다 (`ChalkakNavHost.kt:1129-1135`).
- HOME을 선택하면 홈 스크롤 상태를 초기화한다.

**hide-on-scroll** (`BottomBarScrollState.kt`, `CollapsingScroll.kt`)
- offset이 스크롤 delta를 그대로 따라가며 0..barHeight로 clamp된다. 즉 바가 밀려 내려간다.
- 손을 떼면 `tween(220)`(`COLLAPSING_SETTLE_DURATION_MILLIS`)으로 가까운 쪽에 정착한다. settle 중단 임계는 0.05.
- 맨 위로 버튼은 누적 스크롤 12dp(`CollapsingScrollToTopThreshold`)를 넘으면 나타난다.
- `COLLAPSING_FLOATING_BACKGROUND_ALPHA = 0.86`

### 3.7 탭 동작 규칙

| 상황 | iOS (`ContentView.swift:603-637, 805-809`) | Android (`ChalkakNavHost.kt:989-1019, 153-163, 1090`) |
|---|---|---|
| 홈에서 홈 재탭 | 맨 위로 스크롤 + 새로고침 | 아무 일도 없음 |
| 전시 재탭 | 맨 위로 | 맨 위로 |
| 게스트가 기록 탭 | 토스트 "기록을 보려면 로그인이 필요해요" | 동일 |
| 게스트가 add | 토스트 "게시물을 추가하려면 로그인이 필요해요" | 로그인 요구 |

### 3.8 차이와 의견

- **iOS가 더 정교하다.**
  - iOS: liquid glass 렌즈, scrub 제스처, 스크롤 compact 전환, 피드 줌 연동 opacity
  - Android: 흰 바를 밀어 숨기는 방식만 있다.
- 홈 재탭 시 새로고침도 iOS에만 있다.

---

## 4. 로그인

### 4.1 iOS (`LoginScreen.swift:1-99`)

**전체**
- GeometryReader 안의 VStack
- 배경 colors.background, `ignoresSafeArea`

**헤더** (높이 = 전체의 0.53)
- ZStack(alignment: .topLeading)
- 배경 이미지: `ChalkakImage` 에셋 `img_login_background` (1440×1920 JPG), `.fill`, opacity 0.2, clipped
- 타이틀 "매일 하나의 주제,\n각자의 한 장"
  - typography.display, textPrimary
  - padding 가로 20, top 135

**액션 영역**
- 공간이 부족하면 `ViewThatFits`가 ScrollView로 대체한다.
- padding 가로 spacing.screenHorizontal(25), top 60, bottom 56
- 소셜 버튼: VStack spacing spacing.md(12). `SocialLoginProvider.allCases` 순서대로 apple, google, kakao
- 게스트 버튼 "로그인 없이 사진 둘러보기"
  - subheadline, textSecondary, underline
  - minHeight 44, top 24

### 4.2 iOS 소셜 버튼 (`SocialLoginButton.swift`, 줄은 출력 −174 보정)

**Apple**
- `ASAuthorizationAppleIDButton(type: .continue, style: .whiteOutline)`
- cornerRadius shapes.button(12), 높이 56

**Google / Kakao**
- HStack spacing md: 로고 20×20(`img_google_logo` / `img_kakao_logo`) + 텍스트(callout, textPrimary)
- 높이 56, 배경 colors.inputBackground
- 테두리 1pt colors.border, 모양 shapes.button
- 눌림 opacity 0.7, 비활성은 `.disabled`

**타이틀** (`LoginViewState.swift`, 제공자명 + "로 계속하기")
- "Apple로 계속하기"
- "Google로 계속하기"
- "카카오로 계속하기"

### 4.3 iOS 상태

- 로딩: `canSubmit`이 false가 되어 모든 버튼이 비활성된다. 별도 스피너는 없다.
- 오류: alert 제목 "로그인", 버튼 "확인" (`LoginView.swift:~42-53`)
  - "로그인하지 못했어요. 다시 시도해 주세요." (`LoginViewModel.swift:132`)
  - 게스트 진입 실패: "화면을 불러오지 못했어요. 다시 시도해 주세요." (`LoginViewModel.swift:151`)

### 4.4 Android (`LoginScreen.kt`)

**전체**: Column, 배경 colors.background. 헤더와 액션 영역의 weight가 1.2 : 1 (101-114).

**헤더** (117-143)
- `img_login_background`, alpha 0.2, ContentScale.Crop
- 타이틀: typography.display
- statusBarsPadding, start screenHorizontal, top 110

**액션** (146-183)
- padding 가로 screenHorizontal, 세로 xxl(40)
- `Arrangement.spacedBy(lg)`, CenterHorizontally
- 제공자: GOOGLE, KAKAO만 있다(Apple 없음).
- 게스트 텍스트: clickable, padding sm, subheadline, textSecondary, underline

**SocialLoginButton** (`SocialLoginButton.kt:46-77`)
- OutlinedButton, shape button, border 1dp border
- contentPadding xl / lg, Row spacedBy md
- 로고 20, callout
- 비활성 콘텐츠 textMuted
- 높이 고정 없음(콘텐츠 높이), ripple

**오류**: 시스템 토스트 (`LoginViewModel.kt:68, 108, 120-129`)
- "네트워크 연결을 확인해 주세요."
- "${provider} 계정을 확인할 수 없어요. 다시 시도해 주세요."
- "아직 지원하지 않는 로그인 방식이에요."

### 4.5 차이와 의견

- 헤더: iOS는 화면 높이의 0.53, top 135. Android는 weight 1.2 : 1, top 110.
- 버튼: iOS는 높이 56 고정에 오류 alert. Android는 높이가 콘텐츠를 따르고 오류는 토스트다.
- **iOS가 더 정교하다.** 높이 고정, 작은 화면 대응(ViewThatFits), 오류 원인별 문구 분리가 근거다.

---

## 5. 약관 동의

### 5.1 iOS (`OnboardingTermsScreen.swift`, 출력 −132 보정)

위에서 아래 순서. 배경 colors.inputBackground, 가로 padding screenHorizontal.

1. Spacer 50
2. 타이틀 "찰캌에\n오신 것을 환영합니다.": typography.title1, textPrimary
3. Spacer 57
4. 전체 동의 행 `TermsAllConsentRow`
   - HStack spacing 16: 체크박스 22 + "전체 동의"(body)
   - padding 가로 16, 세로 19
   - 배경 inputBackground, stroke 1pt #E3E1DD, RoundedRectangle shapes.large(16)
5. Spacer 3
6. 필수 행 × 2: "(필수) 서비스 이용약관", "(필수) 개인정보 처리방침"
   - HStack: 체크박스 + 제목, spacing 14
   - 제목: body, textPrimary.opacity(0.85)
   - 행 padding leading 4, 세로 16
   - 오른쪽 "보기": callout, textMuted, padding leading 12, trailing 4, 세로 16
   - 각 행 뒤에 `TermsDivider`: 1pt colors.border
7. Spacer
8. ChalkakButton "다음": fillsWidth, bottom 20

**동작**
- 전체 동의를 누르면 두 항목 모두 `!isAllAgreed`로 바뀐다 (`OnboardingTermsState.swift`).
- "보기"는 `LegalDocumentSheet`를 `.large` detent로 띄운다 (`ContentView.swift:260-264`).
- "다음"은 항상 활성 상태로 보이고, action 안에서 `isAllAgreed`를 guard한다. 동의하지 않아도 눌린 것처럼 보이는 결함이다.

### 5.2 Android

**TermsScreen** (`TermsScreen.kt:69-128`)
- 수치는 iOS와 같고 statusBarsPadding이 추가된다.
- "다음"은 `enabled = uiState.isAllAgreed`로 비활성 스타일(actionPrimary 0.12 배경)이 나온다.
- 하단: navigationBarsPadding + bottom 20

**TermsAllConsentRow** (`TermsAllConsentRow.kt`, 출력 −162)
- TermsCardShape 16, border #E3E1DD
- `toggleable(indication = null)`
- padding 16 / 19, spacedBy 16

**TermsRequiredConsentRow** (`TermsRequiredConsentRow.kt`, 출력 −281)
- start 4, top/bottom 16, spacedBy 14
- "보기" padding start 12, top 16, end 4, bottom 16

**TermsDivider** (`TermsDivider.kt`): 1dp border

**법률 문서**: `LegalDocumentDialog`, 전체 폭(`usePlatformDefaultWidth = false`)

**상태**: rememberSaveable로 보존한다.

### 5.3 의견

**Android가 더 정교하다.** "다음" 버튼이 비활성 상태를 시각적으로 보여준다. iOS는 `isEnabled: isAllAgreed`를 연결해야 한다.

---

## 6. 온보딩 사인과 미리보기

### 6.1 iOS 사인 그리기 (`OnboardingSignatureScreen.swift`, 출력 −24)

**레이아웃** (배경 colors.background, 가로 padding screenHorizontal)
1. top 50
2. "작가님의\n사인을 그려주세요": title1
3. 30
4. "모든 사진에 함께할 사인이에요.\n자유롭게 남겨주시고, 실제 서명은 피해 주세요.": subheadline, textSecondary
5. 32
6. SignaturePad (aspectRatio 1)
7. 24
8. 컨트롤 HStack spacing 12
9. Spacer
10. ChalkakButton "이 사인으로 할래요"
11. bottom 18

"이 사인으로 할래요"는 항상 활성이며 `hasSignature`로 guard한다.

**SignaturePad**
- 외곽
  - padding leading/top/trailing 16, bottom 14
  - 배경 inputBackground, clip shapes.large(16)
  - stroke 1pt textPrimary.opacity(0.12)
- 캔버스
  - clip shapes.button(12), 배경 colors.actionPrimary(어두운 바탕)
  - 점선 테두리: textOnImage.opacity(0.28), lineWidth 1, dash [6, 6], inset 1, radius 10
  - 획: textOnImage, 굵기 4, round cap/join, quad-curve 스무딩. 점 하나만 찍으면 반지름 2 원을 그린다.
  - 비었을 때 placeholder: "사인", typography.handwriting, textOnImage.opacity(0.56), scaleEffect 2.4
  - 입력: `DragGesture(minimumDistance: 0)`
- 캔버스 아래 캡션 "여기에 손가락으로 그리기": footnote, textMuted, top 12
- Metrics: 파일 304-325

**컨트롤 버튼**
- "되돌리기": SF `arrow.counterclockwise` 15
- "전체 지우기"
- 공통 스타일
  - 아이콘·텍스트 spacing 4, footnote, textPrimary
  - padding 가로 16, 세로 10
  - Capsule stroke 1pt colors.border
  - 항상 활성

**PNG 인코딩** (`OnboardingSignaturePngEncoder.swift:95-99`)
- 1024×512, padding 48, stroke 14, 흰색 획(투명 배경)

### 6.2 iOS 미리보기 (`OnboardingSignaturePreviewScreen.swift:11-94`)

1. top 50
2. "이렇게 보여요": title1
3. 50
4. 미리보기 이미지
   - 에셋 `preview_sunset`, aspect 5/6, clip shapes.xlarge(18)
   - 사인 PNG 112×84, bottomTrailing, padding sm
   - 접근성 "사진에 사인이 적용된 모습"
5. Spacer
6. HStack spacing 20
   - ChalkakOutlinedButton "다시 그리기"
   - ChalkakButton "시작하기"
   - 둘 다 fillsWidth, 제출 중에는 disabled
7. bottom 18

### 6.3 iOS 흐름과 오류 (`OnboardingRoute.swift`)

- 단계: terms → signature → preview. 전환은 `.animation(.default, value: step)` (71)
- 오류 alert: 제목 "회원가입", 버튼 "확인"
- SignUpViewModel 문구 (64, 88-100)
  - "회원가입을 완료하지 못했어요. 다시 시도해 주세요."
  - "사인 이미지가 1MB를 초과했어요."
  - "사인 처리에 시간이 걸리고 있어요. 다시 시도해 주세요."
  - "사인을 다시 업로드해 주세요."
  - "사용할 수 없는 사인이에요. 다시 그려주세요."
  - "네트워크 연결을 확인해 주세요."
  - "로그인 정보가 만료되었어요. 다시 로그인해 주세요."

### 6.4 iOS 설정의 사인 변경 (`SignatureChangeFlow.swift`)

- 컨테이너: NavigationStack, toolbar에 ChalkakCloseButton. 제출 중에는 `interactiveDismissDisabled`
- 에디터
  - 간격: 타이틀 top 24, 설명 top 24, 패드 top 28, 컨트롤 top 24(spacing 12)
  - ChalkakButton은 `isEnabled: hasSignature`로 실제로 비활성된다. 온보딩보다 낫다.
  - bottom 18
  - 컨트롤: spacing 6, padding 가로 16, 세로 8. 비활성이면 textMuted.
- 미리보기
  - "이렇게 보여요"
  - "사인 변경까지 시간이 조금 걸릴 수 있어요": subheadline, textMuted, top sm
  - 이미지 `preview_photo` 5/6, top 36, 사인 112×84
  - 오류: footnote, colors.error, top md
  - 버튼 "다시 그리기" / "사인 변경하기", spacing 20
- 아래로 스와이프해 닫기: 최소 20, 거리 80 또는 예측 거리 140 이상
- 오류 (339-353)
  - "사인을 저장하지 못했어요. 다시 시도해 주세요."
  - "사인 업로드를 찾을 수 없어요. 다시 시도해 주세요."

### 6.5 Android (`SignatureScreen.kt:71-214`)

**SignatureScreen**
- 뒤로 버튼: 변경 흐름에서만 보인다. 44, ArrowBack 24, start sm, top 10.
- top padding: 온보딩 50, 변경 흐름 xl(24)
- 나머지 간격 30 / 32 / 24 / 18은 iOS와 같다.
- 컨트롤: spacedBy 12, 중앙. `enabled = hasSignature && !isSubmitting`
- 오류 "사인을 저장하지 못했어요. 다시 시도해 주세요.": footnote, error, 중앙, top md
- 제출 버튼: `enabled = canSubmit`

**SignaturePad** (`SignaturePad.kt`, 출력 −83)
- iOS와 같고, 차이는 아래 셋이다.
  - placeholder는 handwriting fontSize 48 / lineHeight 52
  - 캔버스 테두리 inset이 없다.
  - 제출 중에는 제스처를 막는다.

**SignatureControlButton** (`SignatureControlButton.kt`)
- pill 테두리: textPrimary alpha 0.12(iOS는 border 토큰)
- padding 16 / 10, 비활성 textMuted
- "되돌리기"에 아이콘이 없다. ripple 있음.

**SignaturePreviewScreen** (`SignaturePreviewScreen.kt`)
- 레이아웃은 iOS와 같다.
- 이미지: drawable `preview_photo` (`ChalkakNavHost.kt:378`). iOS 온보딩은 `preview_sunset`이다.
- 사인 112×84
- noticeText는 변경 흐름에서만 보인다.
- 오류는 토스트다.

### 6.6 의견

- **Android가 더 정교하다.** 근거는 셋이다.
  - 버튼과 컨트롤이 `hasSignature` 상태를 실제로 반영한다.
  - 제출 중 입력을 차단한다.
  - 오류를 인라인으로 보여준다.
- iOS 장점: 되돌리기 아이콘과 점선 inset 같은 디테일
- 정리할 점: 미리보기 이미지가 플랫폼마다 다르다(iOS 온보딩 `preview_sunset`, 그 외 `preview_photo`).

---

## 7. 홈

### 7.1 iOS 전체 구조 (`HomeScreen.swift:25-208`)

**HomeTopBar**
- 가로 padding screenHorizontal
- 배경 colors.background opacity 0.96
- 하단 Divider를 overlay로, colors.border

**ScrollView > LazyVStack** (alignment leading, spacing 0)

| 순서 | 섹션 | 위 간격 | 비고 |
|---|---|---|---|
| 1 | HomeTopicHeader | xl+sm = 32 | |
| 2 | HomeHeroCard | xl | |
| 3 | HomeFeedbackCard | lg | 해당할 때만 |
| 4 | HomeWeeklyRecord | 피드백 있으면 xl, 없으면 xxl | |
| 5 | HomeRankingRow "어제 랭킹" | xxl | |
| 6 | HomeRankingRow "오늘 인기있는 사진" | xxl | |
| 7 | "ISSUE" 헤더 | xxl | headline bold, bottom lg |
| 8 | 배너 목록 | | 각 bottom xxl |
| 9 | 로딩 placeholder / 더보기 | | 아래 참고 |
| 10 | 하단 여백 | | bottom xxl |

- 더보기 영역: ProgressView. 실패 시 "ISSUE를 불러오지 못했어요. 다시 시도"(subheadline, minHeight 44)

**동작**
- `.refreshable`로 당겨서 새로고침
- 스크롤 위치를 저장하고 복원한다.
- 맨 위로는 `.snappy`
- 하단 바 스크롤 반응을 적용한다.
- 배너 페이지네이션: 마지막 3개 이내가 보이면 다음 페이지를 불러온다.

**피드백 시작 시트**
- 높이 320, drag indicator 표시
- 비 liquid glass에서는 cornerRadius shapes.sheet(28), 배경 surfaceElevated
- alert: 제목 "AI 피드백", 버튼 "확인"

**Metrics**: topBarOpacity 0.96, feedbackSheetHeight 320, bannerEndThreshold 3, minTouch 44

### 7.2 상단 바

**iOS** (`HomeTopBar.swift`)
- 높이 55, HStack: ChalkakLogo(offset y 5) + Spacer + 알림 버튼
- 알림 버튼
  - `ic_notification` template 24, iconPrimary, 터치 44
  - 미읽음 점: 지름 7, colors.inputCursor, topTrailing에 offset (2, −2)
- 접근성 "알림", 값 "읽지 않은 알림 있음" / "읽지 않은 알림 없음"
- 게스트가 누르면 토스트 "로그인 후 알림을 확인할 수 있어요" (`ContentView.swift:537`)

**Android** (`HomeTopBar.kt`)
- statusBarsPadding, 높이 55, 하단 divider 0.5 border, 배경 불투명 background
- 터치 40(iOS 44)
- 점 offset: 중심 기준 (24−7)/2 + 2
- 눌림 표시 없음

### 7.3 오늘의 주제 헤더 (iOS `HomeScreen.swift:302-331`)

- VStack spacing sm
  - "\(M월 d일) · 오늘의 주제": subheadline, textPrimary
  - 주제명: title2, textPrimary
- 상태별 주제 자리 문구
  - 로딩: "오늘의 주제를 불러오는 중"
  - 오류: "오늘의 주제를 불러오지 못했어요"
  - 비어 있음: "오늘의 주제가 아직 준비되지 않았어요"

### 7.4 히어로 카드 (iOS `HomeHeroCard.swift`, 출력 −57)

**컨테이너**: ZStack, aspect 5/6, clip shapes.photoCard(12)

**상태별 표시**
- loading: HeroStatusContent "사진을 확인하고 있어요" + ProgressView
- empty: EmptyHeroContent(아래)
- rejected: DEBUG fixture에만 있다 (`ContentView.swift:998-999`). ViewModel은 만들지 않는다.
- noOpenTopic: "지금은 참여할 수 있는 주제가 없어요"
- processing: "사진을 처리하고 있어요"
- error: "사진 상태를 불러오지 못했어요" + 재시도 원
  - 원 40, SF `arrow.clockwise` 18 semibold
  - onActionPrimary on actionPrimary
  - 접근성 "홈 다시 시도"
- photo
  - ChalkakSignedImage, 사인 64×48, 썸네일을 먼저 보여준다. 배경 surfaceElevated.
  - 검수 대기 배지 "검수 대기": caption semibold, textOnImage, scrim Capsule, padding 가로 md 세로 xs, 바깥 padding md, topTrailing

**Status content 공통**: VStack spacing md, subheadline, textSecondary, 중앙. 배경 surface에 border.

**Empty 버튼**
- VStack spacing xl, 배경 colors.surface, strokeBorder 1pt border(photoCard 모양)
- 문구: "\"\(topic)\" 사진을 공유하지 않았어요" (subheadline semibold, textPrimary, 중앙). topic 기본값 "오늘의 주제"
- 반려 변형: "사진이 반려되었어요" + "참여 기간 안에 다시 제출할 수 있어요"(footnote, textSecondary)
- 아이콘: SF `plus` 22 semibold, 36 원 actionPrimary
- 탭하면 사진 업로드로 간다.

**게스트** (`HomeViewModel.swift:351-356`): hero는 `.empty`, 기록은 빈 주간으로 ready

**Android** (`HomeHeroCard.kt`, 출력 −102)
- 반려 상태와 반려 카피가 없다.
- 로딩 progress 28
- 오류: ChalkakFilledIconButton Refresh, Spacer md
- Empty: `Icons.Filled.Add` 22, 36 원, spacing xl
- 사인 64×48

### 7.5 피드백 카드

**iOS** (`HomeFeedbackCard.swift`, 출력 −88)

- 카드
  - surfaceElevated, shapes.xlarge(18) clip, 1pt border
  - 그림자 actionPrimary 0.08, radius 12, y 5
- 헤더 버튼: 타이틀 + Spacer + trailing
  - 타이틀: 완료이면서 펼쳤을 때 headline, 그 외 callout. semibold.
  - padding: leading 펼침 xl / 접힘 lg, trailing sm. minHeight 64.
  - 눌림 opacity 0.8
- trailing
  - 완료: 접힘이면 "자세히 보기"(footnote, textSecondary) + SF `chevron.down` 15 semibold, iconSecondary, 44 프레임. 펼치면 180° 회전한다.
  - 실패이고 재시도 가능: "재요청"
  - 진행 중: ChalkakAudioWaveIcon을 32 actionPrimary 원 안에 둔다.
- 펼침: `withAnimation(.easeInOut)`
- 상세 (padding xl)
  - 선택 배지: Label "작가님의 해석이 돋보이는 작품이에요" + SF `camera.aperture`
    - caption semibold, onActionPrimary on actionPrimary
    - shapes.small, padding sm / xs
  - 배지를 누르면 팁이 뜬다.
    - 폭 240, 화살표 12×6, footnote, padding md, shapes.button
    - "종합 점수와 별개로, 독특한 시각이 드러난 사진이라는 의미예요."
  - 요약: title3 bold
  - 점수 링: 84, stroke 8, 트랙 calendarCell, 진행 actionPrimary, round cap, −90° 시작. 숫자는 title1.
  - Divider → "좋았던 점" / "아쉬운 점" → Divider → "다음엔 이렇게"
    - 제목 footnote semibold
    - 본문 subheadline, textSecondary, lineSpacing xs
  - 링크 버튼 "찰캌 AI는 어떤 기준으로 점수를 내나요?": caption underline, textSecondary, min 44, trailing. alert 제목은 "찰칵 AI의 점수 기준".
- 헤더 타이틀
  - "AI 피드백을 요청하고 있어요"
  - "AI 피드백 상태를 확인하고 있어요"
  - "AI 피드백을 확인할 수 없는 게시물이에요"
  - "AI 피드백 상태 다시 확인"
  - "AI 피드백을 생성하지 못했어요"
  - "이 사진, AI에게 피드백 받아보기"
  - "AI 피드백이 진행중이에요"
  - "AI 피드백이 완료되었어요"
- 지연 안내: "처리가 오래 걸리고 있어요. 나중에 다시 확인해 주세요."

**ChalkakAudioWaveIcon** (`ChalkakAudioWaveIcon.swift`)
- 막대 5개: 높이 9 / 15 / 11 / 18 / 8, 폭 2, spacing 2, 프레임 높이 18
- scaleY = 0.7 + 0.3·sin(t·7 + i·1.2), 주기 약 0.9초
- TimelineView 30fps

**AIReviewStartSheet** (`AIReviewStartSheet.swift`)
- 타이틀 "AI 피드백을 시작할까요?": title3
- 안내 박스: 배경 colors.background, shapes.large, padding lg, spacing lg
- 각 항목: 36 surfaceElevated 원 안에 SF 아이콘 17(iconSecondary) + subheadline semibold
  - `clock` "결과가 나오기까지 몇 분 정도 소요될 수 있어요"
  - `iphone` "앱을 나가도 분석은 계속되니 걱정마세요"
  - `bell` "분석이 끝나면 알림으로 알려드릴게요"
- ChalkakButton "분석 시작하기"
- padding 가로 xl, top xxl

**Android** (`HomeFeedbackCard.kt`, `AiReviewComponents.kt`)
- 단계: Hidden / Ready / Processing / Completed / Failed. loading, unavailable, loadError가 없다.
- 카드 그림자: shadow elevation 12, alpha 0.08
- 헤더 start는 항상 xl, 폰트는 항상 callout
- 펼침: AnimatedVisibility (expandVertically + fadeIn / shrinkVertically + fadeOut)
- chevron: `ic_chevron_down` 16, 44 프레임, `animateFloatAsState`로 180° 회전
- 눌림 alpha 0.8, 웨이브 원 32. 웨이브 주기는 900ms linear.
- 시작 안내 아이콘: `ic_clock` / `ic_smartphone` / `ic_bell` 18, 36 원
- 카피 차이
  - 시작 안내 첫 줄 "결과가 나오기까지 최대 1~2분 소요될 수 있어요"
  - 링크 "찰칵AI는 어떤 기준으로 점수를 내나요?"
  - 팁 "구도 점수와 별개로, 주제 해석이 특별한 사진이라는 의미예요."
- 점수 링 84 / 8, 배지 아이콘 14
- 시트
  - ModalBottomSheet `skipPartiallyExpanded`
  - shapes.sheet에서 하단 모서리 0, surfaceElevated
  - 커스텀 AiReviewSheetDragHandle: 터치 48, 핸들 32×4
  - padding xl, top sm
- 메시지: AlertDialog "확인", shapes.large, surfaceElevated (`HomeScreen.kt:233-247`)

### 7.6 이번 주 기록

**iOS** (`HomeWeeklyRecord.swift`)
- VStack spacing lg
- 섹션 헤더 (HomeSectionHeader)
  - "이번 주 기록": headline bold
  - 접미 "N/7": caption semibold, textSecondary, spacing xs
  - Spacer(min sm)
  - "보러가기": caption + SF `chevron.right` 12 semibold, textPrimary, 세로 padding sm
- 로딩: HomeStatusRow(높이 48) + ProgressView
- 오류: "기록을 불러오지 못했어요"(footnote, textSecondary) + 재시도 원 32 / 아이콘 15. 접근성 "기록 다시 시도"
- ready: HStack spacing sm에 셀 7개, 일요일부터 토요일까지
- 셀
  - calendarCell, aspect 1, clip shapes.small(7)
  - 사진 있음: 썸네일. 대기 중이면 하단 띠 "대기"(caption semibold, textOnImage, 전폭 중앙, 세로 padding 1, scrim)
  - 사진 없음: 짧은 요일 기호(caption, textSecondary)
  - 게시물이 있는 셀은 그 날짜의 기록을 연다(UnhighlightedButtonStyle).

**Android** (`HomeWeeklyRecord.kt`)
- iOS와 같은 레이아웃
- 로딩 progress 24
- 재시도: ChalkakFilledIconButton(40)
- chevron: drawable `ic_chevron_right` 12, iconPrimary
- 요일 포맷 "E"
- "대기" 텍스트가 가운데 정렬되지 않는다(버그).

### 7.7 랭킹 행 ("어제 랭킹", "오늘 인기있는 사진")

**iOS** (`HomeRankingRow.swift`, 출력 −188)
- 헤더의 "보러가기"는 해당 날짜의 전시를 인기순으로 연다.
- 로딩: 상태 행 48 + ProgressView
- 오류: "\(title) 사진을 불러오지 못했어요"
- 비어 있음: "아직 올라온 사진이 없어요"(footnote, textSecondary)
- ready: 가로 ScrollView, HStack spacing lg, 최대 5장
- 카드: 82×82, calendarCell, clip small, feedZoomSource, unhighlighted. 순위 숫자는 없다.
- screenHorizontal 패딩이 ScrollView 바깥에 있어서 카드가 패딩 선에서 잘린다.
- 게스트가 탭하면 토스트 "상세를 보려면 로그인이 필요해요" (`ContentView.swift:567-577`)
- 데이터 (`HomeViewModel.swift:322-349`)
  - 오늘 인기: trending 상위 5
  - 어제 랭킹: 상위 5
  - 주제가 없으면 빈 목록으로 ready

**Android** (`HomeRankingRow.kt`)
- LazyRow, contentPadding screenHorizontal. 화면 끝까지 스크롤된다.
- spacing lg, 카드 82, aspect 1, small, calendarCell, 공유 사진 전환
- 상태 높이 76(iOS 48), progress 24
- 게스트가 탭하면 토스트 "게시물 피드를 보려면 로그인이 필요해요" (`ChalkakNavHost.kt:1088-1091`)

### 7.8 ISSUE 배너

**iOS** (`HomeIssueSection.swift`, `IssueWebScreen.swift`)
- 배너: VStack spacing lg
  - 이미지: surfaceElevated 바탕, aspect 1672/941, remote fill, clip shapes.large
  - 텍스트 VStack spacing sm: 제목(subheadline bold, textPrimary), 부제(caption, textSecondary)
- 로딩 placeholder: surfaceElevated 박스, 접근성 "배너 불러오는 중"
- 탭하면 IssueWebScreen(WKWebView)
  - 로딩: ProgressView "페이지 불러오는 중"
  - 실패: "페이지를 불러오지 못했어요"(callout, textMuted) + "다시 시도"(min 44)
  - overlay 뒤로 버튼: ChalkakNavigationButton `.back`, padding 가로 lg 세로 sm
  - 외부 링크 실패: 토스트 "링크를 열 수 없어요"

**Android** (`HomeIssueSection.kt`)
- iOS와 같다. 이미지 오류 painter는 surfaceElevated.
- `onIssueClick("ISSUE", url)`로 WebPageScreen을 연다.
  - 상단 바 72, 뒤로 버튼 폭 56, 가운데 제목 "ISSUE"(headline)

### 7.9 Android 홈 전체 (`HomeScreen.kt`)

- 컨테이너: Scaffold, nested scroll이 하단 바를 움직인다 (100-223).
- 스크롤: LazyColumn, bottom contentPadding = barHeight + xxl
- 당겨서 새로고침: PullToRefreshBox (336-347)
- 섹션 간격: iOS와 같다 (356-430).
- ISSUE: 헤더 top xxl. 첫 배너 top lg, 이후 배너 top xxl.
- 페이지네이션
  - 로딩: CircularProgressIndicator
  - 실패: TextButton "다시 시도"(body, actionPrimary), padding xl
  - prefetch distance 2 (541)
- 맨 위로 버튼
  - 위치: end 24, bottom barHeight + 18
  - 반복 `animateScrollToItem`으로 올라간다 (196-212, 290-294).
- 홈 재탭 새로고침은 없다.

### 7.10 Android 전환 (`ChalkakNavHost.kt:301-306, 1119-1123`, `PhotoTransition.kt:181, 186`)

- popEnter/popExit: fade tween 700ms (`PHOTO_CONTENT_FADE_DURATION_MILLIS`)
- Feed: 300ms (`PHOTO_TRANSITION_DURATION_MILLIS`), 진입은 fadeIn 700
- 그 외는 navigation-compose 기본값

### 7.11 의견

- **iOS가 더 정교한 부분**
  - 피드백 카드 상태가 더 세분화되어 있다(loading, unavailable, loadError, 지연 안내).
  - 상단 바가 반투명하다.
  - 이미지 skeleton이 있다.
  - 홈 재탭 시 새로고침된다.
- **Android가 더 정교한 부분**
  - 랭킹 행이 contentPadding을 써서 edge-to-edge로 스크롤된다.
  - 스플래시 동안 홈을 프리로드한다.
  - 맨 위로 버튼이 있다.
- **통일해야 할 카피**
  - 게스트 토스트: iOS "상세를 보려면 로그인이 필요해요" / Android "게시물 피드를 보려면 로그인이 필요해요"
  - 삭제 안내: Android "게시물을 삭제했어요" / iOS "게시물이 삭제됐어요"
  - AI 카피 세 줄(7.5의 카피 차이)

---

## 8. Today (레거시)

두 플랫폼 모두 내비게이션에 연결되어 있지 않다.
- iOS: ContentView가 TodayScreen을 쓰지 않는다.
- Android: NavHost에 TodayRoute가 없다.

홈으로 대체된 이전 화면이며, 참고용으로만 기록한다.

### 8.1 iOS (`TodayScreen.swift`, `TodayTopBar.swift`, `TodayPhotoCard.swift`)

**초기 로딩·오류** (TodayInitialStatus)
- 상단 바 + divider, 그 아래 중앙 콘텐츠
- 로딩: ProgressView
- 오류: VStack spacing xl
  - 메시지: body, textSecondary
  - 재시도 원 48 / SF `arrow.clockwise` 20, 접근성 "오늘 새로고침"

**콘텐츠**
- 상단 바: ScrollView 밖, background 0.96, divider
- TodayTopic (`TodayTopic.swift`, 출력 −56)
  - top 16, bottom 20, spacing 10
  - "M월 d일 · 오늘의 주제": subheadline, lineLimit 1
  - 주제: title1 bold
  - divider 0.5 border
- 비어 있음: VStack spacing sm, top 144
  - SF `photo.on.rectangle.angled` 34, iconSecondary
  - "아직 올라온 사진이 없어요": body, textSecondary
  - "첫 번째 사진을 올려보세요": subheadline, textMuted
- 목록 (`TodayPhotoList.swift`, 출력 −131): LazyVStack spacing xxl, bottom xxl+sm, 끝에서 3개 남으면 다음 페이지
- `.refreshable`
- 게스트가 좋아요를 누르면 토스트 "로그인 후 좋아요를 누를 수 있어요"

**오류 문구** (`TodayViewState.swift:292-310`)
- "오늘의 주제가 아직 준비되지 않았어요"
- "로그인 정보를 확인할 수 없어요"
- "네트워크 연결을 확인해 주세요"
- "홈 정보를 불러오지 못했어요"
- "요청을 처리하지 못했어요"
- "서버에 잠시 문제가 생겼어요"
- "홈을 불러오지 못했어요"

**TodayTopBar**
- 로고에 offset이 없다.
- 알림 24, 터치 48, 점 7, 높이 55

**TodayPhotoCard** (출력 −208)
- 이미지: 측정한 비율(기본 1), 사인 56×42 + padding sm
- 카드: surfaceElevated, 그림자 black 0.14, radius 4, y 2
- 액션 행: 높이 57, 가로 padding 14, spacing md
  - 하트 `ic_heart` / `ic_heart_filled` 24: 좋아요 시 actionPrimary, 아니면 textSecondary
  - 좋아요 수: body, textSecondary, 하트와 spacing 9, min 44
  - 제목(없으면 "무제"): body, textSecondary, trailing, 1줄
- 이미지: TodayImagePipeline + skeleton/placeholder

### 8.2 Android (`TodayScreen.kt`, `TodayScrollBehavior.kt`)

**구성**
- Scaffold. 콘텐츠 상태가 아닐 때는 화면 안에 하단 바를 둔다.
- 상단 바는 고정 overlay다. 80% 접히면 배경 alpha를 0.86으로 바꾼다 (`TodayScrollBehavior.kt:26-27, 178-184`).
- 주제 영역은 스크롤에 따라 접힌다(collapsingArea).
- 당겨서 새로고침 인디케이터에 offset을 준다.
- 맨 위로 버튼: end 24, bottom barHeight + 18
- HOME을 다시 누르면 맨 위로 올라간다.

**상태**
- 오류 문구 차이 (423-431): InvalidResponse "오늘 정보를 불러오지 못했어요", Generic "오늘을 불러오지 못했어요"
- 비어 있음: ChalkakEmptyPostContent, 중앙
- 다음 페이지 로딩: CircularProgressIndicator, padding xl

**TodayTopBar**
- 로고 top lg
- IconButton 48 / 아이콘 24. 미읽음 점이 없다.
- TodayTopic divider #E8E6E1, 0.5

**TodayPhotoCard**
- 그림자 4, RectangleShape, ChalkakWhite, FillWidth
- 액션 행 57 / padding 14 / spacing 9, 하트 24
- 글자색 ChalkakPhotoActionText #7D7D7D

### 8.3 의견

- 상단 바와 헤더: **Android가 더 정교하다.** 접히는 헤더, 반투명 전환, 맨 위로 버튼이 있다.
- 이미지 로딩: iOS가 낫다(skeleton).
- 결론: 레거시이므로 이식하지 않아도 된다. Android의 접히는 헤더 패턴만 재사용할 만하다.

---

## 9. AuthorPosts (작가 게시물)

### 9.1 iOS (`AuthorPostsScreen.swift`, `AuthorPostsTopBar.swift`, `DisplayPhotoGrid`)

**표시 방식**: 피드 위의 overlay 레이어

**전환**
- GeometryEffect로 progress 0→1, translationX = (1 − progress)·width
- 열기: `.smooth(duration: 0.35)`
- 놓기: 0.3, 속도를 이어받는다.
- 움직이는 동안 그림자 black 0.12, radius 8
- 아래 레이어 dim: black 0.1·progress
- reduceMotion이면 fade로 바꾼다.

**뒤로 스와이프**
- 엣지 24에서 시작, 최소 12, 닫힘 거리 120(예측 위치 기준)
- 전환 중에는 그리드 스크롤을 막는다.

**상단 바**
- 슬롯 높이 = 48 + 2·12 = 72
- 뒤로: ChalkakNavigationButton `.back`, padding 가로 lg, 세로 md
- 사인
  - 흰 PNG를 alpha mask로 쓰고 iconPrimary로 칠한다.
  - 펼침 120×90, top 19 → 접힘 64×48, top md(12)
  - collapseProgress = scrollOffset / collapseDistance에 선형 비례
  - collapseDistance = expandedBottom(109) − 72 + 8 = 45
- 접근성 "내 사인" / "작성자 사인"

**상태**
- loading: 중앙 ProgressView
- authorNotFound: "더 이상 사진을 볼 수 없어요"(body, textSecondary)
- error: VStack spacing xl
  - "사진을 불러오지 못했어요"
  - "다시 시도": body, actionPrimary, min 44
- loaded: ScrollView
  - 설명: 내 글이면 "작가님이 공개한 시선들이에요", 아니면 "이 작가님의 시선을 감상해 보세요". subheadline, textInactive, top collapseDistance, bottom lg.
  - DisplayPhotoGrid
    - showsSignature false. 모든 게시물에 좋아요 데이터가 있을 때만 좋아요 배지를 보인다.
    - 가로 padding screenHorizontal, bottom xxl
- 비어 있음: SF `photo.on.rectangle.angled` 34 + "아직 공개된 사진이 없어요", top 96

**토스트**
- 다음 페이지 실패: "사진을 불러오지 못했어요"
- 좋아요 실패: "좋아요를 반영하지 못했어요"
- 게스트 진입 시도: "다른 사진도 보려면 로그인이 필요해요" (`ContentView.swift:652-654`)

**DisplayPhotoGrid**
- 2열 masonry, 가로·세로 spacing md, defaultRatio 4/3, 끝 4개 남으면 다음 페이지
- 카드: 검정 배경, shapes.photoCard, 사인 40×30
- DisplayLikeBadge
  - 하트 18 + subheadline, spacing 4, inset 10
  - 터치 확장 14, min 44
  - textOnImage, 그림자 black 0.25, radius 2, y 1

### 9.2 Android (`AuthorPostsScreen.kt`, `AuthorPostsViewModel.kt`)

**표시 방식**: NavHost push, 기본 fade

**접히는 헤더** (nested scroll)
- 높이: 펼침 112 → 접힘 62
- 사인: 144×64, top 40 → 72×32, 뒤로 버튼과 세로 중앙
  - tint iconPrimary
  - shared element `sharedAuthorSignature`
- 뒤로: 44 터치, offset (8, 10), ArrowBack 크기 spacing.xl(24)

**설명**
- "이 작가님의 시선을 감상해보세요"(띄어쓰기 없음): subheadline, textSecondary, 세로 padding lg
- 그리드 헤더로 붙는다.

**상태**
- 로딩: progress
- 없음: ChalkakEmptyPostContent "더 이상 사진을 볼 수 없어요" / "아직 공개된 사진이 없어요"
- 오류: DisplayErrorContent "사진을 불러오지 못했어요" + TextButton "다시 시도"

**좋아요 실패 토스트**: "좋아요를 변경하지 못했어요. 다시 시도해주세요" (`AuthorPostsViewModel.kt:144`)

**DisplayPhotoGrid**
- staggered 2열, 가로 padding 21
- spacing 세로 9, 가로 12, bottom 36
- 좋아요 inset 10, 터치 확장 14, spacing 4

### 9.3 의견

- **iOS가 더 정교하다.** 근거는 셋이다.
  - 인터랙티브 슬라이드 전환과 엣지 스와이프
  - 사인 축소가 스크롤에 선형으로 연동된다.
  - 내 글/남의 글 문구를 분리한다.
- Android 장점: 공유 요소로 사인이 이어진다.
- 그리드 수치가 다르다(iOS 25/12/12, Android 21/12/9). 하나로 통일해야 한다.

---

## 10. 종합: 플랫폼별 우위와 결함 목록

**iOS 우위**
- 하단 바(liquid glass, scrub, compact)
- 이미지 skeleton(0.5초 지연, 0.25초 최소 표시)
- AuthorPosts 전환
- 피드백 카드 상태 세분화
- 로그인 높이 고정과 ViewThatFits
- 커스텀 토스트

**Android 우위**
- 버튼 비활성 처리(약관 "다음", 사인 제출과 컨트롤)
- 버전 게이트 전용 화면과 스플래시 프리로드
- 랭킹 행 contentPadding
- 맨 위로 버튼
- Today의 접히는 헤더

**결함·불일치**
- iOS 약관 "다음"과 온보딩 "이 사인으로 할래요"가 비활성으로 보이지 않는다.
- Android CheckFailed 화면에 도달할 수 없다 (`VersionGateViewModel.kt:105`).
- Android 주간 "대기" 텍스트가 가운데 정렬되지 않는다.
- iOS 랭킹 행이 패딩 선에서 잘린다.
- iOS 히어로 rejected 상태는 DEBUG에만 있다.
- 미리보기 이미지가 다르다(`preview_sunset` / `preview_photo`).
- Apple 로그인은 iOS에만 있다.
- AI, 게스트, 삭제, 업데이트 카피가 플랫폼마다 다르다.
- "찰캌"과 "찰칵" 표기가 섞여 있다. 예: 약관 타이틀 "찰캌에", alert "찰칵 AI의 점수 기준"
