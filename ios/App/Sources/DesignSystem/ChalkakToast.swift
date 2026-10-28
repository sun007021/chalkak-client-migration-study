import SwiftUI
import ChalkakFeatures

/// `ToastCenter.current`를 그리는 오버레이. 표시 시간과 중복 처리는 ToastCenter가 맡는다.
struct ToastOverlay: View {
    let center: ToastCenter

    var body: some View {
        ZStack {
            if let notice = center.current {
                VStack(spacing: 0) {
                    Text(notice.message)
                        .font(ChalkakFont.subheadline)
                        .foregroundStyle(ChalkakColor.onActionPrimary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, ChalkakSpacing.lg)
                        .padding(.vertical, ChalkakSpacing.md)
                        .background(ChalkakColor.actionPrimary, in: Capsule())
                        .accessibilityIdentifier("toast.message")
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("toast.container")
                .id(notice.id)
                .transition(.opacity)
            }
        }
        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
        .padding(.bottom, 100)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .animation(.easeInOut(duration: 0.2), value: center.current)
        .allowsHitTesting(false)
    }
}
