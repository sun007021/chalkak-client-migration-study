import Foundation
import ChalkakCore

// 사진 편집값 모델(플랫폼 공통, docs/spec/features/upload-edit.md "편집값 모델과 좌표").
// Foundation만 쓴다. 픽셀을 실제로 그리는 일(회전·자르기·색)은 App 타깃이 `PhotoPreparing` 구현으로 한다.

public struct PixelSize: Sendable, Hashable {
    public var width: Int
    public var height: Int
    public init(width: Int, height: Int) {
        self.width = width
        self.height = height
    }
    public var longEdge: Int { max(width, height) }
    public var shortEdge: Int { min(width, height) }
}

/// 자르기 영역(편집값). 중심 좌표는 **회전 전 원본**의 가로·세로에 대한 0~1 비율, 크기는 **90도씩 돌린 원본**의 가로·세로에 대한 0~1 비율이다.
public struct CropWindow: Sendable, Equatable {
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
    /// 전체 자르기 (0.5, 0.5, 1, 1).
    public static let full = CropWindow(centerX: 0.5, centerY: 0.5, width: 1, height: 1)

    /// 네 값이 모두 전체 자르기와 `tolerance` 이내로 같은가(REQ-EDIT-004: 1e-3).
    public func isFull(tolerance: Double = 1e-3) -> Bool {
        abs(centerX - 0.5) <= tolerance && abs(centerY - 0.5) <= tolerance
            && abs(width - 1) <= tolerance && abs(height - 1) <= tolerance
    }
}

/// 필터 6종(D-13). 선언 순서가 표시 순서다. 처음은 `.original`.
public enum PhotoFilter: String, Sendable, Equatable, CaseIterable {
    case original, mono, warm, cool, vintage, vivid
}

/// 값을 직접 조정하는 7개 항목(노출, 대비, 하이라이트, 그림자, 블랙 포인트, 채도, 따뜻함). 선언 순서가 표시 순서다. 값 범위 -1~1.
public enum AdjustmentKind: String, Sendable, Hashable, CaseIterable {
    case exposure, contrast, highlights, shadows, blackPoint, saturation, warmth
}

/// 조정 탭의 항목 줄: "자동" + 7개. 처음 선택은 `.auto`.
public enum AdjustmentItem: Sendable, Hashable {
    case auto
    case value(AdjustmentKind)

    /// 화면 순서: 자동, 노출, 대비, 하이라이트, 그림자, 블랙 포인트, 채도, 따뜻함.
    public static var ordered: [AdjustmentItem] { [.auto] + AdjustmentKind.allCases.map { .value($0) } }
}

/// 조정 값 레이어: 분석한 자동 보정값 × 강도 위에 사용자가 직접 만진 값이 덮인다(REQ-EDIT-022~024).
public struct AdjustmentLayers: Sendable, Equatable {
    public static let range: ClosedRange<Double> = -1...1

    /// 분석 결과(항목별 -1~1). 분석 전이면 비어 있다.
    public var autoValues: [AdjustmentKind: Double]
    /// 자동 보정 강도 0~1. 0이면 꺼짐.
    public var autoStrength: Double
    /// 사용자가 직접 만진 항목의 값. 키가 있으면 "만졌다"는 표시다.
    public var userValues: [AdjustmentKind: Double]

    public init(autoValues: [AdjustmentKind: Double] = [:], autoStrength: Double = 0, userValues: [AdjustmentKind: Double] = [:]) {
        self.autoValues = autoValues
        self.autoStrength = autoStrength
        self.userValues = userValues
    }

    /// 자동 보정 몫 = 자동값 × 강도(분석 전·꺼짐이면 0).
    public func autoShare(of kind: AdjustmentKind) -> Double { (autoValues[kind] ?? 0) * autoStrength }

    /// 적용 값: 사용자가 만졌으면 그 값, 아니면 자동 보정 몫.
    public func value(of kind: AdjustmentKind) -> Double { userValues[kind] ?? autoShare(of: kind) }

    public func isTouched(_ kind: AdjustmentKind) -> Bool { userValues[kind] != nil }

    /// 항목을 `value`(-1~1로 자름)로 정한다. 자동 보정 몫과 같은 값(1e-9 이내)이면 만진 표시를 지워 다시 자동 보정을 따르게 한다(REQ-EDIT-023).
    public func setting(_ kind: AdjustmentKind, to value: Double) -> AdjustmentLayers {
        var next = self
        let clamped = min(max(value, Self.range.lowerBound), Self.range.upperBound)
        if abs(clamped - autoShare(of: kind)) <= 1e-9 {
            next.userValues[kind] = nil
        } else {
            next.userValues[kind] = clamped
        }
        return next
    }

    /// 강도를 0~1로 자른 값으로 바꾼다. 사용자가 만진 항목은 그대로 남는다.
    public func settingAutoStrength(_ strength: Double) -> AdjustmentLayers {
        var next = self
        next.autoStrength = min(max(strength, 0), 1)
        return next
    }

    /// 조정 탭 "초기화": 강도 0, 직접 만진 값 모두 지움, 분석해 둔 자동값은 유지(REQ-EDIT-024).
    public func cleared() -> AdjustmentLayers {
        AdjustmentLayers(autoValues: autoValues, autoStrength: 0, userValues: [:])
    }

    /// 적용 값이 모두 0인가.
    public var isNeutral: Bool { AdjustmentKind.allCases.allSatisfy { value(of: $0) == 0 } }
}

/// 편집값 전체. 편집기는 이것만 만들고, 실제 픽셀은 업로드 준비에서 원본에 다시 그린다(REQ-EDIT-002).
public struct PhotoEdit: Sendable, Equatable {
    /// 시계 방향 90도 회전 횟수 0~3.
    public var quarterTurns: Int
    public var crop: CropWindow
    public var filter: PhotoFilter
    public var adjustments: AdjustmentLayers

    public init(quarterTurns: Int = 0, crop: CropWindow = .full, filter: PhotoFilter = .original, adjustments: AdjustmentLayers = AdjustmentLayers()) {
        self.quarterTurns = quarterTurns
        self.crop = crop
        self.filter = filter
        self.adjustments = adjustments
    }

    public static let identity = PhotoEdit()

    /// 수평 보정 각도. UI가 없어 항상 0이다(REQ-EDIT-017).
    public var straightenDegrees: Double { 0 }

    /// 회전 0, 전체 자르기, 원본 필터, 적용 조정 값이 모두 0이면 편집하지 않은 사진이다(REQ-EDIT-005).
    public var isIdentity: Bool {
        quarterTurns == 0 && crop.isFull() && filter == .original && adjustments.isNeutral
    }
}

/// 자르기 비율 9종(D-13). 선언 순서가 표시 순서다: 원본, 자유, 1:1, 4:5, 5:4, 3:4, 4:3, 9:16, 16:9.
public enum CropAspect: Sendable, Equatable, CaseIterable {
    case original, free, square, portrait4x5, landscape5x4, portrait3x4, landscape4x3, portrait9x16, landscape16x9

    /// 가로/세로 비율. `original`·`free`는 nil(원본은 지금 회전 방향의 사진 비율을 쓴다).
    public var ratio: Double? {
        switch self {
        case .original, .free: nil
        case .square: 1
        case .portrait4x5: 4.0 / 5.0
        case .landscape5x4: 5.0 / 4.0
        case .portrait3x4: 3.0 / 4.0
        case .landscape4x3: 4.0 / 3.0
        case .portrait9x16: 9.0 / 16.0
        case .landscape16x9: 16.0 / 9.0
        }
    }

    /// 90도 회전했을 때의 짝(4:5 ↔ 5:4, 3:4 ↔ 4:3, 9:16 ↔ 16:9). 나머지는 자기 자신.
    public var swapped: CropAspect {
        switch self {
        case .portrait4x5: .landscape5x4
        case .landscape5x4: .portrait4x5
        case .portrait3x4: .landscape4x3
        case .landscape4x3: .portrait3x4
        case .portrait9x16: .landscape16x9
        case .landscape16x9: .portrait9x16
        case .original, .free, .square: self
        }
    }

    /// 화면 문구 키(`shared/copy/ko.json`): `edit.ratio.original`, `edit.ratio.free`, `edit.ratio.1-1`, `edit.ratio.4-5` …
    public var copyKey: String {
        switch self {
        case .original: "edit.ratio.original"
        case .free: "edit.ratio.free"
        case .square: "edit.ratio.1-1"
        case .portrait4x5: "edit.ratio.4-5"
        case .landscape5x4: "edit.ratio.5-4"
        case .portrait3x4: "edit.ratio.3-4"
        case .landscape4x3: "edit.ratio.4-3"
        case .portrait9x16: "edit.ratio.9-16"
        case .landscape16x9: "edit.ratio.16-9"
        }
    }
}

/// 편집기 하단 탭. 처음은 `.crop`.
public enum PhotoEditTab: Sendable, Equatable, CaseIterable {
    case crop, adjust, filter
}
