package com.stonefive.chalkak.ui.main

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kr.chalkak.feature.navigation.Tab

/**
 * Bottom bar (stateless). STUB (TDD step 1): renders nothing yet.
 *
 * Required behaviour (TC-NAV-001/002, testids.md "하단 탭바"):
 * - root `bottom-bar.root`; children left to right: `bottom-bar.tab-home`, `bottom-bar.tab-display`, `bottom-bar.upload-button`,
 *   `bottom-bar.tab-record`, `bottom-bar.tab-settings`.
 * - tab text = `nav.tab.home|display|record|settings`; the upload button has no text, its content description = `nav.tab.upload.a11y`.
 * - tabs expose `selected` (selectable semantics, `Role.Tab`): exactly the tab equal to [selected] is selected; [selected] null selects none.
 *   The upload button is a plain button: it has NO `Selected` semantics at all.
 * - tab tap -> [onTabClick] (also for the selected tab: re-selection is the controller's business); upload tap -> [onUploadClick].
 */
@Composable
fun BottomBar(
    selected: Tab?,
    onTabClick: (Tab) -> Unit,
    onUploadClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
}
