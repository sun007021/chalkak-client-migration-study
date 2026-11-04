# 찰캌 공통 디자인 기준

다섯 클라이언트(iOS, Android, Flutter, React Native, Web)가 원본 찰캌 앱(팀 레포 `client/iOS`, `client/android`, 실제 배포본)과 **같은 수준의 완성도**로 보이게 하기 위한 기준이다. 기능 동작은 `docs/spec`이 기준이고, 이 문서는 생김새·느낌만 다룬다.

| 문서 | 내용 |
| --- | --- |
| 이 문서 | 원칙, 토큰, 에셋, 플랫폼별 대응 규칙, 완료 기준 |
| [screens-a.md](screens-a.md) | 공통 컴포넌트(버튼·체크박스·입력·로고·스켈레톤·토스트·하단 바) + 시작·로그인·약관·온보딩·서명·탭 셸·홈·Today·작성자 게시물 |
| [screens-b.md](screens-b.md) | 공통 컴포넌트(정렬·피커·이미지·다이얼로그) + 전시·피드·좋아요·업로드·편집·AI 리뷰 |
| [screens-c.md](screens-c.md) | 공통 컴포넌트(다이얼로그·빈 상태·토스트·상단 바·스위치·리스트 행) + 기록·알림·설정·피드백·화면 전환·오류 상태 |
| [gaps/](gaps/) | 플랫폼별 원본 대비 차이와 처리 결과 |

## 1. 원칙

1. **원본이 기준, 완성도는 원본 이상.** 색·글꼴·간격·라운드·아이콘·상태 화면·애니메이션을 원본 수치대로 맞춘다. 플랫폼 기본 위젯 모양(Material 기본 보라색, 시스템 파란 링크, 회색 기본 버튼, 기본 스피너만 있는 로딩 등)이 그대로 보이면 미완성이다.
2. **플랫폼 관례 차이는 허용.** 내비게이션 전환(iOS push / Android 예측형 뒤로가기), 시트 손잡이, 스위치·휠 피커, 햅틱, 스크롤 바운스, 시스템 다이얼로그는 플랫폼 것을 쓴다. 단, 색·글꼴·라운드는 토큰을 입힌다. iOS 26 이상에서 원본이 Liquid Glass를 쓰는 곳은 iOS 네이티브만 따른다.
3. **기능은 바꾸지 않는다.** testID, 문구(`shared/copy/ko.json`), 상태 전이, 분석 이벤트는 그대로 둔다. UI 수정으로 깨지는 테스트는 기대값이 생김새(색·크기)일 때만 고친다.
4. **하드코딩 금지.** 화면 코드는 토큰 이름만 쓴다. 토큰에 없는 수치(컴포넌트 높이, 그림자, 애니메이션 시간)는 컴포넌트 안 상수로 두고 screens 문서의 원본 근거를 주석으로 단다.
5. **라이트 테마만.** 원본은 라이트 고정이다. 다크 모드에서도 라이트 토큰을 쓴다(시스템 다크에 끌려가 배경만 검게 되는 일이 없게).

## 2. 토큰

원본 값은 [`shared/design/tokens.json`](../../shared/design/tokens.json) 하나가 기준이다. 플랫폼은 이 파일에서 생성하거나 같은 값을 옮기고, 대조 테스트(값 비교)를 하나 둔다.

### 2.1 색

| 토큰 | 값 | 쓰는 곳 |
| --- | --- | --- |
| background / surface | `#F7F6F3` | 모든 화면 바탕(따뜻한 오프화이트). 순백 `#FFFFFF` 바탕 금지 |
| surfaceElevated | `#FFFFFF` | 카드, 시트, 다이얼로그 |
| inputBackground | `#FCFAF6` | 입력칸, 피드백 입력 |
| textPrimary / actionPrimary / iconPrimary | `#2B2724` | 본문, 주 버튼 배경, 아이콘. 순검정 `#000` 금지 |
| textSecondary | `#2B2724` 68% | 보조 문구 |
| textMuted | `#2B2724` 48% | 날짜·메타 |
| iconSecondary | `#2B2724` 62% | 보조 아이콘 |
| textInactive | `#9A968D` | 비활성 탭·플레이스홀더 |
| bottomBar | `#8C8479` | 하단 바 비선택 아이콘 |
| border | `#888888` 15% | 카드·입력 테두리, 구분선 |
| inputCursor / accent / calendarSelection | `#B0563B` | 커서, 강조, 기록 달력 선택 |
| scrim | 검정 40% | 시트·다이얼로그 뒤 |
| error | `#BA1A1A` | 입력 오류 |
| destructive | `#FF5A5F` | 탈퇴·삭제 |
| calendarCell / calendarCellBorder | `#EAE7DE` / `#DCD8CE` | 기록 달력 칸 |
| skeletonBase / skeletonHighlight | `#EAE7DE` / `#F7F6F3` | 스켈레톤(쉬머) |
| editor* | `#141312` 등 | 사진 편집 화면(어두운 편집기) |

### 2.2 글꼴

| 패밀리 | 파일 | 쓰는 곳 |
| --- | --- | --- |
| Pretendard 400/600/700 | `shared/design/fonts/Pretendard-*.otf` | 모든 UI 문구 |
| Continuous | `Continuous-Regular.otf` | 브랜드 로고 글자(`brand`) |
| 그리운X한글반구리 | `GriunXHangeulBanguri-Regular.ttf` | 손글씨 느낌(오늘 주제, 사진 카드 제목: `handwriting`, `photoCardTitle`) |

| 스타일 | 굵기 | 크기/행간 |
| --- | --- | --- |
| display | 700 | 32/41 |
| title1 | 700 | 28/34 |
| title2 | 700 | 24/28 |
| title3 | 600 | 20/25 |
| headline | 600 | 18/22 |
| body | 400 | 17/22 |
| callout | 400 | 16/21 |
| subheadline | 400 | 14/20 |
| footnote | 400 | 13/18 |
| caption | 400 | 12/16 |
| brand | Continuous | 30/36, 자간 -0.42 |
| handwriting | 반구리 | 20/17 |
| photoCardTitle | 반구리 | 19/22 |

시스템 글꼴(SF, Roboto, 브라우저 sans-serif)이 화면에 보이면 미완성이다. 웹은 `@font-face` + `font-display: swap`, 접근성 글자 크기 확대는 플랫폼 방식(iOS `relativeTo`, Android sp, Flutter textScaler, RN allowFontScaling, Web rem)으로 지원한다.

### 2.3 간격·라운드

- 간격: `xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 40`, **화면 좌우 여백 `screenHorizontal` 25**.
- 라운드: `small 7 · button 12 · input 14 · photoCard 12 · large 16 · xlarge 18 · sheet 28 · pill(캡슐)`.
- 그림자·애니메이션 수치는 컴포넌트별로 screens 문서에 있다. 원본은 그림자를 아주 옅게 쓴다(검정 8~12%). 진한 Material elevation 그림자 금지.

## 3. 에셋

원본에서 옮긴 공용 에셋은 `shared/design/`에 있다. 플랫폼은 여기서 복사하거나 참조한다(같은 파일, 같은 이름).

| 경로 | 내용 |
| --- | --- |
| `fonts/` | 위 글꼴 5개 |
| `icons/*.svg` | 하단 바(일반/선택), 하트(빈/찬), 체크박스, 알림, 카메라·앨범, 편집·삭제, 화살표·셰브론·닫기, 기록 스택, 편집기 조정 아이콘(`ic_adjust_*`), 로그아웃 등 44개. iOS 원본 SVG가 있으면 그것을, 없으면 Android 벡터를 변환했다 |
| `images/` | 로그인 배경(`img_login_background.jpg`), 카카오 로고, 찰캌 로고(투명·단색), 런치 로고, 이슈 배너(`issue_beta_thanks.png`), 서명 미리보기 |

iOS 원본이 SF Symbol을 쓰는 곳은 iOS 네이티브는 SF Symbol, 나머지 플랫폼은 위 SVG 중 대응 아이콘(없으면 Material Symbols Rounded 중 가장 비슷한 것)을 쓴다. 이모지·텍스트 기호(`<`, `×`, `♥`)로 아이콘을 대신하지 않는다.

## 4. 플랫폼별 대응 규칙

| 항목 | iOS | Android | Flutter | RN | Web |
| --- | --- | --- | --- | --- | --- |
| 토큰 위치 | `DesignSystem/` Swift enum | `ui/theme` `ChalkakTheme` CompositionLocal | `ThemeData` + `ThemeExtension<ChalkakTokens>` | `src/shared/design/tokens.ts`(json import) | CSS 변수 `:root { --color-… }` + `tokens.ts` |
| 글꼴 | 번들 + 등록 | `res/font` | `pubspec.yaml fonts:` | `expo-font` | `@font-face` |
| 아이콘 | SVG 에셋 / SF Symbol | 벡터 drawable | `flutter_svg` | `react-native-svg` | 인라인 SVG 컴포넌트 |
| 전환 | NavigationStack 기본 push | 기본 + 원본 fade 수치 | Cupertino/Material 페이지 전환을 플랫폼별로 | native-stack 기본 | 짧은 fade/slide(200~250ms), `prefers-reduced-motion` 존중 |
| 시트 | `.sheet` + detent | ModalBottomSheet(색·라운드 토큰) | `showModalBottomSheet`(라운드 28) | 원본과 같은 라운드 시트 | 하단 시트 다이얼로그 |

Material 3 기본 색 체계(`ColorScheme.fromSeed`, 보라 계열)는 쓰지 않는다. Material 컴포넌트를 쓰더라도 `ColorScheme`을 토큰으로 덮는다(primary=actionPrimary, surface=background, surfaceTint 없음, ripple은 textPrimary 8~12%).

## 5. 완료 기준(플랫폼 PR마다)

- [ ] 토큰·글꼴·아이콘이 `shared/design`과 같다(대조 테스트 통과).
- [ ] screens 문서의 화면마다 레이아웃 수치·컴포넌트·상태(로딩 스켈레톤/빈/오류/게스트)를 맞췄거나, 다른 점을 `gaps/<platform>.md`에 이유와 함께 적었다.
- [ ] 화면 바탕이 `#F7F6F3`, 본문이 Pretendard, 주 버튼이 `#2B2724` 캡슐/라운드 12다.
- [ ] 로딩은 원본처럼 스켈레톤(쉬머)이고, 기본 스피너만 덩그러니 있는 화면이 없다.
- [ ] 터치 영역 44pt/48dp 이상, 텍스트 대비 WCAG AA.
- [ ] 기존 테스트·린트·타입 검사·CI가 통과하고 testID·문구는 그대로다.
