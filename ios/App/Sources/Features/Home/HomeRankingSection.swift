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
                    HomeMoreLabel()
                }
                .buttonStyle(.plain)
                .accessibilityLabel(title)
                .accessibilityIdentifier("home.\(identifierPrefix)-more-link")
            }
            .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            switch state {
            case .loading:
                ProgressView().frame(maxWidth: .infinity, minHeight: 48)
            case .failed(let message):
                HomeSectionError(
                    message: message,
                    messageIdentifier: "home.\(identifierPrefix)-error",
                    retryIdentifier: "home.\(identifierPrefix)-retry-button",
                    onRetry: { Task { await viewModel.retry(section) } }
                )
                .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            case .ready(let items):
                if items.isEmpty {
                    Text(HomeCopy.rankingEmpty)
                        .font(ChalkakFont.footnote)
                        .foregroundStyle(ChalkakColor.textSecondary)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                        .accessibilityIdentifier("home.\(identifierPrefix)-empty")
                } else {
                    // 가로 스크롤은 화면 끝까지 흐르고 첫 카드만 screenHorizontal에서 시작한다.
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: ChalkakSpacing.lg) {
                            ForEach(items) { item in
                                itemView(item)
                            }
                        }
                        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
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
                .frame(width: 82, height: 82)
                .background(ChalkakColor.calendarCell)
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
