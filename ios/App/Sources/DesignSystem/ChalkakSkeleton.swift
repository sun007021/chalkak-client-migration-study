import SwiftUI

/// 콘텐츠 로딩 중 자리를 채우는 스켈레톤(원본 ChalkakSkeleton, screens-a.md 1.8).
/// skeletonBase 위로 하이라이트 밴드(폭 0.6배)가 1.2초 주기로 좌에서 우로 지나간다. 모서리 clip은 호출부가 맡는다.
struct ChalkakSkeleton: View {
    var body: some View {
        ChalkakColor.skeletonBase
            .shimmer(highlight: ChalkakColor.skeletonHighlight)
            .accessibilityHidden(true)
    }
}

extension View {
    func shimmer(highlight: Color) -> some View {
        modifier(ShimmerModifier(highlight: highlight))
    }

    /// 로딩 상태를 "0.5초 지연 표시 + 0.25초 최소 유지"로 가공해 스켈레톤을 덧입힌다(짧은 로딩에서 깜빡임 방지).
    func loadingSkeleton(isLoading: Bool) -> some View {
        modifier(LoadingSkeletonModifier(isLoading: isLoading))
    }
}

private struct LoadingSkeletonModifier: ViewModifier {
    let isLoading: Bool
    @State private var isVisible = false
    @State private var shownAt: Date?

    func body(content: Content) -> some View {
        content
            .overlay {
                if isVisible {
                    ChalkakSkeleton()
                        .transition(.opacity)
                }
            }
            .task(id: isLoading) { await updateVisibility() }
    }

    private func updateVisibility() async {
        if isLoading {
            guard await wait(for: SkeletonMetrics.showDelay) else { return }
            withAnimation(.easeOut(duration: SkeletonMetrics.fadeDuration)) { isVisible = true }
            shownAt = .now
        } else {
            if isVisible, let shownAt {
                let remaining = SkeletonMetrics.minVisibleDuration - Date.now.timeIntervalSince(shownAt)
                if remaining > 0, await wait(for: remaining) == false { return }
            }
            withAnimation(.easeOut(duration: SkeletonMetrics.fadeDuration)) { isVisible = false }
            shownAt = nil
        }
    }

    private func wait(for seconds: TimeInterval) async -> Bool {
        do {
            try await Task.sleep(for: .seconds(seconds))
            return true
        } catch {
            return false
        }
    }
}

private struct ShimmerModifier: ViewModifier {
    let highlight: Color
    @State private var isAnimating = false

    func body(content: Content) -> some View {
        content
            .overlay {
                GeometryReader { proxy in
                    let width = proxy.size.width
                    let bandWidth = width * SkeletonMetrics.bandWidthRatio
                    LinearGradient(
                        colors: [.clear, highlight, .clear],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: bandWidth, height: proxy.size.height)
                    .offset(x: isAnimating ? width : -bandWidth)
                    .animation(
                        .linear(duration: SkeletonMetrics.shimmerDuration).repeatForever(autoreverses: false),
                        value: isAnimating
                    )
                }
            }
            .clipped()
            .onAppear { isAnimating = true }
    }
}

private enum SkeletonMetrics {
    static let bandWidthRatio: CGFloat = 0.6
    static let shimmerDuration: TimeInterval = 1.2
    static let showDelay: TimeInterval = 0.5
    static let minVisibleDuration: TimeInterval = 0.25
    static let fadeDuration: TimeInterval = 0.2
}
