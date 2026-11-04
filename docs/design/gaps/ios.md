# iOS 원본 대비 차이

기준은 `docs/design/README.md`, `screens-a.md`·`screens-b.md`·`screens-c.md`, `shared/design/tokens.json`이다. 처리 열은 맞춤 / 플랫폼 관례로 유지 / 보류로 적는다. 기능, testID, 문구, ViewModel, 분석 이벤트는 바꾸지 않았다.

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
| 하단 바 Liquid Glass·스크롤 시 숨김 | 원본은 iOS 26에서 glass 효과와 스크롤 숨김 | 보류. CI가 Xcode 16이라 iOS 26 API(`glassEffect`)를 컴파일할 수 없다. 평면 스타일 유지, `ChalkakBottomBarScrollBehavior`는 쓰이지 않아 삭제 |

## 화면

| 화면 | 원본 기준 | 수정 전 | 처리 |
|---|---|---|---|
| 탭 셸·하단 바 | screens-a §8 | 기본 탭 모양 | 맞춤. 위 하단 바 참고 |
| 홈 | screens-a §9 | 간격·제목 크기 불일치, 스피너 로딩 | 맞춤. 상단 바, 히어로 카드, AI 카드, 주간 줄, 랭킹, 이슈 구역 수치와 스켈레톤. 랭킹 좋아요 수와 testID는 기능 유지를 위해 남김(원본엔 없음) |
| 홈 AI 카드 확장 상세 | screens-a §9 | 없음 | 보류. 확장 애니메이션은 동작 변경 범위라 제외 |
| 전시 | screens-b §3 | 날짜 헤더·정렬·주제 카드 수치 불일치 | 맞춤. 날짜 헤더, 주제, 정렬 선택기, 캐러셀, 피커 시트 |
| 전시 마손리 그리드 | screens-b §3 | 균등 그리드 | 보류. 레이아웃 엔진 교체라 위험이 큼 |
| 피드 상세 | screens-b §4 | 상단 바·좋아요 행·다이얼로그 불일치 | 맞춤. `PostLikeButton`, 상단 바, 다이얼로그 |
| 피드 확대 전환(줌)·공유 요소 | screens-b §4 | 일반 push | 보류. iOS 18 `navigationTransition(.zoom)`은 화면 구조 변경이 필요 |
| 피드 사인 안내 시트 | screens-b §4 | 없음 | 보류 |
| 좋아요 | screens-b §5 | 기본 하트 | 맞춤 |
| 로그인 | screens-a §3 | 임의 버튼 높이·로고 | 맞춤. `ChalkakLogo`, 버튼 컴포넌트 |
| 약관(가입) | screens-a §4 | 기본 체크 | 맞춤. `ChalkakCheckbox`, 버튼 |
| 약관 문서 시트 | screens-a §4 | 스피너, 손으로 만든 재시도 버튼 | 맞춤. `ChalkakButton` 재시도, 보조 문구 크기 |
| 온보딩·사인 그리기·미리보기 | screens-a §5~6 | 임의 간격·버튼 | 맞춤. `SignaturePad`, 두 단계 화면, 사인 변경 화면 |
| 기록 | screens-c §4 | 빈 상태·로딩 불일치 | 맞춤. 상단 바, 빈 상태, 스켈레톤 |
| 기록 기둥·책·연간 달력 | screens-c §4 | 단순 목록 | 보류. 전용 레이아웃과 렌더링이 커서 별도 작업 |
| 알림함·알림 상세 | screens-c §5 | 리스트 행·스위치 불일치 | 맞춤 |
| 설정 | screens-c §6 | 행 수치·스위치 색 불일치 | 맞춤. 리스트 행, 스위치 색, 버튼 |
| 설정 게스트·로딩 변형 | screens-c §6 | 일부 없음 | 보류 |
| 피드백 | screens-c §7 | 기본 텍스트 영역 | 맞춤. `ChalkakTextField`, 글자 수, 버튼 |
| 업로드 | screens-b §6 | 사진 영역·입력·성공 카드 불일치 | 맞춤 |
| 업로드 제스처 닫기·키보드 내림 | screens-b §6 | 없음 | 보류. 동작 변경 |
| 사진 편집 | screens-b §7 | 밝은 배경 | 맞춤. editor 토큰(어두운 배경, 콘텐츠색) |
| 사진 편집 눈금 슬라이더·조정 링·Mantis 크롭 | screens-b §7 | 기본 슬라이더·단순 크롭 | 보류. 제스처·렌더링 신규 구현 필요 |
| AI 리뷰 시트 | screens-b §8 | 평면 목록 | 맞춤. 시트 라운드 28, 시작 시트 정보 상자, 결과 점수 링, 실패 시트 |
| 배너(이슈) 웹뷰 | screens-c §8 | 스피너, 손으로 만든 재시도 버튼 | 맞춤. 상단 바, `ChalkakButton` 재시도 |
| 스플래시·업데이트 안내·설정 오류 | screens-c §9 | 기본 모양 | 보류. 기능 화면이 아니고 변경 영향이 작아 후순위 |

## 플랫폼 관례로 유지

| 항목 | 이유 |
|---|---|
| 시트 제스처, 스와이프 뒤로가기 | iOS 기본 동작을 따른다 |
| 시스템 키보드·휠 접근성 레이블 | 연도·월·일 한국어 레이블을 직접 지정 |

## CI

`.github/workflows/ios.yml`은 `pull_request`와 `main` push(paths `ios/**`, `shared/**`, 워크플로 파일)에서만 돈다. 브랜치 push만으로는 실행되지 않으므로 PR을 만들어 확인한다. CI는 Xcode 16, macos-15라서 iOS 26 전용 API는 쓰지 않았다.
