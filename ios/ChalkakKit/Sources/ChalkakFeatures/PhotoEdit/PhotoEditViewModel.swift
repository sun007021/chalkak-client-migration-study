import Foundation
import Observation
import ChalkakCore

/// 편집기가 미리보기 원본을 준비한다(긴 변 1440 이내 등은 App 몫). 실패는 오류.
public protocol PhotoEditPreparing: Sendable {
    func preparePreview(for photo: LoadedPhoto) async throws
}

/// 자동 보정 분석(자른 영역을 긴 변 256으로 줄여 분석, REQ-EDIT-025). 분석할 수 없으면 nil — 자동 보정은 아무것도 바꾸지 않는다(REQ-EDIT-027).
public protocol PhotoAutoAdjusting: Sendable {
    func analyze(_ photo: LoadedPhoto, quarterTurns: Int, crop: CropWindow) async -> [AdjustmentKind: Double]?
}

/// 사진 편집기. 편집값만 만들고 픽셀은 그리지 않는다(REQ-EDIT-002). 상단 취소/완료, 탭 자르기·조정·필터.
///
/// - 처음: 탭 `.crop`, 비율 `.free`, 전체 프레임, 필터 `.original`, 조정 항목 `.auto`(강도 0).
/// - `start()`는 여러 번 불러도 미리보기 준비·자동 보정 분석을 한 번만 한다. 재편집 값에 이미 분석값이 있으면 재분석하지 않는다.
/// - 자동 보정은 편집기를 처음 열 때, 자르기를 바꾼 뒤 탭을 옮길 때, 자동 보정을 켠 채 완료할 때 분석한다. 같은 자르기면 다시 하지 않는다.
/// - `done()`: 자르기가 전체와 1e-3 이내면 전체로, 자동 보정이 꺼져 있으면 분석값은 버린 `PhotoEdit`을 `.completed`로 낸다.
/// - 자르기 "초기화"는 회전·프레임·비율만, 조정 "초기화"는 `AdjustmentLayers.cleared()`로 조정만 되돌린다(REQ-EDIT-016, 024).
@MainActor
@Observable
public final class PhotoEditViewModel {
    public enum Outcome: Sendable, Equatable {
        case completed(PhotoEdit)
        case cancelled
    }

    public let photo: LoadedPhoto
    /// true면 방금 고른 사진의 첫 편집.
    public let isFirstSelection: Bool

    public private(set) var tab: PhotoEditTab = .crop
    public private(set) var aspect: CropAspect = .free
    public private(set) var quarterTurns = 0
    /// 돌린 사진 기준 프레임.
    public private(set) var frame: CropFrame = .full
    public private(set) var filter: PhotoFilter = .original
    public private(set) var adjustmentItem: AdjustmentItem = .auto
    public private(set) var adjustments = AdjustmentLayers()
    /// 닫혔을 때의 결과. nil이면 아직 열려 있다.
    public private(set) var outcome: Outcome?
    public private(set) var errorNotice: Notice?

    /// 지금 값으로 만든 편집값(정규화 전). 테스트·미리보기용.
    public var currentEdit: PhotoEdit {
        PhotoEdit(quarterTurns: quarterTurns, crop: currentWindow, filter: filter, adjustments: adjustments)
    }

    /// 분석한 자르기(회전 + 영역). 같은 값이면 다시 분석하지 않는다.
    private struct AnalysisKey: Equatable {
        let quarterTurns: Int
        let crop: CropWindow
    }

    private var currentWindow: CropWindow { PhotoEditGeometry.cropWindow(from: frame, quarterTurns: quarterTurns) }
    private var rotatedSize: PixelSize { PhotoEditGeometry.rotatedSize(of: photo.size, quarterTurns: quarterTurns) }
    /// 고정 비율(가로/세로 픽셀). 원본은 지금 회전 방향의 사진 비율, 자유는 nil.
    private var fixedRatio: Double? {
        aspect == .original ? Double(rotatedSize.width) / Double(rotatedSize.height) : aspect.ratio
    }

    private var isPrepared = false
    private var isStarting = false
    private var analyzedKey: AnalysisKey?
    private let preparer: any PhotoEditPreparing
    private let autoAdjuster: any PhotoAutoAdjusting

    public init(photo: LoadedPhoto, initialEdit: PhotoEdit = .identity, isFirstSelection: Bool, preparer: any PhotoEditPreparing, autoAdjuster: any PhotoAutoAdjusting) {
        self.photo = photo
        self.isFirstSelection = isFirstSelection
        self.preparer = preparer
        self.autoAdjuster = autoAdjuster
        quarterTurns = ((initialEdit.quarterTurns % 4) + 4) % 4
        frame = PhotoEditGeometry.cropFrame(from: initialEdit.crop, quarterTurns: quarterTurns)
        filter = initialEdit.filter
        adjustments = initialEdit.adjustments
        // 저장된 분석값이 있으면 같은 자르기로는 다시 분석하지 않는다.
        if !initialEdit.adjustments.autoValues.isEmpty {
            analyzedKey = AnalysisKey(quarterTurns: quarterTurns, crop: initialEdit.crop)
        }
    }

    /// 미리보기 준비 + (필요하면) 자동 보정 분석. 준비가 실패하면 닫지 않고 `errorNotice`(edit.error.render)를 낸다. 다시 부르면 재시도한다.
    public func start() async {
        guard outcome == nil, !isPrepared, !isStarting else { return }
        isStarting = true
        defer { isStarting = false }
        errorNotice = nil
        do {
            try await preparer.preparePreview(for: photo)
        } catch {
            if !error.isCancellation { errorNotice = notices.make(EditCopy.renderError) }
            return
        }
        guard outcome == nil else { return }
        isPrepared = true
        await refreshAutoAdjustments()
    }

    public func selectTab(_ tab: PhotoEditTab) async {
        self.tab = tab
        await refreshAutoAdjustments()
    }

    /// 비율 선택: 고정 비율이면 사진 안에서 가장 크게 들어가는 프레임으로 새로 시작, `.original`은 지금 회전 방향의 사진 비율로 고정, `.free`는 프레임 유지 + 고정 해제.
    public func selectAspect(_ aspect: CropAspect) {
        self.aspect = aspect
        if aspect == .free { return }
        refit()
    }

    /// 시계 방향 90도. 고정 비율이면 같은 비율로 다시 가장 크게 맞춘다(원본 비율은 새 회전 방향의 사진 비율). 영역이 전체인 자유는 전체로.
    public func rotate() {
        let before = frame
        quarterTurns = (quarterTurns + 1) % 4
        if aspect.ratio != nil {
            // 4:5 같은 고정 비율은 같은 비율로 다시 가장 크게 맞춘다.
            refit()
        } else {
            // 자유·원본은 영역이 사진과 함께 돈다(REQ-EDIT-015): (cx, cy, w, h) -> (1 - cy, cx, h, w).
            frame = CropFrame(centerX: 1 - before.centerY, centerY: before.centerX, width: before.height, height: before.width)
        }
    }

    public func moveCrop(byX dx: Double, y dy: Double) {
        guard outcome == nil else { return }
        frame = CropGeometry.moved(frame, byX: dx, y: dy)
    }
    public func resizeCrop(handle: CropHandle, to point: EditPoint) {
        guard outcome == nil else { return }
        frame = CropGeometry.resized(frame, handle: handle, to: point, aspect: fixedRatio, in: rotatedSize)
    }

    /// 자르기 탭 "초기화": 회전 0, 전체 프레임, 비율 `.free`. 필터·조정은 유지.
    public func resetCrop() {
        quarterTurns = 0
        frame = .full
        aspect = .free
    }

    public func selectFilter(_ filter: PhotoFilter) {
        self.filter = filter
    }

    /// 다른 항목에서 "자동"으로 옮겨 오면 꺼져 있을 때만 강도 1로 켠다. 이미 "자동"이면 다시 눌러 켜짐(1)/꺼짐(0)을 번갈아 바꾼다(REQ-EDIT-021).
    public func selectAdjustmentItem(_ item: AdjustmentItem) async {
        if item == .auto {
            if adjustmentItem == .auto {
                adjustments = adjustments.settingAutoStrength(adjustments.autoStrength > 0 ? 0 : 1)
            } else if adjustments.autoStrength == 0 {
                adjustments = adjustments.settingAutoStrength(1)
            }
        }
        adjustmentItem = item
        if item == .auto, adjustments.autoStrength > 0 { await refreshAutoAdjustments() }
    }
    public func setAdjustment(_ kind: AdjustmentKind, to value: Double) {
        adjustments = adjustments.setting(kind, to: value)
    }
    public func setAutoStrength(_ strength: Double) {
        adjustments = adjustments.settingAutoStrength(strength)
    }

    /// 조정 탭 "초기화".
    public func resetAdjustments() {
        adjustments = adjustments.cleared()
    }

    /// "완료": 정규화한 편집값으로 `.completed`. 이미 닫혔으면 무시.
    public func done() async {
        guard outcome == nil else { return }
        if adjustments.autoStrength > 0 { await refreshAutoAdjustments() }
        guard outcome == nil else { return }
        var edit = currentEdit
        if edit.crop.isFull() { edit.crop = .full }
        if edit.adjustments.autoStrength == 0 {
            edit.adjustments = AdjustmentLayers(userValues: edit.adjustments.userValues)
        }
        outcome = .completed(edit)
    }

    /// "취소": 변경을 버리고 `.cancelled`. 이미 닫혔으면 무시.
    public func cancel() {
        guard outcome == nil else { return }
        outcome = .cancelled
    }

    // MARK: 내부

    private var notices = NoticeSequence()

    /// 고정 비율(또는 전체 상태)에 맞춰 프레임을 사진 안에서 가장 크게 다시 잡는다.
    private func refit() {
        if let ratio = fixedRatio {
            frame = aspect == .original ? .full : CropGeometry.largestFrame(aspect: ratio, in: rotatedSize)
        } else {
            frame = .full
        }
    }

    /// 자른 영역이 마지막 분석과 다르면 다시 분석한다. 분석할 수 없으면(nil) 값을 바꾸지 않는다.
    private func refreshAutoAdjustments() async {
        guard isPrepared, outcome == nil else { return }
        let key = AnalysisKey(quarterTurns: quarterTurns, crop: currentWindow)
        guard key != analyzedKey else { return }
        let values = await autoAdjuster.analyze(photo, quarterTurns: key.quarterTurns, crop: key.crop)
        guard outcome == nil, !Task.isCancelled else { return }
        analyzedKey = key
        if let values { adjustments.autoValues = values }
    }
}
