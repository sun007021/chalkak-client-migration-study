import SwiftUI

/// URL 이미지를 비동기로 그린다(원본 RemoteImage, screens-a.md 1.8).
/// 로딩 중에는 스켈레톤 쉬머, URL이 없으면 SF `photo`, 실패하면 `photo.badge.exclamationmark` 플레이스홀더(바탕 inputBackground, 아이콘 24).
struct ChalkakRemoteImage: View {
    let url: URL?
    var contentMode: ContentMode = .fill

    var body: some View {
        if let url {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: contentMode)
                case .failure:
                    ChalkakImagePlaceholder(systemName: "photo.badge.exclamationmark")
                default:
                    ChalkakSkeleton()
                }
            }
        } else {
            ChalkakImagePlaceholder(systemName: "photo")
        }
    }
}

struct ChalkakImagePlaceholder: View {
    let systemName: String

    var body: some View {
        ZStack {
            ChalkakColor.inputBackground
            Image(systemName: systemName)
                .font(.system(size: 24))
                .foregroundStyle(ChalkakColor.iconSecondary)
        }
        .accessibilityHidden(true)
    }
}

/// 사진 + 오른쪽 아래 사인 합성(원본 ChalkakSignedImage). 기본 사인 56×42, padding sm.
struct ChalkakSignedImage: View {
    let imageURL: URL?
    let signatureURL: URL?
    var contentMode: ContentMode = .fill
    var signatureSize = CGSize(width: 56, height: 42)

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottomTrailing) {
                ChalkakRemoteImage(url: imageURL, contentMode: contentMode)
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .clipped()
                if let signatureURL {
                    ChalkakRemoteImage(url: signatureURL, contentMode: .fit)
                        .frame(width: signatureSize.width, height: signatureSize.height)
                        .padding(ChalkakSpacing.sm)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
    }
}
