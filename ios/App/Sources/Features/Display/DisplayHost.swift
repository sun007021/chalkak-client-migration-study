import SwiftUI
import ImageIO
import ChalkakCore
import ChalkakData
import ChalkakFeatures

/// 전시 탭 루트. ViewModel은 세션이 쥐고(탭을 오가도 캐시·정렬 유지) 여기서는 보임/가려짐을 알리고 그린다.
///
/// 상세(쌓임 화면)가 열리면 전시가 가려진 것이므로 `onDisappear`를 직접 부르고(탭 루트의 `onDisappear`에 기대지 않는다),
/// 쌓임이 비면 다시 `onAppear`를 불러 재검증한다(REQ-DISP-030). 탭을 바꾸면 이 뷰가 사라지며 같은 경로로 가려짐을 알린다.
struct DisplayHost: View {
    let container: AppContainer
    let session: MainSession
    @State private var viewModel: DisplayViewModel

    init(container: AppContainer, session: MainSession) {
        self.container = container
        self.session = session
        _viewModel = State(initialValue: session.displayViewModel())
    }

    var body: some View {
        DisplayScreen(container: container, session: session, viewModel: viewModel)
    }
}

private struct DisplayScreen: View {
    let container: AppContainer
    let session: MainSession
    let viewModel: DisplayViewModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var isActive = false
    @State private var runTask: Task<Void, Never>?
    @State private var showsDatePicker = false
    /// 불러오며 측정한 사진별 세로/가로 비율. 측정 전에는 기본 비율(4/3)로 배치한다.
    @State private var ratioByID: [UUID: CGFloat] = [:]
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// 스크롤 위치. 탭을 오가 뷰가 다시 만들어져도 ViewModel이 쥔 마지막 위치에서 시작한다(REQ-DISP-030).
    @State private var scrollPosition: ScrollPosition

    init(container: AppContainer, session: MainSession, viewModel: DisplayViewModel) {
        self.container = container
        self.session = session
        self.viewModel = viewModel
        _scrollPosition = State(initialValue: ScrollPosition(point: CGPoint(x: 0, y: viewModel.savedScrollOffset)))
    }

    private var shell: MainShellViewModel { session.shell }

    var body: some View {
        VStack(spacing: 0) {
            dateNavigation
            content
        }
        .background(ChalkakColor.background.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("display.root")
        .onAppear { if shell.path.isEmpty, scenePhase != .background { activate() } }
        .onDisappear { deactivate() }
        .onChange(of: shell.path.isEmpty) { _, isEmpty in
            if isEmpty, scenePhase != .background { activate() } else { deactivate() }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active: if shell.path.isEmpty { activate() }
            case .background: deactivate()
            default: break // inactive(알림 센터 등)는 가려진 것으로 보지 않는다
            }
        }
        // 전시가 보이는 동안 들어온 요청(홈 "더 보기" 등).
        .onChange(of: shell.displayRequest) { _, request in
            guard request != nil, isActive else { return }
            Task { await session.applyPendingDisplayRequest() }
        }
        .onChange(of: viewModel.toast) { _, notice in
            guard let notice else { return }
            container.toast.show(notice.message)
            viewModel.dismissToast()
        }
        .onChange(of: viewModel.needsLogin) { _, needsLogin in
            guard needsLogin else { return }
            viewModel.consumeNeedsLogin()
            Task { await container.launch.handleReauthenticationRequired() }
        }
        .sheet(isPresented: $showsDatePicker) {
            DisplayDatePickerSheet(viewModel: viewModel, isPresented: $showsDatePicker)
        }
    }

    // MARK: 보임 · 가려짐

    private func activate() {
        guard !isActive else { return }
        isActive = true
        runTask = Task {
            await viewModel.onAppear()
            await session.applyPendingDisplayRequest()
        }
    }

    private func deactivate() {
        guard isActive else { return }
        isActive = false
        runTask?.cancel()
        runTask = nil
        viewModel.onDisappear()
    }

    // MARK: 날짜 이동

    /// 날짜 헤더(screens-b.md 2.1): 높이 52, 좌우 25, ‹ 날짜 › 왼쪽 정렬, 셰브런 16 medium 44×44.
    private var dateNavigation: some View {
        HStack(spacing: 0) {
            arrowButton(
                systemName: "chevron.left", label: DisplayCopy.navPrevious,
                identifier: "display.prev-date-button", enabled: viewModel.canGoPrevious
            ) { Task { await viewModel.goToPreviousDay() } }
            Button { showsDatePicker = true } label: {
                Text(KST.monthDayLabel(viewModel.pendingDate ?? viewModel.selectedDate))
                    .font(ChalkakFont.headline)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .lineLimit(1)
                    .frame(minHeight: 44)
                    .padding(.horizontal, ChalkakSpacing.xs)
                    .contentShape(Rectangle())
                    .accessibilityIdentifier("display.date-label")
            }
            .buttonStyle(.plain)
            .disabled(!viewModel.isNavigationEnabled)
            .accessibilityLabel(DisplayCopy.pickerTitle)
            .accessibilityIdentifier("display.date-picker-button")
            arrowButton(
                systemName: "chevron.right", label: DisplayCopy.navNext,
                identifier: "display.next-date-button", enabled: viewModel.canGoNext
            ) { Task { await viewModel.goToNextDay() } }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
        .padding(.leading, -13)
        .frame(height: 52)
    }

    private func arrowButton(systemName: String, label: String, identifier: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(enabled ? ChalkakColor.iconSecondary : ChalkakColor.textInactive)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(label)
        .accessibilityIdentifier(identifier)
    }

    // MARK: 본문

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            ProgressView()
                .tint(ChalkakColor.actionPrimary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityIdentifier("display.loading")
        case .empty:
            ScrollView {
                VStack(spacing: 0) {
                    header
                    VStack(spacing: ChalkakSpacing.sm) {
                        Image(systemName: "photo.on.rectangle.angled")
                            .font(.system(size: 34))
                            .foregroundStyle(ChalkakColor.iconSecondary)
                            .accessibilityHidden(true)
                        Text(FeedCopy.displayEmpty)
                            .font(ChalkakFont.body)
                            .foregroundStyle(ChalkakColor.textSecondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 96)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("display.empty-state")
                }
            }
        case .failed(let notice):
            VStack(spacing: ChalkakSpacing.xl) {
                Text(notice.message)
                    .font(ChalkakFont.body)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .multilineTextAlignment(.center)
                Button { Task { await viewModel.retry() } } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(ChalkakColor.onActionPrimary)
                        .frame(width: 48, height: 48)
                        .background(ChalkakColor.actionPrimary, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(DisplayCopy.retry)
                .accessibilityIdentifier("display.retry-button")
            }
            .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("display.error-state")
        case .loaded:
            loadedContent
        }
    }

    /// 주제 헤더: 위 15 / 아래 24, title2 + 설명(subheadline/textInactive, 간격 12), 바닥 0.5 구분선은 화면 끝까지.
    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(viewModel.topic?.title ?? "")
                .font(ChalkakFont.title2)
                .foregroundStyle(ChalkakColor.textPrimary)
                .accessibilityIdentifier("display.topic-title")
            Text(viewModel.headerDescription)
                .font(ChalkakFont.subheadline)
                .foregroundStyle(ChalkakColor.textInactive)
                .accessibilityIdentifier("display.description")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
        .padding(.top, 15)
        .padding(.bottom, 24)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ChalkakColor.border).frame(height: 0.5)
        }
    }

    private var loadedContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                header
                if !viewModel.featured.isEmpty {
                    featuredPager
                        .padding(.top, 15)
                        .padding(.bottom, ChalkakSpacing.sm)
                }
                if !viewModel.availableSorts.isEmpty {
                    sortTabs
                        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                }
                grid
                    .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                    .padding(.top, viewModel.featured.isEmpty ? 11 : 4)
                if viewModel.isPaging {
                    ProgressView()
                        .tint(ChalkakColor.actionPrimary)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .padding(.top, ChalkakSpacing.md)
                        .accessibilityIdentifier("display.load-more-indicator")
                }
            }
            .padding(.bottom, ChalkakSpacing.xxl)
        }
        .scrollPosition($scrollPosition)
        .onScrollGeometryChange(for: Double.self) { Double($0.contentOffset.y) } action: { _, offset in
            viewModel.saveScrollOffset(offset)
        }
        // 재검증 표시는 내용 위에 띄워 둔다. 레이아웃에 끼워 넣으면 내용이 밀려 보던 위치가 튄다.
        .overlay(alignment: .top) {
            if viewModel.isRefreshing {
                ProgressView()
                    .padding(ChalkakSpacing.sm)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.top, ChalkakSpacing.sm)
                    .allowsHitTesting(false)
                    .accessibilityIdentifier("display.refresh-indicator")
            }
        }
        .accessibilityIdentifier("display.scroll")
        // 날짜·정렬 변경, 탭 재선택에서만 맨 위로 간다. 같은 날짜·정렬의 재검증은 위치를 건드리지 않는다.
        .onChange(of: viewModel.scrollToTopToken) { _, _ in
            withAnimation(.snappy) { scrollPosition.scrollTo(edge: .top) }
        }
    }

    // MARK: 정렬 선택기

    private var sortTabs: some View {
        HStack(spacing: 0) {
            ChalkakSortSelector(
                options: viewModel.availableSorts,
                selectedOption: viewModel.preferredSort,
                label: { DisplayCopy.sortLabel($0) },
                onSelect: { sort in Task { await viewModel.selectSort(sort) } },
                identifier: { "display.sort-\($0.rawValue)-tab" }
            )
            Spacer(minLength: 0)
        }
    }

    // MARK: 아카이브 추천 카드

    /// 대표 사진 캐러셀(screens-b.md 2.3): 카드 3:4, 아래 페이지 표시기(선택 24×7 actionPrimary, 비선택 7×7 textMuted 45%).
    private var featuredPager: some View {
        VStack(spacing: ChalkakSpacing.lg) {
            TabView(
                selection: Binding(
                    get: { viewModel.featuredPage },
                    set: { viewModel.setFeaturedPage($0) }
                )
            ) {
                ForEach(Array(viewModel.featured.enumerated()), id: \.element.id) { index, item in
                    PostCell(
                        item: item, aspect: 3.0 / 4.0,
                        // 같은 게시물이 그리드에도 있으면 그리드 카드가 출발 뷰다(출발 id 중복 방지).
                        zoomSourceID: viewModel.items.contains(where: { $0.id == item.id }) ? nil : item.id,
                        itemIdentifier: "display.featured-item-\(Self.idString(item.id))",
                        likeIdentifier: "display.featured-like-button-\(Self.idString(item.id))",
                        countIdentifier: "display.featured-like-count-\(Self.idString(item.id))",
                        onOpen: { open(item.id) },
                        onLike: { viewModel.likeTapped(item.id) }
                    )
                    .padding(.horizontal, 32)
                    .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: featuredHeight)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("display.featured-pager")
            if viewModel.featured.count > 1 {
                HStack(spacing: ChalkakSpacing.sm) {
                    ForEach(viewModel.featured.indices, id: \.self) { index in
                        let isSelected = index == viewModel.featuredPage
                        Capsule()
                            .fill(isSelected ? ChalkakColor.actionPrimary : ChalkakColor.textMuted.opacity(0.45))
                            .frame(width: isSelected ? 24 : 7, height: 7)
                    }
                }
                .accessibilityHidden(true)
            }
        }
    }

    /// 화면 폭 − 카드 좌우 32씩에 3:4를 곱한 높이.
    private var featuredHeight: CGFloat {
        let width = UIScreen.main.bounds.width - 64
        return width * 4.0 / 3.0
    }

    // MARK: 그리드

    /// 2열 마손리 그리드(screens-b.md 2.2). 항상 더 짧은 열에 다음 사진을 넣는 그리디 패킹이라
    /// i번째 사진의 열은 앞 사진들의 비율에만 의존한다. 위에서 아래로 불러오는 동안 재배치가 눈에 띄지 않는다.
    private var grid: some View {
        let columns = MasonryLayout.distribute(viewModel.items, ratios: ratioByID)
        return HStack(alignment: .top, spacing: ChalkakSpacing.md) {
            masonryColumn(columns.left)
            masonryColumn(columns.right)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("display.grid")
    }

    private func masonryColumn(_ items: [PostListItem]) -> some View {
        LazyVStack(spacing: ChalkakSpacing.md) {
            ForEach(items) { item in
                PostCell(
                    item: item, aspect: 1 / (ratioByID[item.id] ?? MasonryLayout.defaultRatio),
                    signatureURL: item.signatureThumbnailImageURL ?? item.signatureOriginalImageURL,
                    zoomSourceID: item.id,
                    itemIdentifier: "display.item-\(Self.idString(item.id))",
                    likeIdentifier: "display.like-button-\(Self.idString(item.id))",
                    countIdentifier: "display.like-count-\(Self.idString(item.id))",
                    onOpen: { open(item.id) },
                    onLike: { viewModel.likeTapped(item.id) }
                )
                .transition(.opacity.combined(with: .scale(scale: 0.98)))
                .task(id: item.id) {
                    guard ratioByID[item.id] == nil,
                          let measured = await ImageRatioLoader.ratio(for: item.thumbnailImageURL ?? item.originalImageURL)
                    else { return }
                    ratioByID[item.id] = measured
                }
                .onAppear { Task { await viewModel.itemAppeared(item.id) } }
            }
        }
        .frame(maxWidth: .infinity, alignment: .top)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: items.map(\.id))
    }

    private func open(_ postId: UUID) {
        switch viewModel.openPost(postId) {
        case .open(let entry): shell.openFeed(entry)
        case .blocked: break // 게스트 안내 토스트는 ViewModel이 띄운다
        }
    }

    private static func idString(_ id: UUID) -> String { id.uuidString.lowercased() }
}

/// 전시 사진 한 장: 썸네일(없으면 원본)과 오른쪽 아래 하트.
private struct PostCell: View {
    let item: PostListItem
    let aspect: CGFloat
    var signatureURL: URL? = nil
    /// 줌 전환 출발 뷰로 등록할 게시물 id. nil이면 등록하지 않는다.
    var zoomSourceID: UUID? = nil
    let itemIdentifier: String
    let likeIdentifier: String
    let countIdentifier: String
    let onOpen: () -> Void
    let onLike: () -> Void

    var body: some View {
        Color.clear
            .aspectRatio(aspect, contentMode: .fit)
            .overlay {
                GeometryReader { geo in
                    ChalkakSignedImage(
                        imageURL: item.thumbnailImageURL ?? item.originalImageURL,
                        signatureURL: signatureURL,
                        signatureSize: CGSize(width: 40, height: 30)
                    )
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                        .contentShape(Rectangle())
                        .onTapGesture(perform: onOpen)
                        .accessibilityLabel(FeedCopy.photoAccessibilityLabel(title: item.title))
                        .accessibilityAddTraits(.isButton)
                }
            }
            .overlay(alignment: .bottomLeading) {
                PostLikeButton(
                    like: item.like, buttonIdentifier: likeIdentifier, countIdentifier: countIdentifier,
                    onImage: true, action: onLike
                )
            }
            .background(Color.black)
            .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.photoCard))
            .feedZoomSource(id: zoomSourceID)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier(itemIdentifier)
    }
}

// MARK: 날짜 선택 시트

private struct DisplayDatePickerSheet: View {
    let viewModel: DisplayViewModel
    @Binding var isPresented: Bool
    @State private var year: Int
    @State private var month: Int
    @State private var day: Int

    init(viewModel: DisplayViewModel, isPresented: Binding<Bool>) {
        self.viewModel = viewModel
        _isPresented = isPresented
        let date = viewModel.pendingDate ?? viewModel.selectedDate
        _year = State(initialValue: date.year)
        _month = State(initialValue: date.month)
        _day = State(initialValue: date.day)
    }

    var body: some View {
        ChalkakPickerSheet(title: DisplayCopy.pickerTitle, confirmTitle: DisplayCopy.pickerConfirm, onConfirm: confirm) {
            ChalkakWheelPicker(columns: [
                column(accessibilityLabel: "연도", values: viewModel.pickerYears, selection: $year, valueLabel: DisplayCopy.pickerYear),
                column(accessibilityLabel: "월", values: viewModel.pickerMonths(year: year), selection: $month, valueLabel: DisplayCopy.pickerMonth),
                column(accessibilityLabel: "일", values: viewModel.pickerDays(year: year, month: month), selection: $day, valueLabel: DisplayCopy.pickerDay),
            ])
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("display.date-picker-sheet")
        // 휠 사이 값이 서로 어긋나면(없는 날, 범위 밖) 가까운 값으로 맞춘다(REQ-DISP-009).
        .onChange(of: year) { _, _ in normalize() }
        .onChange(of: month) { _, _ in normalize() }
    }

    private func confirm() {
        let target = viewModel.resolvedPickerDate(year: year, month: month, day: day)
        isPresented = false
        Task { await viewModel.select(date: target) }
    }

    private func column(
        accessibilityLabel: String, values: [Int], selection: Binding<Int>, valueLabel: (Int) -> String
    ) -> ChalkakWheelColumn {
        ChalkakWheelColumn(
            accessibilityLabel: accessibilityLabel,
            titles: values.map(valueLabel),
            selectedIndex: values.firstIndex(of: selection.wrappedValue) ?? 0,
            onSelect: { index in
                if values.indices.contains(index) { selection.wrappedValue = values[index] }
            }
        )
    }

    private func normalize() {
        let resolved = viewModel.resolvedPickerDate(year: year, month: month, day: day)
        if resolved.month != month { month = resolved.month }
        if resolved.day != day { day = resolved.day }
        if resolved.year != year { year = resolved.year }
    }
}

// MARK: 마손리 배치

/// 2열 그리디 패킹. 열 높이 추정 = (세로/가로 비율, 모르면 4/3) + 간격 보정 0.06(원본 DisplayPhotoGrid).
enum MasonryLayout {
    static let defaultRatio: CGFloat = 4.0 / 3.0
    static let spacingRatio: CGFloat = 0.06

    static func distribute(_ items: [PostListItem], ratios: [UUID: CGFloat]) -> (left: [PostListItem], right: [PostListItem]) {
        var left: [PostListItem] = []
        var right: [PostListItem] = []
        var leftHeight: CGFloat = 0
        var rightHeight: CGFloat = 0
        for item in items {
            let unit = (ratios[item.id] ?? defaultRatio) + spacingRatio
            if leftHeight <= rightHeight {
                left.append(item)
                leftHeight += unit
            } else {
                right.append(item)
                rightHeight += unit
            }
        }
        return (left, right)
    }
}

/// 이미지의 EXIF 방향을 반영한 세로/가로 비율(height / width)을 한 번 측정한다(원본 ImageRatioLoader).
/// 화면에 그리는 요청과 같은 URLSession.shared 캐시를 쓰고, 픽셀 디코딩 없이 헤더 크기만 읽는다.
enum ImageRatioLoader {
    static func ratio(for url: URL) async -> CGFloat? {
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = (props[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue,
              let height = (props[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue,
              width > 0, height > 0
        else { return nil }
        let orientation = (props[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
        let swapped = (5...8).contains(orientation)
        return CGFloat(swapped ? width / height : height / width)
    }
}
