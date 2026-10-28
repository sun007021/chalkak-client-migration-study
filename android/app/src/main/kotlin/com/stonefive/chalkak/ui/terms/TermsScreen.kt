package com.stonefive.chalkak.ui.terms

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
    Column(modifier = modifier.fillMaxSize().background(colors.inputBackground).testTag("terms.root")) {
        BackAction(onClick = onBackClick, modifier = Modifier.statusBarsPadding().padding(start = 8.dp, top = 4.dp).testTag("terms.back-button"))
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp)) {
            Spacer(Modifier.height(30.dp))
            Text(
                text = copy["onb.terms.title"],
                color = colors.textPrimary,
                style = MaterialTheme.typography.headlineLarge,
                modifier = Modifier.testTag("terms.title"),
            )
            Spacer(Modifier.height(48.dp))
            ConsentRow(
                label = copy["onb.terms.agree-all"],
                checked = state.agreeAll,
                onToggle = onAgreeAllClick,
                checkboxTag = "terms.agree-all-checkbox",
            )
            HorizontalDivider(color = colors.border)
            ConsentRow(
                label = copy["onb.terms.service"],
                checked = state.agreeService,
                onToggle = onServiceClick,
                checkboxTag = "terms.service-checkbox",
                viewText = copy["onb.terms.view"],
                onView = onServiceViewClick,
                viewTag = "terms.service-view-button",
            )
            HorizontalDivider(color = colors.border)
            ConsentRow(
                label = copy["onb.terms.privacy"],
                checked = state.agreePrivacy,
                onToggle = onPrivacyClick,
                checkboxTag = "terms.privacy-checkbox",
                viewText = copy["onb.terms.view"],
                onView = onPrivacyViewClick,
                viewTag = "terms.privacy-view-button",
            )
            HorizontalDivider(color = colors.border)
        }
        Spacer(Modifier.weight(1f))
        ChalkakButton(
            text = copy["onb.terms.next"],
            onClick = onNextClick,
            enabled = state.nextEnabled,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .navigationBarsPadding()
                .padding(bottom = 20.dp)
                .testTag("terms.next-button"),
        )
    }
}

@Composable
private fun ConsentRow(
    label: String,
    checked: Boolean,
    onToggle: () -> Unit,
    checkboxTag: String,
    viewText: String? = null,
    onView: (() -> Unit)? = null,
    viewTag: String? = null,
) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .weight(1f)
                .toggleable(value = checked, role = Role.Checkbox, onValueChange = { onToggle() })
                .padding(vertical = 16.dp)
                .testTag(checkboxTag),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Image(
                painter = painterResource(if (checked) R.drawable.ic_checkbox_selected else R.drawable.ic_checkbox_unselected),
                contentDescription = null,
                modifier = Modifier.size(22.dp),
            )
            Text(text = label, color = ChalkakTheme.colors.textPrimary, style = MaterialTheme.typography.bodyLarge)
        }
        if (viewText != null && onView != null && viewTag != null) {
            TextButton(onClick = onView, modifier = Modifier.testTag(viewTag)) {
                Text(text = viewText, color = ChalkakTheme.colors.textInactive, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

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
            Box(Modifier.fillMaxSize().navigationBarsPadding().padding(bottom = 96.dp), contentAlignment = Alignment.BottomCenter) {
                Text(
                    text = copy[copyKey],
                    color = ChalkakTheme.colors.onToast,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier
                        .background(ChalkakTheme.colors.toastBackground, androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
                        .padding(horizontal = 16.dp, vertical = 12.dp)
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
