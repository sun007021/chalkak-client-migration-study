import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import ChalkakCore
import ChalkakFeatures

// ImageIO/CoreGraphics로 하는 사진 디코딩, 회전·자르기·축소, JPEG 인코딩. 상태가 없어 어느 스레드에서나 부른다.
enum PhotoImageOps {
    private static func colorSpace() -> CGColorSpace {
        CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
    }

    private static func makeContext(width: Int, height: Int) -> CGContext? {
        CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
            space: colorSpace(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )
    }

    // MARK: 읽기

    /// 바이트의 EXIF 방향을 반영한(화면에 보이는) 크기. 읽을 수 없으면 nil.
    static func orientedSize(of data: Data) -> PixelSize? {
        guard !data.isEmpty, let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) > 0,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0 else { return nil }
        let orientation = (properties[kCGImagePropertyOrientation] as? Int) ?? 1
        // 5~8은 90도 돌아간 방향이라 가로·세로가 바뀐다.
        return (5...8).contains(orientation) ? PixelSize(width: height, height: width) : PixelSize(width: width, height: height)
    }

    /// EXIF 방향을 반영해 디코딩하고 긴 변이 `maxLongEdge`를 넘으면 줄인다(확대하지 않음). 실패하면 nil.
    static func decodeOriented(_ data: Data, maxLongEdge: Int) -> RGBAImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) > 0,
              let size = orientedSize(of: data) else { return nil }
        let limit = max(1, min(maxLongEdge, size.longEdge))
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: limit,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return rgba(from: image)
    }

    // MARK: 변환

    /// 불투명 흰 배경 위에 그려 RGBA 픽셀로 만든다.
    static func rgba(from image: CGImage) -> RGBAImage? {
        let width = image.width, height = image.height
        guard width > 0, height > 0, let context = makeContext(width: width, height: height), let data = context.data else { return nil }
        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return RGBAImage(width: width, height: height, pixels: Data(bytes: data, count: width * 4 * height))
    }

    static func cgImage(from image: RGBAImage) -> CGImage? {
        guard image.width > 0, image.height > 0, image.pixels.count >= image.width * image.height * 4,
              let provider = CGDataProvider(data: image.pixels as CFData) else { return nil }
        return CGImage(
            width: image.width, height: image.height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: image.width * 4,
            space: colorSpace(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
            provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent
        )
    }

    /// 시계 방향 90도씩 `quarterTurns`번 돌린다.
    static func rotated(_ image: RGBAImage, quarterTurns: Int) -> RGBAImage? {
        let turns = ((quarterTurns % 4) + 4) % 4
        if turns == 0 { return image }
        guard let source = cgImage(from: image) else { return nil }
        let w = Double(image.width), h = Double(image.height)
        let outWidth = turns % 2 == 0 ? image.width : image.height
        let outHeight = turns % 2 == 0 ? image.height : image.width
        guard let context = makeContext(width: outWidth, height: outHeight), let data = context.data else { return nil }
        // CoreGraphics는 y가 위로 자란다. 시계 방향 회전을 원점 이동과 함께 합쳐 건다.
        let transform: CGAffineTransform
        switch turns {
        case 1: transform = CGAffineTransform(a: 0, b: -1, c: 1, d: 0, tx: 0, ty: w)
        case 2: transform = CGAffineTransform(a: -1, b: 0, c: 0, d: -1, tx: w, ty: h)
        default: transform = CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: h, ty: 0)
        }
        context.concatenate(transform)
        context.draw(source, in: CGRect(x: 0, y: 0, width: w, height: h))
        return RGBAImage(width: outWidth, height: outHeight, pixels: Data(bytes: data, count: outWidth * 4 * outHeight))
    }

    /// 돌린 사진 기준 프레임(0~1)을 자르고 `outputSize`로 맞춘다. `frame`이 nil이면 전체.
    static func croppedAndScaled(_ image: RGBAImage, frame: CropFrame?, outputSize: PixelSize) -> RGBAImage? {
        guard outputSize.width > 0, outputSize.height > 0, var source = cgImage(from: image) else { return nil }
        if let frame {
            let w = Double(image.width), h = Double(image.height)
            let x = max(0, (frame.centerX - frame.width / 2) * w)
            let y = max(0, (frame.centerY - frame.height / 2) * h)
            let right = min(w, (frame.centerX + frame.width / 2) * w)
            let bottom = min(h, (frame.centerY + frame.height / 2) * h)
            let rect = CGRect(x: x.rounded(), y: y.rounded(), width: max(1, (right - x).rounded()), height: max(1, (bottom - y).rounded()))
            guard let cropped = source.cropping(to: rect) else { return nil }
            source = cropped
        }
        if source.width == outputSize.width, source.height == outputSize.height { return rgba(from: source) }
        guard let context = makeContext(width: outputSize.width, height: outputSize.height), let data = context.data else { return nil }
        context.interpolationQuality = .high
        context.draw(source, in: CGRect(x: 0, y: 0, width: outputSize.width, height: outputSize.height))
        return RGBAImage(width: outputSize.width, height: outputSize.height, pixels: Data(bytes: data, count: outputSize.width * 4 * outputSize.height))
    }

    /// 크기만 바꾼다(확대 포함). 같으면 그대로.
    static func scaled(_ image: RGBAImage, to size: PixelSize) -> RGBAImage? {
        if image.width == size.width, image.height == size.height { return image }
        return croppedAndScaled(image, frame: nil, outputSize: size)
    }

    /// 편집값을 적용한 결과(회전 → 자르기 → 색 조정 → 필터, REQ-EDIT-008).
    /// - `cropped`가 false면 자르지 않고 돌린 전체를 낸다(자르기 탭 미리보기).
    /// - `maxLongEdge`가 있으면 그보다 크지 않게 줄인다(확대하지 않음).
    static func render(_ base: RGBAImage, edit: PhotoEdit, cropped: Bool, maxLongEdge: Int?) -> RGBAImage? {
        guard let rotated = rotated(base, quarterTurns: edit.quarterTurns) else { return nil }
        let frame: CropFrame? = cropped && !edit.crop.isFull()
            ? PhotoEditGeometry.cropFrame(from: edit.crop, quarterTurns: edit.quarterTurns)
            : nil
        let natural = PixelSize(
            width: max(1, Int((Double(rotated.width) * (frame?.width ?? 1)).rounded())),
            height: max(1, Int((Double(rotated.height) * (frame?.height ?? 1)).rounded()))
        )
        var output = natural
        if let maxLongEdge, maxLongEdge > 0, natural.longEdge > maxLongEdge {
            let scale = Double(maxLongEdge) / Double(natural.longEdge)
            output = PixelSize(
                width: max(1, Int((Double(natural.width) * scale).rounded())),
                height: max(1, Int((Double(natural.height) * scale).rounded()))
            )
        }
        let needsDraw = frame != nil || output != natural
        guard let geometry = needsDraw ? croppedAndScaled(rotated, frame: frame, outputSize: output) : rotated else { return nil }
        return PhotoColorPipeline.apply(to: geometry, adjustments: edit.adjustments, filter: edit.filter)
    }

    // MARK: 쓰기

    static func jpegData(from image: RGBAImage, quality: Double) -> Data? {
        guard let cg = cgImage(from: image) else { return nil }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, cg, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }
}
