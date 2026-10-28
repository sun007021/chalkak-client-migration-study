import SwiftUI
import ChalkakCore
import ChalkakFeatures

/// 메인에 들어갈 때 ViewModel 묶음을 한 번 만들어 쥐는 호스트.
struct MainHost: View {
    let container: AppContainer
    @State private var session: MainSession

    init(container: AppContainer, access: MainAccess) {
        self.container = container
        _session = State(initialValue: container.makeMainSession(access: access))
    }

    var body: some View {
        MainView(container: container, session: session)
    }
}

/// NavigationStack의 한 칸. 경로 값(`MainRoute`)은 Hashable이 아니라 id로 구분하고, 목적지는 칸에 담아 둔 경로로 그린다.
struct StackEntry: Hashable {
    let id: Int
    let route: MainRoute

    static func == (lhs: StackEntry, rhs: StackEntry) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// 메인 셸: 탭 루트 4개 + 하단 바 + 쌓임 화면. 상태와 규칙은 `MainShellViewModel`에 있고 여기서는 그리기만 한다.
struct MainView: View {
    let container: AppContainer
    let session: MainSession
    @Environment(\.scenePhase) private var scenePhase
    @State private var entries: [StackEntry] = []
    @State private var nextEntryID = 0

    var body: some View {
        let shell = session.shell
        NavigationStack(path: pathBinding) {
            tabContent(shell.selectedTab)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(ChalkakColor.background.ignoresSafeArea())
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if shell.isBottomBarVisible {
                        ChalkakBottomBar(
                            selectedTab: shell.selectedTab,
                            onSelect: { tab in
                                // 전시 탭을 다시 누르면 맨 위로 + 재검증(REQ-DISP-029).
                                if shell.selectTab(tab) == .reselected, tab == .display {
                                    Task { await session.display?.tabReselected() }
                                }
                            },
                            onUpload: { Task { await shell.startUpload() } }
                        )
                    }
                }
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: StackEntry.self) { entry in
                    destination(for: entry.route)
                        .toolbar(.hidden, for: .navigationBar)
                }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("main.root")
        .onChange(of: shell.path) { old, new in
            syncEntries(with: new)
            // 알림함이 닫히면 미읽음 점을 다시 확인한다.
            if old.contains(.notifications), !new.contains(.notifications) {
                Task { await session.home.notificationsClosed() }
            }
        }
        .onChange(of: shell.needsLogin) { _, needsLogin in
            guard needsLogin else { return }
            shell.consumeNeedsLogin()
            Task { await container.launch.handleReauthenticationRequired() }
        }
        .onChange(of: session.home.needsLogin) { _, needsLogin in
            guard needsLogin else { return }
            session.home.consumeNeedsLogin()
            Task { await container.launch.handleReauthenticationRequired() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await session.home.appBecameActive() } }
        }
        // 푸시·알림의 "AI 결과 열기" 요청을 받아 게시물 상세가 가져가게 둔다.
        .onChange(of: shell.aiResultRequest) { _, request in
            guard request != nil, let request = shell.consumeAIResultRequest() else { return }
            session.aiResultInbox.add(request.postId)
        }
    }

    @ViewBuilder
    private func tabContent(_ tab: MainTab) -> some View {
        switch tab {
        case .home:
            HomeView(viewModel: session.home, container: container, session: session, isActive: session.shell.path.isEmpty)
        case .display:
            DisplayHost(container: container, session: session)
        case .record:
            PlaceholderView(title: NavCopy.label(for: .record), identifier: "record")
        case .settings:
            PlaceholderView(title: NavCopy.label(for: .settings), identifier: "settings")
        }
    }

    /// 쌓임 목적지. 구현하지 않은 화면은 자리표시자(제목은 분석 화면 이름)이며 다음 PR이 실제 화면으로 바꾼다.
    @ViewBuilder
    private func destination(for route: MainRoute) -> some View {
        let shell = session.shell
        switch route {
        case .issue(let url):
            IssueWebScreen(container: container, url: url, onBack: { shell.pop() })
        case .feed(let entry):
            FeedScreen(container: container, session: session, entry: entry)
        case .notifications:
            PlaceholderView(title: AnalyticsScreen.notifications.rawValue, identifier: "notifications", onBack: { shell.pop() })
        case .notificationDetail:
            PlaceholderView(title: AnalyticsScreen.notificationDetail.rawValue, identifier: "notification-detail", onBack: { shell.pop() })
        case .feedback:
            PlaceholderView(title: AnalyticsScreen.feedback.rawValue, identifier: "feedback", onBack: { shell.pop() })
        case .upload:
            PlaceholderView(title: AnalyticsScreen.photoUpload.rawValue, identifier: "upload", onBack: { shell.pop() })
        case .changeSignature:
            PlaceholderView(title: AnalyticsScreen.changeSignature.rawValue, identifier: "change-signature", onBack: { shell.pop() })
        case .changeSignaturePreview:
            PlaceholderView(title: AnalyticsScreen.changeSignaturePreview.rawValue, identifier: "change-signature-preview", onBack: { shell.pop() })
        case .notificationDetail:
            PlaceholderView(title: AnalyticsScreen.notificationDetail.rawValue, identifier: "notification-detail", onBack: { shell.pop() })
        }
    }

    /// 사용자가 스와이프·시스템 동작으로 줄인 경로를 ViewModel의 `path`에도 반영한다.
    private var pathBinding: Binding<[StackEntry]> {
        Binding(
            get: { entries },
            set: { newValue in
                entries = newValue
                while session.shell.path.count > newValue.count { session.shell.pop() }
            }
        )
    }

    /// ViewModel의 `path`를 정본으로 NavigationStack 칸을 맞춘다.
    private func syncEntries(with path: [MainRoute]) {
        if entries.count > path.count { entries.removeLast(entries.count - path.count) }
        for (index, route) in path.enumerated() {
            if index < entries.count {
                if entries[index].route != route { entries[index] = makeEntry(route) }
            } else {
                entries.append(makeEntry(route))
            }
        }
    }

    private func makeEntry(_ route: MainRoute) -> StackEntry {
        nextEntryID += 1
        return StackEntry(id: nextEntryID, route: route)
    }
}
