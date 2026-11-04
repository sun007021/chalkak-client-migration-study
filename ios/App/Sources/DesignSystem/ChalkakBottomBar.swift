import SwiftUI
import ChalkakFeatures

/// 하단 탭 바(홈·전시·업로드 버튼·기록·설정). 선택 상태와 동작은 MainShellViewModel이 정한다.
/// iOS 26 이상이면 Liquid Glass 캡슐(원본 LiquidGlassBottomBar), 그 미만은 평면 바(원본 FlatBottomBar).
struct ChalkakBottomBar: View {
    let selectedTab: MainTab
    @Binding var isCompact: Bool
    let onSelect: (MainTab) -> Void
    let onUpload: () -> Void

    init(
        selectedTab: MainTab,
        isCompact: Binding<Bool> = .constant(false),
        onSelect: @escaping (MainTab) -> Void,
        onUpload: @escaping () -> Void
    ) {
        self.selectedTab = selectedTab
        _isCompact = isCompact
        self.onSelect = onSelect
        self.onUpload = onUpload
    }

    var body: some View {
        Group {
            if #available(iOS 26.0, *), ChalkakPlatformAppearance.usesLiquidGlass {
                LiquidGlassBottomBar(
                    selectedTab: selectedTab,
                    isCompact: $isCompact,
                    onSelect: onSelect,
                    onUpload: onUpload
                )
            } else {
                FlatBottomBar(selectedTab: selectedTab, onSelect: onSelect, onUpload: onUpload)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("bottom-bar.root")
    }

    static func iconName(for tab: MainTab, isSelected: Bool) -> String {
        let base: String
        switch tab {
        case .home: base = "ic_bottom_home"
        case .display: base = "ic_bottom_display"
        case .record: base = "ic_bottom_record"
        case .settings: base = "ic_bottom_setting"
        }
        return isSelected ? "\(base)_selected" : base
    }
}

@available(iOS 26.0, *)
private struct LiquidGlassBottomBar: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @GestureState private var dragValue: DragGesture.Value?
    @State private var barWidth: CGFloat = 0
    @State private var lensSlot: CGFloat
    @State private var isSelectionMoving = false
    @State private var selectionVelocity: CGFloat = 0
    @State private var selectionMotionTask: Task<Void, Never>?
    let selectedTab: MainTab
    @Binding var isCompact: Bool
    let onSelect: (MainTab) -> Void
    let onUpload: () -> Void

    init(
        selectedTab: MainTab,
        isCompact: Binding<Bool> = .constant(false),
        onSelect: @escaping (MainTab) -> Void,
        onUpload: @escaping () -> Void
    ) {
        self.selectedTab = selectedTab
        _lensSlot = State(initialValue: Self.lensSlot(for: selectedTab))
        _isCompact = isCompact
        self.onSelect = onSelect
        self.onUpload = onUpload
    }

    var body: some View {
        HStack(spacing: 0) {
            itemButton(.home)
            itemButton(.display)
            addButton
            itemButton(.record)
            itemButton(.settings)
        }
        .padding(barPadding)
        // 선택 아이콘은 렌즈에 걸친 부분에만 보인다. 렌즈 밖은 현재 탭이라도 기본 아이콘으로 보인다.
        .mask { lensMask(inverted: true) }
        .overlay {
            hoveredIcons
                .mask { lensMask(inverted: false) }
        }
        .background {
            GeometryReader { proxy in
                lensPlacement(in: proxy.size) { width in
                    Capsule()
                        .fill(.clear)
                        .frame(width: width, height: lensHeight)
                        .glassEffect(
                            .clear.interactive(),
                            in: Capsule()
                        )
                        .overlay {
                            Capsule()
                                .fill(LinearGradient(
                                    colors: [.white.opacity(0.28), .clear, .white.opacity(0.08)],
                                    startPoint: .topLeading, endPoint: .bottomTrailing
                                ))
                        }
                        .overlay {
                            Capsule().strokeBorder(LinearGradient(
                                colors: [.white.opacity(0.95), .white.opacity(0.2), .white.opacity(0.65)],
                                startPoint: dragVelocity < 0 ? .topTrailing : .topLeading,
                                endPoint: dragVelocity < 0 ? .bottomLeading : .bottomTrailing
                            ), lineWidth: GlassMetrics.dragLensBorderWidth)
                            .opacity(isDragging ? 1 : 0)
                        }
                        .shadow(color: .white.opacity(isDragging ? 0.6 : 0), radius: 2, y: -1)
                        .shadow(color: ChalkakColor.iconPrimary.opacity(0.18), radius: 5, y: 2)
                }
            }
            .allowsHitTesting(false)
        }
        .background {
            // 밝은 바탕을 유지하면서 사진이 은은하게 비치도록 한다.
            ZStack {
                Capsule().fill(ChalkakColor.background.opacity(GlassMetrics.glassBackgroundOpacity))
                Capsule().fill(.clear)
                    .glassEffect(.regular.tint(ChalkakColor.background.opacity(GlassMetrics.glassTintOpacity)).interactive(), in: Capsule())
            }
        }
        .contentShape(Capsule())
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { barWidth = $0 }
        .coordinateSpace(name: GlassMetrics.dragCoordinateSpace)
        .scaleEffect(isDragging ? GlassMetrics.dragScale : 1, anchor: .bottom)
        .animation(reduceMotion ? nil : .smooth(duration: GlassMetrics.dragAnimationDuration), value: isDragging)
        .animation(reduceMotion ? nil : .smooth(duration: GlassMetrics.expansionDuration), value: isCompact)
        .highPriorityGesture(tabScrubGesture)
        .onChange(of: isDragging) { _, dragging in
            if dragging {
                selectionMotionTask?.cancel()
                isSelectionMoving = false
            }
            guard dragging, isCompact else { return }
            // 외부 폭과 내부 패딩·아이콘 크기를 함께 펼쳐 모든 드래그에 같은 크기를 사용한다.
            withAnimation(reduceMotion ? nil : .smooth(duration: GlassMetrics.expansionDuration)) {
                isCompact = false
            }
        }
        .onChange(of: selectedTab) { previous, current in
            selectionMotionTask?.cancel()
            lensSlot = Self.lensSlot(for: current)
            guard !reduceMotion, !isDragging else {
                isSelectionMoving = false
                return
            }
            selectionVelocity = (lensX(for: current, in: barWidth) - lensX(for: previous, in: barWidth))
                / GlassMetrics.selectionDuration
            isSelectionMoving = true
            selectionMotionTask = Task { @MainActor in
                try? await Task.sleep(for: .seconds(GlassMetrics.selectionDuration))
                guard !Task.isCancelled else { return }
                isSelectionMoving = false
            }
        }
        .onDisappear {
            selectionMotionTask?.cancel()
            isSelectionMoving = false
        }
        // 축소 중에도 화면의 스크롤 영역 높이를 유지해 오프셋 변화로 다시 확대되지 않게 한다.
        .frame(height: GlassMetrics.expandedHeight, alignment: .bottom)
    }

    private func itemButton(_ item: MainTab) -> some View {
        let isSelected = item == selectedTab
        return Button {
            performAction { onSelect(item) }
        } label: {
            itemIcon(item, isSelected: false)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(NavCopy.label(for: item))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("bottom-bar.tab-\(item.rawValue)")
    }

    private var addButton: some View {
        Button(action: { performAction(onUpload) }) {
            addIcon
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(NavCopy.uploadAccessibilityLabel)
        .accessibilityIdentifier("bottom-bar.upload-button")
    }

    private func itemIcon(_ item: MainTab, isSelected: Bool) -> some View {
        Image(ChalkakBottomBar.iconName(for: item, isSelected: isSelected))
            .resizable()
            .renderingMode(.template)
            .scaledToFit()
            .frame(width: GlassMetrics.iconSize, height: GlassMetrics.iconSize)
            .scaleEffect(isCompact ? GlassMetrics.compactIconSize / GlassMetrics.iconSize : 1)
            .scaleEffect(draggedItem == item ? GlassMetrics.dragIconScale : 1)
            .animation(reduceMotion ? nil : .smooth(duration: GlassMetrics.dragAnimationDuration), value: draggedItem)
            .foregroundStyle(ChalkakColor.iconPrimary)
            .frame(maxWidth: .infinity, minHeight: touchSize)
    }

    private var addIcon: some View {
        Image(systemName: "plus")
            .font(.system(size: GlassMetrics.addIconSize, weight: .regular))
            .frame(width: GlassMetrics.addIconSize, height: GlassMetrics.addIconSize)
            .scaleEffect(isCompact ? GlassMetrics.compactAddIconSize / GlassMetrics.addIconSize : 1)
            .scaleEffect(draggedSlot == 2 ? GlassMetrics.dragIconScale : 1)
            .animation(reduceMotion ? nil : .smooth(duration: GlassMetrics.dragAnimationDuration), value: draggedSlot)
            .foregroundStyle(ChalkakColor.iconPrimary)
            .frame(maxWidth: .infinity, minHeight: touchSize)
    }

    /// 탭 버튼과 같은 배치로 선택 아이콘만 그린 층. 렌즈 모양으로 잘라 위에 겹친다.
    private var hoveredIcons: some View {
        HStack(spacing: 0) {
            itemIcon(.home, isSelected: true)
            itemIcon(.display, isSelected: true)
            addIcon
            itemIcon(.record, isSelected: true)
            itemIcon(.settings, isSelected: true)
        }
        .padding(barPadding)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// 렌즈 모양. `inverted`이면 렌즈 바깥만 남긴다.
    @ViewBuilder
    private func lensMask(inverted: Bool) -> some View {
        let lens = GeometryReader { proxy in
            lensPlacement(in: proxy.size) { width in
                Capsule().frame(width: width, height: lensHeight)
            }
        }

        if inverted {
            Rectangle()
                .overlay { lens.blendMode(.destinationOut) }
                .compositingGroup()
        } else {
            lens
        }
    }

    /// 유리 렌즈와 아이콘 마스크가 같은 위치·크기·애니메이션으로 움직이도록 배치를 공유한다.
    private func lensPlacement<Lens: View>(in size: CGSize, @ViewBuilder lens: (CGFloat) -> Lens) -> some View {
        let width = slotWidth(in: size.width) * (isDragging ? GlassMetrics.dragLensWidthScale : 1)
        return lens(width)
            .scaleEffect(
                x: 1 + dragStretch * GlassMetrics.dragStretchWidth,
                y: 1 - dragStretch * GlassMetrics.dragStretchHeight
            )
            .animation(reduceMotion ? nil : .smooth(duration: GlassMetrics.dragAnimationDuration), value: isDragging)
            .position(
                x: min(max(dragLocation?.x ?? selectedLensX(in: size.width), barPadding + width / 2), size.width - barPadding - width / 2),
                y: size.height / 2
            )
            // 손가락 위치가 연속 갱신돼도 이동 중인 렌즈의 속도를 이어간다.
            .animation(
                reduceMotion ? nil : .interactiveSpring(
                    response: GlassMetrics.dragLensResponse,
                    dampingFraction: GlassMetrics.dragLensDamping,
                    blendDuration: GlassMetrics.dragLensBlendDuration
                ),
                value: dragLocation?.x
            )
            .animation(reduceMotion ? nil : .smooth(duration: GlassMetrics.selectionDuration), value: lensSlot)
    }

    private var lensHeight: CGFloat { isDragging ? GlassMetrics.dragLensHeight : touchSize }

    private func performAction(_ action: @escaping () -> Void) {
        let duration = isCompact ? GlassMetrics.expansionDuration : GlassMetrics.selectionDuration
        withAnimation(reduceMotion ? nil : .smooth(duration: duration)) {
            isCompact = false
            action()
        }
    }

    private var dragLocation: CGPoint? { dragValue?.location }

    private var dragVelocity: CGFloat {
        dragValue?.velocity.width ?? (isSelectionMoving ? selectionVelocity : 0)
    }

    private var dragStretch: CGFloat {
        reduceMotion || !isDragging ? 0 : min(abs(dragVelocity) / GlassMetrics.dragStretchVelocity, 1)
    }

    private var isDragging: Bool { dragValue != nil }

    private var barPadding: CGFloat { isCompact ? ChalkakSpacing.xs : ChalkakSpacing.sm }

    private var draggedItem: MainTab? {
        dragLocation.flatMap { item(at: $0.x) }
    }

    private func selectedLensX(in width: CGFloat) -> CGFloat {
        barPadding + slotWidth(in: width) * (lensSlot + 0.5)
    }

    private func lensX(for item: MainTab, in width: CGFloat) -> CGFloat {
        barPadding + slotWidth(in: width) * (Self.lensSlot(for: item) + 0.5)
    }

    private static func lensSlot(for item: MainTab) -> CGFloat {
        switch item {
        case .home: 0
        case .display: 1
        case .record: 3
        case .settings: 4
        }
    }

    private func slotWidth(in width: CGFloat) -> CGFloat {
        max(0, width - barPadding * 2) / GlassMetrics.slotCount
    }

    private var draggedSlot: Int? {
        dragLocation.flatMap { slot(at: $0.x) }
    }

    private func slot(at x: CGFloat) -> Int? {
        let width = slotWidth(in: barWidth)
        guard width > 0 else { return nil }
        return min(max(Int(floor((x - barPadding) / width)), 0), Int(GlassMetrics.slotCount) - 1)
    }

    private func item(at x: CGFloat) -> MainTab? {
        switch slot(at: x) {
        case 0: return .home
        case 1: return .display
        case 3: return .record
        case 4: return .settings
        default: return nil
        }
    }

    private var tabScrubGesture: some Gesture {
        DragGesture(minimumDistance: GlassMetrics.dragMinimumDistance, coordinateSpace: .named(GlassMetrics.dragCoordinateSpace))
            .updating($dragValue) { value, state, _ in
                // 클릭은 각 버튼이 처리하고, 실제 좌우 드래그가 시작될 때만 렌즈를 이동한다.
                guard state != nil || abs(value.translation.width) > abs(value.translation.height) else { return }
                state = value
            }
            .onEnded { value in
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
                // 드래그 중에는 강조만 이동하고 손을 뗀 위치의 동작만 실행한다.
                if slot(at: value.location.x) == 2 {
                    performAction(onUpload)
                } else if let item = item(at: value.location.x), item != selectedTab {
                    // 이미 손가락을 따라 도착한 렌즈는 탭 이동 애니메이션을 다시 시작하지 않는다.
                    withAnimation(nil) {
                        lensSlot = Self.lensSlot(for: item)
                    }
                    performAction { onSelect(item) }
                }
            }
    }

    private var touchSize: CGFloat {
        isCompact ? GlassMetrics.compactTouchSize : GlassMetrics.minimumTouchSize
    }
}

private enum GlassMetrics {
    static let glassBackgroundOpacity = 0.3
    static let glassTintOpacity = 0.2
    static let iconSize: CGFloat = 26
    static let compactIconSize: CGFloat = 23
    static let addIconSize: CGFloat = 28
    static let compactAddIconSize: CGFloat = 25
    static let minimumTouchSize: CGFloat = 44
    static let compactTouchSize: CGFloat = 44
    static let expandedHeight: CGFloat = 60
    static let selectionDuration = 0.5
    static let expansionDuration = 0.75
    static let slotCount: CGFloat = 5
    static let dragCoordinateSpace = "chalkakBottomBarDrag"
    static let dragMinimumDistance: CGFloat = 8
    static let dragScale: CGFloat = 1.04
    static let dragIconScale: CGFloat = 1.16
    static let dragLensWidthScale: CGFloat = 1.06
    static let dragLensHeight: CGFloat = 56
    static let dragLensBorderWidth: CGFloat = 1.25
    static let dragStretchVelocity: CGFloat = 1600
    static let dragStretchWidth: CGFloat = 0.08
    static let dragStretchHeight: CGFloat = 0.04
    static let dragAnimationDuration = 0.16
    static let dragLensResponse = 0.42
    static let dragLensDamping = 0.9
    static let dragLensBlendDuration = 0.12
}

/// 평면 바(iOS 26 미만, 또는 `-use-flat-ios-design`). 원본 Flat 바(screens-a.md 3.3): 패딩 top 15 / bottom 12, 배경 surfaceElevated.
private struct FlatBottomBar: View {
    let selectedTab: MainTab
    let onSelect: (MainTab) -> Void
    let onUpload: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            tabButton(.home)
            tabButton(.display)
            uploadButton
            tabButton(.record)
            tabButton(.settings)
        }
        .padding(.top, 15)
        .padding(.bottom, 12)
        .background(ChalkakColor.surfaceElevated.ignoresSafeArea(edges: .bottom))
    }

    private func tabButton(_ tab: MainTab) -> some View {
        let isSelected = tab == selectedTab
        return Button { onSelect(tab) } label: {
            VStack(spacing: 7) {
                Image(ChalkakBottomBar.iconName(for: tab, isSelected: isSelected))
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 23, height: 23)
                Text(NavCopy.label(for: tab))
                    .font(isSelected ? ChalkakFont.footnoteBold : ChalkakFont.footnote)
            }
            .foregroundStyle(isSelected ? ChalkakColor.actionPrimary : ChalkakColor.bottomBar)
            .frame(maxWidth: .infinity, minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
        .accessibilityIdentifier("bottom-bar.tab-\(tab.rawValue)")
    }

    private var uploadButton: some View {
        Button(action: onUpload) {
            Image("ic_bottom_write")
                .renderingMode(.original)
                .resizable()
                .scaledToFit()
                .frame(width: 40, height: 40)
                .frame(maxWidth: .infinity, minHeight: 48)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(NavCopy.uploadAccessibilityLabel)
        .accessibilityIdentifier("bottom-bar.upload-button")
    }
}
