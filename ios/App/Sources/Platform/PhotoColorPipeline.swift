import Foundation
import ChalkakFeatures

// 사진 편집의 색 연산(조정 → 필터)과 자동 보정 분석. 구현 기준은 docs/spec/features/upload-edit.md "부록: 편집 연산 규격"이다.
// CoreGraphics를 쓰지 않는 순수 계산이라 미리보기와 업로드 결과가 같은 코드를 지난다(REQ-EDIT-002).

/// 8비트 RGBA(premultipliedLast, 불투명) 픽셀 한 장.
struct RGBAImage: Sendable {
    let width: Int
    let height: Int
    var pixels: Data
}

enum PhotoColorPipeline {
    // MARK: sRGB 변환

    static func linear(_ value: Double) -> Double {
        value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
    }

    static func gamma(_ value: Double) -> Double {
        value <= 0.0031308 ? 12.92 * value : 1.055 * pow(value, 1 / 2.4) - 0.055
    }

    private static let gammaTableSize = 16384

    /// 선형 0~1 → 저장 0~1 표(16385칸).
    private static func makeGammaTable() -> [Float] {
        (0...gammaTableSize).map { Float(gamma(Double($0) / Double(gammaTableSize))) }
    }

    /// 저장 0~255 → 선형 표.
    private static func makeLinearTable() -> [Float] {
        (0..<256).map { Float(linear(Double($0) / 255)) }
    }

    // MARK: 톤 곡선

    /// 블랙 포인트 → 그림자 → 하이라이트 → 대비 순으로 t를 갱신한 256칸 표(저장 값 0~1). 줄어들지 않도록 누적 최대값을 취한다.
    static func toneCurve(blackPoint: Double, shadows: Double, highlights: Double, contrast: Double) -> [Float] {
        let inputBlack = max(blackPoint, 0) * 0.3
        let outputBlack = max(-blackPoint, 0) * 0.3
        var table = [Float](repeating: 0, count: 256)
        var running = 0.0
        for index in 0..<256 {
            let x = Double(index) / 255
            var t = min(max((x - inputBlack) / (1 - inputBlack), 0), 1)
            t += shadows * 0.25 * 4 * t * (1 - t) * (1 - t)
            t += highlights * 0.25 * 4 * t * t * (1 - t)
            t -= contrast * 0.6 * sin(2 * Double.pi * t) / (2 * Double.pi)
            let y = outputBlack + (1 - outputBlack) * min(max(t, 0), 1)
            running = max(running, y)
            table[index] = Float(running)
        }
        return table
    }

    // MARK: 필터 4x5 행렬

    /// 원본이면 nil. 행: 결과 R, G, B, A / 열: 입력 R, G, B, A, 더하는 값.
    static func matrix(for filter: PhotoFilter) -> [Float]? {
        switch filter {
        case .original:
            nil
        case .mono:
            [0.299, 0.587, 0.114, 0, 0,
             0.299, 0.587, 0.114, 0, 0,
             0.299, 0.587, 0.114, 0, 0,
             0, 0, 0, 1, 0]
        case .warm:
            [1.08, 0, 0, 0, 8,
             0, 1.02, 0, 0, 4,
             0, 0, 0.88, 0, 0,
             0, 0, 0, 1, 0]
        case .cool:
            [0.9, 0, 0, 0, 0,
             0, 1, 0, 0, 2,
             0, 0, 1.1, 0, 10,
             0, 0, 0, 1, 0]
        case .vintage:
            [0.63, 0.35, 0.09, 0, 18,
             0.16, 0.76, 0.08, 0, 14,
             0.12, 0.24, 0.51, 0, 10,
             0, 0, 0, 1, 0]
        case .vivid:
            [1.2754, -0.2503, -0.0252, 0, 0,
             -0.0746, 1.0997, -0.0252, 0, 0,
             -0.0746, -0.2503, 1.3248, 0, 0,
             0, 0, 0, 1, 0]
        }
    }

    // MARK: 적용

    /// 조정(선형 단계 → 톤 곡선) 뒤 필터를 곱한다(REQ-EDIT-008). 바꿀 것이 없으면 그대로 돌려준다.
    static func apply(to image: RGBAImage, adjustments: AdjustmentLayers, filter: PhotoFilter) -> RGBAImage {
        let exposure = adjustments.value(of: .exposure)
        let contrast = adjustments.value(of: .contrast)
        let highlights = adjustments.value(of: .highlights)
        let shadows = adjustments.value(of: .shadows)
        let blackPoint = adjustments.value(of: .blackPoint)
        let saturation = adjustments.value(of: .saturation)
        let warmth = adjustments.value(of: .warmth)
        let hasLinearStage = exposure != 0 || warmth != 0 || saturation != 0
        let hasToneStage = contrast != 0 || highlights != 0 || shadows != 0 || blackPoint != 0
        let matrix = matrix(for: filter)
        guard hasLinearStage || hasToneStage || matrix != nil else { return image }

        let toLinear = makeLinearTable()
        let toStored = makeGammaTable()
        let tone = toneCurve(blackPoint: blackPoint, shadows: shadows, highlights: highlights, contrast: contrast)
        let gain = Float(pow(2.0, 1.5 * exposure))
        let redGain = gain * Float(1 + 0.25 * warmth)
        let greenGain = gain
        let blueGain = gain * Float(1 - 0.25 * warmth)
        let satFactor = Float(1 + saturation)
        let tableMax = Float(gammaTableSize)

        var output = image
        let count = image.width * image.height
        output.pixels.withUnsafeMutableBytes { raw in
            guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { return }
            for pixel in 0..<count {
                let offset = pixel * 4
                var red = Float(base[offset])
                var green = Float(base[offset + 1])
                var blue = Float(base[offset + 2])
                if hasLinearStage || hasToneStage {
                    var r = toLinear[Int(red)] * redGain
                    var g = toLinear[Int(green)] * greenGain
                    var b = toLinear[Int(blue)] * blueGain
                    if saturation != 0 {
                        let luma = 0.2125 * r + 0.7154 * g + 0.0721 * b
                        r = luma + satFactor * (r - luma)
                        g = luma + satFactor * (g - luma)
                        b = luma + satFactor * (b - luma)
                    }
                    var sr = toStored[Int(min(max(r, 0), 1) * tableMax + 0.5)]
                    var sg = toStored[Int(min(max(g, 0), 1) * tableMax + 0.5)]
                    var sb = toStored[Int(min(max(b, 0), 1) * tableMax + 0.5)]
                    if hasToneStage {
                        sr = interpolate(tone, at: sr)
                        sg = interpolate(tone, at: sg)
                        sb = interpolate(tone, at: sb)
                    }
                    red = sr * 255
                    green = sg * 255
                    blue = sb * 255
                }
                if let matrix {
                    let r = matrix[0] * red + matrix[1] * green + matrix[2] * blue + matrix[4]
                    let g = matrix[5] * red + matrix[6] * green + matrix[7] * blue + matrix[9]
                    let b = matrix[10] * red + matrix[11] * green + matrix[12] * blue + matrix[14]
                    red = r
                    green = g
                    blue = b
                }
                base[offset] = clampByte(red)
                base[offset + 1] = clampByte(green)
                base[offset + 2] = clampByte(blue)
            }
        }
        return output
    }

    private static func interpolate(_ table: [Float], at value: Float) -> Float {
        let position = min(max(value, 0), 1) * 255
        let lower = Int(position)
        if lower >= 255 { return table[255] }
        let fraction = position - Float(lower)
        return table[lower] + (table[lower + 1] - table[lower]) * fraction
    }

    private static func clampByte(_ value: Float) -> UInt8 {
        UInt8(min(max(value.rounded(), 0), 255))
    }

    // MARK: 자동 보정 분석(REQ-EDIT-025~027)

    /// 소수 둘째 자리 반올림(0.5는 0에서 먼 쪽).
    static func round2(_ value: Double) -> Double {
        let sign: Double = value < 0 ? -1 : 1
        return sign * (abs(value) * 100 + 0.5).rounded(.down) / 100
    }

    /// 자른 영역을 긴 변 256 안팎으로 줄인 이미지를 분석해 노출·블랙 포인트·그림자·하이라이트·대비·채도를 정한다.
    /// 픽셀이 없으면 nil. 따뜻함은 정하지 않는다.
    static func analyze(_ image: RGBAImage) -> [AdjustmentKind: Double]? {
        let count = image.width * image.height
        guard count > 0, image.pixels.count >= count * 4 else { return nil }

        var lumaHistogram = [Double](repeating: 0, count: 256)
        var saturationHistogram = [Double](repeating: 0, count: 256)
        var skinCount = 0.0
        image.pixels.withUnsafeBytes { raw in
            let base = raw.bindMemory(to: UInt8.self)
            for pixel in 0..<count {
                let offset = pixel * 4
                let r = Double(base[offset]) / 255
                let g = Double(base[offset + 1]) / 255
                let b = Double(base[offset + 2]) / 255
                let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
                lumaHistogram[min(255, Int((luma * 255).rounded()))] += 1
                let high = max(r, g, b), low = min(r, g, b)
                saturationHistogram[min(255, Int(((high - low) * 255).rounded()))] += 1
                if isSkin(r: r, g: g, b: b) { skinCount += 1 }
            }
        }
        let total = Double(count)
        let luma = lumaHistogram.map { $0 / total }
        let saturationRatios = saturationHistogram.map { $0 / total }

        func percentile(_ histogram: [Double], _ fraction: Double) -> Double {
            var cumulative = 0.0
            for (index, share) in histogram.enumerated() {
                cumulative += share
                if cumulative >= fraction { return Double(index) / 255 }
            }
            return 1
        }

        // 노출
        let white = percentile(luma, 0.995)
        let median = percentile(luma, 0.5)
        var ev = 0.0
        if white < 0.96 {
            ev = log2(linear(0.96) / linear(max(white, 0.05))) * 0.6
        } else if median > 0.62 {
            ev = -(median - 0.62) * 1.2
        }
        ev = min(max(ev, -0.5), 1.0)
        let exposure = round2(ev / 1.5)

        func expose(_ value: Double) -> Double {
            gamma(min(1, linear(value) * pow(2, 1.5 * exposure)))
        }

        // 블랙 포인트
        let black = expose(percentile(luma, 0.005))
        let inputBlack = min(max(black - 0.01, 0) * 0.8, 0.25)
        let blackPoint = round2(inputBlack / 0.3)
        let appliedBlack = max(blackPoint, 0) * 0.3

        func afterBlack(_ value: Double) -> Double {
            min(max((expose(value) - appliedBlack) / (1 - appliedBlack), 0), 1)
        }

        // 그림자·하이라이트
        var dark = 0.0, bright = 0.0
        for (index, share) in luma.enumerated() where share > 0 {
            let value = afterBlack(Double(index) / 255)
            if value < 0.25 { dark += share }
            if value > 0.85 { bright += share }
        }
        let shadows = round2(0.45 * pow(min(max(dark / 0.8, 0), 1), 0.7))
        let highlights = round2(-0.5 * pow(min(max(bright / 0.3, 0), 1), 0.7))

        // 대비
        let spread = afterBlack(percentile(luma, 0.75)) - afterBlack(percentile(luma, 0.25))
        let contrast = round2(min(max((0.42 - spread) * 2.0, 0), 0.4))

        // 채도
        let s = percentile(saturationRatios, 0.9)
        var saturation = 0.0
        if s > 0.05 {
            saturation = round2(min(max((0.7 - s) * 0.6, 0), 0.25) * (1 - skinCount / total))
        }

        return [
            .exposure: exposure,
            .blackPoint: blackPoint,
            .shadows: shadows,
            .highlights: highlights,
            .contrast: contrast,
            .saturation: saturation,
        ]
    }

    /// 피부색: R ≥ G ≥ B, R ≥ 0.2, (R−B)/R가 0.1~0.6, 색상 0~50°.
    private static func isSkin(r: Double, g: Double, b: Double) -> Bool {
        guard r >= g, g >= b, r >= 0.2, r > b else { return false }
        let ratio = (r - b) / r
        guard ratio >= 0.1, ratio <= 0.6 else { return false }
        let hue = 60 * (g - b) / (r - b)
        return hue >= 0 && hue <= 50
    }
}
