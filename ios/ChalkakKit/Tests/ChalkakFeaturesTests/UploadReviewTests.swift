import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

// 리뷰 반영(PR G): 사진 로딩 중 제출, POST 404 판정, today 확인 실패 매핑, 판정 뒤 정리, 편집기 요청 식별.

@MainActor
private func readyVM(_ world: UploadWorld) async -> UploadViewModel {
    let vm = await world.makeViewModelWithPhoto()
    await vm.waitForBackgroundWork()
    return vm
}

@MainActor
@Suite("UPL 리뷰 반영: 제출 경계와 판정", .timeLimit(.minutes(1)))
struct UploadReviewTests {
    private let world = UploadWorld()

    // MARK: 사진 로딩 중 제출

    @Test("TC-UPL-038 사진 로딩 중 제출이 시작되면 늦게 끝난 로딩은 편집기를 열지 않고 원본을 놓으며, 제출은 그대로 끝난다")
    func loadFinishingDuringSubmitDoesNotOpenEditor() async {
        let vm = await readyVM(world)
        let loadHold = Hold(ignoringCancellation: true)
        await world.loader.setHandler { _, _ in
            try? await loadHold.wait()
            return UploadFixtures.photo(2)
        }
        let uploadHold = Hold()
        await world.creation.setUpload([.success(())], hold: uploadHold)
        let picking = Task { @MainActor in await vm.photoPicked(UploadFixtures.bytes, source: .album) }
        #expect(await EventWait.signal(world.loader.entered, atLeast: 2, before: picking))
        let submitting = Task { @MainActor in await vm.submit() }
        #expect(await EventWait.signal(world.creation.uploadEntered, before: submitting))
        await loadHold.open()
        await picking.value
        #expect(vm.editor == nil)
        #expect(await world.loader.released.contains(UploadFixtures.photo(2)))
        await uploadHold.open()
        await submitting.value
        #expect(vm.success != nil)
        #expect(vm.photo == UploadFixtures.photo(1))
    }

    @Test("TC-UPL-038 제출 중에 닫힌 편집기 결과는 취소로 취급해 준비물을 바꾸지 않는다")
    func editorClosedDuringSubmitIsCancelled() async {
        let vm = await readyVM(world)
        vm.photoTapped()
        let uploadHold = Hold()
        await world.creation.setUpload([.success(())], hold: uploadHold)
        let submitting = Task { @MainActor in await vm.submit() }
        #expect(await EventWait.signal(world.creation.uploadEntered, before: submitting))
        vm.editorClosed(.completed(PhotoEdit(filter: .mono)))
        #expect(vm.edit == .identity)
        await uploadHold.open()
        await submitting.value
        #expect(await world.preparer.callCount == 1)
        #expect(vm.success != nil)
    }

    // MARK: POST 404 판정

    @Test("TC-UPL-065 POST 404(업로드 없음) 뒤 today가 notPosted면 서버 message를 보이고 준비를 처음부터 다시 한다")
    func notFoundUploadShowsServerMessageAndResets() async throws {
        let name = "upload/posts-create__404-upload-not-found.json"
        await world.creation.setCreate([.failure(try uploadAPIError(name))])
        await world.creation.setToday([.success(UploadFixtures.notPosted)])
        let vm = await readyVM(world)
        await vm.submit()
        #expect(vm.notice?.message == (try uploadFixtureMessage(name)))
        #expect(vm.preparation == .none)
        #expect(await world.preparer.live.isEmpty)
        #expect(await world.creation.todayCount == 1)
    }

    @Test("TC-UPL-065 POST 404(주제 없음) 뒤 today가 404나 다른 topicDate면 주제 변경 문구이다", arguments: [true, false])
    func notFoundTopicIsTopicChanged(todayIs404: Bool) async throws {
        await world.creation.setCreate([.failure(try uploadAPIError("upload/posts-create__404-topic-not-found.json"))])
        if todayIs404 {
            await world.creation.setToday([.failure(FeedFailure.notFound)])
        } else {
            await world.creation.setToday([.success(.notPosted(on: UploadFixtures.nextTopicDate))])
        }
        let vm = await readyVM(world)
        await vm.submit()
        #expect(vm.notice?.message == (try copy("upload.error.topic-changed")))
    }

    @Test("TC-UPL-065 POST 404의 message를 바꿔도 분기는 같다(today로만 판정)")
    func notFoundIndependentOfMessage() async throws {
        await world.creation.setCreate([.failure(APIError.http(status: 404, code: .businessError, message: "전혀 다른 문장"))])
        await world.creation.setToday([.success(UploadFixtures.posted)])
        let vm = await readyVM(world)
        await vm.submit()
        #expect(vm.notice?.message == (try copy("upload.error.duplicate")))
    }

    // MARK: 판정 순서와 정리

    @Test("TC-UPL-053 isPosted=true여도 today의 topicDate가 진입 때와 다르면 중복이 아니라 주제 변경이다")
    func postedWithOtherDateIsTopicChanged() async throws {
        await world.creation.setCreate([.failure(try uploadAPIError("upload/posts-create__400-topic-not-open.json"))])
        await world.creation.setToday([.success(.posted(on: UploadFixtures.nextTopicDate, status: .pending))])
        let vm = await readyVM(world)
        await vm.submit()
        #expect(vm.notice?.message == (try copy("upload.error.topic-changed")))
    }

    @Test("TC-UPL-052 TC-UPL-053 중복·주제 변경 판정 뒤에는 이 사진의 준비물(정책·임시 파일)을 버린다", arguments: [true, false])
    func duplicateAndTopicChangedDropPrepared(duplicate: Bool) async throws {
        await world.creation.setCreate([.failure(try uploadAPIError("upload/posts-create__400-already-posted.json"))])
        await world.creation.setToday([.success(duplicate ? UploadFixtures.posted : .notPosted(on: UploadFixtures.nextTopicDate))])
        let vm = await readyVM(world)
        await vm.submit()
        #expect(vm.notice != nil)
        #expect(await world.preparer.live.isEmpty)
        #expect(vm.preparation == .none)
        #expect(vm.photo == UploadFixtures.photo(1))
    }

    // MARK: today 확인 실패 매핑

    @Test("TC-UPL-071 400 판정용 today가 연결 실패면 네트워크 문구이다")
    func judgeTodayNetworkFailure() async throws {
        await world.creation.setCreate([.failure(try uploadAPIError("upload/posts-create__400-already-posted.json"))])
        await world.creation.setToday([.failure(FeedFailure.network)])
        let vm = await readyVM(world)
        await vm.submit()
        #expect(vm.notice?.message == (try copy("upload.error.network")))
    }

    @Test("TC-UPL-071 응답 유실 복구용 today가 403이면 정지, 404면 주제 변경 문구이다", arguments: [403, 404])
    func recoveryTodayStatus(status: Int) async throws {
        await world.creation.setCreate([.failure(APIError.network)])
        await world.creation.setToday([.failure(status == 403 ? FeedFailure.banned : FeedFailure.notFound)])
        let vm = await readyVM(world)
        await vm.submit()
        #expect(vm.notice?.message == (try copy(status == 403 ? "upload.gate.banned" : "upload.error.topic-changed")))
    }

    // MARK: PUT 직전 실제 크기

    @Test("TC-UPL-058 보고된 크기가 작아도 실제 본문이 정책 한도를 넘으면 PUT 없이 막고 준비를 되돌린다")
    func actualBytesGuard() async throws {
        await world.creation.setIssue([.success(UploadFixtures.policy(maxBytes: 4))])
        await world.preparer.setByteCounts([1])
        let vm = await readyVM(world)
        await vm.submit()
        #expect(await world.creation.uploadCalls.isEmpty)
        #expect(vm.notice?.message == (try copy("upload.error.upload")))
        #expect(vm.preparation == .none)
    }

    @Test("TC-UPL-058 PUT이 payloadTooLarge로 막혀도 같은 파일로 반복하지 않고 준비를 되돌린다")
    func payloadTooLargeResets() async {
        await world.creation.setUpload([.failure(PostUploadError.payloadTooLarge)])
        let vm = await readyVM(world)
        await vm.submit()
        #expect(vm.preparation == .none)
        #expect(await world.preparer.live.isEmpty)
    }

    // MARK: 편집기 요청 식별

    @Test("TC-EDIT-006 요청 id가 현재 편집기 요청과 다른 결과는 무시한다")
    func staleEditorResultIgnored() async throws {
        let vm = world.makeViewModel()
        await vm.photoPicked(UploadFixtures.bytes, source: .album)
        let request = try #require(vm.editor)
        vm.editorClosed(.completed(.identity), requestID: request.id + 1)
        #expect(vm.editor != nil)
        #expect(vm.photo == nil)
        vm.editorClosed(.completed(.identity), requestID: request.id)
        #expect(vm.editor == nil)
        #expect(vm.photo == request.photo)
    }
}
