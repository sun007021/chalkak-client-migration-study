import Foundation
import Testing
import ChalkakNetwork
@testable import ChalkakData

@Suite("AUTH 로그아웃")
struct LogoutTests {
    @Test("TC-AUTH-035 로컬 토큰·캐시를 먼저 지운 뒤 POST /auth/logout을 보낸다")
    func localClearedBeforeServerCall() async throws {
        let sut = try AuthSUT { _, _ in .noContent }
        await sut.repository.logout()
        let events = await sut.log.events
        let http = try #require(events.firstIndex(of: "http POST /auth/logout"))
        let storeClear = try #require(events.firstIndex(of: "store.clear"))
        let cacheClear = try #require(events.firstIndex(of: "cache.clear"))
        #expect(storeClear < http)
        #expect(cacheClear < http)
        #expect(await sut.store.currentSession() == nil)
    }

    @Test("TC-AUTH-037 요청은 POST /auth/logout {refreshToken}뿐이고 Authorization이 없다")
    func requestShape() async throws {
        let sut = try AuthSUT(session: makeSession(refresh: "RT-1")) { _, _ in .noContent }
        await sut.repository.logout()
        let requests = await sut.transport.requests
        #expect(requests.count == 1)
        let request = try #require(requests.first)
        #expect(request.method == .post)
        #expect(request.apiPath == "/auth/logout")
        #expect(request.header("Authorization") == nil)
        #expect(Set(request.jsonBody?.keys.map { $0 } ?? []) == ["refreshToken"])
        #expect(request.jsonBody?["refreshToken"] as? String == "RT-1")
    }

    @Test("TC-AUTH-039 푸시 기기 해제 같은 다른 API를 부르지 않는다")
    func noDeviceUnregisterCall() async throws {
        let sut = try AuthSUT { _, _ in .noContent }
        await sut.repository.logout()
        #expect(await sut.transport.requests.map(\.apiPath) == ["/auth/logout"])
    }

    @Test("TC-AUTH-036 서버 실패(네트워크·500·401)는 무시하고 이미 로컬은 지워져 있다, 재시도·갱신 없음", arguments: [
        "network", "500", "401",
    ])
    func serverFailureIgnored(kind: String) async throws {
        let sut = try AuthSUT { _, _ in
            switch kind {
            case "network": throw TransportError.notConnected
            case "500": return .error(500, "INTERNAL_ERROR")
            default: return .error(401, "UNAUTHORIZED")
            }
        }
        await sut.repository.logout()
        #expect(await sut.store.currentSession() == nil)
        #expect(await sut.transport.requests(path: "/auth/logout").count == 1)
        #expect(await sut.transport.requests(path: "/auth/refresh").isEmpty)
        #expect(await sut.events.count == 0)
    }

    @Test("TC-AUTH-038 세션이 없으면(게스트 등) 서버 호출 없이 로컬만 정리한다")
    func noSessionNoServerCall() async throws {
        let sut = try AuthSUT(session: nil, guest: true) { _, _ in .noContent }
        await sut.repository.logout()
        #expect(await sut.transport.count == 0)
        #expect(await sut.caches.count == 1)
    }

    @Test("TC-AUTH-041 로그아웃이 사용자 캐시 정리를 정확히 1회 호출한다")
    func clearsUserCachesOnce() async throws {
        let sut = try AuthSUT { _, _ in .noContent }
        await sut.repository.logout()
        #expect(await sut.caches.count == 1)
    }
}

@Suite("AUTH 캐시 정리 조합")
struct CompositeCacheClearerTests {
    @Test("TC-AUTH-041 등록된 모든 캐시 정리기를 호출한다")
    func callsEveryClearer() async {
        let clearers = (0..<6).map { _ in RecordingUserCacheClearer() }
        await CompositeUserCacheClearer(clearers).clearUserCaches()
        for clearer in clearers { #expect(await clearer.count == 1) }
    }
}

@Suite("AUTH 로그아웃 분리(로컬 즉시, 서버 별도)")
struct SplitLogoutTests {
    @Test("TC-AUTH-035 logoutLocally는 서버를 부르지 않고 로컬 세션·캐시만 지운 뒤 보낼 요청을 돌려준다")
    func localOnly() async throws {
        let sut = try AuthSUT(session: makeSession(refresh: "RT-9")) { _, _ in .noContent }
        let pending = await sut.repository.logoutLocally()
        #expect(pending != nil)
        #expect(await sut.transport.count == 0)
        #expect(await sut.store.currentSession() == nil)
        #expect(await sut.caches.count == 1)
    }

    @Test("TC-AUTH-035 sendLogout이 POST /auth/logout {refreshToken}을 1회 보낸다")
    func sendsAfterwards() async throws {
        let sut = try AuthSUT(session: makeSession(refresh: "RT-9")) { _, _ in .noContent }
        let pending = try #require(await sut.repository.logoutLocally())
        await sut.repository.sendLogout(pending)
        let request = try #require(await sut.transport.requests.first)
        #expect(request.apiPath == "/auth/logout")
        #expect(request.jsonBody?["refreshToken"] as? String == "RT-9")
    }

    @Test("TC-AUTH-038 세션이 없으면 보낼 요청이 없다")
    func noSessionNoPending() async throws {
        let sut = try AuthSUT(session: nil) { _, _ in .noContent }
        #expect(await sut.repository.logoutLocally() == nil)
        #expect(await sut.caches.count == 1)
    }

    @Test("TC-AUTH-035 보낼 요청을 문자열화해도 refreshToken이 새지 않는다")
    func pendingRedacted() async throws {
        let sut = try AuthSUT(session: makeSession(refresh: "SECRET-RT")) { _, _ in .noContent }
        let pending = try #require(await sut.repository.logoutLocally())
        for text in ["\(pending)", String(reflecting: pending)] { #expect(!text.contains("SECRET-RT")) }
    }
}
