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
                        let rect = CGRect(x: first.x * scaleX - 2, y: first.y * scaleY - 2, width: 4, height: 4)
                        context.fill(Path(ellipseIn: rect), with: .color(ChalkakColor.textOnImage))
                    } else {
                        var path = Path()
                        path.move(to: CGPoint(x: first.x * scaleX, y: first.y * scaleY))
                        for point in stroke.points.dropFirst() {
                            path.addLine(to: CGPoint(x: point.x * scaleX, y: point.y * scaleY))
                        }
                        context.stroke(
                            path, with: .color(ChalkakColor.textOnImage),
                            style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round)
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
        // 원본 SignaturePad(screens-a.md 6.1): 어두운 캔버스(라운드 12) + 점선 테두리, 바깥 카드 inputBackground/라운드 16
        .background(ChalkakColor.actionPrimary, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(ChalkakColor.textOnImage.opacity(0.28), style: StrokeStyle(lineWidth: 1, dash: [6, 6]))
                .padding(1)
                .allowsHitTesting(false)
        }
        .overlay {
            if strokes.isEmpty {
                Text("사인")
                    .font(ChalkakFont.handwriting)
                    .scaleEffect(2.4)
                    .foregroundStyle(ChalkakColor.textOnImage.opacity(0.56))
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.button))
        .padding(EdgeInsets(top: ChalkakSpacing.lg, leading: ChalkakSpacing.lg, bottom: 14, trailing: ChalkakSpacing.lg))
        .background(ChalkakColor.inputBackground, in: RoundedRectangle(cornerRadius: ChalkakRadius.large))
        .overlay(RoundedRectangle(cornerRadius: ChalkakRadius.large).stroke(ChalkakColor.textPrimary.opacity(0.12), lineWidth: 1))
    }
}
