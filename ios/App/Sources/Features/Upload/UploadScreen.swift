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

    private var shell: MainShellViewModel { session.shell }

    private var isPresentingModal: Bool {
        showsPicker || showsCamera || viewModel.editor != nil
    }

    var body: some View {
        let previewKey = PreviewKey(photoID: viewModel.photo?.id, edit: viewModel.edit)
        VStack(spacing: 0) {
            if let success = viewModel.success {
                UploadSuccessView(success: success, image: previewImage) { confirmSuccess() }
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
                onBack: { shell.pop() }
            )
            ScrollView {
                VStack(alignment: .leading, spacing: ChalkakSpacing.lg) {
                    heading
                    photoArea
                    titleField
                    if let message = errorMessage {
                        Text(message)
                            .font(ChalkakFont.footnote)
                            .foregroundStyle(ChalkakColor.error)
                            .accessibilityIdentifier("upload.error-message")
                    }
                }
                .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                .padding(.vertical, ChalkakSpacing.lg)
            }
            .scrollDismissesKeyboard(.interactively)
            submitButton
        }
    }

    @ViewBuilder
    private var heading: some View {
        switch viewModel.topic {
        case .loading:
            ProgressView().frame(maxWidth: .infinity)
        case .loaded(let topic):
            VStack(alignment: .leading, spacing: ChalkakSpacing.xs) {
                Text(UploadCopy.heading(topicTitle: topic.title))
                    .font(ChalkakFont.headlineBold)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .accessibilityIdentifier("upload.topic-title")
                Text(UploadCopy.subheading)
                    .font(ChalkakFont.subheadline)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .accessibilityIdentifier("upload.guide-text")
            }
        case .failed(let notice):
            VStack(alignment: .leading, spacing: ChalkakSpacing.sm) {
                Text(notice.message)
                    .font(ChalkakFont.callout)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .accessibilityIdentifier("upload.topic-error")
                Button { Task { await viewModel.retryTopic() } } label: {
                    Text(UploadCopy.topicRetry)
                        .font(ChalkakFont.callout)
                        .foregroundStyle(ChalkakColor.accent)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("upload.topic-retry-button")
            }
        }
    }

    // MARK: 사진 영역

    @ViewBuilder
    private var photoArea: some View {
        if viewModel.photo != nil {
            VStack(spacing: ChalkakSpacing.sm) {
                Button { viewModel.photoTapped() } label: {
                    if let previewImage {
                        Image(uiImage: previewImage)
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: .infinity, maxHeight: 420)
                            .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.card))
                    } else {
                        ZStack {
                            RoundedRectangle(cornerRadius: ChalkakRadius.card).fill(ChalkakColor.calendarCell)
                            ProgressView()
                        }
                        .aspectRatio(1, contentMode: .fit)
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
            HStack(spacing: ChalkakSpacing.lg) {
                sourceButton(systemName: "photo.on.rectangle", label: UploadSourceLabel.album, identifier: "upload.album-button") {
                    showsPicker = true
                }
                if CameraPicker.isAvailable {
                    sourceButton(systemName: "camera", label: UploadSourceLabel.camera, identifier: "upload.camera-button") {
                        cameraTapped()
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, ChalkakSpacing.xl)
            .background(ChalkakColor.calendarCell, in: RoundedRectangle(cornerRadius: ChalkakRadius.card))
        }
    }

    private var isPreparing: Bool {
        switch viewModel.preparation {
        case .issuingPolicy, .encoding: true
        case .none, .ready, .failed: false
        }
    }

    private func sourceButton(systemName: String, label: String, identifier: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 28, weight: .regular))
                .foregroundStyle(ChalkakColor.iconPrimary)
                .frame(width: 88, height: 88)
                .background(ChalkakColor.surfaceElevated, in: RoundedRectangle(cornerRadius: ChalkakRadius.card))
        }
        .buttonStyle(.plain)
        .disabled(viewModel.isSubmitting)
        .accessibilityLabel(label)
        .accessibilityIdentifier(identifier)
    }

    // MARK: 제목 · 제출

    private var titleField: some View {
        VStack(alignment: .trailing, spacing: ChalkakSpacing.xs) {
            TextField(
                UploadCopy.captionPlaceholder,
                // 원문 그대로 넘기고 길이 제한·공백 처리는 ViewModel이 한다(D-01).
                text: Binding(get: { viewModel.title }, set: { viewModel.setTitle($0) }),
                axis: .vertical
            )
            .font(ChalkakFont.body)
            .foregroundStyle(ChalkakColor.textPrimary)
            .lineLimit(1...3)
            .disabled(viewModel.isSubmitting)
            .padding(ChalkakSpacing.md)
            .background(ChalkakColor.inputBackground, in: RoundedRectangle(cornerRadius: ChalkakRadius.small))
            .overlay(RoundedRectangle(cornerRadius: ChalkakRadius.small).stroke(ChalkakColor.border))
            .accessibilityIdentifier("upload.title-input")
            Text("\(PostTitle.length(of: viewModel.title))/\(AppConstants.postTitleMax)")
                .font(ChalkakFont.caption)
                .foregroundStyle(ChalkakColor.textSecondary)
                .accessibilityIdentifier("upload.title-counter")
        }
    }

    private var submitButton: some View {
        VStack(spacing: ChalkakSpacing.sm) {
            if viewModel.isSubmitting {
                ProgressView().accessibilityIdentifier("upload.submitting-indicator")
            }
            Button { Task { await viewModel.submit() } } label: {
                Text(viewModel.submitTitle)
                    .font(ChalkakFont.headline)
                    .foregroundStyle(ChalkakColor.onActionPrimary)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(
                        ChalkakColor.actionPrimary.opacity(viewModel.isSubmitEnabled ? 1 : 0.3),
                        in: RoundedRectangle(cornerRadius: ChalkakRadius.button)
                    )
            }
            .buttonStyle(.plain)
            .disabled(!viewModel.isSubmitEnabled)
            .accessibilityIdentifier("upload.submit-button")
        }
        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
        .padding(.vertical, ChalkakSpacing.md)
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
                    ChalkakDialogButton(title: EditCopy.cancel, identifier: "upload.camera-permission-cancel-button") {
                        showsCameraPermission = false
                    }
                }
            }
        }
    }
}

/// 업로드 성공 화면(screen_view `photo_upload_success`).
private struct UploadSuccessView: View {
    let success: UploadSuccess
    let image: UIImage?
    let onConfirm: () -> Void

    var body: some View {
        VStack(spacing: ChalkakSpacing.xl) {
            Spacer(minLength: 0)
            Group {
                if let image {
                    Image(uiImage: image).resizable().scaledToFit()
                } else {
                    ChalkakColor.calendarCell.aspectRatio(1, contentMode: .fit)
                }
            }
            .frame(maxHeight: 360)
            .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.card))
            VStack(spacing: ChalkakSpacing.sm) {
                Text(success.message)
                    .font(ChalkakFont.headlineBold)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier("upload-success.message")
                Text(success.statusMessage)
                    .font(ChalkakFont.subheadline)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier("upload-success.status-message")
            }
            Spacer(minLength: 0)
            Button(action: onConfirm) {
                Text(UploadCopy.successConfirm)
                    .font(ChalkakFont.headline)
                    .foregroundStyle(ChalkakColor.onActionPrimary)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(ChalkakColor.actionPrimary, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("upload-success.confirm-button")
        }
        .padding(.horizontal, ChalkakSpacing.screenHorizontal)
        .padding(.vertical, ChalkakSpacing.xl)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("upload-success.root")
    }
}
