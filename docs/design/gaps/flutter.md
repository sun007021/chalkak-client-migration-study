# Flutter 클라이언트: 원본 대비 차이와 처리

기준: `docs/design/README.md`, `screens-a/b/c.md`, `shared/design/*`. 기능·ViewModel·testID·문구·분석 이벤트는 바꾸지 않았다.
처리 표기: 맞춤 / 관례 유지 / 보류(이유).

## 토큰과 에셋

| 대상 | 원본 기준 | 수정 전 | 처리 |
|---|---|---|---|
| 색·간격·라운드·타이포 | README §2, `tokens.json` | Material 기본(보라 시드), 시스템 글꼴, 화면마다 하드코딩 | 맞춤. `core/design/chalkak_tokens.dart`(`ThemeExtension<ChalkakTokens>`)와 `chalkak_theme.dart`로 ColorScheme·Text·버튼·앱바·스위치·진행 표시를 덮어쓰고 surfaceTint 투명, 스플래시 토큰화, 라이트 고정 |
| 글꼴 | README §3 | 시스템 글꼴 | 맞춤. Pretendard 400/600/700, Continuous, GriunXHangeulBanguri를 pubspec `fonts:`로 번들 |
| 아이콘 | README §3 (`ic_*` 44개) | Material `Icons.*` | 맞춤. `assets/icons`(shared 복사) + `flutter_svg`의 `ChalkakIcon`. 단색 아이콘은 srcIn 틴트 |
| 값 대조 | README §5 | 없음 | 맞춤. `test/core/design/chalkak_tokens_test.dart`가 tokens.json·글꼴·아이콘 파일을 대조하고 테마 적용(라이트 고정)을 확인, `test/core/ui/components/chalkak_components_test.dart`가 버튼·다이얼로그 스펙을 확인 |

## 공통 컴포넌트 (screens-a §1, screens-c §1)

| 컴포넌트 | 수정 전 | 처리 |
|---|---|---|
| 주 버튼 / 아웃라인 버튼 | 기본 FilledButton | 맞춤. 가로 24 세로 17, 라운드 12, 비활성은 actionPrimary 12% (`ChalkakButton`, `ChalkakOutlinedButton`) |
| 체크박스 | Material Checkbox | 맞춤. `ic_checkbox_*` (`ChalkakCheckbox`) |
| 텍스트 필드 | 기본 OutlineInputBorder | 맞춤. inputBackground, 라운드 14, 커서 inputCursor (`ChalkakTextField`) |
| 로고 / 스켈레톤 | 텍스트, 스피너 | 맞춤. `ChalkakLogo`, 쉬머 1.2초 폭 0.6 (`LoadingSkeleton`) |
| 토스트 | SnackBar 계열 | 맞춤. 캡슐, 2.5초 (`toast_host.dart`) |
| 확인 다이얼로그 | AlertDialog | 맞춤. 40/24/26 여백, 라운드 16, 버튼 2등분 간격 10 (`ChalkakDialog`). 로그인 오류·로그아웃/탈퇴·피드 삭제·서명 오류·AI 기준·편집 오류에 적용 |
| 뒤로/닫기 버튼 | IconButton | 맞춤. 48 영역, `ic_arrow_back`/`ic_close` (`ChalkakNavButton`) |
| 로딩·빈·오류 상태 | 기본 스피너, 평문 | 맞춤. `ChalkakSpinner`, `ChalkakEmptyState`, `ChalkakStatusText`, 원형 재시도 버튼 |
| 이미지 플레이스홀더 | 회색 박스 | 맞춤. 스켈레톤 색 사용 (`AppNetworkImage`) |

## 화면

| 화면 | 원본 기준 | 수정 전 | 처리 |
|---|---|---|---|
| 탭 셸·하단 바 | screens-a §3 | Material NavigationBar | 맞춤. 아이콘 23, 간격 7, 위 15 아래 10, 가운데 작성 버튼, bottomBar 색 |
| 홈 | screens-a §4 | 기본 Card·Chip | 맞춤. 히어로 5/6, 주간 기록, 랭킹 카드 82, 이슈 카드, 스켈레톤·빈·오류 상태 |
| 전시 | screens-b §2 | 기본 앱바·버튼 | 맞춤. 상단 바·날짜 피커 시트·화살표 아이콘·그리드 카드 3:4 간격 12·빈/오류 |
| 피드·좋아요 | screens-b §3 | 기본 하트 아이콘, AlertDialog | 맞춤. SVG 하트(이미지 위 모드), 상단 바 수정/삭제, 좋아요 행 높이 57, ChalkakDialog, 서명 사진 inset 8 |
| 로그인·부트 | screens-a §2 | 텍스트 로고, 기본 버튼 | 맞춤. 로고·소셜 버튼·오류 다이얼로그 |
| 약관·온보딩·법률 문서 시트 | screens-a §5 | 기본 Checkbox·Dialog | 맞춤. `ic_checkbox_*`, 닫기 버튼, 스피너 |
| 사인 그리기·미리보기 | screens-a §6 | 어두운 임의색 | 맞춤. title1/subheadline, 캔버스 actionPrimary·획 textOnImage, 공통 버튼, 오류 다이얼로그. 점선 테두리·캡션·"사인" 플레이스홀더 글씨체는 보류(기능 변경 없이 가능하나 우선순위 낮음) |
| 기록 | screens-c §2 | 기본 IconButton·Card, 3:4 셀 | 맞춤(월 헤더, 요일 헤더, 1:1 셀 라운드 7, 선택/오늘 표시, 에러 영역, 저장 버튼). 보류: 기둥·책자 사진 묶음, 연간 달력, 선택 주 떠오름. 이 클라이언트에는 해당 기능·상태가 없어 기능 추가가 되므로 UI 다듬기 범위 밖 |
| 업로드·성공 | screens-b §5 | 기본 AppBar·OutlinedButton | 맞춤. 뒤로 버튼, 선택 타일, 텍스트 필드, 제출 버튼 스피너(onActionPrimary), 성공 카드 |
| 사진 편집 | screens-b §6 | fromSeed 다크 테마 | 맞춤. editor 토큰으로 테마, 칩·탭 줄 글꼴, 렌더링 오버레이, 오류 다이얼로그. 탭 줄과 도구 아이콘은 Material 유지(전용 에셋 없음) |
| AI 리뷰(시트·필·홈 카드) | screens-b §7 | 기본 Card·FilledButton.tonal | 맞춤. 시트 글꼴, 닫기 버튼, 공통 버튼, 홈 카드 |
| 알림함·상세 | screens-c §3 | 기본 ListTile 느낌 | 맞춤. 안 읽음 점 inputCursor, 썸네일 44 오른쪽, 구분선, 벨 빈 상태, 원형 아웃라인 재시도, 상세 1:1 틀 대신 높이 320 fit(보류: 정사각 틀) |
| 설정·서명 카드 | screens-c §4 | 기본 Card·SwitchListTile | 맞춤. 카드 행, 스위치 토큰 색, 로그아웃/탈퇴 다이얼로그 |
| 피드백 | screens-c §5 | 기본 TextField | 맞춤. 닫기 버튼, ChalkakTextField, 카운터 "N / 1000", 하단 고정 버튼 |
| 배너 웹 | screens-a §4.5 | 기본 AppBar | 맞춤(뒤로 버튼, 스피너). 앱바 구성은 Material 관례로 유지 |
| 화면 전환 | screens-c §6 | 기본 | 관례 유지. iOS Cupertino, Android Material 전환 사용 |

## 남은 차이

- 기록 화면의 기둥·책자 묶음, 연간 달력, 선택 주 떠오름은 보류(기능 범위).
- 사인 패드 점선 테두리·캡션, 알림 상세 정사각 사진 틀, 사진 편집 도구 아이콘 전용 에셋은 보류.
- 하단 바 접힘 연동(iOS `chalkakBottomBarScrollBehavior`)과 Liquid Glass 효과는 플랫폼 고유라 이식하지 않음.
- CI: 저장소에 Flutter 워크플로가 없어(`android.yml`, `ios.yml`, `react-native.yml`만 있음) 만들지 않았다. 로컬 검증은 `flutter/tool/check.sh`.
