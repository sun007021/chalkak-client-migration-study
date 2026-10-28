package com.stonefive.chalkak.ui.issue

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Message
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import kr.chalkak.feature.home.LinkDecision
import kr.chalkak.feature.home.LinkNavigation

/**
 * Banner page in an Android `WebView` (the real [IssueWebContent]). Every composition is one load attempt; the caller keys it by
 * attempt so a retry builds a new WebView. Exactly one of [onLoaded] / [onFailed] is reported per attempt (a main-frame error wins
 * over a later page-finished).
 *
 * Navigation policy lives in `IssueLinkPolicy` (through [onNavigate]); this adapter only translates WebView callbacks into
 * [LinkNavigation]s and consumes every navigation that the policy does not allow in the app. Links that open a new window are
 * judged without ever creating that window.
 */
@SuppressLint("SetJavaScriptEnabled") // Banner pages are web content that needs JavaScript.
@Composable
fun IssueWebView(
    url: String,
    onNavigate: (LinkNavigation) -> LinkDecision,
    onLoaded: () -> Unit,
    onFailed: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val navigate by rememberUpdatedState(onNavigate)
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
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                settings.setSupportMultipleWindows(true)
                webChromeClient = object : WebChromeClient() {
                    override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
                        // A throw-away WebView only learns the target address; it is never shown and the address is judged by the policy.
                        val probe = WebView(view.context)
                        probe.webViewClient = object : WebViewClient() {
                            private var judged = false

                            private fun judge(target: String?) {
                                if (judged || target.isNullOrBlank() || target == "about:blank") return
                                judged = true
                                navigate(
                                    LinkNavigation(url = target, currentUrl = view.url, isUserTap = isUserGesture, opensNewWindow = true),
                                )
                                view.post { probe.destroy() }
                            }

                            override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                                judge(request.url.toString())
                                return true
                            }

                            override fun onPageStarted(v: WebView, started: String?, favicon: Bitmap?) {
                                v.stopLoading()
                                judge(started)
                            }
                        }
                        (resultMsg.obj as WebView.WebViewTransport).webView = probe
                        resultMsg.sendToTarget()
                        return true
                    }
                }
                webViewClient = object : WebViewClient() {
                    private var errored = false
                    private var reported = false

                    private fun report(success: Boolean) {
                        if (reported) return
                        reported = true
                        if (success) loaded() else failed()
                    }

                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                        val navigation = LinkNavigation(
                            url = request.url.toString(),
                            currentUrl = view.url,
                            isUserTap = request.hasGesture() && !request.isRedirect,
                            isMainFrame = request.isForMainFrame,
                        )
                        return navigate(navigation) != LinkDecision.AllowInApp
                    }

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
