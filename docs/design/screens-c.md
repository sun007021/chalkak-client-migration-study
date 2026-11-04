# 찰캌 원본 클라이언트 UI 스펙 — C 묶음 (기록 · 알림 · 설정 · 피드백 · 전환 · 공통 상태)

> 읽기 전용 추출 문서. 원본 코드는 수정하지 않았다.
> 작성 기준: 2026-11-04 시점 `client` 작업 트리.

## 0. 읽는 법

### 경로 약어

| 약어 | 실제 경로 |
|---|---|
| `iOS:` | `client/iOS/chalkak/chalkak/` |
| `AND:` | `client/android/app/src/main/java/com/stonefive/chalkak/` |
| `RES:` | `client/android/app/src/main/res/` |

근거는 `약어/파일:줄` 형식이다. 예: `iOS:Features/Record/RecordScreen.swift:397`.

### 토큰 표기

이미 정리된 토큰은 이름만 적는다.

- 색: `colors.*` (예: `colors.calendarCell`, `colors.textMuted`)
- 글자: `typography.*` (예: `typography.footnote`)
- 간격: `spacing.*`. 값은 none 0 / xs 4 / sm 8 / md 12 / lg 16 / xl 24 / xxl 40 / screenHorizontal 25 (`iOS:DesignSystem/Foundation/ChalkakSpacing.swift:37-44`, `AND:core/designsystem/theme/Spacing.kt:19-28`)
- 라운드: `shapes.*`. 값은 small 7 / button 12 / input 14 / photoCard 12 / large 16 / xlarge 18 / sheet 28 / pill (`iOS:DesignSystem/Foundation/ChalkakShape.swift:37-44`, `AND:core/designsystem/theme/Shape.kt:22-31`)

토큰이 아닌 값(높이, 패딩, 크기, 그림자, 불투명도, 애니메이션)은 숫자 그대로 적는다. 단위는 iOS pt, Android dp다.

### 플랫폼 비교 표기

- **[iOS]**, **[AND]**: 한쪽에만 있는 내용
- **[차이]**: 두 플랫폼이 다른 부분. 끝에 "더 정교한 쪽"에 대한 의견을 적었다.

### 범위에서 확인한 "없는 것"

- **오프라인 표시**: 두 플랫폼 모두 네트워크 상태 배너나 오프라인 화면이 없다. iOS에는 `NWPathMonitor`가 없다. Android의 연결 감시는 버전 확인 게이트(`AND:feature/versiongate/VersionGateViewModel.kt:30-54`)에만 쓰인다. 네트워크 오류는 각 화면의 에러 문구와 토스트로만 드러난다(§7.4).
- **스켈레톤**: 이 범위 화면(기록, 알림, 설정, 피드백)은 화면 단위 스켈레톤을 쓰지 않는다. 이미지 칸만 `ChalkakImage`의 스켈레톤(iOS)이나 배경색 자리표시를 쓴다(§1.8).
- **ic_record_stack_\*, ic_log_out**: Android 리소스에만 있다. iOS는 SF Symbol을 쓴다(`iOS:Assets.xcassets`에는 해당 에셋이 없다).

---

## 1. 공통 컴포넌트

### 1.1 토스트

**[iOS] `ChalkakToast`** — `iOS:DesignSystem/Components/Toast/ChalkakToast.swift`

| 항목 | 값 | 근거 |
|---|---|---|
| 모양 | `Capsule()`, 배경 `colors.actionPrimary` | :25 |
| 글자 | `typography.subheadline`, `colors.onActionPrimary`, 가운데 정렬, 여러 줄 허용 | :19-22 |
| 안쪽 여백 | 좌우 `spacing.lg`(16), 위아래 `spacing.md`(12) | :23-24 |
| 위치 | 화면 아래 가운데 overlay. 좌우 `spacing.screenHorizontal`(25), 아래 32 | :36-40, :89 |
| 나타남/사라짐 | `.move(edge: .bottom).combined(with: .opacity)`, `withAnimation(.snappy)` | :41, :60, :70 |
| 표시 시간 | 2.5초 뒤 자동으로 닫힘. 새 메시지가 오면 타이머를 다시 시작(`dismissalID`) | :56-66 |
| 터치 | `allowsHitTesting(false)`. 아래 화면 조작을 막지 않는다 | :42 |
| 접근성 | `accessibilityIdentifier("chalkak.toast")` | :27 |

- 호스트는 두 군데다. 앱 루트(`iOS:ContentView.swift:281-282`, 표시 로직 :850-860, 같은 2.5초와 `.snappy`)와 전체 화면 모달 루트(`.chalkakToastHost()`, `iOS:ContentView.swift:231`, :256)다. 하단 바의 `safeAreaInset` 바깥에 붙인다(`ChalkakToast.swift:82`).
- 알림함만은 뷰모델의 `message`를 `.chalkakToast(viewModel.message)`로 직접 띄운다(`iOS:Features/Notification/NotificationScreen.swift:24`). 이 경로는 자동으로 닫히지 않고, 다음 동작에서 `message = nil`이 될 때 사라진다(`NotificationInboxViewModel.swift:103,125,141,172`).

**[AND] 시스템 Toast**

- `UiMessage.Toast` → `Toast.makeText(context, text, Toast.LENGTH_SHORT)`. 화면이 `RESUMED`일 때만 띄운다(`AND:core/ui/UiMessage.kt:35-47`).
- `UiMessage.Snackbar`(Material3 `SnackbarHost`)도 있지만 이 범위에서는 쓰지 않는다. 피드 화면 전용이다(`AND:feature/feed/FeedScreen.kt:125,299`).
- 내비게이션 루트의 `showToast`는 화면을 떠나도 남아야 하는 안내에 쓴다(`AND:navigation/ChalkakNavHost.kt:138-139`).

**[차이]** iOS는 디자인 토큰을 입힌 캡슐 토스트다. Android는 OS 기본 Toast라 색, 위치, 길이를 앱이 정하지 못한다. → **iOS가 더 정교하다.** 이식할 때는 iOS 스펙(캡슐, 아래 32, 2.5초, snappy)을 기준으로 삼는다.

### 1.2 확인 다이얼로그 (로그아웃·탈퇴 등)

**[iOS] 시스템 `.alert`**

- 설정의 계정 확인창: 버튼은 `"취소"`(role `.cancel`)와 제목과 같은 확인 버튼이다. 탈퇴 버튼만 role `.destructive`(빨간 글자)다(`iOS:Features/Settings/SettingsScreen.swift:143-157`).
- 문구는 원문 그대로 아래와 같다(`SettingsScreen.swift:10-22`).

| 종류 | 제목 | 본문 | 확인 버튼 |
|---|---|---|---|
| 로그아웃 | `로그아웃` | `로그아웃하면 다시 로그인해야 찰칵을 이용할 수 있어요.` | `로그아웃` |
| 탈퇴 | `회원탈퇴` | `회원탈퇴하면 계정과 게시물이 삭제되며, 삭제한 내용은 복구할 수 없어요.` | `회원탈퇴`(destructive) |

- 이 범위의 다른 시스템 alert는 다음과 같다.
  - `알림을 켤까요?` / 본문 `알림을 켜면 오늘의 주제와 게시물 승인·반려 소식을 받아볼 수 있어요.` / 버튼 `나중에`(cancel), `알림 켜기` (`iOS:ContentView.swift:438-447`)
  - `업데이트가 필요해요` / 본문 `최신 버전으로 업데이트하면 찰칵을 계속 이용할 수 있어요.` / 버튼 `업데이트`. 닫을 수 없다(`set: { _ in }`) (`iOS:ContentView.swift:283-295`)

**[AND] `ChalkakConfirmDialog`** — `AND:core/designsystem/component/dialog/ChalkakConfirmDialog.kt`

| 항목 | 값 | 근거 |
|---|---|---|
| 컨테이너 | `Dialog(usePlatformDefaultWidth = false)` 안의 `Surface`. `shapes.large`(16), `colors.surfaceElevated` | :42-50 |
| 폭 | 호출부가 정한다. 설정은 317 | `AND:feature/settings/SettingsScreen.kt:134,327` |
| 안쪽 여백 | 좌우 40, 위 24, 아래 26 | :52-57, :168-170 |
| 정렬 | 가운데 정렬 Column | :58 |
| 제목 | `typography.title3`, `colors.textPrimary` | :60-64 |
| 제목→본문 | 8 | :66, :171 |
| 본문 | `typography.callout`, `colors.textNeutral` | :68-72 |
| 본문→버튼 | 23 | :74, :172 |
| 버튼 줄 | 가로 2등분(`weight(1f)`), 간격 10 | :76-79, :173 |
| 취소 버튼 | 문구 `취소`, 배경 `colors.actionSecondary`, 글자 `colors.onActionSecondary` | :80-86 |
| 확인 버튼 | PRIMARY는 `colors.actionPrimary`, DESTRUCTIVE는 `colors.destructive`. 글자는 둘 다 `colors.onActionPrimary` | :88-102 |
| 버튼 모양 | `shapes.button`(12), 위아래 안쪽 여백 9.5, 글자 `typography.callout` | :117-132, :174 |
| 바깥 터치·뒤로 | `onDismissRequest = onDismiss` | :43 |

- 설정에서 쓰는 문구(`AND:feature/settings/SettingsScreen.kt:306-325`)는 다음과 같다.

| 종류 | 제목 | 본문 | 확인 | 스타일 |
|---|---|---|---|---|
| 로그아웃 | `로그아웃` | `정말 로그아웃 하시겠습니까?` | `로그아웃` | PRIMARY |
| 탈퇴 | `회원탈퇴` | `정말 회원탈퇴 하시겠습니까?` | `회원탈퇴` | DESTRUCTIVE |

**[차이]** 본문 문구가 다르다. iOS는 결과를 설명하고, Android는 의사를 묻는 상투어다. 모양도 다르다. iOS는 OS alert, Android는 토큰을 입힌 커스텀 카드다. → **시각 스펙은 Android가 더 정교하다**(브랜드 카드, 버튼 색 체계). **문구는 iOS가 더 낫다**(결과를 알려 준다). 이식할 때는 Android 카드에 iOS 문구를 쓰기를 권한다.

### 1.3 내비게이션 버튼과 상단 바

**[iOS] `ChalkakNavigationButton`** — `iOS:DesignSystem/Components/Button/ChalkakNavigationButton.swift`

| 항목 | 값 | 근거 |
|---|---|---|
| 종류 | `.back`: SF `chevron.backward`, 라벨 `뒤로 가기` / `.close`: SF `xmark`, 라벨 `닫기` | :5-22 |
| 크기 | 지름 48 원(`buttonBorderShape(.circle)`, `contentShape(Circle())`) | :25, :38-40 |
| 아이콘 색 | `colors.iconPrimary`(foreground와 tint 모두) | :33-34 |
| controlSize | 기본 `.large`. 닫기 대체 버튼은 `.regular` | :28, :74 |
| 스타일 | iOS 26 이상이고 Liquid Glass를 쓸 때 `.glass`, 아니면 `.plain` | :54-61 |
| 닫기 전용 | iOS 26 이상 glass면 시스템 `Button(role: .close)`, 아니면 `.close` 종류를 `.regular`로 | :64-77 |
| 툴바 배경 | glass일 때 `sharedBackgroundVisibility(.automatic)`, 아니면 `.hidden` | :79-88 |

**[iOS] 알림 상단 바 `NotificationTopBar`** — `iOS:Features/Notification/Components/NotificationTopBar.swift`

- 높이 72, 좌우 여백 20(:30-31, :51-52)
- ZStack 구성: 가운데 제목 `알림`(`typography.headline`, `colors.textPrimary`, 좌우 48 비움) (:13-17)
- 왼쪽: `ChalkakNavigationButton(.back)` (:20)
- 오른쪽(알림함일 때만): `모두 읽음` 텍스트 버튼. `typography.subheadline`, 켜짐 `colors.textPrimary` / 꺼짐 `colors.textInactive`, 최소 높이 48 (:34-47)
- 알림 상세에서도 같은 바를 쓰고 제목도 `알림`이다. 상세에서는 오른쪽 버튼이 없다(`NotificationDetailScreen.swift:19`).

**[AND] 알림 상단 바** — `AND:feature/notification/component/NotificationTopBar.kt`

- 높이 72 (:35, :104)
- 왼쪽 뒤로 영역: 폭 56 × 바 높이 전체. 아이콘 `Icons.AutoMirrored.Filled.ArrowBack`(Material), 28, `colors.iconPrimary`, 라벨 `뒤로 가기`. 리플 있음 (:36-51, :105-106)
- 제목: 기본 `알림`, 상세는 `알림 상세`. `typography.headline`, 가운데, 좌우 56 비움 (:53-61, `NotificationDetailScreen.kt:70-74`)
- `모두 읽음`: 오른쪽 끝 여백 `screenHorizontal - sm`(17), 최소 높이 48, 안쪽 좌우 `spacing.sm`. 글자는 iOS와 같다 (:63-87, :107)

**[AND] 피드백 상단 바** — `AND:feature/feedback/component/FeedbackTopBar.kt`

- Row: 뒤로 영역 44×44(리플 없음), 아이콘 `ArrowBack` 24 `colors.iconPrimary` (:36-49)
- 제목 `피드백 보내기`, `typography.headline`, `weight(1f)` 가운데 (:54-58)
- 오른쪽에 균형용 빈칸 44 (:61)
- 바 바깥 여백(호출부): start 8, end 12, top 10, bottom 8. `statusBarsPadding` 적용 (`AND:feature/feedback/FeedbackScreen.kt:95-101`)

**[차이]** iOS는 48 원형 버튼 하나(glass 대응)를 모든 화면이 함께 쓴다. Android는 화면마다 뒤로 영역 크기가 56, 44로 다르고 아이콘도 28, 24로 다르다. 그리고 `res/drawable/ic_arrow_back.xml`(24dp, #2B2724)이 있는데도 Material 아이콘을 쓴다. → **iOS가 더 일관되고 정교하다.**

### 1.4 스위치 (푸시 토글)

- **[iOS]** 시스템 `Toggle(.switch)`, `tint(colors.actionPrimary)`, `controlSize(.regular)`, 라벨 숨김. 저장 중이거나 설정을 못 받았으면 `disabled`. 접근성 값은 `켬`/`끔` (`iOS:Features/Settings/SettingsComponents.swift:149-180`, 비활성 조건 `NotificationSettings.swift:18-20`).
- **[AND]** Material3 `Switch`를 0.75배로 줄인다. 레이아웃 크기도 함께 줄이고 최소 터치 크기는 0으로 둔다. 색은 기본값이고 `uncheckedBorderColor`와 `disabledUncheckedBorderColor`만 `colors.textMuted`다. 행 전체를 눌러도 토글된다(`onClick = { onCheckedChange(!checked) }`) (`AND:feature/settings/component/SettingsPushNotificationCard.kt:57-89`, :107).

**[차이]** iOS는 켜짐 색을 브랜드 `actionPrimary`로 맞췄다. Android는 Material 기본 색(테마 primary)이고 크기만 줄였다. Android는 행 전체가 눌리는 장점이 있다. → **색은 iOS, 터치 범위는 Android가 낫다.** 이식할 때는 둘 다 적용한다.

### 1.5 리스트 행과 카드 (설정)

| 요소 | iOS | Android |
|---|---|---|
| 카드 | `colors.surfaceElevated`, `shapes.large`(16), 그림자 black 0.08 / radius 2 / y 1 (`iOS:Features/Settings/SettingsComponents.swift:226-238`, :325-328) | `SettingsShape` = 16, elevation 2, ambient·spot black 0.08, `colors.surfaceElevated` (`AND:feature/settings/component/SettingsCard.kt:18-36`) |
| 행 | HStack: 제목 `typography.callout` `colors.textPrimary`, Spacer, trailing. 좌우 20, 위아래 16, 행 전체 터치(`contentShape`) (:241-288, :332-334) | Row: 같은 글자, 좌우 20, 위아래 16. `clickable(indication = null)`이라 눌림 효과가 없다 (`SettingsRow.kt:32-63`) |
| 알림 행 위아래 | 10.5 (스위치 높이 보정) (:335) | 16(공통). 스위치를 0.75배로 줄여 높이를 맞춘다 |
| 구분선 | 높이 1, `colors.border`, 좌우 20 들여 쓰기 (:302-312) | 같다 (`SettingsRow.kt:66-74`) |
| 화살표 | SF `chevron.right` 13 semibold, `colors.textMuted` (:314-323, :340) | `RES:drawable/ic_display_arrow_right` 24, `colors.textMuted` (`SettingsRow.kt:76-84`) |
| 섹션 라벨 | `typography.callout`, `colors.textMuted` (:3-12) | 같다 (`SettingsSectionLabel.kt:11-22`) |

### 1.6 빈 상태 컴포넌트

- **[AND] `ChalkakEmptyPostContent`** — 가운데 정렬 Column. 제목 `typography.body` `colors.textSecondary`, 간격 `spacing.sm`, 설명 `typography.subheadline` `colors.textMuted`. 기본 문구는 `아직 올라온 사진이 없어요` / `첫 번째 사진을 올려보세요` (`AND:core/designsystem/component/empty/ChalkakEmptyPostContent.kt:16-46`). 이 범위 화면은 이 컴포넌트를 쓰지 않는다(전시·피드용).
- **[iOS]** 공통 빈 상태 컴포넌트가 없다. 화면마다 직접 만든다. 이 범위에서는 알림함 빈 상태가 유일한 정식 빈 화면이다(§3.1.4).

### 1.7 버튼

| 컴포넌트 | 스펙 | 근거 |
|---|---|---|
| `ChalkakButton` (채움) | `typography.callout`, 좌우 `spacing.xl`(24), 위아래 17, `shapes.button`. 켜짐 배경 `colors.actionPrimary` / 글자 `colors.onActionPrimary`. 꺼짐 배경 `actionPrimary` 12% / 글자 `colors.textPrimary`. `fillsWidth` 옵션 | `iOS:DesignSystem/Components/Button/ChalkakButton.swift:3-31`, `AND:core/designsystem/component/button/ChalkakButton.kt:13-42` |
| `ChalkakOutlinedButton` | 글자는 위와 같다. 테두리 1 `colors.border`. 꺼짐 글자 `colors.textMuted` | `iOS:.../ChalkakOutlinedButton.swift:3-35`, `AND:.../ChalkakOutlinedButton.kt:14-44` |
| `ChalkakFilledIconButton` [AND] | `shapes.pill`, `actionPrimary` / `onActionPrimary`. 꺼짐 12% / `textMuted` | `AND:.../ChalkakFilledIconButton.kt:13-34` |

### 1.8 로딩 표시 (스피너와 스켈레톤)

**[iOS] `ChalkakSkeleton` / `.loadingSkeleton(isLoading:)`** — `iOS:DesignSystem/Components/Skeleton/ChalkakSkeleton.swift`

- 바탕 `colors.skeletonBase` 위로 `colors.skeletonHighlight` 띠가 지나간다. 띠는 `LinearGradient [.clear, highlight, .clear]`, 폭은 너비의 0.6배, 왼쪽→오른쪽 `linear(1.2초)` 무한 반복(자동 역재생 없음) (:7-14, :78-110)
- 지연 표시: 0.5초 안에 응답이 오면 아예 띄우지 않는다. 한 번 뜨면 최소 0.25초 유지한다. 나타남·사라짐은 `easeOut(0.2)` opacity (:29-65, :107-114)
- 모서리는 호출부가 자른다.
- 원격 이미지(`ChalkakImage`)는 로딩 중 이 스켈레톤을 쓴다. 실패하면 `colors.inputBackground` 위에 SF `photo.badge.exclamationmark` 24 `colors.iconSecondary`, URL이 없으면 SF `photo` (`iOS:DesignSystem/Components/Image/ChalkakImage.swift:284-336`, :351)

**스피너**: 이 범위의 전체 화면 로딩은 iOS `ProgressView`, Android `CircularProgressIndicator`다. 색은 화면마다 다르다(§3).

**[AND]** 공통 스켈레톤이 없다. `ChalkakImage`는 Coil `placeholder`/`error` painter만 받는다(`AND:core/designsystem/component/image/ChalkakImage.kt:29-68`). → **iOS가 더 정교하다**(지연·최소 표시 규칙으로 깜빡임을 막는다).

### 1.9 피커 시트 (월 선택에 쓰는 틀)

**[iOS] `ChalkakPickerSheet`** — `iOS:DesignSystem/Components/Picker/ChalkakPickerSheet.swift`

- 시트 높이 340 고정(`presentationDetents([.height(340)])`), 손잡이 표시, 위 여백 20 (:23-25, :63-64)
- Liquid Glass가 아니면 배경 `colors.surfaceElevated`, 시트 모서리 `shapes.sheet`(28) (:27-34)
- 헤더 높이 52, 좌우 `spacing.lg`: 가운데 제목 `typography.headline` `colors.textPrimary`, 오른쪽 `완료`(`typography.headline`, 터치 44×44) (:37-58, :65-66)
- 휠: 시스템 `UIPickerView`(높이 216), 좌우 `spacing.lg` (:19-20, `ChalkakWheelPicker.swift:12-29`)
- 쓸어내려 닫으면 `onConfirm`을 부르지 않는다 (:8)

**[AND] `ChalkakPickerBottomSheet`** — `AND:core/designsystem/component/picker/ChalkakPickerBottomSheet.kt`

- `ModalBottomSheet(skipPartiallyExpanded = true)`, 최대 폭 제한 없음, 위쪽 모서리만 `shapes.sheet`, `colors.surfaceElevated` (:41-52)
- 안쪽 여백: 좌우 `spacing.xl`, 위 `spacing.sm`, 아래 `spacing.xl`. 세로 간격 `spacing.lg` (:64-71, :84-87)
- 제목은 왼쪽 정렬 `typography.title3`. 휠 열 간격 `spacing.lg`. 맨 아래 `ChalkakButton` 전체 폭, 기본 문구 `확인`(위 여백 `spacing.sm`) (:38, :88-104)
- 확인을 누르면 `sheetState.hide()`가 끝난 뒤 적용한다 (:56-61)
- 휠: 자체 구현. 줄 높이 44, 5줄 표시, 구분선 1 `colors.border`. 선택 줄 `textPrimary`, ±1줄 `textMuted`, 그 밖은 `textPrimary` 22% (`AND:core/designsystem/component/picker/ChalkakWheelPicker.kt:50-54`, :154-194)

---

## 2. 기록 (Record)

### 2.0 전체 구조와 진입 조건

- 탭 화면이다. 월간(기본)과 연간 두 모드가 있다. 월간은 **위: 사진 묶음(기둥 또는 책자) / 아래: 요일 헤더 + 달력**이다(`iOS:Features/Record/RecordScreen.swift:4-7`, `AND:feature/record/RecordScreen.kt:162-166`).
- 게스트(비로그인)는 탭에 들어갈 수 없다. 홈 등에서 기록으로 가려 하면 토스트 `기록을 보려면 로그인이 필요해요`가 뜬다(`iOS:ContentView.swift:557-560`, `AND:navigation/ChalkakNavHost.kt:158`, :1090). 세션이 끊겨 서버가 401을 주면 화면 안 에러 영역에 `로그인이 필요해요` + `로그인 하기`가 나온다(§2.9).
- 배경은 `colors.background`다. Android는 `ChalkakBackground` 상수를 직접 쓴다(`iOS:RecordScreen.swift:46`, `AND:RecordScreen.kt:197`).
- 묶음 모양 저장: iOS는 `@AppStorage("record.photoStackStyle")`이고 기본값 `.pillars`(`iOS:RecordScreen.swift:29`). Android는 `uiState.photoStackStyle`이고 `RecordPreferenceStore`에 저장한다(`AND:feature/record/RecordScreen.kt:295`, `AND:data/local/record/RecordPreferenceStore.kt`).

### 2.1 월간 레이아웃 (위→아래)

세로 ScrollView 한 개(iOS `ScrollView` + `VStack(spacing: 0)`, Android `Column.verticalScroll`)이고 순서는 아래와 같다.

| # | 요소 | 수치 | 근거 |
|---|---|---|---|
| 1 | 사진 묶음 영역 | 높이 `300 + 110`(펼침). 스크롤하면 300까지 줄어든다. `zIndex 1` | `iOS:RecordScreen.swift:86-95`, :400 / `AND:RecordScreen.kt:366-407`, :87 |
| 1-a | 묶음 위 컨트롤 줄 | 좌우 12, 위 `spacing.sm`. 왼쪽 연월 버튼, 오른쪽 모양 전환 버튼 | `iOS:RecordScreen.swift:182-198`, :398 / `AND:RecordScreen.kt:388-405`, :494-514 |
| 2 | 요일 헤더 | 좌우 20, 위 8 | `iOS:RecordScreen.swift:97-99`, :397, :402 / `AND:RecordScreen.kt:409-413` |
| 3 | 달력 그리드 | 좌우 20, 위 14 | `iOS:RecordScreen.swift:101-113`, :403 / `AND:RecordScreen.kt:415-430` |
| 4 | (에러일 때) 에러 영역 | 위 24 | `iOS:RecordScreen.swift:115-117`, :406 / `AND:RecordScreen.kt:432-442` |
| — | 아래 여백 | 32 | `iOS:RecordScreen.swift:120`, :404 / `AND:RecordScreen.kt:91,364` |
| — | 최소 높이 | 보이는 높이 + 110. 달력이 짧아도 묶음이 다 줄어들 만큼 스크롤된다 | `iOS:RecordScreen.swift:122` / `AND:RecordScreen.kt:363` |

#### 2.1.1 묶음 접힘 스크롤 (collapse)

- 맨 위에서 묶음은 기본(300)보다 110 크다. 스크롤한 거리만큼(최대 110) 묶음을 화면 위에 붙여 둔 채(`offset(y: shrink)`) 높이를 줄인다. 다 줄어든 뒤에는 함께 스크롤된다(`iOS:RecordScreen.swift:79-95`, `AND:RecordScreen.kt:372-379`).
- 기둥 높이는 126에서 236이 된다. 책자는 화면 폭이 허락하는 만큼 커진다(`iOS:RecordScreen.swift:399`).
- **스냅**: 0과 110 사이에서 손을 떼면 끝 중 하나로 붙는다.
  - [iOS] `ScrollTargetBehavior`를 쓴다. 튕긴 목표가 현재보다 24 넘게 위면 0, 24 넘게 아래면 110이다. 그 사이면 이번 드래그 방향을 따른다(시작보다 올렸으면 0, 내렸으면 110) (`iOS:RecordScreen.swift:418-446`).
  - [AND] 스크롤이 멈추면 `animateScrollTo(0 또는 collapsePx)`. 판정은 드래그 방향만 본다(`AND:RecordScreen.kt:303-316`).
- [iOS] `.defaultScrollAnchor(.top)`. 처음에 안전 영역이 늦게 잡혀 스크롤이 밀리면 한 번만 맨 위로 되돌린다(`iOS:RecordScreen.swift:125`, :139-146).
- 하단 바 접힘 연동: iOS `.chalkakBottomBarScrollBehavior(isCompact:)` (`iOS:RecordScreen.swift:147`).

**[차이]** 스냅 판정이 iOS는 플릭 거리(24)와 방향을 함께 보고, Android는 방향만 본다. → **iOS가 더 정교하다.**

#### 2.1.2 묶음 위 컨트롤

**연월 버튼 `RecordStackMonthButton`** (`iOS:Features/Record/Components/RecordPhotoStackSupport.swift:165-196`, `AND:feature/record/component/RecordPhotoStackSupport.kt:236-269`)

- 한 줄이고 첫 글자 기준선에 맞춘다. 순서는 `"{M}월"`(`typography.title2`, `colors.textPrimary`) → 간격 `spacing.xs` → `"{yyyy}"`(`typography.footnote`, `colors.textMuted`). 예: "10월 2026"
- 좌우 안쪽 8. 바깥 12와 더해 글자 시작이 달력 왼쪽(20)과 맞는다. 최소 높이 48
- 누르면 연간 달력으로 간다. 접근성 라벨은 iOS `month.formatted`(힌트 `연간 달력에서 다른 달을 고릅니다`), Android `"{yyyy}년 {M}월"`(onClickLabel `연간 달력에서 다른 달 고르기`)
- [AND]는 `clip(shapes.small)` + 리플이 있다. [iOS]는 `.plain`이라 눌림 효과가 없다.

**모양 전환 버튼**

- [iOS] `RecordGlassIconButton`: 지름 48, `.large`, 글래스/plain 스타일(내비 버튼과 같다). 꺼짐이면 아이콘 `colors.textInactive` + opacity 0.6. 아이콘은 SF Symbol로 기둥 `photo.stack`, 책자 `book`. **바꿀 모양**의 아이콘을 보인다. 라벨은 `"{대상 모양 이름}로 보기"`이고 이름은 `기둥과 눈금자` / `월간 책자`다 (`iOS:RecordPhotoStackSupport.swift:13-27`, :198-223, `iOS:RecordScreen.swift:188-194`).
- [AND] `RecordFloatingIconButton`: 터치 영역 `max(지름, 48)`, 보이는 원 지름 48. elevation 2 그림자, 원형 클립, 배경 `colors.surfaceElevated` 92%. 리플은 원 안에만. 아이콘 22, 켜짐 `colors.iconPrimary` / 꺼짐 `colors.textInactive`, 꺼짐 alpha 0.6. 아이콘은 `RES:drawable/ic_record_stack_pillars`(24dp 벡터: 막대 두 개 + 둥근 사각, 아래 바닥선) / `RES:drawable/ic_record_stack_book`(24dp 벡터: 펼친 책 외곽선 1.6 stroke + 가운데 책등선) (`AND:RecordPhotoStackSupport.kt:52-65`, :271-325).
- 누르면 지금 보던 날을 유지한 채 모양을 바꾼다. 책의 표지·속표지를 보던 중이면 1일로 맞춘다(`iOS:RecordScreen.swift:236-243`, `AND:RecordScreen.kt:392-397`). 모양 전환 자체에는 애니메이션이 없다(즉시 교체).

**[차이]** iOS는 시스템 Liquid Glass 원이다. Android는 반투명 흰 원 + 그림자로 비슷하게 흉내 낸다. 아이콘은 iOS가 SF Symbol, Android가 전용 벡터다. → **시각 완성도는 iOS(glass)가 높다.** 이식할 때 글래스가 없는 플랫폼은 Android 스펙(흰 92% + elevation 2)을 대체 스펙으로 쓴다.

### 2.2 요일 헤더 `RecordWeekdayHeader`

- `["일","월","화","수","목","금","토"]` 7칸 균등 폭, 가운데 정렬. `typography.caption`, `colors.textMuted`. 접근성에서 숨긴다(`iOS:Features/Record/Components/RecordWeekdayHeader.swift:8-21`, `AND:feature/record/component/RecordWeekdayHeader.kt:14-25`).

### 2.3 월 달력 그리드 `RecordCalendarGrid`

`iOS:Features/Record/Components/RecordCalendarGrid.swift`, `AND:feature/record/component/RecordCalendarGrid.kt`

| 항목 | 값 | 근거(iOS / AND) |
|---|---|---|
| 열 | 7, 일요일 시작. 앞쪽 빈칸 + 1..말일 + 마지막 주를 채우는 뒤쪽 빈칸 | :49-57, :229 / — |
| 칸 간격 | 6 (가로·세로) | :230 / :54 |
| 칸 | 1:1 정사각, 모서리 `shapes.small`(7) | :97-116, :233 / :53, :55, :229 |
| 사진 있는 날 | 썸네일 `.fill`(Crop), 배경 `colors.calendarCell`, 탭 가능. 디코딩 최대 폭 240px | :118-151, :16 / :223-244 |
| 사진 없는 날 | 날짜 숫자: `typography.caption`, 고정폭 숫자, `colors.textSecondary`, 칸 가운데 | :104-110 / :131-139 |
| 격자선 | 칸 사이 **간격의 한가운데**에 1 굵기 선. 색은 `colors.calendarCellBorder` 60%. 세로선 6개, 가로선 (주 수 − 1)개 | :83-91, :162-194, :231-232 / :56, :78, :85-104 |
| 탭 | 그날 사진이 있으면 묶음을 그날로 옮긴다(피드로 가지 않는다) | `iOS:RecordScreen.swift:104-107`, :223-229 / `AND:RecordScreen.kt:418-424` |
| 접근성 | `"yyyy년 M월 d일 사진"`, 버튼 특성 | :124-127, :153-160 / :234 |

#### 2.3.1 떠오르는 주(Selected week lift)

묶음이 지금 보여 주는 날이 속한 주의 줄이 흰 카드에 얹혀 떠오른다. 주가 바뀌면 이전 줄은 가라앉고 새 줄이 올라온다.

| 항목 | 값 | 근거(iOS / AND) |
|---|---|---|
| 확대 | 1.03배 | :236 / :213 |
| 상승 | 위로 2 | :237 / :217 |
| 애니메이션 | iOS `spring(response 0.42, damping 0.68)` / Android `spring(dampingRatio 0.68, stiffness 224)`(=(2π/0.42)²) | :238 / :164-168, :215-216 |
| 카드 | `colors.surfaceElevated`, 모서리 10, 줄보다 좌우 6·위아래 3 크게 | :204-214, :239-240 / :169-193, :218-220 |
| 카드 그림자 | [iOS] black 0.12, radius 6, y 4 / [AND] `shadowElevation` 6 | :207-211, :241-243 / :207, :221 |
| 카드 위 세로선 | 카드가 격자선을 덮으므로 카드 위에 세로선 6개를 다시 그린다 | :215-222 / :194-203 |
| 표시 | 카드 opacity 0↔1 (Android는 lift 값으로 보간) | :223 / :208 |
| 모션 줄이기 | [iOS] `accessibilityReduceMotion`이면 확대·상승 없이 카드만 나타났다 사라진다 | :19, :76-80 |

**[차이]** iOS는 모션 줄이기 설정을 따른다. Android는 따르지 않는다. 그림자도 iOS는 수치(0.12/6/4)를 지정하고 Android는 elevation이다. → **iOS가 더 정교하다.**

### 2.4 사진 묶음 공통

`iOS:RecordPhotoStackSupport.swift`, `AND:RecordPhotoStackSupport.kt`

- **순서(position)**: 그 달 1일부터 "지난 날"(이번 달은 오늘, 지난 달은 말일, 단 그보다 늦은 기록이 있으면 그날)까지다. **가장 최근 날이 0**이다(`iOS:RecordPhotoStackSupport.swift:49-68`, `AND:RecordPhotoStackSupport.kt:85-105`, :143-151).
- 사진이 없는 날도 한 장(빈 프레임)으로 넣는다.
- **고무줄**: 범위를 넘겨 끌면 넘친 양의 0.35배만 움직인다(:53, :70-75 / :127-137).
- **사진 비율**: 받기 전은 4:5(가로/세로 0.8). 빈 날 프레임은 3:4(:100-110 / :159-168).
- **자리표시 `RecordPhotoImage`**: 이미지가 없으면 `colors.calendarCell` 면(:112-127 / :170-187).
- **빈 날 프레임 `RecordEmptyFrame`** (:129-163 / :189-227)
  - 바탕 `colors.background` 위에 `colors.textPrimary` 55%를 덮은 불투명 차콜 면
  - 안쪽 테두리 1, `colors.textOnImage` 22%
  - 날짜 라벨(선택): `typography.caption` 고정폭 숫자, `colors.textOnImage` 72%, 여백 6, 기본 위치 오른쪽 위
- **공통 높이**: 묶음 영역 300. 내용(기둥, 책 표지)은 위에서 84부터 시작한다(위 버튼 줄 8 + 48 아래로 28). 드래그 최소 거리는 6 (`iOS:RecordPhotoStackSupport.swift:225-232`, `AND:RecordPhotoStackSupport.kt:327-339`; Android에는 dragMinimum 상수가 없고 시스템 touchSlop을 쓴다).
- **묶음 사진 탭 → 피드**: 승인된 사진(`APPROVED`)이면 피드로 간다. 아니면 토스트 `승인 전 사진은 아직 피드에서 볼 수 없어요`를 띄우고 이동하지 않는다(`iOS:RecordScreen.swift:209-220`, `AND:RecordScreen.kt:342-352`, `AND:feature/record/RecordViewModel.kt:95`).
- **달력에서 날짜 탭 → 묶음 이동**: iOS `spring(response 0.5, damping 0.86)`, Android `spring(damping 0.86, stiffness 158)`(=(2π/0.5)²) (`iOS:RecordScreen.swift:223-229`, `AND:RecordScreen.kt:94-95`, :418-424).
- **홈 주간 기록에서 날짜를 골라 진입**하면 묶음이 애니메이션 없이 그날을 보여 준다(`iOS:RecordScreen.swift:53-56`, :231-234, `AND:RecordScreen.kt:297-301`).
- **피드에서 돌아올 때** [AND]: 첫 프레임부터 고른 날을 펼쳐 공유 전환이 내려앉을 자리를 확보한다(`AND:RecordScreen.kt:286-294`). [iOS]는 `feedZoomSource(.record(postID))`로 확대 전환의 출발·복귀 자리를 등록한다(`iOS:RecordPhotoPillars.swift:98`, `RecordPhotoBook.swift:127`).
- **이미지 받기**: 묶음은 원래 비율로 자리를 잡아야 하므로 썸네일을 미리 받는다. 도착할 때 `easeOut(0.2)`로 바꿔 넣는다(`iOS:RecordScreen.swift:366-390`, :405). Android는 `rememberRecordStackImages`를 쓴다(`AND:feature/record/RecordStackImages.kt`).

### 2.5 기둥과 눈금자 (Pillars, 기본 모양)

`iOS:Features/Record/Components/RecordPhotoPillars.swift`, `AND:feature/record/component/RecordPhotoPillars.kt` (수치는 두 플랫폼이 같다. Android 상수 :604-658)

#### 2.5.1 모양

- 한 줄로 늘어선 세로 기둥이다. **1일이 맨 왼쪽, 가장 최근 날이 맨 오른쪽**이다. 고른 날만 넓게 펼친다(:4-11).
- 기둥 높이: 기본 126. 묶음이 커지면 `max(126, 묶음 높이 − 174)`, 예를 들어 410이면 236 (:366-373, :447).
- 기둥 시작 y = 84(`contentTop`) (:449).

| 기둥 종류 | 폭 | 모서리 |
|---|---|---|
| 펼친 기둥(거리 0) | 사진 비율 × 기둥 높이. 최대 폭 240×(기둥 높이/126), 단 화면 폭 − 72를 넘지 않게. 비율을 모르면 150×배율. 넘치는 사진은 양옆을 자른다 | 16 |
| 거리 0~1 | 펼친 폭 → 26으로 선형 보간 | 16 → 6 보간 |
| 거리 1~2 | 26 → 가는 폭으로 보간 | 6 |
| 그 밖(가는 기둥) | 8~12 사이. 한 달이 화면에 다 들어가도록 `(폭 − 40 − 150 − 52 − 6×(n−1)) / (n−3)` | 6 |

근거: iOS :83-89, :304-364, :379-396, :451-465.

- 기둥 간격 6, 화면 양끝 여백 20. 한 달이 다 들어가면 1일을 왼쪽에 붙인다. 넘치면 펼친 기둥이 가장자리 `(펼친 폭/2 + 24)` 안에 머물도록 할 때만 줄을 민다(:341-355, :460-463).
- 화면 밖 ±60을 벗어난 기둥은 opacity 0으로 그리지 않는다(:122, :478).
- 겹침 순서: 펼친 기둥이 위(`zIndex = count − distance`) (:123).
- 사진이 있는 날은 `RecordPhotoImage`를 기둥 크기로 클립한다. 빈 날은 `RecordEmptyFrame`이고, 기둥 폭이 40을 넘을 때만 날짜를 적는다(:92-103, :468).

#### 2.5.2 눈금자 (기둥 아래)

| 항목 | 값 |
|---|---|
| 기둥→눈금 간격 | 6 |
| 눈금 | 폭 1. 평일 높이 7 `colors.calendarCellBorder` / 일요일 높이 13 `colors.textSecondary` |
| 숫자 | 고른 날, 5의 배수, 1일에 붙인다. `typography.caption` 고정폭. 고른 날 `colors.textPrimary`, 나머지 `colors.textMuted`. y = 13 + 3(일요일 눈금 아래 한 줄) |
| 눈금 영역 높이 | 30 |

근거: iOS :126-147, :469-474 / AND :369-401, :633-641(Android는 숫자 칸 폭 상수 `TICK_SLOT_WIDTH = 24`가 더 있다).

#### 2.5.3 고른 날 표시(삼각 마커)

- 아래를 가리키는 삼각형 12×8, `colors.inputCursor`. 가운데 y = 84 − 9. 펼친 자리 x를 따라간다(:47-48, :149-154, :435-444, :475-477). Android는 위쪽 기준 `MARKER_TOP = 84 − 9 − 4`로 같은 자리다(:644-646).

#### 2.5.4 인터랙션

| 동작 | 결과 | 수치 |
|---|---|---|
| 가로 드래그 | 스크롤처럼 넘어간다. 오른쪽으로 끌면 지난 날(순서 증가) | 하루 = 손가락 32 |
| 드래그 중 걸림(detent) | 날짜 앞뒤 25%(8)에서는 그날에 멈춰 있다가 그 사이 구간에서만 넘어간다. 예: 3.2→3, 3.5→3.5, 3.8→4 | `detentHalfWidth 0.25` |
| 햅틱 | 하루를 넘을 때마다. 손으로 끄는 중이거나 관성 중일 때만(달력·탭 이동은 없음) | iOS `.selection` / AND `HapticFeedbackType.SegmentTick` |
| 손 뗌(관성) | 속도(일/초)가 1.5 넘으면 감속하며 하루씩 더 넘어간다. 1ms마다 속도 × 0.995. 1.5 이하가 되면 가까운 날에 붙는다. 끝 날에 닿으면 멈춘다 | iOS 프레임 8ms 루프 / AND `withFrameNanos` |
| 끝 넘겨 끌고 놓음 | 굴리지 않고 끝 날로 되돌아간다 | — |
| 붙기(settle) | iOS `spring(response 0.38, damping 0.82)` / AND `spring(damping 0.82, stiffness 273)` | — |
| 펼친 기둥 탭 | 사진이 있으면 피드로(§2.4 규칙). 힌트 `피드에서 봅니다` | — |
| 다른 기둥 탭 | 그날을 펼친다(settle) | — |
| 세로 드래그 | 묶음은 반응하지 않고 바깥 스크롤로 넘긴다(첫 움직임으로 가로/세로 판정) | — |

근거: iOS :55-58, :105-112, :186-272, :398-410, :480-488 / AND :96-110, :136-175, :422-440, :604, :649-658.

접근성 라벨: `"M월 d일 사진"` 또는 `"M월 d일, 기록 없음"`, 선택 특성(iOS :163-166, :113-117 / AND :285).

**[차이]** 거의 같다. iOS는 `simultaneousGesture` + 방향 판정이고, Android는 `pointerInput` + `VelocityTracker`다. → **같은 수준.** Android 쪽이 프레임 동기(`withFrameNanos`)라 관성이 조금 더 매끄럽다.

### 2.6 월간 책자 (Book) — 책상·그림자 연출과 종이 넘김(bend flip)

`iOS:Features/Record/Components/RecordPhotoBook.swift`, `AND:feature/record/component/RecordPhotoBook.kt`

#### 2.6.1 무대와 배율

- 기준 무대 393 × 290. 화면 폭에 맞춰 줄인다(`fitScale = min(1, 화면폭/393)`). 묶음이 커지면 같은 비율로 키우되, 펼친 책이 화면 양옆 8 안쪽에 머무는 만큼만 키운다(`maxGrowth = (폭/2 − 8) / 표지 폭`) (iOS :37-42, :290-308 / AND :168-176, :1096-1097, :1115).
- 위 기준 배율(`anchor: .top`). 표지 위쪽이 늘 y = 84(`contentTop`)에 오게 옮긴다: `topOffset = 84 − (72 − 4) × scale` (iOS :44, :67-70 / AND :178, :249-258).

#### 2.6.2 책 치수

| 항목 | 값 | 근거(iOS / AND) |
|---|---|---|
| 낱장 한 면 | 152 × 198 | :294 / :1100-1101 |
| 책등 x | 무대 가운데 196.5 | :296 / :1104 |
| 면 위쪽 y | 72 | :298 / :1107 |
| 표지 | 속지보다 위·아래·바깥으로 4 크다 → 156 × 206 | :311-312 / :1118-1120 |
| 사진 자리 | 오른쪽 면 안쪽 여백 10, 원래 비율 그대로 가운데에 fit(자르지 않음). 예: 3:4 → 132×176, 4:3 → 132×99 | :314-325, :882 / :1123 |
| 한 장 넘김 드래그 거리 | 152 × scale | :300, :174 / :1110, :186 |

#### 2.6.3 장 구성 (spread)

- `spread` = 넘긴 장 수. 0은 덮인 표지, 1은 속표지, d + 1은 d일이다. `maxSpread = 날 수 + 1`이고 `spread = maxSpread − position`이다(iOS :11-12, :232-269).
- 펼친 상태에서 **왼쪽 면 = 텍스트 페이지(앞 장의 뒷면)**, **오른쪽 면 = 사진 페이지(현재 장의 앞면)**다.
- 보이는 낱장만 그린다. 표지와 현재 ±2장이다(iOS :383-385).

#### 2.6.4 책상 그림자와 바탕 (`base`)

**[iOS]** (:390-412, :884-890)

1. **책상 그림자**: 둥근 사각(모서리 10), black 22%, blur 10. 폭 = 표지 폭 × (1 + 펼침 정도) + 12, 높이 = 표지 높이. x = 책등 − 표지 폭 × 펼침 − 6, y = 72 + 2. 펼칠수록 왼쪽으로 넓어진다.
2. **책등**: 폭 10, 모서리 3, 표지색을 black 25%로 섞은 색. 책등 가운데, y = 68.
3. **뒤표지**: `UnevenRoundedRectangle`(책등 쪽 2 / 바깥쪽 5), 표지색, 156 × 206, x = 책등.

**[AND]** (:460-475, :1138-1144): 같은 자리의 사각에 `shadow(elevation 8, RoundedCornerShape(10), clip = false)`를 주고 표지색으로 칠한다. 블러 수치를 직접 정하지 않고 Material elevation 그림자를 쓴다.

**[차이]** iOS는 그림자 색, 블러, 오프셋을 직접 정해 "책상 위에 놓인" 느낌을 낸다. Android는 elevation 8에 맡긴다. → **iOS가 더 정교하다.**

#### 2.6.5 표지 색 (천 장정)

- 그 달 **첫 사진**의 대표색을 어두운 잉크 RGB(30, 34, 30) 쪽으로 55% 섞어 쓴다. 사진을 아직 못 받았으면 `colors.calendarCellBorder`(iOS :210-217, :271-286, :365 / AND :185, :466-477(RecordScreen), :1178-1181).

#### 2.6.6 각 면의 내용

**앞표지 `coverFront`** (iOS :537-565 / AND :~720-750)

- 표지색 면 + 책등 쪽 띠(폭 7, 가로 그러데이션 black 25% → white 8% → black 12%)
- 가운데 세로 스택(간격 `spacing.md`, 위 24):
  - 첫 사진 붙임(tip-in): 76×76 클립, 흰 테두리 4(`colors.inputBackground`), 그림자 black 25% radius 1 y 1 (Android `shadow(1.dp)`)
  - 연도 `"{yyyy}"`: `typography.caption`, 자간 2.6, `colors.textOnImage` 80%
  - `"{M}월"`: `typography.title2`, `colors.textOnImage`

**표지 안쪽(면지) `coverInside`** (iOS :567-574): 표지색 위에 표지색을 white로 78% 밝힌 면. 위·아래·책등 쪽만 4 들여 판 가장자리가 보인다.

**속표지 `titlePage`** (iOS :576-598 / AND :~780-800)

- 종이 위 가운데 세로 스택(간격 `spacing.sm`)
  - `ChalkakLogo` 0.6배, 높이 24
  - `"{M}월의 기록"`: `typography.headline`, `colors.textPrimary`
  - 내 사인(있으면): 72 × 40 fit, 위 여백 `spacing.xs`. 흰 선 사인을 `colorMultiply(colors.textPrimary)`로 물들인다. 스켈레톤 없음
- 사인은 책자를 열 때마다, 그리고 기록을 다 받은 뒤 한 번 더 받는다(iOS `RecordScreen.swift:66-71`, AND `RecordScreen.kt:336-340`)

**왼쪽 면(텍스트) `textPage`** (iOS :617-651)

- 머리글 `"{M}월의 기록"`: `typography.caption` `colors.textMuted`, 좌우 14, 위 12
- 본문(왼쪽 16, 오른쪽 20, 위 32):
  - 요일(`EEEE`, 예: "월요일"): `typography.caption` `colors.textMuted`
  - 날짜 숫자: `typography.title1` 고정폭 `colors.textPrimary`
  - 짧은 선: 22 × 1 `colors.calendarCellBorder`, 위아래 `spacing.sm`
  - 그날 주제(있으면): `typography.footnote` `colors.textSecondary`, 최대 3줄
- 주제는 펼친 날 앞뒤 3일치를 250ms 디바운스로 불러온다(iOS `RecordScreen.swift:260-278`, :409 / AND `RecordScreen.kt:97-101`, :324-334)

**오른쪽 면(사진) `photoPage`** (iOS :602-615, :679-699)

- 사진: §2.6.2의 자리, `clipped()`, 0.5 테두리 black 8%
- 사진이 없는 날: 가운데에 선(22×1 `colors.calendarCellBorder`) + 간격 `spacing.sm` + `이날은 사진이 없어요`(`typography.caption`, `colors.textInactive`)

**종이 `paper`** (iOS :710-726, :917): `colors.inputBackground` 위에 책등 쪽으로 어두워지는 그러데이션. 위치 0: black 18%, 0.07: 6.3%, 0.2~0.82: 0, 1(바깥 끝): 5.4%. 왼쪽 면은 방향을 뒤집는다.

#### 2.6.7 넘김 애니메이션 (rigid flip + bend)

**표지(하드커버)는 휘지 않고 판처럼 돈다** (`rigidLeaf`, iOS :479-508)

- 책등을 축으로 `rotation3DEffect(-180° × turn, axis y, anchor .leading, perspective 0.3)` (iOS :504, :891). Android는 `rotationY = -180 × turn`, `cameraDistance = 12 × density` (:576-577, :1147)
- turn < 0.5면 앞면, 아니면 뒷면(좌우 반전)
- 넘어가는 동안 어두워진다: black `0.16 × sin(turn·π)` (:502, :892)
- 모서리: 표지 2/5, 속지 1/2
- zIndex: 넘어가는 중 400, 쌓인 앞면 `100 − index`, 뒤집힌 면 `100 + index` (:507, :897-898)

**종이(속지)는 휘며 넘어간다** (`bentLeaf` + `RecordPaperCurl`, iOS :429-477, :798-875 / AND :586-600, :1026-1077)

- 종이를 **세로 띠 10개**로 나누고, 띠끼리 0.6씩 겹쳐 틈을 없앤다(:894-895).
- 띠마다 기울기를 다르게 준다. `angle(along) = clamp(0…π, π·turn + bend·along²)`, `bend = 0.95 · sin(π·turn) · direction`
  - `along` = 책등(0)에서 종이 끝(1)까지의 위치
  - 넘기는 한가운데에서 종이 끝이 책등보다 최대 약 55°(0.95 rad) 앞선다. 다 넘어가면 다시 평평해진다 → 팔랑이며 내려앉는다.
- 띠마다 원근 사영 변환(`ProjectionTransform`)을 만든다. 깊이 = 낱장 폭 × 3.2. 화면 쪽으로 들린 부분이 조금 커 보인다(:848-874).
- 띠마다 앞면/뒷면을 따로 정한다(`angle < π/2`면 앞면). 휜 종이의 한쪽은 앞면, 다른 쪽은 뒷면이 보일 수 있다.
- 명암: 종이 전체에 한 장의 가로 그러데이션. 띠 경계 stop의 불투명도는 `0.16 · sin(그 지점 기울기)`다. 띠 경계에 줄이 보이지 않는다(:436-450).

**넘김 방향 뒤집기(bend flip)** (iOS :26-29, :49-62, :152-162, :783-796, :222-225 / AND :140-152, :1077, :1133-1136)

- `bendDirection` = 다음 장이면 +1, 되돌리면 −1이다. 종이 끝이 이 방향으로 앞서며 휜다.
- 손가락 떨림으로는 바꾸지 않는다. 지금 방향으로 가장 멀리 간 자리(anchor)에서 **0.04장 이상** 반대로 돌아와야 바꾼다.
- 바꿀 때 **0.4초** 동안 +1↔−1을 보간한다(종이가 평평해졌다가 반대로 휜다). iOS `.smooth(duration: 0.4)`, Android `tween(400)`(기본 FastOutSlowIn).
- 방향 애니메이션은 넘김 위치 애니메이션과 따로 돈다(`RecordBookBendAnimator`). 드래그로 위치가 매 순간 바뀌어도 방향 전환이 끊기지 않는다.

**넘기는 장의 그림자(cast shadow)** (iOS :730-752, :896)

- 아래 면 위에 가로 그러데이션: 투명 → `black 0.28 · sin(fraction·π)` → 투명. 진한 지점 = 장 끝이 비치는 곳(`|cos(fraction·π)| × 152`)의 6 앞, 26 뒤에서 다시 투명. zIndex 399.

**넘김 위치 애니메이션**

- iOS `spring(response = min(1.1, 0.55 + 0.05 × 넘길 장 수), damping 0.86)`. 여러 장일수록 천천히 넘긴다(:196-199).
- Android는 같은 response를 stiffness `(2π/response)²`로 바꾼다(:1088-1094).

**덮인 상태와 끝 넘김**

- 덮였을 때는 표지 가운데가 책등 자리에 오도록 왼쪽으로 `(1 − open) × 표지 폭 / 2` 민다.
- 끝을 넘겨 끌면 책 전체가 넘친 양 × 28만큼 밀린다(iOS :362-364, :883 / AND :1137).

#### 2.6.8 인터랙션

| 동작 | 결과 | 근거 |
|---|---|---|
| 무대 왼쪽 절반 탭 | 전날(앞 장) | iOS :101-106 / AND `RecordBookTouchLayer` :326- |
| 무대 오른쪽 절반 탭 | 다음 날(다음 장) | 같은 곳 |
| 가로 드래그 | 장 폭(152 × scale)만큼 끌면 한 장. 오른쪽으로 끌면 전날. 범위를 넘으면 고무줄 0.35 | iOS :172-184 / AND :205-246 |
| 손 뗌 | 예상 끝 위치로 반올림. **한 번에 최대 2장**. iOS는 `predictedEndTranslation`, Android는 `속도 × 0.2초`로 예측 | iOS :185-193, :201 / AND :216-231, :1113-1114 |
| 펼친 사진 탭 | 위치가 장에 붙어 있을 때(오차 < 0.05)만 사진 자리에 버튼이 생긴다 → 피드 | iOS :117-131 / AND :188, :278-291, :1132 |
| 양끝 화살표 | `전날 보기`(chevron.left) / `다음 날 보기`(chevron.right). 표지에서는 왼쪽, 마지막 날에서는 오른쪽이 꺼진다 | iOS :136-150 / AND :294-321 |
| VoiceOver | 조절(adjustable) 동작으로 넘긴다. 라벨: `"{월} 책 표지"` / `"{M}월의 기록 속표지"` / `"M월 d일 사진"` / `"M월 d일, 기록 없음"` | iOS :107-115, :263-268 |

**화살표 스펙**

- [iOS] `RecordGlassIconButton` 지름 44, `.regular`, SF `chevron.left` / `chevron.right` (:139-149, :221)
- [AND] `RecordFloatingIconButton` 보이는 원 40, 아이콘 20, 터치 48. `RES:drawable/ic_display_arrow_left` / `ic_display_arrow_right` (:300-321, :1126-1128)
- 위치: 책 면 세로 가운데 `(72 + 99) × scale + topOffset`. 가로는 책 가장자리와 화면 끝 사이 가운데, 단 화면 끝에서 최소 4 + 반지름. 책이 커져도 화살표는 커지지 않는다(iOS :327-333, :755-781, :878-880 / AND :295-299, :1131)

**[AND] 공유 전환 중 숨김**: 피드로 오가는 동안에는 책에 그린 사진을 숨겨 두 장이 겹쳐 보이지 않게 한다(:189-200). [iOS]는 `feedZoomSource`가 처리한다.

**[차이]** 책 모양 수치와 휨 수식은 같다. iOS가 정교한 부분은 책상 그림자(블러·오프셋 직접 지정), 원근(`ProjectionTransform` vs Android 단순 `cameraDistance`), VoiceOver 조절 동작, 글래스 화살표다. Android가 나은 부분은 피드 전환 중 사진 숨김(겹침 방지)과 화면 좌표의 사진 자리(배율 밖에 두어 전환 크기가 정확하다)다. → **전체적으로 iOS가 더 정교하다.** 전환 처리는 Android 방식을 참고한다.

### 2.7 연간 달력 (`RecordYearCalendar`)

`iOS:Features/Record/Components/RecordYearCalendar.swift`, `AND:feature/record/component/RecordYearCalendar.kt`

**레이아웃** (iOS :24-61, :108-115 / AND :63-89, :205-211)

- 세로 스크롤. 좌우 20, 위 `spacing.sm`, 아래 `spacing.xxl`. 세로 간격 `spacing.xl`
- 헤더 Row
  - 연도 `"{yyyy}"`: `typography.title1` 고정폭 `colors.textPrimary`. iOS는 `contentTransition(.numericText())`, Android는 `AnimatedContent`(기본 전환)
  - Spacer
  - `이전 해` / `다음 해` 버튼
    - [iOS] SF `chevron.left/right`, `typography.body` 크기, 켜짐 `colors.iconPrimary` / 꺼짐 `colors.textInactive`, 터치 44
    - [AND] `IconButton` + `RES:drawable/ic_display_arrow_left/right`, 같은 색 규칙 (:88-89, :120-125)
- 3열 그리드: 열 간격 18, 줄 간격 28, 1~12월

**월 칸** (iOS :81-106 / AND :149-157)

- 세로 스택(간격 `spacing.sm`): `"{M}월"`(`typography.headline`, `colors.textPrimary`) + 날짜 칸 그리드
- 날짜 칸: 일요일 시작 7열, 간격 2.5, 모서리 2.5, 1:1
  - 기록 없는 날: `colors.calendarCell`
  - 기록은 있지만 대표색을 아직 못 구한 날: `colors.calendarCellBorder`
  - 대표색이 있는 날: 그 RGB
  - 근거: iOS :118-165 / AND :175-200, :209-210
- 고를 수 있는 조건
  - 최신 달보다 늦은 달(아직 오지 않은 달)과 기록이 없는 달은 opacity 0.35이고 누를 수 없다
  - 아직 받지 않은 달은 흐리게 하지 않고 누르지만 못하게 둔다(받자마자 깜빡이지 않게)
  - 연간으로 나오기 전에 보던 달은 기록이 없어도 고를 수 있다
  - 근거: iOS :82-86, :104
- 접근성: `"{M}월, 기록 {n}개"`

**전환 (월간 ↔ 연간)**

- [iOS] 연간 작은 달과 월간 달력을 `matchedGeometryEffect(id: "record-month-{y}-{m}")`로 잇는다. 고른 달이 커지며 월간 달력이 된다. 애니메이션은 `spring(response 0.5, damping 0.86)`. 해 이동은 `.snappy` (`iOS:RecordScreen.swift:111`, :300-323, :392, `RecordYearCalendar.swift:97`, :167-172)
- [AND] `AnimatedContent(fadeIn() togetherWith fadeOut())`. 기본 스펙은 spring으로 교차 페이드만 한다. 연간에서 시스템 뒤로 가기를 누르면 월간으로 돌아간다 (`AND:RecordScreen.kt:192-216`)

**[차이]** iOS는 공유 요소 확대 전환이고, Android는 단순 크로스페이드다. Android에는 시스템 뒤로 가기 대응이 있다(iOS는 해당 없음). → **iOS가 더 정교하다.**

### 2.8 월 선택 시트 (`RecordMonthPickerSheet`) — 현재 미사용

- **두 플랫폼 모두 현재 화면에서 띄우는 곳이 없다.** iOS는 정의만 있고, Android는 정의와 프리뷰만 있다. 월 이동은 연간 달력이 대신한다.
- 스펙(복원용):
  - 제목 `날짜 선택`. 열 두 개: `"{yyyy}년"`(연도), `"{M}월"`(월). 기록이 있는 달만 고를 수 있고, 현재 달은 늘 포함한다
  - 연도를 바꾸면 그 해에서 지금 월과 가장 가까운 달로 맞춘다. 예: 9·10월만 있으면 3월 → 9월
  - 확인 버튼: iOS `완료`(헤더 오른쪽), Android `확인`(아래 버튼)
  - 근거: `iOS:Features/Record/Components/RecordMonthPickerSheet.swift:5-55`, `AND:feature/record/component/RecordMonthPickerSheet.kt`, 틀은 §1.9
- 같은 이유로 **`RecordTopBar`(연월 + 좌우 화살표, 위 20 / 왼쪽 8, 화살표 터치 48·아이콘 18(iOS) 또는 24(AND), 꺼짐 0.35)**는 iOS에서 달력 이미지 저장 스냅샷에만 쓰인다(`iOS:Features/Record/RecordCalendarImageSaver.swift:34`, `RecordTopBar.swift:82-88`). Android는 프리뷰에만 있고 `이미지로 저장`(`typography.footnote`, `colors.textMuted`) 버튼을 가진다(`AND:feature/record/component/RecordTopBar.kt:45-107`). 저장 결과 토스트는 `달력을 이미지로 저장했어요` / `이미지 저장에 실패했어요` / `이미지 저장 권한이 필요해요`이고 뷰모델에만 남아 있다(`iOS:RecordViewModel.swift:311-315`, `AND:RecordViewModel.kt:382-391`).

### 2.9 기록 화면 상태별 UI

| 상태 | UI | 근거 |
|---|---|---|
| 로딩 | 별도 스피너나 스켈레톤이 없다. 묶음은 빈 프레임과 `calendarCell` 자리표시, 달력은 날짜 숫자와 빈 썸네일 칸(iOS는 칸마다 이미지 스켈레톤)으로 그린다 | `iOS:RecordViewState.swift:65-71`, §1.8 |
| 빈 달(기록 0) | 별도 빈 화면이 없다. 묶음은 지난 날 수만큼 빈 프레임(차콜)을, 달력은 날짜 숫자만 보인다. 책자는 표지가 `calendarCellBorder` 색이 되고, 면마다 `이날은 사진이 없어요`가 나온다 | §2.4, §2.6.6 |
| 에러 | 달력 아래(위 24)에 가운데 정렬 문구(`typography.body`, `colors.textSecondary`, 좌우 20) + 텍스트 버튼 `다시 시도`(`typography.body`, `colors.actionPrimary`). [iOS] 최소 높이 44, 좌우 `spacing.sm` / [AND] Material `TextButton` | `iOS:RecordScreen.swift:327-353`, :406-407 / `AND:RecordScreen.kt:516-542` |
| 에러 문구 | `로그인이 필요해요`(401) / `조회할 수 없는 연월이에요` / `기록을 불러오지 못했어요` | `iOS:RecordViewState.swift:50-55` / `AND:RecordViewModel.kt:635-643` |
| 로그인 필요 | 위 영역에서 버튼 문구만 `로그인 하기`로 바뀌고, 누르면 로그인 화면으로 간다 | iOS :335-343 / AND :534-536 |
| 다시 불러오기 실패 [AND] | 이미 데이터가 있으면 에러 영역 대신 토스트 | `AND:RecordViewModel.kt:504` |
| 게스트 | 탭 진입 전에 토스트로 막는다(§2.0) | |

**[차이]** 상태 처리는 거의 같다. → **같은 수준.** 둘 다 로딩 표시가 약하다.

---

## 3. 알림 (Notification)

### 3.1 알림함

`iOS:Features/Notification/NotificationScreen.swift`, `AND:feature/notification/NotificationScreen.kt`

#### 3.1.1 진입

- 홈 상단의 알림 버튼으로 들어간다. 게스트는 토스트 `로그인 후 알림을 확인할 수 있어요`가 뜬다(`iOS:ContentView.swift:535-541`).
- iOS는 `NavigationStack` push다. 시스템 내비게이션 바는 숨기고(`.toolbar(.hidden)`) 커스텀 상단 바를 쓴다. 가장자리 스와이프 뒤로를 강제로 켠다(`InteractivePopGestureEnabler`) (`iOS:ContentView.swift:99-108`).
- Android는 `Notifications` 라우트(`launchSingleTop`)다(`AND:navigation/ChalkakNavHost.kt:472-473`, :498-510).

#### 3.1.2 레이아웃

1. 상단 바(§1.3) — `모두 읽음` 포함. 읽지 않은 알림이 있어야 켜진다(`canMarkAllRead`)
2. 목록 (iOS `ScrollView` + `LazyVStack(spacing 0)`, 좌우 `spacing.screenHorizontal` / Android `LazyColumn`, 행 안쪽 좌우 `screenHorizontal`)
   - 행 + 구분선(1, `colors.border`; Android는 `HorizontalDivider` 기본 두께 1, 좌우 25 들여 쓰기)

**알림 행** (iOS :99-149 / AND `component/NotificationListItem.kt:35-105`)

| 요소 | 스펙 |
|---|---|
| 행 | 가로, 위 정렬, 위아래 `spacing.xl`(24). 행 전체 탭 |
| 안 읽음 점 | 칸 폭 `spacing.md`(12), 위 `spacing.xs`(4). 점 지름 `spacing.sm`(8), `colors.inputCursor`. 읽은 알림은 빈칸 |
| 텍스트 열 | 왼쪽 `spacing.md` 띄움, 남은 폭 채움 |
| ㄴ 제목 | `typography.subheadline`, `colors.textPrimary`, 최대 2줄(말줄임) |
| ㄴ 본문 (비어 있지 않을 때) | `typography.caption`, `colors.textSecondary`, 최대 2줄 |
| ㄴ 시각 | `typography.caption`, `colors.textInactive` |
| 썸네일 (있을 때) | 44×44, 왼쪽 `spacing.lg` 띄움. [iOS] 모서리 6 / [AND] 모서리 없음 |
| 접근성 | 값 `읽지 않음` / `읽음` |

- 줄 간격: [iOS] 제목·본문·시각 모두 `spacing.sm`(VStack spacing) / [AND] 본문 위 `spacing.xs`, 시각 위 `spacing.md`
- 시각 형식
  - [iOS] 오늘 `HH:mm`, 어제 `어제 HH:mm`, 그 외 `M월 d일 HH:mm` (:250-268)
  - [AND] 늘 `M월 d일 HH:mm`(Asia/Seoul) (`NotificationViewModel.kt:265-268`)
- 썸네일 스펙: iOS :132-141, :271-272 / AND :97-105, :141

#### 3.1.3 페이지 넘김

- 한 페이지 20개(`AND:NotificationViewModel.kt:270`)
- [iOS] 목록 끝의 페이지 영역이 나타나면 다음 페이지를 부른다. 로딩 중이면 `ProgressView`(tint `colors.actionPrimary`). 실패하면 `Label("더 불러오기", systemImage: "arrow.clockwise")`(`typography.subheadline`, `colors.textSecondary`)가 나온다. 위아래 `spacing.xl` (:86-92, :224-248). 실패 토스트는 `다음 알림을 불러오지 못했어요. 다시 시도해 주세요.`
- [AND] 마지막으로 보이는 행이 끝에서 4개 안이면 다음 페이지. 같은 페이지는 한 번만 요청한다. 로딩 중이면 `CircularProgressIndicator`(`colors.iconPrimary`, 여백 `spacing.lg`). 에러가 있으면 목록 끝에 `typography.caption` `colors.textInactive` 문구가 나오고, 누르면 새로고침한다 (:98-122, :194-219)

#### 3.1.4 상태별 UI

| 상태 | iOS | Android |
|---|---|---|
| 첫 로딩 | 가운데 VStack(간격 `spacing.lg`): `ProgressView`(tint `actionPrimary`) + `알림을 불러오는 중이에요`(`typography.subheadline`, `textSecondary`) (:151-166) | 가운데 `CircularProgressIndicator`(`iconPrimary`), 문구 없음 (:139-144) |
| 빈 상태 | 스크롤 안, 위 144, 좌우 25, 간격 `spacing.sm`: SF `bell` 34 `colors.iconSecondary` → `아직 알림이 없어요`(`typography.body`, `textSecondary`) → `승인이나 반려 소식이 생기면 여기에 모아둘게요`(`typography.subheadline`, `textMuted`, 가운데) (:168-195, :274-275) | 여백 `spacing.xl`, 위에서부터 가운데 정렬: `아직 알림이 없어요.`(`typography.body`, `textInactive`)만 (:146-156) |
| 실패 | 가운데 VStack(간격 `spacing.xl`): `알림을 불러오지 못했어요`(`typography.body`, `textSecondary`) + 원형 재시도 버튼 48(배경 `actionPrimary`, SF `arrow.clockwise` 20 semibold `onActionPrimary`, 라벨 `알림 다시 불러오기`) (:197-222, :276-277) | 빈 상태 자리에 에러 문구(`textInactive`) + `다시 시도`(`typography.subheadline`, `textPrimary`, 위 `spacing.md`) 텍스트 (:157-166) |
| 새로고침 실패(데이터 있음) | 토스트 `알림을 새로고침하지 못했어요. 다시 시도해 주세요.` | 목록 끝 에러 문구 |

- Android 에러 문구: `네트워크 연결을 확인해 주세요.` / `알림을 불러오지 못했어요.` / `로그인이 필요해요.` / `알림이 만료되었거나 삭제됐어요. 목록을 새로고침해 주세요.` (`AND:NotificationViewModel.kt:254-261`)
- 게스트: 진입 자체를 막는다(§3.1.1).

#### 3.1.5 인터랙션

- **행 탭**: 먼저 읽음 처리를 한 뒤 대상 화면으로 간다.

| 알림 종류 | 이동 대상 |
|---|---|
| `POST_APPROVED` | 피드 |
| `AI_REVIEW_COMPLETED` / `FAILED` | 피드(내 글) + AI 리뷰 시트 자동 열림 |
| `POST_REJECTED` / `NOTICE` | 알림 상세 |
| `TOPIC` | 홈 탭 맨 위 |

  - iOS: `iOS:ContentView.swift:760-798`, `NotificationInboxViewModel.swift:17-25` / Android: `AND:navigation/ChalkakNavHost.kt:918-971`
  - 읽음 실패 시 [iOS] 토스트 `읽음 처리하지 못했어요. 다시 열어 주세요.`, 없는 알림은 `더 이상 확인할 수 없는 알림이에요.`, 열 수 없는 종류는 `이 알림은 아직 열 수 없어요` (`NotificationInboxViewModel.swift:155-162`, `ContentView.swift:748`)
  - [AND] 네트워크 실패면 `읽음 상태를 저장하지 못했어요. 네트워크 연결을 확인해 주세요.`를 띄우고 이동은 한다. 삭제된 게시물은 `삭제된 게시물입니다` (`NotificationViewModel.kt:106,117`)
  - 탭 연타 방지: [AND] `dropUnlessResumed` (:181)
- **모두 읽음**: 실패하면 `모두 읽음 처리하지 못했어요. 다시 시도해 주세요.` (iOS :190 / AND :171)
- **새로고침**: [iOS] 화면에 들어올 때(`.task`)와 앱이 활성화될 때(`ContentView.swift:326`). Android는 뷰모델 초기화 때. 두 플랫폼 모두 당겨서 새로고침이 없다.

**[차이]** iOS 쪽이 로딩 문구, 아이콘이 있는 빈 상태, 원형 재시도, 상대 시각(오늘/어제), 썸네일 모서리를 갖췄다. → **iOS가 분명히 더 정교하다.**

### 3.2 알림 상세 (반려·공지)

`iOS:Features/Notification/NotificationDetailScreen.swift`, `AND:feature/notification/NotificationDetailScreen.kt`

**레이아웃** (iOS :51-92 / AND :115-165)

1. 상단 바: iOS 제목 `알림`, Android `알림 상세`(§1.3)
2. 세로 스크롤, 좌우 `spacing.screenHorizontal`

| 요소 | iOS | Android |
|---|---|---|
| 바깥 여백 | 위아래 `spacing.lg`, 묶음 사이 `spacing.xl` | 제목 위 `spacing.xl` |
| 제목 | `typography.headline`, `textPrimary` | 같다 |
| 본문 | 제목 아래 `spacing.sm`, `typography.subheadline`, `textSecondary` | 제목 아래 `spacing.md`, `typography.body`, `textSecondary` |
| 반려된 내 사진 (원본 URL이 있을 때) | 전체 폭 **1:1 영역** 안에 fit, 배경 `colors.surface`, 라벨 `반려된 내 사진` | 전체 폭, **최대 높이 440**, fit, 위 `spacing.xl`, 라벨 `반려된 사진` |
| `반려 사유` 라벨 | `typography.caption`, `textInactive` | 위 `spacing.xl`, `typography.subheadline`, `textPrimary` |
| 사유 본문 | 라벨 아래 `spacing.sm`, `typography.body`, `textPrimary` | 라벨 아래 `spacing.sm`, `typography.body`, `textSecondary` |
| 작성 시각 | 없음 | `M월 d일 HH:mm`, `typography.caption`, `textInactive`, 위아래 `spacing.xl` |

근거: iOS :53-90, :110-113 / AND :121-164, :183-189.

**상태** (iOS :21-39, :94-107 / AND :76-113)

| 상태 | iOS | Android |
|---|---|---|
| 로딩 | 가운데 `ProgressView`(기본 색) | 가운데 `CircularProgressIndicator`(`iconPrimary`) |
| 없음(404) | `더 이상 확인할 수 없는 알림이에요`(`typography.subheadline`, `textSecondary`, 가운데). 동시에 알림함을 새로고침한다(`ContentView.swift:131-133`) | 아래 실패와 같은 화면. 문구 `알림이 만료되었거나 게시물이 삭제됐어요.` |
| 실패 | `알림을 불러오지 못했어요` + 간격 `spacing.lg` + `ChalkakOutlinedButton("다시 시도")` | 문구(`typography.body`, `textInactive`, 여백 `spacing.xl`) + 위 `spacing.md`에 텍스트 버튼 두 개: `다시 시도`, `알림함으로`(각 여백 `spacing.sm`, `typography.subheadline`, `textPrimary`) |

- Android 상세 에러 문구: `AND:NotificationDetailViewModel.kt:75-82`

**[차이]** iOS는 화면 단위 레이아웃(1:1 사진 틀, 아웃라인 재시도 버튼)이 단정하다. Android는 시각 표시와 `알림함으로` 탈출로가 더 있다. → **시각 스펙은 iOS, 기능은 Android.** 이식할 때는 iOS 레이아웃에 Android의 시각과 `알림함으로`를 더한다.

---

## 4. 설정 (Settings)

`iOS:Features/Settings/SettingsScreen.swift`, `SettingsComponents.swift` / `AND:feature/settings/SettingsScreen.kt`, `component/*`

### 4.1 레이아웃 (위→아래, 로그인 상태)

공통: 세로 스크롤, 좌우 `spacing.screenHorizontal`, 위 48, 아래 `spacing.xxl`. iOS는 스크롤 표시줄을 숨긴다(`iOS:SettingsScreen.swift:135-139`, :228 / `AND:SettingsScreen.kt:151-158`, :238).

| # | iOS | 간격 근거 | Android | 간격 근거 |
|---|---|---|---|---|
| 1 | 섹션 `앱 설정` | :50 | 섹션 `앱 설정` | :161 |
| 2 | (lg 16) 서명 카드 | :52-60, :97 | (16) 서명 카드 | :163-170 |
| 3 | (lg 16) 푸시 알림 카드 — 같은 섹션 안 | :61-95 | (36) 섹션 `푸시 알림` → (16) 푸시 카드 | :172-187 |
| 4 | (36) 섹션 `계정` | :100-102, :229 | (36) 섹션 `계정` | :189-192 |
| 5 | (lg 16) 계정 카드 | :104-117 | (16) 계정 카드 | :194-202 |
| 6 | (xxl 40) 섹션 `피드백` → (lg 16) 피드백 카드 | :119-123 | (40) `피드백` → (16) 카드 | :212-221 |
| 7 | (xxl 40) 섹션 `정보 및 약관` → (lg 16) 정보 카드 | :125-133 | (40) `정보 및 약관` → (16) 카드 | :223-234 |
| 8 | — | | (디버그 빌드) `BuildVariantSettingsEntry` | :236, :97 |

하단 바: iOS는 루트의 `safeAreaInset` 하단 바와 스크롤 접힘 연동(:140)을 쓴다. Android는 Scaffold `bottomBar = ChalkakScreenBottomBar(SETTINGS)`다(:142-149).

### 4.2 서명 카드 (사인 재설정)

| 요소 | iOS (`SettingsComponents.swift:14-66`) | Android (`component/SettingsAppCard.kt:30-80`) |
|---|---|---|
| 헤더 행 | HStack(간격 `spacing.md`): `사인 재설정`(`callout`, `textPrimary`) + Spacer + `변경하기` 버튼(`callout`, `textSecondary`, 밑줄, 위아래 `spacing.xs`). 좌우 20, **위 18** | `SettingsRow`(좌우 20, 위아래 16) + trailing `변경하기`(`callout`, `textSecondary`, 밑줄, 리플 없음) |
| 사인 캔버스 | 높이 112, 좌우 20, 위 `spacing.lg`, 아래 20 | 높이 112, 좌우 20, 아래 20(헤더 행 아래 여백 16이 위 간격) |
| 캔버스 배경 | `colors.actionPrimary`, 모서리 `shapes.button`(12) | `colors.actionPrimary`, 모서리 `SettingsShape`(16) |
| 캔버스 테두리 | **점선** 1, dash [4,3], `colors.textOnImage` 28% | **실선** 1, `colors.textOnImage` 28% |
| 사인 이미지 | 최대 120 × 48 fit, 라벨 `현재 사인` | 폭 42% × 높이 48 fit, 라벨 `현재 사인` |
| 사인 없음 | 빈 캔버스 | 빈 캔버스 |

근거: iOS 수치 :331-339.

- **인터랙션**: `변경하기` → [iOS] `fullScreenCover`로 `SignatureChangeFlow`(서명 다시 그리기 흐름) (`SettingsScreen.swift:181-195`) / [AND] `ChangeSignature` 라우트 push(`ChalkakNavHost.kt:358`).
- 바꾼 뒤 돌아오면 토스트 `사인 반영까지 시간이 좀 걸릴 수 있어요!` (iOS :183-186 / `AND:SettingsViewModel.kt:62`)
- 사인 로드 실패 토스트: `사인을 불러오지 못했어요. 다시 시도해 주세요.` (`iOS:SettingsViewModel.swift:72` / `AND:SettingsViewModel.kt:303`)

**[차이]** iOS의 점선 테두리와 `shapes.button` 모서리는 "서명란" 느낌을 의도한 디자인이다. → **iOS가 더 정교하다.**

### 4.3 푸시 알림 카드

| 행 | iOS 문구 | Android 문구 |
|---|---|---|
| 1 | `오늘 주제 알림` | `주제 알림` |
| 2 | `게시물 승인·반려 알림` | `승인·반려 알림` |
| 3 | `AI 피드백 완료 알림` | `AI 피드백 알림` |

근거: `iOS:SettingsComponents.swift:149-180` / `AND:component/SettingsPushNotificationCard.kt:31-47`.

- 행 사이 구분선(§1.5), 스위치(§1.4).
- **낙관적 갱신**: 누르는 즉시 값을 바꾸고 저장한다. 실패하면 그 항목만 되돌린다(`iOS:NotificationSettings.swift:91-145`).
- 저장 중인 항목만 꺼진다. 설정을 못 받았으면 모두 꺼진다.
- **OS 권한 연동**: 켤 때 OS 권한이 거부(denied)면 기기 알림 설정을 연다(iOS `UIApplication.openNotificationSettingsURLString`, :198-207 / Android `ACTION_APP_NOTIFICATION_SETTINGS`, API 26 미만은 앱 상세 :243-257).
- 앱이 다시 활성화되면 설정을 다시 불러온다(iOS :164-172).
- **에러**
  - [iOS] 불러오기 실패: 카드 맨 아래에 빨간 줄(`typography.caption` `colors.error` 문구 `알림 설정을 불러오지 못했어요. 다시 시도해 주세요.` + 간격 `spacing.xs` + 밑줄 `다시 시도` `textSecondary`, 최소 44×44, 좌우 20) (:181-194, `NotificationSettings.swift:61`). 저장 실패는 토스트 `알림 설정을 저장하지 못했어요. 다시 시도해 주세요.` (`NotificationSettings.swift:141`, `SettingsScreen.swift:173-177`)
  - [AND] 불러오기 실패 토스트 `푸시 알림 설정을 불러오지 못했어요.`, 저장 실패 토스트 `푸시 알림 설정을 저장하지 못했어요.` (`AND:SettingsViewModel.kt:206,252`)

**[차이]** iOS는 불러오기 실패를 카드 안에서 재시도할 수 있다. Android는 토스트만 띄우고 재시도 수단이 없다. → **iOS가 더 정교하다.**

### 4.4 계정 카드 (로그아웃 / 탈퇴)

| 요소 | iOS (`SettingsComponents.swift:200-224`) | Android (`component/SettingsAccountCard.kt:18-48`) |
|---|---|---|
| 로그아웃 행 | `로그아웃` + 오른쪽 SF `rectangle.portrait.and.arrow.right` 13 regular `colors.textMuted` | `로그아웃` + 오른쪽 `RES:drawable/ic_log_out` 12×12, tint 없음(벡터 고유색 `#D1CFCA`: 문 + 오른쪽 화살표) |
| 구분선 | 있음 | 있음 |
| 탈퇴 행 | `회원탈퇴`, 글자 `colors.error` | `회원탈퇴`, 글자 `colors.destructive` |
| 진행 중 | 카드 전체 `disabled` + opacity 0.55 | 행 `enabled = false`(시각 변화 없음) |

- 누르면 확인 다이얼로그(§1.2)가 뜬다. 확인하면 처리하고, 성공하면 로그인 화면으로 간다(`iOS:SettingsScreen.swift:209-219`, `ContentView.swift:916-929`). 실패 토스트는 `요청을 처리하지 못했어요. 다시 시도해 주세요.` (`iOS:SettingsViewModel.swift:128`, `AND:SettingsViewModel.kt:304`)

**[차이]** iOS는 진행 중 상태를 0.55로 흐려 보인다. → **iOS가 더 정교하다.** 아이콘 색은 Android가 하드코딩(`#D1CFCA`)이라 다크 모드에 약하다.

### 4.5 피드백 카드 · 정보 및 약관 카드

- 피드백 카드: 행 `피드백 보내기` + 화살표(§1.5). 게스트가 누르면 토스트 `피드백을 보내려면 로그인이 필요해요` (`iOS:SettingsComponents.swift:121-131`, `ContentView.swift:889-897` / `AND:component/SettingsFeedbackCard.kt:18-21`, `ChalkakNavHost.kt:801-805`, :1091)
- 정보 카드: `개인정보처리방침`(화살표) / `이용약관`(화살표) / `버전정보`(오른쪽 버전 문자열 `callout` `textMuted`, 누를 수 없음). 행 사이 구분선 (`iOS:SettingsComponents.swift:96-119` / `AND:component/SettingsInformationCard.kt:21-46`)
- 약관 열기: §6.3

### 4.6 게스트와 로딩 상태

| 상태 | iOS | Android |
|---|---|---|
| 로딩 | `앱 설정` 라벨 + 빈 자리 높이 56. 계정 자리도 빈 높이 56 (:49-55, :113-115, :230) | `isLoggedIn`이 false라 앱 설정·푸시 섹션이 없다. 계정 자리만 빈 높이 56 (:209) |
| 게스트 | 앱 설정 섹션 없음. `계정` 위 여백 0. **로그인 버튼**: 행 전체가 `colors.actionPrimary` 배경, `shapes.large`, 카드 그림자. `로그인`(`callout`, `onActionPrimary`) + SF `chevron.right` 13 semibold. 좌우 20, 위아래 16 (:67-94) | 같은 구조. `SettingsShape` 16, 배경 `actionPrimary`, 리플 없음. `로그인` + `RES:drawable/ic_display_arrow_right` 24 tint `onActionPrimary`. 좌우 20, 위아래 16. 그림자 없음 (`component/SettingsLoginButton.kt:27-57`) |

---

## 5. 피드백 (Feedback)

`iOS:Features/Feedback/FeedbackScreen.swift` / `AND:feature/feedback/FeedbackScreen.kt`

### 5.1 진입과 표시 방식

- [iOS] **전체 화면 모달**(`fullScreenCover`, 아래에서 올라온다). 안에 `NavigationStack`을 두고, 툴바 오른쪽에 `ChalkakCloseButton`(§1.3, 라벨 `닫기`)을 둔다. 보내는 중에는 닫기를 막는다(버튼 disabled + `interactiveDismissDisabled`). 제목은 없다 (`iOS:ContentView.swift:235-259`).
- [AND] 일반 push 라우트 `Feedback`. 상단 바 `피드백 보내기` + 뒤로(§1.3) (`AND:navigation/ChalkakNavHost.kt:801-822`).
- 게스트는 들어올 수 없다(§4.5).

### 5.2 레이아웃 (위→아래)

| # | 요소 | iOS | Android |
|---|---|---|---|
| 1 | 위 여백 | `spacing.xl`(24) (:62, :140) | 상단 바 아래 36 (:82, :186) |
| 2 | 제목 | `찰캌을 사용하며\n느낀 점을 알려주세요.`, `typography.title2`, `textPrimary` (:20-24) | 같다 (:120-123) |
| 3 | 제목→설명 | `spacing.md` | `spacing.md` |
| 4 | 설명 | `서비스 이용 중 불편한 점이나 개선되었으면 하는 점을\n자유롭게 남겨주세요.`, `typography.subheadline`, `textSecondary` (:26-29) | 같다 (:128-131) |
| 5 | 설명→입력 | 28 (:53, :145) | 28 (:187) |
| 6 | 입력 라벨 | 없음(접근성 라벨 `피드백 내용`만) | **`피드백 내용`**(`typography.subheadline`, `textPrimary`) + 아래 `spacing.sm` (:136-140) |
| 7 | 입력 | `ChalkakTextField`: **높이 240 고정**, 줄 수 8~14, 글자 `typography.subheadline`, 최대 1000(**유니코드 스칼라** 기준), 자리표시 `내용을 입력해 주세요.` (:34-53, :146) | `ChalkakTextField`: **최소 높이 240**, `minLines 8`, 글자 `typography.subheadline`, 최대 1000(**grapheme** 기준), 같은 자리표시 (:143-155, :188) |
| 8 | 입력→안내 | `spacing.sm` | `spacing.sm` |
| 9 | 안내 | `보내주신 의견은 더 나은 서비스를 만드는 데 활용돼요.`, `typography.footnote`, `textMuted` (:55-58) | 같다 (:160-163) |
| 10 | 아래 여백 | `spacing.lg` (:63, :144) | 버튼 영역 104를 비운다 (:189) |
| — | 보내기 버튼 | 아래 `safeAreaInset`. `ChalkakButton` 전체 폭, 좌우 25, 위 `spacing.sm`, 아래 `spacing.lg`, 배경 `colors.background` (:70-86) | 화면 아래 고정. `ChalkakButton` 전체 폭, 좌우 25, `navigationBarsPadding` + `imePadding` + 아래 `spacing.xl` (:166-176) |

**입력 필드 `ChalkakTextField` 공통 스펙** (`iOS:DesignSystem/Components/Input/ChalkakTextField.swift:32-75`, `AND:core/designsystem/component/input/ChalkakTextField.kt:49-112`)

- 배경 `colors.inputBackground`, 모서리 `shapes.input`(14)
- 테두리 1: 포커스 `colors.actionPrimary` / 평소 `colors.border`
- 안쪽 여백 `spacing.lg`(16). 글자 수 표시가 있으면 아래에 `spacing.xl`(24)을 더 비운다
- 커서 `colors.inputCursor`. 자리표시 `colors.textInactive`. 꺼짐 글자 `colors.textMuted`
- 글자 수 `"{n} / 1000"`: 오른쪽 아래, `typography.subheadline`, `colors.textInactive`, 여백 `spacing.lg`
- 최대 길이를 넘는 입력은 앞에서부터 잘라 받는다

### 5.3 상태와 인터랙션

- **보내기 버튼**
  - 문구: 평소 `보내기`, 보내는 중 `보내는 중...` (iOS :72 / AND :167)
  - 켜짐 조건: 보내는 중이 아니고, 앞뒤 공백을 뺀 내용이 비어 있지 않고, 1000 이하 (`iOS:FeedbackViewState.swift:15-19`)
  - 보내는 중에는 입력도 꺼진다
- **성공**: 화면을 닫고 토스트 `피드백을 보내주셔서 감사해요.` (`iOS:ContentView.swift:903-906`, `AND:ChalkakNavHost.kt:819`, :1092)
- **실패 토스트**: `피드백은 1자 이상 1000자 이하로 입력해 주세요.`(검증) / `피드백을 보내지 못했어요. 다시 시도해 주세요.`(일반). 재인증이 필요하면 로그인 화면으로 간다 (`iOS:FeedbackViewModel.swift:74-75` / `AND:FeedbackViewModel.kt:115-116`)
- **키보드**
  - [iOS] 키보드가 보일 때만 스크롤된다(`scrollDisabled(!isKeyboardVisible)`). 스크롤로 키보드를 닫지 않는다. 내용이 작으면 튕기지 않는다 (:65-67, :90-95)
  - [AND] 빈 곳을 탭하면 포커스를 풀고 키보드를 내린다 (:83-86)
- **아래로 쓸어 닫기** [iOS 전용]: 입력창과 버튼 밖에서 시작하고, 키보드가 없고 보내는 중이 아니며 세로 성분이 가로보다 클 때만 동작한다. 최소 드래그 20, 실제 이동 80 초과 또는 예상 이동 140 초과면 닫힌다 (:120-136, :141-143)
- **[AND] 내용 보존**: `SavedStateHandle`(`feedback_content`)로 프로세스가 죽어도 입력을 지킨다 (`FeedbackViewModel.kt:29`, :101)

**[차이]** iOS는 모달 + 쓸어 닫기 + 키보드 상태에 따른 스크롤 제어가 있다. Android는 라벨 표시, 탭으로 키보드 닫기, 상태 보존이 있다. 글자 수 세는 기준이 다르다(iOS 유니코드 스칼라는 서버와 같은 기준이라고 주석에 적혀 있다, `ChalkakTextField.swift:5-11`). → **iOS가 더 정교하다.** 특히 서버와 길이 기준을 맞춘 점이 중요하다. Android의 grapheme 기준은 이모지 등에서 서버 검증과 어긋날 수 있다(백엔드 확인 필요).

---

## 6. 화면 전환 (내비게이션)

### 6.1 iOS

| 전환 | 방식 | 수치 | 근거 |
|---|---|---|---|
| 로그인 ↔ 메인 등 루트 교체 | `.animation(.default, value: route)` 크로스페이드 | 시스템 기본 | `iOS:ContentView.swift:218` |
| 알림함 / 알림 상세 / 알림→피드 | `NavigationStack(path:)` push/pop, `withAnimation` 기본 | 시스템 push(오른쪽에서 밀려 들어옴) | :93-140, :337-344, :768-798 |
| 스와이프 뒤로 | 시스템 바를 숨겨도 `InteractivePopGestureEnabler`로 가장자리 스와이프를 켠다. 스택이 2개 이상이고 진행 중인 전환이 없을 때만 | — | `iOS:Core/Navigation/InteractivePopGestureEnabler.swift:42-89` |
| 탭 → 피드(기록 묶음 등) | push가 아니라 탭 화면 위 overlay. `.transition(.identity)` + 화면이 직접 하는 사진 확대 전환(`feedZoomSource`) | — | `iOS:ContentView.swift:141-158` |
| 피드백 · 사진 올리기 | `fullScreenCover`(아래에서 올라옴) | 시스템 | :219-259 |
| 약관 | `.sheet` + `presentationDetents([.large])` + 손잡이 숨김 | 시스템 | :260-264 |
| 서명 변경 | `fullScreenCover` | 시스템 | `SettingsScreen.swift:181` |
| 기록 월간↔연간 | matchedGeometry + spring(0.5, 0.86) | §2.7 | |
| 탭 바꿀 때 하단 바 펼치기 | `.smooth(duration: 0.75)` | 0.75초 | `iOS:ContentView.swift:302-307`, :463 |

### 6.2 Android

| 전환 | 방식 | 수치 | 근거 |
|---|---|---|---|
| 기본 enter / exit | Navigation Compose 기본(`fadeIn(tween(700))` / `fadeOut(tween(700))`). NavHost에서 덮어쓰지 않는다 | 700ms | `AND:navigation/ChalkakNavHost.kt:297-307` |
| pop enter / pop exit | `fadeIn`/`fadeOut(tween(d))`. 나가는 화면이 Feed면 d = 300, 그 밖은 700 | 300 / 700ms, 기본 FastOutSlowIn | :301-306, :1119-1123, `AND:core/designsystem/component/image/PhotoTransition.kt:181,186` |
| Feed 진입 | `enterTransition = fadeIn(tween(700))` + 공유 요소 사진 전환(300ms) | 700 / 300ms | :582-583, :636-637 |
| 알림 · 알림 상세 · 피드백 | 위 기본 페이드(슬라이드 없음). `launchSingleTop` | 700ms | :498-526, :813-822 |
| 약관 | 전체 화면 `Dialog`. 뒤 배경을 어둡게 하지 않는다(dim 0). 위 5% 띄운 카드, 폭 94% | — | §6.3 |
| 기록 월간↔연간 | `AnimatedContent(fadeIn togetherWith fadeOut)` | Compose 기본 spring | §2.7 |
| 시스템 뒤로 | 기록 연간 → 월간(`BackHandler`), 약관 WebView 뒤로 → 닫기 | — | `AND:RecordScreen.kt:193`, `AND:core/legal/LegalDocumentDialog.kt:44-51` |

**[차이]** iOS는 플랫폼 관습(push 슬라이드, 모달 상승, 시트)을 따르고 스와이프 뒤로를 보장한다. Android는 거의 모든 화면이 700ms 페이드다. 700ms는 일반 화면 전환에 긴 편이다. → **iOS가 더 정교하다.** 이식할 때 화면 전환 페이드를 쓴다면 일반 화면 300ms 안팎을 권한다(현재 Android 피드 pop이 300).

### 6.3 약관 문서 보기 (설정·온보딩 공통)

**[iOS] `LegalDocumentSheet`** — `iOS:Core/Legal/LegalDocumentSheet.swift`

- `.sheet`, large 높이, 손잡이 숨김. 배경 `colors.surfaceElevated` (:53, `ContentView.swift:260-264`)
- 맨 위 줄: 오른쪽에 `ChalkakNavigationButton(.close, .regular)`. 좌우 `spacing.lg`, 위아래 `spacing.md` (:20-29)
- 구분선 1 `colors.border` (:31-33)
- WebView. 외부 링크는 `openURL`로 연다 (:36-41)
- 로딩: `surfaceElevated` 면 + 가운데 `ProgressView`(tint `actionPrimary`, 라벨 `문서 불러오는 중`) (:57-64)
- 실패: 가운데 VStack(간격 `spacing.sm`, 여백 `spacing.xl`): `문서를 불러오지 못했어요`(`callout`, `textMuted`) + `다시 시도` 버튼(`callout`, `textPrimary`) (:66-83)

**[AND] `LegalDocumentDialog`** — `AND:core/legal/LegalDocumentDialog.kt`, `LegalDocumentDialogContent.kt`, `LegalDocumentCard.kt`

- `Dialog(usePlatformDefaultWidth = false)`, 창 dim 0 (`LegalDocumentDialog.kt:53-60`)
- 카드: 위 여백 = 화면 높이 × 5%, 폭 94%, 아래까지 채움. `shapes.sheet`(28) 모든 모서리, `colors.surfaceElevated` (`LegalDocumentDialogContent.kt:42-51`, `LegalDocumentCard.kt:42-43`)
- 맨 위 줄: 오른쪽 `IconButton` + `RES:drawable/ic_close`, tint `colors.textSecondary`, 오른쪽 여백 `spacing.sm`, 라벨 `닫기` (`LegalDocumentCard.kt:46-60`)
- `HorizontalDivider(colors.border)` (:62)
- 로딩: 가운데 `CircularProgressIndicator(actionPrimary)` (:88-96)
- 실패: 여백 `spacing.xl`, `문서를 불러오지 못했어요`(`callout`, **`textNeutral`**) + `spacing.sm` + `TextButton("다시 시도")`(`callout`, `textPrimary`) (:100-128)
- 문서를 열 수 없으면 토스트 `문서를 열 수 없어요` (`ChalkakNavHost.kt:169`)

**[차이]** 구조는 같다. iOS는 시스템 시트라 쓸어 닫기가 된다. Android는 dim 없는 다이얼로그 카드다. → **iOS가 조금 더 자연스럽다.**

---

## 7. 공통 상태 패턴 요약 (이 범위)

### 7.1 로딩

| 화면 | iOS | Android |
|---|---|---|
| 기록 | 표시 없음(자리표시 면) | 표시 없음 |
| 알림함 | 스피너 + `알림을 불러오는 중이에요` | 스피너 |
| 알림 상세 | 스피너 | 스피너 |
| 설정 | 빈 자리 56 | 빈 자리 56 |
| 약관 | 스피너(`actionPrimary`) | 스피너(`actionPrimary`) |
| 이미지 칸 | 지연 스켈레톤(0.5 / 0.25 / 0.2, shimmer 1.2s) | Coil placeholder |

### 7.2 빈 상태

- 알림함만 정식 빈 상태가 있다(§3.1.4). 기록의 빈 달은 빈 프레임과 `이날은 사진이 없어요`로 표현한다(§2.9).

### 7.3 에러와 재시도 (문구 원문)

| 위치 | 문구 | 재시도 UI |
|---|---|---|
| 기록 | `기록을 불러오지 못했어요` / `조회할 수 없는 연월이에요` / `로그인이 필요해요` | 텍스트 `다시 시도` / `로그인 하기` (`actionPrimary`) |
| 알림함 [iOS] | `알림을 불러오지 못했어요` | 원형 48 `arrow.clockwise` |
| 알림함 [AND] | 서버 사유별 문구(§3.1.4) | 텍스트 `다시 시도` |
| 알림 상세 [iOS] | `알림을 불러오지 못했어요` / `더 이상 확인할 수 없는 알림이에요` | 아웃라인 버튼 `다시 시도` |
| 알림 상세 [AND] | 서버 사유별 문구 | 텍스트 `다시 시도`, `알림함으로` |
| 푸시 설정 [iOS] | `알림 설정을 불러오지 못했어요. 다시 시도해 주세요.` | 카드 안 밑줄 `다시 시도` |
| 약관 | `문서를 불러오지 못했어요` | `다시 시도` |
| 버전 확인 실패 [AND] | 제목 `업데이트를 확인할 수 없어요`(`title3`) + `네트워크 연결을 확인한 후 다시 시도해 주세요.`(`callout`, `textSecondary`, 위 `spacing.sm`) | `ChalkakButton("다시 시도")` 전체 폭, 위 `spacing.xl` (`AND:feature/versiongate/VersionGateScreen.kt:99-133`) |
| 강제 업데이트 [AND] | `업데이트가 필요해요` / `안정적인 서비스 이용을 위해 최신 버전으로 업데이트해 주세요.` | `ChalkakButton("업데이트")` (:136-167) |
| 강제 업데이트 [iOS] | 시스템 alert(§1.2) | `업데이트` |

### 7.4 네트워크 오류 표시

- 전용 오프라인 배너는 없다. 네트워크 실패는 화면별 문구 `네트워크 연결을 확인해 주세요.`로 보인다.
  - Android 알림: `AND:NotificationViewModel.kt:254`, `NotificationDetailViewModel.kt:75`
  - iOS 다른 화면: `iOS:Features/Today/TodayViewState.swift:41` 등
- Android는 버전 게이트만 연결 상태를 지켜본다. 앱 시작 때 버전 확인이 네트워크 문제로 실패하면 `VersionCheckFailureScreen`이 화면 전체를 덮는다. 이미 통과한 뒤라면 콘텐츠 위에 덮는다(`AND:feature/versiongate/VersionGateScreen.kt:40-66`). 확인 중에는 `colors.background` 빈 화면이다(:89-96).

### 7.5 게스트 차단 토스트 (원문)

| 위치 | 문구 | 근거 |
|---|---|---|
| 알림 | `로그인 후 알림을 확인할 수 있어요` | `iOS:ContentView.swift:537` |
| 기록 | `기록을 보려면 로그인이 필요해요` | `iOS:ContentView.swift:559` / `AND:ChalkakNavHost.kt:1090` |
| 피드백 | `피드백을 보내려면 로그인이 필요해요` | `iOS:ContentView.swift:891` / `AND:ChalkakNavHost.kt:1091` |
| 알림 권한 요청 실패 [iOS] | `알림 권한을 요청하지 못했어요. 기기 설정에서 확인해 주세요.` | `iOS:ContentView.swift:375,409` |
| 첫 알림 설정 저장 실패 [iOS] | `알림 설정을 저장하지 못했어요. 앱 설정에서 다시 시도해 주세요.` | `iOS:ContentView.swift:394` |

---

## 8. 플랫폼 비교 총평 (이 범위)

| 영역 | 더 정교한 쪽 | 이유 |
|---|---|---|
| 토스트 | iOS | 토큰 캡슐, 위치·시간·전환 지정. Android는 OS Toast |
| 확인 다이얼로그 | 시각은 Android, 문구는 iOS | Android 커스텀 카드 / iOS 결과 설명 문구 |
| 상단 바와 내비 버튼 | iOS | 공통 48 원형 + glass. Android는 화면마다 크기가 다르다 |
| 스위치 | 색은 iOS, 터치는 Android | |
| 기록 달력과 주 lift | iOS | 모션 줄이기 대응, 그림자 수치 지정 |
| 기둥과 눈금자 | 같은 수준 | 수치 동일 |
| 책자(넘김·그림자) | iOS | 책상 그림자 블러, 사영 원근, VoiceOver. 전환 겹침 방지는 Android |
| 연간 전환 | iOS | matchedGeometry 확대 |
| 알림함·상세 | iOS(시각), Android(상세 기능) | |
| 설정 | iOS | 점선 서명란, 카드 안 재시도, 진행 중 흐림 |
| 피드백 | iOS | 서버와 같은 길이 기준, 쓸어 닫기 |
| 화면 전환 | iOS | 플랫폼 관습. Android는 700ms 페이드 일괄 |
