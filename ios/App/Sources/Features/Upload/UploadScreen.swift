import SwiftUI
import UIKit
import PhotosUI
import ChalkakCore
import ChalkakData
import ChalkakFeatures

/// 업로드 쌓임 화면(screen_view `photo_upload`, 성공은 `photo_upload_success`). 주제 날짜는 게이트가 고정해 준 값이다.
/// ViewModel은 화면이 처음 나타날 때 한 번 만든다.
struct UploadScreen: View {
    let container: AppContainer
    let session: MainSession
    let topicDate: KSTDate
    @State private var viewModel: UploadViewModel?

    var body: some View {
        ZStack {
            ChalkakColor.background.ignoresSafeArea()
            if let viewModel {
                UploadContentView(container: container, session: session, viewModel: viewModel)
            }
        }
        .onAppear {
            if viewModel == nil { viewModel = container.makeUploadViewModel(topicDate: topicDate) }
        }
    }
}

/// 편집기 덮개의 식별 단위(요청 번호).
private struct EditorItem: Identifiable {
    let request: UploadViewModel.EditorRequest
    var id: Int { request.id }
}

/// 사진 미리보기를 다시 그릴 조건.
private struct PreviewKey: Equatable {
    let photoID: UUID?
    let edit: PhotoEdit
}

/// 앨범·카메라 버튼 이름(공용 문구 표에 없음. 아이콘과 접근성 라벨로만 쓴다).
private enum UploadSourceLabel {
    static let album = "앨범"
    static let camera = "카메라"
}

private struct UploadContentView: View {
    let container: AppContainer
    let session: MainSession
    let viewModel: UploadViewModel

    @State private var pickerItem: PhotosPickerItem?
    @State private var showsPicker = false
    @State private var showsCamera = false
    @State private var showsCameraPermission = false
    /// 이번 촬영본을 앨범에 저장할지("저장 없이 촬영"이면 false).
    @State private var savesCapture = true
    @State private var previewImage: UIImage?
    /// 키보드가 떠 있는가. 뒤로 가기·끌어 닫기는 키보드를 먼저 내린다(screens-b.md 5.3).
    @State private var isKeyboardVisible = false
    /// 키보드를 내리는 중에 눌린 뒤로 가기. 키보드가 완전히 내려간 뒤 이어서 처리한다.
    @State private var isBackPending = false
    @State private var scrollOffset: CGFloat = 0
    @State private var captionFrame: CGRect = .zero
    @State private var canDismissCurrentDrag: Bool?

    private var shell: MainShellViewModel { session.shell }

    private var isPresentingModal: Bool {
        showsPicker || showsCamera || viewModel.editor != nil
    }

    var body: some View {
        let previewKey = PreviewKey(photoID: viewModel.photo?.id, edit: viewModel.edit)
        VStack(spacing: 0) {
            if let success = viewModel.success {
                UploadSuccessView(success: success, image: previewImage, caption: viewModel.title) { confirmSuccess() }
            } else {
                form
            }
        }
        .overlay { permissionDialog }
        .background(ChalkakColor.background.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("upload.root")
        .task {
            viewModel.onAppear()
            await viewModel.loadTopic()
        }
        .task(id: previewKey) { await refreshPreview() }
        .onDisappear {
            // 덮개(편집기·카메라·선택기)가 올라온 것은 화면을 나간 것이 아니다.
            guard !isPresentingModal else { return }
            Task { await viewModel.close() }
        }
        .onChange(of: viewModel.toast) { _, notice in
            guard let notice else { return }
            container.toast.show(notice.message)
        }
        .onChange(of: viewModel.needsLogin) { _, needsLogin in
            guard needsLogin else { return }
            Task { await container.launch.handleReauthenticationRequired() }
        }
        .photosPicker(isPresented: $showsPicker, selection: $pickerItem, matching: .images)
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            pickerItem = nil
            Task {
                let data = try? await item.loadTransferable(type: Data.self)
                // 읽지 못하면 빈 바이트를 넘겨 "사진을 준비하지 못했어요"를 보인다(REQ-UPL-018).
                await viewModel.photoPicked(data ?? Data(), source: .album)
            }
        }
        .fullScreenCover(isPresented: $showsCamera) {
            CameraPicker { data in
                showsCamera = false
                guard let data else { return }
                let source: PhotoSource = savesCapture ? .camera : .album
                Task { await viewModel.photoPicked(data, source: source) }
            }
            .ignoresSafeArea()
        }
        .fullScreenCover(item: editorBinding) { item in
            PhotoEditHost(container: container, request: item.request) { outcome in
                viewModel.editorClosed(outcome, requestID: item.request.id)
            }
        }
    }

    private var editorBinding: Binding<EditorItem?> {
        Binding(
            get: { viewModel.editor.map(EditorItem.init) },
            set: { _ in }
        )
    }

    // MARK: 입력 화면

    private var form: some View {
        VStack(spacing: 0) {
            ChalkakNavBar(
                title: UploadCopy.title,
                backIdentifier: "upload.close-button",
                titleIdentifier: "upload.title",
                onBack: requestBack
            )
            ScrollView {
                // 원본 PhotoUploadScreen(screens-b.md 5.1): 위 24, 사진 영역(전체 폭) → 34 → 설명 입력(좌우 22) → 아래 104
                VStack(alignment: .leading, spacing: 0) {
                    photoArea
                    titleField
                        .padding(.horizontal, 22)
                        .padding(.top, 34)
                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.dismissSpace)) } action: { captionFrame = $0 }
                    if case .failed(let notice) = viewModel.topic {
                        topicFailure(notice)
                            .padding(.horizontal, 22)
                            .padding(.top, ChalkakSpacing.sm)
                    }
                    if let message = errorMessage {
                        Text(message)
                            .font(ChalkakFont.footnote)
                            .foregroundStyle(ChalkakColor.error)
                            .padding(.horizontal, 22)
                            .padding(.top, ChalkakSpacing.sm)
                            .accessibilityIdentifier("upload.error-message")
                    }
                }
                .padding(.top, ChalkakSpacing.xl)
                .padding(.bottom, 104)
            }
            .scrollDismissesKeyboard(.interactively)
            .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y + $0.contentInsets.top } action: { _, offset in
                scrollOffset = offset
            }
            submitButton
        }
        .contentShape(Rectangle())
        .coordinateSpace(name: Self.dismissSpace)
        .simultaneousGesture(dismissGesture)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            isKeyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidHideNotification)) { _ in
            isKeyboardVisible = false
            completePendingBack()
        }
    }

    nonisolated private static let dismissSpace = "upload.dismiss"

    /// 뒤로 가기: 키보드가 떠 있으면 먼저 내리고, 다 내려간 뒤 이동한다.
    private func requestBack() {
        guard !isBackPending else { return }
        if isKeyboardVisible {
            isBackPending = true
            dismissKeyboard()
        } else {
            shell.pop()
        }
    }

    private func completePendingBack() {
        guard isBackPending else { return }
        isBackPending = false
        shell.pop()
    }

    private func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    /// 아래로 끌어 닫기: 맨 위에서 입력칸 밖에서 시작한 세로 우세 끌기만 인정한다. 80 이상 또는 예측 140 이상이면 닫는다.
    private var dismissGesture: some Gesture {
        DragGesture(minimumDistance: 20, coordinateSpace: .named(Self.dismissSpace))
            .onChanged { value in
                guard canDismissCurrentDrag == nil else { return }
                // 키보드가 드래그 도중 내려가더라도 같은 드래그로 화면을 닫지 않는다.
                canDismissCurrentDrag = !isKeyboardVisible && !viewModel.isSubmitting
                    && scrollOffset <= 1 && !captionFrame.contains(value.startLocation)
            }
            .onEnded { value in
                let canDismiss = canDismissCurrentDrag == true
                canDismissCurrentDrag = nil
                guard canDismiss, !viewModel.isSubmitting, !isKeyboardVisible,
                      value.translation.height > abs(value.translation.width) else { return }
                if value.translation.height > 80 || value.predictedEndTranslation.height > 140 {
                    requestBack()
                }
            }
    }

    private func topicFailure(_ notice: Notice) -> some View {
        VStack(alignment: .leading, spacing: ChalkakSpacing.sm) {
            Text(notice.message)
                .font(ChalkakFont.footnote)
                .foregroundStyle(ChalkakColor.error)
                .accessibilityIdentifier("upload.topic-error")
            Button { Task { await viewModel.retryTopic() } } label: {
                Text(UploadCopy.topicRetry)
                    .font(ChalkakFont.body)
                    .foregroundStyle(ChalkakColor.actionPrimary)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("upload.topic-retry-button")
        }
    }

    /// 빈 사진 영역 안의 안내(주제가 있을 때만 첫 줄).
    @ViewBuilder
    private var emptyGuide: some View {
        VStack(spacing: 5) {
            switch viewModel.topic {
            case .loading:
                ProgressView()
            case .loaded(let topic):
                Text(UploadCopy.heading(topicTitle: topic.title))
                    .font(ChalkakFont.subheadline)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier("upload.topic-title")
            case .failed:
                EmptyView()
            }
            Text(UploadCopy.subheading)
                .font(ChalkakFont.caption)
                .foregroundStyle(ChalkakColor.textMuted)
                .accessibilityIdentifier("upload.guide-text")
        }
        .padding(.horizontal, ChalkakSpacing.xl)
    }

    // MARK: 사진 영역

    /// 사진 영역(전체 폭, 바탕 inputBackground). 비어 있으면 1.216 비율의 점선 칸 + 안내, 오른쪽 위에 앨범·카메라 42 원 버튼.
    @ViewBuilder
    private var photoArea: some View {
        if viewModel.photo != nil {
            VStack(spacing: ChalkakSpacing.sm) {
                Button { viewModel.photoTapped() } label: {
                    if let previewImage {
                        Image(uiImage: previewImage)
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: .infinity)
                            .background(ChalkakColor.inputBackground)
                    } else {
                        ChalkakSkeleton()
                            .aspectRatio(1.216, contentMode: .fit)
                    }
                }
                .buttonStyle(.plain)
                .disabled(viewModel.isSubmitting)
                .accessibilityIdentifier("upload.photo-preview")
                if isPreparing {
                    ProgressView()
                        .accessibilityIdentifier("upload.preparing-indicator")
                }
            }
        } else {
            ZStack {
                ChalkakColor.inputBackground
                Rectangle()
                    .strokeBorder(ChalkakColor.border, style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                emptyGuide
            }
            .aspectRatio(1.216, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .overlay(alignment: .topTrailing) {
                HStack(spacing: 10) {
                    sourceButton(asset: "ic_photo_library", label: UploadSourceLabel.album, identifier: "upload.album-button") {
                        showsPicker = true
                    }
                    if CameraPicker.isAvailable {
                        sourceButton(asset: "ic_photo_camera", label: UploadSourceLabel.camera, identifier: "upload.camera-button") {
                            cameraTapped()
                        }
                    }
                }
                .padding(.top, 14)
                .padding(.trailing, 11)
            }
        }
    }

    private var isPreparing: Bool {
        switch viewModel.preparation {
        case .issuingPolicy, .encoding: true
        case .none, .ready, .failed: false
        }
    }

    /// 42 원, 흰색 66%, 아이콘 22(원색), 그림자 black 20% r4 y2 (PhotoUploadActionButton).
    private func sourceButton(asset: String, label: String, identifier: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(asset)
                .renderingMode(.original)
                .resizable()
                .scaledToFit()
                .frame(width: 22, height: 22)
                .frame(width: 42, height: 42)
                .background(Color.white.opacity(0.66), in: Circle())
                .shadow(color: .black.opacity(0.2), radius: 4, x: 0, y: 2)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(viewModel.isSubmitting)
        .accessibilityLabel(label)
        .accessibilityIdentifier(identifier)
    }

    // MARK: 제목 · 제출

    private var titleField: some View {
        // 원문 그대로 넘기고 길이 제한·공백 처리는 ViewModel이 한다(D-01). 카운터는 ViewModel 규칙(PostTitle)으로 센다.
        ChalkakTextField(
            text: Binding(get: { viewModel.title }, set: { viewModel.setTitle($0) }),
            label: "사진 설명",
            placeholder: UploadCopy.captionPlaceholder,
            isEnabled: !viewModel.isSubmitting,
            lineLimit: 3...5,
            textFont: ChalkakFont.subheadline,
            counterText: "\(PostTitle.length(of: viewModel.title)) / \(AppConstants.postTitleMax)",
            counterIdentifier: "upload.title-counter"
        )
        .accessibilityIdentifier("upload.title-input")
    }

    private var submitButton: some View {
        VStack(spacing: ChalkakSpacing.sm) {
            if viewModel.isSubmitting {
                ProgressView().accessibilityIdentifier("upload.submitting-indicator")
            }
            ChalkakButton(
                title: viewModel.submitTitle,
                action: { Task { await viewModel.submit() } },
                isEnabled: viewModel.isSubmitEnabled,
                fillsWidth: true
            )
            .accessibilityIdentifier("upload.submit-button")
        }
        .padding(.horizontal, 26)
        .padding(.top, ChalkakSpacing.md)
        .padding(.bottom, 26)
        .background(ChalkakColor.background)
    }

    /// 화면 안 오류: 제출·선택 실패가 우선이고, 없으면 사전 준비 실패.
    private var errorMessage: String? {
        if let notice = viewModel.notice { return notice.message }
        if case .failed(let notice) = viewModel.preparation { return notice.message }
        return nil
    }

    // MARK: 미리보기 · 성공

    private func refreshPreview() async {
        guard let photo = viewModel.photo else {
            previewImage = nil
            return
        }
        let data = await container.photoPipeline.renderPreview(for: photo, edit: viewModel.edit, cropped: true, maxLongEdge: 1200)
        if let data, let image = UIImage(data: data) { previewImage = image }
    }

    private func confirmSuccess() {
        // 업로드한 날짜의 전시로 간다(REQ-UPL-062).
        guard let date = viewModel.confirmSuccess() else { return }
        shell.pop()
        shell.openDisplay(date: date, sort: .recent)
    }

    // MARK: 촬영 저장 권한 안내

    private func cameraTapped() {
        Task {
            // 카메라를 열기 전에 사진 추가 전용 권한을 먼저 요청한다(iOS 흐름).
            if await PhotoLibraryAccess.requestAddAccess() {
                savesCapture = true
                showsCamera = true
            } else {
                showsCameraPermission = true
            }
        }
    }

    @ViewBuilder
    private var permissionDialog: some View {
        if showsCameraPermission {
            ChalkakDialog(identifier: "upload.camera-permission-dialog", title: UploadCopy.permissionTitle, message: "") {
                VStack(spacing: ChalkakSpacing.sm) {
                    ChalkakDialogButton(title: UploadCopy.permissionSettings, identifier: "upload.camera-permission-settings-button") {
                        showsCameraPermission = false
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    }
                    ChalkakDialogButton(title: UploadCopy.permissionShootWithoutSaving, identifier: "upload.camera-permission-shoot-button") {
                        showsCameraPermission = false
                        savesCapture = false
                        showsCamera = true
                    }
                    ChalkakDialogButton(title: EditCopy.cancel, identifier: "upload.camera-permission-cancel-button", style: .secondary) {
                        showsCameraPermission = false
                    }
                }
            }
        }
    }
}

/// 업로드 성공 화면(screen_view `photo_upload_success`). 원본 PhotoUploadSuccessScreen(screens-b.md 5.4):
/// 위 60, 카드(surfaceElevated, 라운드 7, 그림자) → 34 → 제목 title1 → 안내 footnote → 버튼.
private struct UploadSuccessView: View {
    let success: UploadSuccess
    let image: UIImage?
    let caption: String
    let onConfirm: () -> Void

    private var dateLabel: String {
        let date = success.topicDate
        return String(format: "%04d. %02d. %02d", date.year, date.month, date.day)
    }

    private var cardTitle: String {
        let trimmed = caption.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? success.topicTitle : trimmed
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: 0) {
                        Group {
                            if let image {
                                Image(uiImage: image).resizable().scaledToFit()
                            } else {
                                ChalkakSkeleton().aspectRatio(1, contentMode: .fit)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding([.horizontal, .top], ChalkakSpacing.lg)
                        VStack(alignment: .leading, spacing: ChalkakSpacing.sm) {
                            Text(dateLabel)
                                .font(ChalkakFont.caption)
                                .foregroundStyle(ChalkakColor.textMuted)
                            Text(cardTitle)
                                .font(ChalkakFont.photoCardTitle)
                                .foregroundStyle(ChalkakColor.textPrimary)
                        }
                        .padding(.horizontal, ChalkakSpacing.lg)
                        .padding(.top, 27)
                        .padding(.bottom, 36)
                    }
                    .background(ChalkakColor.surfaceElevated, in: RoundedRectangle(cornerRadius: ChalkakRadius.small))
                    .shadow(color: .black.opacity(0.12), radius: 12, x: 0, y: 4)
                    .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                    .padding(.top, 60)

                    Text(success.message)
                        .font(ChalkakFont.title1)
                        .foregroundStyle(ChalkakColor.textPrimary)
                        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                        .padding(.top, 34)
                        .accessibilityIdentifier("upload-success.message")
                    Text(success.statusMessage)
                        .font(ChalkakFont.footnote)
                        .foregroundStyle(ChalkakColor.textSecondary)
                        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                        .padding(.top, 10)
                        .padding(.bottom, 40)
                        .accessibilityIdentifier("upload-success.status-message")
                }
            }
            ChalkakButton(title: UploadCopy.successConfirm, action: onConfirm, fillsWidth: true)
                .accessibilityIdentifier("upload-success.confirm-button")
                .padding(.horizontal, ChalkakSpacing.xl)
                .padding(.bottom, 26)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("upload-success.root")
    }
}
