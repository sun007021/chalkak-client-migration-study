import SwiftUI
import ChalkakFeatures
import ChalkakData

/// 앱 루트. `AppLaunchViewModel.root`에 따라 화면을 바꾸고, 강제 업데이트는 닫을 수 없는 오버레이로 덮는다.
struct RootView: View {
    let container: AppContainer
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let launch = container.launch
        ZStack {
            content(for: launch.root)
            if launch.root == .updateRequired {
                UpdateGateDialog { Task { await launch.updateButtonTapped() } }
            }
            ToastOverlay(center: container.toast)
        }
        // 라우트 전환은 기본 cross-fade(screens-a.md 2.1). 동작 줄이기에서는 바로 바꾼다.
        .animation(reduceMotion ? nil : .default, value: launch.root)
        .task { await container.pushHub.attachToEntryPoint() }
        .task { await launch.start() }
        .onChange(of: scenePhase) { _, phase in
            // 앱이 보이지 않을 때의 토스트 요청은 버린다(D-20).
            container.toast.setScreenVisible(phase == .active)
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
            MainHost(container: container, access: access)
        }
    }
}

/// 런치 스크린과 같은 배경·로고(220×220)라 시작 화면이 끊김 없이 이어진다.
struct SplashView: View {
    var body: some View {
        ZStack {
            Color("ChalkakLogoBackground").ignoresSafeArea()
            Image("ChalkakLaunchLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 220, height: 220)
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

/// 설정 오류 화면. 크래시 대신 무엇을 고쳐야 하는지 보여 준다.
struct ConfigurationErrorView: View {
    let message: String

    var body: some View {
        ZStack {
            ChalkakColor.background.ignoresSafeArea()
            VStack(spacing: 0) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 34))
                    .foregroundStyle(ChalkakColor.error)
                    .accessibilityHidden(true)
                Text("앱 설정 오류")
                    .font(ChalkakFont.title3)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .padding(.top, ChalkakSpacing.md)
                    .accessibilityIdentifier("config-error.title")
                Text(message)
                    .font(ChalkakFont.callout)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.top, ChalkakSpacing.sm)
                    .accessibilityIdentifier("config-error.message")
            }
            .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("config-error.root")
    }
}
