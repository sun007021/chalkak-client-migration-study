import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import ChalkakFeatures
#if canImport(libwebp)
import libwebp
#endif

/// 손실 WebP 한 번 인코딩(REQ-UPL-030, 033). 결과는 RIFF/WEBP 헤더를 가진 메타데이터 없는 파일이어야 한다.
protocol WebPDataEncoding: Sendable {
    /// 지원하지 않는 기기면 `PhotoPrepareError.unsupported`.
    func encode(_ image: RGBAImage, quality: Int) throws -> Data
}

/// 쓸 수 있는 인코더를 고른다: libwebp 모듈(project.yml의 libwebp-Xcode, 스펙 권장)이 있으면 그것, 없으면 ImageIO.
/// iOS ImageIO는 WebP 쓰기를 지원하지 않는 OS가 많아 ImageIO 쪽은 대체 경로일 뿐이다.
enum WebPEncoders {
    static func system() -> any WebPDataEncoding {
        #if canImport(libwebp)
        return LibWebPEncoder()
        #else
        return ImageIOWebPEncoder()
        #endif
    }
}

/// ImageIO의 WebP 쓰기. 기기·OS가 `org.webmproject.webp` 쓰기를 지원하지 않으면 `.unsupported`를 던진다.
struct ImageIOWebPEncoder: WebPDataEncoding {
    func encode(_ image: RGBAImage, quality: Int) throws -> Data {
        let identifier = UTType.webP.identifier
        let supported = (CGImageDestinationCopyTypeIdentifiers() as? [String]) ?? []
        guard supported.contains(identifier), let cg = PhotoImageOps.cgImage(from: image) else {
            throw PhotoPrepareError.unsupported
        }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, identifier as CFString, 1, nil) else {
            throw PhotoPrepareError.unsupported
        }
        let options: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: Double(quality) / 100]
        CGImageDestinationAddImage(destination, cg, options as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { throw PhotoPrepareError.unsupported }
        let data = output as Data
        guard WebPHeader.isWebP(data) else { throw PhotoPrepareError.unsupported }
        return data
    }
}

#if canImport(libwebp)
/// libwebp C API(`WebPEncodeRGBA`). 이미지는 불투명 RGBA라 알파는 인코더가 버린다.
struct LibWebPEncoder: WebPDataEncoding {
    func encode(_ image: RGBAImage, quality: Int) throws -> Data {
        var output: UnsafeMutablePointer<UInt8>?
        let size = image.pixels.withUnsafeBytes { raw -> Int in
            guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { return 0 }
            return WebPEncodeRGBA(base, Int32(image.width), Int32(image.height), Int32(image.width * 4), Float(quality), &output)
        }
        guard size > 0, let output else { throw PhotoPrepareError.unsupported }
        defer { WebPFree(output) }
        let data = Data(bytes: output, count: size)
        guard WebPHeader.isWebP(data) else { throw PhotoPrepareError.unsupported }
        return data
    }
}
#endif

enum WebPHeader {
    /// `RIFF....WEBP`로 시작하는가.
    static func isWebP(_ data: Data) -> Bool {
        guard data.count >= 12 else { return false }
        let bytes = Array(data.prefix(12))
        return bytes[0..<4].elementsEqual("RIFF".utf8) && bytes[8..<12].elementsEqual("WEBP".utf8)
    }
}

/// `WebPSizeLadder`가 부르는 한 번의 압축: 편집이 끝난 이미지를 `size`로 줄여 `quality`로 인코딩한다(REQ-UPL-029: 손실 압축은 이 한 번뿐).
struct WebPLadderCompressor: WebPCompressing {
    let image: RGBAImage
    let encoder: any WebPDataEncoding

    func compress(quality: Int, size: PixelSize) async throws -> Data {
        try Task.checkCancellation()
        guard let scaled = PhotoImageOps.scaled(image, to: size) else { throw PhotoPrepareError.unsupported }
        let data = try encoder.encode(scaled, quality: quality)
        try Task.checkCancellation()
        return data
    }
}
