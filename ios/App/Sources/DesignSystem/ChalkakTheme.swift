import SwiftUI

/// 기존 앱 DesignSystem/Foundation에서 필요한 토큰만 옮긴 것.
enum ChalkakColor {
    static let background = Color(hex: 0xF7F6F3)
    static let surfaceElevated = Color.white
    static let inputBackground = Color(hex: 0xFCFAF6)
    static let textPrimary = Color(hex: 0x2B2724)
    static let textSecondary = Color(hex: 0x2B2724).opacity(0.68)
    static let border = Color(hex: 0x888888).opacity(0.15)
    static let actionPrimary = Color(hex: 0x2B2724)
    static let onActionPrimary = Color.white
    static let scrim = Color.black.opacity(0.4)
    static let error = Color(hex: 0xBA1A1A)
    static let textOnImage = Color.white
    static let iconPrimary = Color(hex: 0x2B2724)
    static let bottomBarInactive = Color(hex: 0x8C8479)
    static let calendarCell = Color(hex: 0xEAE7DE)
    static let accent = Color(hex: 0xB0563B)
}

enum ChalkakFont {
    static let display = Font.custom("Pretendard-Bold", size: 32, relativeTo: .largeTitle)
    static let headline = Font.custom("Pretendard-SemiBold", size: 18, relativeTo: .headline)
    static let body = Font.custom("Pretendard-Regular", size: 17, relativeTo: .body)
    static let callout = Font.custom("Pretendard-Regular", size: 16, relativeTo: .callout)
    static let headlineBold = Font.custom("Pretendard-Bold", size: 18, relativeTo: .headline)
    static let subheadline = Font.custom("Pretendard-Regular", size: 14, relativeTo: .subheadline)
    static let footnote = Font.custom("Pretendard-Regular", size: 13, relativeTo: .footnote)
    static let caption = Font.custom("Pretendard-Regular", size: 12, relativeTo: .caption)
    static let brand = Font.custom("Continuous", size: 30, relativeTo: .title)
}

enum ChalkakSpacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 24
    static let screenHorizontal: CGFloat = 25
}

enum ChalkakRadius {
    static let small: CGFloat = 8
    static let card: CGFloat = 16
    static let button: CGFloat = 12
    static let dialog: CGFloat = 16
}

private extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}
