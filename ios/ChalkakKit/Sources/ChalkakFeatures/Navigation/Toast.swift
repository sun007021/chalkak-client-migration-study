import Foundation
import Observation
import ChalkakCore

/// 화면 위에 잠깐 보이는 토스트를 띄우는 쪽의 인터페이스. ViewModel은 구체 `ToastCenter` 대신 이것만 안다.
@MainActor
public protocol ToastPresenting: AnyObject {
    /// 문구를 띄운다. 화면이 보이지 않으면 버린다(쌓지 않는다).
    func show(_ message: String)
}

/// 앱 전체 토스트 상태(D-20, REQ-NAV-044~045).
/// - `show`는 화면이 보일 때만 `current`를 새 `Notice`로 바꾸고 `AppConstants.toastDuration`(2.5초) 뒤에 지운다.
/// - 같은 문구가 연달아 와도 id가 새로 붙어 다시 보이고 타이머가 처음부터 다시 시작한다.
/// - 새 `show`는 이전 만료 타이머를 취소한다(이전 타이머가 새 토스트를 일찍 지우지 못한다).
/// - 화면이 가려지면(`setScreenVisible(false)`) 떠 있던 토스트를 지우고 만료 타이머를 취소한다.
/// - 화면이 보이지 않을 때(`setScreenVisible(false)`)의 요청은 표시하지 않고 쌓지도 않는다.
@MainActor
@Observable
public final class ToastCenter: ToastPresenting {
    public private(set) var current: Notice?
    /// 지금 걸려 있는 만료 타이머(없으면 nil). 테스트가 만료 시점을 기다리는 데 쓴다.
    var expiryTask: Task<Void, Never>?

    @ObservationIgnored private let clock: any AppClock
    @ObservationIgnored private var notices = NoticeSequence()
    @ObservationIgnored private var isScreenVisible = true

    public init(clock: any AppClock) {
        self.clock = clock
    }

    public func show(_ message: String) {
        guard isScreenVisible else { return }
        let notice = notices.make(message)
        current = notice
        // 이전 타이머가 새 토스트를 지우지 못하게 취소하고, 자기 id일 때만 지운다.
        expiryTask?.cancel()
        expiryTask = Task { @MainActor [weak self, clock] in
            do { try await clock.sleep(for: AppConstants.toastDuration) } catch { return }
            guard let self, self.current?.id == notice.id else { return }
            self.current = nil
        }
    }

    /// 토스트를 띄울 수 있는 화면이 보이는지(앱이 포그라운드이고 최상위 화면이 보일 때 true). 기본 true.
    public func setScreenVisible(_ visible: Bool) {
        isScreenVisible = visible
        // 화면이 가려지면 떠 있던 토스트도 지우고 만료 타이머를 취소한다(D-20).
        if !visible {
            expiryTask?.cancel()
            expiryTask = nil
            current = nil
        }
    }
}
