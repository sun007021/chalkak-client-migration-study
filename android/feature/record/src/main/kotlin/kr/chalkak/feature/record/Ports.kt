package kr.chalkak.feature.record

import java.time.YearMonth

/** Platform bitmap rendering of the month calendar as a PNG (adapter in :app; REQ-REC-037). */
fun interface CalendarImageRenderer {
    suspend fun render(month: YearMonth, cells: List<RecordCell>): ByteArray
}

enum class SaveOutcome { Saved, PermissionDenied, Failed }

/** MediaStore / photo library write (adapter in :app). [fileName] is `chalkak-calendar-yyyy-MM.png`. */
fun interface CalendarImageSaver {
    suspend fun save(fileName: String, png: ByteArray): SaveOutcome
}
