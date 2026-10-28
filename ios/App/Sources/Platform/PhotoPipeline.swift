import Foundation
import ChalkakCore
import ChalkakFeatures

/// 업로드·편집 흐름이 기대는 사진 처리 전부를 한 곳에 모은 구현체(ChalkakFeatures의 `PhotoLoading`, `PhotoPreparing`,
/// `PhotoEditPreparing`, `PhotoAutoAdjusting`). 원본 바이트·미리보기 픽셀·임시 WebP 파일을 보관하고,
/// 무거운 계산은 상태를 건드리지 않는 `nonisolated` 정적 함수로 빼서 다른 호출을 막지 않게 한다.
actor PhotoPipeline: PhotoLoading, PhotoPreparing, PhotoEditPreparing, PhotoAutoAdjusting {
    /// 편집기 미리보기 원본의 긴 변(REQ-EDIT-007).
    static let previewLongEdge = 1440
    /// 자동 보정 분석 표본의 긴 변(REQ-EDIT-025).
    static let analysisLongEdge = 256

    private struct Original {
        let data: Data
        let size: PixelSize
    }

    private var originals: [UUID: Original] = [:]
    private var previews: [UUID: RGBAImage] = [:]
    private var files: [UUID: URL] = [:]
    private let encoder: any WebPDataEncoding
    private let directory: URL

    init(encoder: any WebPDataEncoding = WebPEncoders.system(), directory: URL = FileManager.default.temporaryDirectory) {
        self.encoder = encoder
        self.directory = directory
    }

    // MARK: PhotoLoading

    func load(_ data: Data) async throws -> LoadedPhoto {
        try Task.checkCancellation()
        guard let size = Self.verify(data) else { throw PhotoLoadError.unreadable }
        try Task.checkCancellation()
        let photo = LoadedPhoto(id: UUID(), size: size)
        originals[photo.id] = Original(data: data, size: size)
        return photo
    }

    func release(_ photo: LoadedPhoto) async {
        originals[photo.id] = nil
        previews[photo.id] = nil
    }

    /// 크기를 읽을 수 있고 실제로 디코딩되는지 작은 크기로 확인한다.
    private nonisolated static func verify(_ data: Data) -> PixelSize? {
        guard let size = PhotoImageOps.orientedSize(of: data), PhotoImageOps.decodeOriented(data, maxLongEdge: 32) != nil else { return nil }
        return size
    }

    // MARK: PhotoEditPreparing, PhotoAutoAdjusting

    func preparePreview(for photo: LoadedPhoto) async throws {
        if previews[photo.id] != nil { return }
        guard let original = originals[photo.id] else { throw PhotoLoadError.unreadable }
        let preview = await Self.decodePreview(original.data)
        try Task.checkCancellation()
        guard let preview else { throw PhotoLoadError.unreadable }
        previews[photo.id] = preview
    }

    private nonisolated static func decodePreview(_ data: Data) async -> RGBAImage? {
        PhotoImageOps.decodeOriented(data, maxLongEdge: previewLongEdge)
    }

    func analyze(_ photo: LoadedPhoto, quarterTurns: Int, crop: CropWindow) async -> [AdjustmentKind: Double]? {
        guard let base = previews[photo.id] else { return nil }
        return await Self.analyzeSample(base, quarterTurns: quarterTurns, crop: crop)
    }

    private nonisolated static func analyzeSample(_ base: RGBAImage, quarterTurns: Int, crop: CropWindow) async -> [AdjustmentKind: Double]? {
        let edit = PhotoEdit(quarterTurns: quarterTurns, crop: crop)
        guard let sample = PhotoImageOps.render(base, edit: edit, cropped: true, maxLongEdge: analysisLongEdge) else { return nil }
        return PhotoColorPipeline.analyze(sample)
    }

    /// 화면용 미리보기 JPEG. 미리보기 원본이 아직 없으면 nil.
    /// - `cropped`: 자르기 영역까지 자른 결과인가(자르기 탭은 false).
    func renderPreview(for photo: LoadedPhoto, edit: PhotoEdit, cropped: Bool, maxLongEdge: Int) async -> Data? {
        guard let base = previews[photo.id] else { return nil }
        return await Self.renderJPEG(base, edit: edit, cropped: cropped, maxLongEdge: maxLongEdge)
    }

    private nonisolated static func renderJPEG(_ base: RGBAImage, edit: PhotoEdit, cropped: Bool, maxLongEdge: Int) async -> Data? {
        guard !Task.isCancelled,
              let image = PhotoImageOps.render(base, edit: edit, cropped: cropped, maxLongEdge: maxLongEdge) else { return nil }
        return PhotoImageOps.jpegData(from: image, quality: 0.85)
    }

    // MARK: PhotoPreparing

    func prepare(_ photo: LoadedPhoto, edit: PhotoEdit, maxBytes: Int64) async throws -> PreparedImage {
        guard let original = originals[photo.id] else { throw PhotoPrepareError.unsupported }
        let encoder = encoder
        let data = try await Self.encode(original.data, edit: edit, maxBytes: maxBytes, encoder: encoder)
        try Task.checkCancellation()
        let id = UUID()
        let url = directory.appendingPathComponent("chalkak-upload-\(id.uuidString.lowercased()).webp")
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            try? FileManager.default.removeItem(at: url)
            throw error
        }
        // 쓰는 사이 취소됐으면 만든 파일을 지운다.
        if Task.isCancelled {
            try? FileManager.default.removeItem(at: url)
            throw CancellationError()
        }
        files[id] = url
        return PreparedImage(id: id, byteCount: Int64(data.count))
    }

    func contents(of image: PreparedImage) async throws -> Data {
        guard let url = files[image.id] else { throw CocoaError(.fileNoSuchFile) }
        return try Data(contentsOf: url)
    }

    func discard(_ image: PreparedImage) async {
        guard let url = files.removeValue(forKey: image.id) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    /// 디코드(EXIF 방향 반영, 긴 변 4096 이하) → 편집 적용(없으면 그대로) → 품질·크기 사다리 인코딩.
    private nonisolated static func encode(_ data: Data, edit: PhotoEdit, maxBytes: Int64, encoder: any WebPDataEncoding) async throws -> Data {
        guard let decoded = PhotoImageOps.decodeOriented(data, maxLongEdge: AppConstants.postImageMaxLongEdge) else {
            throw PhotoPrepareError.unsupported
        }
        try Task.checkCancellation()
        let edited: RGBAImage
        if edit.isIdentity {
            edited = decoded
        } else {
            guard let rendered = PhotoImageOps.render(decoded, edit: edit, cropped: true, maxLongEdge: nil) else {
                throw PhotoPrepareError.unsupported
            }
            edited = rendered
        }
        try Task.checkCancellation()
        let start = PixelSize(width: edited.width, height: edited.height)
        do {
            let result = try await WebPSizeLadder.encode(startingAt: start, maxBytes: maxBytes, using: WebPLadderCompressor(image: edited, encoder: encoder))
            return result.data
        } catch WebPEncodingError.sizeLimitExceeded {
            throw PhotoPrepareError.sizeLimitExceeded
        }
    }
}
