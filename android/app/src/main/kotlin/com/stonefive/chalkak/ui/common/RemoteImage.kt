package com.stonefive.chalkak.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage

/**
 * Image slot: draws the image at [url] (null = nothing known yet) into the area described by the modifier. The app's real
 * slot is [CoilRemoteImage]; tests pass a fake. The slot owns loading and failure: when the image cannot be loaded it draws nothing
 * (and, because [Modifier] carries the caller's `testTag`, the tagged node is then absent).
 *
 * A3 defines the same alias in `ui/home/HomeScreen.kt`; dedupe when both are merged.
 */
typealias RemoteImage = @Composable (url: String?, modifier: Modifier) -> Unit

/**
 * Production [RemoteImage] (Coil 3 over OkHttp). Callers give it a width (`fillMaxWidth`) and no height: the image's own aspect
 * ratio decides the height ([ContentScale.FillWidth]). A failed load removes the image from the tree for that url.
 */
val CoilRemoteImage: RemoteImage = { url, modifier -> CoilImage(url, modifier) }

@Composable
private fun CoilImage(url: String?, modifier: Modifier) {
    if (url == null) return
    var failed by remember(url) { mutableStateOf(false) }
    if (failed) return
    AsyncImage(
        model = url,
        contentDescription = null,
        modifier = modifier,
        contentScale = ContentScale.FillWidth,
        onError = { failed = true },
    )
}
