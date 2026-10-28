import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport
@testable import ChalkakFeatures

private func near(_ a: Double, _ b: Double, _ tolerance: Double = 1e-9) -> Bool { abs(a - b) <= tolerance }

private func nearFrame(_ a: CropFrame, _ b: CropFrame, _ tolerance: Double = 1e-9) -> Bool {
    near(a.centerX, b.centerX, tolerance) && near(a.centerY, b.centerY, tolerance) && near(a.width, b.width, tolerance) && near(a.height, b.height, tolerance)
}

private func nearWindow(_ a: CropWindow, _ b: CropWindow, _ tolerance: Double = 1e-9) -> Bool {
    near(a.centerX, b.centerX, tolerance) && near(a.centerY, b.centerY, tolerance) && near(a.width, b.width, tolerance) && near(a.height, b.height, tolerance)
}

@Suite("EDIT 회전·자르기 변환", .timeLimit(.minutes(1)))
struct PhotoEditTransformTests {
    private let source = PixelSize(width: 4000, height: 3000)

    @Test("TC-EDIT-016 4000×3000을 한 번 돌린 3000×4000의 왼쪽 절반은 원본 중심 (2000, 2250), CropWindow(0.5, 0.75, 0.5, 1), 출력 1500×4000이다")
    func leftHalfOfRotatedPhoto() {
        let frame = CropFrame(centerX: 0.25, centerY: 0.5, width: 0.5, height: 1)
        #expect(PhotoEditGeometry.rotatedSize(of: source, quarterTurns: 1) == PixelSize(width: 3000, height: 4000))
        let window = PhotoEditGeometry.cropWindow(from: frame, quarterTurns: 1)
        #expect(nearWindow(window, CropWindow(centerX: 0.5, centerY: 0.75, width: 0.5, height: 1)))
        let center = PhotoEditGeometry.sourceCenter(of: window, source: source)
        #expect(near(center.x, 2000, 1e-6) && near(center.y, 2250, 1e-6))
        #expect(PhotoEditGeometry.croppedSize(source: source, quarterTurns: 1, crop: window) == PixelSize(width: 1500, height: 4000))
    }

    @Test("TC-EDIT-017 돌린 사진의 점 (xr, yr)을 원본 점으로: 0:(xr,yr) 1:(yr,H−xr) 2:(W−xr,H−yr) 3:(W−yr,xr)", arguments: [
        (0, 100.0, 200.0, 100.0, 200.0),
        (1, 100.0, 200.0, 200.0, 2900.0),
        (2, 100.0, 200.0, 3900.0, 2800.0),
        (3, 100.0, 200.0, 3800.0, 100.0),
    ])
    func sourcePoint(turns: Int, xr: Double, yr: Double, x: Double, y: Double) {
        let point = PhotoEditGeometry.sourcePoint(rotated: EditPoint(x: xr, y: yr), quarterTurns: turns, source: source)
        #expect(near(point.x, x, 1e-9) && near(point.y, y, 1e-9))
    }

    @Test("TC-EDIT-016 프레임 중심은 회전에 따라 0:(u,v) 1:(v,1−u) 2:(1−u,1−v) 3:(1−v,u)로 원본 비율로 옮겨진다", arguments: [
        (0, 0.3, 0.6, 0.3, 0.6),
        (1, 0.3, 0.6, 0.6, 0.7),
        (2, 0.3, 0.6, 0.7, 0.4),
        (3, 0.3, 0.6, 0.4, 0.3),
    ])
    func windowCenterMapping(turns: Int, u: Double, v: Double, cx: Double, cy: Double) {
        let window = PhotoEditGeometry.cropWindow(from: CropFrame(centerX: u, centerY: v, width: 0.2, height: 0.4), quarterTurns: turns)
        #expect(near(window.centerX, cx) && near(window.centerY, cy))
        #expect(near(window.width, 0.2) && near(window.height, 0.4))
    }

    @Test("TC-EDIT-016 프레임 ↔ CropWindow 변환은 모든 회전에서 왕복하면 원래 값이다", arguments: [0, 1, 2, 3])
    func roundTrip(turns: Int) {
        let frame = CropFrame(centerX: 0.35, centerY: 0.62, width: 0.4, height: 0.5)
        let window = PhotoEditGeometry.cropWindow(from: frame, quarterTurns: turns)
        #expect(nearFrame(PhotoEditGeometry.cropFrame(from: window, quarterTurns: turns), frame))
    }

    @Test("TC-EDIT-016 회전 크기: 짝수 번이면 그대로, 홀수 번이면 가로·세로가 바뀐다", arguments: [(0, 4000, 3000), (1, 3000, 4000), (2, 4000, 3000), (3, 3000, 4000)])
    func rotatedSizes(turns: Int, width: Int, height: Int) {
        #expect(PhotoEditGeometry.rotatedSize(of: source, quarterTurns: turns) == PixelSize(width: width, height: height))
    }

    @Test("TC-EDIT-020 8000×6000의 중앙 25%×25% 자르기는 먼저 4096 이하(4000×3000)로 줄인 뒤 잘라 출력이 1000×750이다")
    func shrinksBeforeCrop() {
        let edit = PhotoEdit(crop: CropWindow(centerX: 0.5, centerY: 0.5, width: 0.25, height: 0.25))
        let output = PhotoEditGeometry.uploadOutputSize(source: PixelSize(width: 8000, height: 6000), edit: edit)
        #expect(output == PixelSize(width: 1000, height: 750))
    }

    @Test("TC-EDIT-020 회전만 한 큰 사진도 줄인 뒤 돌려 3000×4000이고, 작은 사진은 확대하지 않는다")
    func uploadOutputSizeVariants() {
        let rotated = PhotoEdit(quarterTurns: 1)
        #expect(PhotoEditGeometry.uploadOutputSize(source: PixelSize(width: 8000, height: 6000), edit: rotated) == PixelSize(width: 3000, height: 4000))
        #expect(PhotoEditGeometry.uploadOutputSize(source: PixelSize(width: 1600, height: 1200), edit: .identity) == PixelSize(width: 1600, height: 1200))
    }

    @Test("TC-EDIT-009 긴 변이 4096 이하인 편집 입력은 줄이지 않고, 넘으면 4096 이하로 줄여 편집에 넘긴다")
    func editInputSizing() {
        #expect(PostImageSizing.sampledSize(for: PixelSize(width: 4096, height: 3072)).longEdge <= 4096)
        #expect(PostImageSizing.sampledSize(for: PixelSize(width: 8000, height: 6000)).longEdge <= 4096)
    }

    @Test("TC-EDIT-021 수평 보정 각도는 항상 0이다")
    func straightenIsZero() {
        #expect(PhotoEdit.identity.straightenDegrees == 0)
        #expect(PhotoEdit(quarterTurns: 3, crop: CropWindow(centerX: 0.4, centerY: 0.4, width: 0.5, height: 0.5), filter: .vivid).straightenDegrees == 0)
    }

    @Test("TC-EDIT-005 TC-EDIT-011 회전 0·전체 자르기·원본 필터·조정 0이면 편집하지 않은 사진(isIdentity)이다")
    func identity() {
        #expect(PhotoEdit.identity.isIdentity)
        #expect(PhotoEdit().isIdentity)
        // 자동 보정이 꺼져 있으면(강도 0) 분석값이 있어도 적용 값은 0이다.
        #expect(PhotoEdit(adjustments: AdjustmentLayers(autoValues: [.exposure: 0.4], autoStrength: 0)).isIdentity)
    }

    @Test("TC-EDIT-011 하나라도 바뀌면 isIdentity가 아니다", arguments: [
        PhotoEdit(quarterTurns: 1),
        PhotoEdit(crop: CropWindow(centerX: 0.5, centerY: 0.5, width: 0.9, height: 1)),
        PhotoEdit(filter: .mono),
        PhotoEdit(adjustments: AdjustmentLayers(userValues: [.exposure: 0.1])),
        PhotoEdit(adjustments: AdjustmentLayers(autoValues: [.contrast: 0.2], autoStrength: 1)),
    ])
    func notIdentity(edit: PhotoEdit) {
        #expect(!edit.isIdentity)
    }

    @Test("TC-EDIT-004 CropWindow.isFull은 네 값이 전체와 1e-3 이내일 때만 참이다")
    func isFullTolerance() {
        #expect(CropWindow.full.isFull())
        #expect(CropWindow(centerX: 0.5005, centerY: 0.4995, width: 0.9995, height: 1).isFull())
        #expect(!CropWindow(centerX: 0.5, centerY: 0.5, width: 0.99, height: 1).isFull())
        #expect(!CropWindow(centerX: 0.52, centerY: 0.5, width: 1, height: 1).isFull())
    }
}

@Suite("EDIT 자르기 프레임 조작", .timeLimit(.minutes(1)))
struct CropGeometryTests {
    private let image = PixelSize(width: 4000, height: 3000)

    @Test("TC-EDIT-018 최소 자르기 비율은 0.1이다")
    func minFraction() {
        #expect(CropGeometry.minCropFraction == 0.1)
    }

    @Test("TC-EDIT-018 고정 비율의 가장 큰 프레임은 사진 안에 들어가고 중앙이다", arguments: [
        (1.0, 0.75, 1.0), (16.0 / 9.0, 1.0, 0.75), (4.0 / 5.0, 0.6, 1.0),
    ])
    func largestFrame(aspect: Double, width: Double, height: Double) {
        let frame = CropGeometry.largestFrame(aspect: aspect, in: image)
        #expect(nearFrame(frame, CropFrame(centerX: 0.5, centerY: 0.5, width: width, height: height), 1e-9))
        #expect(near((frame.width * 4000) / (frame.height * 3000), aspect, 1e-9))
    }

    @Test("TC-EDIT-018 프레임을 끌어 옮기면 크기는 그대로이고 사진 밖으로 나가지 않는다")
    func moveClampsInsideImage() {
        let frame = CropFrame(centerX: 0.5, centerY: 0.5, width: 0.4, height: 0.4)
        let right = CropGeometry.moved(frame, byX: 0.5, y: 0)
        #expect(near(right.centerX, 0.8) && near(right.centerY, 0.5) && near(right.width, 0.4) && near(right.height, 0.4))
        let up = CropGeometry.moved(frame, byX: 0, y: -1)
        #expect(near(up.centerY, 0.2) && near(up.centerX, 0.5))
        let inside = CropGeometry.moved(frame, byX: 0.1, y: -0.05)
        #expect(near(inside.centerX, 0.6) && near(inside.centerY, 0.45))
    }

    @Test("TC-EDIT-018 자유 비율로 모서리를 사진 밖으로 끌면 경계에서 멈추고 반대쪽 모서리는 고정이다")
    func freeResizeClampsToImage() {
        let frame = CropFrame(centerX: 0.5, centerY: 0.5, width: 0.4, height: 0.4)
        let topLeft = CropGeometry.resized(frame, handle: .topLeft, to: EditPoint(x: -0.2, y: -0.3), aspect: nil, in: image)
        #expect(nearFrame(topLeft, CropFrame(centerX: 0.35, centerY: 0.35, width: 0.7, height: 0.7)))
        let bottomRight = CropGeometry.resized(frame, handle: .bottomRight, to: EditPoint(x: 1.5, y: 1.5), aspect: nil, in: image)
        #expect(nearFrame(bottomRight, CropFrame(centerX: 0.65, centerY: 0.65, width: 0.7, height: 0.7)))
    }

    @Test("TC-EDIT-018 자유 비율에서 모서리를 안쪽으로 끌면 그 점이 새 모서리가 된다")
    func freeResizeInside() {
        let frame = CropFrame(centerX: 0.5, centerY: 0.5, width: 0.4, height: 0.4)
        let resized = CropGeometry.resized(frame, handle: .bottomRight, to: EditPoint(x: 0.6, y: 0.55), aspect: nil, in: image)
        #expect(nearFrame(resized, CropFrame(centerX: 0.45, centerY: 0.425, width: 0.3, height: 0.25)))
    }

    @Test("TC-EDIT-018 최소 크기(짧은 변의 0.1배 = 300px) 아래로 줄지 않는다")
    func minimumSize() {
        let frame = CropFrame(centerX: 0.5, centerY: 0.5, width: 0.4, height: 0.4)
        let resized = CropGeometry.resized(frame, handle: .bottomRight, to: EditPoint(x: 0.31, y: 0.31), aspect: nil, in: image)
        #expect(resized.width * 4000 >= 300 - 1e-6)
        #expect(resized.height * 3000 >= 300 - 1e-6)
        // 고정 모서리(왼쪽 위 0.3, 0.3)는 그대로다.
        #expect(near(resized.centerX - resized.width / 2, 0.3, 1e-9))
        #expect(near(resized.centerY - resized.height / 2, 0.3, 1e-9))
    }

    @Test("TC-EDIT-018 고정 비율에서 모서리를 비율 대각선 위로 끌면 그 점이 새 모서리가 되고 비율이 유지된다")
    func fixedAspectResize() {
        let frame = CropGeometry.largestFrame(aspect: 1, in: image)
        let resized = CropGeometry.resized(frame, handle: .bottomRight, to: EditPoint(x: 0.5, y: 0.5), aspect: 1, in: image)
        #expect(near(resized.width, 0.375, 1e-9) && near(resized.height, 0.5, 1e-9))
        #expect(near(resized.centerX - resized.width / 2, 0.125, 1e-9))
        #expect(near(resized.centerY - resized.height / 2, 0, 1e-9))
    }

    @Test("TC-EDIT-018 고정 비율에서 사진 밖으로 끌어도 비율이 유지되고 경계 안에 들어간다")
    func fixedAspectClampsToImage() {
        let frame = CropGeometry.largestFrame(aspect: 1, in: image)
        let resized = CropGeometry.resized(frame, handle: .bottomRight, to: EditPoint(x: 2, y: 2), aspect: 1, in: image)
        #expect(near((resized.width * 4000) / (resized.height * 3000), 1, 1e-9))
        #expect(resized.centerX - resized.width / 2 >= -1e-9 && resized.centerX + resized.width / 2 <= 1 + 1e-9)
        #expect(resized.centerY - resized.height / 2 >= -1e-9 && resized.centerY + resized.height / 2 <= 1 + 1e-9)
        #expect(near(resized.width, 0.75, 1e-9) && near(resized.height, 1, 1e-9))
    }

    @Test("TC-EDIT-018 고정 비율에서도 최소 크기 아래로 줄지 않고 비율이 유지된다")
    func fixedAspectMinimum() {
        let frame = CropGeometry.largestFrame(aspect: 1, in: image)
        let resized = CropGeometry.resized(frame, handle: .bottomRight, to: EditPoint(x: 0.13, y: 0.002), aspect: 1, in: image)
        #expect(near((resized.width * 4000) / (resized.height * 3000), 1, 1e-9))
        #expect(resized.width * 4000 >= 300 - 1e-6)
        #expect(resized.height * 3000 >= 300 - 1e-6)
    }

    @Test("TC-EDIT-018 네 모서리 모두 같은 규칙으로 동작한다(왼쪽 아래, 오른쪽 위)")
    func otherHandles() {
        let frame = CropFrame(centerX: 0.5, centerY: 0.5, width: 0.4, height: 0.4)
        let bottomLeft = CropGeometry.resized(frame, handle: .bottomLeft, to: EditPoint(x: -1, y: 2), aspect: nil, in: image)
        #expect(nearFrame(bottomLeft, CropFrame(centerX: 0.35, centerY: 0.65, width: 0.7, height: 0.7)))
        let topRight = CropGeometry.resized(frame, handle: .topRight, to: EditPoint(x: 2, y: -1), aspect: nil, in: image)
        #expect(nearFrame(topRight, CropFrame(centerX: 0.65, centerY: 0.35, width: 0.7, height: 0.7)))
    }
}

@Suite("EDIT 화면 좌표 변환", .timeLimit(.minutes(1)))
struct CropViewportTests {
    private let image = PixelSize(width: 4000, height: 3000)

    @Test("TC-EDIT-019 fitScale은 사진을 컨테이너 안에 맞추는 배율이다", arguments: [
        (400.0, 600.0, 0.1), (800.0, 300.0, 0.1), (200.0, 150.0, 0.05),
    ])
    func fitScale(width: Double, height: Double, expected: Double) {
        let viewport = CropViewport(image: image, container: EditSize(width: width, height: height))
        #expect(near(viewport.fitScale, expected, 1e-12))
    }

    @Test("TC-EDIT-019 보이는 사진 크기는 사진 크기 × fitScale이다")
    func displaySize() {
        let viewport = CropViewport(image: image, container: EditSize(width: 400, height: 600))
        #expect(near(viewport.displaySize.width, 400) && near(viewport.displaySize.height, 300))
    }

    @Test("TC-EDIT-019 사진 비율 좌표 ↔ 화면 좌표 왕복 오차는 1e-6 이하이다")
    func roundTrip() {
        let viewport = CropViewport(image: image, container: EditSize(width: 390, height: 520))
        for (x, y) in [(0.0, 0.0), (1.0, 1.0), (0.5, 0.5), (0.123, 0.877), (0.999, 0.001)] {
            let screen = viewport.screenPoint(forNormalized: EditPoint(x: x, y: y))
            let back = viewport.normalizedPoint(forScreen: screen)
            #expect(near(back.x, x, 1e-6) && near(back.y, y, 1e-6))
        }
        let center = viewport.screenPoint(forNormalized: EditPoint(x: 0.5, y: 0.5))
        #expect(near(center.x, viewport.displaySize.width / 2) && near(center.y, viewport.displaySize.height / 2))
    }

    @Test("TC-EDIT-019 자르기 화면 크기는 사진이 보이는 크기에 사방 손잡이 여백만 더한 크기이다")
    func cropAreaSize() {
        let viewport = CropViewport(image: image, container: EditSize(width: 400, height: 600))
        let size = viewport.cropAreaSize(handleInset: 20)
        #expect(near(size.width, 440) && near(size.height, 340))
    }
}

@Suite("EDIT 리뷰 반영: 크기·회전 경계", .timeLimit(.minutes(1)))
struct PhotoEditReviewTests {
    @Test("TC-EDIT-020 아주 작은 자르기도 출력 크기는 최소 1×1이다")
    func croppedSizeAtLeastOne() {
        let size = PhotoEditGeometry.croppedSize(source: PixelSize(width: 4000, height: 3000), quarterTurns: 0, crop: CropWindow(centerX: 0.5, centerY: 0.5, width: 0.0001, height: 0.0001))
        #expect(size == PixelSize(width: 1, height: 1))
    }

    @MainActor
    @Test("TC-EDIT-015 원본 비율의 부분 영역은 회전하면 영역이 사진과 함께 돈다")
    func originalAspectPartialFrameRotates() async {
        let vm = PhotoEditViewModel(photo: UploadFixtures.photo(1), isFirstSelection: true, preparer: FakeEditPreparer(), autoAdjuster: FakeAutoAdjuster())
        await vm.start()
        vm.selectAspect(.original)
        vm.resizeCrop(handle: .bottomRight, to: EditPoint(x: 0.5, y: 0.5))
        let before = vm.frame
        vm.rotate()
        #expect(vm.aspect == .original)
        #expect(near(vm.frame.centerX, 1 - before.centerY) && near(vm.frame.centerY, before.centerX))
        #expect(near(vm.frame.width, before.height) && near(vm.frame.height, before.width))
    }
}
