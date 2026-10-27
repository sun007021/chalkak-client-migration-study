import Foundation
import Observation
import ChalkakCore
import ChalkakNetwork
import ChalkakData

/// 설정의 사인 카드(조회 부분). 카드 모양·"변경하기" 이동은 SET PR이 이 ViewModel을 가져다 쓴다.
@MainActor
@Observable
public final class SignatureCardViewModel {
    /// 카드에 보일 URL(썸네일, 없으면 원본). nil이면 빈 이미지 자리.
    public private(set) var imageURL: URL?
    /// `400 SIGNATURE_REGISTRATION_REQUIRED`: 빈 이미지 + "변경하기"로 새로 등록. 오류 토스트는 없다.
    public private(set) var needsRegistration = false
    public private(set) var isLoading = false
    /// 조회 실패 토스트(`sign.load.error`).
    public private(set) var notice: Notice?

    private let access: MainAccess
    private let repository: any SignatureRepository
    private let activeWork = ActiveWork()
    private var noticeIds = NoticeSequence()
    /// 조회마다 올라가는 세대. 취소된 이전 조회가 뒤늦게 상태를 쓰지 못하게 한다.
    private var generation = 0

    public init(access: MainAccess, repository: any SignatureRepository) {
        self.access = access
        self.repository = repository
    }

    /// 설정 탭이 보일 때마다 부른다(캐시하지 않고 매번 `GET`). 조회 중이면 중복 요청하지 않는다. 게스트는 아무것도 부르지 않는다.
    /// 실패하면 이미 보이던 `imageURL`을 유지하고 `notice`를 남긴다(401은 `notice` 없음). 취소는 무음.
    public func screenAppeared() async {
        guard access == .member, !isLoading else { return }
        generation += 1
        let current = generation
        isLoading = true
        await activeWork.run { [self] in
            defer { if current == generation { isLoading = false } }
            do {
                let lookup = try await repository.currentSignature()
                guard current == generation else { return }
                switch lookup {
                case .registered(let signature):
                    imageURL = signature.displayURL
                    needsRegistration = false
                case .registrationRequired:
                    imageURL = nil
                    needsRegistration = true
                }
            } catch {
                guard current == generation else { return }
                handleFailure(error)
            }
        }
    }

    /// 화면이 사라질 때 진행 중인 조회를 취소한다.
    public func onDisappear() {
        // 곧바로 다시 보여도 새로 조회할 수 있게 진행 상태를 즉시 푼다.
        generation += 1
        isLoading = false
        activeWork.cancel()
    }

    private func handleFailure(_ error: any Error) {
        if error.isCancellation { return }
        // 401은 재인증 이벤트가 로그인으로 보낸다.
        if case APIError.http(401, _, _) = error { return }
        notice = noticeIds.make(SignatureCopy.loadError)
    }
}
