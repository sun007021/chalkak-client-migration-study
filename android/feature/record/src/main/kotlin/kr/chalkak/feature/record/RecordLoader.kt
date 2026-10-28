package kr.chalkak.feature.record

import kotlinx.coroutines.Job
import kr.chalkak.core.data.record.RecordPost
import kr.chalkak.core.data.record.RecordRepository
import kr.chalkak.core.network.ApiResult
import java.time.YearMonth

/**
 * Month list and calendar requests of the record holder. A request for the month that is already being asked is not sent
 * twice; a superseded answer (see [RecordCore.navigation] / [RecordCore.epoch]) is dropped.
 */
internal class RecordLoader(
    private val jobs: RecordJobs,
    private val core: RecordCore,
    private val repository: RecordRepository,
) {
    private var monthsJob: Job? = null
    private var calendarJob: Job? = null
    private var calendarMonth: YearMonth? = null

    /** REQ-REC-008: a failing month list is ignored; the current month is selectable anyway. */
    fun loadMonths() {
        if (monthsJob?.isActive == true) return
        val epoch = core.epoch
        monthsJob = jobs.launch {
            val result = guardedApiCall("months") { repository.months() }
            if (epoch == core.epoch && result is ApiResult.Success) core.setServerMonths(result.value)
        }
    }

    fun loadCalendar(month: YearMonth) {
        if (calendarJob?.isActive == true && calendarMonth == month) return
        calendarJob?.cancel()
        calendarMonth = month
        val navigation = core.navigation
        calendarJob = jobs.launch {
            val result = guardedApiCall("calendar") { repository.calendar(month) }
            if (navigation == core.navigation) apply(month, result)
        }
    }

    fun cancelAll() {
        monthsJob?.cancel()
        calendarJob?.cancel()
        monthsJob = null
        calendarJob = null
        calendarMonth = null
    }

    private fun apply(month: YearMonth, result: ApiResult<List<RecordPost>>) {
        when (result) {
            is ApiResult.Success -> core.commit(month, result.value)
            is ApiResult.Failure -> core.fail(month, result.error)
        }
    }
}
