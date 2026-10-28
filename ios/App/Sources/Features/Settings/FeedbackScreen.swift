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
                VStack(alignment: .leading, spacing: ChalkakSpacing.lg) {
                    Text(FeedbackCopy.introTitle)
                        .font(ChalkakFont.display)
                        .foregroundStyle(ChalkakColor.textPrimary)
                    Text(FeedbackCopy.introBody)
                        .font(ChalkakFont.subheadline)
                        .foregroundStyle(ChalkakColor.textSecondary)
                        .accessibilityIdentifier("feedback.guide-text")
                    inputField
                    footer
                }
                .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                .padding(.top, ChalkakSpacing.lg)
            }
            .scrollDismissesKeyboard(.interactively)
            sendButton
                .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                .padding(.vertical, ChalkakSpacing.lg)
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
            ZStack(alignment: .topLeading) {
                TextEditor(text: textBinding)
                    .font(ChalkakFont.callout)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .scrollContentBackground(.hidden)
                    .focused($isFocused)
                    .padding(ChalkakSpacing.sm)
                    .accessibilityIdentifier("feedback.input")
                if viewModel.text.isEmpty {
                    Text(FeedbackCopy.fieldPlaceholder)
                        .font(ChalkakFont.callout)
                        .foregroundStyle(ChalkakColor.textSecondary)
                        .padding(.horizontal, ChalkakSpacing.md)
                        .padding(.vertical, ChalkakSpacing.md + 1)
                        .allowsHitTesting(false)
                }
            }
            .frame(minHeight: 200)
            .background(ChalkakColor.inputBackground, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
            .overlay(RoundedRectangle(cornerRadius: ChalkakRadius.button).stroke(ChalkakColor.border, lineWidth: 1))
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
            Spacer(minLength: 0)
            Text(viewModel.counterText)
                .font(ChalkakFont.footnote)
                .foregroundStyle(ChalkakColor.textSecondary)
                .accessibilityIdentifier("feedback.counter")
        }
    }

    private var sendButton: some View {
        Button {
            isFocused = false
            Task { await viewModel.send() }
        } label: {
            Text(viewModel.sendButtonTitle)
                .font(ChalkakFont.callout)
                .foregroundStyle(ChalkakColor.onActionPrimary)
                .frame(maxWidth: .infinity, minHeight: 56)
                .background(ChalkakColor.actionPrimary, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
                .opacity(viewModel.canSend ? 1 : 0.3)
        }
        .buttonStyle(.plain)
        .disabled(!viewModel.canSend)
        .accessibilityIdentifier("feedback.submit-button")
    }
}
