import Foundation
import ChalkakCore

/// 한 번의 압축 시도. App 타깃의 WebP 인코더가 구현한다(원본을 `size`로 줄여 `quality`로 손실 압축). 취소에 협조해야 한다.
public protocol WebPCompressing: Sendable {
    func compress(quality: Int, size: PixelSize) async throws -> Data
}

public struct EncodedWebP: Sendable, Equatable {
    public let data: Data
    public let size: PixelSize
    public let quality: Int
    public init(data: Data, size: PixelSize, quality: Int) {
        self.data = data
        self.size = size
        self.quality = quality
    }
}

public enum WebPEncodingError: Error, Sendable, Equatable {
    /// 4라운드(총 16회) 안에 `maxBytes` 이하가 되지 못했다.
    case sizeLimitExceeded
}

/// 품질·크기 사다리(REQ-UPL-030~032): 품질 90 → 80 → 60 → 40 순으로 `maxBytes` 이하가 되는 첫 결과를 쓴다.
/// 40에서도 넘으면 가로·세로를 0.85배로 줄여(반올림) 90부터 다시 하며, 줄이기는 최대 3번(총 4라운드)이다.
public enum WebPSizeLadder {
    /// 라운드 `round`(0~3)의 크기: 처음 크기 × 0.85^round, 각 변 반올림.
    public static func size(_ start: PixelSize, round: Int) -> PixelSize {
        guard round > 0 else { return start }
        let scale = pow(AppConstants.webpDownscaleFactor, Double(round))
        return PixelSize(width: Int((Double(start.width) * scale).rounded()), height: Int((Double(start.height) * scale).rounded()))
    }

    /// 사다리를 돈다. 크기가 정확히 `maxBytes`인 결과는 허용한다(이하). 모두 넘으면 `WebPEncodingError.sizeLimitExceeded`.
    /// 취소되면 압축을 더 부르지 않고 `CancellationError`를 던진다.
    public static func encode(startingAt start: PixelSize, maxBytes: Int64, using compressor: any WebPCompressing) async throws -> EncodedWebP {
        for round in 0...AppConstants.webpMaxDownscaleAttempts {
            let size = size(start, round: round)
            for quality in AppConstants.webpQualityLadder {
                try Task.checkCancellation()
                let data = try await compressor.compress(quality: quality, size: size)
                if Int64(data.count) <= maxBytes {
                    try Task.checkCancellation()
                    return EncodedWebP(data: data, size: size, quality: quality)
                }
            }
        }
        throw WebPEncodingError.sizeLimitExceeded
    }
}
