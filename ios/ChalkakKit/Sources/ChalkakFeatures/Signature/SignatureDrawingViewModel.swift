import Foundation
import Observation
import ChalkakCore

public enum SignatureDrawingRoute: Sendable, Equatable {
    case preview(SignatureDraft)
}

/// 사인 그리기 화면(가입 2단계 / 변경 1단계).
@MainActor
@Observable
public final class SignatureDrawingViewModel {
    public private(set) var drawing: SignatureDrawing
    /// 획이 있어야 켜진다(REQ-SIGN-003).
    public var canUndo: Bool { drawing.hasContent }
    public var canClear: Bool { drawing.hasContent }
    /// 획이 있고, 인코딩 중이 아니고, 미리보기 이동이 대기 중이 아닐 때만 true.
    public var canConfirm: Bool { drawing.hasContent && !isEncoding && route == nil }
    public private(set) var isEncoding = false
    /// PNG가 1 MiB를 넘으면 `sign.error.too-large`. 그리기 내용은 유지한다.
    public private(set) var notice: Notice?
    public private(set) var route: SignatureDrawingRoute?

    private let kind: SignatureFlowKind
    private let encoder: any SignatureImageEncoder
    private let screenTracker: ScreenTracker?
    private var noticeIds = NoticeSequence()

    public init(kind: SignatureFlowKind, canvasSize: SignatureCanvasSize, encoder: any SignatureImageEncoder, screenTracker: ScreenTracker?) {
        self.kind = kind
        self.encoder = encoder
        self.screenTracker = screenTracker
        drawing = SignatureDrawing(canvasSize: canvasSize)
    }

    /// 가입은 `onboarding_signature`, 변경은 `change_signature`.
    public func onAppear() {
        switch kind {
        case .onboarding: screenTracker?.screenAppeared(.onboardingSignature)
        case .change: screenTracker?.screenAppeared(.changeSignature)
        }
    }

    public func strokeBegan(at point: SignaturePoint) { drawing.beginStroke(at: point) }
    public func strokeMoved(to point: SignaturePoint) { drawing.extendStroke(to: point) }
    /// 점은 이미 `strokeBegan`에서 쌓였다. 입력 처리가 끝났다는 신호로만 받는다.
    public func strokeEnded() {}
    public func undoTapped() { drawing.undoLastStroke() }
    public func clearTapped() { drawing.clear() }

    /// "이 사인으로 할래요": `SignatureLayout.plan` → `encoder.encodePNG`. 바이트 수가 `AppConstants.signatureMaxBytes` 이하면(경계 포함)
    /// `route = .preview(draft)`, 초과면 `notice`만 남기고 route 없음. 인코딩 중·route 대기 중의 재탭은 무시한다(연타해도 인코딩 1회, 미리보기 1회).
    public func confirmTapped() async {
        guard canConfirm else { return }
        isEncoding = true
        defer { isEncoding = false }
        let plan = SignatureLayout.plan(for: drawing)
        do {
            let png = try await encoder.encodePNG(plan)
            if png.count > AppConstants.signatureMaxBytes {
                notice = noticeIds.make(SignatureCopy.errorTooLarge)
            } else {
                route = .preview(SignatureDraft(pngData: png))
            }
        } catch {
            // 명세 문구 없음, 임시: 일반 저장 실패 문구를 쓴다. 취소는 무음.
            if !error.isCancellation { notice = noticeIds.make(SignatureCopy.changeErrorGeneric) }
        }
    }

    /// 앱이 미리보기로 이동한 뒤 호출. 획은 그대로 둔다.
    public func consumeRoute() { route = nil }

    /// 미리보기의 "다시 그리기"로 돌아왔을 때: 획과 route를 모두 지운다(확인 필요 2의 임시 정책).
    public func resetForRedraw() {
        drawing.clear()
        route = nil
    }

    public func dismissNotice() { notice = nil }
}
