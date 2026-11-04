import SwiftUI
import ChalkakCore
import ChalkakFeatures

// 사진 편집 조정 탭의 항목 링과 눈금자(screens-b.md 6.2). 원본 PhotoEditAdjustControls를 현재 상태 모델에 맞춰 옮겼다.
// 값은 ViewModel이 쥐고, 여기서는 그리기와 제스처만 한다.

/// 편집기 안에서만 쓰는 색. tokens.json에 없는 원본 값(editorControl, editorAccent).
extension ChalkakColor {
    static let editorControl = Color(hex: 0x1C1C1E)
    static let editorAccent = Color(hex: 0xFFD60A)
}

/// 조정 탭의 항목 목록과 눈금자. 항목을 고르고 눈금자를 밀어 값을 바꾼다.
///
/// 각 항목 테두리는 값만큼 채워진다. 양수는 시계 방향, 음수는 반시계 방향으로 채운다.
struct PhotoEditAdjustControls: View {
    let selectedItem: AdjustmentItem
    let value: (AdjustmentItem) -> Double
    let automaticValue: (AdjustmentItem) -> Double?
    let onSelect: (AdjustmentItem) -> Void
    let onValueChange: (Double) -> Void
    let rulerIdentifier: (AdjustmentItem) -> String
    let itemIdentifier: (AdjustmentItem) -> String

    var body: some View {
        VStack(spacing: ChalkakSpacing.md) {
            Text(EditCopy.label(for: selectedItem))
                .font(ChalkakFont.caption)
                .foregroundStyle(ChalkakColor.editorContentMuted)
                .accessibilityHidden(true)

            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    PhotoEditControlGroup {
                        HStack(spacing: ChalkakSpacing.md) {
                            ForEach(AdjustmentItem.ordered, id: \.self) { item in
                                itemButton(item)
                                    .id(item)
                            }
                        }
                    }
                    .padding(.horizontal, ChalkakSpacing.lg)
                }
                .onChange(of: selectedItem) { _, item in
                    withAnimation { proxy.scrollTo(item, anchor: .center) }
                }
            }

            PhotoEditValueRuler(
                value: value(selectedItem),
                range: Self.range(of: selectedItem),
                automaticValue: automaticValue(selectedItem),
                onChange: onValueChange
            )
            // 항목을 바꾸면 드래그 상태를 새로 시작한다.
            .id(selectedItem)
            .accessibilityLabel("\(EditCopy.label(for: selectedItem)) 값")
            .accessibilityValue("\(Self.percent(value(selectedItem)))")
            .accessibilityIdentifier(rulerIdentifier(selectedItem))
        }
    }

    private func itemButton(_ item: AdjustmentItem) -> some View {
        let itemValue = value(item)
        let isSelected = item == selectedItem

        return Button {
            onSelect(item)
        } label: {
            ZStack {
                // 자동은 숫자 대신 아이콘을 두고, 켜지면 강조색으로 바꿔 적용 여부를 보여 준다.
                if isSelected, item != .auto {
                    Text("\(Self.percent(itemValue))")
                        .font(ChalkakFont.callout)
                        .monospacedDigit()
                } else {
                    Image(systemName: Self.systemImage(of: item))
                        .font(.system(size: RulerMetrics.iconSize))
                        .symbolRenderingMode(.monochrome)
                }
            }
            .foregroundStyle(item == .auto && itemValue > 0 ? ChalkakColor.editorAccent : ChalkakColor.editorContent)
            .frame(width: RulerMetrics.itemSize, height: RulerMetrics.itemSize)
            .photoEditControlBackground(in: Circle())
            .overlay {
                Circle()
                    .inset(by: RulerMetrics.ringWidth / 2)
                    .stroke(
                        ChalkakColor.editorContentMuted.opacity(isSelected ? 1 : RulerMetrics.ringTrackOpacity),
                        lineWidth: RulerMetrics.ringWidth
                    )
                Circle()
                    .inset(by: RulerMetrics.ringWidth / 2)
                    .trim(from: 0, to: CGFloat(abs(itemValue)))
                    .stroke(
                        isSelected ? ChalkakColor.editorContent : ChalkakColor.editorAccent,
                        style: StrokeStyle(lineWidth: RulerMetrics.ringWidth, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .scaleEffect(x: itemValue < 0 ? -1 : 1)
            }
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(EditCopy.label(for: item))
        .accessibilityValue("\(Self.percent(itemValue))")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier(itemIdentifier(item))
    }

    /// 자동은 강도(0...1), 나머지는 -1...1.
    private static func range(of item: AdjustmentItem) -> ClosedRange<Double> {
        item == .auto ? 0...1 : AdjustmentLayers.range
    }

    private static func systemImage(of item: AdjustmentItem) -> String {
        switch item {
        case .auto: "wand.and.stars"
        case .value(.exposure): "plusminus.circle"
        case .value(.contrast): "circle.lefthalf.filled"
        case .value(.highlights): "sun.max"
        case .value(.shadows): "circle.bottomhalf.filled"
        case .value(.blackPoint): "circle.fill"
        case .value(.saturation): "drop.halffull"
        case .value(.warmth): "thermometer.medium"
        }
    }

    private static func percent(_ value: Double) -> Int {
        Int((value * 100).rounded())
    }
}

/// 사진 앱의 조정 눈금자처럼 가운데 표시선 아래로 눈금을 밀어 값을 고른다. 왼쪽으로 밀면 값이 커진다.
///
/// 표시선을 지난 눈금은 잠깐 솟았다가 가라앉고, 손을 튕기듯 떼면 감속하며 더 굴러간다.
/// 자동 보정이 정한 값은 점으로 표시하고, 그 값에서는 조금 더 밀어야 벗어나도록 멈춘다.
private struct PhotoEditValueRuler: View {
    @State private var motion = PhotoEditRulerMotion()
    /// 표시선을 지난 눈금과 지난 시각.
    @State private var passedTicks: [Int: Date] = [:]
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let value: Double
    let range: ClosedRange<Double>
    let automaticValue: Double?
    let onChange: (Double) -> Void

    /// 멈춤과 강한 햅틱을 주는 값. 자동 보정 값이 있으면 그 값, 없으면 0이다.
    private var anchor: Double {
        min(max(automaticValue ?? 0, range.lowerBound), range.upperBound)
    }

    var body: some View {
        let snapshot = RulerSnapshot(
            value: value, range: range, automaticValue: automaticValue,
            passedTicks: reduceMotion ? [:] : passedTicks
        )
        TimelineView(.animation(paused: passedTicks.isEmpty || reduceMotion)) { timeline in
            let date = timeline.date
            Canvas { context, size in
                snapshot.draw(in: &context, size: size, at: date)
            }
        }
        .frame(height: RulerMetrics.height)
        .contentShape(Rectangle())
        .gesture(dragGesture)
        .onChange(of: value) { oldValue, newValue in
            recordPassedTicks(from: oldValue, to: newValue)
        }
        .task(id: passedTicks) {
            // 잔상이 다 가라앉으면 비워서 매 프레임 다시 그리기를 멈춘다.
            try? await Task.sleep(for: .seconds(RulerMetrics.liftDuration))
            let now = Date()
            passedTicks = passedTicks.filter { now.timeIntervalSince($0.value) < RulerMetrics.liftDuration }
        }
        .onDisappear {
            motion.stop()
        }
        .sensoryFeedback(trigger: PhotoEditRulerStep(value: value, anchor: anchor)) { [motion] _, step in
            guard motion.isInteracting else { return nil }
            return step.isAnchor ? .impact(weight: .medium) : .selection
        }
        .accessibilityElement()
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment:
                onChange(snapped(value + RulerMetrics.accessibilityStep))
            case .decrement:
                onChange(snapped(value - RulerMetrics.accessibilityStep))
            @unknown default:
                break
            }
        }
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { gesture in
                let startPosition = motion.dragStartPosition ?? dragPosition(of: value)
                if motion.dragStartPosition == nil {
                    motion.stop()
                    motion.dragStartPosition = startPosition
                    motion.isInteracting = true
                }
                emit(at: startPosition - Double(gesture.translation.width) / RulerMetrics.unitWidth)
            }
            .onEnded { gesture in
                let startPosition = motion.dragStartPosition ?? dragPosition(of: value)
                motion.dragStartPosition = nil
                decelerate(
                    from: startPosition - Double(gesture.translation.width) / RulerMetrics.unitWidth,
                    velocity: -Double(gesture.velocity.width) / RulerMetrics.unitWidth
                )
            }
    }

    /// 손으로 움직이는 동안 표시선을 지난 눈금을 기록한다.
    private func recordPassedTicks(from oldValue: Double, to newValue: Double) {
        guard motion.isInteracting else { return }
        let oldPosition = (oldValue - range.lowerBound) * RulerMetrics.ticksPerUnit
        let newPosition = (newValue - range.lowerBound) * RulerMetrics.ticksPerUnit
        let first = Int(min(oldPosition, newPosition).rounded(.up))
        let last = Int(max(oldPosition, newPosition).rounded(.down))
        guard first <= last else { return }
        let now = Date()
        for index in first...last {
            passedTicks[index] = now
        }
    }

    // MARK: 값 계산

    /// 드래그 거리를 값으로 바꿀 때 쓰는 위치. 기준값 앞뒤에 멈춤 구간만큼 간격을 벌려 둔다.
    private func dragPosition(of value: Double) -> Double {
        if abs(value - anchor) < RulerMetrics.anchorTolerance { return anchor }
        return value > anchor ? value + RulerMetrics.detentHalfWidth : value - RulerMetrics.detentHalfWidth
    }

    private func adjustedValue(at position: Double) -> Double {
        if position > anchor + RulerMetrics.detentHalfWidth { return position - RulerMetrics.detentHalfWidth }
        if position < anchor - RulerMetrics.detentHalfWidth { return position + RulerMetrics.detentHalfWidth }
        return anchor
    }

    /// 위치에 맞는 값을 알린다. 범위 끝에 닿으면 false를 돌려준다.
    @discardableResult
    private func emit(at position: Double) -> Bool {
        let lower = dragPosition(of: range.lowerBound)
        let upper = dragPosition(of: range.upperBound)
        let clamped = min(max(position, lower), upper)
        let newValue = adjustedValue(at: clamped)
        // 기준값은 반올림하지 않아야 자동 보정 위에 더한 값이 정확히 0이 된다.
        onChange(newValue == anchor ? anchor : snapped(newValue))
        return clamped == position
    }

    /// 스크롤 뷰처럼 손을 뗀 속도에서 감속하며 굴러간다. 동작 줄이기에서는 굴리지 않는다.
    private func decelerate(from position: Double, velocity: Double) {
        guard !reduceMotion, abs(velocity) > RulerMetrics.minimumInertiaVelocity else {
            motion.isInteracting = false
            return
        }
        motion.inertia = Task { @MainActor in
            var position = position
            var velocity = velocity
            var lastTime = ContinuousClock.now
            while !Task.isCancelled, abs(velocity) > RulerMetrics.minimumInertiaVelocity {
                try? await Task.sleep(for: RulerMetrics.inertiaFrameInterval)
                guard !Task.isCancelled else { return }
                let now = ContinuousClock.now
                let elapsed = (now - lastTime) / .seconds(1)
                lastTime = now
                position += velocity * elapsed
                velocity *= pow(RulerMetrics.decelerationRate, elapsed * 1000)
                guard emit(at: position) else { break }
            }
            motion.isInteracting = false
        }
    }

    /// 화면에 보이는 정수 값에 맞춰 자른다.
    private func snapped(_ value: Double) -> Double {
        (min(max(value, range.lowerBound), range.upperBound) * 100).rounded() / 100
    }
}

/// 눈금자를 그리는 데 필요한 값만 모은 복사본. 그리기 클로저가 뷰 자체를 붙들지 않게 한다.
private struct RulerSnapshot: Sendable {
    let value: Double
    let range: ClosedRange<Double>
    let automaticValue: Double?
    let passedTicks: [Int: Date]

    func draw(in context: inout GraphicsContext, size: CGSize, at date: Date) {
        let centerX = size.width / 2
        let tickCount = Int(((range.upperBound - range.lowerBound) * RulerMetrics.ticksPerUnit).rounded()) + 1
        let startX = centerX - CGFloat(value - range.lowerBound) * RulerMetrics.unitWidth

        for index in 0..<tickCount {
            let x = startX + CGFloat(index) * RulerMetrics.tickSpacing
            guard x >= 0, x <= size.width else { continue }
            let lift = liftAmount(of: index, at: date) * proximity(of: x, to: centerX)
            let height = RulerMetrics.tickHeight + (RulerMetrics.liftedTickHeight - RulerMetrics.tickHeight) * lift
            // 10칸마다 눈금을 밝게 그린다.
            let baseOpacity = index.isMultiple(of: RulerMetrics.majorTickInterval) ? RulerMetrics.majorTickOpacity : RulerMetrics.tickOpacity
            let tick = CGRect(
                x: x - RulerMetrics.tickWidth / 2,
                y: size.height - height,
                width: RulerMetrics.tickWidth,
                height: height
            )
            context.fill(
                Path(roundedRect: tick, cornerRadius: RulerMetrics.tickWidth / 2),
                with: .color(ChalkakColor.editorContent.opacity(baseOpacity + (1 - baseOpacity) * lift))
            )
        }

        if let automaticValue {
            let x = centerX + CGFloat(automaticValue - value) * RulerMetrics.unitWidth
            let mark = CGRect(
                x: x - RulerMetrics.markSize / 2,
                y: size.height - RulerMetrics.markCenterHeight - RulerMetrics.markSize / 2,
                width: RulerMetrics.markSize,
                height: RulerMetrics.markSize
            )
            context.fill(Path(ellipseIn: mark), with: .color(ChalkakColor.editorContentMuted))
        }

        let indicator = CGRect(
            x: centerX - RulerMetrics.indicatorWidth / 2,
            y: size.height - RulerMetrics.liftedTickHeight,
            width: RulerMetrics.indicatorWidth,
            height: RulerMetrics.liftedTickHeight
        )
        context.fill(
            Path(roundedRect: indicator, cornerRadius: RulerMetrics.indicatorWidth / 2),
            with: .color(ChalkakColor.editorAccent)
        )
    }

    /// 눈금이 표시선을 지난 직후 1이고 시간이 지나면 0으로 줄어든다.
    private func liftAmount(of index: Int, at date: Date) -> CGFloat {
        guard let passedAt = passedTicks[index] else { return 0 }
        let progress = date.timeIntervalSince(passedAt) / RulerMetrics.liftDuration
        return CGFloat(max(0, 1 - progress))
    }

    /// 표시선 바로 옆이 1이고 멀어질수록 줄어 잔상이 표시선 가까이에만 남는다.
    private func proximity(of x: CGFloat, to centerX: CGFloat) -> CGFloat {
        max(0, 1 - abs(x - centerX) / (RulerMetrics.tickSpacing * RulerMetrics.liftedTickSpan))
    }
}

/// 드래그와 관성 상태. 바뀌어도 다시 그릴 필요가 없어 관찰하지 않는 참조 타입으로 둔다. 항상 메인 스레드에서만 만진다.
private final class PhotoEditRulerMotion: @unchecked Sendable {
    /// 드래그를 시작할 때의 위치. 이동 거리만큼 이 위치에서 더하고 뺀다.
    var dragStartPosition: Double?
    /// 손으로 움직이는 중이거나 관성으로 굴러가는 중이다. 이때만 잔상과 햅틱을 낸다.
    var isInteracting = false
    var inertia: Task<Void, Never>?

    func stop() {
        inertia?.cancel()
        inertia = nil
        isInteracting = false
    }
}

/// 햅틱을 낼 눈금 단위. 눈금을 하나 넘거나 기준값에 닿고 벗어날 때 바뀐다.
private struct PhotoEditRulerStep: Equatable {
    let tick: Int
    let isAnchor: Bool

    init(value: Double, anchor: Double) {
        tick = Int((value * RulerMetrics.ticksPerUnit).rounded(.down))
        isAnchor = abs(value - anchor) < RulerMetrics.anchorTolerance
    }
}

private enum RulerMetrics {
    static let itemSize: CGFloat = 56
    static let iconSize: CGFloat = 20
    static let ringWidth: CGFloat = 3
    static let ringTrackOpacity: Double = 0.4

    static let height: CGFloat = 44
    /// 값 1.0을 50칸(2 단위 눈금)으로 나눈다.
    static let ticksPerUnit: Double = 50
    static let tickSpacing: CGFloat = 8
    /// 값 1.0이 차지하는 너비.
    static let unitWidth = tickSpacing * CGFloat(ticksPerUnit)
    static let majorTickInterval = 10
    static let tickWidth: CGFloat = 2
    static let tickHeight: CGFloat = 20
    /// 표시선을 막 지난 눈금과 표시선의 높이.
    static let liftedTickHeight: CGFloat = 40
    static let liftDuration: TimeInterval = 0.3
    /// 잔상이 남는 눈금 수.
    static let liftedTickSpan: CGFloat = 8
    static let tickOpacity: Double = 0.4
    static let majorTickOpacity: Double = 0.75
    static let indicatorWidth: CGFloat = 2
    static let markSize: CGFloat = 6
    static let markCenterHeight: CGFloat = 32

    /// 기준값에서 멈추는 구간의 절반. 손가락으로 8pt를 더 밀어야 벗어난다.
    static let detentHalfWidth = 8 / Double(unitWidth)
    static let anchorTolerance = 1e-9
    /// 1ms마다 속도에 곱하는 비율. 손을 뗀 속도로 약 0.2초 동안 간 만큼 더 굴러간다.
    static let decelerationRate = 0.995
    /// 값 기준 초당 속도. 이보다 느리면 관성을 멈춘다.
    static let minimumInertiaVelocity = 0.02
    static let inertiaFrameInterval: Duration = .milliseconds(8)
    static let accessibilityStep: Double = 0.1
}
