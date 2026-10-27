# boot fixtures

새 `_kind` 두 가지. 둘 다 HTTP 응답이 아니므로 `_routes.json`에서 `method: "NONE"`, `path: "-"`.

- `_kind: "storage"` — 앱 시작 시 보안 저장소 상태. `stored`는 저장 키(`userId`, `accessToken`, `accessTokenExpiresAt`, `refreshToken`, `refreshTokenExpiresAt`, `guest`)의 부분집합, `expect`는 시작 판정 기대값(`destination`: `login`|`home`, `mode`: `member`|`guest`, `storageCleared`, `crash`). 시각은 `FIXTURE_NOW`(2026-10-27T03:00:00Z) 기준. `corrupted: true`는 복호화 불가 저장소(테스트가 암호문을 깨뜨려 주입).
- `_kind: "native"` — 스토어/OS SDK가 돌려주는 값(`play-update__*`). `source`, `data`, `expect`.
- `_kind: "case"` — `itunes-lookup__malformed`는 버전 문자열 표(`appVersion` 1.1.1 기준, `parsed`/`gate`).

`itunes-lookup__*`은 외부 호스트(itunes.apple.com) 응답이라 path가 `/lookup`이며 `/api/v1`이 아니다. `bundleId`는 자리표시자(`com.example.chalkak`)이고 앱 버전은 1.1.1 가정이다.
