import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private let originalURL = URL(string: "https://cdn.example.test/original.png")!
private let thumbnailURL = URL(string: "https://cdn.example.test/thumbnail.png")!
private let newThumbnailURL = URL(string: "https://cdn.example.test/new-thumbnail.png")!

private func registered(thumbnail: URL?, original: URL = originalURL) -> Result<SignatureLookup, any Error> {
    .success(.registered(UserSignature(originalImageURL: original, thumbnailImageURL: thumbnail)))
}

@MainActor
@Suite("SIGN 설정 사인 카드 조회 상태", .timeLimit(.minutes(1)))
struct SignatureCardViewModelTests {
    @Test("TC-SIGN-026 설정이 보이면 GET으로 불러 썸네일을 쓴다")
    func usesThumbnail() async {
        let repository = FakeSignatureRepository(lookupResults: [registered(thumbnail: thumbnailURL)])
        let viewModel = SignatureCardViewModel(access: .member, repository: repository)
        await viewModel.screenAppeared()
        #expect(viewModel.imageURL == thumbnailURL)
        #expect(viewModel.notice == nil && !viewModel.needsRegistration && !viewModel.isLoading)
    }

    @Test("TC-SIGN-026 썸네일이 null이면 원본을 쓴다")
    func fallsBackToOriginal() async {
        let viewModel = SignatureCardViewModel(access: .member, repository: FakeSignatureRepository(lookupResults: [registered(thumbnail: nil)]))
        await viewModel.screenAppeared()
        #expect(viewModel.imageURL == originalURL)
    }

    @Test("TC-SIGN-027 TC-SIGN-023 변경 직후에도 가정하지 않고 화면이 보일 때마다 GET으로 다시 조회해 새 사인으로 바꾼다")
    func refetchesEveryAppearance() async {
        let repository = FakeSignatureRepository(lookupResults: [registered(thumbnail: thumbnailURL), registered(thumbnail: thumbnailURL), registered(thumbnail: newThumbnailURL)])
        let viewModel = SignatureCardViewModel(access: .member, repository: repository)
        await viewModel.screenAppeared()
        await viewModel.screenAppeared()
        #expect(viewModel.imageURL == thumbnailURL, "서버가 아직 이전 사인을 돌려주면 이전 사인 그대로")
        await viewModel.screenAppeared()
        #expect(viewModel.imageURL == newThumbnailURL)
        #expect(await repository.lookupCount == 3)
    }

    @Test("TC-SIGN-039 정지 회원이어도 사인 조회는 그대로 성공해 사인이 보인다(정지 여부를 모른다)")
    func bannedUserStillSeesSignature() async {
        let viewModel = SignatureCardViewModel(access: .member, repository: FakeSignatureRepository(lookupResults: [registered(thumbnail: thumbnailURL)]))
        await viewModel.screenAppeared()
        #expect(viewModel.imageURL == thumbnailURL)
    }

    @Test("TC-SIGN-040 SIGNATURE_REGISTRATION_REQUIRED면 빈 이미지 + 재등록 유도 상태이고 오류 토스트는 없다")
    func registrationRequired() async {
        let viewModel = SignatureCardViewModel(access: .member, repository: FakeSignatureRepository(lookupResults: [.success(.registrationRequired)]))
        await viewModel.screenAppeared()
        #expect(viewModel.imageURL == nil)
        #expect(viewModel.needsRegistration)
        #expect(viewModel.notice == nil)
    }

    @Test("TC-SIGN-040 재등록 필요 뒤 정상 조회가 되면 재등록 상태가 풀린다")
    func registrationRequiredClears() async {
        let repository = FakeSignatureRepository(lookupResults: [.success(.registrationRequired), registered(thumbnail: thumbnailURL)])
        let viewModel = SignatureCardViewModel(access: .member, repository: repository)
        await viewModel.screenAppeared()
        await viewModel.screenAppeared()
        #expect(!viewModel.needsRegistration && viewModel.imageURL == thumbnailURL)
    }

    @Test("REQ-SIGN-014 조회 중에는 다시 보여도 중복 요청하지 않는다")
    func noDuplicateWhileLoading() async {
        let hold = Hold()
        let repository = FakeSignatureRepository(lookupResults: [registered(thumbnail: thumbnailURL)], lookupHold: hold)
        let viewModel = SignatureCardViewModel(access: .member, repository: repository)
        let first = Task { await viewModel.screenAppeared() }
        guard await EventWait.signal(repository.lookupEntered, before: first) else { Issue.record("조회가 시작돼야 한다"); return }
        #expect(viewModel.isLoading)
        await viewModel.screenAppeared()
        await hold.open()
        await first.value
        #expect(await repository.lookupCount == 1)
        #expect(!viewModel.isLoading)
    }

    @Test("REQ-SIGN-015 조회가 실패하면 이미 보이던 사인은 그대로 두고 토스트 sign.load.error를 보인다")
    func failureKeepsPreviousImage() async throws {
        let repository = FakeSignatureRepository(lookupResults: [registered(thumbnail: thumbnailURL), .failure(APIError.network)])
        let viewModel = SignatureCardViewModel(access: .member, repository: repository)
        await viewModel.screenAppeared()
        await viewModel.screenAppeared()
        #expect(viewModel.imageURL == thumbnailURL)
        #expect(viewModel.notice?.message == (try copy("sign.load.error")))
    }

    @Test("REQ-SIGN-015 보이던 사인이 없으면 빈 상태로 두고 토스트를 보인다")
    func failureWithoutPreviousImage() async throws {
        let viewModel = SignatureCardViewModel(access: .member, repository: FakeSignatureRepository(lookupResults: [.failure(try apiError(fixture: "signature/users-me-signature__get-internal-error.json"))]))
        await viewModel.screenAppeared()
        #expect(viewModel.imageURL == nil)
        #expect(viewModel.notice?.message == (try copy("sign.load.error")))
    }

    @Test("REQ-SIGN-015 401은 토스트 없이 이미지를 유지한다(로그인 이동은 재인증 이벤트 몫)")
    func unauthorizedHasNoToast() async throws {
        let repository = FakeSignatureRepository(lookupResults: [registered(thumbnail: thumbnailURL), .failure(try apiError(fixture: "signature/users-me-signature__get-unauthorized.json"))])
        let viewModel = SignatureCardViewModel(access: .member, repository: repository)
        await viewModel.screenAppeared()
        await viewModel.screenAppeared()
        #expect(viewModel.imageURL == thumbnailURL)
        #expect(viewModel.notice == nil)
    }

    @Test("D-20 같은 실패가 연달아 나와도 토스트 id가 달라 다시 표시된다")
    func sameFailureDistinctIds() async throws {
        let viewModel = SignatureCardViewModel(access: .member, repository: FakeSignatureRepository(lookupResults: [.failure(APIError.network)]))
        await viewModel.screenAppeared()
        let first = try #require(viewModel.notice)
        await viewModel.screenAppeared()
        let second = try #require(viewModel.notice)
        #expect(first.id != second.id)
    }

    @Test("REQ-SIGN-017 게스트는 조회하지 않는다")
    func guestDoesNotFetch() async {
        let repository = FakeSignatureRepository(lookupResults: [registered(thumbnail: thumbnailURL)])
        let viewModel = SignatureCardViewModel(access: .guest, repository: repository)
        await viewModel.screenAppeared()
        #expect(await repository.lookupCount == 0)
        #expect(viewModel.imageURL == nil && viewModel.notice == nil)
    }

    @Test("REQ-SIGN-014 조회 중 onDisappear 직후 다시 보이면 새로 조회한다(이전 조회 결과는 버린다)")
    func reappearAfterDisappearRefetches() async {
        let hold = Hold()
        let repository = FakeSignatureRepository(lookupResults: [registered(thumbnail: thumbnailURL)], lookupHold: hold)
        let viewModel = SignatureCardViewModel(access: .member, repository: repository)
        let first = Task { await viewModel.screenAppeared() }
        guard await EventWait.signal(repository.lookupEntered, before: first) else { Issue.record("조회가 시작돼야 한다"); return }
        viewModel.onDisappear()
        #expect(!viewModel.isLoading)
        let second = Task { await viewModel.screenAppeared() }
        guard await EventWait.signal(repository.lookupEntered, atLeast: 2, before: second) else { Issue.record("두 번째 조회가 시작돼야 한다"); return }
        await hold.open()
        await first.value
        await second.value
        #expect(await repository.lookupCount == 2)
        #expect(viewModel.imageURL == thumbnailURL && !viewModel.isLoading && viewModel.notice == nil)
    }

    @Test("D-20 조회 중 화면이 사라지면 결과를 버리고 토스트 없이 끝난다")
    func disappearWhileLoading() async {
        let hold = Hold()
        let repository = FakeSignatureRepository(lookupResults: [registered(thumbnail: thumbnailURL)], lookupHold: hold)
        let viewModel = SignatureCardViewModel(access: .member, repository: repository)
        let task = Task { await viewModel.screenAppeared() }
        guard await EventWait.signal(repository.lookupEntered, before: task) else { Issue.record("조회가 시작돼야 한다"); return }
        viewModel.onDisappear()
        await task.value
        #expect(viewModel.imageURL == nil && viewModel.notice == nil && !viewModel.isLoading)
    }
}
