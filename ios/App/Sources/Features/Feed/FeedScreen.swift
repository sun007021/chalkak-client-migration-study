import SwiftUI
import ChalkakCore
import ChalkakData
import ChalkakFeatures

extension PostDetailEntry {
    /// 진입 경로와 무관한 게시물 id(Kit의 `postId`는 모듈 내부용).
    var feedPostID: UUID {
        switch self {
        case .listItem(let item): item.id
        case .mine(let postId, _): postId
        }
    }
}

/// 게시물 상세(피드) 쌓임 화면. ViewModel은 화면이 처음 나타날 때 한 번 만든다.
struct FeedScreen: View {
    let container: AppContainer
    let session: MainSession
    let entry: PostDetailEntry
    @State private var viewModel: PostDetailViewModel?

    var body: some View {
        ZStack {
            ChalkakColor.background.ignoresSafeArea()
            if let viewModel {
                FeedContentView(container: container, session: session, viewModel: viewModel)
            }
        }
        .edgeSwipeBackEnabled()
        .onAppear {
            if viewModel == nil { viewModel = container.makePostDetailViewModel(entry: entry) }
        }
    }
}

private struct FeedContentView: View {
    let container: AppContainer
    let session: MainSession
    let viewModel: PostDetailViewModel
    @State private var aiReview: AIReviewViewModel?
    @Environment(\.scenePhase) private var scenePhase

    private var shell: MainShellViewModel { session.shell }

    /// 이 화면이 쌓임의 맨 위인가(알림 상세 같은 다른 화면이 위에 올라오면 가려진 것으로 본다).
    private var isTop: Bool {
        guard case .feed(let top)? = shell.path.last else { return false }
        return top.feedPostID == viewModel.postId
    }

    private var isRunning: Bool { isTop && scenePhase != .background }

    var body: some View {
        VStack(spacing: 0) {
            // 원본 FeedTopBar(screens-b.md 4.1): 왼쪽 뒤로, 오른쪽 수정(actionPrimary)·삭제(error) 아이콘 48pt 원 버튼
            ChalkakNavBar(
                title: viewModel.dateLabel ?? "",
                backIdentifier: "feed.back-button",
                titleIdentifier: "feed.date-label",
                onBack: { shell.pop() }
            )
            .overlay(alignment: .trailing) { topBarActions }
            content
        }
        .overlay { dialogs }
        .background(ChalkakColor.background.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("feed.root")
        // 보이는 동안만 조회한다(다른 화면이 위에 있거나 앱이 비활성이면 취소).
        .task(id: isRunning) {
            if isRunning { await viewModel.onAppear() } else { viewModel.onDisappear() }
        }
        .onDisappear { viewModel.onDisappear() }
        .onChange(of: viewModel.aiReviewTarget, initial: true) { _, target in syncAIReview(target) }
        .onChange(of: viewModel.toast) { _, notice in
            guard let notice else { return }
            container.toast.show(notice.message)
            viewModel.dismissToast()
        }
        .onChange(of: viewModel.dismissal) { _, dismissal in
            guard let dismissal else { return }
            switch dismissal {
            case .deleted:
                // 닫기와 토스트 "게시물을 삭제했어요"는 셸이 맡는다.
                shell.postDeleted(postId: viewModel.postId)
            case .unavailable:
                if isTop { shell.pop() }
            }
            viewModel.consumeDismissal()
        }
        .onChange(of: viewModel.needsLogin) { _, needsLogin in
            guard needsLogin else { return }
            viewModel.consumeNeedsLogin()
            Task { await container.launch.handleReauthenticationRequired() }
        }
    }

    // MARK: 본문

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .notFound(let notice):
            stateMessage(notice.message, identifier: "feed.not-found-state", retry: false)
        case .failed(let notice):
            stateMessage(notice.message, identifier: "feed.error-state", retry: true)
        case .loading, .content:
            detail
        }
    }

    private func stateMessage(_ text: String, identifier: String, retry: Bool) -> some View {
        VStack(spacing: ChalkakSpacing.xl) {
            Text(text)
                .font(ChalkakFont.body)
                .foregroundStyle(ChalkakColor.textSecondary)
                .multilineTextAlignment(.center)
            if retry {
                Button { Task { await viewModel.retry() } } label: {
                    Text(DisplayCopy.retry)
                        .font(ChalkakFont.body)
                        .foregroundStyle(ChalkakColor.actionPrimary)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("feed.retry-button")
            }
        }
        .padding(ChalkakSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(identifier)
    }

    private var detail: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                FeedZoomablePhoto(
                    imageURL: viewModel.imageURL,
                    signatureURL: viewModel.signatureURL,
                    accessibilityText: FeedCopy.photoAccessibilityLabel(title: viewModel.title),
                    isLoading: viewModel.state == .loading
                )
                if viewModel.state == .content {
                    likeRow
                    if let aiReview {
                        FeedAIReviewSection(session: session, container: container, viewModel: aiReview, isRunning: isRunning)
                            .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                            .padding(.top, ChalkakSpacing.lg)
                    }
                }
            }
            .padding(.top, ChalkakSpacing.sm)
            .padding(.bottom, 40)
        }
    }

    /// 좋아요 행(screens-b.md 4.1 FeedLikeRow): 높이 57, 좌우 14, 하트+숫자 왼쪽, 제목 body/textSecondary 오른쪽(1줄), 바닥 0.5 선.
    private var likeRow: some View {
        HStack(spacing: ChalkakSpacing.md) {
            if let like = viewModel.like {
                PostLikeButton(
                    like: like,
                    buttonIdentifier: "feed.like-button",
                    countIdentifier: "feed.like-count",
                    isEnabled: viewModel.isLikeEnabled,
                    action: { viewModel.likeTapped() }
                )
            }
            Text(viewModel.displayTitle)
                .font(ChalkakFont.body)
                .foregroundStyle(ChalkakColor.textSecondary)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .accessibilityIdentifier("feed.title")
        }
        .padding(.horizontal, 14)
        .frame(height: 57)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ChalkakColor.border).frame(height: 0.5)
        }
    }

    private var topBarActions: some View {
        HStack(spacing: ChalkakSpacing.xs) {
            if viewModel.canEditTitle {
                iconButton("ic_edit", label: FeedDialogCopy.editTitle, color: ChalkakColor.actionPrimary, identifier: "feed.edit-title-button") { viewModel.editTapped() }
            }
            if viewModel.canDelete {
                iconButton("ic_delete", label: FeedDialogCopy.deleteTitle, color: ChalkakColor.error, identifier: "feed.delete-button") { viewModel.deleteTapped() }
            }
        }
        .padding(.trailing, ChalkakSpacing.md)
    }

    private func iconButton(_ asset: String, label: String, color: Color, identifier: String, action: @escaping () -> Void) -> some View {
        FeedTopBarActionButton(asset: asset, color: color, action: action)
            .accessibilityLabel(label)
            .accessibilityIdentifier(identifier)
    }

    // MARK: 다이얼로그

    @ViewBuilder
    private var dialogs: some View {
        ZStack {
            if let prompt = viewModel.deletePrompt {
                ChalkakDialog(
                    identifier: "feed.delete-dialog",
                    title: FeedDialogCopy.deleteTitle,
                    message: prompt.message,
                    titleIdentifier: "feed.delete-title",
                    messageIdentifier: "feed.delete-body"
                ) {
                    HStack(spacing: 10) {
                        ChalkakDialogButton(title: prompt.cancelTitle, identifier: "feed.delete-cancel-button", style: .secondary) {
                            viewModel.cancelDelete()
                        }
                        ChalkakDialogButton(title: prompt.confirmTitle, identifier: "feed.delete-confirm-button", style: .destructive) {
                            Task { await viewModel.confirmDelete() }
                        }
                    }
                }
            }
            if viewModel.edit != nil {
                FeedTitleEditDialog(viewModel: viewModel)
            }
            if viewModel.isDeleting {
                ProgressView()
                    .padding(ChalkakSpacing.lg)
                    .background(ChalkakColor.surfaceElevated, in: RoundedRectangle(cornerRadius: ChalkakRadius.large))
                    .accessibilityIdentifier("feed.deleting")
            }
        }
    }

    // MARK: AI 피드백

    /// 상세 응답이 확정되어 대상이 생기면 AI ViewModel을 만들고, 이후에는 대상만 바꾼다.
    /// 알림·푸시의 "AI 결과 열기" 요청이 이 게시물 몫이면 첫 조회 결과로 시트를 한 번 자동으로 연다.
    private func syncAIReview(_ target: AIReviewTarget?) {
        guard let target else { return }
        if let aiReview {
            aiReview.show(target)
        } else {
            let opens = session.aiResultInbox.take(target.postId)
            aiReview = container.makeAIReviewViewModel(target: target, surface: .detail, opensSheetOnFirstResult: opens)
        }
    }
}

// MARK: 제목 수정 다이얼로그

private struct FeedTitleEditDialog: View {
    let viewModel: PostDetailViewModel
    @FocusState private var isFocused: Bool

    var body: some View {
        let edit = viewModel.edit
        let isSaving = edit?.isSaving ?? false
        ZStack {
            ChalkakColor.scrim.ignoresSafeArea()
            // 원본 FeedTitleEditDialog(screens-b.md 4.4): 카드 라운드 16, 패딩 24, 제목 title3, 입력 ChalkakTextField(subheadline), 버튼 간격 10
            VStack(spacing: ChalkakSpacing.lg) {
                Text(FeedDialogCopy.editTitle)
                    .font(ChalkakFont.title3)
                    .foregroundStyle(ChalkakColor.textPrimary)
                TextField(
                    "",
                    text: Binding(
                        get: { viewModel.edit?.text ?? "" },
                        set: { viewModel.editTextChanged($0) }
                    ),
                    prompt: Text(FeedDialogCopy.editPlaceholder).foregroundStyle(ChalkakColor.textInactive)
                )
                .font(ChalkakFont.subheadline)
                .foregroundStyle(ChalkakColor.textPrimary)
                .focused($isFocused)
                .disabled(isSaving)
                .chalkakInputChrome(isFocused: isFocused)
                .accessibilityLabel(FeedDialogCopy.editPlaceholder)
                .accessibilityIdentifier("feed.title-input")
                if let error = edit?.error {
                    Text(error.message)
                        .font(ChalkakFont.footnote)
                        .foregroundStyle(ChalkakColor.error)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("feed.title-error")
                }
                HStack(spacing: 10) {
                    ChalkakDialogButton(title: FeedDialogCopy.editCancel, identifier: "feed.title-cancel-button", style: .secondary) {
                        viewModel.cancelEdit()
                    }
                    .disabled(isSaving)
                    HStack(spacing: ChalkakSpacing.xs) {
                        if isSaving {
                            ProgressView()
                                .tint(ChalkakColor.onActionPrimary)
                                .accessibilityIdentifier("feed.title-saving")
                        }
                        ChalkakDialogButton(title: edit?.saveButtonTitle ?? FeedDialogCopy.editSave, identifier: "feed.title-save-button") {
                            Task { await viewModel.saveEdit() }
                        }
                        .disabled(isSaving)
                    }
                    .opacity(isSaving ? 0.6 : 1)
                }
            }
            .padding(ChalkakSpacing.xl)
            .frame(maxWidth: 320)
            .background(ChalkakColor.surfaceElevated, in: RoundedRectangle(cornerRadius: ChalkakRadius.large))
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("feed.title-dialog")
            .accessibilityAddTraits(.isModal)
        }
        .onAppear { isFocused = true }
    }
}

// MARK: AI 알약

private struct FeedAIReviewSection: View {
    let session: MainSession
    let container: AppContainer
    let viewModel: AIReviewViewModel
    let isRunning: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: ChalkakSpacing.sm) {
            // 알약이 없을 때도 조회 시작·중지 modifier가 붙어 있도록 크기 0 앵커를 둔다.
            Color.clear.frame(height: 0)
            if let pill = viewModel.pill {
                Button { Task { await viewModel.tapPill() } } label: {
                    HStack(spacing: ChalkakSpacing.sm) {
                        if viewModel.phase == .processing || viewModel.phase == .requesting {
                            ChalkakAudioWaveIcon(isAnimating: true)
                                .frame(height: 18)
                        }
                        Text(pill.title)
                            .font(ChalkakFont.subheadlineSemibold)
                    }
                    .foregroundStyle(pill.isEnabled ? ChalkakColor.onActionPrimary : ChalkakColor.textSecondary)
                    .padding(.horizontal, ChalkakSpacing.lg)
                    .frame(minHeight: 44)
                    .background(
                        Capsule().fill(pill.isEnabled ? ChalkakColor.actionPrimary : ChalkakColor.calendarCell)
                    )
                    .shadow(color: .black.opacity(0.12), radius: 8, x: 0, y: 2)
                }
                .buttonStyle(.plain)
                .disabled(!pill.isEnabled)
                .accessibilityIdentifier(pillIdentifier)
            }
            if let message = viewModel.message {
                Text(message.message)
                    .font(ChalkakFont.footnote)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .accessibilityIdentifier("feed.ai-message")
            }
        }
        .task(id: isRunning) {
            if isRunning { await viewModel.onAppear() } else { viewModel.onDisappear() }
        }
        .onDisappear { viewModel.onDisappear() }
        // 로그인 계정이 바뀌면 이전 계정의 결과를 버리고 다시 확인한다.
        .onChange(of: session.shell.access) { _, _ in
            Task { await viewModel.viewerDidChange() }
        }
        .onChange(of: viewModel.needsLogin) { _, needsLogin in
            guard needsLogin else { return }
            Task { await container.launch.handleReauthenticationRequired() }
        }
        .aiReviewSheets(viewModel)
    }

    private var pillIdentifier: String {
        switch viewModel.phase {
        case .checking: "feed.ai-checking"
        case .checkFailed: "feed.ai-recheck-button"
        case .none: "feed.ai-request-button"
        case .requesting: "feed.ai-requesting"
        case .processing: "feed.ai-processing"
        case .completed: "feed.ai-result-button"
        case .failed: viewModel.canRetry ? "feed.ai-retry-button" : "feed.ai-failed-button"
        case .hidden: "feed.ai-hidden"
        }
    }
}

// MARK: 사진 확대

/// 원본 사진 위에 작가 사인을 얹고 핀치로 1배~4배까지 확대한다. 손을 떼면 원래 크기로 돌아온다(REQ-FEED-011).
/// 확대 중심은 손가락이 처음 닿은 지점(`startAnchor`)이라 그 지점이 고정된다(REQ-FEED-012).
private struct FeedZoomablePhoto: View {
    static let maxScale: CGFloat = 4

    let imageURL: URL?
    let signatureURL: URL?
    let accessibilityText: String
    let isLoading: Bool
    @State private var scale: CGFloat = 1
    @State private var anchor: UnitPoint = .center
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Color.clear
            .aspectRatio(5.0 / 6.0, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .overlay {
                GeometryReader { geo in
                    ZStack(alignment: .bottomTrailing) {
                        ChalkakRemoteImage(url: imageURL)
                            .frame(width: geo.size.width, height: geo.size.height)
                            .clipped()
                            .accessibilityLabel(accessibilityText)
                        FeedSignatureImage(url: signatureURL)
                            .frame(width: 70, height: 52)
                            .padding(ChalkakSpacing.sm)
                            .accessibilityIdentifier("feed.signature-image")
                        if isLoading {
                            ProgressView()
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .accessibilityIdentifier("feed.loading")
                        }
                    }
                    .frame(width: geo.size.width, height: geo.size.height)
                }
            }
            .background(ChalkakColor.surfaceElevated)
            .scaleEffect(scale, anchor: anchor)
            .zIndex(scale > 1 ? 1 : 0)
            .gesture(
                MagnifyGesture()
                    .onChanged { value in
                        anchor = value.startAnchor
                        scale = min(max(value.magnification, 1), Self.maxScale)
                    }
                    .onEnded { _ in
                        // 동작 줄이기가 켜져 있으면 애니메이션 없이 원래 크기로 돌아온다.
                        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) { scale = 1 }
                    }
            )
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("feed.photo")
    }
}

/// 사인 PNG(투명 배경 + 흰 획). 불러오는 동안·실패해도 대체 배경을 깔지 않는다.
private struct FeedSignatureImage: View {
    let url: URL?

    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let image):
                image.resizable().aspectRatio(contentMode: .fit)
            default:
                Color.clear.aspectRatio(2, contentMode: .fit)
            }
        }
    }
}

/// 피드 상단 수정·삭제 아이콘 버튼(48 원). Liquid Glass에서는 유리 버튼 안 아이콘을 네이티브 뒤로가기와 같은 17pt로 맞춘다(원본 FeedTopBar).
private struct FeedTopBarActionButton: View {
    @ScaledMetric(relativeTo: .body) private var glassIconSize: CGFloat = 17
    let asset: String
    let color: Color
    let action: () -> Void

    var body: some View {
        if #available(iOS 26.0, *), ChalkakPlatformAppearance.usesLiquidGlass {
            Button(action: action) { icon(size: glassIconSize) }
                .foregroundStyle(color)
                .tint(color)
                .controlSize(.large)
                .modifier(ChalkakNavigationButtonStyle())
                .buttonBorderShape(.circle)
                .frame(width: ChalkakNavigationButton.diameter, height: ChalkakNavigationButton.diameter)
                .contentShape(Circle())
        } else {
            Button(action: action) {
                icon(size: 24)
                    .frame(width: 48, height: 48)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
        }
    }

    private func icon(size: CGFloat) -> some View {
        Image(asset)
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .foregroundStyle(color)
    }
}
