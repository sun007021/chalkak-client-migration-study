import SwiftUI
import ChalkakFeatures

/// 홈 AI 피드백 카드 자리. 카드가 없는 상태(`aiCardPostId == nil`)에서는 아무것도 그리지 않는다.
/// ViewModel은 세션이 쥐고(홈 탭을 떠났다 와도 완료 결과를 다시 조회하지 않는다) 대상 게시물이 바뀔 때만 `show`로 갈아 끼운다.
struct HomeAICardSlot: View {
    let container: AppContainer
    let session: MainSession
    let isActive: Bool

    var body: some View {
        Group {
            if session.home.aiCardPostId != nil, let viewModel = session.homeAI {
                HomeAICard(container: container, session: session, viewModel: viewModel, isActive: isActive)
            }
        }
        .onChange(of: session.home.aiCardPostId, initial: true) { _, postId in
            session.updateHomeAI(postId: postId)
        }
    }
}

private struct HomeAICard: View {
    let container: AppContainer
    let session: MainSession
    let viewModel: AIReviewViewModel
    let isActive: Bool
    @Environment(\.scenePhase) private var scenePhase

    /// 홈이 보이고 앱이 백그라운드가 아닐 때만 조회·폴링한다(REQ-HOME-036).
    private var isRunning: Bool { isActive && scenePhase != .background }

    var body: some View {
        VStack(alignment: .leading, spacing: ChalkakSpacing.sm) {
            if let card = viewModel.card {
                cardBody(card)
            }
            if let message = viewModel.message {
                Text(message.message)
                    .font(ChalkakFont.footnote)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .accessibilityIdentifier("home.ai-message")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home.ai-card")
        .task(id: isRunning) {
            if isRunning { await viewModel.onAppear() } else { viewModel.onDisappear() }
        }
        .onDisappear { viewModel.onDisappear() }
        .onChange(of: session.shell.access) { _, _ in
            Task { await viewModel.viewerDidChange() }
        }
        .onChange(of: viewModel.needsLogin) { _, needsLogin in
            guard needsLogin else { return }
            Task { await container.launch.handleReauthenticationRequired() }
        }
        .aiReviewSheets(viewModel)
    }

    @ViewBuilder
    private func cardBody(_ card: AIReviewViewModel.Card) -> some View {
        switch card.action {
        case .start?:
            // NONE: 카드 전체가 요청 진입이다.
            Button { Task { await viewModel.performCardAction() } } label: {
                row(card)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("home.ai-request-button")
        case .showResult?:
            row(card)
                .accessibilityIdentifier("home.ai-completed")
        case .retry?:
            row(card)
                .accessibilityIdentifier("home.ai-failed")
        case nil:
            row(card)
                .accessibilityIdentifier(viewModel.phase == .failed ? "home.ai-failed" : "home.ai-processing")
        }
    }

    private func row(_ card: AIReviewViewModel.Card) -> some View {
        HStack(spacing: ChalkakSpacing.md) {
            Text(card.message)
                .font(ChalkakFont.subheadline)
                .foregroundStyle(ChalkakColor.textPrimary)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let title = card.actionTitle, let action = card.action {
                Button { Task { await viewModel.performCardAction() } } label: {
                    Text(title)
                        .font(ChalkakFont.footnote)
                        .foregroundStyle(ChalkakColor.onActionPrimary)
                        .padding(.horizontal, ChalkakSpacing.md)
                        .frame(minHeight: 32)
                        .background(ChalkakColor.actionPrimary, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier(action == .retry ? "home.ai-retry-button" : "home.ai-detail-button")
            } else if card.action == .start {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(ChalkakColor.iconPrimary)
            }
        }
        .padding(ChalkakSpacing.lg)
        .frame(maxWidth: .infinity, minHeight: 56)
        .background(ChalkakColor.surfaceElevated, in: RoundedRectangle(cornerRadius: ChalkakRadius.card))
        .contentShape(Rectangle())
    }
}
