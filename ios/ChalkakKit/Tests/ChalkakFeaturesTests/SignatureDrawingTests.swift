import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport
@testable import ChalkakFeatures

private func point(_ x: Double, _ y: Double) -> SignaturePoint { SignaturePoint(x: x, y: y) }

private let padSize = SignatureCanvasSize(width: 300, height: 150)

private func drawing(_ strokes: [[SignaturePoint]]) -> SignatureDrawing {
    SignatureDrawing(canvasSize: padSize, strokes: strokes.map { SignatureStroke(points: $0) })
}

/// 계획의 모든 출력 좌표(점은 중심).
private func allPoints(_ plan: SignatureRenderPlan) -> [SignaturePoint] {
    plan.elements.flatMap { element -> [SignaturePoint] in
        switch element {
        case .path(let points): points
        case .dot(let center, _): [center]
        }
    }
}

private struct Bounds {
    let minX: Double, maxX: Double, minY: Double, maxY: Double
    init(_ points: [SignaturePoint]) {
        minX = points.map(\.x).min() ?? .nan
        maxX = points.map(\.x).max() ?? .nan
        minY = points.map(\.y).min() ?? .nan
        maxY = points.map(\.y).max() ?? .nan
    }
    var width: Double { maxX - minX }
    var height: Double { maxY - minY }
    var centerX: Double { (minX + maxX) / 2 }
    var centerY: Double { (minY + maxY) / 2 }
}

@Suite("SIGN 그리기 캔버스 모델", .timeLimit(.minutes(1)))
struct SignatureDrawingTests {
    @Test("TC-SIGN-001 획이 없으면 사인이 없는 것으로 본다")
    func emptyHasNoContent() {
        #expect(!SignatureDrawing(canvasSize: padSize).hasContent)
    }

    @Test("TC-SIGN-002 점 하나만 찍어도 사인이 있는 것으로 본다")
    func singlePointCounts() {
        var model = SignatureDrawing(canvasSize: padSize)
        model.beginStroke(at: point(10, 10))
        #expect(model.strokes == [SignatureStroke(points: [point(10, 10)])])
        #expect(model.hasContent)
    }

    @Test("TC-SIGN-003 포인트가 없는 빈 획만 있으면 사인이 없는 것으로 본다")
    func emptyStrokeIsNoContent() {
        #expect(!drawing([[]]).hasContent)
        #expect(!drawing([[], []]).hasContent)
    }

    @Test("TC-SIGN-004 포인트가 있는 획이 있으면 사인이 있는 것으로 본다(빈 획이 섞여도)")
    func strokeWithPointsIsContent() {
        #expect(drawing([[point(1, 1), point(2, 2)]]).hasContent)
        #expect(drawing([[], [point(1, 1)]]).hasContent)
    }

    @Test("TC-SIGN-005 캔버스 밖 좌표는 캔버스 영역 안으로 보정된다")
    func outOfBoundsAreClamped() {
        var model = SignatureDrawing(canvasSize: padSize)
        model.beginStroke(at: point(-10, 20))
        model.extendStroke(to: point(400, 200))
        model.extendStroke(to: point(150, -5))
        #expect(model.strokes == [SignatureStroke(points: [point(0, 20), point(300, 150), point(150, 0)])])
    }

    @Test("TC-SIGN-006 되돌리기는 마지막 획부터 하나씩 지우고 0개가 되면 사인이 없다")
    func undo() {
        var model = SignatureDrawing(canvasSize: padSize)
        for x in [10.0, 20, 30] { model.beginStroke(at: point(x, x)) }
        model.undoLastStroke()
        #expect(model.strokes.map { $0.points[0].x } == [10, 20])
        model.undoLastStroke()
        model.undoLastStroke()
        #expect(model.strokes.isEmpty)
        #expect(!model.hasContent)
        model.undoLastStroke()
        #expect(model.strokes.isEmpty)
    }

    @Test("TC-SIGN-007 전체 지우기는 획을 모두 없애고 이어서 새로 그릴 수 있다")
    func clearThenDrawAgain() {
        var model = SignatureDrawing(canvasSize: padSize)
        model.beginStroke(at: point(1, 1))
        model.beginStroke(at: point(2, 2))
        model.clear()
        #expect(model.strokes.isEmpty && !model.hasContent)
        model.beginStroke(at: point(3, 3))
        model.extendStroke(to: point(4, 4))
        #expect(model.strokes == [SignatureStroke(points: [point(3, 3), point(4, 4)])])
    }

    @Test("획이 없을 때 extendStroke는 무시한다")
    func extendWithoutStroke() {
        var model = SignatureDrawing(canvasSize: padSize)
        model.extendStroke(to: point(5, 5))
        #expect(model.strokes.isEmpty)
    }
}

@Suite("SIGN 출력 좌표 계획(PNG 배치)", .timeLimit(.minutes(1)))
struct SignatureLayoutTests {
    private let tolerance = 1e-6

    @Test("TC-SIGN-009 계획의 출력 크기는 1024×512이고 획 두께는 14이다(SIGNATURE_PNG_SIZE)")
    func planConstants() throws {
        let plan = SignatureLayout.plan(for: drawing([[point(10, 10), point(100, 80)]]))
        #expect(plan.width == AppConstants.signatureWidth && plan.width == 1024)
        #expect(plan.height == AppConstants.signatureHeight && plan.height == 512)
        #expect(plan.strokeWidth == Double(AppConstants.signatureStrokeWidth))
        let constants = try #require(try SharedConstants.object()["SIGNATURE_PNG_SIZE"] as? [String: Int])
        #expect(constants["width"] == plan.width && constants["height"] == plan.height && constants["strokeWidth"] == 14 && constants["padding"] == 48)
    }

    @Test("TC-SIGN-011 모든 출력 좌표는 패딩 48 안쪽 영역에 있다(한쪽 끝에 몰린 획도)")
    func pointsStayInsidePadding() {
        let plan = SignatureLayout.plan(for: drawing([[point(0, 0), point(30, 10), point(20, 40)], [point(5, 5), point(25, 25)]]))
        let points = allPoints(plan)
        #expect(!points.isEmpty)
        let pad = Double(AppConstants.signaturePadding)
        for p in points {
            #expect(p.x >= pad - tolerance && p.x <= 1024 - pad + tolerance)
            #expect(p.y >= pad - tolerance && p.y <= 512 - pad + tolerance)
        }
    }

    @Test("TC-SIGN-011 그린 모양의 외곽 박스는 출력 영역 가운데에 놓인다")
    func boxIsCentered() {
        let plan = SignatureLayout.plan(for: drawing([[point(0, 0), point(30, 10)], [point(20, 40), point(5, 25)]]))
        let box = Bounds(allPoints(plan))
        #expect(abs(box.centerX - 512) < 1e-3)
        #expect(abs(box.centerY - 256) < 1e-3)
    }

    @Test("TC-SIGN-011 모양의 비율(출력 픽셀 기준)을 유지한다: 정사각형은 정사각형으로, 높이에 맞춰 416px")
    func aspectRatioPreserved() {
        let plan = SignatureLayout.plan(for: drawing([[point(10, 10), point(110, 10), point(110, 110), point(10, 110), point(10, 10)]]))
        let box = Bounds(allPoints(plan))
        #expect(abs(box.width - box.height) < 1e-3)
        #expect(abs(box.height - 416) < 1e-3)
    }

    @Test("TC-SIGN-011 캔버스를 가로로 가득 채운 직선(높이 0)은 폭주하지 않고 패딩 안쪽 가로 끝까지 닿는다")
    func horizontalLineSpansWidth() {
        let plan = SignatureLayout.plan(for: drawing([[point(0, 40), point(300, 40)]]))
        let points = allPoints(plan)
        #expect(points.allSatisfy { $0.x.isFinite && $0.y.isFinite })
        let box = Bounds(points)
        #expect(abs(box.minX - 48) < 1e-3 && abs(box.maxX - 976) < 1e-3)
        #expect(abs(box.centerY - 256) < 1e-3)
    }

    @Test("TC-SIGN-011 세로 직선(너비 0)도 폭주하지 않고 패딩 안쪽 세로 끝까지 닿는다")
    func verticalLineSpansHeight() {
        let plan = SignatureLayout.plan(for: drawing([[point(100, 0), point(100, 150)]]))
        let box = Bounds(allPoints(plan))
        #expect(abs(box.minY - 48) < 1e-3 && abs(box.maxY - 464) < 1e-3)
        #expect(abs(box.centerX - 512) < 1e-3)
    }

    @Test("TC-SIGN-011 2:1이 아닌 캔버스(300×300)의 정사각형 획도 출력에서 정사각형이다(균일 스케일)")
    func squareOnSquareCanvasStaysSquare() {
        let square = SignatureDrawing(canvasSize: SignatureCanvasSize(width: 300, height: 300), strokes: [
            SignatureStroke(points: [point(50, 50), point(150, 50), point(150, 150), point(50, 150), point(50, 50)]),
        ])
        let box = Bounds(allPoints(SignatureLayout.plan(for: square)))
        #expect(abs(box.width - box.height) < 1e-3)
        #expect(abs(box.height - 416) < 1e-3)
        #expect(abs(box.centerX - 512) < 1e-3 && abs(box.centerY - 256) < 1e-3)
    }

    @Test("TC-SIGN-002 TC-SIGN-011 점 하나는 원(dot)이 되어 출력 가운데에 놓이고 반지름은 양수이다")
    func singleDot() {
        let plan = SignatureLayout.plan(for: drawing([[point(37, 91)]]))
        guard plan.elements.count == 1, case .dot(let center, let radius) = plan.elements[0] else {
            Issue.record("dot 하나여야 한다: \(plan.elements)")
            return
        }
        #expect(abs(center.x - 512) < 1e-3 && abs(center.y - 256) < 1e-3)
        #expect(radius > 0 && radius.isFinite)
    }

    @Test("한 점에 몰린 여러 포인트(면적 0)도 유한한 좌표를 낸다")
    func coincidentPoints() {
        let plan = SignatureLayout.plan(for: drawing([[point(50, 50), point(50, 50), point(50, 50)]]))
        let points = allPoints(plan)
        #expect(!points.isEmpty)
        #expect(points.allSatisfy { $0.x.isFinite && $0.y.isFinite })
    }

    @Test("획 순서와 포인트 수는 보존되고 포인트 없는 빈 획은 건너뛴다")
    func orderAndCountsPreserved() {
        let plan = SignatureLayout.plan(for: drawing([[point(1, 1), point(2, 2), point(3, 3)], [], [point(9, 9)], [point(4, 4), point(8, 8)]]))
        #expect(plan.elements.count == 3)
        guard plan.elements.count == 3, case .path(let first) = plan.elements[0], case .dot = plan.elements[1], case .path(let third) = plan.elements[2] else {
            Issue.record("path, dot, path 순서여야 한다: \(plan.elements)")
            return
        }
        #expect(first.count == 3 && third.count == 2)
    }

    @Test("획이 없으면 그릴 요소가 없다")
    func emptyDrawing() {
        #expect(SignatureLayout.plan(for: SignatureDrawing(canvasSize: padSize)).elements.isEmpty)
    }
}
