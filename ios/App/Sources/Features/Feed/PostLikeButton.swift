import SwiftUI
import ChalkakData

/// 하트 버튼과 좋아요 수. 전시 그리드·추천 카드·상세가 함께 쓴다.
/// 상태(`isLiked`)는 접근성 selected로 노출하고, 수는 별도 요소(`countIdentifier`)로 둔다.
struct PostLikeButton: View {
    let like: LikeState
    let buttonIdentifier: String
    let countIdentifier: String
    var isEnabled: Bool = true
    /// 사진 위에 얹을 때 읽히도록 반투명 배경을 깐다.
    var onImage: Bool = false
    let action: () -> Void

    var body: some View {
        HStack(spacing: ChalkakSpacing.xs) {
            Button(action: action) {
                Image(like.isLiked ? "ic_heart_filled" : "ic_heart")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 20, height: 20)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!isEnabled)
            .accessibilityAddTraits(like.isLiked ? [.isSelected] : [])
            .accessibilityIdentifier(buttonIdentifier)
            Text("\(like.likeCount)")
                .font(ChalkakFont.caption)
                .foregroundStyle(ChalkakColor.textPrimary)
                .accessibilityIdentifier(countIdentifier)
        }
        .padding(.horizontal, onImage ? ChalkakSpacing.sm : 0)
        .background {
            if onImage {
                Capsule().fill(ChalkakColor.surfaceElevated.opacity(0.88))
            }
        }
    }
}
