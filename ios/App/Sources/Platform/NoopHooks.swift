import ChalkakData
import ChalkakFeatures

// 이후 PR(PUSH, HOME 등)이 실제 구현으로 교체하는 자리표시자.

struct NoopPushRegistration: PushRegistrationTrigger {
    func registerDevice() async {}
}

struct NoopHomePreloader: HomePreloading {
    func preload(access: MainAccess) async throws {}
}
