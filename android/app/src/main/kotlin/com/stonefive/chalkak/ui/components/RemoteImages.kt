package com.stonefive.chalkak.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.painter.ColorPainter
import androidx.compose.ui.layout.ContentScale
import coil3.ImageLoader
import coil3.compose.AsyncImage
import com.stonefive.chalkak.ui.theme.ChalkakTheme

/**
 * `RemoteImage` over a Coil [ImageLoader] (built in the app container with the app's OkHttp). A null [url] (the server value was not
 * a usable https address) and a failed load both show the neutral fallback tile; the layout never changes.
 */
@Composable
fun CoilRemoteImage(loader: ImageLoader, url: String?, modifier: Modifier = Modifier) {
    val fallback = ChalkakTheme.colors.border
    if (url == null) {
        Box(modifier.background(fallback))
        return
    }
    AsyncImage(
        model = url,
        contentDescription = null,
        imageLoader = loader,
        modifier = modifier,
        contentScale = ContentScale.Crop,
        placeholder = ColorPainter(fallback),
        error = ColorPainter(fallback),
    )
}
