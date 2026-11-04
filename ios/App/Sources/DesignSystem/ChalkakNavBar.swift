import SwiftUI

/// 원본 ChalkakNavigationButton(지름 48, SF chevron.backward/xmark). iOS 26 이상은 `.glass` 버튼 스타일, 그 미만은 평면 아이콘.
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
    var controlSize: ControlSize = .large
    let action: () -> Void

    var body: some View {
        if #available(iOS 26.0, *), ChalkakPlatformAppearance.usesLiquidGlass {
            Button(kind.title, systemImage: kind.systemImage, action: action)
                .labelStyle(.iconOnly)
                .foregroundStyle(ChalkakColor.iconPrimary)
                .tint(ChalkakColor.iconPrimary)
                .controlSize(controlSize)
                .buttonStyle(.glass)
                .buttonBorderShape(.circle)
                .frame(width: Self.diameter, height: Self.diameter)
                .contentShape(Circle())
                .accessibilityLabel(kind.title)
        } else {
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
}

/// 원형 아이콘 버튼의 스타일. iOS 26 이상 Liquid Glass면 `.glass`, 아니면 `.plain`(원본 ChalkakNavigationButtonStyle).
struct ChalkakNavigationButtonStyle: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *), ChalkakPlatformAppearance.usesLiquidGlass {
            content.buttonStyle(.glass)
        } else {
            content.buttonStyle(.plain)
        }
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
