import SwiftUI
import UIKit
import ChalkakCore
import ChalkakFeatures

/// 편집기 덮개의 내용. ViewModel은 덮개가 처음 만들어질 때 한 번 만든다(요청 하나당 하나).
struct PhotoEditHost: View {
    let container: AppContainer
    let request: UploadViewModel.EditorRequest
    let onClosed: (PhotoEditViewModel.Outcome) -> Void
    @State private var viewModel: PhotoEditViewModel

    init(container: AppContainer, request: UploadViewModel.EditorRequest, onClosed: @escaping (PhotoEditViewModel.Outcome) -> Void) {
        self.container = container
        self.request = request
        self.onClosed = onClosed
        _viewModel = State(initialValue: container.makePhotoEditViewModel(request: request))
    }

    var body: some View {
        PhotoEditScreen(viewModel: viewModel, pipeline: container.photoPipeline, onClosed: onClosed)
    }
}

/// 미리보기를 다시 그릴 조건. 자르기 탭은 돌린 전체를, 다른 탭은 자른 결과를 보인다.
private struct RenderKey: Equatable {
    let isReady: Bool
    let edit: PhotoEdit
    let cropped: Bool
}

/// 사진 편집기(전체 화면). 상단 취소/완료, 미리보기, 탭별 도구, 하단 탭 자르기·조정·필터.
struct PhotoEditScreen: View {
    let viewModel: PhotoEditViewModel
    let pipeline: PhotoPipeline
    let onClosed: (PhotoEditViewModel.Outcome) -> Void

    @State private var isReady = false
    @State private var previewImage: UIImage?
    @State private var isFinishing = false

    private var renderKey: RenderKey {
        let cropped = viewModel.tab != .crop
        var edit = viewModel.currentEdit
        if !cropped { edit.crop = .full }
        return RenderKey(isReady: isReady, edit: edit, cropped: cropped)
    }

    var body: some View {
        let key = renderKey
        VStack(spacing: 0) {
            topBar
            preview
            tools
            tabBar
        }
        .background(ChalkakColor.background.ignoresSafeArea())
        .overlay { errorDialog }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("photo-edit.root")
        .task { await start() }
        .task(id: key) {
            guard key.isReady else { return }
            let data = await pipeline.renderPreview(for: viewModel.photo, edit: key.edit, cropped: key.cropped, maxLongEdge: 1100)
            if let data, let image = UIImage(data: data) { previewImage = image }
        }
        .onChange(of: viewModel.outcome) { _, outcome in
            guard let outcome else { return }
            onClosed(outcome)
        }
    }

    private func start() async {
        await viewModel.start()
        isReady = viewModel.errorNotice == nil
    }

    // MARK: 상단 · 하단

    private var topBar: some View {
        HStack {
            Button(EditCopy.cancel) { viewModel.cancel() }
                .font(ChalkakFont.body)
                .foregroundStyle(ChalkakColor.textPrimary)
                .frame(minWidth: 44, minHeight: 44)
                .accessibilityIdentifier("photo-edit.cancel-button")
            Spacer()
            if isFinishing {
                ProgressView().accessibilityIdentifier("photo-edit.rendering-indicator")
            }
            Spacer()
            Button(EditCopy.done) {
                guard !isFinishing else { return }
                isFinishing = true
                Task {
                    await viewModel.done()
                    isFinishing = false
                }
            }
            .font(ChalkakFont.headline)
            .foregroundStyle(ChalkakColor.accent)
            .frame(minWidth: 44, minHeight: 44)
            .disabled(!isReady)
            .accessibilityIdentifier("photo-edit.done-button")
        }
        .padding(.horizontal, ChalkakSpacing.lg)
        .frame(height: 52)
    }

    private var tabBar: some View {
        HStack(spacing: 0) {
            tabButton(.crop, title: EditCopy.tabCrop, identifier: "photo-edit.tab-crop")
            tabButton(.adjust, title: EditCopy.tabAdjust, identifier: "photo-edit.tab-adjust")
            tabButton(.filter, title: EditCopy.tabFilter, identifier: "photo-edit.tab-filter")
        }
        .background(ChalkakColor.surfaceElevated.ignoresSafeArea(edges: .bottom))
    }

    private func tabButton(_ tab: PhotoEditTab, title: String, identifier: String) -> some View {
        let isSelected = viewModel.tab == tab
        return Button { Task { await viewModel.selectTab(tab) } } label: {
            Text(title)
                .font(isSelected ? ChalkakFont.headline : ChalkakFont.body)
                .foregroundStyle(isSelected ? ChalkakColor.textPrimary : ChalkakColor.bottomBarInactive)
                .frame(maxWidth: .infinity, minHeight: 48)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier(identifier)
    }

    // MARK: 미리보기

    private var preview: some View {
        GeometryReader { proxy in
            ZStack {
                if let previewImage {
                    let shown = fittedSize(for: previewImage.size, in: proxy.size)
                    ZStack {
                        Image(uiImage: previewImage)
                            .resizable()
                            .frame(width: shown.width, height: shown.height)
                            .accessibilityIdentifier("photo-edit.preview-image")
                        if viewModel.tab == .crop {
                            CropOverlay(viewModel: viewModel, displaySize: shown)
                        }
                    }
                    .frame(width: shown.width, height: shown.height)
                } else {
                    ProgressView()
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .padding(ChalkakSpacing.lg)
        .frame(maxHeight: .infinity)
    }

    private func fittedSize(for image: CGSize, in container: CGSize) -> CGSize {
        guard image.width > 0, image.height > 0, container.width > 0, container.height > 0 else { return .zero }
        let scale = min(container.width / image.width, container.height / image.height)
        return CGSize(width: image.width * scale, height: image.height * scale)
    }

    // MARK: 도구

    @ViewBuilder
    private var tools: some View {
        Group {
            switch viewModel.tab {
            case .crop: cropTools
            case .adjust: adjustTools
            case .filter: filterTools
            }
        }
        .frame(height: 150)
        .frame(maxWidth: .infinity)
        .background(ChalkakColor.surfaceElevated)
    }

    private var cropTools: some View {
        VStack(spacing: ChalkakSpacing.sm) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: ChalkakSpacing.sm) {
                    ForEach(CropAspect.allCases, id: \.self) { aspect in
                        chip(
                            title: EditCopy.label(for: aspect), isSelected: viewModel.aspect == aspect,
                            identifier: "photo-edit.ratio-" + aspect.copyKey.replacingOccurrences(of: "edit.ratio.", with: "")
                        ) { viewModel.selectAspect(aspect) }
                    }
                }
                .padding(.horizontal, ChalkakSpacing.lg)
            }
            HStack(spacing: ChalkakSpacing.lg) {
                textButton(EditCopy.rotate, systemName: "rotate.right", identifier: "photo-edit.rotate-button") { viewModel.rotate() }
                textButton(EditCopy.cropReset, systemName: "arrow.counterclockwise", identifier: "photo-edit.reset-button") { viewModel.resetCrop() }
            }
        }
        .padding(.vertical, ChalkakSpacing.md)
    }

    private var adjustTools: some View {
        VStack(spacing: ChalkakSpacing.sm) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: ChalkakSpacing.sm) {
                    ForEach(AdjustmentItem.ordered, id: \.self) { item in
                        chip(
                            title: EditCopy.label(for: item), isSelected: viewModel.adjustmentItem == item,
                            identifier: item == .auto ? "photo-edit.adjust-item-auto" : "photo-edit.adjust-item-" + Self.slug(for: item)
                        ) { Task { await viewModel.selectAdjustmentItem(item) } }
                    }
                }
                .padding(.horizontal, ChalkakSpacing.lg)
            }
            adjustSlider
                .padding(.horizontal, ChalkakSpacing.lg)
            textButton(EditCopy.adjustReset, systemName: "arrow.counterclockwise", identifier: "photo-edit.reset-button") { viewModel.resetAdjustments() }
        }
        .padding(.vertical, ChalkakSpacing.md)
    }

    @ViewBuilder
    private var adjustSlider: some View {
        switch viewModel.adjustmentItem {
        case .auto:
            HStack(spacing: ChalkakSpacing.md) {
                Toggle(EditCopy.label(for: AdjustmentItem.auto), isOn: Binding(
                    get: { viewModel.adjustments.autoStrength > 0 },
                    // "자동"이 선택된 상태에서 다시 누르면 켜짐/꺼짐이 번갈아 바뀐다(REQ-EDIT-021).
                    set: { _ in Task { await viewModel.selectAdjustmentItem(.auto) } }
                ))
                .labelsHidden()
                .accessibilityIdentifier("photo-edit.adjust-auto-toggle")
                Slider(value: Binding(
                    get: { viewModel.adjustments.autoStrength },
                    set: { viewModel.setAutoStrength(($0 * 100).rounded() / 100) }
                ), in: 0...1)
                .accessibilityIdentifier("photo-edit.adjust-auto-strength-slider")
            }
        case .value(let kind):
            HStack(spacing: ChalkakSpacing.md) {
                Slider(value: Binding(
                    get: { viewModel.adjustments.value(of: kind) },
                    set: { viewModel.setAdjustment(kind, to: ($0 * 100).rounded() / 100) }
                ), in: AdjustmentLayers.range)
                .accessibilityIdentifier("photo-edit.adjust-" + Self.slug(for: .value(kind)) + "-slider")
                Text("\(Int((viewModel.adjustments.value(of: kind) * 100).rounded()))")
                    .font(ChalkakFont.footnote)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .frame(width: 44, alignment: .trailing)
            }
        }
    }

    private var filterTools: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: ChalkakSpacing.md) {
                ForEach(PhotoFilter.allCases, id: \.self) { filter in
                    FilterThumbnail(
                        viewModel: viewModel, pipeline: pipeline, filter: filter, isReady: isReady,
                        isSelected: viewModel.filter == filter
                    )
                }
            }
            .padding(.horizontal, ChalkakSpacing.lg)
            .padding(.vertical, ChalkakSpacing.md)
        }
    }

    private static func slug(for item: AdjustmentItem) -> String {
        switch item {
        case .auto: "auto"
        case .value(.exposure): "exposure"
        case .value(.contrast): "contrast"
        case .value(.highlights): "highlights"
        case .value(.shadows): "shadows"
        case .value(.blackPoint): "black-point"
        case .value(.saturation): "saturation"
        case .value(.warmth): "warmth"
        }
    }

    private func chip(title: String, isSelected: Bool, identifier: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(ChalkakFont.subheadline)
                .foregroundStyle(isSelected ? ChalkakColor.onActionPrimary : ChalkakColor.textPrimary)
                .padding(.horizontal, ChalkakSpacing.md)
                .frame(minHeight: 36)
                .background(isSelected ? ChalkakColor.actionPrimary : ChalkakColor.calendarCell, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier(identifier)
    }

    private func textButton(_ title: String, systemName: String, identifier: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemName)
                .font(ChalkakFont.subheadline)
                .foregroundStyle(ChalkakColor.textPrimary)
                .frame(minHeight: 36)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
    }

    // MARK: 오류

    @ViewBuilder
    private var errorDialog: some View {
        if let notice = viewModel.errorNotice {
            ChalkakDialog(identifier: "photo-edit.error-dialog", title: nil, message: notice.message) {
                VStack(spacing: ChalkakSpacing.sm) {
                    ChalkakDialogButton(title: UploadCopy.topicRetry, identifier: "photo-edit.error-retry-button") {
                        Task { await start() }
                    }
                    ChalkakDialogButton(title: EditCopy.cancel, identifier: "photo-edit.error-cancel-button") {
                        viewModel.cancel()
                    }
                }
            }
        }
    }
}

/// 필터 하나의 썸네일(현재 자르기·조정을 적용한 작은 미리보기)과 이름.
private struct FilterThumbnail: View {
    let viewModel: PhotoEditViewModel
    let pipeline: PhotoPipeline
    let filter: PhotoFilter
    let isReady: Bool
    let isSelected: Bool
    @State private var image: UIImage?

    private struct Key: Equatable {
        let isReady: Bool
        let edit: PhotoEdit
    }

    /// 이 필터를 적용한 현재 편집값.
    private var filteredEdit: PhotoEdit {
        var edit = viewModel.currentEdit
        edit.filter = filter
        return edit
    }

    var body: some View {
        let key = Key(isReady: isReady, edit: filteredEdit)
        Button { viewModel.selectFilter(filter) } label: {
            VStack(spacing: ChalkakSpacing.xs) {
                ZStack {
                    ChalkakColor.calendarCell
                    if let image {
                        Image(uiImage: image).resizable().scaledToFill()
                    }
                }
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.small))
                .overlay(
                    RoundedRectangle(cornerRadius: ChalkakRadius.small)
                        .stroke(isSelected ? ChalkakColor.accent : Color.clear, lineWidth: 2)
                )
                Text(EditCopy.label(for: filter))
                    .font(ChalkakFont.caption)
                    .foregroundStyle(isSelected ? ChalkakColor.textPrimary : ChalkakColor.textSecondary)
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("photo-edit.filter-" + filter.rawValue)
        .task(id: key) {
            guard key.isReady else { return }
            let data = await pipeline.renderPreview(for: viewModel.photo, edit: key.edit, cropped: true, maxLongEdge: 160)
            if let data, let thumbnail = UIImage(data: data) { image = thumbnail }
        }
    }
}

/// 자르기 프레임: 바깥을 어둡게, 3x3 격자, 안쪽을 끌어 옮기고 모서리를 끌어 크기를 바꾼다.
private struct CropOverlay: View {
    let viewModel: PhotoEditViewModel
    let displaySize: CGSize
    @State private var lastTranslation: CGSize = .zero

    private let space = "crop-image"
    private let handleSize: CGFloat = 28

    var body: some View {
        let frame = viewModel.frame
        let width = displaySize.width, height = displaySize.height
        let rect = CGRect(
            x: (frame.centerX - frame.width / 2) * width, y: (frame.centerY - frame.height / 2) * height,
            width: frame.width * width, height: frame.height * height
        )
        ZStack(alignment: .topLeading) {
            Path { path in
                path.addRect(CGRect(origin: .zero, size: displaySize))
                path.addRect(rect)
            }
            .fill(Color.black.opacity(0.5), style: FillStyle(eoFill: true))
            .allowsHitTesting(false)

            Rectangle()
                .stroke(Color.white, lineWidth: 1.5)
                .frame(width: rect.width, height: rect.height)
                .offset(x: rect.minX, y: rect.minY)
                .allowsHitTesting(false)
            grid(in: rect)
                .allowsHitTesting(false)

            Color.clear
                .contentShape(Rectangle())
                .frame(width: rect.width, height: rect.height)
                .offset(x: rect.minX, y: rect.minY)
                .gesture(
                    DragGesture(minimumDistance: 0, coordinateSpace: .named(space))
                        .onChanged { value in
                            let dx = value.translation.width - lastTranslation.width
                            let dy = value.translation.height - lastTranslation.height
                            lastTranslation = value.translation
                            viewModel.moveCrop(byX: dx / width, y: dy / height)
                        }
                        .onEnded { _ in lastTranslation = .zero }
                )
                .accessibilityIdentifier("photo-edit.crop-area")

            ForEach(CropHandle.allCases, id: \.self) { handle in
                let point = position(of: handle, in: rect)
                Circle()
                    .fill(Color.white)
                    .frame(width: 14, height: 14)
                    .frame(width: handleSize, height: handleSize)
                    .contentShape(Rectangle())
                    .position(point)
                    .gesture(
                        DragGesture(minimumDistance: 0, coordinateSpace: .named(space))
                            .onChanged { value in
                                viewModel.resizeCrop(handle: handle, to: EditPoint(x: value.location.x / width, y: value.location.y / height))
                            }
                    )
            }
        }
        .frame(width: width, height: height, alignment: .topLeading)
        .coordinateSpace(name: space)
    }

    private func position(of handle: CropHandle, in rect: CGRect) -> CGPoint {
        switch handle {
        case .topLeft: CGPoint(x: rect.minX, y: rect.minY)
        case .topRight: CGPoint(x: rect.maxX, y: rect.minY)
        case .bottomLeft: CGPoint(x: rect.minX, y: rect.maxY)
        case .bottomRight: CGPoint(x: rect.maxX, y: rect.maxY)
        }
    }

    private func grid(in rect: CGRect) -> some View {
        Path { path in
            for step in 1...2 {
                let x = rect.minX + rect.width * CGFloat(step) / 3
                path.move(to: CGPoint(x: x, y: rect.minY))
                path.addLine(to: CGPoint(x: x, y: rect.maxY))
                let y = rect.minY + rect.height * CGFloat(step) / 3
                path.move(to: CGPoint(x: rect.minX, y: y))
                path.addLine(to: CGPoint(x: rect.maxX, y: y))
            }
        }
        .stroke(Color.white.opacity(0.6), lineWidth: 0.5)
    }
}
