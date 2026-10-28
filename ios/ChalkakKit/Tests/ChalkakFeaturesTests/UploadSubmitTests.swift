import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

// 제출(PUT → POST), 정책 만료·재발급, 실패 분기, 응답 유실 복구(D-02·D-07), 제목, 성공 상태.

@MainActor
@Suite("UPL 제출 흐름", .timeLimit(.minutes(1)))
struct UploadSubmitTests {
    private let world = UploadWorld()

    /// 사진을 고르고 편집을 마쳐 준비(정책 + 파일)가 끝난 상태.
    private func ready(_ world: UploadWorld, title: String? = nil) async -> UploadViewModel {
        let vm = await world.makeViewModelWithPhoto()
        if let title { vm.setTitle(title) }
        await vm.waitForBackgroundWork()
        return vm
    }

    private func submitTask(_ vm: UploadViewModel) -> Task<Void, Never> {
        Task { @MainActor in await vm.submit() }
    }

    private func message(_ vm: UploadViewModel) -> String? { vm.notice?.message }

    // MARK: 대기·진행

    @Test("TC-UPL-048 사진 준비 중에 전시하기를 누르면 버튼이 전시 중...이 되고 준비가 끝난 뒤에 PUT·POST를 진행한다")
    func submitWaitsForPreparation() async throws {
        let encodeHold = Hold()
        let uploadHold = Hold()
        await world.preparer.setHolds([encodeHold])
        await world.creation.setUpload([.success(())], hold: uploadHold)
        let vm = world.makeViewModel()
        await world.useTopic()
        await vm.loadTopic()
        await vm.photoPicked(UploadFixtures.bytes, source: .album)
        vm.editorClosed(.completed(.identity))
        #expect(await vm.reaches(world.preparer.entered))
        #expect(vm.isSubmitEnabled)
        let task = submitTask(vm)
        await encodeHold.open()
        #expect(await EventWait.signal(world.creation.uploadEntered, before: task))
        #expect(vm.isSubmitting)
        #expect(vm.submitTitle == (try copy("upload.submitting")))
        #expect(await world.preparer.created.count == 1)
        await uploadHold.open()
        await task.value
        #expect(await world.creation.order == ["issue", "upload", "create"])
        #expect(vm.success != nil)
        #expect(vm.submitTitle != "")
    }

    @Test("TC-UPL-073 제출 중 전시하기를 연타해도 PUT·POST는 한 번씩만 나가고 완료 뒤 반복 탭은 무시된다")
    func doubleTap() async {
        let hold = Hold()
        let vm = await ready(world)
        await world.creation.setCreate([.success(CreatedPost(postId: UploadFixtures.postId, status: .pending))], hold: hold)
        let first = submitTask(vm)
        #expect(await EventWait.signal(world.creation.createEntered, before: first))
        #expect(!vm.isSubmitEnabled)
        await vm.submit()
        await vm.submit()
        await hold.open()
        await first.value
        await vm.submit()
        #expect(await world.creation.uploadCalls.count == 1)
        #expect(await world.creation.createCalls.count == 1)
        #expect(await world.creation.issueCount == 1)
    }

    @Test("TC-UPL-047 사진이 없으면 전시하기가 비활성이고, 준비 중이어도 사진이 있으면 활성이다")
    func submitEnabled() async {
        let vm = world.makeViewModel()
        #expect(!vm.isSubmitEnabled)
        let ready = await ready(world)
        #expect(ready.isSubmitEnabled)
    }

    // MARK: 정책 만료

    @Test("TC-UPL-049 정책 발급 후 294.999초면 기존 정책(uploadUrl, uploadId)으로 PUT한다")
    func policyStillUsable() async {
        let vm = await ready(world)
        world.clock.advance(by: .milliseconds(294_999))
        await vm.submit()
        let uploads = await world.creation.uploadCalls
        #expect(uploads.map(\.policy) == [UploadFixtures.policy(id: UploadFixtures.uploadId1)])
        #expect(await world.creation.issueCount == 1)
        #expect(await world.creation.uploadIdsCreated == [UploadFixtures.uploadId1])
    }

    @Test("TC-UPL-050 정책 발급 후 295초에는 새 정책을 받아 다른 uploadId로 PUT·POST한다", arguments: [295, 299, 301])
    func policyExpired(seconds: Int) async {
        await world.creation.setIssue([
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId1)),
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId2)),
        ])
        let vm = await ready(world)
        world.clock.advance(by: .seconds(seconds))
        await vm.submit()
        #expect(await world.creation.issueCount == 2)
        #expect((await world.creation.uploadCalls).map(\.policy.uploadId) == [UploadFixtures.uploadId2])
        #expect(await world.creation.uploadIdsCreated == [UploadFixtures.uploadId2])
        #expect(vm.success != nil)
    }

    @Test("TC-UPL-051 벽시계를 +10분 바꿔도 단조 시계 100초 경과면 기존 정책을, -10분이어도 296초 경과면 새 정책을 쓴다")
    func monotonicClockDecides() async {
        await world.creation.setIssue([
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId1)),
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId2)),
        ])
        let vm = await ready(world)
        world.clock.advance(by: .seconds(100))
        world.clock.setNow(world.clock.now.addingTimeInterval(600))
        await vm.submit()
        #expect(await world.creation.issueCount == 1)

        let other = UploadWorld()
        await other.creation.setIssue([
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId1)),
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId2)),
        ])
        let second = await ready(other)
        other.clock.advance(by: .seconds(296))
        other.clock.setNow(other.clock.now.addingTimeInterval(-600))
        await second.submit()
        #expect(await other.creation.issueCount == 2)
        #expect(await other.creation.uploadIdsCreated == [UploadFixtures.uploadId2])
    }

    @Test("TC-UPL-052 재발급 정책의 maxBytes가 파일 크기 이상이면 준비한 파일을 재사용하고 새 uploadId로 PUT한다")
    func reissueReusesFile() async {
        await world.creation.setIssue([
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId1)),
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId2, maxBytes: 5_000_000)),
        ])
        await world.preparer.setByteCounts([4_000_000])
        let vm = await ready(world)
        world.clock.advance(by: .seconds(300))
        await vm.submit()
        #expect(await world.preparer.callCount == 1)
        #expect(await world.creation.uploadCalls.count == 1)
        #expect(vm.success != nil)
    }

    @Test("TC-UPL-052 재발급 정책의 maxBytes가 더 작아 파일이 초과하면 저장한 편집값을 다시 적용해 원본에서 재인코딩한다")
    func reissueReencodes() async {
        await world.creation.setIssue([
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId1)),
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId2, maxBytes: 2_000_000)),
        ])
        await world.preparer.setByteCounts([4_000_000, 1_500_000])
        let edit = PhotoEdit(quarterTurns: 1)
        let vm = await world.makeViewModelWithPhoto(edit: edit)
        await vm.waitForBackgroundWork()
        world.clock.advance(by: .seconds(300))
        await vm.submit()
        let calls = await world.preparer.calls
        #expect(calls.count == 2)
        #expect(calls.last?.edit == edit)
        #expect(calls.last?.maxBytes == 2_000_000)
        // 이전 파일은 지워지고 새 파일만 남는다(성공 뒤에는 모두 지운다).
        #expect(await world.preparer.live.isEmpty)
        #expect(await world.creation.uploadIdsCreated == [UploadFixtures.uploadId2])
    }

    @Test("TC-UPL-053 재발급 정책 contentType이 image/webp가 아니면 업로드하지 않고 준비 실패 문구를 보인다")
    func reissuedPolicyNotWebP() async throws {
        await world.creation.setIssue([
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId1)),
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId2, contentType: "image/png")),
        ])
        let vm = await ready(world)
        world.clock.advance(by: .seconds(300))
        await vm.submit()
        #expect(await world.creation.uploadCalls.isEmpty)
        #expect(message(vm) == (try copy("upload.error.prepare")))
        #expect(vm.success == nil)
        #expect(vm.photo != nil)
    }

    @Test("TC-UPL-058 준비한 파일이 정책 maxBytes를 넘으면 PUT 전에 차단하고 준비 실패 문구를 보인다")
    func oversizedBlockedBeforePut() async throws {
        await world.preparer.setByteCounts([5_242_881])
        let vm = await ready(world)
        await vm.submit()
        #expect(await world.creation.uploadCalls.isEmpty)
        #expect(await world.creation.createCalls.isEmpty)
        #expect(message(vm) == (try copy("upload.error.prepare")))
    }

    @Test("TC-UPL-076 오래 걸린 뒤의 제출은 새 정책 발급, PUT, POST 순서로 진행한다")
    func reissueOrder() async {
        let vm = await ready(world)
        world.clock.advance(by: .seconds(400))
        await vm.submit()
        #expect(await world.creation.order == ["issue", "issue", "upload", "create"])
    }

    // MARK: PUT 실패

    @Test("TC-UPL-055 PUT이 거절(403·5xx)되면 업로드 실패 문구이고 입력은 유지되며 다음 제출은 정책 발급부터 다시 한다")
    func putRejected() async throws {
        await world.creation.setUpload([.failure(PostUploadError.uploadRejected(status: 403)), .success(())])
        await world.creation.setIssue([
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId1)),
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId2)),
        ])
        let vm = await ready(world, title: "가을")
        await vm.submit()
        #expect(message(vm) == (try copy("upload.error.upload")))
        #expect(vm.photo == UploadFixtures.photo(1))
        #expect(vm.title == "가을")
        #expect(await world.creation.createCalls.isEmpty)
        #expect(!vm.isSubmitting)
        await vm.submit()
        #expect(await world.creation.issueCount == 2)
        #expect(await world.creation.uploadIdsCreated == [UploadFixtures.uploadId2])
        #expect(vm.success != nil)
        #expect(vm.notice == nil)
    }

    @Test("TC-UPL-055 PUT 연결 실패는 네트워크 문구이다(D-20)")
    func putNetworkFailure() async throws {
        await world.creation.setUpload([.failure(APIError.network)])
        let vm = await ready(world)
        await vm.submit()
        #expect(message(vm) == (try copy("upload.error.network")))
        #expect(vm.photo != nil)
    }

    @Test("TC-UPL-058 PUT 본문이 정책 한도를 넘은(payloadTooLarge) 경우도 업로드 실패 문구이다")
    func putPayloadTooLarge() async throws {
        await world.creation.setUpload([.failure(PostUploadError.payloadTooLarge)])
        let vm = await ready(world)
        await vm.submit()
        #expect(message(vm) == (try copy("upload.error.upload")))
    }

    // MARK: POST 성공

    @Test("TC-UPL-059 PUT이 성공하면 진입 때 고정한 topicId, 정책 uploadId, 입력 제목으로 POST한다")
    func postBody() async {
        let vm = await ready(world, title: "가을")
        await vm.submit()
        let calls = await world.creation.createCalls
        #expect(calls == [FakePostCreationRepository.CreateCall(topicId: UploadFixtures.topicId, uploadId: UploadFixtures.uploadId1, rawTitle: "가을")])
        #expect((await world.creation.uploadCalls).first?.data == Data(repeating: 7, count: 8))
    }

    @Test("TC-UPL-082 앞뒤 공백이 있는 입력은 원문을 넘기고 저장소가 공백을 떼며, 공백만이면 제목 없음(normalizedTitle nil)이다")
    func titleStripped() async {
        let vm = await ready(world)
        vm.setTitle(" 가나다라마바사아자차 ")
        // 입력 상태는 원문 그대로이고, 정규화는 제출(저장소)에서 한다.
        #expect(vm.title == " 가나다라마바사아자차 ")
        #expect(vm.normalizedTitle == "가나다라마바사아자차")
        await vm.submit()
        #expect(await world.creation.createCalls.first?.rawTitle == " 가나다라마바사아자차 ")

        let other = UploadWorld()
        let blank = await ready(other)
        blank.setTitle("   ")
        #expect(blank.normalizedTitle == nil)
        await blank.submit()
        #expect(await other.creation.createCalls.first?.rawTitle == "   ")
    }

    @Test("TC-UPL-060 응답 PENDING이면 성공 화면에 검수 대기 문구를, VALIDATING이면 확인 중 문구를 보인다", arguments: [
        (ModerationStatus.pending, "upload.success.pending"),
        (ModerationStatus.validating, "upload.success.validating"),
    ])
    func successStatusMessage(status: ModerationStatus, key: String) async throws {
        await world.creation.setCreate([.success(CreatedPost(postId: UploadFixtures.postId, status: status))])
        let vm = await ready(world)
        await vm.submit()
        let success = try #require(vm.success)
        #expect(success.status == status)
        #expect(success.statusMessage == (try copy(key)))
        #expect(success.topicDate == UploadFixtures.topicDate)
        #expect(success.topicTitle == "가을 하늘")
        #expect(success.message == "‘가을 하늘’을 기록했어요.")
        #expect(!vm.isSubmitting)
    }

    @Test("TC-UPL-084 성공 문장의 을/를은 주제 마지막 글자의 받침으로 정하고 끝 공백은 무시한다", arguments: [
        ("하늘", "‘하늘’을 기록했어요."), ("바다", "‘바다’를 기록했어요."), ("겨울 ", "‘겨울 ’을 기록했어요."), ("", "‘’를 기록했어요."),
    ])
    func successParticle(topic: String, expected: String) async throws {
        await world.useTopic(title: topic)
        let vm = world.makeViewModel()
        await vm.loadTopic()
        await vm.photoPicked(UploadFixtures.bytes, source: .album)
        vm.editorClosed(.completed(.identity))
        await vm.waitForBackgroundWork()
        await vm.submit()
        let success = try #require(vm.success)
        #expect(success.message == expected)
    }

    @Test("TC-UPL-086 확인했어요.를 누르면 업로드한 topicDate를 돌려주고 성공 전에는 nil이다")
    func confirmSuccess() async {
        let vm = await ready(world)
        #expect(vm.confirmSuccess() == nil)
        await vm.submit()
        #expect(vm.confirmSuccess() == UploadFixtures.topicDate)
    }

    @Test("TC-UPL-088 성공하면 screen_view photo_upload_success를 한 번 보낸다")
    func successScreenView() async {
        let vm = await ready(world)
        await vm.submit()
        let successViews = world.analytics.events.filter { $0 == .screenView(.photoUploadSuccess, screenClass: nil) }
        #expect(successViews.count == 1)
    }

    @Test("TC-UPL-073 성공 뒤에는 임시 파일을 모두 지우고 다시 제출해도 무시한다")
    func successCleansAndBlocksResubmit() async {
        let vm = await ready(world)
        await vm.submit()
        #expect(await world.preparer.live.isEmpty)
        await vm.submit()
        #expect(await world.creation.createCalls.count == 1)
        #expect(!vm.isSubmitEnabled)
    }

    // MARK: POST 400 판정 (D-02)

    @Test("TC-UPL-062 POST 400 뒤 today가 isPosted=true면 서버 message와 상관없이 중복 문구를 보인다")
    func duplicateByToday() async throws {
        await world.creation.setCreate([.failure(try uploadAPIError("upload/posts-create__400-already-posted.json"))])
        await world.creation.setToday([.success(UploadFixtures.posted)])
        let vm = await ready(world)
        await vm.submit()
        #expect(message(vm) == (try copy("upload.error.duplicate")))
        #expect(vm.success == nil)
        #expect(await world.creation.todayCount == 1)
        #expect(await world.creation.createCalls.count == 1)
    }

    @Test("TC-UPL-062 서버 message를 다른 문장으로 바꿔도 결과는 같다(문자열 비교 금지)")
    func duplicateIndependentOfMessage() async throws {
        await world.creation.setCreate([.failure(APIError.http(status: 400, code: .businessError, message: "완전히 다른 문장"))])
        await world.creation.setToday([.success(UploadFixtures.posted)])
        let vm = await ready(world)
        await vm.submit()
        #expect(message(vm) == (try copy("upload.error.duplicate")))
    }

    @Test("TC-UPL-063 POST 400 뒤 today의 topicDate가 진입 때와 다르면 주제 변경 문구를 보인다")
    func topicChangedByDate() async throws {
        await world.creation.setCreate([.failure(try uploadAPIError("upload/posts-create__400-topic-not-open.json"))])
        await world.creation.setToday([.success(.notPosted(on: UploadFixtures.nextTopicDate))])
        let vm = await ready(world)
        await vm.submit()
        #expect(message(vm) == (try copy("upload.error.topic-changed")))
        #expect(vm.photo != nil)
    }

    @Test("TC-UPL-063 POST 400 뒤 today가 404(열린 주제 없음)면 주제 변경 문구를 보인다")
    func topicChangedBy404() async throws {
        await world.creation.setCreate([.failure(try uploadAPIError("upload/posts-create__400-topic-not-open.json"))])
        await world.creation.setToday([.failure(FeedFailure.notFound)])
        let vm = await ready(world)
        await vm.submit()
        #expect(message(vm) == (try copy("upload.error.topic-changed")))
    }

    @Test("TC-UPL-075 자정 뒤 제출이 400이고 today가 새 topicDate면 주제 변경 문구를 보인다")
    func midnightTopicChanged() async throws {
        let late = UploadWorld(now: Instant.parse("2026-10-27T23:59:30+09:00")!)
        await late.creation.setCreate([.failure(try uploadAPIError("upload/posts-create__400-topic-not-open.json"))])
        await late.creation.setToday([.success(.notPosted(on: UploadFixtures.nextTopicDate))])
        let vm = await ready(late)
        late.clock.advance(by: .seconds(90))
        await vm.submit()
        #expect(await late.creation.createCalls.map(\.topicId) == [UploadFixtures.topicId])
        #expect(message(vm) == (try copy("upload.error.topic-changed")))
    }

    @Test("TC-UPL-064 그 밖의 400(만료·재사용·처리 거절)은 서버 message를 그대로 보이고 다음 제출에서 정책 발급부터 다시 한다", arguments: [
        "upload/posts-create__400-upload-expired.json",
        "upload/posts-create__400-upload-used.json",
        "upload/posts-create__400-rejected-unsupported-format.json",
        "upload/posts-create__400-rejected-too-large.json",
    ])
    func rejectedShowsServerMessage(name: String) async throws {
        await world.creation.setCreate([.failure(try uploadAPIError(name)), .success(CreatedPost(postId: UploadFixtures.postId, status: .pending))])
        await world.creation.setToday([.success(UploadFixtures.notPosted)])
        await world.creation.setIssue([
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId1)),
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId2)),
        ])
        let vm = await ready(world, title: "가을")
        await vm.submit()
        #expect(message(vm) == (try uploadFixtureMessage(name)))
        #expect(vm.photo == UploadFixtures.photo(1))
        #expect(vm.title == "가을")
        #expect(await world.creation.todayCount == 1)
        // 준비 상태는 처음으로 돌아가고 다음 제출이 새 정책·새 파일로 다시 한다.
        await vm.submit()
        #expect(await world.creation.issueCount == 2)
        #expect(await world.creation.uploadIdsCreated == [UploadFixtures.uploadId1, UploadFixtures.uploadId2])
        #expect(vm.success != nil)
    }

    @Test("TC-UPL-065 POST 404(업로드 없음)는 상태를 되돌려 다음 제출에서 업로드부터 다시 하게 한다")
    func uploadNotFound() async throws {
        await world.creation.setCreate([.failure(try uploadAPIError("upload/posts-create__404-upload-not-found.json")), .success(CreatedPost(postId: UploadFixtures.postId, status: .pending))])
        await world.creation.setToday([.success(UploadFixtures.notPosted)])
        await world.creation.setIssue([
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId1)),
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId2)),
        ])
        let vm = await ready(world)
        await vm.submit()
        #expect(vm.notice != nil)
        #expect(vm.success == nil)
        await vm.submit()
        #expect(await world.creation.uploadCalls.count == 2)
        #expect(vm.success != nil)
    }

    @Test("TC-UPL-083 서버가 제목 길이 400을 주면 서버 message를 보이고 입력을 유지한다")
    func titleTooLongServer() async throws {
        let name = "upload/posts-create__400-title-too-long.json"
        await world.creation.setCreate([.failure(try uploadAPIError(name))])
        await world.creation.setToday([.success(UploadFixtures.notPosted)])
        let vm = await ready(world, title: "가을")
        await vm.submit()
        #expect(message(vm) == (try uploadFixtureMessage(name)))
        #expect(vm.title == "가을")
        #expect(vm.photo != nil)
    }

    // MARK: POST 그 밖의 실패

    @Test("TC-UPL-066 POST가 갱신 뒤에도 401이면 로그인 화면으로 보내고 사진·제목은 유지한다")
    func postUnauthorized() async throws {
        await world.creation.setCreate([.failure(try uploadAPIError("upload/posts-create__401-unauthorized.json"))])
        let vm = await ready(world, title: "가을")
        await vm.submit()
        #expect(vm.needsLogin)
        #expect(vm.photo == UploadFixtures.photo(1))
        #expect(vm.title == "가을")
        #expect(await world.creation.createCalls.count == 1)
        #expect(!vm.isSubmitting)
    }

    @Test("TC-UPL-067 POST 403은 정지 문구이고 재요청은 0건이다")
    func postBanned() async throws {
        await world.creation.setCreate([.failure(try uploadAPIError("upload/posts-create__403-banned.json"))])
        let vm = await ready(world)
        await vm.submit()
        #expect(message(vm) == (try copy("upload.gate.banned")))
        #expect(await world.creation.createCalls.count == 1)
        #expect(await world.creation.todayCount == 0)
    }

    @Test("TC-UPL-068 POST 500은 한 번만 보내고 생성 실패 문구이며 입력을 유지한다")
    func postServerError() async throws {
        await world.creation.setCreate([.failure(try uploadAPIError("upload/posts-create__500-server-error.json"))])
        let vm = await ready(world, title: "가을")
        await vm.submit()
        #expect(message(vm) == (try copy("upload.error.create")))
        #expect(await world.creation.createCalls.count == 1)
        #expect(await world.creation.todayCount == 0)
        #expect(vm.photo == UploadFixtures.photo(1))
        #expect(vm.title == "가을")
        #expect(vm.isSubmitEnabled)
    }

    @Test("TC-UPL-074 제출이 실패해도 사진·제목이 유지되고 다시 제출할 수 있다")
    func failureKeepsInput() async throws {
        await world.creation.setCreate([.failure(try uploadAPIError("upload/posts-create__500-server-error.json")), .success(CreatedPost(postId: UploadFixtures.postId, status: .pending))])
        let vm = await ready(world, title: "가을")
        await vm.submit()
        #expect(vm.notice != nil)
        await vm.submit()
        #expect(vm.notice == nil)
        #expect(vm.success != nil)
        #expect(await world.creation.createCalls.map(\.rawTitle) == ["가을", "가을"])
    }

    @Test("TC-UPL-061 201인데 응답이 계약 위반(알 수 없는 상태)이면 today로 확인해 isPosted=true면 그 상태로 성공 처리한다")
    func invalidCreatedResponseRecovers() async {
        await world.creation.setCreate([.failure(APIError.invalidResponse)])
        await world.creation.setToday([.success(.posted(on: UploadFixtures.topicDate, status: .validating))])
        let vm = await ready(world)
        await vm.submit()
        #expect(await world.creation.createCalls.count == 1)
        #expect(await world.creation.todayCount == 1)
        #expect(vm.success?.status == .validating)
    }

    // MARK: 응답 유실 복구 (D-07)

    @Test("TC-UPL-069 POST 응답이 유실돼도 재전송 없이 today로 확인해 isPosted=true면 성공 화면으로 한 번만 가고 상태는 today 응답의 것이다")
    func lostResponseRecovered() async throws {
        await world.creation.setCreate([.failure(APIError.network)])
        await world.creation.setToday([.success(.posted(on: UploadFixtures.topicDate, status: .validating))])
        let vm = await ready(world)
        await vm.submit()
        #expect(await world.creation.createCalls.count == 1)
        #expect(await world.creation.todayCount == 1)
        let success = try #require(vm.success)
        #expect(success.status == .validating)
        #expect(success.statusMessage == (try copy("upload.success.validating")))
        #expect(vm.notice == nil)
        let views = world.analytics.events.filter { $0 == .screenView(.photoUploadSuccess, screenClass: nil) }
        #expect(views.count == 1)
    }

    @Test("TC-UPL-069 복구에서 본 상태가 APPROVED여도 성공 화면은 확인 중 문구를 쓴다")
    func lostResponseApproved() async throws {
        await world.creation.setCreate([.failure(APIError.network)])
        await world.creation.setToday([.success(.posted(on: UploadFixtures.topicDate, status: .approved))])
        let vm = await ready(world)
        await vm.submit()
        let success = try #require(vm.success)
        #expect(success.statusMessage == (try copy("upload.success.validating")))
    }

    @Test("TC-UPL-070 응답 유실 뒤 today가 isPosted=false면 네트워크 문구이고 같은 uploadId로 새 정책 없이 다시 제출할 수 있다")
    func lostResponseNotPosted() async throws {
        await world.creation.setCreate([.failure(APIError.network), .success(CreatedPost(postId: UploadFixtures.postId, status: .pending))])
        await world.creation.setToday([.success(UploadFixtures.notPosted)])
        let vm = await ready(world)
        await vm.submit()
        #expect(message(vm) == (try copy("upload.error.network")))
        #expect(vm.success == nil)
        await vm.submit()
        #expect(await world.creation.issueCount == 1)
        #expect(await world.creation.uploadIdsCreated == [UploadFixtures.uploadId1, UploadFixtures.uploadId1])
        #expect(vm.success != nil)
    }

    @Test("TC-UPL-071 응답 유실 뒤 today도 실패하면 네트워크 문구이고, 서버가 이미 만들었다면 재제출은 400 중복 문구가 된다")
    func lostResponseTodayAlsoFails() async throws {
        await world.creation.setCreate([.failure(APIError.network), .failure(try uploadAPIError("upload/posts-create__400-already-posted.json"))])
        await world.creation.setToday([.failure(FeedFailure.server(status: 500)), .success(UploadFixtures.posted)])
        let vm = await ready(world)
        await vm.submit()
        #expect(message(vm) == (try copy("upload.error.network")))
        #expect(vm.isSubmitEnabled)
        await vm.submit()
        #expect(message(vm) == (try copy("upload.error.duplicate")))
        #expect(await world.creation.createCalls.count == 2)
    }

    @Test("TC-UPL-072 재제출은 같은 uploadId로 POST만 보낸다(PUT은 이미 성공했다)")
    func resubmitPostsOnly() async {
        await world.creation.setCreate([.failure(APIError.network), .success(CreatedPost(postId: UploadFixtures.postId, status: .pending))])
        await world.creation.setToday([.success(UploadFixtures.notPosted)])
        let vm = await ready(world)
        await vm.submit()
        world.clock.advance(by: .seconds(59 * 60 + 59))
        await vm.submit()
        #expect(await world.creation.uploadCalls.count == 1)
        #expect(await world.creation.order == ["issue", "upload", "create", "today", "create"])
        #expect(vm.success != nil)
    }

    @Test("TC-UPL-072 재제출 POST가 61분 뒤 400(업로드 만료)이면 서버 message를 보이고 정책 발급부터 다시 준비한다")
    func resubmitAfterUploadExpired() async throws {
        let name = "upload/posts-create__400-upload-expired.json"
        await world.creation.setCreate([.failure(APIError.network), .failure(try uploadAPIError(name)), .success(CreatedPost(postId: UploadFixtures.postId, status: .pending))])
        await world.creation.setToday([.success(UploadFixtures.notPosted)])
        await world.creation.setIssue([
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId1)),
            .success(UploadFixtures.policy(id: UploadFixtures.uploadId2)),
        ])
        let vm = await ready(world)
        await vm.submit()
        world.clock.advance(by: .seconds(61 * 60))
        await vm.submit()
        #expect(message(vm) == (try uploadFixtureMessage(name)))
        await vm.submit()
        #expect(await world.creation.uploadIdsCreated.last == UploadFixtures.uploadId2)
        #expect(vm.success != nil)
    }

    // MARK: 화면 이탈

    @Test("TC-UPL-079 PUT 중 화면을 나가면 제출을 취소하고 임시 파일을 지우며 성공 화면은 뜨지 않는다")
    func leaveDuringPut() async {
        let hold = Hold()
        await world.creation.setUpload([.success(())], hold: hold)
        let vm = await ready(world)
        let task = submitTask(vm)
        #expect(await EventWait.signal(world.creation.uploadEntered, before: task))
        await vm.close()
        await task.value
        #expect(await world.creation.createCalls.isEmpty)
        #expect(await world.preparer.live.isEmpty)
        #expect(vm.success == nil)
        #expect(!vm.isSubmitting)
    }

    @Test("TC-UPL-079 POST 도중 화면을 나가면 임시 파일을 지우고 응답이 늦게 와도 성공 화면은 뜨지 않는다")
    func leaveDuringPost() async {
        let hold = Hold(ignoringCancellation: true)
        await world.creation.setCreate([.success(CreatedPost(postId: UploadFixtures.postId, status: .pending))], hold: hold)
        let vm = await ready(world)
        let task = submitTask(vm)
        #expect(await EventWait.signal(world.creation.createEntered, before: task))
        await vm.close()
        await hold.open()
        await task.value
        #expect(vm.success == nil)
        #expect(await world.preparer.live.isEmpty)
        let views = world.analytics.events.filter { $0 == .screenView(.photoUploadSuccess, screenClass: nil) }
        #expect(views.isEmpty)
    }

    @Test("제출을 시작하면 이전 안내(notice)를 지운다")
    func submitClearsNotice() async throws {
        await world.creation.setCreate([.failure(try uploadAPIError("upload/posts-create__500-server-error.json")), .success(CreatedPost(postId: UploadFixtures.postId, status: .pending))])
        let hold = Hold()
        let vm = await ready(world)
        await vm.submit()
        #expect(vm.notice != nil)
        await world.creation.setCreate([.success(CreatedPost(postId: UploadFixtures.postId, status: .pending))], hold: hold)
        let task = submitTask(vm)
        #expect(await EventWait.signal(world.creation.createEntered, before: task))
        #expect(vm.notice == nil)
        await hold.open()
        await task.value
    }
}

// MARK: 제목 입력

@MainActor
@Suite("UPL 제목 입력", .timeLimit(.minutes(1)))
struct UploadTitleTests {
    private let world = UploadWorld()

    @Test("TC-UPL-080 한글 10자와 이모지 10개는 허용되고 11번째는 들어가지 않는다")
    func tenCodePoints() {
        let vm = world.makeViewModel()
        vm.setTitle("가나다라마바사아자차")
        #expect(vm.title == "가나다라마바사아자차")
        vm.setTitle("가나다라마바사아자차카")
        #expect(vm.title == "가나다라마바사아자차")
        let emoji = String(repeating: "😀", count: 10)
        vm.setTitle(emoji)
        #expect(vm.title == emoji)
        vm.setTitle(emoji + "😀")
        #expect(vm.title == emoji)
    }

    @Test("TC-UPL-081 결합 이모지 붙여넣기는 grapheme이 아니라 code point 10개까지만 들어간다")
    func pasteCodePoints() {
        let vm = world.makeViewModel()
        let family = "👨‍👩‍👧"
        vm.setTitle(family + family + "가")
        #expect(vm.title.unicodeScalars.count == 10)
        #expect(vm.title == String(String.UnicodeScalarView((family + family + "가").unicodeScalars.prefix(10))))
    }

    @Test("TC-UPL-082 입력 중에는 공백을 보존하고(앞뒤 제거는 제출 때), 공백만이면 normalizedTitle이 nil이다")
    func stripped() {
        let vm = world.makeViewModel()
        vm.setTitle(" 가나다라마바사아자차 ")
        #expect(vm.title == " 가나다라마바사아자차 ")
        #expect(vm.normalizedTitle == "가나다라마바사아자차")
        vm.setTitle("   ")
        #expect(vm.title == "   ")
        #expect(vm.normalizedTitle == nil)
    }

    @Test("TC-UPL-082 끝 공백과 가운데 공백이 입력 중에 지워지지 않는다")
    func spacesPreservedWhileTyping() {
        let vm = world.makeViewModel()
        vm.setTitle("가을 ")
        #expect(vm.title == "가을 ")
        vm.setTitle("가을 하늘")
        #expect(vm.title == "가을 하늘")
    }
}
