# 찰캌 React Native

Expo SDK 58 + TypeScript(strict). CNG(prebuild) 방식이라 `ios/`, `android/`는 커밋하지 않는다(카카오 로그인 네이티브 모듈 때문에 Expo Go가 아니라 dev client로 실행).

## 실행

Node 22(`.nvmrc`)가 필요하다.

```bash
cd react-native
nvm use                    # Node 22
npm ci
cp .env.example .env       # API_BASE_URL 설정(아래 참고). .env는 커밋되지 않는다
npx expo prebuild          # ios/, android/ 생성(gitignore)
npx expo run:ios           # 또는 run:android (dev client 빌드)
```

### API_BASE_URL

- 값은 **서버 origin**이다(예: `https://chalkak-dev.pysun.kr`). 앱이 `/api/v1/`을 붙이며, 끝 슬래시나 `/api/v1` 접미가 이미 붙어 있어도 중복 없이 정규화한다(REQ-NET-003).
- https만 허용한다(REQ-NET-001). 예외로 **E2E mock 서버**를 위해 loopback 호스트(`localhost`, `127.0.0.1`, `10.0.2.2`)의 http는 허용한다(팀장 결정). mock 서버가 개발 머신에 평문 http로 뜨고 외부로 나가지 않는 주소이기 때문이다. 같은 규칙이 `src/core/config/AppConfig.ts` 주석에도 있다.
- **기본값이 없다**(REQ-NET-002). 값이 없거나 잘못되면 개발 서버로 대신하지 않고 요청 없이 설정 오류 화면(`common.error.config`)을 보인다. 그래서 `app.config.ts`도 환경변수를 `extra`로 그대로 넘기기만 한다.
- 로컬 실행: `.env.example`을 `.env`로 복사하거나 셸에서 지정한다. 환경변수는 `expo start`/`prebuild` 시점의 app config 평가에서 읽히므로 값을 바꾸면 다시 시작한다.

```bash
API_BASE_URL=http://localhost:4010 npx expo start   # E2E mock 서버(loopback http)로 덮어쓰기
API_BASE_URL=http://10.0.2.2:4010 npx expo run:android   # Android 에뮬레이터에서 호스트의 mock 서버
```

## 스크립트

| 명령                   | 내용                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | ESLint(flat config, eslint-config-expo + prettier). 시스템 시계 직접 호출 금지 규칙 포함                                                                      |
| `npm run format`       | Prettier 적용                                                                                                                                                 |
| `npm run format:check` | Prettier 검사(`prettier --check .`)                                                                                                                           |
| `npm run typecheck`    | `tsc --noEmit`                                                                                                                                                |
| `npm test`             | Jest(`jest-expo`, 설정은 `jest.config.ts`) + `@testing-library/react-native`                                                                                  |
| `npm run test:tz`      | `src/core/time` 테스트만 TZ를 America/Los_Angeles, Pacific/Kiritimati, Pacific/Pago_Pago, UTC, Asia/Seoul로 바꿔 5번 실행(기기 시간대 독립 검증, TC-TIME-003) |
| `npm run verify`       | `lint` -> `format:check` -> `typecheck` -> `test` -> `test:tz` (CI와 동일)                                                                                    |

도구류(typescript, jest, eslint, prettier, @testing-library/react-native, ts-node)는 정확한 버전으로 고정한다(`.npmrc`의 `save-exact=true`).

## 폴더 구조와 레이어 규칙

```
src/core/      플랫폼·인프라 인터페이스와 구현(Clock, 저장소, http, 토스트, 분석, config, state)
src/data/      API DTO, 클라이언트, 리포지토리
src/features/<영역>/   ViewModel(순수 TS 클래스) + 화면 컴포넌트
src/app/       루트 컴포넌트, 내비게이션, AppContainer(DI) + React Context
src/shared/    공통 UI 컴포넌트·상수
```

- 의존 방향: `app` -> `features` -> `data` -> `core`, `shared`는 어디서든 사용 가능. 아래 층이 위 층을 import하지 않는다.
- 의존성(네트워크, 저장소, 시계, 토스트, 분석 등)은 인터페이스 뒤에 두고 생성자로 주입한다. 조립은 `AppContainer`에서만 하고 화면은 `useAppContainer()`로 받는다.
- 시간 의존 로직은 `Clock`과 `jest.useFakeTimers`로 테스트한다. 실제로 기다리지 않는다. `src/core/time/__testing__/advanceTime(fakeClock, ms)`가 둘을 함께 전진시킨다.
- 시스템 시계(`new Date()`, `Date.now()`, `performance.now()`)는 `Clock.ts`와 테스트 코드 밖에서 ESLint 오류다(TC-TIME-029).
- `AppContainer.create(config, overrides?)`가 의존성을 조립한다. 전역 설정(`expo-constants`)은 앱 루트 `index.ts`의 `readAppConfig()` 한 곳에서만 읽는다.

## ViewModel 패턴

React와 무관한 TS 클래스가 `Observable<State>`를 상속해 상태를 들고 `subscribe/getSnapshot`을 노출한다. 상태 전이는 `setState`로만 한다. 화면은 `useViewModelState(vm)`(`useSyncExternalStore`)로 구독만 하고 분기 로직을 갖지 않는다. `useViewModelState(vm, selector)`는 선택 결과를 `Object.is`로 비교해 바뀔 때만 리렌더한다(selector는 기본형이나 기존 참조를 돌려줘야 한다). 구독자 0->1/1->0 시점에 `onFirstSubscribe`/`onLastUnsubscribe` 훅이 불리고 `dispose()`가 모든 구독을 해제한다. 리스너 예외는 격리되어 `reportError`(기본 `console.error`)로 보고된다. 예시는 `src/core/state/*.test.ts(x)`, 테스트 헬퍼는 `src/core/state/__testing__/`.

## 테스트 규칙

- 테스트 위치는 소스 옆 `*.test.ts(x)`로 통일한다.
- 테스트 이름에 카탈로그 `TC-` ID를 넣는다: `it('TC-TIME-001 ...')`. (골격 단계의 기반 테스트는 ID 없음)
- 요소는 `docs/testing/testids.md` 그대로 `testID` prop으로 단다. 조회는 `getByTestId`.
- RNTL 14에서는 `render`, `act`, `fireEvent` 등이 비동기라 `await`가 필요하다.
- `react-native-safe-area-context`는 `jest.setup.ts`에서 공식 mock으로 대체한다(없으면 SafeAreaProvider가 아무것도 그리지 않는다).

## shared 연결

- `src/shared/constants.ts`는 `../shared/constants.json`을, `src/shared/copy.ts`는 `../shared/copy/ko.json`을 직접 import한다(값 복제 없음). 화면은 `t('키')`로 문구를 읽는다.
- 프로젝트 밖(`react-native/` 위 폴더) JSON을 import하려면 세 곳 설정이 필요하다: `metro.config.js`의 `watchFolders`(없으면 번들 때 해석 실패), `tsconfig.json`의 `resolveJsonModule`과 `include`, Jest는 별도 설정 없이 동작.
- 상수 이름이 JSON 키와 다르면 `src/shared/constants.test.ts`의 매핑 표에 적는다. JSON에 키가 늘면 이 테스트가 실패해 RN 반영을 강제한다.
