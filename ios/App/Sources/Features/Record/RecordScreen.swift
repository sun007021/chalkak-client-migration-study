import SwiftUI
import ChalkakCore
import ChalkakData
import ChalkakFeatures

private extension KSTDate {
    /// `yyyy-mm-dd` (식별자용).
    var idString: String { String(format: "%04d-%02d-%02d", year, month, day) }
}

private extension YearMonth {
    var idString: String { String(format: "%04d-%02d", year, month) }
    var label: String { "\(year)년 \(month)월" }
}

/// 기록 탭 루트. ViewModel은 세션이 쥐고(탭을 오가도 월 캐시 유지) 여기서는 보임/가려짐을 알리고 그린다.
struct RecordHost: View {
    let container: AppContainer
    let session: MainSession
    @State private var viewModel: RecordViewModel

    init(container: AppContainer, session: MainSession) {
        self.container = container
        self.session = session
        _viewModel = State(initialValue: session.recordViewModel())
    }

    var body: some View {
        RecordScreen(container: container, session: session, viewModel: viewModel)
    }
}

private struct RecordScreen: View {
    let container: AppContainer
    let session: MainSession
    let viewModel: RecordViewModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var isActive = false
    @State private var runTask: Task<Void, Never>?
    @State private var showsMonthPicker = false

    private var shell: MainShellViewModel { session.shell }
    // 원본 RecordCalendarGrid(screens-c.md 2.3): 7열, 칸 간격 6, 칸 모서리 small(7), 좌우 20
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)

    var body: some View {
        VStack(spacing: 0) {
            monthHeader
            ScrollView { content }
        }
        .background(ChalkakColor.background.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("record.root")
        .onAppear { if shell.path.isEmpty, scenePhase != .background { activate() } }
        .onDisappear { deactivate() }
        .onChange(of: shell.path.isEmpty) { _, isEmpty in
            if isEmpty, scenePhase != .background { activate() } else { deactivate() }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                if shell.path.isEmpty {
                    if isActive { Task { await viewModel.appBecameActive() } } else { activate() }
                }
            case .background: deactivate()
            default: break // inactive(알림 센터 등)는 가려진 것으로 보지 않는다
            }
        }
        // 기록이 보이는 동안 들어온 요청(홈 주간 기록 등).
        .onChange(of: shell.recordRequest) { _, request in
            guard request != nil, isActive else { return }
            let date = shell.consumeRecordRequest()?.date
            Task { await viewModel.recordAppeared(requestedDate: date) }
        }
        .onChange(of: viewModel.needsLogin) { _, needsLogin in
            guard needsLogin else { return }
            viewModel.consumeNeedsLogin()
            Task { await container.launch.handleReauthenticationRequired() }
        }
        .sheet(isPresented: $showsMonthPicker) {
            RecordMonthPickerSheet(viewModel: viewModel, isPresented: $showsMonthPicker)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
                .chalkakSheetPresentationStyle()
        }
    }

    // MARK: 보임 · 가려짐

    private func activate() {
        guard !isActive else { return }
        isActive = true
        let date = shell.consumeRecordRequest()?.date
        runTask = Task { await viewModel.recordAppeared(requestedDate: date) }
    }

    private func deactivate() {
        guard isActive else { return }
        isActive = false
        runTask?.cancel()
        runTask = nil
        viewModel.recordDisappeared()
    }

    // MARK: 월 헤더

    /// 연월 버튼(`M월` title2 + `yyyy` footnote/textMuted, 첫 글자 기준선) 왼쪽 + ‹ › 이동 버튼 오른쪽.
    private var monthHeader: some View {
        HStack(spacing: 0) {
            Button { showsMonthPicker = true } label: {
                HStack(alignment: .firstTextBaseline, spacing: ChalkakSpacing.xs) {
                    Text("\(viewModel.selectedMonth.month)월")
                        .font(ChalkakFont.title2)
                        .foregroundStyle(ChalkakColor.textPrimary)
                    Text(String(viewModel.selectedMonth.year))
                        .font(ChalkakFont.footnote)
                        .foregroundStyle(ChalkakColor.textMuted)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(viewModel.selectedMonth.label)
                .accessibilityIdentifier("record.month-label")
                .frame(minHeight: 48)
                .padding(.horizontal, ChalkakSpacing.sm)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(viewModel.phase == .idle)
            .accessibilityLabel(RecordCopy.pickerTitle)
            .accessibilityIdentifier("record.month-picker-button")
            Spacer(minLength: 0)
            arrowButton(systemName: "chevron.left", identifier: "record.prev-month-button", enabled: viewModel.canGoToPreviousMonth) {
                Task { await viewModel.previousMonthTapped() }
            }
            arrowButton(systemName: "chevron.right", identifier: "record.next-month-button", enabled: viewModel.canGoToNextMonth) {
                Task { await viewModel.nextMonthTapped() }
            }
        }
        .padding(.leading, 12)
        .padding(.trailing, ChalkakSpacing.sm)
        .padding(.top, ChalkakSpacing.sm)
        .frame(height: 64)
    }

    private func arrowButton(systemName: String, identifier: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(enabled ? ChalkakColor.iconPrimary : ChalkakColor.textInactive)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityIdentifier(identifier)
    }

    // MARK: 내용

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .idle:
            Color.clear.frame(height: 1)
        case .loading:
            loadingGrid
        case .failed(let failure):
            errorState(failure)
        case .loaded:
            VStack(spacing: ChalkakSpacing.lg) {
                calendarGrid
                selectedPostSection
                saveButton
                if viewModel.calendar?.posts.isEmpty ?? false {
                    Color.clear.frame(height: 0).accessibilityIdentifier("record.empty-state")
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, ChalkakSpacing.sm)
            .padding(.bottom, 32)
        }
    }

    private func errorState(_ failure: RecordLoadFailure) -> some View {
        let stateID: String
        switch failure {
        case .loginRequired: stateID = "record.login-required-state"
        case .invalidMonth: stateID = "record.invalid-month-message"
        case .other: stateID = "record.error-state"
        }
        return VStack(spacing: ChalkakSpacing.sm) {
            Text(failure.title)
                .font(ChalkakFont.body)
                .foregroundStyle(ChalkakColor.textSecondary)
                .multilineTextAlignment(.center)
            if let buttonTitle = failure.buttonTitle {
                Button {
                    switch failure {
                    case .loginRequired: viewModel.loginTapped()
                    case .invalidMonth: break
                    case .other: Task { await viewModel.retryTapped() }
                    }
                } label: {
                    Text(buttonTitle)
                        .font(ChalkakFont.body)
                        .foregroundStyle(ChalkakColor.actionPrimary)
                        .padding(.horizontal, ChalkakSpacing.sm)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier(failure == .loginRequired ? "record.login-button" : "record.retry-button")
            }
        }
        .frame(maxWidth: .infinity, minHeight: 240)
        .padding(.horizontal, 20)
        .padding(.top, ChalkakSpacing.xl)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(stateID)
    }

    /// 로딩: 스피너 대신 달력 칸 모양의 스켈레톤.
    private var loadingGrid: some View {
        VStack(spacing: 6) {
            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(0..<35, id: \.self) { _ in
                    ChalkakSkeleton()
                        .aspectRatio(1, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.small))
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 14)
        .accessibilityElement(children: .ignore)
        .accessibilityIdentifier("record.loading")
    }

    // MARK: 달력

    private var calendarGrid: some View {
        VStack(spacing: 14) {
            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(Array(RecordCopy.weekdayLabels.enumerated()), id: \.offset) { _, label in
                    Text(label)
                        .font(ChalkakFont.caption)
                        .foregroundStyle(ChalkakColor.textMuted)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("record.weekday-header")
            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(Array(viewModel.layout.cells.enumerated()), id: \.offset) { _, date in
                    if let date {
                        dayCell(date)
                    } else {
                        Color.clear.aspectRatio(1, contentMode: .fit)
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("record.calendar-grid")
        }
    }

    private func dayCell(_ date: KSTDate) -> some View {
        let post = viewModel.post(on: date)
        let isSelected = viewModel.selectedDate == date
        return Button { viewModel.dayTapped(date) } label: {
            Color.clear
                .aspectRatio(1, contentMode: .fit)
                .overlay {
                    ZStack {
                        ChalkakColor.calendarCell
                        if let post {
                            ChalkakRemoteImage(url: post.thumbnailImageURL)
                        } else {
                            // 사진 없는 날: 날짜 숫자(caption, 고정폭 숫자, textSecondary) 가운데
                            Text("\(date.day)")
                                .font(ChalkakFont.caption)
                                .monospacedDigit()
                                .foregroundStyle(ChalkakColor.textSecondary)
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.small))
                .overlay(
                    RoundedRectangle(cornerRadius: ChalkakRadius.small)
                        .stroke(isSelected ? ChalkakColor.calendarSelection : Color.clear, lineWidth: 2)
                )
        }
        .buttonStyle(ChalkakUnhighlightedButtonStyle())
        .disabled(post == nil)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("record.day-\(date.idString)")
    }

    // MARK: 선택한 날의 사진

    @ViewBuilder
    private var selectedPostSection: some View {
        if let post = viewModel.selectedPost {
            VStack(spacing: ChalkakSpacing.md) {
                ChalkakRemoteImage(url: post.thumbnailImageURL)
                    .frame(maxWidth: .infinity)
                    .aspectRatio(1, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.photoCard))
                    .overlay(alignment: .topLeading) {
                        if viewModel.showsPendingBadge { pendingBadge }
                    }
                    .accessibilityIdentifier("record.selected-photo")
                if viewModel.showsPostActions {
                    HStack(spacing: ChalkakSpacing.md) {
                        actionButton(RecordCopy.actionFeed, identifier: "record.view-feed-button") { viewModel.viewFeedTapped() }
                        actionButton(RecordCopy.actionDisplay, identifier: "record.view-display-button") { viewModel.viewDisplayTapped() }
                    }
                }
            }
        }
    }

    private var pendingBadge: some View {
        VStack(alignment: .leading, spacing: ChalkakSpacing.xs) {
            Button { viewModel.pendingBadgeTapped() } label: {
                Text(RecordCopy.pendingBadge)
                    .font(ChalkakFont.captionSemibold)
                    .foregroundStyle(ChalkakColor.textOnImage)
                    .padding(.horizontal, ChalkakSpacing.md)
                    .frame(minHeight: 28)
                    .background(ChalkakColor.scrim, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(viewModel.pendingBadgeAccessibilityLabel)
            .accessibilityIdentifier("record.pending-badge")
            if viewModel.isPendingTooltipOpen {
                Text(RecordCopy.pendingTooltip)
                    .font(ChalkakFont.caption)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .padding(ChalkakSpacing.md)
                    .background(ChalkakColor.surfaceElevated, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
                    .shadow(color: .black.opacity(0.12), radius: 6, x: 0, y: 2)
                    .accessibilityIdentifier("record.pending-tooltip")
            }
        }
        .padding(ChalkakSpacing.md)
    }

    private func actionButton(_ title: String, identifier: String, action: @escaping () -> Void) -> some View {
        ChalkakButton(title: title, action: action, fillsWidth: true, verticalPadding: 13)
            .accessibilityIdentifier(identifier)
    }

    // MARK: 이미지 저장

    private var saveButton: some View {
        ChalkakOutlinedButton(
            title: RecordCopy.save,
            action: { Task { await viewModel.saveImageTapped() } },
            isEnabled: !viewModel.isSaving,
            fillsWidth: true,
            verticalPadding: 13
        )
        .accessibilityIdentifier("record.save-image-button")
    }
}

/// 월 선택 시트: 선택지(서버 연월 ∪ 현재 달, 최신순)에서 고른다.
private struct RecordMonthPickerSheet: View {
    let viewModel: RecordViewModel
    @Binding var isPresented: Bool

    var body: some View {
        VStack(spacing: 0) {
            Text(RecordCopy.pickerTitle)
                .font(ChalkakFont.headline)
                .foregroundStyle(ChalkakColor.textPrimary)
                .frame(maxWidth: .infinity, minHeight: 52)
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.availableMonths, id: \.self) { month in
                        Button {
                            isPresented = false
                            Task { await viewModel.selectMonth(month) }
                        } label: {
                            HStack {
                                Text(month.label)
                                    .font(ChalkakFont.body)
                                    .foregroundStyle(ChalkakColor.textPrimary)
                                Spacer(minLength: 0)
                                if month == viewModel.selectedMonth {
                                    Image(systemName: "checkmark").foregroundStyle(ChalkakColor.calendarSelection)
                                }
                            }
                            .frame(minHeight: 48)
                            .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("record.month-picker-item-\(month.idString)")
                    }
                }
            }
        }
        .background(ChalkakSheetSurface.contentBackground.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("record.month-picker-sheet")
    }
}
