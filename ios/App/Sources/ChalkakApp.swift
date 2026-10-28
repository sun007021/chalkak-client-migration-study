import SwiftUI
import UIKit

@main
struct ChalkakApp: App {
    /// 알림 센터 델리게이트 등록과 APNs 토큰 수신(푸시 탭은 `PushEntryPoint` → `PushEventHub`로 이어진다).
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    private let bootstrap = AppBootstrap.load()

    var body: some Scene {
        WindowGroup {
            switch bootstrap {
            case .ready(let container):
                RootView(container: container)
                    .preferredColorScheme(.light)
                    .onOpenURL { KakaoSDKBootstrap.handleOpenURL($0) }
            case .misconfigured(let message):
                ConfigurationErrorView(message: message)
                    .preferredColorScheme(.light)
            }
        }
    }
}
