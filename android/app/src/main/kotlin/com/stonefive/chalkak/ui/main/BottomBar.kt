package com.stonefive.chalkak.ui.main

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.R
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kr.chalkak.feature.navigation.Tab

/**
 * Bottom bar (stateless, TC-NAV-001/002, testids.md "하단 탭바"): home, display, [upload button], record, settings, left to right.
 * Tabs expose `selected` (tab semantics) for exactly the tab equal to [selected]; the upload button is a plain button without
 * any selected state and without text (its content description is `nav.tab.upload.a11y`).
 * A tab tap is always reported, also for the selected one: re-selection is the navigation controller's business.
 */
@Composable
fun BottomBar(
    selected: Tab?,
    onTabClick: (Tab) -> Unit,
    onUploadClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(ChalkakTheme.colors.inputBackground)
            .navigationBarsPadding()
            .selectableGroup()
            .padding(top = 10.dp, bottom = 8.dp)
            .testTag("bottom-bar.root"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TabItem(Tab.Home, selected, onTabClick)
        TabItem(Tab.Display, selected, onTabClick)
        UploadButton(onUploadClick)
        TabItem(Tab.Record, selected, onTabClick)
        TabItem(Tab.Settings, selected, onTabClick)
    }
}

private fun iconOf(tab: Tab, selected: Boolean): Int = when (tab) {
    Tab.Home -> if (selected) R.drawable.ic_bottom_home_selected else R.drawable.ic_bottom_home
    Tab.Display -> if (selected) R.drawable.ic_bottom_display_selected else R.drawable.ic_bottom_display
    Tab.Record -> if (selected) R.drawable.ic_bottom_record_selected else R.drawable.ic_bottom_record
    Tab.Settings -> if (selected) R.drawable.ic_bottom_setting_selected else R.drawable.ic_bottom_setting
}

@Composable
private fun RowScope.TabItem(tab: Tab, selectedTab: Tab?, onTabClick: (Tab) -> Unit) {
    val copy = LocalCopy.current
    val isSelected = tab == selectedTab
    val color = if (isSelected) ChalkakTheme.colors.actionPrimary else ChalkakTheme.colors.bottomBar
    Column(
        modifier = Modifier
            .weight(1f)
            .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
            .selectable(selected = isSelected, interactionSource = null, indication = null, role = Role.Tab) { onTabClick(tab) }
            .testTag("bottom-bar.tab-${tab.analyticsName}"),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(painter = painterResource(iconOf(tab, isSelected)), contentDescription = null, tint = color, modifier = Modifier.size(23.dp))
        Spacer(Modifier.height(6.dp))
        Text(
            text = copy[tab.labelCopyKey],
            color = color,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
        )
    }
}

@Composable
private fun RowScope.UploadButton(onClick: () -> Unit) {
    val copy = LocalCopy.current
    val description = copy["nav.tab.upload.a11y"]
    Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
        Image(
            painter = painterResource(R.drawable.ic_bottom_write),
            contentDescription = null,
            modifier = Modifier
                .size(40.dp)
                .semantics { contentDescription = description }
                .clickable(interactionSource = null, indication = null, role = Role.Button, onClick = onClick)
                .testTag("bottom-bar.upload-button"),
        )
    }
}
