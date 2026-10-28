import SwiftUI
import ChalkakFeatures

enum SignaturePadMetrics {
    /// ViewModel이 쓰는 논리 캔버스 크기. 출력 PNG(1024×512)와 같은 2:1이라 패드를 2:1로 그리면 비율이 어긋나지 않는다.
    static let canvasSize = SignatureCanvasSize(width: 320, height: 160)
    static let aspectRatio: CGFloat = 2
}

/// 손가락으로 그리는 영역. 획 데이터는 ViewModel(`SignatureDrawing`)이 갖고, 이 뷰는 입력을 논리 좌표로 옮겨 알리고 획을 그린다.
struct SignaturePad: View {
    let strokes: [SignatureStroke]
    let onBegan: (SignaturePoint) -> Void
    let onMoved: (SignaturePoint) -> Void
    let onEnded: () -> Void
    @State private var isDrawing = false

    var body: some View {
        let logical = SignaturePadMetrics.canvasSize
        let drawn = strokes
        GeometryReader { proxy in
            Canvas { context, size in
                let scaleX = size.width / logical.width
                let scaleY = size.height / logical.height
                for stroke in drawn {
                    guard let first = stroke.points.first else { continue }
                    if stroke.points.count == 1 {
                        let rect = CGRect(x: first.x * scaleX - 3, y: first.y * scaleY - 3, width: 6, height: 6)
                        context.fill(Path(ellipseIn: rect), with: .color(ChalkakColor.textPrimary))
                    } else {
                        var path = Path()
                        path.move(to: CGPoint(x: first.x * scaleX, y: first.y * scaleY))
                        for point in stroke.points.dropFirst() {
                            path.addLine(to: CGPoint(x: point.x * scaleX, y: point.y * scaleY))
                        }
                        context.stroke(
                            path, with: .color(ChalkakColor.textPrimary),
                            style: StrokeStyle(lineWidth: 6, lineCap: .round, lineJoin: .round)
                        )
                    }
                }
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        guard proxy.size.width > 0, proxy.size.height > 0 else { return }
                        let point = SignaturePoint(
                            x: Double(value.location.x / proxy.size.width) * logical.width,
                            y: Double(value.location.y / proxy.size.height) * logical.height
                        )
                        if isDrawing {
                            onMoved(point)
                        } else {
                            isDrawing = true
                            onBegan(point)
                        }
                    }
                    .onEnded { _ in
                        isDrawing = false
                        onEnded()
                    }
            )
        }
        .aspectRatio(SignaturePadMetrics.aspectRatio, contentMode: .fit)
        .background(ChalkakColor.surfaceElevated, in: RoundedRectangle(cornerRadius: ChalkakRadius.card))
        .overlay(RoundedRectangle(cornerRadius: ChalkakRadius.card).stroke(ChalkakColor.border, lineWidth: 1))
    }
}
