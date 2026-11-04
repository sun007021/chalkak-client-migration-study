import SwiftUI

/// AI 피드백 진행 중 표시(원본 ChalkakAudioWaveIcon): 막대 5개, 약 0.9초 주기, 30fps.
struct ChalkakAudioWaveIcon: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let isAnimating: Bool

    private let barHeights: [CGFloat] = [9, 15, 11, 18, 8]

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !isAnimating || reduceMotion)) { context in
            HStack(alignment: .center, spacing: 2) {
                ForEach(barHeights.indices, id: \.self) { index in
                    Capsule()
                        .fill(.foreground)
                        .frame(width: 2, height: barHeights[index])
                        .scaleEffect(y: barScale(at: context.date, index: index))
                }
            }
            .frame(height: 18)
        }
    }

    private func barScale(at date: Date, index: Int) -> CGFloat {
        guard isAnimating, !reduceMotion else { return 1 }
        let phase = date.timeIntervalSinceReferenceDate * 7 + Double(index) * 1.2
        return CGFloat(0.7 + 0.3 * sin(phase))
    }
}
