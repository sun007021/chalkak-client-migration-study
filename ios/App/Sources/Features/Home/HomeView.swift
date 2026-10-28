import SwiftUI
import ChalkakCore
import ChalkakData
import ChalkakFeatures

/// 홈 탭. `HomeViewModel` 상태를 그리기만 한다(문구·분기·정책은 ViewModel/Copy).
struct HomeView: View {
    let viewModel: HomeViewModel

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    topicHeader
                    HomeHeroCard(viewModel: viewModel)
                    HomeWeekSection(viewModel: viewModel)
                    HomeRankingSection(
                        viewModel: viewModel, section: .ranking, title: HomeCopy.rankingYesterdayTitle,
                        state: viewModel.ranking, identifierPrefix: "ranking"
                    )
                    HomeRankingSection(
                        viewModel: viewModel, section: .popular, title: HomeCopy.rankingTodayTitle,
                        state: viewModel.popular, identifierPrefix: "popular"
                    )
                    HomeIssueSection(viewModel: viewModel)
                }
                .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                .padding(.top, ChalkakSpacing.sm)
                .padding(.bottom, ChalkakSpacing.xl)
            }
            .refreshable { await viewModel.refresh() }
            .accessibilityIdentifier("home.scroll")
        }
        .background(ChalkakColor.background.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home.root")
        .task { await viewModel.homeAppeared() }
        .onDisappear { viewModel.homeDisappeared() }
    }

    private var topBar: some View {
        HStack(spacing: 0) {
            Text("Chalkak")
                .font(ChalkakFont.brand)
                .foregroundStyle(ChalkakColor.textPrimary)
                .accessibilityHidden(true)
            Spacer(minLength: 0)
            Button { viewModel.notificationTapped() } label: {
                ZStack(alignment: .topTrailing) {
                    Image("ic_notification")
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 24, height: 24)
                        .foregroundStyle(ChalkakColor.iconPrimary)
                    if viewModel.hasUnread {
                        Circle()
                            .fill(ChalkakColor.accent)
                            .frame(width: 7, height: 7)
                            .offset(x: 2, y: -2)
                            .accessibilityIdentifier("home.notification-unread-dot")
                    }
                }
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("home.notification-button")
        }
        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
        .frame(height: 55)
    }

    @ViewBuilder
    private var topicHeader: some View {
        switch viewModel.topicHeader {
        case .loading:
            topicStatus(HomeCopy.topicLoading)
        case .notReady:
            topicStatus(HomeCopy.topicNotReady)
        case .failed:
            topicStatus(HomeCopy.topicError)
        case .ready(let dateLabel, let title):
            VStack(alignment: .leading, spacing: ChalkakSpacing.xs) {
                Text(dateLabel)
                    .font(ChalkakFont.subheadline)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .accessibilityIdentifier("home.topic-date")
                Text(title)
                    .font(ChalkakFont.display)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .accessibilityIdentifier("home.topic-title")
            }
        }
    }

    private func topicStatus(_ text: String) -> some View {
        Text(text)
            .font(ChalkakFont.subheadline)
            .foregroundStyle(ChalkakColor.textSecondary)
            .accessibilityIdentifier("home.topic-title")
    }
}

/// 섹션 머리글: 제목, 선택적 보조 문구, 오른쪽 더 보기.
struct HomeSectionHeader<Trailing: View>: View {
    let title: String
    let suffix: String?
    let suffixIdentifier: String?
    let trailing: Trailing

    init(title: String, suffix: String? = nil, suffixIdentifier: String? = nil, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.suffix = suffix
        self.suffixIdentifier = suffixIdentifier
        self.trailing = trailing()
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: ChalkakSpacing.sm) {
            Text(title)
                .font(ChalkakFont.headlineBold)
                .foregroundStyle(ChalkakColor.textPrimary)
            if let suffix {
                Text(suffix)
                    .font(ChalkakFont.subheadline)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .accessibilityIdentifier(suffixIdentifier ?? "")
            }
            Spacer(minLength: 0)
            trailing
        }
    }
}

/// 섹션 안의 오류 줄: 문구와 "다시 시도" 버튼.
struct HomeSectionError: View {
    let message: String
    let messageIdentifier: String
    let retryIdentifier: String
    let onRetry: () -> Void

    var body: some View {
        HStack(spacing: ChalkakSpacing.md) {
            Text(message)
                .font(ChalkakFont.footnote)
                .foregroundStyle(ChalkakColor.textSecondary)
                .accessibilityIdentifier(messageIdentifier)
            Button(action: onRetry) {
                Text(HomeCopy.retry)
                    .font(ChalkakFont.footnote)
                    .foregroundStyle(ChalkakColor.onActionPrimary)
                    .padding(.horizontal, ChalkakSpacing.md)
                    .frame(minHeight: 32)
                    .background(ChalkakColor.actionPrimary, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier(retryIdentifier)
        }
        .frame(maxWidth: .infinity, minHeight: 64)
    }
}
