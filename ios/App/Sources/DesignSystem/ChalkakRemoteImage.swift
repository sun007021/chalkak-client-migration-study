import SwiftUI

/// URL 이미지를 비동기로 그린다. 주소가 없거나 로딩·실패 중에는 대체 배경을 보인다.
struct ChalkakRemoteImage: View {
    let url: URL?
    var contentMode: ContentMode = .fill

    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let image):
                image.resizable().aspectRatio(contentMode: contentMode)
            default:
                ChalkakColor.calendarCell
            }
        }
    }
}
