# Maestro flows (모바일 4종 공통 E2E)

같은 YAML이 iOS native, Android native, Flutter, React Native에서 돈다. Web은 Playwright를 쓴다([strategy.md](../../docs/testing/strategy.md)).

## 실행

```bash
node shared/mock-server/server.mjs &                          # mock 서버 (기본 :4010)
maestro test shared/maestro/auth/TC-AUTH-032-guest-browse.yaml --env APP_ID=<번들 ID/패키지명>
maestro test shared/maestro --env APP_ID=<id>                  # config.yaml: TC-*.yaml 전부
```

- 앱은 mock base URL로 빌드/설정한다(`API_BASE_URL`). **Android 에뮬레이터** `http://10.0.2.2:4010/api/v1/`, **iOS 시뮬레이터** `http://localhost:4010/api/v1/`. Android는 cleartext HTTP 허용 설정(debug network security config)이 필요하다.
- presigned URL fixture는 `http://localhost:4010/__upload/...`로 고정돼 있지만, mock 서버가 응답 본문의 이 origin을 요청 `Host` 헤더로 치환하므로 Android 에뮬레이터(`10.0.2.2:4010`)에서도 별도 설정 없이 닿는다(`adb reverse tcp:4010 tcp:4010`은 이제 필요 없지만 써도 무방).
- 카카오 로그인은 `SocialLoginClient` Fake(fixture `idToken`)로 바꾼 E2E 빌드를 쓴다.
- flow 파일명: `shared/maestro/<영역>/TC-XXX-NNN-<설명>.yaml`. `check-tc-coverage`가 파일명의 TC ID를 모바일 4종 커버리지로 센다.

## 시나리오 선택

`common/launch-clean.yaml`이 `set-scenario.js`(호스트에서 실행)로 `POST /__admin/reset` + `POST /__admin/scenario {"name": $SCENARIO}`를 보낸 뒤 `clearState`로 앱을 띄운다. 시나리오 파일은 `shared/mock-server/scenarios/<name>.json`이다. flow 중간에 바꾸려면 `runScript: file: ../common/set-scenario.js`를 다시 부른다(요청 로그·시퀀스 카운터도 초기화됨).

## testID 매핑 ([testids.md §1](../../docs/testing/testids.md))

Maestro는 모두 `id:` 셀렉터를 쓴다. `id:` 값은 정규식이라 `.`이 아무 문자에나 맞는다(testID의 `.` 구분자에는 무해).

| 플랫폼 | 부착 | `id:`가 보는 값 |
| --- | --- | --- |
| iOS | `.accessibilityIdentifier("login.kakao-button")` | accessibilityIdentifier |
| Android Compose | `Modifier.testTag(...)` + 루트 한 곳 `Modifier.semantics { testTagsAsResourceId = true }` | resource-id. **`testTagsAsResourceId`가 없으면 Maestro가 태그를 찾지 못한다** |
| Flutter | `Semantics(identifier: ..., container: true)` + `Key` | Android resource-id / iOS accessibilityIdentifier |
| React Native | `testID="..."` | iOS accessibilityIdentifier / Android resource-id |

토스트·상태 요소는 "해당 상태일 때만 존재"하므로 `assertVisible` / `assertNotVisible`로 검증한다. 문구는 `shared/copy/ko.json` 값을 쓴다.
