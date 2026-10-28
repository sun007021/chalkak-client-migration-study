import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

@MainActor
@Suite("UPL 사진 준비(정책 발급 + 인코딩, 백그라운드)", .timeLimit(.minutes(1)))
struct UploadPreparationTests {
    private let world = UploadWorld()

    private func notice(_ vm: UploadViewModel) -> String? {
        if case let .failed(notice) = vm.preparation { notice.message } else { nil }
    }

    // MARK: 흐름

    @Test("TC-UPL-023 편집을 마치면 곧바로 POST /posts/uploads → 인코딩을 시작하고 S3 PUT은 아직 하지 않는다")
    func startsRightAfterEditing() async {
        let vm = await world.makeViewModelWithPhoto()
        await vm.waitForBackgroundWork()
        #expect(vm.preparation == .ready)
        #expect(await world.creation.order == ["issue"])
        #expect(await world.creation.uploadCalls.isEmpty)
        let calls = await world.preparer.calls
        #expect(calls == [FakePhotoPreparer.Call(photo: UploadFixtures.photo(1), edit: .identity, maxBytes: 5_242_880)])
    }

    @Test("TC-UPL-023 준비 상태는 정책 발급 중 → 인코딩 중 → 준비 완료 순서로 바뀐다")
    func preparationStates() async {
        let issueHold = Hold()
        let encodeHold = Hold()
        await world.creation.setIssue([.success(UploadFixtures.policy())], hold: issueHold)
        await world.preparer.setHolds([encodeHold])
        let vm = world.makeViewModel()
        await vm.photoPicked(UploadFixtures.bytes, source: .album)
        vm.editorClosed(.completed(.identity))
        #expect(await vm.reaches(world.creation.issueEntered))
        #expect(vm.preparation == .issuingPolicy)
        await issueHold.open()
        #expect(await vm.reaches(world.preparer.entered))
        #expect(vm.preparation == .encoding)
        await encodeHold.open()
        await vm.waitForBackgroundWork()
        #expect(vm.preparation == .ready)
    }

    @Test("TC-UPL-023 편집 없이 확정한 경우에도 준비를 시작하고 편집값은 identity로 넘긴다")
    func identityStillPrepares() async {
        let vm = await world.makeViewModelWithPhoto(edit: .identity)
        await vm.waitForBackgroundWork()
        #expect(await world.preparer.calls.first?.edit.isIdentity == true)
    }

    @Test("TC-UPL-025 정책 contentType이 image/png면 인코딩 전에 실패하고 사진 준비 실패 문구를 보인다")
    func nonWebPPolicy() async throws {
        await world.creation.setIssue([.success(UploadFixtures.policy(contentType: "image/png"))])
        let vm = await world.makeViewModelWithPhoto()
        await vm.waitForBackgroundWork()
        #expect(notice(vm) == (try copy("upload.error.prepare")))
        #expect(await world.preparer.callCount == 0)
        #expect(vm.photo == UploadFixtures.photo(1))
    }

    @Test("TC-UPL-026 필수 필드가 빠진 정책(계약 위반)은 사진 준비 실패이고 앱은 깨지지 않는다")
    func invalidPolicy() async throws {
        await world.creation.setIssue([.failure(APIError.invalidResponse)])
        let vm = await world.makeViewModelWithPhoto()
        await vm.waitForBackgroundWork()
        #expect(notice(vm) == (try copy("upload.error.prepare")))
        #expect(await world.preparer.callCount == 0)
    }

    // MARK: 정책 발급 실패

    @Test("TC-UPL-027 정책 발급 403은 정지 문구로 준비 실패이고 같은 요청을 다시 보내지 않으며 사진·제목은 유지된다")
    func issueBanned() async throws {
        await world.creation.setIssue([.failure(try uploadAPIError("upload/posts-uploads__403-banned.json"))])
        let vm = world.makeViewModel()
        await vm.photoPicked(UploadFixtures.bytes, source: .album)
        vm.setTitle("가을")
        vm.editorClosed(.completed(.identity))
        await vm.waitForBackgroundWork()
        #expect(notice(vm) == (try copy("upload.gate.banned")))
        #expect(await world.creation.issueCount == 1)
        #expect(vm.photo == UploadFixtures.photo(1))
        #expect(vm.title == "가을")
    }

    @Test("TC-UPL-027 정책 발급이 갱신 뒤에도 401이면 로그인 화면으로 보내고 입력은 유지한다")
    func issueUnauthorized() async throws {
        await world.creation.setIssue([.failure(try uploadAPIError("upload/posts-uploads__401-unauthorized.json"))])
        let vm = await world.makeViewModelWithPhoto()
        await vm.waitForBackgroundWork()
        #expect(vm.needsLogin)
        #expect(vm.photo == UploadFixtures.photo(1))
        #expect(await world.creation.issueCount == 1)
    }

    @Test("TC-UPL-027 정책 발급 서버 오류·계약 위반은 사진 준비 실패 문구이다")
    func issueServerError() async throws {
        await world.creation.setIssue([.failure(try uploadAPIError("upload/posts-uploads__500-server-error.json"))])
        let vm = await world.makeViewModelWithPhoto()
        await vm.waitForBackgroundWork()
        #expect(notice(vm) == (try copy("upload.error.prepare")))
        #expect(vm.photo == UploadFixtures.photo(1))
    }

    @Test("TC-UPL-027 정책 발급 연결 실패는 네트워크 문구이다(D-20)")
    func issueNetworkFailure() async throws {
        await world.creation.setIssue([.failure(APIError.network)])
        let vm = await world.makeViewModelWithPhoto()
        await vm.waitForBackgroundWork()
        #expect(notice(vm) == (try copy("upload.error.network")))
    }

    @Test("TC-UPL-029 사전 준비가 실패해도 사진·제목은 유지되고, 별도 재시도 없이 전시하기가 정책 발급부터 다시 한다")
    func submitRestartsAfterPrepareFailure() async throws {
        await world.creation.setIssue([.failure(try uploadAPIError("upload/posts-uploads__500-server-error.json")), .success(UploadFixtures.policy())])
        let vm = await world.makeViewModelWithPhoto()
        vm.setTitle("가을")
        await vm.waitForBackgroundWork()
        #expect(notice(vm) != nil)
        #expect(vm.isSubmitEnabled)
        #expect(await world.creation.issueCount == 1)
        await vm.submit()
        #expect(await world.creation.issueCount == 2)
        #expect(await world.creation.order == ["issue", "issue", "upload", "create"])
        #expect(vm.success != nil)
    }

    // MARK: 인코딩 실패

    @Test("TC-UPL-042 인코딩이 SizeLimitExceeded로 실패하면 사진 준비 실패 문구이고 PUT은 하지 않는다")
    func sizeLimitExceeded() async throws {
        await world.preparer.setFailures([PhotoPrepareError.sizeLimitExceeded])
        let vm = await world.makeViewModelWithPhoto()
        await vm.waitForBackgroundWork()
        #expect(notice(vm) == (try copy("upload.error.prepare")))
        await vm.submit()
        // 전시하기가 처음부터 다시 시도한다(두 번째 준비는 성공).
        #expect(await world.preparer.callCount == 2)
        #expect(vm.success != nil)
    }

    @Test("TC-UPL-044 지원하지 않는 형식(unsupported)도 사진 준비 실패 문구이다")
    func unsupportedFormat() async throws {
        await world.preparer.setFailures([PhotoPrepareError.unsupported])
        let vm = await world.makeViewModelWithPhoto()
        await vm.waitForBackgroundWork()
        #expect(notice(vm) == (try copy("upload.error.prepare")))
    }

    // MARK: 교체·세대

    @Test("TC-UPL-028 다른 편집값으로 다시 완료하면 이전 준비 작업을 취소하고 새 정책으로 다시 준비한다")
    func differentEditCancelsPrevious() async {
        let hold = Hold()
        await world.preparer.setHolds([hold])
        let vm = world.makeViewModel()
        await vm.photoPicked(UploadFixtures.bytes, source: .album)
        vm.editorClosed(.completed(.identity))
        #expect(await vm.reaches(world.preparer.entered))
        vm.photoTapped()
        vm.editorClosed(.completed(PhotoEdit(quarterTurns: 2)))
        await vm.waitForBackgroundWork()
        #expect(await world.creation.issueCount == 2)
        #expect(await world.preparer.calls.map(\.edit) == [.identity, PhotoEdit(quarterTurns: 2)])
        #expect(await world.preparer.live.count == 1)
        #expect(vm.preparation == .ready)
    }

    @Test("TC-UPL-028 사진을 다른 사진으로 교체하면 이전 원본을 놓고 이전 준비 결과(임시 파일)를 지운다")
    func replacingPhotoDiscardsPrevious() async {
        let vm = await readyViewModelForReplace()
        await vm.photoPicked(UploadFixtures.bytes, source: .album)
        vm.editorClosed(.completed(.identity))
        await vm.waitForBackgroundWork()
        #expect(vm.photo == UploadFixtures.photo(2))
        #expect(await world.loader.released.contains(UploadFixtures.photo(1)))
        #expect(await world.preparer.discarded.count == 1)
        #expect(await world.preparer.live.count == 1)
        #expect(await world.creation.issueCount == 2)
    }

    private func readyViewModelForReplace() async -> UploadViewModel {
        let vm = await world.makeViewModelWithPhoto()
        await vm.waitForBackgroundWork()
        return vm
    }

    @Test("TC-UPL-030 준비 중 뒤늦게 끝난 이전 작업은 세대 검증으로 새 선택 상태를 덮지 않고 결과 파일을 지운다(두 완료 순서 모두)", arguments: [true, false])
    func lateOldPreparationIsIgnored(newFinishesFirst: Bool) async throws {
        let stale = Hold(ignoringCancellation: true)
        let fresh = Hold()
        // 호출 0 = 이전(stale), 호출 1 = 새 준비. 새 쪽을 멈추는 것은 이전이 먼저 끝나는 순서를 만들 때만이다.
        await world.preparer.setHolds(newFinishesFirst ? [stale] : [stale, fresh])
        let vm = world.makeViewModel()
        await vm.photoPicked(UploadFixtures.bytes, source: .album)
        vm.editorClosed(.completed(.identity))
        #expect(await vm.reaches(world.preparer.entered))
        vm.photoTapped()
        vm.editorClosed(.completed(PhotoEdit(quarterTurns: 1)))
        #expect(await vm.reaches(world.preparer.entered, atLeast: 2))
        if newFinishesFirst {
            // 새 준비가 끝난 것을 신호로 확인한 뒤 이전 작업을 푼다.
            #expect(await vm.reaches(world.preparer.completed))
            await stale.open()
        } else {
            await stale.open()
            #expect(await vm.reaches(world.preparer.completed))
            await fresh.open()
        }
        await vm.waitForBackgroundWork()
        #expect(vm.preparation == .ready)
        #expect(vm.edit == PhotoEdit(quarterTurns: 1))
        let first = try #require(await world.preparer.image(forCall: 0))
        let second = try #require(await world.preparer.image(forCall: 1))
        #expect(await world.preparer.live == [second])
        #expect(await world.preparer.discarded == [first])
        // 제출은 새 준비 결과(호출 1)의 파일을 올린다.
        await vm.submit()
        #expect(await world.preparer.contentRequests == [second])
    }

    @Test("TC-UPL-030 이전 정책 발급 응답이 늦게 와도 새 준비를 덮지 않는다")
    func lateOldPolicyIsIgnored() async {
        let stale = Hold(ignoringCancellation: true)
        await world.creation.setIssue([.success(UploadFixtures.policy(id: UploadFixtures.uploadId1))], hold: stale)
        let vm = world.makeViewModel()
        await vm.photoPicked(UploadFixtures.bytes, source: .album)
        vm.editorClosed(.completed(.identity))
        #expect(await vm.reaches(world.creation.issueEntered))
        await world.creation.setIssue([.success(UploadFixtures.policy(id: UploadFixtures.uploadId2))])
        vm.photoTapped()
        vm.editorClosed(.completed(PhotoEdit(quarterTurns: 1)))
        await stale.open()
        await vm.waitForBackgroundWork()
        #expect(vm.preparation == .ready)
        #expect(await world.preparer.callCount == 1)
        await vm.submit()
        #expect(await world.creation.uploadIdsCreated == [UploadFixtures.uploadId2])
    }

    // MARK: 정리

    @Test("TC-UPL-031 화면을 나가면 진행 중인 준비를 취소하고 소유한 임시 파일·보관한 원본을 지운다")
    func closeCancelsAndCleans() async {
        let hold = Hold()
        await world.preparer.setHolds([hold])
        let vm = world.makeViewModel()
        await vm.photoPicked(UploadFixtures.bytes, source: .album)
        vm.editorClosed(.completed(.identity))
        #expect(await vm.reaches(world.preparer.entered))
        await vm.close()
        await vm.waitForBackgroundWork()
        #expect(await world.preparer.live.isEmpty)
        #expect(await world.loader.released.contains(UploadFixtures.photo(1)))
    }

    @Test("TC-UPL-031 취소를 무시하고 뒤늦게 끝난 준비 결과도 화면을 나간 뒤에는 지운다")
    func lateResultAfterCloseIsDeleted() async {
        let stale = Hold(ignoringCancellation: true)
        await world.preparer.setHolds([stale])
        let vm = world.makeViewModel()
        await vm.photoPicked(UploadFixtures.bytes, source: .album)
        vm.editorClosed(.completed(.identity))
        #expect(await vm.reaches(world.preparer.entered))
        await vm.close()
        await stale.open()
        await vm.waitForBackgroundWork()
        #expect(await world.preparer.created.count == 1)
        #expect(await world.preparer.live.isEmpty)
    }

    @Test("TC-UPL-031 준비가 끝난 뒤 화면을 나가도 임시 파일을 지운다")
    func closeAfterReady() async {
        let vm = await world.makeViewModelWithPhoto()
        await vm.waitForBackgroundWork()
        #expect(await world.preparer.live.count == 1)
        await vm.close()
        #expect(await world.preparer.live.isEmpty)
    }

    @Test("TC-UPL-078 재인증이 필요하면 임시 파일과 정책을 버리되 사진·제목 입력은 남긴다")
    func reauthenticationDropsFilesKeepsInput() async throws {
        await world.creation.setCreate([.failure(try uploadAPIError("upload/posts-create__401-unauthorized.json"))])
        let vm = await world.makeViewModelWithPhoto()
        vm.setTitle("가을")
        await vm.waitForBackgroundWork()
        await vm.submit()
        #expect(vm.needsLogin)
        #expect(vm.notice == nil)
        #expect(await world.preparer.live.isEmpty)
        #expect(vm.photo == UploadFixtures.photo(1))
        #expect(vm.title == "가을")
        // 다른 계정으로 로그인하면 화면이 정리되고 이전 사진·정책이 남지 않는다.
        await vm.close()
        #expect(await world.loader.released.contains(UploadFixtures.photo(1)))
    }
}
