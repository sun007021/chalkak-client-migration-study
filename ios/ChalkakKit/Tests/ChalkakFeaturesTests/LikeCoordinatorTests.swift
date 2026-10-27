import Foundation
import Testing
import ChalkakData
@testable import ChalkakFeatures

@MainActor
@Suite("LikeCoordinator (D-04)", .timeLimit(.minutes(1)))
struct LikeCoordinatorTests {
    // MARK: 낙관적 갱신

    @Test("TC-LIKE-003 TC-LIKE-006 하트를 누르면 서버 응답 전에 즉시 isLiked=true, likeCount+1이다")
    func optimisticLike() async {
        let h = LikeHarness()
        let result = h.coordinator.tap(postId: postA, current: notLiked10)
        #expect(result == .accepted)
        #expect(h.coordinator.state(for: postA) == liked11)
        #expect(h.sink.events.first == .stateChanged(postId: postA, state: liked11, cause: .optimistic))
        await h.repository.waitForCallCount(1)
        #expect(h.coordinator.state(for: postA) == liked11)   // 응답 전에도 유지
        await h.repository.setServer(postId: postA, liked: false, count: 10)
        await h.repository.resolveNext()
        await h.coordinator.settled(postId: postA)
        #expect(await h.repository.calls == [.init(postId: postA, liked: true)])
    }

    // 범위: 004·005·025는 화면별 ViewModel/카드 연결까지가 TC이고, 여기서는 그 바탕인 조율기의 단일 상태(어느 카드에서 눌러도 같은 값)만 검증한다.
    @Test("TC-LIKE-004 TC-LIKE-005 TC-LIKE-025 같은 사진은 어느 화면에서 읽어도 같은 값이다(조율기 단일 상태, 화면 연결은 VM PR)")
    func singleSourceOfTruth() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        // 다른 화면(그리드·캐러셀·홈)이 낡은 값을 들고 눌러도 조율기의 현재 값이 기준이다.
        #expect(h.coordinator.state(for: postA) == liked11)
        h.coordinator.tap(postId: postA, current: notLiked10)
        #expect(h.coordinator.state(for: postA) == notLiked10)
    }

    @Test("TC-LIKE-007 취소는 즉시 isLiked=false, likeCount-1이고 0 아래로 내려가지 않는다")
    func optimisticUnlike() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: liked11)
        #expect(h.coordinator.state(for: postA) == LikeState(isLiked: false, likeCount: 10))
        h.coordinator.tap(postId: postB, current: LikeState(isLiked: true, likeCount: 0))
        #expect(h.coordinator.state(for: postB) == LikeState(isLiked: false, likeCount: 0))
    }

    @Test("TC-LIKE-008 성공 응답의 likeCount·isLiked로 덮어쓴다")
    func serverValueOverwrites() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        await h.repository.resolveNext(with: LikeResult(postId: postA, likeCount: 15, isLiked: true))
        await h.coordinator.settled(postId: postA)
        #expect(h.coordinator.state(for: postA) == LikeState(isLiked: true, likeCount: 15))
        #expect(h.sink.causes(for: postA).last == .confirmed)
        #expect(h.sink.states(for: postA).last == LikeState(isLiked: true, likeCount: 15))
    }

    // MARK: 실패

    @Test("TC-LIKE-009 TC-LIKE-028 실패하면 이전 상태로 되돌리고 토스트 '좋아요를 반영하지 못했어요'를 한 번 띄운다",
          arguments: [FeedFailure.server(status: 500), .network, .invalidResponse])
    func failureRollsBack(failure: FeedFailure) async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        await h.repository.failNext(failure)
        await h.coordinator.settled(postId: postA)
        #expect(h.coordinator.state(for: postA) == notLiked10)
        #expect(h.sink.causes(for: postA) == [.optimistic, .rolledBack])
        #expect(h.sink.toastTexts == ["좋아요를 반영하지 못했어요"])
        #expect(h.sink.removedPosts.isEmpty)
    }

    @Test("TC-LIKE-010 404면 롤백하고 목록에서 뺄 신호와 토스트를 보낸다")
    func notFound() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        await h.repository.failNext(FeedFailure.notFound)
        await h.coordinator.settled(postId: postA)
        #expect(h.coordinator.state(for: postA) == notLiked10)
        #expect(h.sink.removedPosts == [postA])
        #expect(h.sink.toastTexts == ["좋아요를 반영하지 못했어요"])
    }

    @Test("TC-LIKE-011 정지 회원 403은 롤백 + 정지 문구이고 재요청하지 않는다")
    func banned() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        await h.repository.failNext(FeedFailure.banned)
        await h.coordinator.settled(postId: postA)
        #expect(h.coordinator.state(for: postA) == notLiked10)
        #expect(h.sink.toastTexts == ["이용이 제한되어 좋아요를 누를 수 없어요."])
        #expect(await h.repository.calls.count == 1)
    }

    @Test("TC-LIKE-013 재인증이 필요한 401은 롤백하고 로그인 신호를 보내며 토스트는 없다")
    func unauthorized() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        await h.repository.failNext(FeedFailure.unauthorized)
        await h.coordinator.settled(postId: postA)
        #expect(h.coordinator.state(for: postA) == notLiked10)
        #expect(h.sink.reauthCount == 1)
        #expect(h.sink.toasts.isEmpty)
    }

    @Test("저장소 요청이 CancellationError로 끝나면 조용히 롤백하고 토스트·재인증 신호가 없다(화면 이탈 시 토스트 표시는 VM PR의 TC-LIKE-029)")
    func cancellationIsSilent() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        await h.repository.failNext(CancellationError())
        await h.coordinator.settled(postId: postA)
        #expect(h.coordinator.state(for: postA) == notLiked10)
        #expect(h.sink.toasts.isEmpty)
    }

    @Test("TC-LIKE-030 서로 다른 사진이 연달아 실패해 같은 문구가 두 번 나와도 토스트 id가 달라 둘 다 표시된다")
    func toastIdsAreUnique() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        h.coordinator.tap(postId: postB, current: notLiked10)
        await h.repository.waitForCallCount(2)
        await h.repository.failNext(FeedFailure.server(status: 500))
        await h.repository.failNext(FeedFailure.server(status: 500))
        await h.coordinator.settledAll()
        #expect(h.sink.toasts.count == 2)
        #expect(Set(h.sink.toasts.map(\.id)).count == 2)
        #expect(Set(h.sink.toastTexts) == ["좋아요를 반영하지 못했어요"])
    }

    // MARK: 게스트

    @Test("TC-LIKE-014 게스트는 상태 변화 없이 안내 토스트만 뜨고 API 호출이 0건이다")
    func guestBlocked() async {
        let h = LikeHarness(userId: nil)
        let result = h.coordinator.tap(postId: postA, current: notLiked10)
        await h.coordinator.settled(postId: postA)
        #expect(result == .guestBlocked)
        #expect(h.coordinator.state(for: postA) == nil)
        #expect(h.sink.toastTexts == ["좋아요를 누르려면 로그인이 필요해요"])
        #expect(h.sink.states(for: postA).isEmpty)
        #expect(await h.repository.calls.isEmpty)
    }

    // MARK: 연타·직렬화

    @Test("TC-LIKE-015 on·off·on 3회 연타(PUT 진행 중)는 PUT 1회로 끝나고 최종 isLiked=true다")
    func tripleTapCollapses() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        h.coordinator.tap(postId: postA, current: notLiked10)
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.setServer(postId: postA, liked: false, count: 10)
        await h.repository.resolveNext()
        await h.coordinator.settled(postId: postA)
        #expect(await h.repository.calls == [.init(postId: postA, liked: true)])
        #expect(h.coordinator.state(for: postA) == liked11)
    }

    @Test("TC-LIKE-016 on·off 2회 연타는 PUT 응답 뒤 DELETE를 1회 더 보내 총 2회이고 최종 isLiked=false다")
    func onOffSendsFollowUp() async {
        let h = LikeHarness()
        await h.repository.setServer(postId: postA, liked: false, count: 10)
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.resolveNext()           // PUT 응답: 서버는 liked
        await h.repository.waitForCallCount(2)
        await h.repository.resolveNext()           // DELETE 응답
        await h.coordinator.settled(postId: postA)
        #expect(await h.repository.calls == [.init(postId: postA, liked: true), .init(postId: postA, liked: false)])
        #expect(h.coordinator.state(for: postA) == notLiked10)
    }

    @Test("TC-LIKE-018 PUT 진행 중 같은 사진을 또 눌러도 중복 요청이 나가지 않는다")
    func noDuplicateWhileInFlight() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        h.coordinator.tap(postId: postA, current: notLiked10)
        h.coordinator.tap(postId: postA, current: notLiked10)
        #expect(await h.repository.calls.count == 1)
        #expect(await h.repository.pendingCount == 1)
        await h.repository.resolveNext()
        await h.coordinator.settled(postId: postA)
    }

    @Test("TC-LIKE-017 임의 탭 순서(길이 1~9)에서도 동시 요청은 1개 이하이고 최종 서버 상태가 마지막 의도와 같다")
    func propertyRandomTaps() async {
        var rng = SplitMix64(seed: 20_261_027)
        for _ in 0..<60 {
            let h = LikeHarness()
            let tapCount = Int(rng.next() % 9) + 1
            let firstGroup = Int(rng.next() % UInt64(tapCount)) + 1   // 첫 요청이 진행 중일 때 들어오는 탭 수 포함
            await h.repository.setServer(postId: postA, liked: false, count: 10)
            var intent = false
            for index in 0..<tapCount {
                h.coordinator.tap(postId: postA, current: notLiked10)
                intent.toggle()
                if index == 0 { await h.repository.waitForCallCount(1) }
                if index + 1 == firstGroup {
                    await h.repository.setAutoResolve(true)
                    await h.repository.resolveNext()      // 진행 중이던 첫 요청 해제, 이후 요청은 즉시 응답
                }
            }
            await h.repository.setAutoResolve(true)
            await h.repository.resolveNext()
            await h.coordinator.settled(postId: postA)
            let server = await h.repository.serverState(postA)
            #expect(await h.repository.maxConcurrentPerPost <= 1)
            #expect(server.liked == intent)
            #expect(h.coordinator.state(for: postA)?.isLiked == intent)
            #expect(h.coordinator.state(for: postA)?.likeCount == server.count)
        }
    }

    @Test("TC-LIKE-019 서로 다른 두 사진은 독립적으로 병렬 요청되고 한쪽 실패가 다른 쪽을 되돌리지 않는다")
    func independentPosts() async {
        let h = LikeHarness()
        await h.repository.setServer(postId: postA, liked: false, count: 10)   // 서버 응답이 기준 개수(10)에서 +1이 되도록
        h.coordinator.tap(postId: postA, current: notLiked10)
        h.coordinator.tap(postId: postB, current: notLiked10)
        await h.repository.waitForCallCount(2)
        #expect(await h.repository.pendingCount == 2)       // 둘이 동시에 나가 있다
        await h.repository.resolveNext()                    // A 성공
        await h.repository.failNext(FeedFailure.server(status: 500))   // B 실패
        await h.coordinator.settledAll()
        #expect(h.coordinator.state(for: postA) == liked11)
        #expect(h.coordinator.state(for: postB) == notLiked10)
    }

    @Test("TC-LIKE-020 진행 중 의도를 off로 바꿨는데 PUT이 실패하면 추가 요청 없이 롤백 결과를 유지하고 토스트만 띄운다")
    func failureWithMatchingIntent() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        h.coordinator.tap(postId: postA, current: notLiked10)   // 의도 off
        await h.repository.failNext(FeedFailure.server(status: 500))
        await h.coordinator.settled(postId: postA)
        #expect(await h.repository.calls.count == 1)
        #expect(h.coordinator.state(for: postA) == notLiked10)
        #expect(h.sink.toastTexts == ["좋아요를 반영하지 못했어요"])
    }

    @Test("실패 롤백이 끝난 뒤의 새 탭은 낙관 상태를 유지하고 토스트는 처음 실패의 1건뿐이다")
    func newActionAfterRollbackSurvives() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        await h.repository.failNext(FeedFailure.server(status: 500))
        await h.coordinator.settled(postId: postA)
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(2)
        #expect(h.coordinator.state(for: postA) == liked11)
        #expect(h.sink.toastTexts.count == 1)
        await h.repository.setServer(postId: postA, liked: false, count: 10)   // 서버 응답이 기준 개수(10)에서 +1이 되도록
        await h.repository.resolveNext()
        await h.coordinator.settled(postId: postA)
        #expect(h.coordinator.state(for: postA) == liked11)
    }

    // MARK: 재검증 병합

    @Test("TC-LIKE-021 TC-LIKE-023 늦게 도착한 목록·상세 재검증 응답이 완료된 좋아요 상태를 덮지 않는다")
    func staleRevalidationDoesNotOverwrite() async {
        let h = LikeHarness()
        let token = h.coordinator.beginRevalidation()          // 재검증 요청 시점
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        await h.repository.setServer(postId: postA, liked: false, count: 10)
        await h.repository.resolveNext()
        await h.coordinator.settled(postId: postA)
        let shown = h.coordinator.merge(server: notLiked10, for: postA, since: token)   // 늦은 낡은 응답
        #expect(shown == liked11)
        #expect(h.coordinator.state(for: postA) == liked11)
    }

    @Test("TC-LIKE-021 진행 중인 좋아요가 있어도 재검증 응답은 로컬 낙관 값을 덮지 않는다")
    func staleRevalidationDuringInFlight() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        let token = h.coordinator.beginRevalidation()
        let shown = h.coordinator.merge(server: notLiked10, for: postA, since: token)
        #expect(shown == liked11)
        await h.repository.waitForCallCount(1)
        await h.repository.resolveNext()
        await h.coordinator.settled(postId: postA)
    }

    @Test("TC-LIKE-021 요청 이후 좋아요 변경이 없으면 서버 값을 채택한다")
    func revalidationAdoptedWhenUntouched() {
        let h = LikeHarness()
        let token = h.coordinator.beginRevalidation()
        let server = LikeState(isLiked: true, likeCount: 42)
        #expect(h.coordinator.merge(server: server, for: postA, since: token) == server)
        #expect(h.coordinator.state(for: postA) == server)
    }

    @Test("TC-LIKE-021 요청보다 먼저 끝난 좋아요라면 더 새로운 서버 응답을 채택한다")
    func revalidationAfterOlderLikeIsAdopted() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        await h.repository.resolveNext()
        await h.coordinator.settled(postId: postA)
        let token = h.coordinator.beginRevalidation()          // 좋아요 완료 뒤에 보낸 재검증
        let server = LikeState(isLiked: true, likeCount: 20)
        #expect(h.coordinator.merge(server: server, for: postA, since: token) == server)
    }

    // MARK: 계정 전환

    @Test("TC-LIKE-031 A의 좋아요 응답이 진행 중일 때 reset(로그아웃·B 로그인)하면 A 응답은 무시된다")
    func accountSwitchWithReset() async {
        let h = LikeHarness(userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        h.viewer.set("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
        h.coordinator.reset()
        let eventsBefore = h.sink.events.count
        await h.repository.resolveNext(with: LikeResult(postId: postA, likeCount: 99, isLiked: true))
        await h.coordinator.settledAll()
        #expect(h.sink.events.count == eventsBefore)           // A의 응답으로 이벤트·토스트가 없다
        #expect(h.coordinator.state(for: postA) == nil)
    }

    @Test("TC-LIKE-031 reset 호출 없이 뷰어가 바뀌어도 이전 계정의 늦은 응답(실패 포함)은 반영·토스트되지 않는다")
    func accountSwitchDetectedByViewer() async {
        let h = LikeHarness(userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        h.viewer.set("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
        let eventsBefore = h.sink.events.count
        await h.repository.failNext(FeedFailure.server(status: 500))
        await h.coordinator.settledAll()
        #expect(h.sink.events.count == eventsBefore)
        #expect(h.sink.toasts.isEmpty)
        #expect(h.coordinator.state(for: postA) != liked11)    // A의 낙관 값이 B 화면에 남지 않는다
    }

    @Test("TC-LIKE-031 reset 뒤 B의 첫 탭은 B가 보던 값을 기준으로 새로 시작하고, 이전 epoch 응답을 풀어도 영향이 없다")
    func freshStateAfterReset() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        h.coordinator.reset()
        h.viewer.set("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
        h.coordinator.tap(postId: postA, current: LikeState(isLiked: true, likeCount: 7))
        #expect(h.coordinator.state(for: postA) == LikeState(isLiked: false, likeCount: 6))
        await h.repository.waitForCallCount(2)
        // 이전 epoch의 늦은 성공 응답: 새 entry·이벤트에 영향이 없다.
        await h.repository.resolveNext(with: LikeResult(postId: postA, likeCount: 99, isLiked: true))
        #expect(h.coordinator.state(for: postA) == LikeState(isLiked: false, likeCount: 6))
        // 정리: 새 요청도 풀어 continuation이 남지 않게 한다.
        await h.repository.resolveNext(with: LikeResult(postId: postA, likeCount: 6, isLiked: false))
        await h.coordinator.settledAll()
        #expect(await h.repository.pendingCount == 0)
        #expect(h.sink.states(for: postA).allSatisfy { $0.likeCount != 99 })
        #expect(h.coordinator.state(for: postA) == LikeState(isLiked: false, likeCount: 6))
    }

    @Test("TC-LIKE-022 reset 이후 이전 epoch의 늦은 실패 응답은 새 entry를 되돌리지 않고 토스트도 없다")
    func lateFailureFromOldEpochIgnored() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        h.coordinator.reset()
        h.coordinator.tap(postId: postA, current: notLiked10)       // 새 epoch의 새 entry
        await h.repository.waitForCallCount(2)
        await h.repository.failNext(FeedFailure.server(status: 500))   // 가장 오래된 호출 = 이전 epoch
        await h.repository.setServer(postId: postA, liked: false, count: 10)
        #expect(h.coordinator.state(for: postA) == liked11)
        await h.repository.resolveNext()
        await h.coordinator.settledAll()
        #expect(h.coordinator.state(for: postA) == liked11)
        #expect(h.sink.toasts.isEmpty)
        #expect(!h.sink.causes(for: postA).contains(.rolledBack))
        #expect(await h.repository.pendingCount == 0)
    }

    // MARK: 추가 경로

    @Test("TC-LIKE-016 PUT 성공 뒤 이어진 DELETE가 실패하면 PUT이 확정한 서버 값으로 롤백하고 토스트는 1번이다")
    func followUpFailureRollsBackToConfirmed() async {
        let h = LikeHarness()
        await h.repository.setServer(postId: postA, liked: false, count: 10)
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        h.coordinator.tap(postId: postA, current: notLiked10)           // 의도 off
        await h.repository.resolveNext()                                // PUT 확정: liked, 11
        await h.repository.waitForCallCount(2)
        await h.repository.failNext(FeedFailure.server(status: 500))    // DELETE 실패
        await h.coordinator.settled(postId: postA)
        #expect(h.coordinator.state(for: postA) == liked11)
        #expect(h.sink.causes(for: postA).last == .rolledBack)
        #expect(h.sink.toastTexts == ["좋아요를 반영하지 못했어요"])
    }

    @Test("REQ-LIKE-007 TC-LIKE-011 정지 403 동안 추가 탭이 있어도 같은 요청을 다시 보내지 않고 롤백한다")
    func bannedWithExtraTapsSendsNoRetry() async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: notLiked10)
        await h.repository.waitForCallCount(1)
        h.coordinator.tap(postId: postA, current: notLiked10)   // off
        h.coordinator.tap(postId: postA, current: notLiked10)   // on
        await h.repository.failNext(FeedFailure.banned)
        await h.coordinator.settled(postId: postA)
        #expect(await h.repository.calls.count == 1)
        #expect(h.coordinator.state(for: postA) == notLiked10)
        #expect(h.sink.toastTexts == ["이용이 제한되어 좋아요를 누를 수 없어요."])
    }

    @Test("TC-LIKE-010 TC-LIKE-009 좋아요 취소(DELETE)의 404·403도 롤백하고 일반 문구를 띄운다(404는 목록 제외 신호 포함)",
          arguments: [FeedFailure.notFound, .forbidden])
    func unlikeFailures(failure: FeedFailure) async {
        let h = LikeHarness()
        h.coordinator.tap(postId: postA, current: liked11)
        await h.repository.waitForCallCount(1)
        #expect(await h.repository.calls == [.init(postId: postA, liked: false)])
        await h.repository.failNext(failure)
        await h.coordinator.settled(postId: postA)
        #expect(h.coordinator.state(for: postA) == liked11)
        #expect(h.sink.toastTexts == ["좋아요를 반영하지 못했어요"])
        #expect(h.sink.removedPosts == (failure == .notFound ? [postA] : []))
    }

    @Test("TC-LIKE-021 다른 게시물 탭으로 revision이 올라간 뒤 merge가 만든 entry도, 더 오래된 표식의 재검증 응답이 서버 값을 채택한다")
    func mergeCreatedEntryDoesNotBlockOlderRevalidation() async {
        let h = LikeHarness()
        let older = h.coordinator.beginRevalidation()                  // 재검증 A 요청
        h.coordinator.tap(postId: postB, current: notLiked10)           // 다른 게시물 탭: revision 증가
        await h.repository.waitForCallCount(1)
        await h.repository.setServer(postId: postB, liked: false, count: 10)
        await h.repository.resolveNext()
        await h.coordinator.settled(postId: postB)
        let newer = h.coordinator.beginRevalidation()                  // 재검증 B 요청
        let first = LikeState(isLiked: false, likeCount: 5)
        #expect(h.coordinator.merge(server: first, for: postC, since: newer) == first)   // B 응답: postC entry 생성
        let second = LikeState(isLiked: true, likeCount: 6)
        #expect(h.coordinator.merge(server: second, for: postC, since: older) == second) // A 응답: 낡은 값에 머무르지 않는다
        #expect(h.coordinator.state(for: postC) == second)
    }
}

/// 결정적 난수(속성 테스트용).
struct SplitMix64 {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}
