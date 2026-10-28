package kr.chalkak.feature.home

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope
import kr.chalkak.core.common.Clock
import kr.chalkak.core.common.KstCalendar
import kr.chalkak.core.common.WeekCalendar
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.data.home.Banner
import kr.chalkak.core.data.home.BannerRepository
import kr.chalkak.core.data.home.HomePost
import kr.chalkak.core.data.home.HomeRepository
import kr.chalkak.core.data.home.ModerationStatus
import kr.chalkak.feature.auth.HomeMode
import java.time.LocalDate

/**
 * Home like interaction port, backed by the shared optimistic like-toggle ([LikeControllerToggler], D-04); the
 * holder only decides whether a tap is allowed (guest -> toast `home.guest.like`, no call). [currentlyLiked] and
 * [likeCount] are the values the tapped card shows, so a post unknown to the shared toggle can be registered first.
 */
fun interface LikeToggler {
    suspend fun toggle(postId: String, currentlyLiked: Boolean, likeCount: Int)
}

/**
 * Home screen state (HOME + BANR lists). Runs on the injected [scope]; all dates come from [clock] in KST.
 *
 * Contract the implementer must satisfy (one line per behaviour, see the tests for the details):
 * - [onShown] first call = full load; later calls = silent refresh (no [HomeUiState.refreshing]) or, when the KST date
 *   changed since [HomeUiState.loadedDate], a full reload with Loading states so no old-date content is mixed in.
 * - Sections load in parallel and independently; a section failure never touches another section.
 * - Member: topics(today, yesterday) -> popularPosts(topic.topicDate) top 5; today(); calendar for every month of the
 *   Sunday-start week (all months must succeed, else week = Error, no partial); banners page 1; unreadStatus.
 * - Guest: no today/calendar/unread calls; hero = Empty(), week = 7 empty days; topics/posts/banners as members.
 * - A late response of a superseded load / a cancelled load ([onScreenGone]) / an earlier account never overwrites state.
 *
 * Section loading lives in [HeroWeekLoader], [RankingLoader], [IssueBannerPager] and [UnreadLoader]; this class only orchestrates
 * lifecycle, batches, generations and effects.
 *
 * Implementation notes: every load runs under [work] (cancelled by a newer load, [onScreenGone] and [onAccountChanged]);
 * writes additionally check [generation], so a response that slips through a cancellation still cannot land.
 * Everything runs on the scope's (main) dispatcher, so the plain fields below need no locking.
 */
class HomeStateHolder(
    private val scope: CoroutineScope,
    clock: Clock,
    home: HomeRepository,
    banners: BannerRepository,
    private val likes: LikeToggler,
    private val analytics: AnalyticsTracker,
    mode: HomeMode,
    private val diagnostics: HomeDiagnostics = HomeDiagnostics.Ignore,
) {
    private val kst = KstCalendar(clock)
    private val core = HomeCore(mode, diagnostics)
    private val heroWeek = HeroWeekLoader(core, home)
    private val rankings = RankingLoader(core, home)
    private val pager = IssueBannerPager(core, banners)
    private val unread = UnreadLoader(core, home)

    val state: StateFlow<HomeUiState> = core.state.asStateFlow()
    val effects: Flow<HomeEffect> = core.effects.receiveAsFlow()

    private var started = false
    private var loadDate: LocalDate? = null
    private var issueOpening = false
    private var work: Job = newWork()

    private enum class LoadKind { Fresh, SilentRefresh, PullRefresh }

    // ---- lifecycle ------------------------------------------------------------------------------

    /** Home became visible (tab selected / screen shown). First call loads; later calls refresh silently (REQ-HOME-040/041). */
    fun onShown() {
        issueOpening = false
        when {
            !started || dateChanged() -> startLoad(LoadKind.Fresh)
            else -> startLoad(LoadKind.SilentRefresh)
        }
    }

    /** App returned to foreground while home is visible: same behaviour as a later [onShown] (TC-HOME-039). */
    fun onForeground() = onShown()

    /** Screen left: cancels in-flight work; results are dropped; no toast, content kept (TC-HOME-038, TC-BANR-008/016). */
    fun onScreenGone() {
        issueOpening = false
        cancelWork()
    }

    /** Pull to refresh: indicator on, content kept; ignored while a refresh is running; failure -> toast, content kept. Banner list restarts at page 1. */
    fun onPullToRefresh() {
        if (core.state.value.refreshing) return
        startLoad(if (dateChanged()) LoadKind.Fresh else LoadKind.PullRefresh)
    }

    /** Logout/login switched the account: drop all state and in-flight results of the previous account, load again for [mode]. */
    fun onAccountChanged(mode: HomeMode) {
        cancelWork()
        issueOpening = false
        core.state.value = HomeUiState(mode = mode)
        startLoad(LoadKind.Fresh)
    }

    /** Unread dot re-check triggers (each re-fetches `unread-status` exactly once; guests never fetch). */
    fun onNotificationInboxClosed() = recheckUnread()

    fun onPushReceived() = recheckUnread()

    private fun dateChanged(): Boolean = loadDate != kst.today()

    private fun newWork(): Job = SupervisorJob(scope.coroutineContext[Job])

    private fun cancelWork() {
        work.cancel()
        work = newWork()
        core.supersede()
        core.state.update { it.copy(refreshing = false, issue = it.issue.withoutLoadingMore()) }
    }

    private fun launchWork(block: suspend CoroutineScope.() -> Unit) {
        scope.launch(work) {
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Backstop only: every loader has its own section guard, so this is a bug in the orchestration itself.
                // It is reported and must not kill the holder's scope.
                diagnostics.unexpected("home.work", e)
            }
        }
    }

    private fun startLoad(kind: LoadKind) {
        cancelWork()
        val today = kst.today()
        started = true
        loadDate = today
        when (kind) {
            LoadKind.Fresh -> core.state.update { HomeUiState(mode = it.mode, hasUnread = it.hasUnread) }
            LoadKind.PullRefresh -> core.state.update { it.copy(refreshing = true) }
            LoadKind.SilentRefresh -> Unit
        }
        val batch = core.newBatch(keepContent = kind != LoadKind.Fresh, notify = kind == LoadKind.PullRefresh)
        launchWork { loadAll(batch, today, finishRefresh = kind == LoadKind.PullRefresh) }
    }

    private suspend fun loadAll(batch: Batch, today: LocalDate, finishRefresh: Boolean) {
        core.update(batch) { it.copy(loadedDate = today) }
        val week = WeekCalendar.weekOf(today)
        supervisorScope {
            val calendar = if (core.member) async { heroWeek.fetchCalendar(week) } else null
            launch { rankings.load(batch, RankingKind.Today, today) }
            launch { rankings.load(batch, RankingKind.Yesterday, today.minusDays(1)) }
            launch { heroWeek.loadWeek(batch, week, calendar) }
            launch { heroWeek.loadHero(batch) { calendar?.await()?.entriesOrNull() } }
            launch { pager.loadFirstPage(batch) }
            launch { unread.load(batch) }
        }
        if (!core.isCurrent(batch)) return
        if (finishRefresh) core.state.update { it.copy(refreshing = false) }
        batch.failureToast?.let(core::showToast)
    }

    private fun recheckUnread() {
        if (!core.member) return
        val batch = core.newBatch()
        launchWork { unread.load(batch) }
    }

    // ---- banner paging and retries --------------------------------------------------------------

    /**
     * Banner list scrolled: [lastVisibleIndex] is the index of the last visible card. When it is within the last two
     * cards (>= size - 2), hasNext, and nothing is loading, the next page is requested once (REQ-BANR-007/008).
     */
    fun onBannerScrolled(lastVisibleIndex: Int) {
        val page = pager.requestNextPage(lastVisibleIndex) ?: return
        val batch = core.newBatch()
        launchWork { pager.loadMore(batch, page) }
    }

    fun onRetryHero() {
        core.state.update { it.copy(hero = HeroState.Loading) }
        val batch = core.newBatch()
        launchWork { heroWeek.loadHero(batch) { heroWeek.shownEntries() } }
    }

    fun onRetryWeek() {
        core.state.update { it.copy(week = Section.Loading) }
        val batch = core.newBatch()
        val week = WeekCalendar.weekOf(loadDate ?: kst.today())
        launchWork {
            val calendar = if (core.member) async { heroWeek.fetchCalendar(week) } else null
            heroWeek.loadWeek(batch, week, calendar)
        }
    }

    fun onRetryRanking(kind: RankingKind) {
        val today = loadDate ?: kst.today()
        rankings.markLoading(kind)
        val batch = core.newBatch()
        launchWork { rankings.load(batch, kind, if (kind == RankingKind.Today) today else today.minusDays(1)) }
    }

    fun onRetryIssue() {
        core.state.update { it.copy(issue = IssueState.Loading) }
        val batch = core.newBatch()
        launchWork { pager.loadFirstPage(batch) }
    }

    // ---- taps -----------------------------------------------------------------------------------

    fun onHeroClicked() {
        if (!core.member) return core.showToast(HomeCopyKeys.GUEST_UPLOAD)
        when (val hero = core.state.value.hero) {
            is HeroState.Empty -> if (hero.banned) core.showToast(HomeCopyKeys.HERO_BANNED) else core.emit(HomeEffect.OpenUpload)
            is HeroState.Photo -> if (hero.status == ModerationStatus.APPROVED) core.emit(HomeEffect.OpenFeed(hero.postId))
            else -> Unit
        }
    }

    fun onRankingPostClicked(post: HomePost) {
        if (core.member) core.emit(HomeEffect.OpenFeed(post.id, seed = post)) else core.showToast(HomeCopyKeys.GUEST_FEED)
    }

    fun onRankingMoreClicked(kind: RankingKind) {
        val today = core.state.value.loadedDate ?: kst.today()
        core.emit(HomeEffect.OpenDisplay(if (kind == RankingKind.Today) today else today.minusDays(1)))
    }

    fun onWeekDayClicked(date: LocalDate) {
        val days = (core.state.value.week as? Section.Ready)?.value ?: return
        if (days.any { it.date == date && it.entry != null }) core.emit(HomeEffect.OpenRecord(date))
    }

    fun onNotificationClicked() {
        if (core.member) core.emit(HomeEffect.OpenNotifications) else core.showToast(HomeCopyKeys.GUEST_NOTIFICATION)
    }

    /** Guests get the login toast without a call; members hand the toggle to the [likes] port, whose failures never reach the holder. */
    fun onLikeClicked(post: HomePost) {
        if (!core.member) return core.showToast(HomeCopyKeys.GUEST_LIKE)
        scope.launch {
            try {
                likes.toggle(post.id, post.isLiked, post.likeCount)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                diagnostics.unexpected("home.like", e)
                core.showToast(HomeCopyKeys.COMMON_GENERIC)
            }
        }
    }

    /** Opens the ISSUE web view and sends `screen_view(issue)` once; a double tap is ignored until home is shown again (TC-BANR-025). */
    fun onBannerClicked(banner: Banner) {
        if (issueOpening) return
        issueOpening = true
        analytics.screenView(ISSUE_SCREEN)
        core.emit(HomeEffect.OpenIssue(banner))
    }

    private companion object {
        const val ISSUE_SCREEN = "issue"
    }
}
