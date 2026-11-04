package com.stonefive.chalkak.ui.terms

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import com.stonefive.chalkak.ui.components.ChalkakCheckbox
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.R
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.components.BackAction
import com.stonefive.chalkak.ui.components.ChalkakButton
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kotlinx.coroutines.delay
import kr.chalkak.core.common.AppConstants
import kr.chalkak.feature.onboarding.DocumentOpenResult
import kr.chalkak.feature.onboarding.LegalDocumentOpener
import kr.chalkak.feature.onboarding.TermsEffect
import kr.chalkak.feature.onboarding.TermsKind
import kr.chalkak.feature.onboarding.TermsStateHolder
import kr.chalkak.feature.onboarding.TermsUiState

/**
 * Stateless terms screen: `terms.root`, `.title`, `.agree-all-checkbox`, `.service-checkbox`, `.privacy-checkbox` (each exposes checked
 * as a toggleable state and carries its label text in its merged semantics), `.service-view-button`, `.privacy-view-button`,
 * `.next-button` (enabled = [TermsUiState.nextEnabled]), `.back-button`.
 */
@Composable
fun TermsScreen(
    state: TermsUiState,
    onAgreeAllClick: () -> Unit,
    onServiceClick: () -> Unit,
    onPrivacyClick: () -> Unit,
    onServiceViewClick: () -> Unit,
    onPrivacyViewClick: () -> Unit,
    onNextClick: () -> Unit,
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    val spacing = ChalkakTheme.spacing
    Column(modifier = modifier.fillMaxSize().background(colors.inputBackground).testTag("terms.root")) {
        BackAction(onClick = onBackClick, modifier = Modifier.statusBarsPadding().padding(start = 8.dp, top = 4.dp).testTag("terms.back-button"))
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = spacing.screenHorizontal)) {
            Spacer(Modifier.height(30.dp))
            Text(
                text = copy["onb.terms.title"],
                color = colors.textPrimary,
                style = ChalkakTheme.typography.title1,
                modifier = Modifier.testTag("terms.title"),
            )
            Spacer(Modifier.height(57.dp))
            AllConsentRow(
                label = copy["onb.terms.agree-all"],
                checked = state.agreeAll,
                onToggle = onAgreeAllClick,
                checkboxTag = "terms.agree-all-checkbox",
            )
            Spacer(Modifier.height(3.dp))
            RequiredConsentRow(
                label = copy["onb.terms.service"],
                checked = state.agreeService,
                onToggle = onServiceClick,
                checkboxTag = "terms.service-checkbox",
                viewText = copy["onb.terms.view"],
                onView = onServiceViewClick,
                viewTag = "terms.service-view-button",
            )
            HorizontalDivider(thickness = 1.dp, color = colors.border)
            RequiredConsentRow(
                label = copy["onb.terms.privacy"],
                checked = state.agreePrivacy,
                onToggle = onPrivacyClick,
                checkboxTag = "terms.privacy-checkbox",
                viewText = copy["onb.terms.view"],
                onView = onPrivacyViewClick,
                viewTag = "terms.privacy-view-button",
            )
            HorizontalDivider(thickness = 1.dp, color = colors.border)
        }
        Spacer(Modifier.weight(1f))
        ChalkakButton(
            text = copy["onb.terms.next"],
            onClick = onNextClick,
            enabled = state.nextEnabled,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = spacing.screenHorizontal)
                .navigationBarsPadding()
                .padding(bottom = 20.dp)
                .testTag("terms.next-button"),
        )
    }
}

/** "전체 동의" card (screens-a 5.1): checkbox 22 + body, padding 16 / 19, 1dp #E3E1DD outline, `shapes.large`. */
@Composable
private fun AllConsentRow(label: String, checked: Boolean, onToggle: () -> Unit, checkboxTag: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(ChalkakTheme.shapes.large)
            .background(ChalkakTheme.colors.inputBackground)
            .border(1.dp, TermsCardBorder, ChalkakTheme.shapes.large)
            .toggleable(value = checked, interactionSource = null, indication = null, role = Role.Checkbox, onValueChange = { onToggle() })
            .padding(horizontal = 16.dp, vertical = 19.dp)
            .testTag(checkboxTag),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        ChalkakCheckbox(checked)
        Text(text = label, color = ChalkakTheme.colors.textPrimary, style = ChalkakTheme.typography.body)
    }
}

/** Required-consent row: checkbox + 85% title (start 4, 16 vertical, 14 apart) and a muted "보기" link at the end. */
@Composable
private fun RequiredConsentRow(
    label: String,
    checked: Boolean,
    onToggle: () -> Unit,
    checkboxTag: String,
    viewText: String,
    onView: () -> Unit,
    viewTag: String,
) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .weight(1f)
                .toggleable(value = checked, interactionSource = null, indication = null, role = Role.Checkbox, onValueChange = { onToggle() })
                .padding(start = 4.dp, top = 16.dp, bottom = 16.dp)
                .testTag(checkboxTag),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            ChalkakCheckbox(checked)
            Text(text = label, color = ChalkakTheme.colors.textPrimary.copy(alpha = 0.85f), style = ChalkakTheme.typography.body)
        }
        Text(
            text = viewText,
            color = ChalkakTheme.colors.textMuted,
            style = ChalkakTheme.typography.callout,
            modifier = Modifier
                .clickable(role = Role.Button, onClick = onView)
                .padding(start = 12.dp, top = 16.dp, end = 4.dp, bottom = 16.dp)
                .testTag(viewTag),
        )
    }
}

/** Outline of the "전체 동의" card (`OnboardingTermsScreen.swift`, #E3E1DD). */
private val TermsCardBorder = androidx.compose.ui.graphics.Color(0xFFE3E1DD)

private class DocumentSheet(val kind: TermsKind, val url: String)

/**
 * Wraps [TermsStateHolder]: renders [TermsScreen]; `OpenDocument` effects go through [opener]; an in-app result shows [LegalDocSheet]
 * (with [legalWeb] in its web slot; it reports load results through the two callbacks) over the screen without touching the checkboxes;
 * closing the sheet returns to the terms screen. `GoSignature` / `BackToLogin` effects call the callbacks. [legalWeb] is composed
 * afresh for every load attempt (`key(attempt)`), so "다시 시도" reloads the document.
 */
@Composable
fun TermsRoute(
    holder: TermsStateHolder,
    opener: LegalDocumentOpener,
    onGoSignature: () -> Unit,
    onBackToLogin: () -> Unit,
    modifier: Modifier = Modifier,
    legalWeb: @Composable (url: String, onLoaded: () -> Unit, onFailed: () -> Unit) -> Unit = { _, _, _ -> },
) {
    val copy = LocalCopy.current
    val state by holder.state.collectAsState()
    val goSignature by rememberUpdatedState(onGoSignature)
    val backToLogin by rememberUpdatedState(onBackToLogin)
    var sheet by remember { mutableStateOf<DocumentSheet?>(null) }
    var load by remember { mutableStateOf(LegalDocLoad.Loading) }
    var attempt by remember { mutableIntStateOf(0) }
    var openFailed by remember { mutableStateOf<Pair<Int, String>?>(null) }

    LaunchedEffect(holder) {
        holder.effects.collect { effect ->
            when (effect) {
                TermsEffect.GoSignature -> goSignature()
                TermsEffect.BackToLogin -> backToLogin()
                is TermsEffect.OpenDocument -> when (val result = opener.open(effect.url)) {
                    is DocumentOpenResult.InApp -> {
                        sheet = DocumentSheet(effect.kind, result.url)
                        load = LegalDocLoad.Loading
                        attempt++
                        holder.onDocumentShown(effect.kind)
                    }
                    DocumentOpenResult.OpenedExternally -> Unit
                    is DocumentOpenResult.CannotOpen -> openFailed = (openFailed?.first ?: 0) + 1 to result.copyKey
                }
            }
        }
    }
    openFailed?.let { (id, _) ->
        LaunchedEffect(id) {
            delay(AppConstants.TOAST_DURATION_MS)
            openFailed = null
        }
    }
    BackHandler(enabled = sheet == null) { holder.onBack() }

    Box(modifier = modifier.fillMaxSize()) {
        TermsScreen(
            state = state,
            onAgreeAllClick = holder::onAgreeAllToggled,
            onServiceClick = holder::onServiceToggled,
            onPrivacyClick = holder::onPrivacyToggled,
            onServiceViewClick = { holder.onViewClicked(TermsKind.Service) },
            onPrivacyViewClick = { holder.onViewClicked(TermsKind.Privacy) },
            onNextClick = holder::onNextClicked,
            onBackClick = holder::onBack,
        )
        openFailed?.let { (_, copyKey) ->
            Box(Modifier.fillMaxSize().navigationBarsPadding().padding(horizontal = ChalkakTheme.spacing.screenHorizontal).padding(bottom = 32.dp), contentAlignment = Alignment.BottomCenter) {
                Text(
                    text = copy[copyKey],
                    color = ChalkakTheme.colors.onActionPrimary,
                    style = ChalkakTheme.typography.subheadline,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier
                        .background(ChalkakTheme.colors.actionPrimary, ChalkakTheme.shapes.pill)
                        .padding(horizontal = ChalkakTheme.spacing.lg, vertical = ChalkakTheme.spacing.md)
                        .testTag("legal-doc.open-failed-message"),
                )
            }
        }
        sheet?.let { current ->
            LegalDocSheet(
                title = copy[
                    when (current.kind) {
                        TermsKind.Service -> "onb.terms.doc.title.service"
                        TermsKind.Privacy -> "onb.terms.doc.title.privacy"
                    },
                ],
                load = load,
                onClose = { sheet = null },
                onRetry = {
                    load = LegalDocLoad.Loading
                    attempt++
                },
            ) {
                key(attempt) {
                    legalWeb(current.url, { load = LegalDocLoad.Loaded }, { load = LegalDocLoad.Failed })
                }
            }
        }
    }
}
