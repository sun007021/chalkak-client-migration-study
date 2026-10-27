# 찰캌 Flutter

찰캌 클라이언트의 Flutter 구현이다. 구조와 규칙은 [ARCHITECTURE.md](ARCHITECTURE.md), 동작 기준은 [docs/spec](../docs/spec/00-overview.md)이다.

## 실행

```bash
cp env/example.json env/dev.json   # 값 채우기(커밋 금지)
flutter run --dart-define-from-file=env/dev.json
```

## 검증

```bash
tool/check.sh   # format → analyze → test
```
