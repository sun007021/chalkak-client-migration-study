import SwiftUI

/// 원본 ChalkakLogo: "Chalkak" brand 30, 자간 -0.42, 접근성 "찰캌".
struct ChalkakLogo: View {
    var body: some View {
        Text("Chalkak")
            .chalkakBrandStyle()
            .foregroundStyle(ChalkakColor.textPrimary)
            .accessibilityLabel("찰캌")
    }
}
