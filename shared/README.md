# shared/

다섯 클라이언트(iOS, Android, Flutter, React Native, Web)가 같이 쓰는 테스트 자산과 도구. 외부 의존성 없이 Node 22 표준 라이브러리만 쓴다.

| 경로 | 내용 |
| --- | --- |
| `fixtures/<영역>/*.json`, `fixtures/manifest.json` | 서버 응답 fixture와 대응표. 규약은 [fixtures/README.md](fixtures/README.md) |
| `constants.json` | [00-overview §6](../docs/spec/00-overview.md) 공통 상수 + 네트워크 타임아웃·약관 호스트·분석 화면 이름(decisions). 기간은 `_MS` 접미사 |
| `copy/ko.json` | 사용자 문구 키→한국어. 기능 문서의 문구 표를 옮기고 decisions의 문구를 보탰다. 플레이스홀더는 `{주제}`, `{M월 d일}` 형식 그대로 |
| `scripts/` | fixture·커버리지·testID 검사 스크립트 |
| `mock-server/` | fixture를 시나리오별로 돌려주는 mock 서버 |
| `maestro/` | 모바일 E2E flow ([maestro/README.md](maestro/README.md)) |
| `openapi/` | 개발 서버 OpenAPI 스냅샷(나중에 받음, [openapi/README.md](openapi/README.md)) |

## 명령

```bash
cd shared && node --test                           # 도구 자체 테스트 (scripts/test, mock-server/test)

node scripts/build-manifest.mjs [--check]          # fixtures/*/_routes.json -> fixtures/manifest.json
node scripts/validate-fixtures.mjs [--allow-missing]
node scripts/check-tc-coverage.mjs <platform> [--root <dir>] [--json] [--update-matrix]
node scripts/check-testids.mjs <platform> [--root <dir>] [--json]
BASE=https://chalkak-dev.pysun.kr node scripts/dev-smoke.mjs
BASE=https://chalkak-dev.pysun.kr node scripts/fetch-openapi.mjs
PORT=4010 node mock-server/server.mjs
```

`<platform>`은 `ios|android|flutter|react-native|web`.

### validate-fixtures
모든 `.json`이 파싱되는지, fixture 파일과 manifest 항목이 1:1인지, 메서드·경로·상태·오류 본문(`errorCode`, `message`), UUID 소문자, 주요 응답 모양(`scripts/schemas.mjs`), 카탈로그가 참조하는 fixture 존재 여부, manifest 동기화를 검사한다. 예외: `NONE`/`PUSH`/`_kind: request` 항목은 경로·상태를 보지 않는다. `_fault` fixture는 상태가 없어도 된다. 이름에 `uppercase`가 들어간 fixture는 UUID 대문자를 허용한다. `__missing…`, `__invalid…`, `__malformed…`, `__no-…` 이름은 일부러 깨뜨린 probe라 모양 검사를 건너뛴다. 같은 method+path를 여러 fixture가 쓰는 것은 오류가 아니다.

### check-tc-coverage
`docs/testing/catalog/*.md`의 `TC-` ID와 `<platform>/` 아래 소스(`.kt .swift .dart .ts .tsx .js .jsx`)의 ID를 대조해 영역별 `covered/total`과 빠진 ID(`(A)`는 에이전트 시나리오 대상)를 출력한다. 모바일 4종은 `shared/maestro/**/*.yaml` 파일명의 ID도 센다. `--update-matrix`는 `docs/testing/parity-matrix.md`의 해당 플랫폼 열만 고친다. 항상 0으로 끝난다(인자 오류만 2).

### check-testids
`docs/testing/testids.md` §3 표의 testID(`{}` 템플릿은 정규식)를 읽고, 소스에서 `testTag/accessibilityIdentifier/testID/data-testid/Key/identifier/getByTestId…` 뒤의 문자열 리터럴 중 표에 없는 것을 찾는다. 보간(`${}`, `\()`, `$x`)은 `{}`로 정규화한다. 알 수 없는 id가 있으면 종료 코드 1. `test/`, `tests/`, `__tests__/` 폴더는 건너뛴다.

## mock 서버

- `shared/fixtures/manifest.json`을 읽는다. 시나리오는 `mock-server/scenarios/<name>.json`: `"METHOD /path[?query]"` → fixture 경로 또는 순서대로 돌려줄 배열(마지막이 반복). 경로의 `*`는 세그먼트 하나, 쿼리 조건이 있으면 일치할 때만. 더 구체적인 키(와일드카드 적고 쿼리 조건 많은 쪽)가 이긴다. 매칭 순서는 **정확한 경로의 시나리오 키 → manifest 정확 경로 폴백 → 와일드카드 키**이고, manifest에 정확히 있는 경로(`GET /posts/calendar` 등)는 `GET /posts/*` 같은 와일드카드가 가로채지 않는다.
- 활성 시나리오: 아무 요청의 `?scenario=name`(이후 계속 유지) 또는 `POST /__admin/scenario {"name":"..."}`. 기본 `default`.
- 시나리오에 없는 요청은 manifest에서 method+path(+query 조건)가 맞는 2xx 항목으로 폴백한다(쿼리 조건이 있는 항목 우선, `__ok`/`__success` 이름 우선, 없으면 첫 항목). `NONE`/`PUSH`/`request` 항목은 무시. 실제 선택은 시나리오로 하는 것이 원칙이다.
- fixture 예약 키: `_raw`/`_contentType`, `_fault: timeout`(응답하지 않고 대기, 30초 뒤 연결 종료) / `disconnect`(소켓 파기). manifest의 `status`, `headers`, `delayMs`를 따른다. 없는 fixture 파일이면 경고 로그 + `500 {"errorCode":"MOCK_MISSING_FIXTURE"}`.
- **Host 치환**: JSON·`_raw` 응답 본문의 `http://localhost:4010`은 요청 `Host` 헤더 값(`http://<Host>`)으로 바꿔 보낸다. Android 에뮬레이터가 `10.0.2.2:4010`으로 접속해도 presigned URL이 닿는다.
- `PUT /__upload/<uploadId>`: 아무 본문이나 받고 200. `GET /__admin/uploads`로 `{uploadId, contentType, bytes}` 확인.
- `GET /__admin/requests`(method, path, query, headers, json body), `POST /__admin/reset`(요청 로그·업로드·시퀀스 카운터 초기화, 시나리오는 유지), `GET /__admin/scenario`.
- `API_BASE_URL`은 **서버 origin**(경로 없음)으로 받고 앱이 `/api/v1`을 붙인다(REQ-NET-003). 예: 개발 서버 `https://chalkak-dev.pysun.kr`, Android 에뮬레이터 `http://10.0.2.2:4010`, iOS 시뮬레이터 `http://localhost:4010`. 웹은 CORS를 모두 허용한다.
- **http 예외 규칙(다섯 플랫폼 공통)**: REQ-NET-001은 https만 허용하지만 mock 서버는 http다. loopback 호스트(`localhost`, `127.0.0.1`, `10.0.2.2`)의 http만 예외로 허용하고 나머지 http는 설정 오류(REQ-NET-002)로 거부한다. presigned 업로드 URL도 같은 규칙을 쓴다(fixture `upload/posts-uploads__insecure-upload-url`은 loopback이 아닌 http라 거부 대상).

## 문구 키 규칙

`copy/ko.json`의 키는 `docs/spec/features/*.md`의 문구 표에서 가져온다. 한 문구는 한 키가 원칙이고, 기능 문서가 따로 적은 경우에만 같은 값의 키를 별도로 둔다(예: `auth.banned.like`와 `like.error.banned`). 문서에 없는 키를 임의로 만들지 않는다. 새 문구는 먼저 기능 문서 표에 올린 뒤 옮긴다.
