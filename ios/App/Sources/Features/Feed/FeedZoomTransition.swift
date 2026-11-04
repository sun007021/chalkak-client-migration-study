import SwiftUI
import UIKit

// 전시 사진 → 피드 상세 줌 전환(screens-b.md 4.2)과 왼쪽 가장자리 뒤로 스와이프.
// 원본은 전환을 직접 그렸지만 여기서는 iOS 18의 `matchedTransitionSource` + `navigationTransition(.zoom)`을 쓴다.
// 동작 줄이기가 켜져 있으면 시스템이 사진 이동 없이 페이드로 대신한다.

private struct FeedZoomNamespaceKey: EnvironmentKey {
    static let defaultValue: Namespace.ID? = nil
}

extension EnvironmentValues {
    /// 줌 출발 뷰와 도착 화면이 함께 쓰는 네임스페이스. 메인 셸이 한 번 만들어 내려 준다.
    var feedZoomNamespace: Namespace.ID? {
        get { self[FeedZoomNamespaceKey.self] }
        set { self[FeedZoomNamespaceKey.self] = newValue }
    }
}

/// 사진 카드를 줌 전환의 출발 뷰로 등록한다. `id`가 nil이거나 네임스페이스가 없으면 아무것도 하지 않는다.
struct FeedZoomSourceModifier: ViewModifier {
    let id: UUID?
    @Environment(\.feedZoomNamespace) private var namespace

    func body(content: Content) -> some View {
        if let id, let namespace {
            content.matchedTransitionSource(id: id, in: namespace) { source in
                source.clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.photoCard))
            }
        } else {
            content
        }
    }
}

/// 피드 화면을 줌 전환의 도착지로 만든다. 출발 카드가 없는 진입(홈·알림 등)은 기본 전환을 쓴다.
struct FeedZoomDestinationModifier: ViewModifier {
    let postID: UUID
    let enabled: Bool
    @Environment(\.feedZoomNamespace) private var namespace

    func body(content: Content) -> some View {
        if enabled, let namespace {
            content.navigationTransition(.zoom(sourceID: postID, in: namespace))
        } else {
            content
        }
    }
}

extension View {
    func feedZoomSource(id: UUID?) -> some View { modifier(FeedZoomSourceModifier(id: id)) }
    func feedZoomDestination(postID: UUID, enabled: Bool) -> some View {
        modifier(FeedZoomDestinationModifier(postID: postID, enabled: enabled))
    }
    /// 상단 바를 숨긴 화면에서도 왼쪽 가장자리 스와이프로 뒤로 간다.
    func edgeSwipeBackEnabled() -> some View { background(EdgeSwipeBackEnabler().frame(width: 0, height: 0)) }
}

/// 내비게이션 바를 숨기면 시스템 뒤로 스와이프가 꺼지므로 제스처 델리게이트를 다시 걸어 켠다.
private struct EdgeSwipeBackEnabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> EdgeSwipeBackController { EdgeSwipeBackController() }
    func updateUIViewController(_ uiViewController: EdgeSwipeBackController, context: Context) {}
}

private final class EdgeSwipeBackController: UIViewController, UIGestureRecognizerDelegate {
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard let recognizer = navigationController?.interactivePopGestureRecognizer else { return }
        recognizer.delegate = self
        recognizer.isEnabled = true
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        (navigationController?.viewControllers.count ?? 0) > 1
    }
}
