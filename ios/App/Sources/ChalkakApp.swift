import SwiftUI

@main
struct ChalkakApp: App {
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
