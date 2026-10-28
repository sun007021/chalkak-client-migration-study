package com.stonefive.chalkak.ui.terms

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import kr.chalkak.feature.onboarding.DocumentTarget
import kr.chalkak.feature.onboarding.LegalDocuments

/**
 * In-app legal document (Notion page, D-25). Every composition of this function is one load attempt: the caller wraps it in
 * `key(attempt)` so retry builds a new WebView. Reports exactly one of [onLoaded] / [onFailed] per attempt (a main-frame error wins
 * over a later page-finished). Navigation stays on the allowed hosts; other links are dropped.
 */
@SuppressLint("SetJavaScriptEnabled") // Notion pages render with JavaScript only.
@Composable
fun LegalWebView(url: String, onLoaded: () -> Unit, onFailed: () -> Unit, modifier: Modifier = Modifier) {
    val loaded by rememberUpdatedState(onLoaded)
    val failed by rememberUpdatedState(onFailed)
    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                webViewClient = object : WebViewClient() {
                    private var errored = false
                    private var reported = false

                    private fun report(success: Boolean) {
                        if (reported) return
                        reported = true
                        if (success) loaded() else failed()
                    }

                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                        LegalDocuments.classify(request.url.toString()) != DocumentTarget.InApp

                    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                        errored = false
                    }

                    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                        if (request.isForMainFrame) {
                            errored = true
                            report(false)
                        }
                    }

                    override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
                        if (request.isForMainFrame && errorResponse.statusCode >= HTTP_ERROR_MIN) {
                            errored = true
                            report(false)
                        }
                    }

                    override fun onPageFinished(view: WebView, url: String?) {
                        if (!errored) report(true)
                    }
                }
                loadUrl(url)
            }
        },
        onRelease = { it.destroy() },
    )
}

private const val HTTP_ERROR_MIN = 400
