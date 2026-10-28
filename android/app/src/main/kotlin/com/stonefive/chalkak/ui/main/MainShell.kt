package com.stonefive.chalkak.ui.main

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kr.chalkak.feature.navigation.NavState
import kr.chalkak.feature.navigation.Route

/**
 * Stateless main shell. STUB (TDD step 1): renders nothing yet.
 *
 * Required behaviour (TC-NAV-012, REQ-NAV-023/024): shows `content(navState.top)` and, only when `navState.bottomBarVisible`,
 * a [BottomBar] (`selected = navState.selectedTab`) below it. On stacked routes (feed, notifications, banner web, upload, ...)
 * the bottom bar is NOT in the tree (absent, not hidden).
 */
@Composable
fun MainShell(
    navState: NavState,
    onTabClick: (kr.chalkak.feature.navigation.Tab) -> Unit,
    onUploadClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable (Route) -> Unit,
) {
}
