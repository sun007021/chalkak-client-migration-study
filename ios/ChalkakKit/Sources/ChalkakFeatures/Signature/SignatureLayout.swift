import Foundation
import ChalkakCore

public enum SignatureRenderElement: Sendable, Equatable {
    /// 포인트 2개 이상인 획. 좌표는 출력 픽셀 기준. 곡선 보간(이차 곡선)은 인코더의 몫이다.
    case path([SignaturePoint])
    /// 포인트 1개짜리 획: PNG에서 원으로 그린다(REQ-SIGN-005).
    case dot(center: SignaturePoint, radius: Double)
}

/// 인코더에 넘기는 그리기 계획(플랫폼 독립). 출력은 투명 배경 + 흰 획, 둥근 끝·이음이다.
public struct SignatureRenderPlan: Sendable, Equatable {
    public let width: Int
    public let height: Int
    public let strokeWidth: Double
    public let elements: [SignatureRenderElement]
    public init(width: Int, height: Int, strokeWidth: Double, elements: [SignatureRenderElement]) {
        self.width = width
        self.height = height
        self.strokeWidth = strokeWidth
        self.elements = elements
    }
}

public enum SignatureLayout {
    /// 캔버스 좌표의 획을 1024×512(`AppConstants.signature*`) 출력 좌표로 옮긴다(REQ-SIGN-006/007).
    /// - 빈 획(포인트 없음)은 건너뛴다. 획 순서와 포인트 수는 보존한다.
    /// - 모든 포인트의 외곽 박스를 캔버스 대비 비율로 정규화하고, 한 변이 0.02보다 작으면 0.02로 취급한다(점·직선이 폭주하지 않게).
    /// - 그린 모양의 비율(출력 픽셀 기준)을 유지한 채 패딩(48) 안쪽 영역에 맞추고 중앙 정렬한다.
    public static func plan(for drawing: SignatureDrawing) -> SignatureRenderPlan {
        let width = Double(AppConstants.signatureWidth)
        let height = Double(AppConstants.signatureHeight)
        let strokeWidth = Double(AppConstants.signatureStrokeWidth)
        func plan(_ elements: [SignatureRenderElement]) -> SignatureRenderPlan {
            SignatureRenderPlan(width: AppConstants.signatureWidth, height: AppConstants.signatureHeight, strokeWidth: strokeWidth, elements: elements)
        }

        let strokes = drawing.strokes.filter { !$0.points.isEmpty }
        let all = strokes.flatMap(\.points)
        let canvas = drawing.canvasSize
        guard let minX = all.map(\.x).min(), let maxX = all.map(\.x).max(),
              let minY = all.map(\.y).min(), let maxY = all.map(\.y).max(),
              canvas.width > 0, canvas.height > 0
        else { return plan([]) }

        // 캔버스 좌표의 외곽 박스(한 변 최소는 캔버스 대비 0.02)를 하나의 균일 scale로 패딩 안쪽에 맞춘다.
        let boxWidth = max(maxX - minX, minimumBoxRatio * canvas.width)
        let boxHeight = max(maxY - minY, minimumBoxRatio * canvas.height)
        let padding = Double(AppConstants.signaturePadding)
        let scale = min((width - 2 * padding) / boxWidth, (height - 2 * padding) / boxHeight)
        let centerX = (minX + maxX) / 2
        let centerY = (minY + maxY) / 2
        func place(_ point: SignaturePoint) -> SignaturePoint {
            SignaturePoint(
                x: width / 2 + (point.x - centerX) * scale,
                y: height / 2 + (point.y - centerY) * scale
            )
        }

        let elements = strokes.map { stroke -> SignatureRenderElement in
            stroke.points.count == 1
                ? .dot(center: place(stroke.points[0]), radius: strokeWidth / 2)
                : .path(stroke.points.map(place))
        }
        return plan(elements)
    }

    /// 점·직선처럼 한 변이 거의 0인 박스가 폭주하지 않게 하는 최소 비율.
    private static let minimumBoxRatio = 0.02
}

/// 앱 타깃이 CoreGraphics 등으로 구현한다: 흰 획, 투명 배경, 둥근 캡·조인, 인접 점 사이 이차 곡선, PNG 바이트 반환.
public protocol SignatureImageEncoder: Sendable {
    func encodePNG(_ plan: SignatureRenderPlan) async throws -> Data
}
