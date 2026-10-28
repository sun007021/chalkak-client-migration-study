import SwiftUI

/// 쌓임 화면 위쪽 바: 뒤로 버튼과 제목.
struct ChalkakNavBar: View {
    let title: String
    let backIdentifier: String
    let titleIdentifier: String?
    let onBack: () -> Void

    var body: some View {
        ZStack {
            Text(title)
                .font(ChalkakFont.headline)
                .foregroundStyle(ChalkakColor.textPrimary)
                .accessibilityIdentifier(titleIdentifier ?? "")
            HStack {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(ChalkakColor.iconPrimary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier(backIdentifier)
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, ChalkakSpacing.sm)
        .frame(height: 52)
    }
}
