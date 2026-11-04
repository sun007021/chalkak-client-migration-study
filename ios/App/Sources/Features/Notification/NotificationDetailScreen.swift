import SwiftUI
import ChalkakData
import ChalkakFeatures

/// 알림 상세(`POST_REJECTED`, `NOTICE`). 조회·404·오류 규칙은 `NotificationDetailViewModel`이 맡고 여기서는 상태를 그린다.
struct NotificationDetailScreen: View {
    let container: AppContainer
    let session: MainSession
    @State private var viewModel: NotificationDetailViewModel

    init(container: AppContainer, session: MainSession, notificationId: UUID) {
        self.container = container
        self.session = session
        _viewModel = State(initialValue: session.makeNotificationDetailViewModel(notificationId: notificationId))
    }

    var body: some View {
        VStack(spacing: 0) {
            ChalkakNavBar(
                title: NotificationCopy.detailTitle,
                backIdentifier: "notification-detail.back-button",
                titleIdentifier: "notification-detail.screen-title",
                onBack: { session.shell.pop() }
            )
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(ChalkakColor.background.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("notification-detail.root")
        .task { await viewModel.appeared() }
        .onDisappear { viewModel.disappeared() }
        .onChange(of: viewModel.needsLogin) { _, needsLogin in
            guard needsLogin else { return }
            viewModel.consumeNeedsLogin()
            Task { await container.launch.handleReauthenticationRequired() }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .loading:
            ProgressView().tint(ChalkakColor.actionPrimary).accessibilityIdentifier("notification-detail.loading")
        case .gone:
            Text(NotificationCopy.gone)
                .font(ChalkakFont.subheadline)
                .foregroundStyle(ChalkakColor.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                .accessibilityIdentifier("notification-detail.not-found-state")
        case .error(let message):
            VStack(spacing: ChalkakSpacing.lg) {
                Text(message)
                    .font(ChalkakFont.body)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .multilineTextAlignment(.center)
                ChalkakOutlinedButton(title: NotificationCopy.retry, action: { Task { await viewModel.retry() } })
                    .accessibilityIdentifier("notification-detail.retry-button")
            }
            .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("notification-detail.error-state")
        case .content(let detail):
            detailContent(detail)
        }
    }

    private func detailContent(_ detail: NotificationDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ChalkakSpacing.xl) {
                VStack(alignment: .leading, spacing: ChalkakSpacing.sm) {
                    Text(detail.title)
                        .font(ChalkakFont.headline)
                        .foregroundStyle(ChalkakColor.textPrimary)
                        .accessibilityIdentifier("notification-detail.title")
                    Text(detail.body)
                        .font(ChalkakFont.subheadline)
                        .foregroundStyle(ChalkakColor.textSecondary)
                        .accessibilityIdentifier("notification-detail.body")
                }
                if let imageURL = detail.originalImageURL {
                    ChalkakRemoteImage(url: imageURL, contentMode: .fit)
                        .frame(maxWidth: .infinity)
                        .aspectRatio(1, contentMode: .fit)
                        .background(ChalkakColor.surface)
                        .accessibilityIdentifier("notification-detail.photo")
                }
                if let reason = detail.rejectionReason, !reason.isEmpty {
                    VStack(alignment: .leading, spacing: ChalkakSpacing.sm) {
                        Text(NotificationCopy.detailReason)
                            .font(ChalkakFont.caption)
                            .foregroundStyle(ChalkakColor.textInactive)
                        Text(reason)
                            .font(ChalkakFont.body)
                            .foregroundStyle(ChalkakColor.textPrimary)
                            .accessibilityIdentifier("notification-detail.rejection-reason")
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("notification-detail.rejection-section")
                }
                if detail.type == .postRejected {
                    ChalkakButton(title: NotificationCopy.detailToInbox, action: { viewModel.backToInbox() }, fillsWidth: true)
                        .accessibilityIdentifier("notification-detail.back-to-inbox-button")
                }
            }
            .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            .padding(.vertical, ChalkakSpacing.lg)
        }
    }
}
