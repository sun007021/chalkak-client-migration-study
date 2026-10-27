import SwiftUI
import ChalkakFeatures

/// 로그인 화면이 나타날 때마다 새 ViewModel을 만들어 쓰는 호스트. 완료 목적지는 앱 루트에 알린다.
struct LoginHost: View {
    @State private var viewModel: LoginViewModel
    private let launch: AppLaunchViewModel

    init(container: AppContainer) {
        _viewModel = State(initialValue: container.makeLoginViewModel())
        launch = container.launch
    }

    var body: some View {
        LoginView(viewModel: viewModel)
            .onChange(of: viewModel.state) { _, state in
                if case .completed(let destination) = state { launch.loginCompleted(destination) }
            }
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
            if case .completed(.terms) = viewModel.state {
                TermsPlaceholder()
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

/// 약관 동의 화면(TERMS PR)이 오기 전까지의 자리표시자.
private struct TermsPlaceholder: View {
    var body: some View {
        ZStack {
            ChalkakColor.background.ignoresSafeArea()
            Text("약관 동의 화면 준비 중")
                .font(ChalkakFont.body)
                .foregroundStyle(ChalkakColor.textPrimary)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("terms.root")
    }
}
