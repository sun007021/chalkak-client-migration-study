import SwiftUI
import ChalkakFeatures
import ChalkakData

/// 앱 루트. `AppLaunchViewModel.root`에 따라 화면을 바꾸고, 강제 업데이트는 닫을 수 없는 오버레이로 덮는다.
struct RootView: View {
    let container: AppContainer
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        let launch = container.launch
        ZStack {
            content(for: launch.root)
            if launch.root == .updateRequired {
                UpdateGateDialog { Task { await launch.updateButtonTapped() } }
            }
        }
        .task { await launch.start() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await launch.recheckVersionGate() } }
        }
    }

    @ViewBuilder
    private func content(for root: AppRoot) -> some View {
        switch root {
        case .splash, .updateRequired:
            SplashView()
        case .login:
            LoginHost(container: container)
        case .main(let access):
            MainPlaceholderView(access: access)
        }
    }
}

struct SplashView: View {
    var body: some View {
        ZStack {
            Color("ChalkakLogoBackground").ignoresSafeArea()
            Image("ChalkakLaunchLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 160)
                .accessibilityIdentifier("splash.logo")
        }
    }
}

struct UpdateGateDialog: View {
    let onUpdate: () -> Void

    var body: some View {
        ChalkakDialog(
            identifier: "update-gate.dialog",
            title: AuthCopy.updateTitle,
            message: AuthCopy.updateBody
        ) {
            ChalkakDialogButton(title: AuthCopy.updateButton, identifier: "update-gate.update-button", action: onUpdate)
        }
    }
}

/// 메인은 아직 없다(HOME PR). 접근 모드만 표시한다.
struct MainPlaceholderView: View {
    let access: MainAccess

    var body: some View {
        ZStack {
            ChalkakColor.background.ignoresSafeArea()
            Text(access == .guest ? "메인 (게스트)" : "메인")
                .font(ChalkakFont.headline)
                .foregroundStyle(ChalkakColor.textPrimary)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("main.root")
    }
}

/// 설정 오류 화면. 크래시 대신 무엇을 고쳐야 하는지 보여 준다.
struct ConfigurationErrorView: View {
    let message: String

    var body: some View {
        ZStack {
            ChalkakColor.background.ignoresSafeArea()
            VStack(spacing: ChalkakSpacing.md) {
                Text("앱 설정 오류")
                    .font(ChalkakFont.headline)
                    .foregroundStyle(ChalkakColor.error)
                Text(message)
                    .font(ChalkakFont.callout)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .multilineTextAlignment(.center)
            }
            .padding(ChalkakSpacing.xl)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("config-error.root")
    }
}
