package kr.chalkak.feature.record

import kr.chalkak.core.common.WeekCalendar
import kr.chalkak.core.data.record.RecordPost
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.display.FeedEntry
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit

/**
 * Sunday-start month grid (REQ-REC-009/010): [cells] is a multiple of 7 long, `null` = blank cell before the 1st or after
 * the last day (neighbour-month days are NOT filled in).
 */
data class MonthGrid(val month: YearMonth, val cells: List<LocalDate?>) {
    val rows: Int get() = cells.size / 7

    /** Blank cells before the 1st (0 = the 1st is a Sunday). */
    val leadingBlanks: Int get() = cells.indexOfFirst { it != null }

    val lastDay: LocalDate? get() = cells.lastOrNull { it != null }
}

/** The Sunday-start grid of [month]; the offset of the 1st comes from [WeekCalendar] so no weekday math is duplicated. */
fun monthGrid(month: YearMonth): MonthGrid {
    val first = month.atDay(1)
    val leading = ChronoUnit.DAYS.between(WeekCalendar.weekOf(first).start, first).toInt()
    val days = (1..month.lengthOfMonth()).map(month::atDay)
    val trailing = (WEEK_LENGTH - (leading + days.size) % WEEK_LENGTH) % WEEK_LENGTH
    return MonthGrid(month, List(leading) { null } + days + List(trailing) { null })
}

private const val WEEK_LENGTH = 7

/** One grid cell. [date] null = blank filler; [post] null = a date without a record (only the day number is drawn). */
data class RecordCell(val date: LocalDate?, val post: RecordPost?)

enum class RecordPhase {
    /** No cached answer for the shown month and a request is running (previous month content is cleared). */
    Loading,
    Content,
    Error,
}

enum class RecordErrorAction { Retry, Login }

/** First-load failure screen (REQ-REC-024): [titleCopyKey] is `record.err.401` / `record.err.400` / `record.err.other`. */
data class RecordError(val titleCopyKey: String, val action: RecordErrorAction)

/**
 * The selected day's area. [pendingBadge]: PENDING shows "사진 반영 중" (REQ-REC-015); [actionsVisible]: only APPROVED shows
 * "피드에서 보기" / "전시 보러가기" (REQ-REC-033). [hintOpen] is the badge tooltip; [hintLabelCopyKey] is `record.pending.hint-open`
 * while it is closed and `record.pending.hint-close` while it is open (null without a badge).
 */
data class RecordPanel(
    val post: RecordPost,
    val pendingBadge: Boolean,
    val actionsVisible: Boolean,
    val hintOpen: Boolean,
    val hintLabelCopyKey: String?,
)

data class RecordUiState(
    val mode: HomeMode,
    /** KST current month, recomputed on every entry / foreground (D-19). */
    val currentMonth: YearMonth,
    /** Server months + [currentMonth], newest first, no duplicates (REQ-REC-002). */
    val availableMonths: List<YearMonth>,
    /** The month being shown. */
    val month: YearMonth,
    val phase: RecordPhase,
    /** Cached content is shown while the server is asked again (REQ-REC-022). */
    val revalidating: Boolean,
    /** [MonthGrid] cells of [month] with their posts; empty while there is no content to show. */
    val cells: List<RecordCell>,
    val selectedDate: LocalDate?,
    val panel: RecordPanel?,
    val error: RecordError?,
    val saving: Boolean,
) {
    /** Previous arrow usable: [month] is not the oldest of [availableMonths] (REQ-REC-005). */
    val canGoPrevious: Boolean get() = availableMonths.lastOrNull()?.let { month > it } == true

    /** Next arrow usable: [month] is not the newest of [availableMonths]. */
    val canGoNext: Boolean get() = availableMonths.firstOrNull()?.let { month < it } == true
}

sealed interface RecordEffect {
    /** Unique [id] per occurrence so the same text twice in a row re-triggers the UI (D-20). */
    data class ShowToast(val id: Long, val copyKey: String) : RecordEffect

    /** "피드에서 보기": open the detail as my post with the thumbnail seed (REQ-REC-034). */
    data class OpenFeed(val entry: FeedEntry.FromRecord) : RecordEffect

    /** "전시 보러가기": open the exhibition at [topicDate]; back returns to the record screen (REQ-REC-035). */
    data class OpenDisplay(val topicDate: LocalDate) : RecordEffect

    /** "로그인 하기" on the 401 error screen. */
    data object LoginRequired : RecordEffect
}
