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
            .task { await container.pushHub.sessionStarted(session) }
            .onDisappear { container.pushHub.sessionEnded(session) }
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
    /// 전시 사진 → 피드 줌 전환의 출발·도착 연결.
    @Namespace private var feedZoomNamespace
    /// 스크롤하면 Liquid Glass 하단 바를 줄인다(iOS 26 미만에서는 쓰이지 않는다).
    @State private var isBottomBarCompact = false

    var body: some View {
        let shell = session.shell
        NavigationStack(path: pathBinding) {
            // 평면 바는 내용 아래에 쌓는다. safeAreaInset은 스크롤 내용이 바 밑까지 이어져 첫 화면의 아래쪽 하트가
            // 바에 가려 눌리지 않았다(#83). Liquid Glass 바는 원본 ContentView처럼 safeAreaInset으로 띄워
            // 스크롤 내용이 유리 밑으로 비치게 한다(스크롤 끝은 바 위에서 멈춘다).
            Group {
                if ChalkakPlatformAppearance.usesLiquidGlass {
                    tabContentArea(shell.selectedTab)
                        .safeAreaInset(edge: .bottom, spacing: 0) { bottomBar(shell) }
                } else {
                    VStack(spacing: 0) {
                        tabContentArea(shell.selectedTab)
                        bottomBar(shell)
                    }
                }
            }
            .background(ChalkakColor.background.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: StackEntry.self) { entry in
                destination(for: entry.route)
                    .toolbar(.hidden, for: .navigationBar)
            }
        }
        .environment(\.feedZoomNamespace, feedZoomNamespace)
        .overlay { SettingsAccountDialogs(account: session.settings.account) }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("main.root")
        .onChange(of: shell.path) { old, new in
            syncEntries(with: new)
            // 업로드·피드백이 열리거나 닫히면 보류된 푸시 탭을 다시 평가한다(REQ-PUSH-031).
            Task { await container.pushHub.gateMayHaveChanged(session) }
            // 알림함이 닫히면 미읽음 점을 다시 확인한다.
            if old.contains(.notifications), !new.contains(.notifications) {
                Task { await session.home.notificationsClosed() }
            }
        }
        .onChange(of: shell.selectedTab) { _, _ in isBottomBarCompact = false }
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
        .onChange(of: session.push.needsLogin) { _, needsLogin in
            guard needsLogin else { return }
            session.push.consumeNeedsLogin()
            Task { await container.launch.handleReauthenticationRequired() }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await session.home.appBecameActive() }
            Task { await session.settings.appBecameActive() }
            Task { await container.pushHub.appBecameActive() }
        }
        // 푸시·알림의 "AI 결과 열기" 요청을 받아 게시물 상세가 가져가게 둔다.
        .onChange(of: shell.aiResultRequest) { _, request in
            guard request != nil, let request = shell.consumeAIResultRequest() else { return }
            session.aiResultInbox.add(request.postId)
        }
    }

    private func tabContentArea(_ tab: MainTab) -> some View {
        tabContent(tab)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .chalkakBottomBarScrollBehavior(isCompact: $isBottomBarCompact)
    }

    @ViewBuilder
    private func bottomBar(_ shell: MainShellViewModel) -> some View {
        if shell.isBottomBarVisible {
            ChalkakBottomBar(
                selectedTab: shell.selectedTab,
                isCompact: $isBottomBarCompact,
                onSelect: { tab in
                    // 전시 탭을 다시 누르면 맨 위로 + 재검증(REQ-DISP-029).
                    if shell.selectTab(tab) == .reselected, tab == .display {
                        Task { await session.display?.tabReselected() }
                    }
                },
                onUpload: { Task { await shell.startUpload() } }
            )
            .padding(.horizontal, bottomBarHorizontalPadding)
            .padding(.bottom, bottomBarBottomPadding)
            .animation(.smooth(duration: 0.75), value: isBottomBarCompact)
        }
    }

    // 원본 ContentView: Liquid Glass일 때만 좌우 lg+xs(줄이면 xxl+xs), 아래 sm 여백. 평면 바는 화면 폭 그대로.
    private var bottomBarHorizontalPadding: CGFloat {
        guard ChalkakPlatformAppearance.usesLiquidGlass else { return 0 }
        return (isBottomBarCompact ? ChalkakSpacing.xxl : ChalkakSpacing.lg) + ChalkakSpacing.xs
    }

    private var bottomBarBottomPadding: CGFloat {
        ChalkakPlatformAppearance.usesLiquidGlass ? ChalkakSpacing.sm : 0
    }

    @ViewBuilder
    private func tabContent(_ tab: MainTab) -> some View {
        switch tab {
        case .home:
            HomeView(viewModel: session.home, container: container, session: session, isActive: session.shell.path.isEmpty)
        case .display:
            DisplayHost(container: container, session: session)
        case .record:
            RecordHost(container: container, session: session)
        case .settings:
            SettingsScreen(container: container, session: session)
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
                .feedZoomDestination(postID: entry.feedPostID, enabled: shell.selectedTab == .display)
        case .notifications:
            NotificationInboxScreen(container: container, session: session)
        case .notificationDetail(let notificationId):
            NotificationDetailScreen(container: container, session: session, notificationId: notificationId)
        case .feedback:
            FeedbackScreen(container: container, session: session)
        case .upload(let topicDate):
            UploadScreen(container: container, session: session, topicDate: topicDate)
        case .changeSignature:
            ChangeSignatureDrawingScreen(container: container, session: session)
        case .changeSignaturePreview:
            ChangeSignaturePreviewScreen(container: container, session: session)
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
