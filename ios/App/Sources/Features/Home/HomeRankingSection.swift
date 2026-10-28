import SwiftUI
import ChalkakCore
import ChalkakData
import ChalkakFeatures

/// 어제 랭킹 / 오늘 인기있는 사진 가로 목록. `identifierPrefix`는 `ranking` 또는 `popular`.
struct HomeRankingSection: View {
    let viewModel: HomeViewModel
    let section: HomeSection
    let title: String
    let state: SectionState<[PostListItem]>
    let identifierPrefix: String

    var body: some View {
        VStack(alignment: .leading, spacing: ChalkakSpacing.lg) {
            HomeSectionHeader(title: title) {
                Button { viewModel.moreTapped(section) } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(ChalkakColor.iconPrimary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(title)
                .accessibilityIdentifier("home.\(identifierPrefix)-more-link")
            }
            switch state {
            case .loading:
                ProgressView().frame(maxWidth: .infinity, minHeight: 120)
            case .failed(let message):
                HomeSectionError(
                    message: message,
                    messageIdentifier: "home.\(identifierPrefix)-error",
                    retryIdentifier: "home.\(identifierPrefix)-retry-button",
                    onRetry: { Task { await viewModel.retry(section) } }
                )
            case .ready(let items):
                if items.isEmpty {
                    Text(HomeCopy.rankingEmpty)
                        .font(ChalkakFont.footnote)
                        .foregroundStyle(ChalkakColor.textSecondary)
                        .frame(maxWidth: .infinity, minHeight: 64)
                        .accessibilityIdentifier("home.\(identifierPrefix)-empty")
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: ChalkakSpacing.md) {
                            ForEach(items) { item in
                                itemView(item)
                            }
                        }
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home.\(identifierPrefix)-section")
    }

    private func itemView(_ item: PostListItem) -> some View {
        let postId = item.id.uuidString.lowercased()
        return VStack(alignment: .leading, spacing: ChalkakSpacing.xs) {
            ChalkakRemoteImage(url: item.thumbnailImageURL ?? item.originalImageURL)
                .frame(width: 140, height: 168)
                .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.small))
            HStack(spacing: ChalkakSpacing.xs) {
                Image(item.isLiked ? "ic_heart_filled" : "ic_heart")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 14, height: 14)
                Text("\(item.likeCount)")
                    .font(ChalkakFont.caption)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .accessibilityIdentifier("home.\(identifierPrefix)-like-count-\(postId)")
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { viewModel.rankingItemTapped(item) }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home.\(identifierPrefix)-item-\(postId)")
    }
}
