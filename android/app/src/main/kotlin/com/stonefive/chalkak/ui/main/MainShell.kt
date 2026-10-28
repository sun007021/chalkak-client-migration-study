package com.stonefive.chalkak.ui.main

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kr.chalkak.feature.navigation.NavState
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.navigation.Tab

/**
 * Stateless main shell (TC-NAV-012, REQ-NAV-023/024): shows `content(navState.top)` and, only when `navState.bottomBarVisible`,
 * a [BottomBar] (`selected = navState.selectedTab`) below it. On stacked routes the bar is not in the tree at all.
 */
@Composable
fun MainShell(
    navState: NavState,
    onTabClick: (Tab) -> Unit,
    onUploadClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable (Route) -> Unit,
) {
    Column(modifier = modifier.fillMaxSize()) {
        Box(modifier = Modifier.weight(1f)) { content(navState.top) }
        if (navState.bottomBarVisible) {
            BottomBar(selected = navState.selectedTab, onTabClick = onTabClick, onUploadClick = onUploadClick)
        }
    }
}
