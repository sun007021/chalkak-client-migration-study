import SwiftUI
import ChalkakData

/// 하트 버튼과 좋아요 수. 전시 그리드·추천 카드·상세가 함께 쓴다.
/// 상태(`isLiked`)는 접근성 selected로 노출하고, 수는 별도 요소(`countIdentifier`)로 둔다.
struct PostLikeButton: View {
    let like: LikeState
    let buttonIdentifier: String
    let countIdentifier: String
    var isEnabled: Bool = true
    /// 사진 위에 얹는 흰색 배지 모양(좌하단 정렬 터치 영역).
    var onImage: Bool = false
    let action: () -> Void

    var body: some View {
        if onImage {
            onImageBody
        } else {
            inlineBody
        }
    }

    /// 사진 위 배지(screens-b.md 2.2): 하트 template 18 + 숫자 subheadline, 모두 textOnImage, 옅은 그림자(black 25%, r2, y1).
    /// 터치 영역은 카드 모서리까지 넓히고 최소 44×44, 좌하단 정렬.
    private var onImageBody: some View {
        HStack(spacing: ChalkakSpacing.xs) {
            Button(action: action) {
                Image(like.isLiked ? "ic_heart_filled" : "ic_heart")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 18, height: 18)
                    .padding(.leading, 10)
                    .padding(.bottom, 10)
                    .padding(.top, 14)
                    .frame(minWidth: 32, minHeight: 44, alignment: .bottomLeading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!isEnabled)
            .accessibilityAddTraits(like.isLiked ? [.isSelected] : [])
            .accessibilityIdentifier(buttonIdentifier)
            Text("\(like.likeCount)")
                .font(ChalkakFont.subheadline)
                .padding(.bottom, 10)
                .padding(.trailing, 14)
                .frame(minHeight: 44, alignment: .bottomLeading)
                .accessibilityIdentifier(countIdentifier)
        }
        .foregroundStyle(ChalkakColor.textOnImage)
        .shadow(color: .black.opacity(0.25), radius: 2, x: 0, y: 1)
    }

    /// 상세 좋아요 행(screens-b.md 4.1): 하트 template 24(좋아요 actionPrimary / 아니면 textSecondary), 숫자 body/textSecondary, 간격 9, 최소 44.
    private var inlineBody: some View {
        HStack(spacing: 9) {
            Button(action: action) {
                Image(like.isLiked ? "ic_heart_filled" : "ic_heart")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 24, height: 24)
                    .foregroundStyle(like.isLiked ? ChalkakColor.actionPrimary : ChalkakColor.textSecondary)
                    .frame(width: 32, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!isEnabled)
            .accessibilityAddTraits(like.isLiked ? [.isSelected] : [])
            .accessibilityIdentifier(buttonIdentifier)
            Text("\(like.likeCount)")
                .font(ChalkakFont.body)
                .foregroundStyle(ChalkakColor.textSecondary)
                .accessibilityIdentifier(countIdentifier)
        }
    }
}
