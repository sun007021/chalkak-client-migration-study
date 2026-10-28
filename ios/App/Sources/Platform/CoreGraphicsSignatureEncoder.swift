import UIKit
import ChalkakFeatures

/// `SignatureRenderPlan`을 투명 배경 + 흰 획 PNG로 그린다(REQ-SIGN-006). 곡선 보간은 인접 점 중점을 잇는 이차 곡선이다.
struct CoreGraphicsSignatureEncoder: SignatureImageEncoder {
    struct EncodingFailed: Error {}

    func encodePNG(_ plan: SignatureRenderPlan) async throws -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: plan.width, height: plan.height), format: format)
        let data = renderer.pngData { rendererContext in
            let context = rendererContext.cgContext
            context.setStrokeColor(UIColor.white.cgColor)
            context.setFillColor(UIColor.white.cgColor)
            context.setLineWidth(CGFloat(plan.strokeWidth))
            context.setLineCap(.round)
            context.setLineJoin(.round)
            for element in plan.elements {
                switch element {
                case .dot(let center, let radius):
                    let rect = CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)
                    context.fillEllipse(in: rect)
                case .path(let points):
                    let mapped = points.map { CGPoint(x: $0.x, y: $0.y) }
                    guard mapped.count >= 2 else { continue }
                    context.addPath(Self.smoothPath(for: mapped))
                    context.strokePath()
                }
            }
        }
        guard !data.isEmpty else { throw EncodingFailed() }
        return data
    }

    private static func smoothPath(for points: [CGPoint]) -> CGPath {
        let path = CGMutablePath()
        path.move(to: points[0])
        if points.count == 2 {
            path.addLine(to: points[1])
            return path
        }
        for index in 1..<(points.count - 1) {
            let current = points[index]
            let next = points[index + 1]
            path.addQuadCurve(
                to: CGPoint(x: (current.x + next.x) / 2, y: (current.y + next.y) / 2),
                control: current
            )
        }
        path.addLine(to: points[points.count - 1])
        return path
    }
}
