package com.stonefive.chalkak.ui.signature

import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.components.BackAction
import com.stonefive.chalkak.ui.components.ChalkakAlert
import com.stonefive.chalkak.ui.components.ChalkakButton
import com.stonefive.chalkak.ui.components.ChalkakOutlinedButton
import com.stonefive.chalkak.ui.components.Loading
import com.stonefive.chalkak.ui.components.ScreenGoneEffect
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kr.chalkak.feature.onboarding.CanvasSize
import kr.chalkak.feature.onboarding.FlowError
import kr.chalkak.feature.onboarding.SignatureChangeEffect
import kr.chalkak.feature.onboarding.SignatureChangeStateHolder
import kr.chalkak.feature.onboarding.SignatureMode
import kr.chalkak.feature.onboarding.SignaturePadUiState
import kr.chalkak.feature.onboarding.SignatureStroke
import kr.chalkak.feature.onboarding.SignupEffect
import kr.chalkak.feature.onboarding.SignupStateHolder

/**
 * The pad reports points in this fixed square space, whatever its pixel size, so the pad holder (built before any layout) can be
 * given a constant [CanvasSize]. The screen scales pointer positions into it and strokes back out of it when drawing.
 */
val SignaturePadSpace = CanvasSize(1000f, 1000f)

private val SignatureStrokeWidth = 4.dp
private val SignatureDotRadius = 2.dp

/**
 * Stateless drawing screen (signup and change): `signature.root` (mode exposed as state description), `.title`, `.guide-text`,
 * `.canvas`, `.canvas-hint` (only while there is no stroke), `.undo-button` (enabled = canUndo), `.clear-button` (enabled = canClear),
 * `.submit-button` (enabled = canConfirm), `.back-button`, `.error-message` (only while [SignaturePadUiState.errorCopyKey] != null).
 */
@Composable
fun SignatureScreen(
    mode: SignatureMode,
    state: SignaturePadUiState,
    onUndo: () -> Unit,
    onClear: () -> Unit,
    onConfirm: () -> Unit,
    onBack: () -> Unit,
    onBeginStroke: (x: Float, y: Float) -> Unit,
    onExtendStroke: (x: Float, y: Float) -> Unit,
    onEndStroke: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background)
            .semantics { stateDescription = if (mode == SignatureMode.Signup) "onboarding" else "change" }
            .testTag("signature.root"),
    ) {
        BackAction(onClick = onBack, modifier = Modifier.statusBarsPadding().padding(start = 8.dp, top = 4.dp).testTag("signature.back-button"))
        Column(modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 24.dp)) {
            Spacer(Modifier.height(8.dp))
            Text(
                text = copy["onb.sign.title"],
                color = colors.textPrimary,
                style = MaterialTheme.typography.headlineLarge,
                modifier = Modifier.testTag("signature.title"),
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = copy["onb.sign.guide"],
                color = colors.textNeutral,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.testTag("signature.guide-text"),
            )
            // The pad is the flexible part: a square as large as the space between the guide and the buttons allows, so the
            // buttons below stay on screen on short displays.
            BoxWithConstraints(modifier = Modifier.weight(1f).fillMaxWidth().padding(vertical = 12.dp), contentAlignment = Alignment.Center) {
                SignatureCanvas(
                    side = minOf(maxWidth, maxHeight),
                    strokes = state.strokes,
                    hint = copy["onb.sign.pad-hint"],
                    onBeginStroke = onBeginStroke,
                    onExtendStroke = onExtendStroke,
                    onEndStroke = onEndStroke,
                )
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally)) {
                ChalkakOutlinedButton(
                    text = copy["onb.sign.undo"],
                    onClick = onUndo,
                    enabled = state.canUndo,
                    modifier = Modifier.testTag("signature.undo-button"),
                )
                ChalkakOutlinedButton(
                    text = copy["onb.sign.clear"],
                    onClick = onClear,
                    enabled = state.canClear,
                    modifier = Modifier.testTag("signature.clear-button"),
                )
            }
            state.errorCopyKey?.let { key ->
                Text(
                    text = copy[key],
                    color = colors.destructive,
                    style = MaterialTheme.typography.labelMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp).testTag("signature.error-message"),
                )
            }
            Spacer(Modifier.height(12.dp))
            ChalkakButton(
                text = copy["onb.sign.confirm"],
                onClick = onConfirm,
                enabled = state.canConfirm,
                modifier = Modifier.fillMaxWidth().testTag("signature.submit-button"),
            )
            Spacer(Modifier.navigationBarsPadding().height(18.dp))
        }
    }
}

@Composable
private fun SignatureCanvas(
    side: Dp,
    strokes: List<SignatureStroke>,
    hint: String,
    onBeginStroke: (Float, Float) -> Unit,
    onExtendStroke: (Float, Float) -> Unit,
    onEndStroke: () -> Unit,
) {
    val colors = ChalkakTheme.colors
    val begin by rememberUpdatedState(onBeginStroke)
    val extend by rememberUpdatedState(onExtendStroke)
    val end by rememberUpdatedState(onEndStroke)
    val space = SignaturePadSpace
    Box(
        modifier = Modifier
            .size(side)
            .clip(RoundedCornerShape(16.dp))
            .background(colors.actionPrimary)
            .testTag("signature.canvas")
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    fun toSpace(position: Offset) = Offset(
                        position.x / size.width.coerceAtLeast(1) * space.width,
                        position.y / size.height.coerceAtLeast(1) * space.height,
                    )
                    toSpace(down.position).let { begin(it.x, it.y) }
                    try {
                        do {
                            val event = awaitPointerEvent()
                            val change = event.changes.firstOrNull { it.id == down.id }
                            if (change != null && change.positionChanged()) {
                                change.consume()
                                toSpace(change.position).let { extend(it.x, it.y) }
                            }
                        } while (change?.pressed == true)
                    } finally {
                        end()
                    }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val scaleX = size.width / space.width
            val scaleY = size.height / space.height
            strokes.filter { it.points.isNotEmpty() }.forEach { stroke ->
                val points = stroke.points.map { Offset(it.x * scaleX, it.y * scaleY) }
                if (points.size == 1) {
                    drawCircle(color = Color.White, radius = SignatureDotRadius.toPx(), center = points.first())
                } else {
                    drawPath(
                        path = smoothPath(points),
                        color = Color.White,
                        style = Stroke(width = SignatureStrokeWidth.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round),
                    )
                }
            }
        }
        if (strokes.none { it.points.isNotEmpty() }) {
            Text(
                text = hint,
                color = Color.White.copy(alpha = 0.56f),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.testTag("signature.canvas-hint"),
            )
        }
    }
}

/** Quadratic curves through the midpoints, each point being the control point (same smoothing as the PNG encoder). */
private fun smoothPath(points: List<Offset>): Path = Path().apply {
    moveTo(points.first().x, points.first().y)
    for (i in 1 until points.lastIndex) {
        quadraticTo(points[i].x, points[i].y, (points[i].x + points[i + 1].x) / 2f, (points[i].y + points[i + 1].y) / 2f)
    }
    lineTo(points.last().x, points.last().y)
}

/**
 * Stateless preview screen: `signature-preview.root`, `.title`, `.image` (the [png] bytes), `.redraw-button`, `.confirm-button`
 * (signup "시작하기" / change "사인 변경하기"; disabled while [busy]), `.change-notice` (change mode only), `.loading` (only while [busy]),
 * `.error-dialog` + `.error-dialog-confirm-button` (only while [error] != null).
 */
@Composable
fun SignaturePreviewScreen(
    mode: SignatureMode,
    png: ByteArray,
    busy: Boolean,
    error: FlowError?,
    onErrorConfirm: () -> Unit,
    onRedraw: () -> Unit,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    val bitmap = remember(png) { BitmapFactory.decodeByteArray(png, 0, png.size)?.asImageBitmap() }
    val change = mode == SignatureMode.Change
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background)
            .semantics { stateDescription = if (change) "change" else "onboarding" }
            .testTag("signature-preview.root"),
    ) {
        Column(modifier = Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 24.dp)) {
            Spacer(Modifier.height(50.dp))
            Text(
                text = copy["onb.sign.preview.title"],
                color = colors.textPrimary,
                style = MaterialTheme.typography.headlineLarge,
                modifier = Modifier.testTag("signature-preview.title"),
            )
            if (change) {
                Text(
                    text = copy["sign.change.notice"],
                    color = colors.textInactive,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("signature-preview.change-notice"),
                )
            }
            Spacer(Modifier.height(40.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1.4f)
                    .clip(RoundedCornerShape(20.dp))
                    .background(colors.actionPrimary)
                    .testTag("signature-preview.image"),
                contentAlignment = Alignment.Center,
            ) {
                bitmap?.let {
                    Image(bitmap = it, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize().padding(16.dp))
                }
            }
            if (busy) {
                Box(Modifier.fillMaxWidth().padding(top = 24.dp), contentAlignment = Alignment.Center) {
                    Loading(Modifier.testTag("signature-preview.loading"))
                }
            }
            Spacer(Modifier.weight(1f))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                ChalkakOutlinedButton(
                    text = copy["onb.sign.preview.redraw"],
                    onClick = onRedraw,
                    enabled = !busy,
                    modifier = Modifier.weight(1f).testTag("signature-preview.redraw-button"),
                )
                ChalkakButton(
                    text = copy[if (change) "sign.change.confirm" else "onb.sign.preview.start"],
                    onClick = onConfirm,
                    enabled = !busy,
                    modifier = Modifier.weight(1f).testTag("signature-preview.confirm-button"),
                )
            }
            Spacer(Modifier.height(18.dp))
        }
        error?.let {
            val fallback = if (change) "sign.change.error.generic" else "onb.signup.error.generic"
            ChalkakAlert(
                title = null,
                message = it.serverMessage ?: copy[it.copyKey ?: fallback],
                onConfirm = onErrorConfirm,
                tag = "signature-preview.error-dialog",
                confirmTag = "signature-preview.error-dialog-confirm-button",
            )
        }
    }
}

/**
 * Signup-mode preview wired to [SignupStateHolder] ("시작하기"). Effects go to the callbacks: [onGoHome] after the account exists,
 * [onBackToLogin] with a copy key (`sign.error.expired`), [onBackToDrawing] when the server rejects the signature.
 */
@Composable
fun SignupPreviewRoute(
    holder: SignupStateHolder,
    png: ByteArray,
    onGoHome: () -> Unit,
    onBackToLogin: (copyKey: String) -> Unit,
    onBackToDrawing: () -> Unit,
    onRedraw: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by holder.state.collectAsState()
    val goHome by rememberUpdatedState(onGoHome)
    val backToLogin by rememberUpdatedState(onBackToLogin)
    val backToDrawing by rememberUpdatedState(onBackToDrawing)
    LaunchedEffect(holder) {
        holder.effects.collect { effect ->
            when (effect) {
                SignupEffect.GoHome -> goHome()
                is SignupEffect.BackToLogin -> backToLogin(effect.copyKey)
                SignupEffect.BackToDrawing -> backToDrawing()
            }
        }
    }
    ScreenGoneEffect(holder) { holder.onScreenGone() }
    SignaturePreviewScreen(
        mode = SignatureMode.Signup,
        png = png,
        busy = state.busy,
        error = state.error,
        onErrorConfirm = holder::onErrorShown,
        onRedraw = onRedraw,
        onConfirm = { holder.onStartClicked(png) },
        modifier = modifier,
    )
}

/** Change-mode preview wired to [SignatureChangeStateHolder]; effects go to the callbacks (`Done` carries the toast copy key). */
@Composable
fun ChangeSignaturePreviewRoute(
    holder: SignatureChangeStateHolder,
    png: ByteArray,
    onDone: (toastCopyKey: String) -> Unit,
    onBackToLogin: (copyKey: String) -> Unit,
    onBackToDrawing: () -> Unit,
    onRedraw: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by holder.state.collectAsState()
    val done by rememberUpdatedState(onDone)
    val backToLogin by rememberUpdatedState(onBackToLogin)
    val backToDrawing by rememberUpdatedState(onBackToDrawing)
    LaunchedEffect(holder) {
        holder.effects.collect { effect ->
            when (effect) {
                is SignatureChangeEffect.Done -> done(effect.toastCopyKey)
                is SignatureChangeEffect.BackToLogin -> backToLogin(effect.copyKey)
                SignatureChangeEffect.BackToDrawing -> backToDrawing()
            }
        }
    }
    ScreenGoneEffect(holder) { holder.onScreenGone() }
    SignaturePreviewScreen(
        mode = SignatureMode.Change,
        png = png,
        busy = state.busy,
        error = state.error,
        onErrorConfirm = holder::onErrorShown,
        onRedraw = onRedraw,
        onConfirm = { holder.onConfirmClicked(png) },
        modifier = modifier,
    )
}
