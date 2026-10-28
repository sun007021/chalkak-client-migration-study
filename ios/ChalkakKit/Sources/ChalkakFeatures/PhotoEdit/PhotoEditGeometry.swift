import Foundation
import ChalkakCore

// 순수 기하 계산(자르기·회전·출력 크기·화면 좌표). docs/spec/features/upload-edit.md "편집값 모델과 좌표".

public struct EditPoint: Sendable, Equatable {
    public var x: Double
    public var y: Double
    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

public struct EditSize: Sendable, Equatable {
    public var width: Double
    public var height: Double
    public init(width: Double, height: Double) {
        self.width = width
        self.height = height
    }
}

/// 화면에 보이는(90도 돌린) 사진 기준의 자르기 프레임. 중심 단위 좌표, 모두 **돌린 사진**의 가로·세로에 대한 0~1 비율이다.
public struct CropFrame: Sendable, Equatable {
    public var centerX: Double
    public var centerY: Double
    public var width: Double
    public var height: Double
    public init(centerX: Double, centerY: Double, width: Double, height: Double) {
        self.centerX = centerX
        self.centerY = centerY
        self.width = width
        self.height = height
    }
    public static let full = CropFrame(centerX: 0.5, centerY: 0.5, width: 1, height: 1)
}

public enum CropHandle: Sendable, Equatable, CaseIterable {
    case topLeft, topRight, bottomLeft, bottomRight
}

public enum PhotoEditGeometry {
    /// 시계 방향 `quarterTurns`(0~3)번 돌린 뒤의 크기. 홀수 번이면 가로·세로가 바뀐다.
    public static func rotatedSize(of source: PixelSize, quarterTurns: Int) -> PixelSize {
        quarterTurns % 2 == 0 ? source : PixelSize(width: source.height, height: source.width)
    }

    /// 돌린 사진의 점 (xr, yr) → 원본 W×H의 점: 0:(xr,yr), 1:(yr,H−xr), 2:(W−xr,H−yr), 3:(W−yr,xr).
    public static func sourcePoint(rotated point: EditPoint, quarterTurns: Int, source: PixelSize) -> EditPoint {
        let w = Double(source.width), h = Double(source.height)
        switch normalized(quarterTurns) {
        case 1: return EditPoint(x: point.y, y: h - point.x)
        case 2: return EditPoint(x: w - point.x, y: h - point.y)
        case 3: return EditPoint(x: w - point.y, y: point.x)
        default: return point
        }
    }

    /// 돌린 사진 기준 프레임 → 편집값 `CropWindow`(중심은 회전 전 원본 비율로 옮기고 크기는 그대로).
    /// 중심 (u, v) → 0:(u,v), 1:(v,1−u), 2:(1−u,1−v), 3:(1−v,u).
    public static func cropWindow(from frame: CropFrame, quarterTurns: Int) -> CropWindow {
        let u = frame.centerX, v = frame.centerY
        let center: (Double, Double)
        switch normalized(quarterTurns) {
        case 1: center = (v, 1 - u)
        case 2: center = (1 - u, 1 - v)
        case 3: center = (1 - v, u)
        default: center = (u, v)
        }
        return CropWindow(centerX: center.0, centerY: center.1, width: frame.width, height: frame.height)
    }

    /// `cropWindow(from:quarterTurns:)`의 역변환.
    public static func cropFrame(from window: CropWindow, quarterTurns: Int) -> CropFrame {
        let x = window.centerX, y = window.centerY
        let center: (Double, Double)
        switch normalized(quarterTurns) {
        case 1: center = (1 - y, x)
        case 2: center = (1 - x, 1 - y)
        case 3: center = (y, 1 - x)
        default: center = (x, y)
        }
        return CropFrame(centerX: center.0, centerY: center.1, width: window.width, height: window.height)
    }

    /// 자르기 중심의 원본 픽셀 좌표(`centerX × W`, `centerY × H`).
    public static func sourceCenter(of crop: CropWindow, source: PixelSize) -> EditPoint {
        EditPoint(x: crop.centerX * Double(source.width), y: crop.centerY * Double(source.height))
    }

    /// 자른 결과 크기: 돌린 사진 크기 × (crop.width, crop.height), 반올림.
    public static func croppedSize(source: PixelSize, quarterTurns: Int, crop: CropWindow) -> PixelSize {
        let rotated = rotatedSize(of: source, quarterTurns: quarterTurns)
        return PixelSize(width: max(1, Int((Double(rotated.width) * crop.width).rounded())), height: max(1, Int((Double(rotated.height) * crop.height).rounded())))
    }

    private static func normalized(_ quarterTurns: Int) -> Int { ((quarterTurns % 4) + 4) % 4 }

    /// 업로드 렌더 결과 크기: 먼저 `PostImageSizing.sampledSize`로 긴 변 4096 이하로 줄인 뒤 자른다(REQ-EDIT-018). 확대하지 않는다.
    public static func uploadOutputSize(source: PixelSize, edit: PhotoEdit) -> PixelSize {
        croppedSize(source: PostImageSizing.sampledSize(for: source), quarterTurns: edit.quarterTurns, crop: edit.crop)
    }
}

/// 업로드용 입력 크기 계산(REQ-UPL-027).
public enum PostImageSizing {
    /// 긴 변이 `AppConstants.postImageMaxLongEdge` 이하가 될 때까지 2배씩 줄이는 다운샘플 배율(1, 2, 4, …). 이미 이하면 1(확대 없음).
    public static func downsampleFactor(for size: PixelSize) -> Int {
        var factor = 1
        while ceilDiv(size.longEdge, factor) > AppConstants.postImageMaxLongEdge { factor *= 2 }
        return factor
    }

    private static func ceilDiv(_ value: Int, _ divisor: Int) -> Int { (value + divisor - 1) / divisor }

    /// `downsampleFactor`로 줄인 크기(올림 나눗셈: 4097 → 2049).
    public static func sampledSize(for size: PixelSize) -> PixelSize {
        let factor = downsampleFactor(for: size)
        return PixelSize(width: ceilDiv(size.width, factor), height: ceilDiv(size.height, factor))
    }
}

/// 자르기 프레임 조작(EDIT-018). 좌표는 모두 돌린 사진 기준 0~1 비율이고, 픽셀 비율 계산을 위해 돌린 사진 크기 `image`를 받는다.
public enum CropGeometry {
    /// 짧은 변이 사진 짧은 변의 이 비율 아래로 줄지 않는다(REQ-EDIT-013).
    public static let minCropFraction = 0.1

    /// 사진 안에 들어가는 가장 큰 `aspect`(가로/세로, 픽셀 기준) 프레임, 사진 중앙.
    public static func largestFrame(aspect: Double, in image: PixelSize) -> CropFrame {
        guard image.width > 0, image.height > 0, aspect > 0 else { return .full }
        let w = Double(image.width), h = Double(image.height)
        // 사진 자체의 비율이면 부동소수 오차 없이 전체로 돌려준다.
        if abs(aspect - w / h) < 1e-12 { return .full }
        if aspect > w / h {
            return CropFrame(centerX: 0.5, centerY: 0.5, width: 1, height: w / (aspect * h))
        }
        return CropFrame(centerX: 0.5, centerY: 0.5, width: aspect * h / w, height: 1)
    }

    /// 프레임을 (dx, dy)(사진 비율 단위)만큼 옮긴다. 크기는 그대로, 사진 밖으로는 나가지 않는다.
    public static func moved(_ frame: CropFrame, byX dx: Double, y dy: Double) -> CropFrame {
        var next = frame
        next.centerX = min(max(frame.centerX + dx, frame.width / 2), 1 - frame.width / 2)
        next.centerY = min(max(frame.centerY + dy, frame.height / 2), 1 - frame.height / 2)
        return next
    }

    /// 모서리 `handle`을 `point`(사진 비율 좌표)로 끌어 크기를 바꾼다. 반대쪽 모서리는 고정이다.
    /// 끈 점은 사진 안(0~1)으로 자르고, 두 변은 각각 사진 짧은 변의 `minCropFraction`배(픽셀) 이상으로 유지한다.
    /// `aspect`(가로/세로 픽셀 비율)가 있으면 그 비율을 유지하며 고정 모서리·사진 경계 안에 들어가게 줄인다.
    public static func resized(_ frame: CropFrame, handle: CropHandle, to point: EditPoint, aspect: Double?, in image: PixelSize) -> CropFrame {
        guard image.width > 0, image.height > 0 else { return frame }
        let w = Double(image.width), h = Double(image.height)
        let movesLeft = handle == .topLeft || handle == .bottomLeft
        let movesTop = handle == .topLeft || handle == .topRight
        // 반대쪽(고정) 모서리와, 고정 모서리에서 끈 방향으로 남은 사진 쪽 여유.
        let fixedX = movesLeft ? frame.centerX + frame.width / 2 : frame.centerX - frame.width / 2
        let fixedY = movesTop ? frame.centerY + frame.height / 2 : frame.centerY - frame.height / 2
        let px = min(max(point.x, 0), 1), py = min(max(point.y, 0), 1)
        let roomW = (movesLeft ? fixedX : 1 - fixedX) * w
        let roomH = (movesTop ? fixedY : 1 - fixedY) * h
        let wanted = (x: max((movesLeft ? fixedX - px : px - fixedX) * w, 0), y: max((movesTop ? fixedY - py : py - fixedY) * h, 0))
        let minPixels = minCropFraction * Double(image.shortEdge)

        var pixelsW: Double, pixelsH: Double
        if let aspect, aspect > 0 {
            // 끈 점이 프레임 안에 남도록 두 후보 중 큰 쪽을 쓰고, 여유·최소 크기 안으로 맞춘다.
            let candidate = max(wanted.x, wanted.y * aspect)
            let lowest = max(minPixels, minPixels * aspect)
            let highest = max(min(roomW, roomH * aspect), lowest)
            pixelsW = min(max(candidate, lowest), highest)
            pixelsH = pixelsW / aspect
        } else {
            pixelsW = min(max(wanted.x, minPixels), max(roomW, minPixels))
            pixelsH = min(max(wanted.y, minPixels), max(roomH, minPixels))
        }
        let fw = pixelsW / w, fh = pixelsH / h
        return CropFrame(
            centerX: movesLeft ? fixedX - fw / 2 : fixedX + fw / 2,
            centerY: movesTop ? fixedY - fh / 2 : fixedY + fh / 2,
            width: fw, height: fh
        )
    }
}

/// 화면 좌표 ↔ 사진 비율 좌표(EDIT-019). 사진은 `container` 안에 비율을 유지하며 맞춰 들어간다(fit).
public struct CropViewport: Sendable, Equatable {
    public let image: PixelSize
    public let container: EditSize
    public init(image: PixelSize, container: EditSize) {
        self.image = image
        self.container = container
    }

    /// min(container.width / image.width, container.height / image.height).
    public var fitScale: Double {
        guard image.width > 0, image.height > 0 else { return 0 }
        return min(container.width / Double(image.width), container.height / Double(image.height))
    }

    /// 사진이 화면에 보이는 크기 = image × fitScale.
    public var displaySize: EditSize {
        EditSize(width: Double(image.width) * fitScale, height: Double(image.height) * fitScale)
    }

    /// 사진 비율 좌표 → 보이는 사진의 왼쪽 위를 원점으로 한 화면 좌표.
    public func screenPoint(forNormalized point: EditPoint) -> EditPoint {
        EditPoint(x: point.x * displaySize.width, y: point.y * displaySize.height)
    }

    /// `screenPoint(forNormalized:)`의 역변환.
    public func normalizedPoint(forScreen point: EditPoint) -> EditPoint {
        let size = displaySize
        guard size.width > 0, size.height > 0 else { return EditPoint(x: 0, y: 0) }
        return EditPoint(x: point.x / size.width, y: point.y / size.height)
    }

    /// 자르기 화면 크기 = 사진이 보이는 크기 + 사방 손잡이 여백(`handleInset`).
    public func cropAreaSize(handleInset: Double) -> EditSize {
        EditSize(width: displaySize.width + 2 * handleInset, height: displaySize.height + 2 * handleInset)
    }
}
