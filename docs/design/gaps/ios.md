# iOS 원본 대비 차이

기준은 `docs/design/README.md`, `screens-a.md`·`screens-b.md`·`screens-c.md`, `shared/design/tokens.json`이다. 처리 열은 맞춤 / 플랫폼 관례로 유지 / 보류로 적는다. 기능, testID, 문구, ViewModel, 분석 이벤트는 바꾸지 않았다.

2차 작업(전시 마손리·피드 줌·편집 눈금자·업로드 제스처·스플래시)도 같은 환경에서 Swift를 실행하지 못했다. Swift 6 언어 모드와 Xcode 16 SDK 기준으로 작성했고 iOS 26 전용 API는 쓰지 않았다. 컴파일은 PR CI에서 확인한다.

검증 상태: 이 작업 환경에는 Swift와 Xcode가 없어 `swift test`와 xcodebuild를 실행하지 못했다. 토큰 대조 테스트(`DesignTokenContractTests`)는 같은 비교를 파이썬으로 한 번 돌려 어긋남 0건을 확인했다. 컴파일과 테스트는 PR의 iOS CI(macOS 15, Xcode 16)에서 확인한다.

## 토큰

| 항목 | 원본 기준 | 수정 전 | 처리 |
|---|---|---|---|
| 색 | README §2, tokens.json color | skeleton, editor, calendar, logoBackground, 텍스트 불투명도 단계 일부 없음 | 맞춤. tokens.json의 모든 색을 `ChalkakColor`로 정의 |
| 타이포 | README §2, tokens.json font | title1~3, handwriting, photoCardTitle, brand가 없고 시스템 글꼴 혼용 | 맞춤. 번들 Pretendard·Continuous·GriunXHangeulBanguri만 사용 |
| 줄 높이·자간 | tokens.json lineHeight, brand letterSpacing | 미적용 | 맞춤(일부). `chalkakBrandStyle()`로 브랜드 자간 적용. SwiftUI `Font`는 줄 높이를 담지 못해 `chalkakLineHeight`로 주요 다줄 텍스트에만 적용 |
| 간격·라운드 | tokens.json spacing, radius | 라운드 7/14/18/28 없음, 임의 숫자 산재 | 맞춤. `ChalkakSpacing`·`ChalkakRadius`로 치환 |
| 값 대조 테스트 | README §5 | 없음 | 맞춤. `ios/ChalkakKit/Tests/ChalkakCoreTests/DesignTokenContractTests.swift`(색, 간격, 라운드, 서체·크기) |
| 라이트 고정 | README §2 | `UIUserInterfaceStyle` Light 이미 지정 | 맞춤(유지) |

## 공통 컴포넌트 (screens-a.md §1, screens-b.md §1, screens-c.md §1)

| 컴포넌트 | 수정 전 | 처리 |
|---|---|---|
| 주 버튼·아웃라인 버튼 | 화면마다 손으로 만든 버튼, 높이·라운드 제각각 | 맞춤. `ChalkakButton`·`ChalkakOutlinedButton`(세로 17, 라운드 12, 비활성 12% 배경)으로 통일 |
| 눌림 스타일 | 기본 하이라이트 | 맞춤. `ChalkakUnhighlightedButtonStyle`·`ChalkakPressOpacityButtonStyle` |
| 상단 바·뒤로 버튼 | SF Symbol 직접 배치 | 맞춤. `ChalkakNavBar`·`ChalkakNavigationButton`(ic_ 아이콘, 44pt 히트) |
| 체크박스 | SF Symbol 원형 | 맞춤. `ic_checkbox_*` 아이콘 |
| 텍스트필드 | 기본 테두리 필드 | 맞춤. `ChalkakTextField`(입력 배경, 라운드 14, 커서색, 글자 수 표시) |
| 로고·오디오 웨이브 아이콘 | 텍스트 임시 | 맞춤. `ChalkakLogo`, `ChalkakAudioWaveIcon` |
| 스켈레톤 | `ProgressView` 스피너 | 맞춤. `ChalkakSkeleton`(밴드 0.6, 1.2초 선형, 표시 지연 0.5초, 최소 0.25초) |
| 원격 이미지·플레이스홀더 | 기본 `AsyncImage` | 맞춤. `ChalkakRemoteImage` |
| 토스트 | 기본 알림 모양 | 맞춤. `ChalkakToast` 캡슐 |
| 정렬 선택기 | 메뉴 버튼 | 맞춤. `ChalkakSortSelector` |
| 피커 시트·휠 | 기본 휠 | 맞춤. `ChalkakPickerSheet`(라운드 28 시트, 휠 3열) |
| 다이얼로그 | 시스템 alert | 맞춤. `ChalkakDialog` |
| 빈 상태 | 텍스트만 | 맞춤. 화면 문서의 아이콘·문구 배치 |
| 하단 바 | 기본 TabView 모양 | 맞춤. `ChalkakBottomBar`(ic_bottom_*, 가운데 작성 버튼, bottomBar 색) |
| 하단 바 Liquid Glass·스크롤 시 compact | 원본은 iOS 26에서 glass 효과와 스크롤 시 compact 전환 | 적용(iOS 26 이상, 미만은 평면). `ChalkakPlatformAppearance.usesLiquidGlass`(디버그 `-use-flat-ios-design`), 떠 있는 glass 캡슐·렌즈·scrub 제스처·`ChalkakBottomBarScrollBehavior`, 내비·피드 액션 버튼 `.glass`, 시트 시스템 유리 배경, 사진 편집 항목 glass. CI는 Xcode 26. 하단 바는 내용 위에 겹치지 않고 아래에 쌓는다(PR #83). 기록 월 이동 버튼·피드 AI 알약·툴바 공유 배경은 해당 요소가 원본에 없거나 달라 평면 유지 |

## 화면

| 화면 | 원본 기준 | 수정 전 | 처리 |
|---|---|---|---|
| 탭 셸·하단 바 | screens-a §8 | 기본 탭 모양 | 맞춤. 위 하단 바 참고 |
| 홈 | screens-a §9 | 간격·제목 크기 불일치, 스피너 로딩 | 맞춤. 상단 바, 히어로 카드, AI 카드, 주간 줄, 랭킹, 이슈 구역 수치와 스켈레톤. 랭킹 좋아요 수와 testID는 기능 유지를 위해 남김(원본엔 없음) |
| 홈 AI 카드 확장 상세 | screens-a §9 | 없음 | 보류(2차 재검토). 원본은 카드 안에서 결과를 펼치지만 이 앱의 규칙은 "자세히 보기"가 결과 시트를 여는 것이다(REQ-AIR-037, `home.ai-detail-button`). 인라인 펼침으로 바꾸면 상호작용이 달라지므로 규칙 결정 후 진행 |
| 전시 | screens-b §3 | 날짜 헤더·정렬·주제 카드 수치 불일치 | 맞춤. 날짜 헤더, 주제, 정렬 선택기, 캐러셀, 피커 시트 |
| 전시 마손리 그리드 | screens-b §3 | 균등 그리드 | 맞춤(2차). 2열 그리디 패킹(열 높이 = 비율 + 0.06, 측정 전 4/3), 사진 비율은 썸네일 헤더에서 한 번 측정(`ImageRatioLoader`, EXIF 방향 반영), 카드 사인 합성(40×30), 등장 transition과 0.2초 애니메이션(동작 줄이기에서는 끔). 끝 4장 안 감지는 기존 `itemAppeared`가 맡는다 |
| 피드 상세 | screens-b §4 | 상단 바·좋아요 행·다이얼로그 불일치 | 맞춤. `PostLikeButton`, 상단 바, 다이얼로그 |
| 피드 확대 전환(줌)·공유 요소 | screens-b §4 | 일반 push | 맞춤(2차, 플랫폼 관례). 전시 그리드·대표 사진 카드를 `matchedTransitionSource`로 등록하고 피드를 `navigationTransition(.zoom)`으로 연다(iOS 18, 배포 대상 18.0). 전시 탭에서 연 경우에만 적용하고 홈·알림 진입은 기본 전환. 동작 줄이기는 시스템이 페이드로 대체. 원본의 직접 구현 곡선 보간·화면 접기·속도 이어받기 스와이프는 옮기지 않음 |
| 피드 뒤로 스와이프 | screens-b §4 | 상단 바를 숨겨 시스템 스와이프가 꺼짐 | 맞춤(2차). 왼쪽 가장자리 스와이프 뒤로가기를 다시 켜는 `edgeSwipeBackEnabled`(피드 화면) + 줌 전환의 시스템 끌어 닫기 |
| 피드 사진 핀치 해제 | screens-b §4.3 | 0.3초 되돌림 | 맞춤(2차). 동작 줄이기에서는 애니메이션 없이 원래 크기로 |
| 피드 사인 안내 시트 | screens-b §4.5 | 없음 | 보류(2차 재검토). 시트가 안내하는 "사인 눌러 작가 사진 모아보기"(AuthorPosts) 화면이 이 앱에 없고 문구도 `shared/copy/ko.json`에 없다. 닫은 뒤 다시 띄우지 않는 기록도 새 상태다. 작가 모아보기 기능과 함께 결정 필요 |
| 좋아요 | screens-b §5 | 기본 하트 | 맞춤 |
| 로그인 | screens-a §3 | 임의 버튼 높이·로고 | 맞춤. `ChalkakLogo`, 버튼 컴포넌트 |
| 약관(가입) | screens-a §4 | 기본 체크 | 맞춤. `ChalkakCheckbox`, 버튼 |
| 약관 문서 시트 | screens-a §4 | 스피너, 손으로 만든 재시도 버튼 | 맞춤. `ChalkakButton` 재시도, 보조 문구 크기 |
| 온보딩·사인 그리기·미리보기 | screens-a §5~6 | 임의 간격·버튼 | 맞춤. `SignaturePad`, 두 단계 화면, 사인 변경 화면 |
| 기록 | screens-c §4 | 빈 상태·로딩 불일치 | 맞춤. 상단 바, 빈 상태, 스켈레톤 |
| 기록 기둥·책·연간 달력 | screens-c §4 | 단순 목록 | 보류. 전용 레이아웃과 렌더링이 커서 별도 작업 |
| 알림함·알림 상세 | screens-c §5 | 리스트 행·스위치 불일치 | 맞춤 |
| 설정 | screens-c §6 | 행 수치·스위치 색 불일치 | 맞춤. 리스트 행, 스위치 색, 버튼 |
| 설정 게스트·로딩 변형 | screens-c §4.6 | 일부 없음 | 확인 후 유지(2차). 게스트는 REQ-SET-002에 따라 로그인 행만 보이며(원본은 피드백·약관 카드도 보임) 이미 원본 로그인 행 수치(actionPrimary, large, 좌우 20 상하 16, chevron 13)를 따른다. 로딩은 원본이 빈 자리 56을 두는 반면 이 앱은 `settings.signature-loading`·`settings.push-loading` testID가 있는 표시와 비활성 스위치를 쓰므로 그대로 둔다 |
| 피드백 | screens-c §7 | 기본 텍스트 영역 | 맞춤. `ChalkakTextField`, 글자 수, 버튼 |
| 업로드 | screens-b §6 | 사진 영역·입력·성공 카드 불일치 | 맞춤 |
| 업로드 제스처 닫기·키보드 내림 | screens-b §5.3 | 없음 | 맞춤(2차). 키보드가 떠 있으면 뒤로 가기가 키보드를 먼저 내리고 다 내려간 뒤 이동, 아래로 끌어 닫기(맨 위, 입력칸 밖에서 시작, 세로 우세, 80 이상 또는 예측 140 이상). 닫기는 기존 `shell.pop()`과 같은 경로. 작성 중 이탈 확인 alert은 이 앱의 상태 모델에 없어 옮기지 않음(규칙 결정 필요) |
| 사진 편집 | screens-b §7 | 밝은 배경 | 맞춤. editor 토큰(어두운 배경, 콘텐츠색) |
| 사진 편집 눈금 슬라이더·조정 링·조정 아이콘 | screens-b §6.2 | 기본 슬라이더·텍스트 칩 | 맞춤(2차). 원본 `PhotoEditAdjustControls` 이식: 56pt 원 항목에 SF Symbol 아이콘(선택하면 값 숫자), 값만큼 채워지는 링(음수는 반시계), 눈금자(높이 44, 50칸×8, 지난 눈금 잔상 0.3초, 자동 보정 값 점·멈춤, 관성, 햅틱, 접근성 ±0.1, 동작 줄이기에서 잔상·관성 끔). 값·testID(`photo-edit.adjust-*-slider`, `adjust-auto-toggle` 등)는 그대로이고 자동 토글·초기화는 윗줄로 이동. `editorControl`(#1C1C1E)·`editorAccent`(#FFD60A)는 tokens.json에 없어 편집기 안 상수로 둠 |
| 사진 편집 Mantis 크롭 | screens-b §6 | 단순 크롭 프레임 | 보류. 외부 라이브러리 기반 크롭 UI는 신규 구현이 필요하고 현재 프레임·비율 동작을 바꿀 위험이 있다 |
| AI 리뷰 시트 | screens-b §8 | 평면 목록 | 맞춤. 시트 라운드 28, 시작 시트 정보 상자, 결과 점수 링, 실패 시트 |
| 배너(이슈) 웹뷰 | screens-c §8 | 스피너, 손으로 만든 재시도 버튼 | 맞춤. 상단 바, `ChalkakButton` 재시도 |
| 스플래시 | screens-a §2.1 | 로고 160, 런치 스크린 비어 있음 | 맞춤(2차). `project.yml`의 `UILaunchScreen`에 배경색 `ChalkakLogoBackground`·이미지 `ChalkakLaunchLogo` 지정, `SplashView` 로고를 220×220으로 맞춰 끊김 없이 이어짐, 라우트 전환 cross-fade(동작 줄이기에서는 끔) |
| 업데이트 안내 | screens-a §2.1 | `ChalkakDialog` | 확인 후 유지(2차). iOS는 닫을 수 없는 alert 한 개이고 이미 `ChalkakDialog`(제목·본문·버튼 하나)로 같은 모양이다. 문구는 `AuthCopy` 그대로 |
| 설정 오류 화면 | 원본 없음(내부 오류) | 빨간 제목 + 본문 | 맞춤(2차). 경고 아이콘, title3 제목, callout 본문, 화면 가운데 정렬. `config-error.root` testID 유지 |

## 플랫폼 관례로 유지

| 항목 | 이유 |
|---|---|
| 시트 제스처, 스와이프 뒤로가기 | iOS 기본 동작을 따른다 |
| 시스템 키보드·휠 접근성 레이블 | 연도·월·일 한국어 레이블을 직접 지정 |

## CI

`.github/workflows/ios.yml`은 `pull_request`와 `main` push(paths `ios/**`, `shared/**`, 워크플로 파일)에서만 돈다. 브랜치 push만으로는 실행되지 않으므로 PR을 만들어 확인한다. CI는 Xcode 16, macos-15라서 iOS 26 전용 API는 쓰지 않았다.
