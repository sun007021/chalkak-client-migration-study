import SwiftUI
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
                .presentationDetents([.height(340)])
                .presentationDragIndicator(.visible)
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

    private var dateNavigation: some View {
        HStack(spacing: 0) {
            arrowButton(
                systemName: "chevron.left", label: DisplayCopy.navPrevious,
                identifier: "display.prev-date-button", enabled: viewModel.canGoPrevious
            ) { Task { await viewModel.goToPreviousDay() } }
            Spacer(minLength: 0)
            Button { showsDatePicker = true } label: {
                HStack(spacing: ChalkakSpacing.xs) {
                    Text(KST.monthDayLabel(viewModel.pendingDate ?? viewModel.selectedDate))
                        .font(ChalkakFont.headlineBold)
                        .foregroundStyle(ChalkakColor.textPrimary)
                        .accessibilityIdentifier("display.date-label")
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(ChalkakColor.iconPrimary)
                }
                .frame(minHeight: 44)
                .padding(.horizontal, ChalkakSpacing.md)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!viewModel.isNavigationEnabled)
            .accessibilityLabel(DisplayCopy.pickerTitle)
            .accessibilityIdentifier("display.date-picker-button")
            Spacer(minLength: 0)
            arrowButton(
                systemName: "chevron.right", label: DisplayCopy.navNext,
                identifier: "display.next-date-button", enabled: viewModel.canGoNext
            ) { Task { await viewModel.goToNextDay() } }
        }
        .padding(.horizontal, ChalkakSpacing.sm)
        .frame(height: 55)
    }

    private func arrowButton(systemName: String, label: String, identifier: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(enabled ? ChalkakColor.iconPrimary : ChalkakColor.iconPrimary.opacity(0.25))
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
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityIdentifier("display.loading")
        case .empty:
            ScrollView {
                VStack(spacing: ChalkakSpacing.xl) {
                    header
                    Text(FeedCopy.displayEmpty)
                        .font(ChalkakFont.subheadline)
                        .foregroundStyle(ChalkakColor.textSecondary)
                        .frame(maxWidth: .infinity, minHeight: 200)
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("display.empty-state")
                }
                .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            }
        case .failed(let notice):
            VStack(spacing: ChalkakSpacing.md) {
                Text(notice.message)
                    .font(ChalkakFont.subheadline)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .multilineTextAlignment(.center)
                Button { Task { await viewModel.retry() } } label: {
                    Text(DisplayCopy.retry)
                        .font(ChalkakFont.footnote)
                        .foregroundStyle(ChalkakColor.onActionPrimary)
                        .padding(.horizontal, ChalkakSpacing.lg)
                        .frame(minHeight: 36)
                        .background(ChalkakColor.actionPrimary, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("display.retry-button")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("display.error-state")
        case .loaded:
            loadedContent
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: ChalkakSpacing.xs) {
            Text(viewModel.topic?.title ?? "")
                .font(ChalkakFont.display)
                .foregroundStyle(ChalkakColor.textPrimary)
                .accessibilityIdentifier("display.topic-title")
            Text(viewModel.headerDescription)
                .font(ChalkakFont.subheadline)
                .foregroundStyle(ChalkakColor.textSecondary)
                .accessibilityIdentifier("display.description")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var loadedContent: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: ChalkakSpacing.lg) {
                    Color.clear.frame(height: 0).id(Self.topAnchor)
                    header
                    if viewModel.isRefreshing {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .accessibilityIdentifier("display.refresh-indicator")
                    }
                    if !viewModel.availableSorts.isEmpty { sortTabs }
                    if !viewModel.featured.isEmpty { featuredPager }
                    grid
                    if viewModel.isPaging {
                        ProgressView()
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .accessibilityIdentifier("display.load-more-indicator")
                    }
                }
                .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                .padding(.bottom, ChalkakSpacing.xl)
            }
            .accessibilityIdentifier("display.scroll")
            .onChange(of: viewModel.scrollToTopToken) { _, _ in
                withAnimation { proxy.scrollTo(Self.topAnchor, anchor: .top) }
            }
        }
    }

    private static let topAnchor = "display.top"

    // MARK: 정렬 탭

    private var sortTabs: some View {
        HStack(spacing: ChalkakSpacing.sm) {
            ForEach(viewModel.availableSorts, id: \.self) { sort in
                let isSelected = sort == viewModel.preferredSort
                Button { Task { await viewModel.selectSort(sort) } } label: {
                    Text(DisplayCopy.sortLabel(sort))
                        .font(ChalkakFont.subheadline)
                        .foregroundStyle(isSelected ? ChalkakColor.onActionPrimary : ChalkakColor.textPrimary)
                        .padding(.horizontal, ChalkakSpacing.lg)
                        .frame(minHeight: 36)
                        .background(Capsule().fill(isSelected ? ChalkakColor.actionPrimary : ChalkakColor.calendarCell))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? [.isSelected] : [])
                .accessibilityIdentifier("display.sort-\(sort.rawValue)-tab")
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: 아카이브 추천 카드

    private var featuredPager: some View {
        TabView(
            selection: Binding(
                get: { viewModel.featuredPage },
                set: { viewModel.setFeaturedPage($0) }
            )
        ) {
            ForEach(Array(viewModel.featured.enumerated()), id: \.element.id) { index, item in
                PostCell(
                    item: item, aspect: 5.0 / 6.0,
                    itemIdentifier: "display.featured-item-\(Self.idString(item.id))",
                    likeIdentifier: "display.featured-like-button-\(Self.idString(item.id))",
                    countIdentifier: "display.featured-like-count-\(Self.idString(item.id))",
                    onOpen: { open(item.id) },
                    onLike: { viewModel.likeTapped(item.id) }
                )
                .padding(.bottom, 28)
                .tag(index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .always))
        .frame(height: 440)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("display.featured-pager")
    }

    // MARK: 그리드

    private var grid: some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: ChalkakSpacing.md), GridItem(.flexible(), spacing: ChalkakSpacing.md)],
            spacing: ChalkakSpacing.md
        ) {
            ForEach(viewModel.items) { item in
                PostCell(
                    item: item, aspect: 5.0 / 6.0,
                    itemIdentifier: "display.item-\(Self.idString(item.id))",
                    likeIdentifier: "display.like-button-\(Self.idString(item.id))",
                    countIdentifier: "display.like-count-\(Self.idString(item.id))",
                    onOpen: { open(item.id) },
                    onLike: { viewModel.likeTapped(item.id) }
                )
                .onAppear { Task { await viewModel.itemAppeared(item.id) } }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("display.grid")
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
                    ChalkakRemoteImage(url: item.thumbnailImageURL ?? item.originalImageURL)
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                        .contentShape(Rectangle())
                        .onTapGesture(perform: onOpen)
                        .accessibilityLabel(FeedCopy.photoAccessibilityLabel(title: item.title))
                        .accessibilityAddTraits(.isButton)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                PostLikeButton(
                    like: item.like, buttonIdentifier: likeIdentifier, countIdentifier: countIdentifier,
                    onImage: true, action: onLike
                )
                .padding(ChalkakSpacing.sm)
            }
            .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.card))
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
        VStack(spacing: ChalkakSpacing.md) {
            Text(DisplayCopy.pickerTitle)
                .font(ChalkakFont.headline)
                .foregroundStyle(ChalkakColor.textPrimary)
                .padding(.top, ChalkakSpacing.lg)
            HStack(spacing: 0) {
                wheel(selection: $year, values: viewModel.pickerYears, label: DisplayCopy.pickerYear, identifier: "display.date-picker-year")
                wheel(selection: $month, values: viewModel.pickerMonths(year: year), label: DisplayCopy.pickerMonth, identifier: "display.date-picker-month")
                wheel(selection: $day, values: viewModel.pickerDays(year: year, month: month), label: DisplayCopy.pickerDay, identifier: "display.date-picker-day")
            }
            .frame(height: 150)
            ChalkakDialogButton(title: DisplayCopy.pickerConfirm, identifier: "display.date-picker-confirm-button") {
                let target = viewModel.resolvedPickerDate(year: year, month: month, day: day)
                isPresented = false
                Task { await viewModel.select(date: target) }
            }
            .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            .padding(.bottom, ChalkakSpacing.lg)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ChalkakColor.background.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("display.date-picker-sheet")
        // 휠 사이 값이 서로 어긋나면(없는 날, 범위 밖) 가까운 값으로 맞춘다(REQ-DISP-009).
        .onChange(of: year) { _, _ in normalize() }
        .onChange(of: month) { _, _ in normalize() }
    }

    private func wheel(selection: Binding<Int>, values: [Int], label: @escaping (Int) -> String, identifier: String) -> some View {
        Picker("", selection: selection) {
            ForEach(values, id: \.self) { value in
                Text(label(value)).tag(value)
            }
        }
        .pickerStyle(.wheel)
        .frame(maxWidth: .infinity)
        .clipped()
        .accessibilityIdentifier(identifier)
    }

    private func normalize() {
        let resolved = viewModel.resolvedPickerDate(year: year, month: month, day: day)
        if resolved.month != month { month = resolved.month }
        if resolved.day != day { day = resolved.day }
        if resolved.year != year { year = resolved.year }
    }
}
