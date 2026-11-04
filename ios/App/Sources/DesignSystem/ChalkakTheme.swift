import SwiftUI

// 값의 기준은 shared/design/tokens.json 이다. 바꾸면 ChalkakKit의 DesignTokensContractTests가 불일치를 알려준다.
// 원본: client/iOS DesignSystem/Foundation (ChalkakColor·ChalkakTypography·ChalkakShape·ChalkakSpacing).

enum ChalkakColor {
    static let background = Color(hex: 0xF7F6F3)
    static let surface = Color(hex: 0xF7F6F3)
    static let surfaceElevated = Color.white
    static let inputBackground = Color(hex: 0xFCFAF6)
    static let bottomBar = Color(hex: 0x8C8479)
    static let textPrimary = Color(hex: 0x2B2724)
    static let textSecondary = Color(hex: 0x2B2724).opacity(0.68)
    static let textMuted = Color(hex: 0x2B2724).opacity(0.48)
    static let textInactive = Color(hex: 0x9A968D)
    static let textNeutral = Color(hex: 0x6B7280)
    static let textOnImage = Color.white
    static let border = Color(hex: 0x888888).opacity(0.15)
    static let divider = Color(hex: 0x757575)
    static let inputCursor = Color(hex: 0xB0563B)
    static let accent = Color(hex: 0xB0563B)
    static let actionPrimary = Color(hex: 0x2B2724)
    static let onActionPrimary = Color.white
    static let actionSecondary = Color(hex: 0x808080)
    static let onActionSecondary = Color.white
    static let photoActionText = Color(hex: 0x7D7D7D)
    static let iconPrimary = Color(hex: 0x2B2724)
    static let iconSecondary = Color(hex: 0x2B2724).opacity(0.62)
    static let scrim = Color.black.opacity(0.4)
    static let error = Color(hex: 0xBA1A1A)
    static let destructive = Color(hex: 0xFF5A5F)
    static let calendarCell = Color(hex: 0xEAE7DE)
    static let calendarCellBorder = Color(hex: 0xDCD8CE)
    static let calendarSelection = Color(hex: 0xB0563B)
    static let skeletonBase = Color(hex: 0xEAE7DE)
    static let skeletonHighlight = Color(hex: 0xF7F6F3)
    static let logoBackground = Color(hex: 0xFFFAF6)
    static let editorBackground = Color(hex: 0x141312)
    static let editorContent = Color.white
    static let editorContentMuted = Color.white.opacity(0.56)
    static let editorScrim = Color(hex: 0x141312).opacity(0.62)
}

/// Pretendard·Continuous·반구리. 번들 글꼴이며 접근성 글자 크기는 `relativeTo`로 따라간다.
/// SwiftUI `Font`는 행간·자간을 담지 못한다. brand의 자간(-0.42)과 handwriting의 행간(17)은
/// `chalkakBrandStyle()`·`chalkakLineHeight(_:size:)`로 보정한다.
enum ChalkakFont {
    static let display = Font.custom("Pretendard-Bold", size: 32, relativeTo: .largeTitle)
    static let title1 = Font.custom("Pretendard-Bold", size: 28, relativeTo: .title)
    static let title2 = Font.custom("Pretendard-Bold", size: 24, relativeTo: .title2)
    static let title3 = Font.custom("Pretendard-SemiBold", size: 20, relativeTo: .title3)
    static let headline = Font.custom("Pretendard-SemiBold", size: 18, relativeTo: .headline)
    static let body = Font.custom("Pretendard-Regular", size: 17, relativeTo: .body)
    static let callout = Font.custom("Pretendard-Regular", size: 16, relativeTo: .callout)
    static let headlineBold = Font.custom("Pretendard-Bold", size: 18, relativeTo: .headline)
    static let subheadline = Font.custom("Pretendard-Regular", size: 14, relativeTo: .subheadline)
    static let footnote = Font.custom("Pretendard-Regular", size: 13, relativeTo: .footnote)
    static let caption = Font.custom("Pretendard-Regular", size: 12, relativeTo: .caption)
    static let brand = Font.custom("Continuous", size: 30, relativeTo: .title)
    static let handwriting = Font.custom("GriunXHangeulBanguri-Regular", size: 20, relativeTo: .title3)
    static let photoCardTitle = Font.custom("GriunXHangeulBanguri-Regular", size: 19, relativeTo: .title3)

    // 굵기만 바꾼 변형(원본의 `.fontWeight(.semibold)` 대응). 시스템 글꼴로 떨어지지 않도록 번들 글꼴 이름을 쓴다.
    static let calloutSemibold = Font.custom("Pretendard-SemiBold", size: 16, relativeTo: .callout)
    static let subheadlineSemibold = Font.custom("Pretendard-SemiBold", size: 14, relativeTo: .subheadline)
    static let subheadlineBold = Font.custom("Pretendard-Bold", size: 14, relativeTo: .subheadline)
    static let footnoteSemibold = Font.custom("Pretendard-SemiBold", size: 13, relativeTo: .footnote)
    static let footnoteBold = Font.custom("Pretendard-Bold", size: 13, relativeTo: .footnote)
    static let captionSemibold = Font.custom("Pretendard-SemiBold", size: 12, relativeTo: .caption)
    static let title1Regular = Font.custom("Pretendard-Regular", size: 28, relativeTo: .title)
}

enum ChalkakSpacing {
    static let none: CGFloat = 0
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 40
    static let screenHorizontal: CGFloat = 25
}

enum ChalkakRadius {
    static let small: CGFloat = 7
    static let button: CGFloat = 12
    static let input: CGFloat = 14
    static let photoCard: CGFloat = 12
    static let large: CGFloat = 16
    static let xlarge: CGFloat = 18
    static let sheet: CGFloat = 28
}

extension View {
    /// brand 글꼴 + 원본 자간(-0.42).
    func chalkakBrandStyle() -> some View {
        font(ChalkakFont.brand).tracking(-0.42)
    }

    /// 글꼴 크기 `size`에 대해 원하는 행간(`lineHeight`)이 되도록 보정한다(SwiftUI의 lineSpacing은 기본 행간에 더해진다).
    func chalkakLineHeight(_ lineHeight: CGFloat, size: CGFloat) -> some View {
        // 기본 행간은 대략 글꼴 크기 × 1.2 로 보고 차이만큼만 더한다. 음수면 0.
        lineSpacing(max(0, lineHeight - size * 1.2))
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

/// iOS 26 이상에서 Liquid Glass를 쓸지 정한다(원본 ChalkakPlatformAppearance).
/// 배포 대상은 iOS 18이므로 iOS 26 API는 호출하는 곳마다 `if #available(iOS 26.0, *)`로 함께 감싼다.
enum ChalkakPlatformAppearance {
    static var usesLiquidGlass: Bool {
        #if DEBUG
        // 기존 시뮬레이터에서 iOS 26 미만 모양을 미리 본다(실행 인자 `-use-flat-ios-design`).
        if ProcessInfo.processInfo.arguments.contains("-use-flat-ios-design") {
            return false
        }
        #endif
        if #available(iOS 26.0, *) { return true }
        return false
    }
}
