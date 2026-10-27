import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport
@testable import ChalkakFeatures

private let canvas = SignatureCanvasSize(width: 300, height: 150)

@MainActor
private struct DrawingSUT {
    let viewModel: SignatureDrawingViewModel
    let encoder: FakeSignatureEncoder
    let analytics: RecordingAnalytics

    init(kind: SignatureFlowKind = .onboarding, encoder: FakeSignatureEncoder = FakeSignatureEncoder()) {
        let analytics = RecordingAnalytics()
        self.encoder = encoder
        self.analytics = analytics
        self.viewModel = SignatureDrawingViewModel(kind: kind, canvasSize: canvas, encoder: encoder, screenTracker: ScreenTracker(tracker: analytics))
    }

    /// 획 하나(시작 + 이동 + 끝).
    func drawStroke(from start: Double = 10, to end: Double = 100) {
        viewModel.strokeBegan(at: SignaturePoint(x: start, y: start))
        viewModel.strokeMoved(to: SignaturePoint(x: end, y: end))
        viewModel.strokeEnded()
    }

    func tapDot(at value: Double = 20) {
        viewModel.strokeBegan(at: SignaturePoint(x: value, y: value))
        viewModel.strokeEnded()
    }
}

@MainActor
@Suite("SIGN 그리기 화면 상태", .timeLimit(.minutes(1)))
struct SignatureDrawingViewModelTests {
    @Test("TC-SIGN-001 획이 없으면 이 사인으로 할래요·되돌리기·전체 지우기가 모두 비활성이다")
    func initialDisabled() {
        let sut = DrawingSUT()
        #expect(!sut.viewModel.canConfirm && !sut.viewModel.canUndo && !sut.viewModel.canClear)
        #expect(sut.viewModel.drawing.strokes.isEmpty)
    }

    @Test("TC-SIGN-004 획이 생기면 세 버튼이 모두 활성이다")
    func enabledAfterStroke() {
        let sut = DrawingSUT()
        sut.drawStroke()
        #expect(sut.viewModel.canConfirm && sut.viewModel.canUndo && sut.viewModel.canClear)
    }

    @Test("TC-SIGN-002 점 하나만 찍어도(이동 없이 끝) 확정할 수 있다")
    func dotEnables() {
        let sut = DrawingSUT()
        sut.tapDot()
        #expect(sut.viewModel.canConfirm)
        #expect(sut.viewModel.drawing.strokes.count == 1)
    }

    @Test("TC-SIGN-005 캔버스 밖 좌표는 보정된다")
    func clampsOutOfBounds() {
        let sut = DrawingSUT()
        sut.viewModel.strokeBegan(at: SignaturePoint(x: -50, y: 999))
        #expect(sut.viewModel.drawing.strokes == [SignatureStroke(points: [SignaturePoint(x: 0, y: 150)])])
    }

    @Test("TC-SIGN-006 되돌리기 3회로 마지막 획부터 사라지고 0개가 되면 확정·되돌리기가 비활성이다")
    func undoThreeTimes() {
        let sut = DrawingSUT()
        sut.drawStroke(from: 10, to: 20)
        sut.drawStroke(from: 30, to: 40)
        sut.drawStroke(from: 50, to: 60)
        sut.viewModel.undoTapped()
        #expect(sut.viewModel.drawing.strokes.count == 2)
        #expect(sut.viewModel.drawing.strokes.last?.points.first == SignaturePoint(x: 30, y: 30))
        sut.viewModel.undoTapped()
        sut.viewModel.undoTapped()
        #expect(sut.viewModel.drawing.strokes.isEmpty)
        #expect(!sut.viewModel.canConfirm && !sut.viewModel.canUndo)
    }

    @Test("TC-SIGN-007 전체 지우기 뒤 확정이 비활성이고 이어서 새로 그릴 수 있다")
    func clearThenRedraw() {
        let sut = DrawingSUT()
        sut.drawStroke()
        sut.drawStroke()
        sut.viewModel.clearTapped()
        #expect(sut.viewModel.drawing.strokes.isEmpty && !sut.viewModel.canConfirm && !sut.viewModel.canClear)
        sut.drawStroke()
        #expect(sut.viewModel.canConfirm)
    }

    // MARK: 확정

    @Test("TC-SIGN-009 확정하면 SignatureLayout 계획을 인코더에 넘기고 PNG로 미리보기로 간다")
    func confirmEncodesPlan() async {
        let sut = DrawingSUT(encoder: FakeSignatureEncoder(byteCount: 500))
        sut.drawStroke()
        let expectedPlan = SignatureLayout.plan(for: sut.viewModel.drawing)
        await sut.viewModel.confirmTapped()
        #expect(await sut.encoder.plans == [expectedPlan])
        #expect(sut.viewModel.route == .preview(SignatureDraft(pngData: Data(repeating: 7, count: 500))))
        #expect(sut.viewModel.notice == nil)
    }

    @Test("TC-SIGN-014 인코딩 결과가 정확히 1,048,576바이트이면 허용한다")
    func exactlyMaxBytesAllowed() async {
        let sut = DrawingSUT(encoder: FakeSignatureEncoder(byteCount: AppConstants.signatureMaxBytes))
        sut.drawStroke()
        await sut.viewModel.confirmTapped()
        #expect(sut.viewModel.route != nil)
        #expect(sut.viewModel.notice == nil)
    }

    @Test("TC-SIGN-015 1,048,577바이트이면 미리보기로 가지 않고 '사인 이미지가 1MB를 초과했어요.'를 보이며 그린 내용은 유지된다")
    func oneByteOverMax() async throws {
        let sut = DrawingSUT(encoder: FakeSignatureEncoder(byteCount: AppConstants.signatureMaxBytes + 1))
        sut.drawStroke()
        let before = sut.viewModel.drawing
        await sut.viewModel.confirmTapped()
        #expect(sut.viewModel.route == nil)
        #expect(sut.viewModel.notice?.message == (try copy("sign.error.too-large")))
        #expect(sut.viewModel.drawing == before)
        #expect(sut.viewModel.canConfirm)
        #expect(!sut.viewModel.isEncoding)
    }

    @Test("TC-SIGN-008 확정 연타해도 인코딩 1회, 미리보기 이동 1회이다")
    func rapidConfirm() async {
        let hold = Hold()
        let sut = DrawingSUT(encoder: FakeSignatureEncoder(hold: hold))
        sut.drawStroke()
        let first = Task { await sut.viewModel.confirmTapped() }
        guard await EventWait.signal(sut.encoder.entered, before: first) else { Issue.record("인코딩이 시작돼야 한다"); return }
        #expect(sut.viewModel.isEncoding && !sut.viewModel.canConfirm)
        await sut.viewModel.confirmTapped()
        await sut.viewModel.confirmTapped()
        await hold.open()
        await first.value
        #expect(await sut.encoder.plans.count == 1)
        #expect(sut.viewModel.route != nil)
        await sut.viewModel.confirmTapped()
        #expect(await sut.encoder.plans.count == 1, "이동 대기 중의 재탭도 무시한다")
    }

    @Test("TC-SIGN-008 미리보기로 이동한 뒤(consumeRoute) 획은 유지되고 다시 확정할 수 있다")
    func consumeRouteKeepsDrawing() async {
        let sut = DrawingSUT()
        sut.drawStroke()
        await sut.viewModel.confirmTapped()
        sut.viewModel.consumeRoute()
        #expect(sut.viewModel.route == nil)
        #expect(sut.viewModel.drawing.hasContent)
        #expect(sut.viewModel.canConfirm)
    }

    @Test("TC-SIGN-018 미리보기에서 다시 그리기로 돌아오면(resetForRedraw) 이전 획이 지워진다(임시 정책)")
    func resetForRedraw() async {
        let sut = DrawingSUT()
        sut.drawStroke()
        await sut.viewModel.confirmTapped()
        sut.viewModel.resetForRedraw()
        #expect(sut.viewModel.route == nil)
        #expect(sut.viewModel.drawing.strokes.isEmpty)
        #expect(!sut.viewModel.canConfirm)
    }

    // MARK: 분석

    @Test("REQ-SIGN-012 가입은 onboarding_signature, 변경은 change_signature를 보낸다", arguments: [
        (SignatureFlowKind.onboarding, AnalyticsScreen.onboardingSignature), (SignatureFlowKind.change, AnalyticsScreen.changeSignature),
    ])
    func screenView(kind: SignatureFlowKind, screen: AnalyticsScreen) {
        let sut = DrawingSUT(kind: kind)
        sut.viewModel.onAppear()
        #expect(sut.analytics.events == [.screenView(screen, screenClass: nil)])
    }
}
