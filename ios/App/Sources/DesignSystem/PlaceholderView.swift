import SwiftUI

/// 아직 구현하지 않은 목적지 자리표시자(다음 PR이 실제 화면으로 바꾼다). 제목만 보인다.
/// `onBack`이 있으면 쌓임 화면처럼 뒤로 버튼을 함께 그린다.
struct PlaceholderView: View {
    let title: String
    let identifier: String
    var onBack: (() -> Void)?

    var body: some View {
        VStack(spacing: 0) {
            if let onBack {
                ChalkakNavBar(title: title, backIdentifier: "\(identifier).back-button", titleIdentifier: "\(identifier).title", onBack: onBack)
            }
            ZStack {
                if onBack == nil {
                    Text(title)
                        .font(ChalkakFont.headline)
                        .foregroundStyle(ChalkakColor.textPrimary)
                        .accessibilityIdentifier("\(identifier).title")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(ChalkakColor.background.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("\(identifier).root")
    }
}
