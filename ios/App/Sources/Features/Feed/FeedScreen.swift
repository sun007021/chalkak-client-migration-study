import SwiftUI
import ChalkakCore
import ChalkakData
import ChalkakFeatures

private extension PostDetailEntry {
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
            ChalkakNavBar(
                title: viewModel.dateLabel ?? "",
                backIdentifier: "feed.back-button",
                titleIdentifier: "feed.date-label",
                onBack: { shell.pop() }
            )
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
        VStack(spacing: ChalkakSpacing.md) {
            Text(text)
                .font(ChalkakFont.subheadline)
                .foregroundStyle(ChalkakColor.textSecondary)
                .multilineTextAlignment(.center)
            if retry {
                Button { Task { await viewModel.retry() } } label: {
                    Text(DisplayCopy.retry)
                        .font(ChalkakFont.footnote)
                        .foregroundStyle(ChalkakColor.onActionPrimary)
                        .padding(.horizontal, ChalkakSpacing.lg)
                        .frame(minHeight: 36)
                        .background(ChalkakColor.actionPrimary, in: Capsule())
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
            VStack(alignment: .leading, spacing: ChalkakSpacing.lg) {
                FeedZoomablePhoto(
                    imageURL: viewModel.imageURL,
                    signatureURL: viewModel.signatureURL,
                    accessibilityText: FeedCopy.photoAccessibilityLabel(title: viewModel.title),
                    isLoading: viewModel.state == .loading
                )
                if viewModel.state == .content {
                    titleRow
                    if let like = viewModel.like {
                        PostLikeButton(
                            like: like,
                            buttonIdentifier: "feed.like-button",
                            countIdentifier: "feed.like-count",
                            isEnabled: viewModel.isLikeEnabled,
                            action: { viewModel.likeTapped() }
                        )
                    }
                    if let aiReview {
                        FeedAIReviewSection(session: session, container: container, viewModel: aiReview, isRunning: isRunning)
                    }
                }
            }
            .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            .padding(.vertical, ChalkakSpacing.sm)
        }
    }

    private var titleRow: some View {
        HStack(alignment: .top, spacing: ChalkakSpacing.sm) {
            Text(viewModel.displayTitle)
                .font(ChalkakFont.headlineBold)
                .foregroundStyle(ChalkakColor.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("feed.title")
            if viewModel.canEditTitle {
                iconButton("ic_edit", label: FeedDialogCopy.editTitle, identifier: "feed.edit-title-button") { viewModel.editTapped() }
            }
            if viewModel.canDelete {
                iconButton("ic_delete", label: FeedDialogCopy.deleteTitle, identifier: "feed.delete-button") { viewModel.deleteTapped() }
            }
        }
    }

    private func iconButton(_ asset: String, label: String, identifier: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(asset)
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 22, height: 22)
                .foregroundStyle(ChalkakColor.iconPrimary)
                .frame(width: 40, height: 40)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
                    HStack(spacing: ChalkakSpacing.sm) {
                        Button { viewModel.cancelDelete() } label: {
                            Text(prompt.cancelTitle)
                                .font(ChalkakFont.callout)
                                .foregroundStyle(ChalkakColor.textPrimary)
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .overlay(RoundedRectangle(cornerRadius: ChalkakRadius.button).stroke(ChalkakColor.border, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("feed.delete-cancel-button")
                        ChalkakDialogButton(title: prompt.confirmTitle, identifier: "feed.delete-confirm-button") {
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
                    .background(ChalkakColor.surfaceElevated, in: RoundedRectangle(cornerRadius: ChalkakRadius.card))
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
            VStack(spacing: ChalkakSpacing.lg) {
                Text(FeedDialogCopy.editTitle)
                    .font(ChalkakFont.headline)
                    .foregroundStyle(ChalkakColor.textPrimary)
                TextField(
                    FeedDialogCopy.editPlaceholder,
                    text: Binding(
                        get: { viewModel.edit?.text ?? "" },
                        set: { viewModel.editTextChanged($0) }
                    )
                )
                .font(ChalkakFont.callout)
                .focused($isFocused)
                .disabled(isSaving)
                .padding(.horizontal, ChalkakSpacing.md)
                .frame(minHeight: 44)
                .background(ChalkakColor.inputBackground, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
                .overlay(RoundedRectangle(cornerRadius: ChalkakRadius.button).stroke(ChalkakColor.border, lineWidth: 1))
                .accessibilityIdentifier("feed.title-input")
                if let error = edit?.error {
                    Text(error.message)
                        .font(ChalkakFont.footnote)
                        .foregroundStyle(ChalkakColor.error)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("feed.title-error")
                }
                HStack(spacing: ChalkakSpacing.sm) {
                    Button { viewModel.cancelEdit() } label: {
                        Text(FeedDialogCopy.editCancel)
                            .font(ChalkakFont.callout)
                            .foregroundStyle(ChalkakColor.textPrimary)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .overlay(RoundedRectangle(cornerRadius: ChalkakRadius.button).stroke(ChalkakColor.border, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .disabled(isSaving)
                    .accessibilityIdentifier("feed.title-cancel-button")
                    Button { Task { await viewModel.saveEdit() } } label: {
                        HStack(spacing: ChalkakSpacing.xs) {
                            if isSaving {
                                ProgressView()
                                    .tint(ChalkakColor.onActionPrimary)
                                    .accessibilityIdentifier("feed.title-saving")
                            }
                            Text(edit?.saveButtonTitle ?? FeedDialogCopy.editSave)
                                .font(ChalkakFont.callout)
                        }
                        .foregroundStyle(ChalkakColor.onActionPrimary)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(ChalkakColor.actionPrimary, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
                        .opacity(isSaving ? 0.6 : 1)
                    }
                    .buttonStyle(.plain)
                    .disabled(isSaving)
                    .accessibilityIdentifier("feed.title-save-button")
                }
            }
            .padding(ChalkakSpacing.xl)
            .frame(maxWidth: 320)
            .background(ChalkakColor.surfaceElevated, in: RoundedRectangle(cornerRadius: ChalkakRadius.dialog))
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
                    Text(pill.title)
                        .font(ChalkakFont.subheadline)
                        .foregroundStyle(pill.isEnabled ? ChalkakColor.onActionPrimary : ChalkakColor.textSecondary)
                        .padding(.horizontal, ChalkakSpacing.lg)
                        .frame(minHeight: 36)
                        .background(
                            Capsule().fill(pill.isEnabled ? ChalkakColor.actionPrimary : ChalkakColor.calendarCell)
                        )
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
                            .frame(width: geo.size.width * 0.4)
                            .padding(ChalkakSpacing.md)
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
            .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.card))
            .scaleEffect(scale, anchor: anchor)
            .zIndex(scale > 1 ? 1 : 0)
            .gesture(
                MagnifyGesture()
                    .onChanged { value in
                        anchor = value.startAnchor
                        scale = min(max(value.magnification, 1), Self.maxScale)
                    }
                    .onEnded { _ in
                        withAnimation(.easeOut(duration: 0.3)) { scale = 1 }
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
