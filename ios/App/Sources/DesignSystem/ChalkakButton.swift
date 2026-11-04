import SwiftUI

// 원본: DesignSystem/Components/Button (ChalkakButton, ChalkakOutlinedButton) — docs/design/screens-a.md 1.1, 1.2

/// 주 버튼. 높이는 세로 패딩 17 + callout, 라운드 12, 비활성은 actionPrimary 12% 배경.
struct ChalkakButton: View {
    let title: String
    let action: () -> Void
    var isEnabled = true
    var fillsWidth = false
    var verticalPadding: CGFloat = 17

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(ChalkakFont.callout)
                .frame(maxWidth: fillsWidth ? .infinity : nil)
                .padding(.horizontal, ChalkakSpacing.xl)
                .padding(.vertical, verticalPadding)
                .foregroundStyle(isEnabled ? ChalkakColor.onActionPrimary : ChalkakColor.textPrimary)
                .background(
                    isEnabled ? ChalkakColor.actionPrimary : ChalkakColor.actionPrimary.opacity(0.12),
                    in: RoundedRectangle(cornerRadius: ChalkakRadius.button)
                )
                .contentShape(RoundedRectangle(cornerRadius: ChalkakRadius.button))
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
    }
}

/// 보조 버튼. 1pt border 테두리, 투명 배경(히트 영역용 0.001).
struct ChalkakOutlinedButton: View {
    let title: String
    let action: () -> Void
    var isEnabled = true
    var fillsWidth = false
    var verticalPadding: CGFloat = 17

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(ChalkakFont.callout)
                .frame(maxWidth: fillsWidth ? .infinity : nil)
                .padding(.horizontal, ChalkakSpacing.xl)
                .padding(.vertical, verticalPadding)
                .foregroundStyle(isEnabled ? ChalkakColor.textPrimary : ChalkakColor.textMuted)
                .background(ChalkakColor.surfaceElevated.opacity(0.001))
                .overlay {
                    RoundedRectangle(cornerRadius: ChalkakRadius.button)
                        .stroke(ChalkakColor.border, lineWidth: 1)
                }
                .contentShape(RoundedRectangle(cornerRadius: ChalkakRadius.button))
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
    }
}

/// 사진처럼 누르는 동안에도 밝기와 크기를 그대로 두는 버튼 스타일(원본 ChalkakUnhighlightedButtonStyle).
struct ChalkakUnhighlightedButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
    }
}

/// 눌림 때 불투명도만 낮추는 버튼 스타일(원본 소셜 버튼 0.7, 카드 헤더 0.8).
struct ChalkakPressOpacityButtonStyle: ButtonStyle {
    var pressedOpacity: Double = 0.8

    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? pressedOpacity : 1)
    }
}
