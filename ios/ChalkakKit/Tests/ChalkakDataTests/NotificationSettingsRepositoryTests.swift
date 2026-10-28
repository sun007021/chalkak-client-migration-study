import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakTestSupport
@testable import ChalkakData

private extension NotificationSettingKind {
    /// PATCH 바디의 필드 이름.
    var field: String {
        switch self {
        case .topic: "topicPushEnabled"
        case .moderation: "moderationPushEnabled"
        case .aiReview: "aiReviewPushEnabled"
        }
    }
}

/// refresh 픽스처가 발급하는 새 access 토큰(하드코딩하지 않고 픽스처에서 읽는다).
private func refreshedAccessToken() throws -> String {
    struct Tokens: Decodable { let accessToken: String }
    return try Fixture.load("auth/refresh__success.json").decode(Tokens.self).accessToken
}

@Suite("SET 푸시 수신 설정 저장소", .timeLimit(.minutes(1)))
struct NotificationSettingsRepositoryTests {
    private func sut(_ script: RouteScript, session: AuthSession? = makeSession()) throws -> SettingsSUT {
        try SettingsSUT(script: script, session: session)
    }

    // MARK: GET 디코딩·요청 모양

    @Test("TC-SET-014 세 필드를 읽고 모두 true인 응답은 그대로 반영한다")
    func decodesAllTrue() async throws {
        let sut = try sut(RouteScript().on(notificationSettingsGet, fixture: "settings/notification-settings__get-all-true.json"))
        #expect(try await sut.notifications.fetch() == NotificationSettings(topic: true, moderation: true, aiReview: true))
    }

    @Test("TC-SET-014 꺼진 AI 설정도 그대로 반영한다")
    func decodesAIOff() async throws {
        let sut = try sut(RouteScript().on(notificationSettingsGet, fixture: "settings/notification-settings__get-ai-off.json"))
        #expect(try await sut.notifications.fetch() == NotificationSettings(topic: true, moderation: true, aiReview: false))
    }

    @Test("TC-SET-014 주제만 꺼진 응답도 항목별로 읽는다")
    func decodesTopicOff() async throws {
        let sut = try sut(RouteScript().on(notificationSettingsGet, fixture: "settings/notification-settings__get-topic-off.json"))
        #expect(try await sut.notifications.fetch() == NotificationSettings(topic: false, moderation: true, aiReview: true))
    }

    @Test("TC-SET-014 GET은 경로·메서드·Bearer이고 본문이 없다")
    func getRequestShape() async throws {
        let sut = try sut(RouteScript().on(notificationSettingsGet, fixture: "settings/notification-settings__get-all-true.json"), session: makeSession(access: "AT-3"))
        _ = try await sut.notifications.fetch()
        let request = try #require(await sut.transport.requests.first)
        #expect(request.method == .get)
        #expect(request.apiPath == "/notification-settings")
        #expect(request.header("Authorization") == "Bearer AT-3")
        #expect(request.body == nil || request.body?.isEmpty == true)
    }

    @Test("TC-SET-015 세 필드 중 하나가 없거나 null이면 잘못된 응답(invalidResponse)이고 재시도하지 않는다", arguments: [
        "settings/notification-settings__get-field-missing.json", "settings/notification-settings__get-null-field.json",
    ])
    func missingOrNullFieldIsInvalid(name: String) async throws {
        let sut = try sut(RouteScript().on(notificationSettingsGet, fixture: name))
        await #expect(throws: APIError.invalidResponse) { try await sut.notifications.fetch() }
        #expect(await sut.transport.count(of: notificationSettingsGet) == 1)
    }

    @Test("TC-SET-015 Boolean이 아닌 값도 잘못된 응답이다")
    func nonBooleanIsInvalid() async throws {
        let body = #"{"topicPushEnabled":"true","moderationPushEnabled":true,"aiReviewPushEnabled":true}"#
        let sut = try sut(RouteScript().on(notificationSettingsGet, .json(200, body)))
        await #expect(throws: APIError.invalidResponse) { try await sut.notifications.fetch() }
    }

    // MARK: PATCH 요청 모양(바뀐 항목 하나만)

    @Test("PATCH 바디는 바뀐 항목 하나만 담고 나머지 필드는 생략한다(TC-SET-019 topic · TC-SET-020 moderation · TC-SET-021 aiReview)", arguments: NotificationSettingKind.allCases, [true, false])
    func patchBodyHasOnlyChangedField(kind: NotificationSettingKind, enabled: Bool) async throws {
        let sut = try sut(RouteScript().on(notificationSettingsPatch, fixture: "settings/notification-settings__patch-no-content.json"))
        try await sut.notifications.update(kind, enabled: enabled)
        let request = try #require(await sut.transport.requests.first)
        #expect(request.method == .patch)
        #expect(request.apiPath == "/notification-settings")
        #expect(request.bodyKeys == [kind.field])
        #expect(request.jsonBody?[kind.field] as? Bool == enabled)
        #expect(request.header("Content-Type") == "application/json")
        #expect(request.header("Authorization") == "Bearer old-access")
    }

    @Test("TC-SET-036 어떤 항목이든 빈 PATCH는 나가지 않는다(본문 키가 정확히 하나)", arguments: NotificationSettingKind.allCases)
    func neverSendsEmptyPatch(kind: NotificationSettingKind) async throws {
        let sut = try sut(RouteScript().on(notificationSettingsPatch, fixture: "settings/notification-settings__patch-no-content.json"))
        try await sut.notifications.update(kind, enabled: true)
        let request = try #require(await sut.transport.requests.first)
        #expect(request.bodyKeys.count == 1)
    }

    @Test("TC-SET-036 서버가 빈 요청 400을 주면 클라이언트 버그로 보고 재시도 없이 오류를 던진다")
    func emptyPatch400IsNotRetried() async throws {
        let sut = try sut(RouteScript().on(notificationSettingsPatch, fixture: "settings/notification-settings__patch-bad-request-empty.json"))
        let expected = try apiError(fixture: "settings/notification-settings__patch-bad-request-empty.json")
        await #expect(throws: expected) { try await sut.notifications.update(.topic, enabled: false) }
        #expect(await sut.transport.count(of: notificationSettingsPatch) == 1)
    }

    @Test("TC-SET-022 PATCH 204 본문 없음은 성공이고 본문 디코딩을 시도하지 않는다")
    func noContentIsSuccess() async throws {
        let sut = try sut(RouteScript().on(notificationSettingsPatch, .noContent))
        try await sut.notifications.update(.moderation, enabled: false)
        #expect(await sut.transport.count(of: notificationSettingsPatch) == 1)
    }

    // MARK: 401

    @Test("TC-SET-034 GET이 401이면 refresh 1회 뒤 원 요청을 1회만 재전송한다")
    func getUnauthorizedRefreshesOnce() async throws {
        let script = try RouteScript()
            .on(notificationSettingsGet, fixtures: ["settings/notification-settings__get-unauthorized.json", "settings/notification-settings__get-all-true.json"])
            .on(refreshRoute, fixture: "auth/refresh__success.json")
        let sut = try sut(script)
        #expect(try await sut.notifications.fetch() == NotificationSettings(topic: true, moderation: true, aiReview: true))
        #expect(await sut.transport.count(of: refreshRoute) == 1)
        #expect(await sut.transport.count(of: notificationSettingsGet) == 2)
    }

    @Test("TC-SET-034 PATCH가 401이면 refresh 1회 뒤 원 요청을 1회만 재전송한다")
    func patchUnauthorizedRefreshesOnce() async throws {
        let script = try RouteScript()
            .on(notificationSettingsPatch, fixtures: ["settings/notification-settings__patch-unauthorized.json", "settings/notification-settings__patch-no-content.json"])
            .on(refreshRoute, fixture: "auth/refresh__success.json")
        let sut = try sut(script)
        try await sut.notifications.update(.aiReview, enabled: false)
        #expect(await sut.transport.count(of: refreshRoute) == 1)
        #expect(await sut.transport.count(of: notificationSettingsPatch) == 2)
        let resent = try #require(await sut.transport.requests(key: notificationSettingsPatch).last)
        #expect(resent.header("Authorization") == "Bearer \(try refreshedAccessToken())")
        #expect(resent.bodyKeys == ["aiReviewPushEnabled"])
    }

    @Test("TC-SET-034 refresh가 REAUTHENTICATION_REQUIRED면 재인증 이벤트를 한 번 보내고 401을 던진다(GET·PATCH)")
    func reauthenticationRequired() async throws {
        let get = try sut(RouteScript()
            .on(notificationSettingsGet, fixture: "settings/notification-settings__get-unauthorized.json")
            .on(refreshRoute, fixture: "auth/refresh__reauthentication-required.json"))
        let getExpected = try apiError(fixture: "auth/refresh__reauthentication-required.json")
        await #expect(throws: getExpected) { try await get.notifications.fetch() }
        #expect(await get.events.count == 1)
        #expect(await get.transport.count(of: notificationSettingsGet) == 1)

        let patch = try sut(RouteScript()
            .on(notificationSettingsPatch, fixture: "settings/notification-settings__patch-unauthorized.json")
            .on(refreshRoute, fixture: "auth/refresh__reauthentication-required.json"))
        let patchExpected = try apiError(fixture: "auth/refresh__reauthentication-required.json")
        await #expect(throws: patchExpected) { try await patch.notifications.update(.topic, enabled: true) }
        #expect(await patch.events.count == 1)
        #expect(await patch.transport.count(of: notificationSettingsPatch) == 1)
    }

    // MARK: 재시도(D-21)

    @Test("TC-SET-035 PATCH가 500이면 0.5초·1초 백오프로 최대 2회 재시도하고 소진하면 오류를 던진다")
    func patchRetriesOnServerError() async throws {
        let sut = try sut(RouteScript().on(notificationSettingsPatch, fixture: "settings/notification-settings__patch-internal-error.json"))
        let expected = try apiError(fixture: "settings/notification-settings__patch-internal-error.json")
        await #expect(throws: expected) { try await sut.notifications.update(.topic, enabled: false) }
        #expect(await sut.transport.count(of: notificationSettingsPatch) == 3)
        #expect(sut.clock.recordedSleeps == [.milliseconds(500), .milliseconds(1000)])
    }

    @Test("TC-SET-035 PATCH가 연결 실패여도 같은 백오프로 2회 재시도하고 APIError.network이다")
    func patchRetriesOnConnectionFailure() async throws {
        let sut = try sut(RouteScript().fail(notificationSettingsPatch, .notConnected))
        await #expect(throws: APIError.network) { try await sut.notifications.update(.moderation, enabled: true) }
        #expect(await sut.transport.count(of: notificationSettingsPatch) == 3)
        #expect(sut.clock.recordedSleeps == [.milliseconds(500), .milliseconds(1000)])
    }

    @Test("TC-SET-035 PATCH가 한 번 500이어도 재시도로 성공하면 성공이다")
    func patchRecoversAfterRetry() async throws {
        let sut = try sut(RouteScript().on(notificationSettingsPatch, fixtures: ["settings/notification-settings__patch-internal-error.json", "settings/notification-settings__patch-no-content.json"]))
        try await sut.notifications.update(.topic, enabled: true)
        #expect(await sut.transport.count(of: notificationSettingsPatch) == 2)
        #expect(sut.clock.recordedSleeps == [.milliseconds(500)])
    }

    @Test("TC-SET-035 GET도 500이면 같은 백오프로 최대 2회 재시도한 뒤 오류를 던진다")
    func getRetriesOnServerError() async throws {
        let sut = try sut(RouteScript().on(notificationSettingsGet, fixture: "settings/notification-settings__get-internal-error.json"))
        let expected = try apiError(fixture: "settings/notification-settings__get-internal-error.json")
        await #expect(throws: expected) { try await sut.notifications.fetch() }
        #expect(await sut.transport.count(of: notificationSettingsGet) == 3)
        #expect(sut.clock.recordedSleeps == [.milliseconds(500), .milliseconds(1000)])
    }
}
