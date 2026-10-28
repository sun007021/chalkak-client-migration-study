import SwiftUI
import ChalkakData
import ChalkakFeatures

/// 히어로 카드. 상태(7가지)와 문구는 `HomeViewModel.hero`/`heroText`가 정한다.
struct HomeHeroCard: View {
    let viewModel: HomeViewModel

    var body: some View {
        content
            .frame(maxWidth: .infinity)
            .aspectRatio(5.0 / 6.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.card))
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.hero {
        case .loading:
            status(viewModel.heroText, identifier: "home.hero-loading") { ProgressView() }
        case .noOpenTopic:
            status(viewModel.heroText, identifier: "home.hero-no-open-topic") { EmptyView() }
        case .processing:
            status(viewModel.heroText, identifier: "home.hero-processing") { EmptyView() }
        case .error:
            status(viewModel.heroText, identifier: "home.hero-error") {
                Button { Task { await viewModel.retry(.hero) } } label: {
                    Text(HomeCopy.retry)
                        .font(ChalkakFont.footnote)
                        .foregroundStyle(ChalkakColor.onActionPrimary)
                        .padding(.horizontal, ChalkakSpacing.lg)
                        .frame(minHeight: 36)
                        .background(ChalkakColor.actionPrimary, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("home.hero-retry-button")
            }
        case .empty:
            ZStack {
                Button { Task { await viewModel.heroTapped() } } label: {
                    VStack(spacing: ChalkakSpacing.xl) {
                        Text(viewModel.heroText)
                            .font(ChalkakFont.subheadline)
                            .foregroundStyle(ChalkakColor.textPrimary)
                            .multilineTextAlignment(.center)
                        Image(systemName: "plus")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(ChalkakColor.onActionPrimary)
                            .frame(width: 36, height: 36)
                            .background(ChalkakColor.actionPrimary, in: Circle())
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(ChalkakColor.surfaceElevated)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("home.hero-upload-button")
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("home.hero-empty")
        case .photo(_, let thumbnailURL, let isPending):
            ZStack(alignment: .topTrailing) {
                ChalkakRemoteImage(url: thumbnailURL)
                if isPending {
                    Text(HomeCopy.heroPendingBadge)
                        .font(ChalkakFont.caption)
                        .foregroundStyle(ChalkakColor.textOnImage)
                        .padding(.horizontal, ChalkakSpacing.md)
                        .padding(.vertical, ChalkakSpacing.xs)
                        .background(ChalkakColor.scrim, in: Capsule())
                        .padding(ChalkakSpacing.md)
                        .accessibilityIdentifier("home.hero-pending-badge")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("home.hero-photo")
        }
    }

    private func status<Action: View>(_ text: String, identifier: String, @ViewBuilder action: () -> Action) -> some View {
        VStack(spacing: ChalkakSpacing.md) {
            Text(text)
                .font(ChalkakFont.subheadline)
                .foregroundStyle(ChalkakColor.textSecondary)
                .multilineTextAlignment(.center)
            action()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ChalkakColor.surfaceElevated)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(identifier)
    }
}
