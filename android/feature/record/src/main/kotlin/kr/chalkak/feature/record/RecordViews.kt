package kr.chalkak.feature.record

import kr.chalkak.core.data.record.RecordPost
import kr.chalkak.core.data.record.RecordPostStatus
import kr.chalkak.core.network.ApiError
import java.time.LocalDate
import java.time.YearMonth

/** Copy keys of `shared/copy/ko.json` used by the record holder. */
internal object RecordCopy {
    const val NETWORK = "common.error.network"
    const val GUEST = "record.guest"
    const val ERR_401 = "record.err.401"
    const val ERR_400 = "record.err.400"
    const val ERR_OTHER = "record.err.other"
    const val SAVE_OK = "record.save.ok"
    const val SAVE_FAIL = "record.save.fail"
    const val SAVE_DENIED = "record.save.denied"
    const val HINT_OPEN = "record.pending.hint-open"
    const val HINT_CLOSE = "record.pending.hint-close"
}

/** Grid cells of [month]: every date of the month with its post, blanks as `RecordCell(null, null)`. */
internal fun cellsOf(month: YearMonth, byDate: Map<LocalDate, RecordPost>): List<RecordCell> =
    monthGrid(month).cells.map { date -> RecordCell(date, date?.let(byDate::get)) }

/** The selected day's area; [hintOpen] only counts for a PENDING photo (REQ-REC-015/033). */
internal fun panelOf(post: RecordPost?, hintOpen: Boolean): RecordPanel? {
    post ?: return null
    val pending = post.status == RecordPostStatus.PENDING
    return RecordPanel(
        post = post,
        pendingBadge = pending,
        actionsVisible = post.status == RecordPostStatus.APPROVED,
        hintOpen = pending && hintOpen,
        hintLabelCopyKey = if (pending) (if (hintOpen) RecordCopy.HINT_CLOSE else RecordCopy.HINT_OPEN) else null,
    )
}

/** First-load failure screen by status only (D-02): 401 -> login, 400 -> unsupported month, anything else -> retry. */
internal fun ApiError.toRecordError(): RecordError = when ((this as? ApiError.Http)?.status) {
    401 -> RecordError(RecordCopy.ERR_401, RecordErrorAction.Login)
    400 -> RecordError(RecordCopy.ERR_400, RecordErrorAction.Retry)
    else -> RecordError(RecordCopy.ERR_OTHER, RecordErrorAction.Retry)
}

/** Toast for a failed revalidation that left cached content in place (D-20). */
internal fun ApiError.toRevalidationToastKey(): String = if (this is ApiError.Network) RecordCopy.NETWORK else RecordCopy.ERR_OTHER
