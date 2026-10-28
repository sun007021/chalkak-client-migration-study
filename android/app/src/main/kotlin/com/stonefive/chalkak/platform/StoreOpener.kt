package com.stonefive.chalkak.platform

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import kr.chalkak.feature.onboarding.ExternalBrowser

/** System browser for URLs the legal-document opener sends outside the app. False when nothing can handle the URL. */
class AndroidExternalBrowser(private val context: Context) : ExternalBrowser {
    override fun open(url: String): Boolean = start(Intent(Intent.ACTION_VIEW, Uri.parse(url)))

    private fun start(intent: Intent): Boolean = try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (e: ActivityNotFoundException) {
        false
    }
}

/** Opens this app's store page: `market://` first, then the https URL when no store app answers. Fallback of the update gate. */
class StoreOpener(private val context: Context) {
    fun open(): Boolean {
        val id = context.packageName
        return start(Uri.parse("market://details?id=$id")) || start(Uri.parse("https://play.google.com/store/apps/details?id=$id"))
    }

    private fun start(uri: Uri): Boolean = try {
        context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (e: ActivityNotFoundException) {
        false
    }
}
