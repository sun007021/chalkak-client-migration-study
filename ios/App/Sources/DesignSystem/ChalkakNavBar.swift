import SwiftUI

/// 원본 ChalkakNavigationButton(지름 48, SF chevron.backward/xmark). iOS 26 glass 스타일은 Xcode 16 빌드에서 컴파일되지 않아 플랫 스타일만 쓴다.
struct ChalkakNavigationButton: View {
    enum Kind {
        case back
        case close

        var title: String {
            switch self {
            case .back: "뒤로 가기"
            case .close: "닫기"
            }
        }

        var systemImage: String {
            switch self {
            case .back: "chevron.backward"
            case .close: "xmark"
            }
        }
    }

    static let diameter: CGFloat = 48

    let kind: Kind
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: kind.systemImage)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(ChalkakColor.iconPrimary)
                .frame(width: Self.diameter, height: Self.diameter)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(kind.title)
    }
}

/// 쌓임 화면 위쪽 바: 뒤로 버튼과 가운데 제목. 높이 55(홈 상단 바와 같다), 아래 구분선은 border.
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
                ChalkakNavigationButton(kind: .back, action: onBack)
                    .accessibilityIdentifier(backIdentifier)
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, ChalkakSpacing.xs)
        .frame(height: 55)
    }
}
