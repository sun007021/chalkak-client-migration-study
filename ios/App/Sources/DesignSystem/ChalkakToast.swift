import SwiftUI
import ChalkakFeatures

/// `ToastCenter.current`를 그리는 오버레이. 표시 시간과 중복 처리는 ToastCenter가 맡는다.
/// 원본 ChalkakToast(screens-a.md 1.9): subheadline, actionPrimary 캡슐, 패딩 lg/md, 가로 screenHorizontal, bottom 32,
/// 전환 move(bottom)+opacity, `.snappy`.
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
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
        .padding(.bottom, 100)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .animation(.snappy, value: center.current)
        .allowsHitTesting(false)
    }
}
