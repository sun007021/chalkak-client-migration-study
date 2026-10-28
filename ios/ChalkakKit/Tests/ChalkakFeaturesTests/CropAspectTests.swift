import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport
@testable import ChalkakFeatures

@Suite("EDIT 자르기 비율·조정 모델", .timeLimit(.minutes(1)))
struct CropAspectTests {
    @Test("TC-EDIT-013 비율 목록은 원본, 자유, 1:1, 4:5, 5:4, 3:4, 4:3, 9:16, 16:9 순서이다")
    func order() {
        #expect(CropAspect.allCases == [.original, .free, .square, .portrait4x5, .landscape5x4, .portrait3x4, .landscape4x3, .portrait9x16, .landscape16x9])
        #expect(CropAspect.allCases.map(\.copyKey) == [
            "edit.ratio.original", "edit.ratio.free", "edit.ratio.1-1", "edit.ratio.4-5", "edit.ratio.5-4",
            "edit.ratio.3-4", "edit.ratio.4-3", "edit.ratio.9-16", "edit.ratio.16-9",
        ])
    }

    @Test("TC-EDIT-013 고정 비율의 가로/세로 값, 원본·자유는 nil")
    func ratios() {
        #expect(CropAspect.original.ratio == nil)
        #expect(CropAspect.free.ratio == nil)
        #expect(CropAspect.square.ratio == 1)
        #expect(CropAspect.portrait4x5.ratio == 4.0 / 5.0)
        #expect(CropAspect.landscape5x4.ratio == 5.0 / 4.0)
        #expect(CropAspect.portrait3x4.ratio == 3.0 / 4.0)
        #expect(CropAspect.landscape4x3.ratio == 4.0 / 3.0)
        #expect(CropAspect.portrait9x16.ratio == 9.0 / 16.0)
        #expect(CropAspect.landscape16x9.ratio == 16.0 / 9.0)
    }

    @Test("TC-EDIT-013 세로·가로 짝(4:5↔5:4, 3:4↔4:3, 9:16↔16:9)을 모두 제공하고 나머지는 자기 자신이다")
    func swappedPairs() {
        #expect(CropAspect.portrait4x5.swapped == .landscape5x4)
        #expect(CropAspect.landscape5x4.swapped == .portrait4x5)
        #expect(CropAspect.portrait3x4.swapped == .landscape4x3)
        #expect(CropAspect.landscape4x3.swapped == .portrait3x4)
        #expect(CropAspect.portrait9x16.swapped == .landscape16x9)
        #expect(CropAspect.landscape16x9.swapped == .portrait9x16)
        for same in [CropAspect.original, .free, .square] { #expect(same.swapped == same) }
    }

    @Test("TC-EDIT-023 조정 항목은 자동 + 노출, 대비, 하이라이트, 그림자, 블랙 포인트, 채도, 따뜻함 순서이다")
    func adjustmentOrder() {
        #expect(AdjustmentKind.allCases == [.exposure, .contrast, .highlights, .shadows, .blackPoint, .saturation, .warmth])
        #expect(AdjustmentItem.ordered == [.auto] + AdjustmentKind.allCases.map { AdjustmentItem.value($0) })
        #expect(AdjustmentLayers.range == -1...1)
    }

    @Test("TC-EDIT-039 필터는 원본, 흑백, 따뜻하게, 차갑게, 빈티지, 선명하게 6종이 이 순서이다")
    func filterOrder() {
        #expect(PhotoFilter.allCases == [.original, .mono, .warm, .cool, .vintage, .vivid])
    }

    @Test("TC-EDIT-001 편집기 탭은 자르기, 조정, 필터이다")
    func tabs() {
        #expect(PhotoEditTab.allCases == [.crop, .adjust, .filter])
    }
}

@Suite("EDIT 조정 레이어", .timeLimit(.minutes(1)))
struct AdjustmentLayersTests {
    private let auto: [AdjustmentKind: Double] = [.exposure: 0.4, .contrast: 0.2]

    @Test("TC-EDIT-030 사용자가 만졌으면 사용자 값, 아니면 자동값×강도이다 (강도 1)")
    func userOverAuto() {
        let layers = AdjustmentLayers(autoValues: auto, autoStrength: 1, userValues: [.exposure: 0.3])
        #expect(layers.value(of: .exposure) == 0.3)
        #expect(layers.value(of: .contrast) == 0.2)
    }

    @Test("TC-EDIT-030 강도 0.5면 (0.3, 0.1), 자동을 끄면 (0.3, 0)이다")
    func strengthScales() {
        var layers = AdjustmentLayers(autoValues: auto, autoStrength: 0.5, userValues: [.exposure: 0.3])
        #expect(layers.value(of: .exposure) == 0.3)
        #expect(abs(layers.value(of: .contrast) - 0.1) < 1e-12)
        layers = layers.settingAutoStrength(0)
        #expect(layers.value(of: .exposure) == 0.3)
        #expect(layers.value(of: .contrast) == 0)
    }

    @Test("TC-EDIT-030 자동 보정 몫은 자동값×강도이고 분석 전이면 0이다")
    func autoShare() {
        #expect(abs(AdjustmentLayers(autoValues: auto, autoStrength: 0.5).autoShare(of: .exposure) - 0.2) < 1e-12)
        #expect(AdjustmentLayers(autoStrength: 1).autoShare(of: .exposure) == 0)
        #expect(AdjustmentLayers(autoValues: auto, autoStrength: 0).autoShare(of: .exposure) == 0)
    }

    @Test("TC-EDIT-031 자동 보정 몫과 같은 값으로 되돌리면 직접 만진 표시가 지워져 다시 자동 보정을 따른다")
    func returningToAutoShareClearsTouch() {
        var layers = AdjustmentLayers(autoValues: auto, autoStrength: 1)
        layers = layers.setting(.exposure, to: 0.3)
        #expect(layers.isTouched(.exposure))
        layers = layers.setting(.exposure, to: 0.4)
        #expect(!layers.isTouched(.exposure))
        layers = layers.settingAutoStrength(0.5)
        #expect(abs(layers.value(of: .exposure) - 0.2) < 1e-12)
    }

    @Test("TC-EDIT-031 자동 보정을 켜기 전에 만진 항목은 켜도 사용자 값이 유지된다")
    func touchedBeforeAutoStays() {
        var layers = AdjustmentLayers(autoValues: auto, autoStrength: 0)
        layers = layers.setting(.exposure, to: 0.3)
        layers = layers.settingAutoStrength(1)
        #expect(layers.value(of: .exposure) == 0.3)
        #expect(layers.isTouched(.exposure))
    }

    @Test("TC-EDIT-023 값은 -1~1로 자르고 강도는 0~1로 자른다")
    func clamping() {
        let layers = AdjustmentLayers().setting(.warmth, to: 3).setting(.saturation, to: -3)
        #expect(layers.value(of: .warmth) == 1)
        #expect(layers.value(of: .saturation) == -1)
        #expect(AdjustmentLayers().settingAutoStrength(2).autoStrength == 1)
        #expect(AdjustmentLayers().settingAutoStrength(-1).autoStrength == 0)
    }

    @Test("TC-EDIT-032 조정 탭 초기화는 강도 0, 직접 값 지움, 분석한 자동값은 유지한다")
    func clearedKeepsAnalysis() {
        let layers = AdjustmentLayers(autoValues: auto, autoStrength: 1, userValues: [.exposure: 0.3]).cleared()
        #expect(layers.autoStrength == 0)
        #expect(layers.userValues.isEmpty)
        #expect(layers.autoValues == auto)
        #expect(layers.isNeutral)
    }

    @Test("TC-EDIT-011 적용 값이 모두 0이면 isNeutral이다")
    func neutral() {
        #expect(AdjustmentLayers().isNeutral)
        #expect(AdjustmentLayers(autoValues: auto, autoStrength: 0).isNeutral)
        #expect(!AdjustmentLayers(autoValues: auto, autoStrength: 1).isNeutral)
        #expect(!AdjustmentLayers(userValues: [.shadows: -0.2]).isNeutral)
    }
}
