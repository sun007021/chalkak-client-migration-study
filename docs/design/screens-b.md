# 찰캌 화면 UI 스펙 B — 전시 · 피드 · 좋아요 · 업로드 · 편집 · AI 리뷰

원본 iOS(SwiftUI, 배포 앱)와 Android(Compose)를 화면별로 읽고 정리했다. 코드를 바꾸지 않고 읽기만 했다.

## 0. 읽는 법

**경로 약어**
- `iOS:` = `client/iOS/chalkak/chalkak/`
- `AND:` = `client/android/app/src/main/java/com/stonefive/chalkak/`
- `RES:` = `client/android/app/src/main/res/drawable/`
- 근거는 `파일:줄` 형식이다. 예: `iOS:Features/Display/DisplayScreen.swift:95`

**토큰 표기**
- 토큰 이름으로 적는다(`colors.textSecondary`, `typography.headline`, `spacing.lg(16)`, `shapes.photoCard(12)`).
- 토큰에 없는 값은 숫자로 적는다(pt/dp, 초, ms).
- 참고용 토큰 값은 다음과 같다(iOS·Android 동일).
  - spacing: xs 4, sm 8, md 12, lg 16, xl 24, xxl 40, screenHorizontal 25
  - shapes: small 7, button 12, input 14, photoCard 12, large 16, xlarge 18, sheet 28, pill(캡슐)
- 이 범위에서 플랫폼 차이가 큰 토큰은 다음과 같다.
  - iOS 편집기 색은 `editorBackground`(검정), `editorControl`(#1C1C1E), `editorAccent`(#FFD60A), `textOnEditor`(흰색), `textOnEditorMuted`(흰색 0.6)다. "임시 색"이라는 주석이 달려 있다(`iOS:DesignSystem/Foundation/ChalkakColor.swift:117-122`).
  - Android 편집기 색은 `photoEditBackground`(#141312), `photoEditContent`(흰색), `photoEditContentMuted`(흰색 0.56), `photoEditScrim`(#141312 0.62)이다(`AND:core/designsystem/theme/Color.kt:21,84-87`).
  - Android에만 있는 색 토큰: `textNeutral`(#6B7280), `actionSecondary`(#808080), `destructive`(#FF5A5F), `divider`(#757575). 상수 `ChalkakPhotoActionText`(#7D7D7D)도 Android에만 있다(`Color.kt:11-18`).
  - iOS에만 있는 색 토큰: `skeletonBase`(#EAE7DE), `skeletonHighlight`(#F7F6F3)(`ChalkakColor.swift:115-116`). Android에는 스켈레톤 컴포넌트가 없다.

**의견 표기**: 플랫폼별 구현을 비교한 의견은 ▶ 표시 뒤에 적는다.

---

## 1. 공통 컴포넌트

### 1.1 정렬 선택기 (ChalkakSortSelector)

**iOS** — `iOS:DesignSystem/Components/Sort/ChalkakSortSelector.swift`
- 구조: `HStack(spacing: spacing.lg(16))` 안에 옵션 버튼을 나란히 둔다(:11). 좌우 여백은 호출부가 정한다(전시 화면은 콘텐츠 패딩 25).
- 항목 텍스트: `typography.subheadline`. 선택되면 `colors.textPrimary`, 아니면 `colors.textInactive`(:25-28).
- 선택 표시: 텍스트 아래 `padding(.bottom, spacing.xs(4))`, 바닥에 높이 1의 `textPrimary` 사각형을 overlay로 그린다(:29-36, :46).
- 터치: `minHeight 44`(:37, :47), `buttonStyle(.plain)`이라 눌림 효과가 없다.
- 접근성: 선택된 항목에 `accessibilityValue "선택됨"`(:41).
- 애니메이션 없음. 선택하면 밑줄이 바로 옮겨진다.

**Android** — `AND:core/designsystem/component/sort/ChalkakSortSelector.kt`
- 구조: `Row(selectableGroup, padding(horizontal = screenHorizontal(25)), spacedBy(spacing.lg))`(:31-35). 좌우 패딩이 컴포넌트 안에 있다.
- 항목: `selectable(role = RadioButton, indication = null)` + `padding(top = 12, bottom = 22)`(:60-68).
- 텍스트: `typography.subheadline`. 선택되면 `textPrimary`, 아니면 `textInactive`(:54-58).
- 밑줄: `drawBehind`로 그린다. 두께 1dp이고, 텍스트 바닥에서 4.5dp 아래(선 중심 기준 +0.5)에 놓인다(:74-84).
- 문구: `"최신순" / "인기순" / "랜덤순"`(`AND:feature/display/component/DisplaySortTabs.kt:25-30`, iOS `DisplayScreen.swift:317-327`).

▶ 시각 결과(밑줄 위치·여백)는 iOS 주석이 Android 12dp를 맞췄다고 밝힌 대로 거의 같다(`DisplayScreen.swift:189-190`). 의미 전달은 Android가 낫다. 라디오 그룹 semantics가 있고, 터치 영역이 텍스트 위아래 34dp까지 넓다. iOS는 44pt 최소 높이만 보장한다.

### 1.2 피커 시트 (ChalkakPickerSheet / ChalkakPickerBottomSheet)

**iOS** — `iOS:DesignSystem/Components/Picker/ChalkakPickerSheet.swift`
- `.sheet` 안에 넣는다. `presentationDetents([.height(340)])`, `presentationDragIndicator(.visible)`(:24-25, :63)를 쓴다.
- 레이아웃: `VStack(spacing 0)` → header → wheels(`padding(.horizontal, spacing.lg)`)(:17-21). 위 패딩은 20(:23, :64)이다.
- 헤더(ZStack, 높이 52, 좌우 `spacing.lg`)(:37-58, :65)
  - 가운데 제목: `typography.headline`, `textPrimary`, header trait.
  - 오른쪽 확인 버튼: 문구 `"완료"`, `typography.headline`, `textPrimary`. 크기는 `minWidth/minHeight 44`(:12, :46-50, :66).
- 배경: 리퀴드 글라스(iOS 26)면 시스템 배경을 쓴다. 아니면 `colors.surfaceElevated`, 모서리 `shapes.sheet(28)`(:27-34).
- 동작
  - 휠을 굴리는 동안의 값은 호출부가 임시로 들고 있다.
  - "완료"를 누를 때만 `onConfirm`을 부른다.
  - 아래로 쓸어내려 닫으면 확정하지 않는다(:7-8).

**Android** — `AND:core/designsystem/component/picker/ChalkakPickerBottomSheet.kt`
- `ModalBottomSheet(skipPartiallyExpanded = true)`를 쓴다. `sheetMaxWidth = Unspecified`로 전체 폭이다(:41-48).
- 모양: `shapes.sheet(28)`이고 아래 두 모서리는 0이다(:49-50). 배경은 `surfaceElevated`(:51), 손잡이는 Material 기본이다.
- 내용 패딩: start/end `spacing.xl(24)`, top `spacing.sm(8)`, bottom `spacing.xl`(:64-71).
- 위→아래 `Column(spacedBy spacing.lg)`(:84-105)
  1. 제목: `typography.title3`, `textPrimary`, **왼쪽 정렬**.
  2. 휠 Row: `spacedBy(spacing.lg)`, 각 휠은 `weight(1f)`.
  3. 확인 버튼: `ChalkakButton` 전체 폭, 문구 `"확인"`(:38), `padding(top = spacing.sm)`.
- 동작: 확인을 누르면 `sheetState.hide()` 애니메이션을 끝낸 뒤 `onConfirm`을 부른다(:56-61). 바깥 탭이나 드래그로 닫으면 `onDismiss`만 부른다.

▶ **확인 문구가 다르다**("완료" ↔ "확인"). 배치도 다르다(헤더 우측 텍스트 ↔ 하단 큰 버튼). iOS는 시스템 날짜 휠의 관례를 따랐다. Android는 휠·햅틱·탭 이동을 직접 구현해서 더 정교하다(1.3절).

### 1.3 휠 피커 (ChalkakWheelPicker)

**iOS** — `iOS:DesignSystem/Components/Picker/ChalkakWheelPicker.swift`
- `UIPickerView` 하나에 열 여러 개를 넣는다. 그래서 선택 띠가 열을 가로질러 하나로 이어진다(:12-21, :28-35).
- 높이는 시스템 고유값 216pt다(:17). 폭은 호출부가 정한다. 글꼴·색은 시스템 기본이다(토큰 미적용).
- 바깥에서 선택값이 바뀌면 `selectRow(animated: false)`로 제자리에서 바꾼다(:45, :48-56).
- VoiceOver는 열마다 `accessibilityLabel`과 현재 값을 읽는다(:82-84).

**Android** — `AND:core/designsystem/component/picker/ChalkakWheelPicker.kt`
- 수치: 항목 높이 44dp, 보이는 개수 5, 휠 높이 220dp(:50-53, :115). 위아래 contentPadding은 88dp다(:146).
- 선택 띠: 가운데 칸 위·아래에 두께 1dp, `colors.border` 색의 구분선 두 줄(:136-139, :169-177).
- 거리별 스타일(:179-195)
  - 0칸: `typography.title3` / `textPrimary`
  - 1칸: `typography.body` / `textMuted`
  - 2칸 이상: `typography.callout` / `textPrimary` alpha 0.22
- 인터랙션
  - 스냅 플링(`SnapPosition.Center`)(:142-145).
  - 스크롤이 멈출 때만 값을 확정한다(:89-97).
  - 칸을 넘을 때마다 `SegmentFrequentTick` 햅틱을 낸다(:98-106).
  - 항목을 탭하면 `animateScrollToItem`으로 가운데로 굴러온다(:160-162).
  - 목록이 바뀌면 새 선택 위치에서 바로 그린다. 깜빡임을 막으려는 처리다(:77-79).
- 접근성: `progressBarRangeInfo` + `setProgress`로 위아래 스와이프 시 한 칸씩 바뀐다(:116-134).

▶ Android가 더 정교하다(햅틱·탭 이동·거리별 타이포를 토큰으로 처리). iOS는 시스템 휠이라 접근성·관성이 OS 수준으로 안정적이지만 앱 타이포를 따르지 않는다.

### 1.4 전시 날짜 피커 시트 (DisplayDatePickerSheet)

- 제목: `"날짜 선택"`. 열은 년·월·일 세 개이고 라벨 형식은 `"{n}년" / "{n}월" / "{n}일"`이다. 접근성 라벨은 `"연도" / "월" / "일"`.
  - iOS `iOS:Features/Display/Components/DisplayDatePickerSheet.swift:24-36`
  - Android `AND:feature/display/component/DisplayDatePickerSheet.kt:36-66`
- 범위: `startDate`(첫 주제일)부터 `endDate`(최신 주제일, 오늘)까지만 넣는다. 고를 수 없는 값은 목록에 넣지 않는다.
- 보정(clamp) 규칙
  - 년·월을 바꿔 일이 범위를 벗어나면 가장 가까운 날로 맞춘다. 그 달에 없는 날은 말일로, 범위 밖은 start/end로 당긴다(iOS :77-83, Android :95-106).
  - 예: 10월 22일에서 9월로 바꾸면 9월 22일이 된다.
- 확정: iOS는 헤더 `"완료"`로, Android는 하단 `"확인"` 버튼으로 확정한다. 확정하면 시트를 닫고 `moveToDate`/`onDatePicked`를 부른다(iOS `DisplayScreen.swift:74-81`, Android `DisplayScreen.kt:304-315`).
- 열 수 있는 조건: 로딩이 아니고 `selectedDate`와 `latestDate`가 모두 있을 때(iOS `DisplayViewState.swift:101-103`).

### 1.5 이미지 / 서명 이미지 로딩·플레이스홀더

**iOS ChalkakImage** — `iOS:DesignSystem/Components/Image/ChalkakImage.swift`
- 소스 종류: `.asset(name)`, `.system(SF)`, `.remote(URL?)`(:5-9).
- 캐시
  - 원격 이미지는 `RemoteImageCache`에 보관한다. 한도는 64MB이고, 기본 디코딩 최대 폭은 1,320px다(:46).
  - 이미 받은 이미지는 첫 프레임부터 그린다(:276-281).
- 상태별 표시
  - 로딩: `Color.clear` 위에 `loadingSkeleton`을 올린다(:286-288, :305).
  - URL이 nil: 고정 플레이스홀더. 배경 `colors.inputBackground` + SF `photo` 24pt, `iconSecondary`(:290-292, :329-337, :351).
  - 실패: 같은 플레이스홀더에 SF `photo.badge.exclamationmark`(:302-303).
- 썸네일: `thumbnailSource`가 있으면 원본이 뜰 때까지 썸네일을 아래에 깔고 스켈레톤은 끈다(:194-211).
- `.system` 소스는 `iconSecondary`로 칠한다(:236-240).

**iOS 스켈레톤** — `iOS:DesignSystem/Components/Skeleton/ChalkakSkeleton.swift`
- 모양: 부모 프레임을 채우는 `skeletonBase` 면 위에 shimmer를 덧입힌다. 모서리는 호출부가 자른다(:7-15).
- shimmer
  - `LinearGradient([clear, skeletonHighlight, clear])` 밴드를 쓴다. 밴드 폭은 뷰 폭 × 0.6이다.
  - x 위치를 −밴드폭에서 +폭까지 옮긴다. `linear(1.2s).repeatForever(autoreverses: false)`(:78-104, :107-108).
- 지연·최소 표시 규칙
  - 응답이 0.5s 안에 오면 스켈레톤을 띄우지 않는다.
  - 한 번 뜨면 최소 0.25s 유지한다.
  - 나타나고 사라질 때 `easeOut 0.2s` opacity를 쓴다(:50-65, :111-114).

**Android ChalkakImage** — `AND:core/designsystem/component/image/ChalkakImage.kt`
- Coil `AsyncImage` 래퍼다. `placeholder`·`error` Painter는 호출부가 넘긴다. 전시·피드는 넘기지 않아서 로딩 중에는 카드 배경(검정)만 보인다.
- `thumbnailModel`이 있으면 그 painter를 placeholder로 쓴다(:53-61).
- `loadedPainter`가 있으면 로드 없이 바로 그린다(:39-49). 공유 전환 스냅샷에 쓴다.
- 기본 `contentScale`은 Crop이다(:33).

**서명 합성 이미지 (ChalkakSignedImage)**
- 사진 위 우하단에 서명을 `spacing.sm(8)` 안쪽으로 얹는다. 기본 크기는 56×42이고, 서명은 `.fit`이다.
  - iOS `ChalkakSignedImage.swift:18-40, :45`
  - Android `ChalkakSignedImage.kt:28-31, :61-73`
- 화면별 서명 크기

| 화면 | 서명 크기 | 근거 |
|---|---|---|
| 전시 그리드 | 40×30 | iOS `DisplayPhotoGrid.swift:233`, Android `DisplayPhotoCard.kt:147-150` |
| 전시 대표(featured) | 48×36 | iOS `DisplayFeaturedCarousel.swift:199`, Android 동일 |
| 피드 | 70×52 | iOS `FeedPhoto.swift:502`, Android `FeedPhoto.kt:348-349` |

▶ 로딩 UX는 iOS가 확실히 정교하다(지연 표시 스켈레톤, 실패·nil 플레이스홀더). Android는 이 범위에 스켈레톤·에러 플레이스홀더가 없다. 그래서 실패한 이미지가 검은 빈 카드로 남는다.

### 1.6 다이얼로그

**Android ChalkakConfirmDialog** — `AND:core/designsystem/component/dialog/ChalkakConfirmDialog.kt`
- 컨테이너: `Dialog(usePlatformDefaultWidth = false)` → `Surface(shapes.large(16), surfaceElevated)`(:42-50). 폭은 호출부가 정한다(피드·업로드 `fillMaxWidth(0.81f)`).
- 패딩: 좌우 40, 위 24, 아래 26(:168-170). 내용은 가운데 정렬이다.
- 위→아래
  1. 제목: `typography.title3`, `textPrimary`
  2. 간격 8
  3. 메시지: `typography.callout`, `colors.textNeutral`
  4. 간격 23
  5. 버튼 Row: `spacedBy(10)`(:60-103, :171-173)
- 버튼: 두 개 모두 `weight(1f)`, `shapes.button(12)`, 세로 패딩 9.5, 글꼴 `typography.callout`(:109-134, :174).
  - 취소: 문구 `"취소"`, `actionSecondary` 바탕 / `onActionSecondary` 글자.
  - 확인: PRIMARY면 `actionPrimary`, DESTRUCTIVE면 `destructive`. 글자는 `onActionPrimary`.

**iOS**
- 같은 용도에 시스템 `.alert`를 쓴다(피드 삭제·제목 수정, 업로드 이탈, 카메라 권한, 편집 실패, AI 점수 기준). 커스텀 다이얼로그 컴포넌트가 없다.

**토스트**
- iOS `ChalkakToast`(`iOS:DesignSystem/Components/Toast/ChalkakToast.swift`)
  - 모양: `Capsule` 배경 `actionPrimary`, 글자 `subheadline`/`onActionPrimary`. 패딩 좌우 `spacing.lg`, 위아래 `spacing.md`(:19-25).
  - 위치: 화면 아래 32, 좌우 `screenHorizontal`(:39-40, :89).
  - 전환: `.move(edge: .bottom) + .opacity`, `withAnimation(.snappy)`(:41, :70). 2.5s 뒤 사라진다(:59).
- Android
  - `UiMessageEffect`가 시스템 `Toast.LENGTH_SHORT`를 띄운다. 일부(피드)는 `Snackbar`를 쓴다(`AND:core/ui/UiMessage.kt:27-48`).

▶ 다이얼로그는 Android가 브랜드 토큰을 적용해 더 정교하다. 토스트는 iOS가 브랜드 컴포넌트다. 새 구현에서는 다이얼로그와 토스트를 각각 하나의 컴포넌트로 합치는 것을 권한다.

---

## 2. 전시 (Display)

진입 파일
- iOS `iOS:Features/Display/DisplayScreen.swift`
- Android `AND:feature/display/DisplayScreen.kt`, `DisplayContent.kt`

### 2.1 레이아웃 (위→아래)

**iOS** — `VStack(spacing 0)`, 배경 `colors.background`(:50-55)
1. **날짜 헤더**(고정, 스크롤 밖) `DisplayDateHeader`
   - 좌우 `screenHorizontal(25)`, 높이 52(:85-97, `DisplayDateHeader.swift:96`).
   - `HStack(spacing 0)`: ‹ 버튼, 날짜 제목, › 버튼, Spacer(`DisplayDateHeader.swift:14-34`).
   - 셰브런을 콘텐츠 가장자리에 맞추려고 leading −13 보정을 한다(:33, :100).
   - ‹ / ›: SF `chevron.left` / `chevron.right`, 16pt medium, 44×44 터치(:59-77, :97-98).
     - 활성: `iconSecondary`, 비활성: `textInactive`.
     - 접근성 라벨: `"이전 날짜 전시"` / `"다음 날짜 전시"`.
   - 날짜 제목: `"M월 d일"`(ko_KR, Asia/Seoul), `typography.headline`, `textPrimary`, 1줄(:40-44, :85-93).
     - 피커를 열 수 있으면 버튼이 된다(minHeight 44). 접근성 힌트는 `"눌러서 날짜를 선택해요"`(:46-56).
2. **스크롤 영역** `ScrollView` → `VStack(spacing 0)`. 좌우 `screenHorizontal`, 아래 `spacing.xxl(40)`(:154-231).
   1. **주제 헤더** `DisplayTopic`(:99-114)
      - 패딩: 위 15, 아래 24, 좌우 25. 바닥에 `colors.border` 0.5 구분선(:306-309). 좌우 −25로 화면 끝까지 편다(:157).
      - 주제: `typography.title2` / `textPrimary`.
      - 설명: `typography.subheadline` / `textInactive`. 주제와 설명 사이 12(`DisplayTopic.swift:9-27`).
      - 설명 문구: 과거 날짜는 `"가장 사람들이 좋아했던 사진들이에요"`, 그 외는 `"같은 주제에서 다른 시선을 느껴보세요"`(:267-274).
   2. **과거 날짜면** 대표 사진 캐러셀(2.3절). 위 15, 아래 8, 좌우 −25(:159-186, :312-313).
   3. **최신 날짜면** 정렬 선택기. 왼쪽 정렬, 구분선 바로 아래(:188-198).
   4. **그리드** `DisplayPhotoGrid`. 위 간격은 정렬 아래 11, 대표 사진 아래 4(:203-226, :244-248, :311-314).
3. 하단 탭바: `chalkakBottomBarScrollBehavior`로 스크롤에 따라 compact가 된다(:239).

**Android** — 겹침(Box) 구조. 접히는 헤더(`DisplayScreen.kt:187-301`)
- 맨 아래 레이어 `DisplayBody`: 그리드가 전체를 채우고, 위 contentPadding은 지금 보이는 헤더 높이를 따라간다(:148-150, :193-213).
- 위 레이어(TopCenter Column, `photoTransitionChrome`)
  1. 상태바 높이 Spacer. 배경 `ChalkakBackground` alpha 0.86(`COLLAPSING_FLOATING_BACKGROUND_ALPHA`)(:220-227, `CollapsingScroll.kt:10`).
  2. 접히는 헤더(`collapsingArea(headerOffset)`): `DisplayDateHeader`. 과거 날짜면 아래 Spacer 15(:228-257).
  3. 최신 날짜만, 접히는 필터: 배경 alpha 0.86, `DisplaySortTabs`(:259-276).
- `DisplayDateHeader`(Android는 날짜와 주제가 한 컴포넌트) — `AND:feature/display/component/DisplayDateHeader.kt`
  - 패딩: 위 20, 오른쪽 25, 아래 24. 바닥에 #E8E6E1 0.5dp 선(:47-54, :137-145).
  - 날짜 Row(start 8)(:56-88)
    - `IconButton` 두 개. 아이콘은 `RES:ic_display_arrow_left` / `ic_display_arrow_right`, 24dp.
    - 아이콘 색: `iconPrimary`, 비활성이면 alpha 0.35(:115-135).
    - 접근성: `"이전 날짜"` / `"다음 날짜"`.
    - 날짜 텍스트: `headline`, `minimumInteractiveComponentSize`, `clickable(onClickLabel "날짜 선택")`.
  - 날짜 아래 Spacer 15 → 주제 `title2`(start 25)(:90-97).
  - 설명: 하드코딩 #8C8479(= bottomBar 색), `subheadline`, start 19 / top 12(:99-111).
- 맨 위로 버튼 `ChalkakScrollToTopButton`(Android만)(:278-291)
  - 44dp 원, 흰색, shadowElevation 12.
  - 아이콘: `Icons.Default.ArrowBack`을 90° 돌려 24dp, `iconPrimary`. 접근성 `"맨 위로"`.
  - 위치: end 24, bottom = 하단바 높이 + 18(`ChalkakScrollToTopButton.kt:24-41`).

▶ 구조가 크게 다르다.
- Android: 날짜·주제 헤더가 스크롤에 따라 접히고, 필터가 반투명으로 떠 있다. 맨 위로 버튼도 있다.
- iOS: 날짜 헤더는 고정이고, 주제는 콘텐츠와 함께 스크롤된다.
- 정보 밀도와 스크롤 경험은 Android가 더 정교하다.
- 색은 iOS가 토큰을 지켰다(설명 `textInactive`, 구분선 `border`). Android는 하드코딩 두 개(#8C8479, #E8E6E1)가 있다.

### 2.2 메이슨리 그리드 / 사진 카드

**iOS** — `iOS:Features/Display/Components/DisplayPhotoGrid.swift`
- 2열 그리디 패킹: 항상 짧은 열에 다음 사진을 넣는다.
  - 열 높이 추정 = (세로/가로 비율, 모르면 4/3) + 0.06(:68-88, :230-232).
  - i번째 사진의 열은 앞 사진들의 비율에만 의존한다. 그래서 위에서 아래로 로드되는 동안 재배치가 눈에 띄지 않는다.
- 간격: 열 사이·카드 사이 모두 `spacing.md(12)`(:23-25, :42). 좌우는 상위 패딩 25.
- 다음 페이지
  - 카드가 끝에서 4장 안에 나타나면 끝 신호를 보낸다(:59-61, :229).
  - 로딩 중이면 아래에 `ProgressView`(tint `actionPrimary`, top `spacing.md`)(:30-36).
- 카드 등장: `.transition(.opacity + .scale(0.98))`, 목록 변화에 `easeInOut 0.2s`(:58, :65).
- **카드** `DisplayMasonryCell`(:111-166)
  - 바탕: `Color.black`. `aspectRatio(가로/세로)`는 측정 전 기본 3:4(세로/가로 4/3)(:113-117).
  - 사진: `ChalkakSignedImage`(썸네일·서명 썸네일, `.fill`, 서명 40×30)(:118-133).
  - `clipShape(RoundedRectangle(shapes.photoCard(12)))`(:135).
  - 눌림 효과 없이 탭만 받는다. `feedZoomSource(cornerRadius: photoCard)`로 피드 전환의 출발 뷰가 된다(:137-143).
  - 접근성 힌트: `"피드 열기"`.
  - 비율은 썸네일을 받은 뒤 `ImageRatioLoader`로 한 번 측정한다(:160-165).
- **좋아요 배지** `DisplayLikeBadge`(좌하단 overlay)(:174-226)
  - 내용: 하트(`ic_heart_filled` / `ic_heart`, template, 18×18) + 숫자(`typography.subheadline`). 간격 4. 색 `colors.textOnImage`.
  - 그림자: black 0.25, radius 2, y 1.
  - 터치 영역
    - 카드 모서리에서 하트까지 10을 버튼 영역에 포함한다(leading/bottom 10).
    - 위·오른쪽은 14만큼 넓힌다. 최소 44×44, bottomLeading 정렬. 숫자 한 자리일 때 약 55×44pt.
    - contentShape는 좌하단만 photoCard 반지름으로 깎는다. 카드 둥근 모서리 바깥이 눌리지 않게 하려는 처리다.
  - 비활성: 요청 중(`isLiking`)이면 `disabled`.
  - 피드 전환 중에는 배지를 숨긴다(opacity 0, 터치 차단)(:156-157).
  - 접근성: `"좋아요 {n}"`, 값은 `"선택됨"` / `"선택 안 됨"`.

**Android** — `AND:feature/display/component/DisplayPhotoGrid.kt`, `DisplayPhotoCard.kt`
- `LazyVerticalStaggeredGrid(Fixed(2))`(:58-70)

| 항목 | 최신 날짜 | 과거 날짜 |
|---|---|---|
| 좌우 contentPadding | 21 | 22 |
| 세로 간격(verticalItemSpacing) | 9 | 12 |
| 열 간격 | 12 | 12 |
| 위 padding | 헤더 높이 + 4 | 헤더 높이 + 4 |
| 아래 padding | 36 | 36 |

  - 과거 날짜 값: `DisplayContent.kt:147-148`.
- 대표 사진: 그리드 헤더 아이템(FullLine)으로 넣는다(:71-76).
- 끝 감지: 마지막 보이는 인덱스 ≥ 전체 − 3이면 신호(`END_THRESHOLD = 2`)(:122-129, :152).
- 다음 페이지 로딩: FullLine 아이템. `CircularProgressIndicator(actionPrimary)`, 패딩 `spacing.xl`(:104-118).
- 아이템 애니메이션: `animateItem(fadeIn tween 180, placement tween 240, 스크롤 중이면 null, fadeOut tween 120)`(:93-101).
- **카드**(GRID)(:109-151)
  - `clip(shapes.photoCard)` + 검정 배경 + `clickable(indication null)`.
  - 사진: `FillWidth`, `aspectRatio(측정값 ?: 1)`. 측정 전 기본은 **정사각**(:145, :261).
- **좋아요** `DisplayLikeCount`(:200-248)
  - 하트 18dp(`RES:ic_heart` / `ic_heart_filled`), tint `textOnImage`. 숫자 `subheadline Normal`. 간격 4.
  - 패딩: start/bottom 10, top/end 14. **그림자 없음**.
  - 접근성: 상태 `"좋아요 선택됨"` / `"좋아요 선택 안 됨"`.

▶ 둘의 차이와 평가
- 측정 전 기본 비율이 다르다(iOS 3:4, Android 1:1). iOS는 실제 비율에 가까운 기본값과 그리디 패킹 덕에 재배치가 덜 보인다.
- 좋아요 배지 그림자는 iOS에만 있다. 흰 사진 위 가독성은 iOS가 낫다.
- 페이징·아이템 애니메이션은 Android 쪽이 정밀하다(fade·placement 분리).

### 2.3 대표 사진 캐러셀 (과거 날짜)

**iOS** — `iOS:Features/Display/Components/DisplayFeaturedCarousel.swift`
- 컨테이너: `VStack(spacing: spacing.lg(16))` → 가로 `ScrollView` → `LazyHStack(spacing 5)`(:15-17, :193).
- 페이지: `containerRelativeFrame(.horizontal)`, `contentMargins(.horizontal, 32)`, 바깥 `padding(.horizontal, 22)`(:25, :36, :40, :195-196).
  - `scrollTargetBehavior(.viewAligned)`, 가운데 앵커. 스크롤바를 숨긴다.
  - 루프 없음(유한).
- 스크롤 전환: `.interactive`. 이웃 카드는 scale `1 − 0.08·|phase|`, opacity `1 − 0.12·|phase|`(:26-30, :197-198).
- 카드(:71-152)
  - `aspectRatio 3:4`, 검정 바탕, `clip(photoCard)`.
  - 사진: 원본 `.fit` + 썸네일을 먼저 깐다. 서명 48×36.
  - 제목: 하단 가운데, `typography.handwriting`, `textOnImage`, 1줄, 아래 10(:102-112).
  - 좌하단 좋아요 배지(2.2절과 같음).
  - 탭은 사진 fit 영역 안에서만 받는다(`acceptsTap`)(:116-120).
- 페이지 표시기 `DisplayPageIndicator`(:167-189, :201-204)
  - `HStack(spacing 8)`, Capsule.
  - 선택: 24×7 `actionPrimary`. 비선택: 7×7 `textMuted` × 0.45.
  - 애니메이션 없음.

**Android** — `AND:feature/display/component/DisplayFeaturedPager.kt`
- `HorizontalPager`(:78-107)
  - 페이지 폭 = 컨테이너 − 64, contentPadding 좌우 32, 간격 5.
  - 2장 이상이면 `Int.MAX_VALUE` 가상 페이지로 **무한 루프**, 가운데서 시작한다(:44-50).
  - 1장이면 스크롤하지 않는다.
- 같은 수치: scale `1 − offset·0.08`, alpha `1 − offset·0.12`(:98-103).
- 바깥에서 페이지를 바꾸면 가장 가까운 사이클로 `animateScrollToPage`(:58-71).
- 카드(FEATURED)
  - `aspectRatio(3/4)`, `ContentScale.Fit`, 원본 + 썸네일, 서명 48×36.
  - 제목: `handwriting` 하단 10, 1줄 Ellipsis(`DisplayPhotoCard.kt:162-173`).
  - 전환 모양: 카드 3:4 마스크를 fit 사진에 맞춘 `FittedPhotoCardShape`(`FittedPhotoCardShape.kt`).
- 표시기: 페이저와 표시기 사이 Spacer 18. 크기·색은 iOS와 같다(:109-148).
- 그리드 헤더 아래 8(`DisplayContent.kt:156-158`).

▶ 수치는 거의 일치한다. 무한 루프는 Android만 있다. 출발 프레임(fit 영역) 정밀도는 iOS가 더 신경 썼다(썸네일→원본 비율 전환, 탭 영역 제한). Android도 `FittedPhotoCardShape`로 같은 목표를 달성한다.

### 2.4 상태별 UI

| 상태 | iOS | Android |
|---|---|---|
| 로딩(첫 진입) | 화면 가운데 `ProgressView`(tint `actionPrimary`)(:119-124) | 위에서 64 떨어진 `CircularProgressIndicator(actionPrimary)`(`DisplayContent.kt:72-83`) |
| 이미지 로딩 | 카드마다 스켈레톤 shimmer(1.5절). 카드 비율 그대로 photoCard 모서리 | 검정 카드 배경만 |
| 다음 페이지 | 그리드 아래 `ProgressView` | FullLine `CircularProgressIndicator` |
| 빈 상태 | SF `photo.on.rectangle.angled` 34pt `iconSecondary` + `"이 날의 전시가 아직 없어요"`(`body`/`textSecondary`). 간격 `spacing.sm`, 위 96(:250-265, :304-305) | 가운데 정렬 `ChalkakEmptyPostContent`. 최신: `"아직 올라온 사진이 없어요"`(`body`/`textSecondary`) + `"첫 번째 사진을 올려보세요"`(`subheadline`/`textMuted`), 간격 8. 과거: `"이 날 올라온 사진이 없어요"`만(`DisplayContent.kt:96-100, :131-137`; `ChalkakEmptyPostContent.kt:16-45`) |
| 에러 | 가운데 메시지(`body`/`textSecondary`) + 간격 `spacing.xl` + 48pt 원형 새로고침 버튼(`actionPrimary` 원, SF `arrow.clockwise` 20 semibold `onActionPrimary`, 접근성 `"전시 새로고침"`)(:125-147, :302-303) | 메시지 + `TextButton "다시 시도"`(`body`/`actionPrimary`)(`DisplayContent.kt:168-193`) |
| 에러 문구 | `"해당 날짜의 전시가 없어요"`(404) / `"네트워크 연결을 확인해 주세요"` / `"전시를 불러오지 못했어요"`(`DisplayViewState.swift:24-31`) | `"전시를 불러오지 못했어요"`(`DisplayViewModel.kt:787`) |
| 게스트 | 별도 처리 없음. 좋아요 실패는 토스트 | 별도 처리 없음 |
| 좋아요 실패 | 토스트 `"좋아요를 변경하지 못했어요"`(:288-289) | 토스트 `"좋아요를 반영하지 못했어요"`(`DisplayViewModel.kt:788`) |

▶ 빈 상태 문구와 아이콘이 서로 다르다. 에러 처리는 iOS가 원인별 문구가 있어 낫다. 이미지 로딩도 iOS가 낫다(스켈레톤).

### 2.5 인터랙션·전환

**날짜 이동**
- ‹ / ›: 이전·다음 날짜를 불러온다.
  - 이전이 가능한 조건: 로딩이 아니고, `selectedDate > earliestDate`.
  - 다음이 가능한 조건: `selectedDate < latestDate`(iOS `DisplayViewState.swift:87-98`).
- 날짜를 바꾸거나 정렬을 바꾸면 Android는 같은 프레임에 헤더 상태를 초기화하고 0번으로 스크롤한다(`DisplayScreen.kt:156-169`).
- iOS는 별도 애니메이션 없이 내용을 바꾼다.

**맨 위로**
- iOS: 탭바 재탭 시 `withAnimation(.snappy) { scrollTo(edge: .top) }`(:234-238).
- Android: 12번째 아이템보다 아래면 먼저 12번으로 점프하고, 그다음 `animateScrollToItem(0)`(`DisplayScrollBehaviorState.kt:187-193`, :26).

**Android 접힘 헤더**(`DisplayScrollBehaviorState.kt`)
- 위로 스크롤하면 헤더가 먼저 접히고, 이어서 필터가 접힌다.
- 아래로 스크롤하면 필터가 먼저(pre-scroll), 헤더는 리스트가 끝까지 내려온 뒤(post-scroll) 펼쳐진다(:95-150).
- 플링이 끝나면 접힘/펼침 중 가까운 쪽으로 정착한다. 기본 spring `animate(0→1)`, 5% 이내면 원위치로 돌아간다(:209-241, `CollapsingScroll.kt:12, :24-36`).
- 맨 위로 버튼 표시: 누적 스크롤이 12dp 이상이면 보이고 −12dp 이하이면 숨긴다(`CollapsingScroll.kt:9, :49-66`).

**사진 탭 → 피드 줌 전환**: 4절 참고.

---

## 3. 좋아요

| 항목 | iOS | Android |
|---|---|---|
| 전시 카드 | **비낙관적**. 서버 응답을 받은 뒤 반영한다. 요청 중에는 그 카드 버튼을 `disabled`로 막는다. 응답을 전시 캐시 전체에 버전 순서로 반영한다(`DisplayViewModel.swift:256-296`) | **낙관적**. 즉시 ±1(최소 0)을 반영하고, 실패하면 되돌린다. 같은 사진의 중복 요청은 무시한다(`DisplayViewModel.kt:243-283`) |
| 피드 상세 | 낙관적 ±1. 직전 요청이 끝난 뒤 보내 직렬화한다. 최신 의도(generation)만 반영하고, 실패하면 롤백한다(`FeedViewModel.swift:182-214`) | 낙관적 ±1. generation으로 UI 롤백만 막는다. 서버 쓰기 순서는 보장하지 않는다는 TODO가 있다(`FeedViewModel.kt:219-249`) |
| 하트 아이콘 | `ic_heart` / `ic_heart_filled`(template). 전시 18pt, 피드 24pt | `RES:ic_heart` / `ic_heart_filled`. 전시 18dp, 피드 24dp |
| 피드 색 | 좋아요면 `actionPrimary`, 아니면 `textSecondary`. 숫자 `textSecondary`(`FeedPhoto.swift:455-467`) | 좋아요면 `actionPrimary`, 아니면 #7D7D7D(`ChalkakPhotoActionText`). 숫자 #7D7D7D(`FeedPhoto.kt:325-342`) |
| 하트 애니메이션 | **없음**. 아이콘을 바로 바꾼다. 더블탭 좋아요도 없다 | **없음** |
| 게스트 | 이 범위 화면에는 전용 안내가 없다. 오늘 화면만 `"로그인 후 좋아요를 누를 수 있어요"`(`iOS:Features/Today/TodayScreen.swift:52-53`, 범위 밖) | 이 범위에는 전용 안내가 없다 |
| 화면 간 동기화 | 피드 → 작가 목록 카드: `onLikeChange` / `externalLikeUpdate`(`FeedScreen.swift:236-241`) | ViewModel·저장소 단위 |

▶ 요청 정합성은 iOS 피드(직렬화)가 가장 견고하다. 즉시 반응은 Android 전시(낙관적)가 낫다. 둘 다 하트 애니메이션이 없다. 과제 설명에 있는 "좋아요 하트 애니메이션"은 원본 코드에 존재하지 않는다. 새로 넣으려면 디자인 결정이 먼저 필요하다.

---

## 4. 피드 / 게시물 상세 (Feed)

진입 파일
- iOS `iOS:Features/Feed/FeedScreen.swift`, `Components/FeedPhoto.swift`, `FeedZoomTransition.swift`
- Android `AND:feature/feed/FeedScreen.kt`, `component/FeedContent.kt`, `FeedPhoto.kt`, `core/designsystem/component/image/PhotoTransition.kt`

### 4.1 레이아웃 (위→아래)

**iOS** — `ZStack(alignment .top)`(:83-99)
- 배경 `colors.background`. 전환 중 안전 영역까지 직접 늘린다(:87-95).
- **상단 바**(overlay top) `FeedTopBar`(:100-120). 패딩 좌우 `spacing.lg(16)`, 위아래 `spacing.md(12)`.
  - 왼쪽: `ChalkakNavigationButton(.back)`, 48pt 원(SF `chevron.backward`, `iconPrimary`, iOS 26이면 glass)(`ChalkakNavigationButton.swift:19, :25-41`).
  - 오른쪽: `HStack(spacing.md)`(`FeedTopBar.swift:20-41`)
    - 수정: asset `ic_edit`, `actionPrimary`. 접근성 `"수정"`.
    - 삭제: asset `ic_delete`, `colors.error`. 접근성 `"삭제"`.
    - 아이콘은 24pt(리퀴드 글라스면 17pt, Dynamic Type), 48pt 원 버튼(:45-82).
  - 노출 조건
    - 수정: 내 게시물이고 주제 날짜가 오늘.
    - 삭제: 내 게시물.
    - 삭제 중·제목 저장 중에는 비활성(:108-115).
- **스크롤 콘텐츠**(:299-350)
  - 위 = 48 + 2×12 = 72, 아래 40(AI 버튼이 있으면 90)(:343-344, :687-690).
  1. `FeedTopic`: 좌우 25, 위 16, 아래 40(:303-307, :687-688).
     - 날짜 라벨 `"M월 d일의 주제"`: `subheadline` / `textPrimary`.
     - 주제: `typography.display` / `textPrimary`, 위 8(`FeedTopic.swift:8-24`, `FeedViewState.swift:199-211`).
     - **상세를 받기 전에도** `" "`로 높이를 유지한다. 사진 위치가 바뀌지 않게 하려는 처리다(:302-303).
  2. `FeedPhoto`(전체 폭)(:309-341)
     - 사진: 칸 비율 = 이미지 세로/가로(모르면 1). `.fill`.
     - 서명: 우하단 `spacing.sm`, 70×52. 출발 서명이 있으면 그 비율로 크기를 맞춘다(`FeedPhoto.swift:73-90, :343-350`).
     - 서명 버튼: 서명 위 투명 버튼, 둘레 sm까지 포함해 44 이상. 사진 정착 후에만 보인다(:120-124, :204-215).
       - 접근성 `"내 사인"` / `"작성자 사인"`, 힌트 `"사진 모아보기"`.
     - **좋아요 행** `FeedLikeRow`(:439-497)
       - 높이 57, 좌우 14, `HStack(spacing.md)`.
       - 왼쪽: 하트 24 + 숫자(`body regular`), 간격 9, 최소 44 높이.
       - 오른쪽: 제목(`body regular`, `textSecondary`, 1줄 tail, 오른쪽 정렬). 비어 있으면 `"무제"`.
       - 바닥에 `border` 0.5 선.
- **AI 버튼**(overlay bottomTrailing): 8절 참고.

**Android** — `Scaffold(containerColor ChalkakBackground)`(:295-415)
- `topBar` `FeedTopBar`: `photoTransitionChrome` + 배경 + `statusBarsPadding`. 패딩 start 8, end 12, top 10, bottom 8(:309-343).
  - 왼쪽: 44dp 박스에 `Icons.AutoMirrored.Filled.ArrowBack` 24dp `iconPrimary`, ripple 없음. 접근성 `"뒤로 가기"`(`FeedTopBar.kt:41-58`).
  - 오른쪽 `Row(spacedBy 4)`: 각 44dp 박스 안 **텍스트** 버튼(`callout`)(:60-115).
    - `"수정"`: `actionPrimary`.
    - `"삭제"`: `destructive`(#FF5A5F).
  - 수정은 `isTitleEditable`일 때만 보인다. 새로고침 중에도 비활성이다(:320-331).
- `bottomBar`: 내비게이션 바 높이만큼 배경 Spacer(:300-308).
- 본문 `FeedContent` → `Column(verticalScroll, padding bottom 40)`(`FeedContent.kt:91-115`)
  1. `FeedTopic`: start/end 25, top 16, bottom 40. `subheadline` + `display`(top 8)(`FeedTopic.kt:19-39`).
     - **`animateContentSize(tween(180))`**: 상세가 도착해 주제가 채워질 때 높이를 부드럽게 늘린다(`FeedContent.kt:22, :97-103`). 과제 설명의 "주제 리사이즈"가 이것이다.
  2. `FeedPhoto`: `ZoomableFeedPhotoSurface` 안에 `SharedPhotoImage`(전환 진입) 또는 `ChalkakSignedImage`(FillWidth)를 그린다(`FeedPhoto.kt:93-128`).
     - 서명 70×52, `clickable(onClickLabel "사진 모아보기")`.
  3. `FeedActionRow`(:296-346)
     - 높이 57, 좌우 14.
     - 하트 24 + 숫자(`body Normal`, #7D7D7D), 간격 9, 최소 44.
     - 오른쪽 `FeedCaption`: `body Normal`, #7D7D7D, End 정렬, 1줄, 비어 있으면 `"무제"`(`FeedCaption.kt:13-28`).
     - **구분선 없음**.

▶ 차이와 평가
- 상단 액션은 iOS가 아이콘 원형 버튼, Android가 텍스트다.
- 주제 영역 처리 방식이 다르다. iOS는 공백으로 미리 높이를 잡고, Android는 180ms 리사이즈 애니메이션을 쓴다. 사진이 튀지 않는다는 점에서 iOS 방식이 전환 품질에 유리하다.
- 색은 iOS가 토큰(`textSecondary`, `border`)을 지켰다.

### 4.2 사진 확대 전환 (shared element)

**Android** — Compose `SharedTransitionLayout`의 `sharedBounds`
- 사진: `sharedBounds(resizeMode = RemeasureToBounds, placeholderSize = ContentSize, clipInOverlayDuringTransition = NoOverlayClip)`(`PhotoTransition.kt:54-72`).
  - boundsTransform: `tween(300, FastOutSlowInEasing)`.
  - exit: `fadeOut(tween(0))`. 출발 뷰를 바로 숨긴다(:180).
- 모서리: 출발 카드 모양(`photoCard` 또는 `FittedPhotoCardShape`)에서 직사각형으로 바뀐다. `animateFloat tween(300, FastOutSlowIn)`(:39-52, :134-163).
- 서명: 사진과 별개의 shared 요소(`signatureKey`, 모서리 애니메이션 없음)(`SharedPhotoImage.kt` 서명 블록).
  - 작가 사인은 `sharedAuthorSignature`로 작가 목록 헤더와 공유한다. fadeIn/fadeOut 300, `scaleToBounds`, zIndex 2(:79-97).
- 크롬(상단바·하단바·필터·맨 위로 버튼): `photoTransitionChrome`. overlay zIndex 1, fadeIn/fadeOut 300(:104-120).
- 원본 노출: 원본 로드와 진입 전환 완료를 **모두** 만족하면 원본 레이어 alpha 0→1, `tween(180)`(`SharedPhotoImage.kt:56-62`, `SharedPhotoImageRevealState.kt:35-38`).
- 화면 콘텐츠 페이드: 700ms(`PHOTO_CONTENT_FADE_DURATION_MILLIS`, `PhotoTransition.kt:185-186`). 열 때는 천천히 페이드하고, 닫을 때는 사진 이동과 함께 끝난다.

**iOS** — 직접 구현한 줌. `FeedZoomRegistry`가 출발 뷰 위치를 모은다(`FeedZoomTransition.swift`).
- 출발 종류: `displayFeatured`, `displayGrid`, `homeYesterday`, `homeTrending`, `record`, `authorGrid`(:5-31).
  - 하단바 재노출: authorGrid만 false다.
  - 사진 비율 morph: 전시·홈·작가 목록에서 한다(`FeedScreen.swift:453-458`).
- 곡선
  - 사진 이동: `timingCurve(0.4, 0, 0.2, 1, duration 0.3)`. Android tween 300 FastOutSlowIn과 같다(:694-696).
  - 콘텐츠 페이드: `timingCurve(0.4, 0, 0.2, 1, 0.7)`(:697-698).
- 열기 단계
  1. 출발 위치·도착 프레임·전환용 비트맵을 확보한다.
  2. `FeedOpeningFrameGate`(CADisplayLink)로 한 프레임 이상 출발 상태를 유지한다.
  3. 확대를 시작한다(:176-200, :460-467, `FeedZoomTransition.swift:720-771`).
- **화면 전체 접기**(`FeedScreenReturnEffect`): 불투명한 상세 화면을 한 장의 창처럼 옮겨 카드로 접는다.
  - 최종 배율 = max(카드 폭/사진 폭, 카드 높이/사진 높이).
  - 진행도 0.6에서 하단 가장자리가 먼저 화면 끝에 닿는다.
  - 모서리 = `shapes.sheet(28)`(떠 있는 창) ↔ 카드 반지름을 보간한다(`FeedZoomTransition.swift:555-636`).
- 닫기
  - 하단바는 0.3초 전환의 뒷 절반에서 드러낸다. `easeIn(0.15).delay(0.15)`(:510-513, :701-702).
  - 원본 카드는 도착할 때까지 숨긴다(`hidesWholeSource`).
- **엣지 백 스와이프**(:547-589, :703-706)
  - 시작: 왼쪽 24pt 안에서 시작하고, 최소 이동 12, 가로 우세일 때.
  - 끄는 동안: 창 크기를 유지하고 `dragOffset × 0.65`만큼 따라간다. 축소는 최대 4%(`dragOffset/100 × 0.04`)(`FeedZoomTransition.swift:575-577`).
  - 판정: 예측 거리 ≥ 120이면 닫고, 아니면 복귀한다. 진행도 기준 전체 거리는 300.
  - 손을 뗀 속도를 이어받는 3차 베지어(`FeedBackSwipeRelease`)를 쓴다. 남은 시간은 0.08~0.3s(:663-684).
- 동작 줄이기(Reduce Motion): 사진 이동 없이 페이드만 한다(:447-451).

▶ iOS가 훨씬 정교하다. 손 따라가기 백 스와이프, 속도 이어받기, 프레임 게이트, 하단바 지연 노출, 안전 영역 보정, Reduce Motion까지 다룬다. Android는 프레임워크 shared element로 같은 곡선(300ms FastOutSlowIn)을 간결하게 맞췄다. 예측형 뒤로 가기 연동은 이 범위에서 보이지 않는다.

### 4.3 사진 핀치 줌 (상세)

- 공통 수치
  - 배율 1~4배. 이동은 ±(크기 × 배율 / 2)로 제한한다.
  - 두 손가락 중심을 고정해 확대한다(`feedPhotoPinchOffset`).
  - 확대된 상태에서는 한 손가락으로 이동한다.
  - 손을 모두 떼면 **애니메이션 없이** 1배·원위치로 돌아간다.
  - 근거: iOS `FeedPhoto.swift:217-296, :375-389, :501`, Android `FeedPhoto.kt:141-259, :285-287`.
- 조작 중 처리
  - iOS: 스크롤 클립과 스크롤을 끈다(`FeedScreen.swift:347-349`).
  - Android: 공유 전환 overlay에 그려 스크롤 영역 밖까지 보이게 한다(:150-166).

### 4.4 다이얼로그·시트

| 용도 | iOS | Android |
|---|---|---|
| 삭제 확인 | 시스템 alert. 제목 `"게시물을 삭제할까요?"`, 버튼 `"취소"`(cancel) / `"삭제"`(destructive), 메시지 `"삭제한 게시물은 피드에서 사라지며 다시 복구할 수 없어요."`(:245-250) | `ChalkakConfirmDialog`. 제목 `"게시물 삭제"`, 메시지 `"게시물을 삭제하시겠어요?"`, 버튼 `"삭제"`(DESTRUCTIVE), 폭 0.81(:218-231) |
| 제목 수정 | 시스템 alert + TextField. 제목 `"게시물 제목 수정"`, placeholder `"제목을 입력해 주세요"`, 버튼 `"취소"` / `"저장"`(저장 중 비활성), 메시지 `"새 제목을 입력해 저장하면 게시물에 바로 반영돼요."`(:251-259) | `FeedTitleEditDialog`(`FeedTitleEditDialog.kt`): Surface `shapes.large`, 패딩 24, 폭 0.88. 제목 `title3`, 입력 `ChalkakTextField`(top 16, placeholder `"제목을 입력해 주세요."`, `subheadline`, 한 줄, 최대 10자), 버튼 Row(top 20, spacedBy 10, `shapes.button`, `callout`), `"취소"`(actionSecondary) / `"저장"` / `"저장 중..."` |
| 사인 안내 시트 | 4.5절 | 4.5절 |

### 4.5 사인 안내 시트 (FeedSignatureHintSheet)

- 문구: 제목 `"사인을 눌러보세요!"`, 설명 `"이제 사인별로 작가님들의 사진을 모아볼 수 있어요"`(iOS `AuthorPostsSignatureHint.swift:6-7`, Android `FeedSignatureHintSheet.kt:38-39`).
- 노출 조건
  - 사인을 누를 수 있는 게시물(내 것 포함)에서 사인이 화면에 자리 잡으면 띄운다.
  - 사용자가 닫거나 사인을 누르면 다시 띄우지 않는다.
  - 사진 이동·백 스와이프·AI 시트 중에는 띄우지 않는다(iOS `FeedScreen.swift:380-410`).

**iOS**(`FeedSignatureHintSheet.swift`)
- 시트: 높이 233, 손잡이 표시. `surfaceElevated` + `shapes.sheet`(glass가 아니면)(:39-49, :107).
- `VStack(spacing.lg)`, 좌우·위 `spacing.xl`(:17-38).
- 그림: 2.35:1, 폭은 설명 글 폭에 맞춘다. asset `preview_sunset`(scaledToFill, 하단 정렬) + `colors.scrim`(검정 0.4) 덮개. `clip(shapes.large)`(:54-85).
- 그림 안 예시 사인: 텍스트 `"사인"`, `handwriting`, `textOnImage`.
  - 손그림 동그라미 Path: 68×56 격자 기준, 선 2, round cap.
  - 패딩 좌우 md, 위아래 sm. `scaleEffect 1.5`(우하단 기준). 우 16 / 하 12(:63-81, :88-113).
- 제목·설명 묶음 `VStack(spacing.sm)`, 가운데 정렬.
  - 제목: `title3` / `textPrimary`.
  - 설명: `callout` / `textSecondary`.

**Android**(`FeedSignatureHintSheet.kt`)
- 시트: `ModalBottomSheet(skipPartiallyExpanded)`, 기본 핸들 대신 `AiReviewSheetDragHandle`(8.4절).
- 내용 패딩: 좌우·아래 `spacing.xl`(:58-75).
- 그림: 2.35:1, `clip(shapes.large)`. `RES:img_login_background` Crop + `scrim × 0.25`(실제 검정 약 0.1)(:111-132).
  - 사인 표시: `RES:img_signature_hint_sample`(벡터), 그림 폭의 36%, 140:80 비율. 우하단 end 8 / bottom 4(:133-141).
- 그림→제목 간격 `spacing.xl`. 제목 `title3 Bold`. 간격 sm. 설명 `body` / `textSecondary`(:84-104).
- 닫는 방법: 쓸어내리기, 바깥 탭, 뒤로 가기, 핸들 탭.

▶ 이미지 자산이 다르다(`preview_sunset` ↔ `img_login_background`). 어둡게 덮는 정도도 다르다(0.4 ↔ 약 0.1). iOS는 손그림 동그라미를 코드 Path로 그려 해상도와 무관하다. Android는 벡터 자산 하나로 단순하다.

### 4.6 상태별 UI

| 상태 | iOS | Android |
|---|---|---|
| 로딩(전환 사진 있음) | 출발 화면 이미지로 사진을 먼저 그린다. 주제는 공백으로 자리만 잡는다 | `SharedPhotoImage`로 썸네일·스냅샷을 먼저 그린다(`FeedScreen.kt:353`) |
| 로딩(사진 없음) | 가운데 `ProgressView`(:280-286) | 가운데 `CircularProgressIndicator(actionPrimary)`(:364-366) |
| 에러 | 메시지 `body`/`textSecondary` + 간격 `spacing.xl` + `"다시 시도"`(`body`/`actionPrimary`)(:591-610) | 같은 구성(`TextButton`)(:368-384) |
| 에러 문구 | `"게시물을 찾을 수 없어요"` / `"네트워크 연결을 확인해 주세요"` / `"게시물 정보를 불러오지 못했어요"` / `"게시물을 불러오지 못했어요"`(`FeedViewState.swift:21-27`) | `"피드를 불러오지 못했어요"`(`FeedViewModel.kt:400,411`) 등 |
| 삭제 실패 | `"게시물을 찾을 수 없어요"` / `"네트워크…"` / `"게시물을 삭제하지 못했어요"` | 400 `"삭제할 수 없는 상태의 게시물이에요"`, 403 `"본인이 작성한 게시물만 삭제할 수 있어요"`, 404, 401 `"로그인이 필요해요"`(:551-561) |
| 제목 수정 | 성공 `"제목을 수정했어요"`, 실패 `"수정할 수 없는 상태이거나 주제 참여 기간이 끝났어요"` 등 | 같은 문구 + 403 `"본인의 게시물만 수정할 수 있어요"`(:566-576) |
| 게스트 | 사인 안내는 띄운다. 사인을 누르면 작가 목록으로 가고, 목록이 401이면 로그인 화면으로 보낸다(`AuthorPostsViewState.swift:43`) | 사인을 누르면 토스트 `"다른 사진도 보려면 로그인이 필요해요"`만 띄우고 이동하지 않는다(`FeedViewModel.kt:91-93`) |

▶ 게스트의 사인 탭 처리는 Android가 즉시 안내해서 명확하다. 서버 실패 원인별 문구는 Android가 더 세분화돼 있다.

---

## 5. 사진 업로드 (PhotoUpload)

진입 파일
- iOS `iOS:Features/PhotoUpload/PhotoUploadRoute.swift`, `PhotoUploadScreen.swift`
- Android `AND:feature/upload/PhotoUploadScreen.kt`

### 5.1 레이아웃 (위→아래)

**상단**
- iOS: 내비게이션 바. 제목 `"전시하기"` inline, 오른쪽 `ChalkakCloseButton`(SF `xmark`, iOS 26이면 시스템 close). 제출 중 비활성(:93-103).
  - `PhotoUploadTopBar` 컴포넌트(뒤로 48 + 가운데 제목 + 48 자리)도 있지만 이 화면은 툴바를 쓴다(`PhotoUploadTopBar.swift`).
- Android: `PhotoUploadTopBar`. `statusBarsPadding` + start 8 / end 12 / top 10 / bottom 8(:228-241).
  - 44dp 뒤로 화살표(ArrowBack 24, `iconPrimary`, 접근성 `"뒤로 가기"`).
  - 가운데 `"전시하기"`(`headline`/`textPrimary`), 오른쪽 44dp 빈 자리(`PhotoUploadTopBar.kt:30-62`).

**본문(스크롤)**
- iOS: 위 `spacing.xl(24)`, 아래 104(:82-83).
- Android: 아래 104 + `imePadding`, IME 중첩 스크롤(:248-255).

1. **사진 영역** `PhotoUploadImageArea`(전체 폭)
   - 바탕 `colors.inputBackground`.
   - 사진이 없을 때
     - 비율: 가로/세로 1.216(iOS :49-54, :107 / Android :49-57, :174).
     - 테두리: 1pt 점선(5 on / 4 off), `colors.border`(iOS :91-101, :111-113 / Android :179-191).
     - 가운데 문구 1: `"주제 ‘{topic}’에 맞는 한 장"`(`subheadline`/`textSecondary`). 주제가 있을 때만.
     - 가운데 문구 2: `"앨범에서 고르거나 지금 찍어요"`(`caption`/`textMuted`). 주제가 있으면 위 5(iOS :78-90, Android :60-80).
   - 사진이 있을 때: 사진 비율 그대로 `.fit`(iOS) / `FillWidth`(Android).
     - 탭하면 다시 편집한다. 제출 중에는 탭할 수 없다. 접근성 `"선택한 사진"`, 힌트 `"사진을 다시 편집해요"` / `onClickLabel "사진 편집"`(iOS :56-76, Android :81-96).
     - Android는 편집 결과를 `EditedPhotoImage`로 실시간 적용해 보여 준다. iOS는 이미 렌더한 `UIImage`를 보여 준다.
   - **우상단 액션 버튼**: top 14, trailing 11, 간격 10(iOS :28-43, :108-110 / Android :98-116).
     - 앨범: asset `ic_photo_library`, 접근성 `"앨범에서 사진 선택"`.
     - 카메라: `ic_photo_camera`, 접근성 `"카메라로 촬영"`. 카메라가 있는 기기에서만 보인다.
     - 버튼 모양: 42 원, 흰색 0.66, 아이콘 22(원색), 그림자 black 0.2 / radius 4 / y 2(iOS `PhotoUploadActionButton.swift:11-28`, Android `PhotoUploadActionButton.kt:32-58`).
2. 간격 34
3. **설명 입력**(좌우 22) `ChalkakTextField`
   - placeholder `"작품 제목은 선택이에요."`, `subheadline`, 최대 10자, 제출 중 비활성.
   - iOS: 라벨 `"사진 설명"`, 3~5줄(:44-56, :189). Android: `minLines 3`(:275-287, :428).
   - 주제 로드 실패 시 아래에 표시한다.
     - 에러 문구(`footnote`/`colors.error`, top 8).
     - `"다시 시도"` 버튼(`body`/`actionPrimary`)(iOS :63-75, Android :289-305).
   - 아래 간격 16.

**하단 고정 버튼**
- `ChalkakButton` 전체 폭, 좌우 26, 아래 26. 문구 `"전시하기"`, 제출 중 `"전시 중..."`. `canSubmit`일 때만 활성(iOS :104-113, Android :311-323).
- 버튼 스펙: `callout`, 세로 17 / 가로 `spacing.xl`, `shapes.button`. 비활성이면 `actionPrimary` 0.12 바탕 + `textPrimary` 글자(iOS `ChalkakButton.swift:13-27`, Android `ChalkakButton.kt:20-41`).

### 5.2 사진 선택 (카메라 / 라이브러리)

**iOS**(`PhotoUploadRoute.swift`)
- 앨범: `.sheet`로 `PhotoUploadGalleryPicker`(PHPicker, `ignoresSafeArea`)를 띄운다. 시트가 **완전히 닫힌 뒤**(`onDismiss`) 편집을 시작한다. Safe Area 겹침을 막으려는 처리다(:43-56).
- 카메라
  - 먼저 사진 추가 권한을 요청한다. 허용·제한이면 촬영 후 저장, 거부면 alert를 띄운다(:115-130).
  - alert 제목: `"촬영한 사진을 저장할까요?"`.
  - alert 메시지: `"사진 추가 권한을 허용하면 촬영한 사진이 사진 앱에도 저장돼요. 허용하지 않아도 사진을 골라 게시물을 작성할 수 있어요."`
  - alert 버튼: `"설정 열기"` / `"저장 없이 촬영"` / `"취소"`(:78-90).
  - 저장 실패 토스트: `"촬영한 사진을 사진 앱에 저장하지 못했어요. 업로드는 계속할 수 있어요."`. 권한 안내 토스트도 있다(`PhotoUploadViewModel.swift:174-177`).
- 편집: `fullScreenCover`로 `PhotoEditScreen`을 띄운다(:71-77).

**Android**(`PhotoUploadScreen.kt:328-423`)
- 앨범: `ActivityResultContracts.GetContent("image/*")`.
- 카메라: `TakePicture` + 임시 파일 URI. 구형 OS는 `WRITE_EXTERNAL_STORAGE`를 요청하고, 거부되면 토스트 `"사진을 갤러리에 저장하지 못했어요."`(`PhotoUploadViewModel.kt:501`).
- 편집: 같은 Route 안에서 `PhotoEditRoute`로 화면을 통째로 바꾼다(:115-126).

### 5.3 진행·이탈·실패

- **업로드 진행**: 두 플랫폼 모두 진행률 UI(프로그레스 바)가 **없다**. 버튼 문구 `"전시 중..."`, 입력·사진·닫기 비활성만 있다.
- **이탈 확인**(작성 중 내용이 있을 때)
  - iOS alert: 제목 `"작성을 그만둘까요?"`, 버튼 `"취소"` / `"뒤로 가기"`(destructive), 메시지 `"뒤로 가면 작성 중인 내용이 사라져요. 계속 작성하려면 취소를 눌러 주세요."`(`PhotoUploadRoute.swift:91-98`).
  - Android `ChalkakConfirmDialog`: 메시지 `"뒤로 가면 작성 중인 내용이 사라져요.\n그래도 뒤로 가시겠어요?"`, 확인 `"뒤로 가기"`, DESTRUCTIVE, 폭 0.81(:205-215).
- **키보드**
  - 키보드가 떠 있을 때 뒤로 가기를 누르면 먼저 키보드를 내린 뒤 이동한다(iOS :137-146, :169-173 / Android :183-201).
  - iOS는 아래로 끌어 닫기도 지원한다(:148-167).
    - 조건: 맨 위, 입력칸 밖에서 시작, 세로 우세.
    - 판정: 80 이상, 또는 예측 140 이상.
    - `DragGesture(minimumDistance 20)`.
- **진입 차단 문구**(EntryGate, 양쪽 동일)
  - `"이미 이 주제에 게시물을 작성했어요."`
  - `"지금 참여할 수 있는 주제가 없어요."`
  - `"이용이 정지되어 게시물을 작성할 수 없어요."`
  - `"게시물 작성 여부를 확인하지 못했어요. 다시 시도해 주세요."`
  - 근거: iOS `PhotoUploadEntryGate.swift:12-25`, Android `PhotoUploadEntryGateViewModel.kt:130-133`.
- **게스트**
  - Android: `"게시물을 추가하려면 로그인이 필요해요"`(:134).
  - iOS: 401이면 `reauthenticationRequired` → 로그인으로 보낸다.
- **제출 실패 문구**(양쪽 동일)
  - `"네트워크 연결을 확인해 주세요."`
  - `"사진을 준비하지 못했어요. 다시 시도해 주세요."`
  - `"사진을 업로드하지 못했어요. 다시 시도해 주세요."`
  - `"전시를 완료하지 못했어요. 다시 시도해 주세요."`
  - `"이미 이 주제에 전시한 사진이 있어요."`
  - `"주제가 변경되어 전시할 수 없어요."`
  - 근거: iOS `PhotoUploadViewState.swift:108-124`, Android `PhotoUploadViewModel.kt:469-474`.

### 5.4 업로드 성공 화면

iOS `PhotoUploadSuccessScreen.swift`, Android `PhotoUploadSuccessScreen.kt`. 배경은 `colors.background`.

1. 위 60
2. **카드** `PhotoUploadSuccessCard`(좌우 25)
   - 바탕 `surfaceElevated`, 모서리 `shapes.small(7)`.
   - 그림자: iOS black 0.12 / radius 12 / y 4, Android `shadowElevation 12`.
   - 사진: 좌우·위 `spacing.lg` 안쪽, 비율 유지(fit / FillWidth).
   - 텍스트 블록: start/end `spacing.lg`, top 27, bottom 36.
     - 날짜 `"yyyy. MM. dd"`: `caption`/`textMuted`.
     - 제목: `photoCardTitle`/`textPrimary`, top 8. 설명이 비면 주제를 쓴다.
   - 근거: iOS `PhotoUploadSuccessCard.swift:13-40`, Android `PhotoUploadSuccessCard.kt:32-73`.
3. 간격 34
4. 제목 `"‘{topic}’을 기록했어요."` / `"…를 기록했어요."`(받침에 따라 을/를): `title1`/`textPrimary`, 좌우 25.
5. 검수 안내(`footnote`/`textSecondary`, top 10, bottom 40)
   - PENDING: `"검수를 기다리고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요!"`
   - VALIDATING: `"사진을 확인하고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요!"`
   - 근거: `PhotoUploadViewState.swift:11-42`, Android `:77-93`.
6. 하단 버튼 `"확인했어요."`: 좌우 `spacing.xl(24)`, 아래 26.
- 진입·퇴장 애니메이션은 따로 없다(내비게이션 기본).

▶ 업로드 화면은 두 플랫폼이 거의 같다. iOS가 더 다듬어진 부분은 아래로 끌어 닫기, 시트가 닫힌 뒤 편집 시작, 카메라 권한 안내다. Android가 나은 부분은 편집 미리보기를 실시간으로 반영하는 것이다(`EditedPhotoImage`).

---

## 6. 사진 편집 (PhotoEdit)

진입 파일
- iOS `iOS:Features/PhotoEdit/PhotoEditScreen.swift`
- Android `AND:feature/photoedit/PhotoEditScreen.kt`

### 6.1 화면 구조 — 두 플랫폼의 정보 구조가 다르다

**iOS**: 첫 화면 → 도구 화면(모달형) 2단계. `preferredColorScheme(.dark)`, 배경 `editorBackground`(:39, :46).
- **첫 화면**(:62-78)
  1. `PhotoEditHeader`(좌우 `spacing.lg`, 위 `spacing.sm`)
     - 왼쪽: 48pt 원(SF `chevron.backward` 18 semibold, `textOnEditor`). 접근성 `"뒤로 가기"`.
     - 오른쪽: `"완료"` 캡슐(높이 48, 좌우 `spacing.lg`, `body`). 완료 처리 중이면 `textOnEditorMuted`로 비활성(`PhotoEditHeader.swift:12-47`).
  2. 미리보기: `scaledToFit`, 최대 크기, 위아래 `spacing.lg`. 접근성 `"편집 중인 사진"`(:198-205).
  3. `PhotoEditToolPicker`(위아래 `spacing.md`): 캡슐 하나 안에 세 도구(`PhotoEditToolPicker.swift:10-45`).
     - 캡슐: 좌우 `spacing.md`, 위아래 `spacing.xs`, 항목 간격 `spacing.sm`.
     - 항목: 최소 64×56. SF 아이콘 22(프레임 높이 28) + `caption`, 간격 `spacing.xs`.
     - 도구: `"조정"`(`dial.medium`), `"필터"`(`camera.filters`), `"자르기·회전"`(`crop.rotate`)(`PhotoEditViewState.swift:218-231`).
- **도구 화면**: 미리보기(위) → 도구 옵션 → `PhotoEditActionBar`(좌우 `spacing.lg`, 위아래 `spacing.md`)(:80-164).
  - 액션바(`PhotoEditActionBar.swift:12-87`)
    - 왼쪽: 52pt 원 `"취소"`(SF `xmark` 20 semibold).
    - 오른쪽: 52pt 원 `"적용"`(SF `checkmark`).
    - 가운데: 도구별 버튼. 자르기면 캡슐 안 52pt 버튼 두 개.
      - `"좌우 반전"`(`arrow.left.and.right.righttriangle.left.righttriangle.right`)
      - `"왼쪽으로 회전"`(`rotate.left`)
  - 필터·자르기 옵션 영역 높이 96(:113, :144, :243).
- 버튼 바탕(`PhotoEditControlBackground.swift`): iOS 26이면 `glassEffect(.regular.interactive())` + `GlassEffectContainer`. 아니면 `editorControl`.
- 완료 처리 중: 가운데 `ProgressView`(tint `textOnEditor`)(:40-45).
- 실패: alert `"사진을 편집하지 못했어요. 다시 시도해 주세요."` / `"확인"`(:50-55, `PhotoEditViewModel.swift:418`).

**Android**: 한 화면 + 하단 탭. 배경 `photoEditBackground`, `systemBarsPadding`. 상태바 아이콘을 밝게 바꾼다(:122-206, :263-281).
1. `PhotoEditTopBar`(좌우 `spacing.sm`, 위아래 `spacing.xs`)
   - 텍스트 버튼 `"취소"` / `"완료"`(`body`, `photoEditContent`, 패딩 md/sm)(`PhotoEditTopBar.kt:23-46`).
2. 사진 영역 `weight(1f)`
   - 자르기 탭: `CropCanvas`.
   - 조정·필터 탭: `EditedPhotoImage`(패딩 `spacing.xl`, 접근성 `"편집한 사진"`).
3. 컨트롤 영역: 높이 **156**, 가운데 정렬(:163-198, :289).
4. `PhotoEditTabBar`
   - 균등 3칸 `"자르기"` / `"조정"` / `"필터"`, 위아래 `spacing.md`, `subheadline`.
   - 선택 `photoEditContent`, 아니면 `photoEditContentMuted`(`PhotoEditTabBar.kt:26-50`, `PhotoEditLabels.kt:29-34`).
   - **기본 탭은 자르기**(`PhotoEditUiState.kt:12`).
- 도구별 취소·적용이 없다. 모든 변경은 화면의 `"취소"` / `"완료"`로 한꺼번에 확정한다. 뒤로 가기는 취소와 같다(:73-78).

▶ iOS가 더 정교하다. 사진 앱 같은 2단계 구조, 도구별 취소·적용, 리퀴드 글라스를 갖췄다. Android는 단순한 탭 구조다. 새 앱의 기준은 iOS 구조가 낫다.

### 6.2 조정 (아이콘, 항목, 룰러 슬라이더)

**항목**(7 + 자동): `"자동"`, `"노출"`, `"대비"`, `"하이라이트"`, `"그림자"`, `"블랙 포인트"`, `"채도"`, `"따뜻함"`

| 항목 | iOS SF Symbol(`PhotoEditViewState.swift:195-199`, `PhotoEditAdjustments.swift:32-42`) | Android drawable(`AdjustmentControls.kt:170-184`) |
|---|---|---|
| 자동 | `wand.and.stars` | `ic_adjust_auto` |
| 노출 | `plusminus.circle` | `ic_adjust_exposure` |
| 대비 | `circle.lefthalf.filled` | `ic_adjust_contrast` |
| 하이라이트 | `sun.max` | `ic_adjust_highlights` |
| 그림자 | `circle.bottomhalf.filled` | `ic_adjust_shadows` |
| 블랙 포인트 | `circle.fill` | `ic_adjust_black_point` |
| 채도 | `drop.halffull` | `ic_adjust_saturation` |
| 따뜻함 | `thermometer.medium` | `ic_adjust_warmth` |

- 값 범위: 자동은 0…1(강도), 나머지는 −1…1. 화면에는 ×100 정수로 보인다(iOS `PhotoEditViewState.swift:202-206`).

**iOS 조정 화면 레이아웃**(`PhotoEditAdjustControls.swift:15-49`) — `VStack(spacing.md)`
1. 선택 항목 이름: `caption`/`textOnEditorMuted`.
2. 항목 가로 스크롤 `HStack(spacing.md)`. 선택이 바뀌면 `withAnimation`으로 가운데로 스크롤한다.
   - 항목 = 56pt 원, 바탕 `editorControl`(:52-98, :350-353).
   - 선택되면 아이콘 대신 값 숫자(`callout`, monospacedDigit). 자동은 항상 아이콘.
   - 자동이 켜지면(>0) 전경색 `editorAccent`.
   - 링: 트랙 선 3, `textOnEditorMuted`(선택 1.0, 비선택 0.4).
   - 진행 링: 값 |v|만큼 trim, 선택 `textOnEditor` / 비선택 `editorAccent`, round cap. 12시에서 시작하고, 음수는 좌우를 뒤집어 반시계 방향으로 채운다.
3. 눈금자(룰러).

**Android 조정 레이아웃**(`AdjustmentControls.kt:64-126`) — `Column(spacedBy spacing.sm)`
1. 값·초기화 행
   - 가운데: 값 숫자(`footnote`, `photoEditContent`).
   - 오른쪽 끝: `"초기화"`(`footnote`). 변경이 있을 때만 활성, 아니면 muted.
2. 눈금자.
3. 항목 가로 스크롤 Row(`spacedBy spacing.md`)(:129-168, :189-191)
   - 항목: 최소 폭 56, 위아래 `spacing.xs`.
   - 아이콘 24 + `caption` 라벨 + 4dp 점(값이 바뀌었으면 `photoEditContent`, 아니면 투명), 간격 `spacing.xs`.
   - 선택 `photoEditContent`, 아니면 muted.

**룰러 슬라이더** — 수치가 양쪽 동일하다.
- 근거: iOS `PhotoEditAdjustControls.swift:116-384`, Android `AdjustmentRuler.kt`, `RulerScale.kt`.
- 기본 수치
  - 높이 44.
  - 값 1.0 = 50칸 × 8 = 400 폭. 한 칸은 화면 값 2.
  - 눈금: 폭 2, 높이 20, 둥근 끝.
- 눈금 불투명도: 기본 0.4, 10칸마다 0.75.
- 가운데 표시선: 폭 2, 높이 40.
  - iOS는 **`editorAccent`(노랑)**, Android는 `photoEditContent`(흰색).
- 자동 보정 값 표시: 6pt 원 점, 바닥에서 32 위, muted 색.
- **잔상**
  - 표시선을 지난 눈금은 높이 20→40, 불투명도 →1로 솟았다가 0.3s 동안 선형으로 가라앉는다.
  - 표시선에서 8칸 안의 눈금만 솟는다(가까울수록 높게).
  - 손이나 관성으로 움직일 때만 생긴다.
- **멈춤(detent)**: 기준값(자동 보정 몫, 없으면 0) 앞뒤 8pt씩 값이 바뀌지 않는 구간이 있다. 지나치려면 16pt를 밀어야 한다.
- **방향**: 왼쪽으로 밀면 값이 커진다(위치 = 시작 − 이동량/400).
- **관성**: 1ms마다 속도 × 0.995. 값 기준 초당 0.02 미만이면 멈춘다. 범위 끝에 닿으면 멈춘다. 손을 대면 즉시 멈춘다.
- **값 반올림**: ×100 정수. 기준값은 반올림하지 않는다.
- **햅틱**: 칸이 바뀌면 약하게, 기준값에 닿으면 강하게.
  - iOS: `.selection` / `.impact(weight: .medium)`.
  - Android: `SegmentFrequentTick` / `GestureThresholdActivate`.
- **접근성**
  - iOS: adjustable ±0.1.
  - Android: `setProgress`, `stateDescription` = 정수 값.
- **항목 전환**: 항목을 바꾸면 룰러 상태를 새로 만든다(`.id` / `key`).

▶ 룰러는 양쪽이 같은 사양으로 정교하다. 항목 UI는 iOS가 사진 앱식 원형 링으로 값을 바로 보여 줘서 정보량이 많다. Android는 아이콘·라벨·점으로 단순하다. 대신 Android에는 "초기화"가 있다.

### 6.3 필터

- 목록이 **다르다**.
  - iOS: `"원본"`, `"선명"`, `"크롬"`, `"페이드"`, `"흑백"`, `"누아르"`(`PhotoEditViewState.swift:6-22`).
  - Android: `"원본"`, `"흑백"`, `"따뜻하게"`, `"차갑게"`, `"빈티지"`, `"선명하게"`(`PhotoEditLabels.kt:6-14`).
- 썸네일 스트립(공통): 64×64, `clip(shapes.small(7))`, 선택 테두리 2(`textOnEditor` / `photoEditContent`), 항목 간격 `spacing.md`. 라벨 `caption`, 위 `spacing.xs`. 선택이면 밝게, 아니면 muted.
  - 근거: iOS `PhotoEditFilterStrip.swift:12-69`, Android `FilterStrip.kt:48-107`.
- 썸네일 로딩
  - iOS: `textOnEditorMuted × 0.3` 사각형.
  - Android: 지금 조정값을 적용한 같은 비트맵에 필터 `ColorFilter`만 바꿔 그린다.

### 6.4 자르기·회전

- **비율**(양쪽 같은 9종): `"원본"`, `"자유"`, `"1:1"`, `"4:5"`, `"5:4"`, `"3:4"`, `"4:3"`, `"9:16"`, `"16:9"`.
  - 순서: iOS는 원본·자유 순, Android는 원본·자유 순(enum).
  - iOS는 회전하면 세로/가로 짝으로 바꾸고, 선택 항목을 가운데로 스크롤한다(`PhotoEditViewState.swift:28-63`, `PhotoEditAspectRatioStrip.swift:22-27`).

**iOS 비율 아이콘**(`PhotoEditAspectRatioStrip.swift`)
- 항목 간격 `spacing.lg`.
- 아이콘: 36 박스 안 긴 변 32 사각형, 모서리 4, 선 1.5. 자유는 3:4 모양.
- 아이콘과 라벨(`caption`) 간격 `spacing.sm`. 최소 44×44.
- 선택 `editorAccent`, 아니면 `textOnEditor`(:15-73).

**Android 비율 프레임**(`AspectRatioFrames.kt`)
- 간격 `spacing.sm`, 항목 패딩 `spacing.xs`.
- Canvas 28 박스, 선 1.5, 모서리 2.
- 원본은 실제 비율(모르면 4:3). **자유**는 네 모서리 꺾쇠(길이 = 박스 × 0.3, round cap).
- 선택 `photoEditContent`, 아니면 muted(:43-142).

**자르기 영역**
- iOS: Mantis 라이브러리(`PhotoEditCropper.swift`)
  - `forceDark`, 내장 툴바·회전 다이얼을 숨긴다. 사진 둘레 여백 14.
  - 자르기 밖은 `editorBackground` × 0.6으로 어둡게 한다(:46-53, :110-113).
  - 비율·회전을 바꾸면 `.id`가 바뀌어 새로 만들어진다.
  - **회전 전환**: 90°·배율 보정 상태에서 0°로 돌아 들어온다. `easeInOut 0.3s`(`PhotoEditScreen.swift:136, :166-196, :244-246`).
  - 좌우 반전: Mantis 애니메이션 0.5s, 그동안 재입력을 0.55s 막는다(`PhotoEditCropper.swift:17-28`).
- Android: 직접 구현(`CropCanvas.kt`, `CropFrameOverlay.kt`)
  - 사진 여백 24, 모서리 핸들 터치 반경 32(`CropCanvas.kt:172-173`).
  - 프레임 밖: `photoEditScrim`(#141312 0.62).
  - 프레임 선 1, 모서리 핸들 길이 20 / 두께 3, 흰색.
  - 조절하는 동안에만 3×3 격자(0.5, muted)를 보인다(`CropFrameOverlay.kt:20-79`).
  - 컨트롤 영역 `Column(spacedBy spacing.md)`(`PhotoEditScreen.kt:208-261`)
    - 비율 프레임.
    - 아래 Row: 왼쪽 `IconButton`(`RES:ic_rotate_right`, 접근성 `"90도 회전"`) / 오른쪽 `"초기화"`(`footnote`, 활성 시 흰색).
  - 회전은 `graphicsLayer rotationZ`로 즉시 적용한다(애니메이션 없음). **좌우 반전 없음**.

▶ iOS가 더 정교하다(전문 크롭 라이브러리, 회전 전환 애니메이션, 좌우 반전). 회전 방향이 반대다(iOS 왼쪽, Android 오른쪽). 아이콘도 다르다(SF `rotate.left` ↔ `ic_rotate_right`).

### 6.5 편집기 색 요약

| 역할 | iOS | Android |
|---|---|---|
| 배경 | `editorBackground` #000000 | `photoEditBackground` #141312 |
| 컨트롤 바탕 | `editorControl` #1C1C1E(또는 glass) | 없음(배경 위 텍스트·아이콘) |
| 강조 | `editorAccent` #FFD60A(표시선, 선택 비율, 자동 켜짐) | 없음(흰색으로 대체) |
| 기본 글자 | `textOnEditor` 흰색 | `photoEditContent` 흰색 |
| 보조 글자 | `textOnEditorMuted` 흰색 0.6 | `photoEditContentMuted` 흰색 0.56 |
| 크롭 밖 | 검정 0.6 | `photoEditScrim` #141312 0.62 |

---

## 7. AI 리뷰 — 공통 요소

### 7.1 오디오 웨이브 아이콘

iOS `ChalkakAudioWaveIcon.swift`, Android `AiReviewAudioWaveIcon`(`AiReviewComponents.kt:97-134, :485-489, :549-550`)

- 막대: 5개, 높이 [9, 15, 11, 18, 8], 폭 2, 간격 2, 둥근 캡슐. 전체 18×18, 세로 가운데 정렬.
- 애니메이션: 막대마다 세로 배율 `0.7 + 0.3·sin(phase + index·1.2)`.
  - iOS: phase = 시각 × 7 rad/s. `TimelineView` 30fps(`minimumInterval 1/30`).
  - Android: 900ms `LinearEasing`으로 0→2π 무한 반복(≈ 6.98 rad/s).
- 움직이는 조건: 분석 중(PROCESSING)일 때만.
  - iOS는 **동작 줄이기**가 켜져 있으면 멈춘다.
- 색
  - iOS: `.foreground`(상위 `foregroundStyle` 상속).
  - Android: 기본 `textPrimary`, 파라미터로 바꾼다.

▶ 수치는 일치한다. 접근성은 iOS가 낫다(Reduce Motion 대응).

### 7.2 시작 안내 시트 (AIReviewStartSheet / AiReviewStartSheet)

- 레이아웃: `VStack/Column(spacing.lg)`
  1. 제목(`title3`/`textPrimary`): `"AI 피드백을 시작할까요?"`. 실패 후 재요청이면 `"AI 피드백을 재요청할까요?"`.
  2. 안내 박스
     - 바탕 `colors.background`, `shapes.large`, 패딩 `spacing.lg`.
     - 줄 간격 `spacing.lg`. 각 줄 = 36 원(`surfaceElevated`) 안 아이콘(`iconSecondary`) + 간격 `spacing.md` + 텍스트(`subheadline semibold`/`textPrimary`).
  3. (iOS만) 메시지: `footnote`/`textSecondary`.
  4. `ChalkakButton "분석 시작하기"` 전체 폭.
- 아이콘과 문구가 **다르다**.

| 줄 | iOS(SF 17pt) | Android(drawable 18dp) |
|---|---|---|
| 1 | `clock` `"결과가 나오기까지 몇 분 정도 소요될 수 있어요"` | `ic_clock` `"결과가 나오기까지 최대 1~2분 소요될 수 있어요"` |
| 2 | `iphone` `"앱을 나가도 분석은 계속되니 걱정마세요"` | `ic_smartphone` 같은 문구 |
| 3 | `bell` `"분석이 끝나면 알림으로 알려드릴게요"` | `ic_bell` 같은 문구 |

- 근거: iOS `iOS:Features/AIReview/Components/AIReviewStartSheet.swift:7-59`, Android `AiReviewComponents.kt:74-95, :136-165, :476-477`.
- iOS 시트
  - 패딩: 좌우 `spacing.xl`, 위 `spacing.xxl`. 배경 `surfaceElevated`(glass가 아니면).
  - 높이: 피드 320, 홈 320(`FeedScreen.swift:264, :691`, `HomeScreen.swift:193, :346`).
- Android 시트
  - `ModalBottomSheet`(기본 partially expanded 허용) + `AiReviewSheetDragHandle`. 내용 패딩 `spacing.xl`(`FeedScreen.kt:272-293`).

### 7.3 결과 내용

- 위→아래: (배지) → 요약 + 점수 링 → 구분선 → `"좋았던 점"` → `"아쉬운 점"` → 구분선 → `"다음엔 이렇게"` → 점수 기준 링크.
- 요약
  - iOS 홈 카드: `title3 bold`.
  - iOS 피드 시트: `headline bold`.
  - Android: 항상 `title3 Bold`.
- 점수 링
  - 트랙 `calendarCell`, 진행 `actionPrimary`, 선 8, round cap, 12시에서 시작.
  - 진행 = 점수/10. 숫자는 소수 1자리, `title1`.
  - 크기: iOS 홈 84 / 피드 76, Android 84.
  - 근거: iOS `HomeFeedbackCard.swift:168-183, :263-264`, `FeedAIReviewSheet.swift:122-131, :157-160`, Android `AiReviewComponents.kt:419-460, :478-479`.
  - 접근성: iOS `"종합 점수 10점 만점에 {x}점"`, Android `"전체 점수 10점 만점에 {x}점"`.
- 문단: `VStack(spacing.sm)`. 제목 + 본문(`subheadline`/`textSecondary`). iOS는 줄 간격 `spacing.xs`.
  - 제목: iOS 홈·Android는 `footnote semibold`, iOS 피드는 `caption semibold`.
- **해석 배지**(distinctivePerspective)
  - 문구: `"작가님의 해석이 돋보이는 작품이에요"`, 아이콘 SF `camera.aperture` / `RES:ic_aperture` 14dp.
  - iOS 홈·Android
    - 모양: `actionPrimary` 바탕 `shapes.small`, `caption semibold`/`onActionPrimary`, 패딩 sm/xs.
    - 탭하면 말풍선 팁: 아래 xs 간격, 화살표 12×6(start lg), 본문 폭 240, `actionPrimary` 바탕 `shapes.button`, 패딩 md, `footnote`/`onActionPrimary`.
    - 팁 문구가 다르다.
      - iOS: `"종합 점수와 별개로, 독특한 시각이 드러난 사진이라는 의미예요."`(`HomeFeedbackCard.swift:203-221`)
      - Android: `"구도 점수와 별개로, 주제 해석이 특별한 사진이라는 의미예요."`(`AiReviewComponents.kt:391-417`)
    - 아무 곳이나 탭하면 닫힌다.
  - iOS 피드 시트: `colors.background` 캡슐 배지이고 팁이 없다(`FeedAIReviewSheet.swift:107-115`).
- **점수 기준 링크**
  - iOS
    - 문구 `"찰캌 AI는 어떤 기준으로 점수를 내나요?"`: `caption` underline / `textSecondary`, 오른쪽 정렬, 최소 44.
    - alert 제목 `"찰칵 AI의 점수 기준"`, 버튼 `"확인"`(`AIReviewScoreExplanationButton.swift:8-16`).
  - Android
    - 문구 `"찰칵AI는 어떤 기준으로 점수를 내나요?"`: `footnote` underline, End, top sm.
    - 제목 없는 `AlertDialog`, `"확인"`(`AiReviewComponents.kt:289-335`).
  - 공통 본문: `"찰캌에서는 Nikon, PPA(Professional Photographers of America), Canon 등의 기준으로 학습된 AI를 통해 피드백을 해줘요!"`
  - ▶ "찰캌/찰칵" 표기와 띄어쓰기가 섞여 있다. 정리가 필요하다.

### 7.4 폴링

- 분석 중이면 3초마다 조회한다. 5분(300초)이 넘으면 멈춘다.
- 초과 문구: `"처리가 오래 걸리고 있어요. 나중에 다시 확인해 주세요."`
- 화면을 떠나거나 백그라운드로 가면 취소한다.
- 근거: iOS `FeedAIReviewViewModel.swift:78-95`, Android `AiReviewSession.kt:99, :157, :244-245`.

---

## 8. AI 리뷰 — 화면별

### 8.1 홈 카드 (HomeFeedbackCard)

iOS `iOS:Features/Home/Components/HomeFeedbackCard.swift`, Android `AND:feature/home/component/HomeFeedbackCard.kt`

- 컨테이너
  - 바탕 `surfaceElevated`, 모서리 `shapes.xlarge(18)`, 테두리 1 `border`.
  - 그림자
    - iOS: `actionPrimary` × 0.08, radius 12, y 5(:90-103).
    - Android: `shadow(elevation 12, ambient·spot actionPrimary 0.08)`(:74-85, :225-229).
- **헤더 행**(최소 높이 64)
  - 왼쪽: 제목(`callout semibold`/`textPrimary`). iOS는 펼치면 `headline`.
  - 오른쪽
    - 완료 상태: (접혔을 때) `"자세히 보기"`(`footnote`/`textSecondary`) + 44 박스 안 셰브런.
      - iOS: SF `chevron.down` 15 semibold.
      - Android: `RES:ic_chevron_down` 16.
      - 색 `iconSecondary`, 펼치면 180° 회전.
    - 그 외 상태: 32 원(`actionPrimary`) 안 웨이브 아이콘(`onActionPrimary`). 재요청할 수 있는 실패면 왼쪽에 `"재요청"`(`footnote`/`textSecondary`).
  - 패딩
    - iOS: leading `spacing.lg`(펼치면 xl), trailing `spacing.sm`(:62-64).
    - Android: start `spacing.xl`, end `spacing.sm`(:153-156).
  - 눌림: opacity 0.8(iOS :249-254, Android :152, :226).
- **상태별 제목**

| 상태 | 제목 | 동작 |
|---|---|---|
| ready | `"이 사진, AI에게 피드백 받아보기"` | 탭하면 시작 시트 |
| processing | `"AI 피드백이 진행중이에요"` | 비활성, 웨이브 애니메이션 |
| completed | `"AI 피드백이 완료되었어요"` | 탭하면 펼침/접힘 |
| failed | `"AI 피드백을 생성하지 못했어요"` | 재요청 가능 시에만 탭 → 바로 재요청 |
| (iOS만) loading | `"AI 피드백 상태를 확인하고 있어요"` | 비활성 |
| (iOS만) unavailable | `"AI 피드백을 확인할 수 없는 게시물이에요"` | 비활성 |
| (iOS만) loadError | `"AI 피드백 상태 다시 확인"` | 탭하면 재시도 |
| (iOS만) 요청 중 | `"AI 피드백을 요청하고 있어요"` | 비활성 |

  - 근거: iOS :109-128, Android :122-134.
- 폴링 초과 시(iOS): 헤더 아래 7.4절 문구(`footnote`, 좌우·아래 lg)(:76-82).
- **펼침 애니메이션**
  - iOS
    - `withAnimation(.easeInOut) { toggle }`(`HomeScreen.swift:64`).
    - 셰브런은 심볼 교체 대신 회전으로 처리한다. 두 화살표가 겹치지 않게 하려는 처리다(:42-48).
    - 카드를 `clipShape`로 잘라 상세가 카드 밖으로 비치지 않게 한다(:91-93).
  - Android
    - 상세: `AnimatedVisibility(expandVertically + fadeIn / shrinkVertically + fadeOut)`(:94-109).
    - 셰브런: `animateFloatAsState`(기본 spring)(:175-178).
  - 상세 패딩: 좌우·아래 `spacing.xl`.

▶ 상태 표현은 iOS가 더 풍부하다(로딩·조회 불가·조회 실패·요청 중·시간 초과). 펼침 전환은 Android가 콘텐츠 페이드까지 포함해 더 부드럽다.

### 8.2 피드 pill (FeedAIReviewButton / AiReviewPill)

- 노출 조건
  - 내 게시물일 때만.
  - iOS: 오늘 사진이거나 완료 상태(`FeedAIReviewViewModel.swift:43-45`).
- 위치
  - iOS: bottomTrailing, trailing `spacing.lg` / bottom `spacing.md`(`FeedScreen.swift:121-128`).
  - Android: BottomEnd, 사방 `spacing.lg`(:386-412).
- 모양
  - iOS(`FeedAIReviewSheet.swift:163-197`)
    - 캡슐, 바탕 `surfaceElevated` + 테두리 1 `border`. iOS 26이면 glass.
    - 최소 높이 44, 좌우 `spacing.lg`.
    - 웨이브(24 프레임) + 간격 `spacing.sm` + 텍스트(`subheadline semibold`/`textPrimary`).
    - 조회·요청 중이면 비활성.
  - Android(`FeedScreen.kt:417-481`)
    - **고정 폭**: 기본 148, 분석 중 120, 재요청 160. 높이 44.
    - 모서리 반지름 `spacing.xl`(24) 값을 `RoundedCornerShape`로 쓴다(토큰 오용).
    - 사진 위에 겹치면 바탕 `surfaceElevated` × 0.7, 테두리 투명. 아니면 불투명 + `border` 1.
    - 좌우 `spacing.lg`, 내부 `spacedBy(spacing.sm, CenterHorizontally)`.
- 문구
  - 공통: `"AI 피드백 받기"` / `"AI 분석중"` / `"AI 피드백 보기"` / `"AI 피드백 재요청"` / `"AI 피드백 실패"`.
  - iOS 추가: `"AI 상태 확인중"` / `"AI 요청중"` / `"AI 상태 다시 확인"`(`FeedAIReviewViewModel.swift:56-65`).
- 탭 동작
  - ready → 시작 시트.
  - completed → 결과 시트.
  - 재요청할 수 있는 failed → 시작 시트(재요청 제목). 그 외 failed → 실패 시트.
  - processing → 비활성.
- 진입 시 자동 열기: 알림 등으로 `opensAIReviewOnEntry` / `openAiReviewResult`로 들어오면 결과·실패 시트를 한 번 자동으로 연다(iOS :149-153, Android :201-210).
- 콘텐츠 하단 여백: iOS는 pill이 있으면 90(:344, :690). Android는 따로 늘리지 않고 반투명으로 겹침을 처리한다.

▶ 사진과 겹칠 때 반투명으로 바꾸는 처리는 Android만 있다. 문구 길이에 따른 폭은 iOS가 자연스럽다(고정 폭 아님).

### 8.3 피드 시트 (FeedAIReviewSheet / AiReviewResultSheet / AiReviewFailureSheet)

**iOS** — 시트 하나가 상태에 따라 내용을 바꾼다(`FeedAIReviewSheet.swift`)
- 공통: 손잡이 표시. glass가 아니면 `shapes.sheet` + `surfaceElevated`(:9-24).
- 높이
  - 시작: 320.
  - 실패 이유: 240.
  - 진행·결과: 510 + large(`FeedScreen.swift:263-267, :691-693`).
- 내용
  - 요청할 수 있으면: 시작 시트(7.2절).
  - 최종 실패: 제목 `"AI 피드백을 생성하지 못했어요"`(`headline`) + 이유(`body`/`textSecondary`) + `ChalkakButton "확인"`. 간격 lg, 좌우 xl, 위 xxl(:87-103).
    - 이유 문구: `"이 사진은 더 이상 AI 피드백을 요청할 수 없어요."` / `"AI 피드백은 오늘 올린 사진만 재요청할 수 있어요."`(`FeedAIReviewViewModel.swift:70-75`).
  - 그 외: ScrollView, `VStack(spacing.xl)`, 좌우 xl, 위 xxl, 아래 xl(:37-55).
    - 제목(`headline`): `"AI 피드백이 완료되었어요"` / `"AI가 사진을 분석하고 있어요"` / `"AI 피드백을 생성하지 못했어요"` / `"AI 피드백"`(:59-66).
    - 완료면 결과(7.3절).
    - 아니면 상태 내용(:68-85)
      - 조회 중이면 `ProgressView`.
      - 안내(`body`/`textSecondary`): `"앱을 나가도 분석은 계속돼요. 분석이 끝나면 알림으로 알려드릴게요."` / 폴링 초과 문구 / `"잠시 후 다시 확인해 주세요."`
      - `"상태 다시 확인"` 버튼(`callout`/`actionPrimary`, 최소 44).
- 요청 후 상태가 processing·completed가 되면 시트를 닫는다(`FeedScreen.swift:131-138`).

**Android** — 시트가 셋으로 나뉜다(`AiReviewComponents.kt`)
- 결과 시트: `skipPartiallyExpanded`, 커스텀 핸들. 스크롤, 패딩 xl, `spacedBy lg`. 제목 `"AI 피드백이 완료되었어요"`(`headline SemiBold`) + 결과(:167-197).
- 실패 시트: 제목 + 메시지(`body`/`textSecondary`) + `"확인"` 버튼. 좌우·아래 xl(:205-252).
- 시작 시트: 7.2절.
- 그 외 메시지: 시스템 `AlertDialog`(본문만, `"확인"`)(`FeedScreen.kt:243-252`).
  - 문구 예: `"네트워크 연결을 확인해 주세요."` / `"AI 피드백 정보를 불러오지 못했어요."` / 401 `"다시 로그인해 주세요."` / 403 `"이용이 정지된 회원은 AI 리뷰를 요청할 수 없습니다."` / 404 `"AI 피드백을 확인할 수 없는 게시물이에요."`(`AiReviewSession.kt:231-239`).
- iOS 조회 오류 문구
  - `"AI 피드백을 확인할 수 없는 게시물이에요."`
  - `"이용이 제한되어 AI 피드백을 요청할 수 없어요."`
  - `"AI 피드백을 불러오지 못했어요. 잠시 후 다시 확인해 주세요."`
  - `"로그인이 필요합니다."`
  - 근거: `FeedAIReviewViewModel.swift:166-176`.

### 8.4 시트 손잡이 (AiReviewSheetDragHandle, Android)

- 보이는 막대: 32×4, `iconSecondary`, 원형 클립. 터치 영역 48×48. ripple은 막대에만 적용한다.
- 탭 동작: 부분 펼침이면 펼친다(`"시트 펼치기"`). 아니면 숨기고 닫는다(`"시트 닫기"`).
- 사인 안내·AI 시트에 같이 쓴다(`AiReviewComponents.kt:551-597`).
- iOS는 시스템 `presentationDragIndicator(.visible)`를 쓴다.

---

## 9. 구현 시 우선 정리할 차이 (요약)

1. **확인 문구·배치**: 피커 시트("완료" 헤더 ↔ "확인" 하단 버튼), 삭제 다이얼로그 문구, 제목 수정 placeholder 마침표, AI 시작 안내 소요 시간 문구, 해석 팁 문구, "찰캌/찰칵" 표기가 플랫폼마다 다르다.
2. **빈 상태 문구·아이콘**(전시)과 **에러 재시도 UI**(원형 아이콘 ↔ 텍스트 버튼)가 다르다.
3. **편집기**: 정보 구조(2단계 ↔ 탭), 필터 목록, 회전 방향, 좌우 반전 유무, 강조색(#FFD60A 유무)이 다르다.
4. **좋아요**: 전시 화면의 낙관적 업데이트 여부가 다르다. 하트 애니메이션은 양쪽 모두 없다.
5. **로딩**: 스켈레톤은 iOS만 있다(지연 0.5s / 최소 0.25s / shimmer 1.2s).
6. **전환**: 곡선은 300ms FastOutSlowIn(0.4, 0, 0.2, 1)으로 같다. 백 스와이프·화면 접기·Reduce Motion 대응은 iOS만 있다.
7. **하드코딩 값**(Android): #8C8479(전시 설명), #E8E6E1(헤더 선), #7D7D7D(피드 액션), pill 모서리 24(`spacing.xl`을 모양에 씀). 토큰화가 필요하다.
