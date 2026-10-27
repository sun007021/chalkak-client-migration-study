# 찰캌 iOS (SwiftUI)

- 구조·규약: [ARCHITECTURE.md](ARCHITECTURE.md)
- 테스트: `ios/scripts/test.sh` (ChalkakKit, Linux/macOS 공통) · 앱 빌드와 UI 테스트는 CI `iOS` 워크플로 또는 로컬 Xcode
- 앱 실행: `brew install xcodegen && cd ios/App && xcodegen generate && open Chalkak.xcodeproj` (먼저 `Config/Secrets.example.xcconfig`를 `Config/Secrets.xcconfig`로 복사해 값을 채운다)
