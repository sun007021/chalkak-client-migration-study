# OpenAPI 스냅샷

`chalkak-dev.json`은 개발 서버 `GET /v3/api-docs`의 스냅샷이다. 구현 컨테이너에서는 개발 서버에 닿지 않으므로 **아직 없다.** 사용자 Mac 또는 네트워크가 되는 곳에서 한 번 받아 커밋한다.

```bash
BASE=https://chalkak-dev.pysun.kr node shared/scripts/fetch-openapi.mjs   # -> shared/openapi/chalkak-dev.json
```

그 전까지 fixture 형태 검증은 `shared/scripts/schemas.mjs`(api-contract.md에서 손으로 옮긴 주요 응답 스키마)가 맡는다. 스냅샷이 생기면 스키마 검증을 OpenAPI 기반으로 확장한다.
