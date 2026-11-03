# 찰캌 iOS (SwiftUI)

- 구조·규약: [ARCHITECTURE.md](ARCHITECTURE.md)
- 테스트: `ios/scripts/test.sh` (ChalkakKit, Linux/macOS 공통) · 앱 빌드와 UI 테스트는 CI `iOS` 워크플로 또는 로컬 Xcode
- 앱 실행: `brew install xcodegen && cd ios/App && xcodegen generate && open Chalkak.xcodeproj` (먼저 `Config/Secrets.example.xcconfig`를 `Config/Secrets.xcconfig`로 복사해 값을 채운다)

## Firebase(FCM 푸시·Analytics)

- `GoogleService-Info.plist`는 저장소에 올리지 않는다(`.gitignore`). Firebase 콘솔의 iOS 앱(번들 ID `com.stonefive.chalkak`)에서 내려받아 `ios/App/Config/GoogleService-Info.plist`에 두고 `xcodegen generate`를 다시 실행한다.
- 파일이 없으면 빌드는 성공하지만 Firebase를 켜지 않는다: FCM 토큰이 없어 기기 등록 요청을 보내지 않고, 분석 이벤트는 로그로만 출력한다(CI가 이 상태로 빌드한다).
- 실제 푸시 수신에는 Firebase 콘솔 > 프로젝트 설정 > 클라우드 메시징에 APNs 인증 키(.p8)를 올려야 하고, 실기기 + 서명된 빌드(Push Notifications 권한)가 필요하다. 시뮬레이터는 APNs 개발용 토큰으로 FCM 토큰이 발급된다.

