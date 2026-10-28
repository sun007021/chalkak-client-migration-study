import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport
@testable import ChalkakFeatures

private func near(_ a: Double, _ b: Double, _ tolerance: Double = 1e-9) -> Bool { abs(a - b) <= tolerance }

@MainActor
@Suite("EDIT 사진 편집기 ViewModel", .timeLimit(.minutes(1)))
struct PhotoEditViewModelTests {
    private let preparer = FakeEditPreparer()
    private let analyzer = FakeAutoAdjuster()
    /// 4000×3000 사진.
    private let photo = UploadFixtures.photo(1)

    private func make(initial: PhotoEdit = .identity, first: Bool = true) -> PhotoEditViewModel {
        PhotoEditViewModel(photo: photo, initialEdit: initial, isFirstSelection: first, preparer: preparer, autoAdjuster: analyzer)
    }

    private func started(initial: PhotoEdit = .identity, first: Bool = true) async -> PhotoEditViewModel {
        let vm = make(initial: initial, first: first)
        await vm.start()
        return vm
    }

    // MARK: 시작 상태·준비

    @Test("TC-EDIT-001 만들기만 해서는 준비하지 않고, 처음 상태는 자르기 탭·자유 비율·전체 프레임·원본 필터·자동 꺼짐이다")
    func initialState() {
        let vm = make()
        #expect(vm.tab == .crop)
        #expect(vm.aspect == .free)
        #expect(vm.quarterTurns == 0)
        #expect(vm.frame == .full)
        #expect(vm.filter == .original)
        #expect(vm.adjustmentItem == .auto)
        #expect(vm.adjustments.autoStrength == 0)
        #expect(vm.outcome == nil)
        #expect(vm.errorNotice == nil)
        #expect(vm.isFirstSelection)
    }

    @Test("TC-EDIT-001 start를 여러 번 불러도 미리보기 준비와 자동 보정값 분석은 한 번만 일어난다")
    func startIsIdempotent() async {
        let vm = make()
        #expect(await preparer.callCount == 0)
        #expect(await analyzer.callCount == 0)
        await vm.start()
        await vm.start()
        await vm.start()
        #expect(await preparer.callCount == 1)
        #expect(await analyzer.callCount == 1)
        #expect(await analyzer.calls.first == FakeAutoAdjuster.Call(quarterTurns: 0, crop: .full))
    }

    @Test("TC-EDIT-001 분석값은 채워지지만 자동 보정은 꺼져 있어 적용 값은 모두 0이다")
    func analysisDoesNotApply() async {
        let vm = await started()
        #expect(vm.adjustments.autoValues[.exposure] == 0.4)
        #expect(vm.adjustments.autoStrength == 0)
        #expect(vm.adjustments.isNeutral)
    }

    @Test("TC-EDIT-008 미리보기 준비가 실패하면 닫지 않고 렌더링 실패 문구를 보이며, 다시 시작하면 재시도한다")
    func previewFailureKeepsEditorOpen() async throws {
        await preparer.failFirstCalls(1)
        let vm = make()
        await vm.start()
        #expect(vm.errorNotice?.message == (try SharedCopy.require("edit.error.render")))
        #expect(vm.outcome == nil)
        await vm.start()
        #expect(await preparer.callCount == 2)
        #expect(vm.errorNotice == nil)
    }

    @Test("TC-EDIT-005 재편집 값이 있으면 그 상태로 시작한다(회전, 프레임, 필터)")
    func startsFromInitialEdit() async {
        let initial = PhotoEdit(quarterTurns: 1, crop: CropWindow(centerX: 0.5, centerY: 0.75, width: 0.5, height: 1), filter: .mono)
        let vm = await started(initial: initial, first: false)
        #expect(vm.quarterTurns == 1)
        #expect(vm.filter == .mono)
        #expect(near(vm.frame.centerX, 0.25) && near(vm.frame.centerY, 0.5) && near(vm.frame.width, 0.5) && near(vm.frame.height, 1))
        #expect(vm.aspect == .free)
        #expect(!vm.isFirstSelection)
    }

    // MARK: 완료·취소

    @Test("TC-EDIT-003 완료하면 선택한 회전·필터·자르기를 편집값으로 한 번만 내고 렌더링하지 않는다")
    func doneEmitsEditOnce() async {
        let vm = await started()
        vm.rotate()
        vm.selectFilter(.vivid)
        await vm.done()
        #expect(vm.outcome == .completed(PhotoEdit(quarterTurns: 1, crop: .full, filter: .vivid)))
        await vm.done()
        vm.cancel()
        #expect(vm.outcome == .completed(PhotoEdit(quarterTurns: 1, crop: .full, filter: .vivid)))
        #expect(await preparer.callCount == 1)
    }

    @Test("TC-EDIT-011 아무것도 바꾸지 않고 완료하면 isIdentity인 편집값이다")
    func doneWithoutChangesIsIdentity() async {
        let vm = await started()
        await vm.done()
        #expect(vm.outcome == .completed(.identity))
        if case let .completed(edit) = vm.outcome { #expect(edit.isIdentity) } else { Issue.record("completed여야 한다") }
    }

    @Test("TC-EDIT-004 취소하면 편집값 없이 취소 결과만 나가고 이후 완료는 무시된다")
    func cancelEmitsCancelled() async {
        let vm = await started()
        vm.selectFilter(.mono)
        vm.cancel()
        #expect(vm.outcome == .cancelled)
        await vm.done()
        #expect(vm.outcome == .cancelled)
    }

    @Test("TC-EDIT-005 다시 편집 중 취소도 취소 결과이고 첫 선택 여부는 그대로 전달된다")
    func reEditCancel() async {
        let vm = await started(initial: PhotoEdit(filter: .warm), first: false)
        vm.cancel()
        #expect(vm.outcome == .cancelled)
        #expect(!vm.isFirstSelection)
    }

    @Test("TC-EDIT-003 완료 때 자르기가 전체와 1e-3 이내면 전체로 정규화한다")
    func doneNormalizesNearFullCrop() async {
        let vm = await started()
        vm.resizeCrop(handle: .bottomRight, to: EditPoint(x: 0.9995, y: 1))
        await vm.done()
        #expect(vm.outcome == .completed(.identity))
    }

    @Test("TC-EDIT-016 회전 뒤 왼쪽 절반을 자르고 완료하면 CropWindow(0.5, 0.75, 0.5, 1)이다")
    func doneAfterRotatedHalfCrop() async {
        let vm = await started()
        vm.rotate()
        vm.resizeCrop(handle: .bottomRight, to: EditPoint(x: 0.5, y: 1))
        await vm.done()
        guard case let .completed(edit) = vm.outcome else { Issue.record("completed여야 한다"); return }
        #expect(edit.quarterTurns == 1)
        #expect(near(edit.crop.centerX, 0.5) && near(edit.crop.centerY, 0.75) && near(edit.crop.width, 0.5) && near(edit.crop.height, 1))
    }

    // MARK: 자르기·회전·초기화

    @Test("TC-EDIT-014 비율을 새로 선택하면 이전 자르기 영역을 버리고 전체 사진에서 새 비율로 다시 시작한다")
    func selectAspectRestarts() async {
        let vm = await started()
        vm.selectAspect(.square)
        #expect(vm.aspect == .square)
        #expect(vm.frame == CropGeometry.largestFrame(aspect: 1, in: photo.size))
        vm.moveCrop(byX: -0.05, y: 0)
        vm.selectAspect(.portrait4x5)
        #expect(vm.aspect == .portrait4x5)
        #expect(vm.frame == CropGeometry.largestFrame(aspect: 4.0 / 5.0, in: photo.size))
    }

    @Test("TC-EDIT-014 자유를 고르면 지금 프레임을 유지하고 비율 고정만 푼다")
    func freeKeepsFrame() async {
        let vm = await started()
        vm.selectAspect(.square)
        let frame = vm.frame
        vm.selectAspect(.free)
        #expect(vm.aspect == .free)
        #expect(vm.frame == frame)
    }

    @Test("TC-EDIT-012 원본 비율은 지금 회전 방향의 사진 가로세로 비율을 고정 비율로 쓴다")
    func originalAspectFollowsRotation() async {
        let vm = await started()
        vm.selectAspect(.original)
        #expect(vm.aspect == .original)
        #expect(vm.frame == .full)
        vm.rotate()
        #expect(vm.aspect == .original)
        #expect(vm.frame == .full)
        // 돌린 사진은 3000×4000 — 모서리를 끌어도 3:4(0.75) 비율이 유지된다.
        vm.resizeCrop(handle: .bottomRight, to: EditPoint(x: 0.5, y: 0.5))
        #expect(near((vm.frame.width * 3000) / (vm.frame.height * 4000), 0.75, 1e-9))
    }

    @Test("TC-EDIT-015 90도 회전은 시계 방향으로 돌고 4번이면 원상이다")
    func rotateCycle() async {
        let vm = await started()
        var seen: [Int] = []
        for _ in 0..<4 {
            vm.rotate()
            seen.append(vm.quarterTurns)
        }
        #expect(seen == [1, 2, 3, 0])
        #expect(vm.frame == .full)
        #expect(vm.currentEdit.isIdentity)
    }

    @Test("TC-EDIT-015 고정 비율은 회전 뒤에도 같은 비율로 사진 안에서 가장 크게 다시 맞춘다")
    func rotateRefitsFixedAspect() async {
        let vm = await started()
        vm.selectAspect(.portrait4x5)
        vm.rotate()
        #expect(vm.aspect == .portrait4x5)
        // 돌린 사진은 3000×4000이라 4:5 프레임은 가로를 꽉 채우고 높이는 3750px(0.9375)이다.
        #expect(vm.frame == CropGeometry.largestFrame(aspect: 4.0 / 5.0, in: PixelSize(width: 3000, height: 4000)))
        #expect(near(vm.frame.width, 1) && near(vm.frame.height, 0.9375))
    }

    @Test("TC-EDIT-018 프레임 끌기·모서리 조절은 CropGeometry 규칙을 따른다")
    func dragAndResizeUseGeometry() async {
        let vm = await started()
        vm.resizeCrop(handle: .bottomRight, to: EditPoint(x: 0.6, y: 0.6))
        vm.resizeCrop(handle: .topLeft, to: EditPoint(x: 0.2, y: 0.2))
        #expect(near(vm.frame.centerX, 0.4) && near(vm.frame.width, 0.4))
        vm.moveCrop(byX: 1, y: 1)
        #expect(near(vm.frame.centerX + vm.frame.width / 2, 1))
        #expect(near(vm.frame.centerY + vm.frame.height / 2, 1))
    }

    @Test("TC-EDIT-012 자르기 초기화는 회전·프레임·비율만 되돌리고 필터와 조정은 유지한다")
    func resetCropKeepsFilterAndAdjustments() async {
        let vm = await started()
        vm.rotate()
        vm.selectAspect(.square)
        vm.selectFilter(.vintage)
        vm.setAdjustment(.contrast, to: 0.5)
        vm.resetCrop()
        #expect(vm.quarterTurns == 0)
        #expect(vm.frame == .full)
        #expect(vm.aspect == .free)
        #expect(vm.filter == .vintage)
        #expect(vm.adjustments.value(of: .contrast) == 0.5)
    }

    @Test("TC-EDIT-012 자르기 초기화 + 조정 초기화 + 원본 필터로 돌리면 isIdentity가 된다")
    func resetEverythingIsIdentity() async {
        let vm = await started()
        vm.rotate()
        vm.selectAspect(.portrait3x4)
        vm.selectFilter(.cool)
        vm.setAdjustment(.shadows, to: -0.3)
        #expect(!vm.currentEdit.isIdentity)
        vm.resetCrop()
        vm.resetAdjustments()
        vm.selectFilter(.original)
        #expect(vm.currentEdit.isIdentity)
    }

    @Test("TC-EDIT-001 탭을 고르면 그 탭이 선택된다")
    func selectTab() async {
        let vm = await started()
        await vm.selectTab(.filter)
        #expect(vm.tab == .filter)
        await vm.selectTab(.adjust)
        #expect(vm.tab == .adjust)
    }

    // MARK: 조정·자동 보정

    @Test("TC-EDIT-032 처음 선택된 조정 항목은 자동이고, 다시 누르면 켜짐(1)과 꺼짐(0)을 번갈아 바꾼다")
    func autoItemToggles() async {
        let vm = await started()
        #expect(vm.adjustmentItem == .auto)
        await vm.selectAdjustmentItem(.auto)
        #expect(vm.adjustments.autoStrength == 1)
        await vm.selectAdjustmentItem(.auto)
        #expect(vm.adjustments.autoStrength == 0)
        await vm.selectAdjustmentItem(.auto)
        #expect(vm.adjustments.autoStrength == 1)
    }

    @Test("TC-EDIT-032 다른 항목에서 자동으로 옮겨 오면 꺼져 있을 때만 켠다(켜져 있으면 그대로)")
    func movingToAutoTurnsItOnOnlyWhenOff() async {
        let vm = await started()
        await vm.selectAdjustmentItem(.value(.exposure))
        #expect(vm.adjustmentItem == .value(.exposure))
        #expect(vm.adjustments.autoStrength == 0)
        await vm.selectAdjustmentItem(.auto)
        #expect(vm.adjustmentItem == .auto)
        #expect(vm.adjustments.autoStrength == 1)
        await vm.selectAdjustmentItem(.value(.contrast))
        await vm.selectAdjustmentItem(.auto)
        #expect(vm.adjustments.autoStrength == 1)
    }

    @Test("TC-EDIT-032 자동 보정을 켜면 항목마다 분석값×강도가 적용된다")
    func autoAppliesAnalysis() async {
        let vm = await started()
        await vm.selectAdjustmentItem(.auto)
        #expect(vm.adjustments.value(of: .exposure) == 0.4)
        #expect(vm.adjustments.value(of: .contrast) == 0.2)
        vm.setAutoStrength(0.5)
        #expect(near(vm.adjustments.value(of: .exposure), 0.2) && near(vm.adjustments.value(of: .contrast), 0.1))
    }

    @Test("TC-EDIT-030 직접 만진 항목은 자동 보정을 끄거나 강도를 바꿔도 그대로 남는다")
    func userValueSurvivesAutoChanges() async {
        let vm = await started()
        vm.setAdjustment(.exposure, to: 0.3)
        await vm.selectAdjustmentItem(.auto)
        #expect(vm.adjustments.value(of: .exposure) == 0.3)
        #expect(vm.adjustments.value(of: .contrast) == 0.2)
        vm.setAutoStrength(0)
        #expect(vm.adjustments.value(of: .exposure) == 0.3)
        #expect(vm.adjustments.value(of: .contrast) == 0)
    }

    @Test("TC-EDIT-031 직접 값을 자동 보정 몫으로 되돌리면 다시 자동 보정을 따른다")
    func returningToAutoShare() async {
        let vm = await started()
        await vm.selectAdjustmentItem(.auto)
        vm.setAdjustment(.exposure, to: 0.1)
        #expect(vm.adjustments.isTouched(.exposure))
        vm.setAdjustment(.exposure, to: 0.4)
        #expect(!vm.adjustments.isTouched(.exposure))
    }

    @Test("TC-EDIT-032 조정 초기화는 강도 0 + 직접 값 삭제, 분석값은 유지한다")
    func resetAdjustmentsKeepsAnalysis() async {
        let vm = await started()
        await vm.selectAdjustmentItem(.auto)
        vm.setAdjustment(.warmth, to: 0.5)
        vm.resetAdjustments()
        #expect(vm.adjustments.autoStrength == 0)
        #expect(vm.adjustments.userValues.isEmpty)
        #expect(vm.adjustments.autoValues[.exposure] == 0.4)
    }

    @Test("TC-EDIT-032 사진을 분석할 수 없으면 자동 보정은 아무것도 바꾸지 않는다")
    func analysisUnavailable() async {
        await analyzer.setResult(nil)
        let vm = await started()
        await vm.selectAdjustmentItem(.auto)
        #expect(vm.adjustments.isNeutral)
        #expect(vm.currentEdit.isIdentity)
    }

    // MARK: 자동 보정 재분석

    @Test("TC-EDIT-037 자르기를 바꾸지 않고 탭을 옮기면 재분석하지 않고, 바꾼 뒤 탭을 옮기면 자른 영역 기준으로 다시 분석한다")
    func reanalyzeAfterCropChange() async {
        let vm = await started()
        await vm.selectTab(.adjust)
        await vm.selectTab(.filter)
        #expect(await analyzer.callCount == 1)
        await vm.selectTab(.crop)
        vm.resizeCrop(handle: .bottomRight, to: EditPoint(x: 0.5, y: 1))
        await vm.selectTab(.adjust)
        #expect(await analyzer.callCount == 2)
        let call = await analyzer.calls.last
        #expect(call?.quarterTurns == 0)
        #expect(near(call?.crop.width ?? 0, 0.5) && near(call?.crop.centerX ?? 0, 0.25))
        await vm.selectTab(.filter)
        #expect(await analyzer.callCount == 2)
    }

    @Test("TC-EDIT-037 회전을 바꾸고 탭을 옮겨도 다시 분석한다")
    func reanalyzeAfterRotate() async {
        let vm = await started()
        vm.rotate()
        await vm.selectTab(.adjust)
        #expect(await analyzer.callCount == 2)
        #expect(await analyzer.calls.last?.quarterTurns == 1)
    }

    @Test("TC-EDIT-037 자동 보정을 켠 채 자르기를 바꾸고 바로 완료하면 완료 때 다시 분석해 새 분석값을 담는다")
    func analyzeAtDoneWhenAutoOn() async {
        let vm = await started()
        await vm.selectAdjustmentItem(.auto)
        vm.resizeCrop(handle: .bottomRight, to: EditPoint(x: 0.5, y: 1))
        await analyzer.setResult([.exposure: 0.1])
        await vm.done()
        #expect(await analyzer.callCount == 2)
        guard case let .completed(edit) = vm.outcome else { Issue.record("completed여야 한다"); return }
        #expect(edit.adjustments.autoStrength == 1)
        #expect(edit.adjustments.autoValues == [.exposure: 0.1])
    }

    @Test("TC-EDIT-037 자르기가 그대로면 완료 때 재분석하지 않는다")
    func noReanalysisAtDoneWhenCropUnchanged() async {
        let vm = await started()
        await vm.selectAdjustmentItem(.auto)
        await vm.done()
        #expect(await analyzer.callCount == 1)
    }

    @Test("TC-EDIT-037 자동 보정을 끄고 완료하면 분석값은 저장하지 않는다")
    func autoOffDropsAnalysis() async {
        let vm = await started()
        vm.setAdjustment(.exposure, to: 0.3)
        await vm.done()
        guard case let .completed(edit) = vm.outcome else { Issue.record("completed여야 한다"); return }
        #expect(edit.adjustments.autoValues.isEmpty)
        #expect(edit.adjustments.autoStrength == 0)
        #expect(edit.adjustments.userValues == [.exposure: 0.3])
    }

    @Test("TC-EDIT-037 자동 보정을 켠 채 완료한 사진을 같은 자르기로 다시 열면 저장값을 쓰고 재분석하지 않는다")
    func reopenUsesSavedAnalysis() async {
        let saved = PhotoEdit(adjustments: AdjustmentLayers(autoValues: [.exposure: 0.25], autoStrength: 1))
        let vm = await started(initial: saved, first: false)
        #expect(await analyzer.callCount == 0)
        #expect(vm.adjustments.autoValues == [.exposure: 0.25])
        #expect(vm.adjustments.autoStrength == 1)
        #expect(vm.adjustments.value(of: .exposure) == 0.25)
    }
}
