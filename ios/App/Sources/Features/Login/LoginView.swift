import SwiftUI
import ChalkakFeatures

/// 로그인 화면이 나타날 때마다 새 ViewModel을 만들어 쓰는 호스트. 완료 목적지는 앱 루트에 알리고,
/// 가입이 필요하면(`.terms`) 로그인 화면 위에 가입 흐름(약관 → 사인 → 미리보기)을 덮는다.
struct LoginHost: View {
    @State private var viewModel: LoginViewModel
    @State private var signUpContext: SignUpContext?
    private let container: AppContainer
    private let launch: AppLaunchViewModel

    init(container: AppContainer) {
        _viewModel = State(initialValue: container.makeLoginViewModel())
        self.container = container
        launch = container.launch
    }

    var body: some View {
        ZStack {
            LoginView(viewModel: viewModel)
                .accessibilityHidden(signUpContext != nil)
            if let context = signUpContext {
                OnboardingHost(
                    container: container,
                    context: context,
                    onExitToLogin: { message in exitOnboarding(message: message) },
                    onSignedUp: { launch.loginCompleted(.main(.member)) }
                )
            }
        }
        .onChange(of: viewModel.state) { _, state in
            guard case .completed(let destination) = state else { return }
            switch destination {
            case .main:
                launch.loginCompleted(destination)
            case .terms(let context):
                signUpContext = context
            }
        }
    }

    /// 가입 흐름을 닫고 로그인 화면으로 돌아온다(가입 컨텍스트 폐기). 문구가 있으면 토스트로 알린다.
    private func exitOnboarding(message: String?) {
        signUpContext = nil
        viewModel.onAppear()
        if let message { container.toast.show(message) }
    }
}

/// ViewModel 상태만 그린다. 로직 없음.
struct LoginView: View {
    let viewModel: LoginViewModel

    var body: some View {
        ZStack {
            ChalkakColor.background.ignoresSafeArea()
            content
            if case .failed(let notice) = viewModel.state {
                ChalkakDialog(
                    identifier: "login.error-dialog",
                    title: AuthCopy.loginErrorTitle,
                    message: notice.message,
                    titleIdentifier: "login.error-dialog-title",
                    messageIdentifier: "login.error-dialog-message"
                ) {
                    ChalkakDialogButton(title: "확인", identifier: "login.error-dialog-confirm-button") {
                        viewModel.dismissError()
                    }
                }
                .id(notice.id)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("login.root")
        .onAppear { viewModel.onAppear() }
        .onDisappear { viewModel.onDisappear() }
    }

    private var content: some View {
        GeometryReader { proxy in
            VStack(spacing: 0) {
                header.frame(height: proxy.size.height * 0.53)
                actions.frame(maxHeight: .infinity)
            }
        }
        .ignoresSafeArea()
    }

    private var header: some View {
        ZStack(alignment: .topLeading) {
            Image("img_login_background")
                .resizable()
                .scaledToFill()
                .opacity(0.2)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
            Text(AuthCopy.loginTagline)
                .font(ChalkakFont.display)
                .foregroundStyle(ChalkakColor.textPrimary)
                .padding(.horizontal, 20)
                .padding(.top, 135)
                .accessibilityIdentifier("login.tagline")
        }
        .frame(maxWidth: .infinity)
        .clipped()
    }

    private var actions: some View {
        VStack(spacing: 0) {
            kakaoButton
            Button(AuthCopy.loginGuest) { Task { await viewModel.guestTapped() } }
                .font(ChalkakFont.subheadline)
                .foregroundStyle(ChalkakColor.textSecondary)
                .underline()
                .frame(minHeight: 44)
                .buttonStyle(.plain)
                .disabled(!viewModel.isInteractionEnabled)
                .padding(.top, ChalkakSpacing.xl)
                .accessibilityIdentifier("login.guest-button")
            if viewModel.state == .signingIn {
                ProgressView()
                    .padding(.top, ChalkakSpacing.lg)
                    .accessibilityIdentifier("login.loading")
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
        .padding(.top, 60)
        .frame(maxWidth: .infinity)
    }

    private var kakaoButton: some View {
        Button { Task { await viewModel.kakaoTapped() } } label: {
            HStack(spacing: ChalkakSpacing.md) {
                Image("img_kakao_logo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 24, height: 24)
                Text(AuthCopy.loginKakao)
                    .font(ChalkakFont.callout)
                    .foregroundStyle(ChalkakColor.textPrimary)
            }
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(ChalkakColor.inputBackground, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
            .overlay(RoundedRectangle(cornerRadius: ChalkakRadius.button).stroke(ChalkakColor.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(!viewModel.isInteractionEnabled)
        .accessibilityLabel(AuthCopy.loginKakao)
        .accessibilityIdentifier("login.kakao-button")
    }
}
