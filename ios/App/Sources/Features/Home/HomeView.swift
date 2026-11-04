import SwiftUI
import ChalkakCore
import ChalkakData
import ChalkakFeatures

/// 홈 탭. `HomeViewModel` 상태를 그리기만 한다(문구·분기·정책은 ViewModel/Copy).
struct HomeView: View {
    let viewModel: HomeViewModel
    let container: AppContainer
    let session: MainSession
    /// 홈이 쌓임 화면에 가려지지 않았는가(AI 카드 조회·폴링 판단).
    let isActive: Bool

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                // 원본 HomeScreen(screens-a.md 7.1) 간격: 주제 32 → 히어로 24 → AI 카드 16 → 이번 주 40 → 랭킹 40 → ISSUE 40
                VStack(alignment: .leading, spacing: 0) {
                    topicHeader
                        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                        .padding(.top, ChalkakSpacing.xl + ChalkakSpacing.sm)
                    HomeHeroCard(viewModel: viewModel)
                        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                        .padding(.top, ChalkakSpacing.xl)
                    HomeAICardSlot(container: container, session: session, isActive: isActive)
                    HomeWeekSection(viewModel: viewModel)
                        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                        .padding(.top, ChalkakSpacing.xxl)
                    HomeRankingSection(
                        viewModel: viewModel, section: .ranking, title: HomeCopy.rankingYesterdayTitle,
                        state: viewModel.ranking, identifierPrefix: "ranking"
                    )
                    .padding(.top, ChalkakSpacing.xxl)
                    HomeRankingSection(
                        viewModel: viewModel, section: .popular, title: HomeCopy.rankingTodayTitle,
                        state: viewModel.popular, identifierPrefix: "popular"
                    )
                    .padding(.top, ChalkakSpacing.xxl)
                    HomeIssueSection(viewModel: viewModel)
                        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                        .padding(.top, ChalkakSpacing.xxl)
                }
                .padding(.bottom, ChalkakSpacing.xxl)
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

    /// 상단 바(screens-a.md 7.2): 높이 55, 로고(y +5) + 알림 버튼(터치 44, 미읽음 점 7), 배경 background 96%, 아래 구분선 border.
    private var topBar: some View {
        HStack(spacing: 0) {
            ChalkakLogo()
                .offset(y: 5)
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
                            .fill(ChalkakColor.inputCursor)
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
        .background(ChalkakColor.background.opacity(0.96))
        .overlay(alignment: .bottom) {
            Rectangle().fill(ChalkakColor.border).frame(height: 1)
        }
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
            VStack(alignment: .leading, spacing: ChalkakSpacing.sm) {
                Text(dateLabel)
                    .font(ChalkakFont.subheadline)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .accessibilityIdentifier("home.topic-date")
                Text(title)
                    .font(ChalkakFont.title2)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .accessibilityIdentifier("home.topic-title")
            }
        }
    }

    private func topicStatus(_ text: String) -> some View {
        Text(text)
            .font(ChalkakFont.title2)
            .foregroundStyle(ChalkakColor.textMuted)
            .accessibilityIdentifier("home.topic-title")
    }
}

/// 섹션 머리글: 제목(headline bold), 선택적 보조 문구, 오른쪽 더 보기.
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
        HStack(alignment: .firstTextBaseline, spacing: ChalkakSpacing.xs) {
            Text(title)
                .font(ChalkakFont.headlineBold)
                .foregroundStyle(ChalkakColor.textPrimary)
            if let suffix {
                Text(suffix)
                    .font(ChalkakFont.captionSemibold)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .accessibilityIdentifier(suffixIdentifier ?? "")
            }
            Spacer(minLength: ChalkakSpacing.sm)
            trailing
        }
    }
}

/// "보러가기 >" 링크 모양(caption + chevron.right 12). 터치 높이 44.
struct HomeMoreLabel: View {
    var body: some View {
        HStack(spacing: ChalkakSpacing.xs) {
            Text(HomeCopy.weeklyMore)
                .font(ChalkakFont.caption)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
        }
        .foregroundStyle(ChalkakColor.textPrimary)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }
}

/// 재시도 원형 버튼(지름 `diameter`, actionPrimary, SF arrow.clockwise).
struct ChalkakRetryCircleButton: View {
    var diameter: CGFloat = 32
    var iconSize: CGFloat = 15
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "arrow.clockwise")
                .font(.system(size: iconSize, weight: .semibold))
                .foregroundStyle(ChalkakColor.onActionPrimary)
                .frame(width: diameter, height: diameter)
                .background(ChalkakColor.actionPrimary, in: Circle())
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(HomeCopy.retry)
    }
}

/// 섹션 안의 오류 줄: 문구(footnote/textSecondary)와 재시도 원 버튼. 높이 48.
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
            ChalkakRetryCircleButton(action: onRetry)
                .accessibilityIdentifier(retryIdentifier)
        }
        .frame(maxWidth: .infinity, minHeight: 48)
    }
}
