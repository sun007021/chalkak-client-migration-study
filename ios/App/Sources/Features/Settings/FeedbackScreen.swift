import SwiftUI
import ChalkakFeatures

/// 피드백 보내기(쌓임 화면). 글자 수 계산·검증·전송·오류 매핑은 `FeedbackViewModel`이 맡는다.
struct FeedbackScreen: View {
    let container: AppContainer
    let session: MainSession
    @State private var viewModel: FeedbackViewModel
    @FocusState private var isFocused: Bool

    init(container: AppContainer, session: MainSession) {
        self.container = container
        self.session = session
        _viewModel = State(initialValue: container.makeFeedbackViewModel())
    }

    var body: some View {
        VStack(spacing: 0) {
            ChalkakNavBar(
                title: FeedbackCopy.title,
                backIdentifier: "feedback.close-button",
                titleIdentifier: nil,
                onBack: { session.shell.pop() }
            )
            ScrollView {
                // 원본 피드백(screens-c.md 5.2): 위 24, title2, 제목→설명 12, 설명→입력 28, 입력→안내 8
                VStack(alignment: .leading, spacing: 0) {
                    Text(FeedbackCopy.introTitle)
                        .font(ChalkakFont.title2)
                        .foregroundStyle(ChalkakColor.textPrimary)
                    Text(FeedbackCopy.introBody)
                        .font(ChalkakFont.subheadline)
                        .foregroundStyle(ChalkakColor.textSecondary)
                        .padding(.top, ChalkakSpacing.md)
                        .accessibilityIdentifier("feedback.guide-text")
                    inputField
                        .padding(.top, 28)
                    footer
                        .padding(.top, ChalkakSpacing.sm)
                }
                .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                .padding(.top, ChalkakSpacing.xl)
            }
            .scrollDismissesKeyboard(.interactively)
            sendButton
                .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                .padding(.top, ChalkakSpacing.sm)
                .padding(.bottom, ChalkakSpacing.lg)
                .background(ChalkakColor.background)
        }
        .background(ChalkakColor.background.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("feedback.root")
        .onAppear { viewModel.screenAppeared() }
        .onDisappear { viewModel.screenDisappeared() }
        .onChange(of: viewModel.isFinished) { _, finished in
            // 토스트(`fdbk.success`)는 ViewModel이 이미 띄웠다. 화면만 닫는다.
            if finished { session.shell.pop() }
        }
        .onChange(of: viewModel.needsLogin) { _, needsLogin in
            guard needsLogin else { return }
            viewModel.consumeNeedsLogin()
            Task { await container.launch.handleReauthenticationRequired() }
        }
    }

    private var textBinding: Binding<String> {
        Binding(get: { viewModel.text }, set: { viewModel.text = $0 })
    }

    private var inputField: some View {
        VStack(alignment: .leading, spacing: ChalkakSpacing.sm) {
            Text(FeedbackCopy.fieldLabel)
                .font(ChalkakFont.subheadline)
                .foregroundStyle(ChalkakColor.textPrimary)
            // ChalkakTextField 공통 스펙(screens-a.md 1.6): 라운드 input 14, 포커스 테두리, 커서 inputCursor, 안쪽 카운터
            ZStack(alignment: .topLeading) {
                TextEditor(text: textBinding)
                    .font(ChalkakFont.subheadline)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .scrollContentBackground(.hidden)
                    .focused($isFocused)
                    .padding(.horizontal, -5)
                    .padding(.vertical, -8)
                    .accessibilityIdentifier("feedback.input")
                if viewModel.text.isEmpty {
                    Text(FeedbackCopy.fieldPlaceholder)
                        .font(ChalkakFont.subheadline)
                        .foregroundStyle(ChalkakColor.textInactive)
                        .allowsHitTesting(false)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .chalkakInputChrome(isFocused: isFocused)
            .frame(height: 240)
            .overlay(alignment: .bottomTrailing) {
                Text(viewModel.counterText)
                    .font(ChalkakFont.subheadline)
                    .foregroundStyle(ChalkakColor.textInactive)
                    .padding(ChalkakSpacing.lg)
                    .accessibilityIdentifier("feedback.counter")
            }
        }
    }

    private var footer: some View {
        HStack(alignment: .top) {
            if let notice = viewModel.errorNotice {
                // 입력 검증 문구와 전송 실패 문구는 식별자를 나눈다.
                Text(notice.message)
                    .font(ChalkakFont.footnote)
                    .foregroundStyle(ChalkakColor.error)
                    .id(notice.id)
                    .accessibilityIdentifier(
                        notice.message == FeedbackCopy.errorInvalid ? "feedback.validation-message" : "feedback.error-message"
                    )
            }
        }
    }

    private var sendButton: some View {
        ChalkakButton(title: viewModel.sendButtonTitle, action: {
            isFocused = false
            Task { await viewModel.send() }
        }, isEnabled: viewModel.canSend, fillsWidth: true)
        .accessibilityIdentifier("feedback.submit-button")
    }
}
