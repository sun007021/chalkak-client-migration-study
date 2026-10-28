package kr.chalkak.feature.navigation

/**
 * Which `docs/testing/catalog/navigation.md` (NAV) and ANL ids of `docs/testing/catalog/common-infra.md` have JVM tests and which are
 * deferred. Tests carry the TC id in their names, so `grep -r "TC-NAV-012"` finds the test.
 *
 * Files: feature/navigation  GuestAndRouteTest, TabsAndStackTest, AnalyticsFlowTest, ToastAndUrlTest;
 *        core/common  analytics/AnalyticsTest (event model, logging/safe tracker, selection, ScreenViewReporter).
 * Per-screen `screen_view` call sites stay with the owning tracks (auth, display, notification ... also name TC-ANL ids); here the
 * route -> name map and the controller-driven sequences are covered.
 */
internal object CoverageMap {
    private fun ids(prefix: String, vararg n: Int): Set<String> = n.map { "TC-$prefix-%03d".format(it) }.toSet()

    val coveredNav: Set<String> = ids(
        "NAV",
        1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28,
        30, 31, 32, 33, 34, 36, 37, 38, 39, 40, 41, 42, 43, 45, 49, 50,
    )

    val coveredAnl: Set<String> = ids(
        "ANL",
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24,
    )

    /** Deferred id (without the `TC-` prefix, so the coverage script does not count it) to the reason it has no JVM test here. */
    val deferred: Map<String, String> = mapOf(
        "NAV-002" to "Selected/unselected icon assets and the selected a11y state: Compose UI test in :app (W)",
        "NAV-013" to "Screenshot of content vs bottom bar overlap (S): device",
        "NAV-014" to "Guest home loads without authenticated APIs: owned by the HOME track (HomeStateHolder), not the navigation layer",
        "NAV-015" to "Guest display list without Authorization header and isLiked=false: owned by DISP / core:data",
        "NAV-021" to "Guest settings screen rendering (login button only): Compose UI test in :app (W); the settings holder is SET-owned",
        "NAV-029" to "Toast position relative to the screen with/without bottom bar: screenshot (S), device",
        "NAV-035" to "Home ranking header link opens the display on that date: HOME/DISP wiring, Maestro E2E",
        "NAV-044" to "Web only (browser back, route structure undecided)",
        "NAV-046" to "Resume re-fetch of unread status and home data keeps screen and scroll: Maestro E2E, holders are NOTI/HOME-owned",
        "NAV-047" to "Closing the feedback full screen (button / swipe / back): Maestro E2E",
        "NAV-048" to "Drag gesture over the feedback input keeps the text: Maestro E2E (gesture on a device)",
        "ANL-019" to "Auto screen reporting switch lives in the :app manifest / Firebase init config: inspected in the app module (no SDK on JVM)",
        "ANL-025" to "Web SPA route change events: Web only",
    )
}
