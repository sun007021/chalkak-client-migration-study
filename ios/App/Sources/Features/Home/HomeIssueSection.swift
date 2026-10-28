import SwiftUI
import ChalkakCore
import ChalkakData
import ChalkakFeatures

/// ISSUE 배너 목록. 배너가 없거나 조회 중이면 섹션 자체를 그리지 않고, 최초 조회 실패만 오류 줄을 보인다.
struct HomeIssueSection: View {
    let viewModel: HomeViewModel

    var body: some View {
        switch viewModel.banners.state {
        case .loading, .hidden:
            EmptyView()
        case .failed(let message):
            HomeSectionError(
                message: message, messageIdentifier: "home.issue-error", retryIdentifier: "home.issue-retry-button",
                onRetry: { Task { await viewModel.retry(.issue) } }
            )
        case .items(let banners):
            VStack(alignment: .leading, spacing: ChalkakSpacing.lg) {
                HomeSectionHeader(title: HomeCopy.issueTitle) { EmptyView() }
                LazyVStack(alignment: .leading, spacing: ChalkakSpacing.xl) {
                    ForEach(Array(banners.enumerated()), id: \.element.id) { index, banner in
                        card(banner)
                            .onAppear { Task { await viewModel.banners.itemAppeared(index: index) } }
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("home.issue-section")
        }
    }

    private func card(_ banner: Banner) -> some View {
        VStack(alignment: .leading, spacing: ChalkakSpacing.md) {
            ChalkakRemoteImage(url: banner.thumbnailURL)
                .frame(maxWidth: .infinity)
                .aspectRatio(1672.0 / 941.0, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.card))
            Text(banner.title)
                .font(ChalkakFont.subheadline)
                .foregroundStyle(ChalkakColor.textPrimary)
            if let subtitle = banner.subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(ChalkakFont.caption)
                    .foregroundStyle(ChalkakColor.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .onTapGesture { viewModel.bannerTapped(banner) }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home.issue-item-\(banner.id.uuidString.lowercased())")
    }
}
