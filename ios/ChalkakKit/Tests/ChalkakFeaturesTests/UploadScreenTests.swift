import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures


/// 일반 파일 위에서 편집 결과를 "확정"한 상태의 ViewModel을 만든다(준비가 끝날 때까지 기다린다).
@MainActor
private func readyViewModel(_ world: UploadWorld, edit: PhotoEdit = .identity) async -> UploadViewModel {
    let vm = await world.makeViewModelWithPhoto(edit: edit)
    await vm.waitForBackgroundWork()
    return vm
}

// MARK: 주제 조회

@MainActor
@Suite("UPL 업로드 화면 주제", .timeLimit(.minutes(1)))
struct UploadTopicTests {
    private let world = UploadWorld()

    @Test("TC-UPL-011 주제는 GET /topics?date=<topicDate>로 받아 topicId·제목을 가진다")
    func loadsTopic() async {
        await world.useTopic(title: "가을 하늘")
        let vm = world.makeViewModel()
        await vm.loadTopic()
        #expect(vm.topic == .loaded(UploadFixtures.topic(title: "가을 하늘")))
        #expect(await world.topics.requestedDates == [UploadFixtures.topicDate])
        #expect(vm.topicDate == UploadFixtures.topicDate)
    }

    @Test("TC-UPL-011 응답 topicDate가 요청과 다르면 잘못된 응답으로 보고 주제 불러오기 실패 문구를 낸다")
    func mismatchedDate() async throws {
        await world.topics.setHandler { _ in UploadFixtures.topic(date: KSTDate(year: 2026, month: 10, day: 26)!) }
        let vm = world.makeViewModel()
        await vm.loadTopic()
        guard case let .failed(notice) = vm.topic else { Issue.record("failed여야 한다"); return }
        #expect(notice.message == (try copy("upload.topic.load-failed")))
    }

    @Test("TC-UPL-012 주제 조회 404·500·계약 위반은 주제 불러오기 실패 문구이다", arguments: [
        FeedFailure.notFound, .server(status: 500), .invalidResponse, .badRequest(message: "x"),
    ])
    func topicFailure(failure: FeedFailure) async throws {
        await world.topics.setHandler { _ in throw failure }
        let vm = world.makeViewModel()
        await vm.loadTopic()
        guard case let .failed(notice) = vm.topic else { Issue.record("failed여야 한다"); return }
        #expect(notice.message == (try copy("upload.topic.load-failed")))
        #expect(!vm.needsLogin)
    }

    @Test("TC-UPL-012 주제 조회 연결 실패는 네트워크 문구이다")
    func topicNetworkFailure() async throws {
        await world.topics.setHandler { _ in throw FeedFailure.network }
        let vm = world.makeViewModel()
        await vm.loadTopic()
        guard case let .failed(notice) = vm.topic else { Issue.record("failed여야 한다"); return }
        #expect(notice.message == (try copy("upload.error.network")))
    }

    @Test("TC-UPL-012 주제 조회 401은 재인증이다(전시 완료 오류가 아니다)")
    func topicUnauthorized() async {
        await world.topics.setHandler { _ in throw FeedFailure.unauthorized }
        let vm = world.makeViewModel()
        await vm.loadTopic()
        #expect(vm.needsLogin)
        #expect(vm.notice == nil)
    }

    @Test("TC-UPL-012 \"다시 시도\"는 주제만 다시 받고 정책 발급 등 다른 호출은 하지 않는다")
    func retryTopicOnly() async {
        let counter = Counter()
        await world.topics.setHandler { date in
            if await counter.next() == 1 { throw FeedFailure.server(status: 500) }
            return UploadFixtures.topic(date: date)
        }
        let vm = world.makeViewModel()
        await vm.loadTopic()
        await vm.retryTopic()
        #expect(vm.topic == .loaded(UploadFixtures.topic()))
        #expect(await world.topics.requestedDates == [UploadFixtures.topicDate, UploadFixtures.topicDate])
        #expect(await world.creation.todayCount == 0)
        #expect(await world.creation.issueCount == 0)
    }

    @Test("TC-UPL-013 23:59:30에 진입해 00:01에 제출해도 진입 때 고정한 topicDate·topicId로 보내고 시계로 다시 계산하지 않는다")
    func midnightUsesPinnedTopic() async throws {
        let late = UploadWorld(now: Instant.parse("2026-10-27T23:59:30+09:00")!)
        let vm = await readyViewModel(late)
        late.clock.advance(by: .seconds(90))
        #expect(KST.date(of: late.clock.now) == UploadFixtures.nextTopicDate)
        await vm.submit()
        let calls = await late.creation.createCalls
        #expect(calls.map(\.topicId) == [UploadFixtures.topicId])
        #expect(await late.topics.requestedDates == [UploadFixtures.topicDate])
        #expect(vm.topicDate == UploadFixtures.topicDate)
        #expect(vm.success?.topicDate == UploadFixtures.topicDate)
    }

    @Test("TC-UPL-088 화면이 보이면 screen_view photo_upload를 한 번 보낸다(재호출은 중복 전송하지 않는다)")
    func screenView() {
        let vm = world.makeViewModel()
        vm.onAppear()
        vm.onAppear()
        #expect(world.analytics.events == [.screenView(.photoUpload, screenClass: nil)])
    }

    @Test("TC-UPL-087 주제 요청 날짜는 KST yyyy-MM-dd이고 기기·UTC 날짜와 무관하다")
    func topicDateIsKSTString() async {
        // KST 2026-10-27 01:00 = UTC 2026-10-26 16:00
        let early = UploadWorld(now: Instant.parse("2026-10-27T01:00:00+09:00")!)
        let vm = early.makeViewModel()
        await vm.loadTopic()
        #expect(await early.topics.requestedDates.map(\.string) == ["2026-10-27"])
    }
}

// MARK: 사진 선택·편집 연결

@MainActor
@Suite("UPL 사진 선택·촬영·편집 연결", .timeLimit(.minutes(1)))
struct UploadPhotoSelectionTests {
    private let world = UploadWorld()

    @Test("TC-UPL-017 사진을 고르면 항상 편집기를 먼저 열고(첫 선택), 앨범에는 저장하지 않으며 정책 발급은 아직 하지 않는다")
    func albumPickOpensEditor() async {
        let vm = world.makeViewModel()
        await vm.photoPicked(UploadFixtures.bytes, source: .album)
        #expect(vm.editor == UploadViewModel.EditorRequest(photo: UploadFixtures.photo(1), initialEdit: .identity, isFirstSelection: true))
        #expect(await world.loader.loadedData == [UploadFixtures.bytes])
        #expect(await world.gallery.saves.isEmpty)
        #expect(await world.creation.issueCount == 0)
        #expect(vm.preparation == .none)
        #expect(vm.photo == nil)
    }

    @Test("TC-UPL-021 빈 데이터·손상 이미지는 편집기를 열지 않고 사진 준비 실패 문구를 보인다", arguments: [Data(), Data([0x00]), Data(repeating: 0xFF, count: 16)])
    func unreadablePhoto(bytes: Data) async throws {
        await world.loader.setHandler { _, _ in throw PhotoLoadError.unreadable }
        let vm = world.makeViewModel()
        await vm.photoPicked(bytes, source: .album)
        #expect(vm.editor == nil)
        #expect(vm.photo == nil)
        #expect(vm.notice?.message == (try copy("upload.error.prepare")))
        #expect(await world.creation.issueCount == 0)
    }

    @Test("TC-UPL-020 사진 A 로딩 중 B를 고르면 늦게 끝난 A의 결과는 무시되고 최신 선택 B만 편집기에 올라간다")
    func latestPickWins() async {
        let hold = Hold(ignoringCancellation: true)
        await world.loader.setHandler { index, _ in
            if index == 0 {
                await hold.openWait()
                return UploadFixtures.photo(1)
            }
            return UploadFixtures.photo(2)
        }
        let vm = world.makeViewModel()
        let first = Task { @MainActor in await vm.photoPicked(Data([1]), source: .album) }
        #expect(await EventWait.signal(world.loader.entered, before: first))
        await vm.photoPicked(Data([2]), source: .album)
        #expect(vm.editor?.photo == UploadFixtures.photo(2))
        await hold.open()
        await first.value
        #expect(vm.editor?.photo == UploadFixtures.photo(2))
        #expect(vm.photo == nil)
        #expect(await world.loader.released.contains(UploadFixtures.photo(1)))
    }

    @Test("TC-UPL-016 촬영본은 앨범에 한 번만 저장하고(chalkak-photo-*.jpg) 제출 때 다시 저장하지 않는다")
    func cameraSavesOnce() async {
        let vm = world.makeViewModel()
        await vm.photoPicked(UploadFixtures.bytes, source: .camera)
        await vm.waitForBackgroundWork()
        let saves = await world.gallery.saves
        #expect(saves.count == 1)
        #expect(saves.first?.data == UploadFixtures.bytes)
        #expect(saves.first?.fileName.hasPrefix("chalkak-photo-") == true)
        #expect(saves.first?.fileName.hasSuffix(".jpg") == true)
        vm.editorClosed(.completed(.identity))
        await vm.waitForBackgroundWork()
        await vm.submit()
        #expect(await world.gallery.saves.count == 1)
    }

    @Test("TC-UPL-017 앨범에서 고른 사진은 준비·제출 어느 단계에서도 앨범에 저장하지 않는다")
    func albumNeverSaves() async {
        let vm = await readyViewModel(world)
        await vm.submit()
        #expect(await world.gallery.saves.isEmpty)
    }

    @Test("TC-UPL-018 촬영본 앨범 저장이 실패해도 갤러리 저장 실패 토스트만 뜨고 사진은 유지되어 업로드를 계속할 수 있다")
    func gallerySaveFailureOnlyToasts() async throws {
        await world.gallery.configure(fail: true)
        let vm = world.makeViewModel()
        vm.onAppear()
        await vm.photoPicked(UploadFixtures.bytes, source: .camera)
        vm.editorClosed(.completed(.identity))
        await vm.waitForBackgroundWork()
        #expect(vm.toast?.message == (try copy("upload.camera.save-failed")))
        #expect(vm.notice == nil)
        #expect(vm.photo == UploadFixtures.photo(1))
        #expect(vm.isSubmitEnabled)
        await vm.submit()
        #expect(vm.success != nil)
    }

    @Test("TC-UPL-019 화면을 나간 뒤 늦게 끝난 촬영본 저장의 실패는 앱 전역 토스트로 알린다")
    func lateGallerySaveFailureGoesToGlobalNotice() async throws {
        let hold = Hold(ignoringCancellation: true)
        await world.gallery.configure(hold: hold, fail: true)
        let vm = world.makeViewModel()
        vm.onAppear()
        await vm.photoPicked(UploadFixtures.bytes, source: .camera)
        #expect(await vm.reaches(world.gallery.entered))
        await vm.close()
        await hold.open()
        await vm.waitForBackgroundWork()
        #expect(world.globalNotices.messages == [try copy("upload.camera.save-failed")])
        #expect(vm.toast == nil)
    }

    @Test("TC-UPL-019 화면이 보이는 동안의 저장 실패는 전역 토스트를 쓰지 않는다")
    func visibleFailureDoesNotUseGlobalNotice() async {
        await world.gallery.configure(fail: true)
        let vm = world.makeViewModel()
        vm.onAppear()
        await vm.photoPicked(UploadFixtures.bytes, source: .camera)
        await vm.waitForBackgroundWork()
        #expect(world.globalNotices.messages.isEmpty)
    }

    @Test("TC-EDIT-004 처음 고른 사진의 편집을 취소하면 사진 선택이 취소되어 사진이 없고 정책 발급도 없다")
    func cancelFirstEditDropsPhoto() async {
        let vm = world.makeViewModel()
        await vm.photoPicked(UploadFixtures.bytes, source: .album)
        vm.editorClosed(.cancelled)
        await vm.waitForBackgroundWork()
        #expect(vm.editor == nil)
        #expect(vm.photo == nil)
        #expect(vm.preparation == .none)
        #expect(!vm.isSubmitEnabled)
        #expect(await world.creation.issueCount == 0)
        #expect(await world.loader.released.contains(UploadFixtures.photo(1)))
    }

    @Test("TC-EDIT-004 이미 사진이 있을 때 다른 사진 편집을 취소하면 기존 사진·편집값·준비 결과가 그대로이다")
    func cancelReplacementKeepsPrevious() async {
        let vm = await readyViewModel(world)
        await vm.photoPicked(UploadFixtures.bytes, source: .album)
        vm.editorClosed(.cancelled)
        await vm.waitForBackgroundWork()
        #expect(vm.photo == UploadFixtures.photo(1))
        #expect(vm.preparation == .ready)
        #expect(await world.creation.issueCount == 1)
        #expect(await world.preparer.discarded.isEmpty)
    }

    @Test("TC-EDIT-005 다시 편집 중 취소하면 이전 선택·편집값·준비 결과가 유지된다")
    func cancelReeditKeepsEverything() async {
        let edit = PhotoEdit(filter: .warm)
        let vm = await readyViewModel(world, edit: edit)
        vm.photoTapped()
        #expect(vm.editor == UploadViewModel.EditorRequest(photo: UploadFixtures.photo(1), initialEdit: edit, isFirstSelection: false))
        vm.editorClosed(.cancelled)
        await vm.waitForBackgroundWork()
        #expect(vm.editor == nil)
        #expect(vm.photo == UploadFixtures.photo(1))
        #expect(vm.edit == edit)
        #expect(vm.preparation == .ready)
        #expect(await world.creation.issueCount == 1)
        #expect(await world.preparer.callCount == 1)
        #expect(await world.preparer.discarded.isEmpty)
    }

    @Test("TC-EDIT-006 사진을 탭해 다시 편집하고 다른 편집값으로 완료하면 이전 준비를 버리고 새 정책으로 다시 준비한다")
    func reeditWithDifferentEdit() async {
        let vm = await readyViewModel(world)
        vm.photoTapped()
        vm.editorClosed(.completed(PhotoEdit(filter: .mono)))
        await vm.waitForBackgroundWork()
        #expect(vm.edit == PhotoEdit(filter: .mono))
        #expect(await world.creation.issueCount == 2)
        let calls = await world.preparer.calls
        #expect(calls.map(\.edit) == [.identity, PhotoEdit(filter: .mono)])
        #expect(await world.preparer.live.count == 1)
        #expect(await world.preparer.discarded.count == 1)
        #expect(vm.preparation == .ready)
    }

    @Test("TC-EDIT-006 TC-UPL-028 같은 편집값으로 다시 완료하면 다시 준비하지 않는다")
    func reeditWithSameEdit() async {
        let edit = PhotoEdit(quarterTurns: 1)
        let vm = await readyViewModel(world, edit: edit)
        vm.photoTapped()
        vm.editorClosed(.completed(edit))
        await vm.waitForBackgroundWork()
        #expect(await world.creation.issueCount == 1)
        #expect(await world.preparer.callCount == 1)
        #expect(await world.preparer.discarded.isEmpty)
        #expect(vm.preparation == .ready)
    }

    @Test("TC-UPL-047 사진이 없으면 전시하기는 비활성이고, 사진을 고르면 준비 상태와 무관하게 활성이다")
    func submitEnabledRules() async {
        let vm = world.makeViewModel()
        #expect(!vm.isSubmitEnabled)
        #expect(vm.submitTitle == UploadCopy.submit)
        let hold = Hold()
        await world.preparer.setHolds([hold])
        await vm.photoPicked(UploadFixtures.bytes, source: .album)
        vm.editorClosed(.completed(.identity))
        #expect(await vm.reaches(world.preparer.entered))
        #expect(vm.preparation == .encoding)
        #expect(vm.isSubmitEnabled)
        await hold.open()
        await vm.waitForBackgroundWork()
        #expect(vm.isSubmitEnabled)
    }

    @Test("TC-UPL-047 준비 실패 뒤에도 전시하기는 활성이다")
    func submitEnabledAfterPrepareFailure() async {
        await world.creation.setIssue([.failure(APIError.http(status: 500, code: .internalError, message: nil))])
        let vm = await readyViewModel(world)
        guard case .failed = vm.preparation else { Issue.record("준비 실패여야 한다"); return }
        #expect(vm.isSubmitEnabled)
    }
}

private extension Hold {
    /// 열릴 때까지 기다린다(취소를 무시하는 Hold용: `wait`의 throws를 무시).
    func openWait() async { try? await wait() }
}
