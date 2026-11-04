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
            VStack(spacing: ChalkakSpacing.lg) {
                ProgressView().tint(ChalkakColor.actionPrimary)
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
                    Image(systemName: "bell")
                        .font(.system(size: 34))
                        .foregroundStyle(ChalkakColor.iconSecondary)
                        .accessibilityHidden(true)
                    Text(NotificationCopy.emptyTitle)
                        .font(ChalkakFont.body)
                        .foregroundStyle(ChalkakColor.textSecondary)
                    Text(NotificationCopy.emptyBody)
                        .font(ChalkakFont.subheadline)
                        .foregroundStyle(ChalkakColor.textMuted)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 144)
                .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("notifications.empty-state")
            }
            .refreshable { await viewModel.refresh() }
        case .error(let message):
            VStack(spacing: ChalkakSpacing.xl) {
                Text(message)
                    .font(ChalkakFont.body)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .multilineTextAlignment(.center)
                Button { Task { await viewModel.retry() } } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(ChalkakColor.onActionPrimary)
                        .frame(width: 48, height: 48)
                        .background(ChalkakColor.actionPrimary, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(NotificationCopy.retry)
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
                        .tint(ChalkakColor.actionPrimary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, ChalkakSpacing.xl)
                        .accessibilityIdentifier("notifications.load-more-indicator")
                }
            }
        }
        .refreshable { await viewModel.refresh() }
        .accessibilityIdentifier("notifications.list")
    }
}

/// 알림 한 줄(screens-c.md 3.1.2): 미읽음 점 칸(12), 제목(subheadline 2줄)·본문(caption)·시각(caption/textInactive), 썸네일 44, 아래 구분선.
private struct NotificationRowView: View {
    let row: NotificationRow
    let onTap: () -> Void

    var body: some View {
        let key = row.id.uuidString.lowercased()
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 0) {
                ZStack(alignment: .top) {
                    if row.isUnread {
                        Circle()
                            .fill(ChalkakColor.inputCursor)
                            .frame(width: 8, height: 8)
                            .accessibilityIdentifier("notifications.item-unread-\(key)")
                    }
                }
                .frame(width: ChalkakSpacing.md)
                .padding(.top, ChalkakSpacing.xs)
                VStack(alignment: .leading, spacing: ChalkakSpacing.sm) {
                    Text(row.title)
                        .font(ChalkakFont.subheadline)
                        .foregroundStyle(ChalkakColor.textPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .accessibilityIdentifier("notifications.item-title-\(key)")
                    if !row.body.isEmpty {
                        Text(row.body)
                            .font(ChalkakFont.caption)
                            .foregroundStyle(ChalkakColor.textSecondary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                            .accessibilityIdentifier("notifications.item-body-\(key)")
                    }
                    Text(row.timeText)
                        .font(ChalkakFont.caption)
                        .foregroundStyle(ChalkakColor.textInactive)
                        .accessibilityIdentifier("notifications.item-time-\(key)")
                }
                .padding(.leading, ChalkakSpacing.md)
                .frame(maxWidth: .infinity, alignment: .leading)
                if row.thumbnailURL != nil {
                    ChalkakRemoteImage(url: row.thumbnailURL)
                        .frame(width: 44, height: 44)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .padding(.leading, ChalkakSpacing.lg)
                        .accessibilityIdentifier("notifications.item-thumbnail-\(key)")
                }
            }
            .padding(.vertical, ChalkakSpacing.xl)
            .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .bottom) {
                Rectangle().fill(ChalkakColor.border).frame(height: 1)
                    .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("notifications.item-\(key)")
    }
}
