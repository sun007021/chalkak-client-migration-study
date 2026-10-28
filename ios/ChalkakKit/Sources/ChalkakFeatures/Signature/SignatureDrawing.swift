import Foundation

/// 그리기 영역(뷰) 좌표. 단위는 뷰 포인트이고 왼쪽 위가 원점이다.
public struct SignaturePoint: Sendable, Equatable {
    public var x: Double
    public var y: Double
    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

public struct SignatureStroke: Sendable, Equatable {
    public var points: [SignaturePoint]
    public init(points: [SignaturePoint]) { self.points = points }
}

public struct SignatureCanvasSize: Sendable, Equatable {
    public let width: Double
    public let height: Double
    public init(width: Double, height: Double) {
        self.width = width
        self.height = height
    }
}

/// 그리기 영역에 쌓인 획. 값 타입이며 View·플랫폼과 무관하다.
public struct SignatureDrawing: Sendable, Equatable {
    public let canvasSize: SignatureCanvasSize
    public private(set) var strokes: [SignatureStroke]

    public init(canvasSize: SignatureCanvasSize, strokes: [SignatureStroke] = []) {
        self.canvasSize = canvasSize
        self.strokes = strokes
    }

    /// 포인트가 하나라도 있는 획이 있으면 true. 포인트 없는 빈 획만 있으면 false(SIGN-003).
    public var hasContent: Bool { strokes.contains { !$0.points.isEmpty } }

    /// 새 획을 시작한다. 좌표는 캔버스 영역 `[0,width]×[0,height]` 안으로 보정한다(SIGN-005). 점 하나만 찍어도 포인트 1개짜리 획이다(SIGN-002).
    public mutating func beginStroke(at point: SignaturePoint) {
        strokes.append(SignatureStroke(points: [clamped(point)]))
    }
    /// 마지막 획에 보정된 점을 잇는다. 획이 없으면 무시한다.
    public mutating func extendStroke(to point: SignaturePoint) {
        guard !strokes.isEmpty else { return }
        strokes[strokes.count - 1].points.append(clamped(point))
    }
    /// 마지막 획 하나를 지운다.
    public mutating func undoLastStroke() {
        _ = strokes.popLast()
    }
    public mutating func clear() {
        strokes.removeAll()
    }

    private func clamped(_ point: SignaturePoint) -> SignaturePoint {
        SignaturePoint(x: min(max(point.x, 0), canvasSize.width), y: min(max(point.y, 0), canvasSize.height))
    }
}
