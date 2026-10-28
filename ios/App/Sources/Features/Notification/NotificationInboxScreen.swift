import SwiftUI
import ChalkakFeatures

/// 알림함(쌓임 화면). 목록·페이지·읽음 처리·이동 규칙은 `NotificationInboxViewModel`이 맡고 여기서는 상태를 그린다.
struct NotificationInboxScreen: View {
    let container: AppContainer
    let session: MainSession
    @State private var viewModel: NotificationInboxViewModel

    init(container: AppContainer, session: MainSession) {
        self.container = container
        self.session = session
        _viewModel = State(initialValue: session.makeNotificationInboxViewModel())
    }

    var body: some View {
        VStack(spacing: 0) {
            ChalkakNavBar(
                title: NotificationCopy.inboxTitle,
                backIdentifier: "notifications.back-button",
                titleIdentifier: nil,
                onBack: { session.shell.pop() }
            )
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(ChalkakColor.background.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("notifications.root")
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
            VStack(spacing: ChalkakSpacing.md) {
                ProgressView()
                Text(NotificationCopy.loading)
                    .font(ChalkakFont.subheadline)
                    .foregroundStyle(ChalkakColor.textSecondary)
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("notifications.loading")
        case .empty:
            // 비어 있어도 당겨서 새로고침은 할 수 있어야 한다.
            ScrollView {
                VStack(spacing: ChalkakSpacing.sm) {
                    Text(NotificationCopy.emptyTitle)
                        .font(ChalkakFont.headline)
                        .foregroundStyle(ChalkakColor.textPrimary)
                    Text(NotificationCopy.emptyBody)
                        .font(ChalkakFont.subheadline)
                        .foregroundStyle(ChalkakColor.textSecondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 120)
                .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("notifications.empty-state")
            }
            .refreshable { await viewModel.refresh() }
        case .error(let message):
            VStack(spacing: ChalkakSpacing.md) {
                Text(message)
                    .font(ChalkakFont.callout)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .multilineTextAlignment(.center)
                Button { Task { await viewModel.retry() } } label: {
                    Text(NotificationCopy.retry)
                        .font(ChalkakFont.callout)
                        .foregroundStyle(ChalkakColor.onActionPrimary)
                        .padding(.horizontal, ChalkakSpacing.xl)
                        .frame(minHeight: 44)
                        .background(ChalkakColor.actionPrimary, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("notifications.retry-button")
            }
            .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("notifications.error-state")
        case .content:
            list
        }
    }

    private var list: some View {
        let rows = viewModel.rows
        return ScrollView {
            LazyVStack(spacing: 0) {
                if viewModel.isRefreshing {
                    Color.clear.frame(width: 1, height: 1).accessibilityIdentifier("notifications.refresh-indicator")
                }
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    NotificationRowView(row: row) {
                        Task { await viewModel.rowTapped(id: row.id) }
                    }
                    .onAppear { Task { await viewModel.rowAppeared(index: index) } }
                }
                if viewModel.isLoadingMore {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, ChalkakSpacing.lg)
                        .accessibilityIdentifier("notifications.load-more-indicator")
                }
            }
        }
        .refreshable { await viewModel.refresh() }
        .accessibilityIdentifier("notifications.list")
    }
}

/// 알림 한 줄: 썸네일, 제목, 본문, 시각, 미읽음 점.
private struct NotificationRowView: View {
    let row: NotificationRow
    let onTap: () -> Void

    var body: some View {
        let key = row.id.uuidString.lowercased()
        Button(action: onTap) {
            HStack(alignment: .top, spacing: ChalkakSpacing.md) {
                ChalkakRemoteImage(url: row.thumbnailURL)
                    .frame(width: 56, height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.small))
                    .accessibilityIdentifier("notifications.item-thumbnail-\(key)")
                VStack(alignment: .leading, spacing: ChalkakSpacing.xs) {
                    Text(row.title)
                        .font(ChalkakFont.headline)
                        .foregroundStyle(ChalkakColor.textPrimary)
                        .lineLimit(1)
                        .accessibilityIdentifier("notifications.item-title-\(key)")
                    Text(row.body)
                        .font(ChalkakFont.subheadline)
                        .foregroundStyle(ChalkakColor.textSecondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .accessibilityIdentifier("notifications.item-body-\(key)")
                    Text(row.timeText)
                        .font(ChalkakFont.caption)
                        .foregroundStyle(ChalkakColor.textSecondary)
                        .accessibilityIdentifier("notifications.item-time-\(key)")
                }
                Spacer(minLength: 0)
                if row.isUnread {
                    Circle()
                        .fill(ChalkakColor.accent)
                        .frame(width: 8, height: 8)
                        .padding(.top, ChalkakSpacing.xs)
                        .accessibilityIdentifier("notifications.item-unread-\(key)")
                }
            }
            .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            .padding(.vertical, ChalkakSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("notifications.item-\(key)")
    }
}
