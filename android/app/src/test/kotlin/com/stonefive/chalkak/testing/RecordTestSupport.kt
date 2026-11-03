package com.stonefive.chalkak.testing

import java.time.LocalDate
import java.time.YearMonth
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.CompletableDeferred
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.core.data.record.testing.FakeRecordRepository
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.record.CalendarImageRenderer
import kr.chalkak.feature.record.CalendarImageSaver
import kr.chalkak.feature.record.RecordCell
import kr.chalkak.feature.record.RecordStateHolder
import kr.chalkak.feature.record.RecordUiState
import kr.chalkak.feature.record.SaveOutcome

/** Stand-in for the bitmap renderer: the PNG signature as bytes, every requested month recorded. */
class RecordingCalendarRenderer : CalendarImageRenderer {
    val calls = CopyOnWriteArrayList<YearMonth>()
    val png = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47)
    override suspend fun render(month: YearMonth, cells: List<RecordCell>): ByteArray {
        calls += month
        return png
    }
}

/** Stand-in for the MediaStore writer; [outcome] decides the answer. */
class RecordingCalendarSaver(var outcome: SaveOutcome = SaveOutcome.Saved) : CalendarImageSaver {
    val fileNames = CopyOnWriteArrayList<String>()

    /** Set -> every save stays open until it completes (a save in progress). */
    var hold: CompletableDeferred<Unit>? = null
    override suspend fun save(fileName: String, png: ByteArray): SaveOutcome {
        fileNames += fileName
        hold?.await()
        return outcome
    }
}

/** 2026-10-27 12:00 KST, the day of the shared fixtures. */
val RECORD_TODAY: LocalDate = LocalDate.of(2026, 10, 27)
val RECORD_OCT: YearMonth = YearMonth.of(2026, 10)
val RECORD_SEP: YearMonth = YearMonth.of(2026, 9)

const val RECORD_POST_OCT_20 = "22222222-2222-4222-8222-222222222290"
const val RECORD_POST_OCT_27 = "22222222-2222-4222-8222-222222222201"
const val RECORD_POST_OCT_31 = "22222222-2222-4222-8222-222222222291"

/** thumbnail url of a record fixture post (`record/posts-calendar__2026-10.json`). */
fun recordThumb(postId: String) = "https://cdn.example.test/posts/$postId/thumbnail.webp"

/**
 * The real [RecordStateHolder] over [FakeRecordRepository] (fixtures of `shared/fixtures/record`) on an eager scope.
 * Screens are stateless: tests take [RecordHarness.holder]'s state (or its route) instead of hand-building a `RecordUiState`.
 * The holder gets its own [analytics] sink: in the app the navigation controller is the only `screen_view` sender (D-22).
 */
class RecordHarness(mode: HomeMode = HomeMode.Member, now: String? = null, setup: FakeRecordRepository.() -> Unit = {}) {
    private val holderScope = HolderScope()
    val clock = FakeClock().also { c -> now?.let { c.set(it) } }
    val repo = FakeRecordRepository().apply(setup)
    val changes = PostChanges()
    val analytics = RecordingAnalytics()
    val renderer = RecordingCalendarRenderer()
    val saver = RecordingCalendarSaver()
    val holder = RecordStateHolder(holderScope.scope, clock, repo, changes, analytics, mode, renderer, saver)

    val state: RecordUiState get() = holder.state.value

    /** First presentation (as the route does) and the resulting state. */
    fun shown(requestedDate: LocalDate? = null): RecordUiState {
        holder.onShown(requestedDate)
        return state
    }

    fun close() = holderScope.close()
}
