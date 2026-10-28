package kr.chalkak.feature.record

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.core.data.record.RecordPost
import kr.chalkak.core.data.record.testing.FakeRecordRepository
import kr.chalkak.core.network.ApiResult
import kr.chalkak.feature.auth.HomeMode
import java.time.LocalDate
import java.time.YearMonth
import java.util.concurrent.CopyOnWriteArrayList

/** Runs on the test scheduler (so runCurrent / advanceUntilIdle drive it) but counts as foreground work. */
fun TestScope.holderScope(): CoroutineScope = CoroutineScope(StandardTestDispatcher(testScheduler) + SupervisorJob())

/** Collects [flow] eagerly for the rest of the test so no emission is missed. */
@OptIn(ExperimentalCoroutinesApi::class)
fun <T> TestScope.collectAll(flow: Flow<T>): MutableList<T> {
    val out = CopyOnWriteArrayList<T>()
    backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { flow.collect { out += it } }
    return out
}

class RecordingAnalytics : AnalyticsTracker {
    val screens = CopyOnWriteArrayList<String>()
    override fun screenView(screen: String) { screens += screen }
}

/** Renders `bytes` (a stand-in for the PNG) and records the requested month. */
class RecordingRenderer : CalendarImageRenderer {
    val calls = CopyOnWriteArrayList<YearMonth>()
    val bytes = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47)
    override suspend fun render(month: YearMonth, cells: List<RecordCell>): ByteArray { calls += month; return bytes }
}

class RecordingSaver : CalendarImageSaver {
    val calls = CopyOnWriteArrayList<Pair<String, ByteArray>>()
    var handler: suspend () -> SaveOutcome = { SaveOutcome.Saved }
    override suspend fun save(fileName: String, png: ByteArray): SaveOutcome { calls += fileName to png; return handler() }
}

class Rig(
    val holder: RecordStateHolder,
    val repo: FakeRecordRepository,
    val changes: PostChanges,
    val analytics: RecordingAnalytics,
    val renderer: RecordingRenderer,
    val saver: RecordingSaver,
    val clock: FakeClock,
    val states: List<RecordUiState>,
    val effects: List<RecordEffect>,
) {
    val s: RecordUiState get() = holder.state.value
    val toasts: List<RecordEffect.ShowToast> get() = effects.filterIsInstance<RecordEffect.ShowToast>()

    /** Toast texts resolved through the copy table (tests never branch on copy keys). */
    val toastTexts: List<String> get() = toasts.map { Copy[it.copyKey] }
    val nonToastEffects: List<RecordEffect> get() = effects.filterNot { it is RecordEffect.ShowToast }

    fun cell(date: LocalDate): RecordCell = s.cells.single { it.date == date }
    fun post(date: LocalDate): RecordPost? = cell(date).post
    val posts: List<RecordPost> get() = s.cells.mapNotNull { it.post }
}

/** Fresh fakes + holder. Nothing is loaded yet: set handlers first, then [show]. Default clock = FIXTURE_NOW (2026-10-27 12:00 KST). */
fun TestScope.rig(
    mode: HomeMode = HomeMode.Member,
    clock: FakeClock = FakeClock(),
): Rig {
    val repo = FakeRecordRepository()
    val changes = PostChanges()
    val analytics = RecordingAnalytics()
    val renderer = RecordingRenderer()
    val saver = RecordingSaver()
    val holder = RecordStateHolder(holderScope(), clock, repo, changes, analytics, mode, renderer, saver)
    return Rig(holder, repo, changes, analytics, renderer, saver, clock, collectAll(holder.state), collectAll(holder.effects))
}

/** First presentation of the screen, then let every pending request finish (virtual time only). */
fun TestScope.show(r: Rig, requestedDate: LocalDate? = null) {
    r.holder.onShown(requestedDate)
    advanceUntilIdle()
}

fun <T> ok(value: T): ApiResult<T> = ApiResult.Success(value)

/** A request that stays open until [complete]; lets a test order late answers (virtual time, no sleeping). */
class Gate<T> {
    private val deferred = CompletableDeferred<T>()
    suspend fun await(): T = deferred.await()
    fun complete(value: T) { deferred.complete(value) }
}

val OCT = YearMonth.of(2026, 10)
val SEP = YearMonth.of(2026, 9)
val NOV = YearMonth.of(2026, 11)

val D_OCT_05: LocalDate = LocalDate.of(2026, 10, 5)
val D_OCT_20: LocalDate = LocalDate.of(2026, 10, 20)
val D_OCT_27: LocalDate = LocalDate.of(2026, 10, 27)
val D_OCT_31: LocalDate = LocalDate.of(2026, 10, 31)
val D_SEP_17: LocalDate = LocalDate.of(2026, 9, 17)
val D_SEP_30: LocalDate = LocalDate.of(2026, 9, 30)

const val POST_OCT_20 = "22222222-2222-4222-8222-222222222290"
const val POST_OCT_27 = "22222222-2222-4222-8222-222222222201"
const val POST_OCT_31 = "22222222-2222-4222-8222-222222222291"
const val POST_SEP_17 = "22222222-2222-4222-8222-222222222297"
const val POST_SEP_30 = "22222222-2222-4222-8222-222222222296"

/** 2026-11-05 12:00 KST: November is the current month and the server has no November records. */
fun novemberClock() = FakeClock().also { it.set("2026-11-05T03:00:00Z") }
