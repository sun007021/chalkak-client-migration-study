package kr.chalkak.feature.upload

/**
 * Which `docs/testing/catalog/upload-edit.md` ids have JVM tests (feature/upload and core/data `upload` packages) and which
 * are deferred. Names of tests carry the TC id, so `grep -r "TC-UPL-0xx"` finds the test.
 */
object CoverageMap {
    private fun ids(prefix: String, vararg n: Int): Set<String> = n.map { "TC-$prefix-%03d".format(it) }.toSet()

    val coveredUpload: Set<String> = ids(
        "UPL",
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
        23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 37, 38, 39, 42, 44, 45, 46, 47,
        48, 49, 50, 51, 52, 53, 54, 55, 56, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75,
        77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88,
    )

    val coveredEdit: Set<String> = ids(
        "EDIT",
        1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
        23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 45,
    )

    /** Deferred id (without the `TC-` prefix, so the coverage script does not count it) to the reason it has no JVM test here (Android UI / real encoder / golden images / device). */
    val deferred: Map<String, String> = mapOf(
        "UPL-022" to "Compose/permission UI of the picker sheet: Android instrumented test",
        "UPL-036" to "Real photo decode of EXIF orientation: needs shared/fixtures/images (not generated yet) and an Android decoder",
        "UPL-040" to "Real WebP encoder output of a large photo: Android instrumented test (JVM tests use FakeCompressor)",
        "UPL-041" to "Real WebP encoder output size on the ladder: Android instrumented test",
        "UPL-043" to "Real encoder metadata stripping on a device; the RIFF inspector itself is tested in WebpInspectorTest",
        "UPL-057" to "Android Compose/process death behaviour of an in-flight PUT",
        "UPL-076" to "Real clock-driven UI re-entry after a 401 during create; the repository/holder parts are in UPL-066 and 078",
        "UPL-089" to "Compose UI / accessibility semantics",
        "UPL-090" to "Compose UI / accessibility semantics",
        "UPL-091" to "Android lifecycle (process death) instrumented test",
        "UPL-092" to "Android lifecycle (process death) instrumented test",
        "EDIT-002" to "Compose editor layout/gestures: Android UI test",
        "EDIT-007" to "Compose editor layout/gestures: Android UI test",
        "EDIT-022" to "Compose preview rendering parity: Android UI/golden test",
        "EDIT-044" to "Real bitmap golden comparison (shared/fixtures/images/golden/filters.json not generated yet)",
        "EDIT-046" to "Real bitmap golden comparison: Android instrumented test",
        "EDIT-047" to "Real bitmap golden comparison: Android instrumented test",
        "EDIT-048" to "Real bitmap golden comparison: Android instrumented test",
        "EDIT-049" to "Gesture/haptics on a device",
        "EDIT-050" to "Compose accessibility semantics",
        "EDIT-051" to "Compose accessibility semantics",
    )
}
