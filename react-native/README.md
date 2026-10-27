# 찰캌 React Native

Expo SDK 58 + TypeScript(strict). CNG(prebuild) 방식이라 `ios/`, `android/`는 커밋하지 않는다(카카오 로그인 네이티브 모듈 때문에 Expo Go가 아니라 dev client로 실행).

## 실행

```bash
cd react-native
npm ci
npx expo prebuild          # ios/, android/ 생성(gitignore)
npx expo run:ios           # 또는 run:android (dev client 빌드)
API_BASE_URL=http://localhost:4010/api/v1/ npx expo start   # E2E mock 서버 주소로 덮어쓰기
```

`API_BASE_URL` 기본값은 `https://chalkak-dev.pysun.kr/api/v1/`이고 `app.config.ts`의 `extra.apiBaseUrl`로 들어간다. 코드에서는 `src/core/config/AppConfig.ts`의 `readAppConfig()`로만 읽는다.

## 스크립트

| 명령                | 내용                                                |
| ------------------- | --------------------------------------------------- |
| `npm run lint`      | ESLint(flat config, eslint-config-expo + prettier)  |
| `npm run typecheck` | `tsc --noEmit`                                      |
| `npm test`          | Jest(`jest-expo`) + `@testing-library/react-native` |
| `npm run format`    | Prettier 적용                                       |
| `npm run verify`    | lint, typecheck, test 순서대로 (CI와 동일)          |

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
- 시간 의존 로직은 `Clock`과 `jest.useFakeTimers`로 테스트한다. 실제로 기다리지 않는다.

## ViewModel 패턴

React와 무관한 TS 클래스가 `Observable<State>`를 상속해 상태를 들고 `subscribe/getSnapshot`을 노출한다. 상태 전이는 `setState`로만 한다. 화면은 `useViewModelState(vm)`(`useSyncExternalStore`)로 구독만 하고 분기 로직을 갖지 않는다. 예시는 `src/core/state/*.test.ts(x)`.

## 테스트 규칙

- 테스트 위치는 소스 옆 `*.test.ts(x)`로 통일한다.
- 테스트 이름에 카탈로그 `TC-` ID를 넣는다: `it('TC-TIME-001 ...')`. (골격 단계의 기반 테스트는 ID 없음)
- 요소는 `docs/testing/testids.md` 그대로 `testID` prop으로 단다. 조회는 `getByTestId`.
- RNTL 14에서는 `render`, `act`, `fireEvent` 등이 비동기라 `await`가 필요하다.
- `react-native-safe-area-context`는 `jest.setup.ts`에서 공식 mock으로 대체한다(없으면 SafeAreaProvider가 아무것도 그리지 않는다).
