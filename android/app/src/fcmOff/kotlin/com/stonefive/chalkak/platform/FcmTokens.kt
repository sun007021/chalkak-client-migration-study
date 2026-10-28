package com.stonefive.chalkak.platform

import android.content.Context
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

/** Build without Firebase (default). See `app/build.gradle.kts`: `-PfcmProjectId=...` selects `src/fcmOn` instead. */
object FcmTokens {
    @Suppress("UNUSED_PARAMETER")
    fun create(context: Context): PushTokenSource = NoTokens

    private object NoTokens : PushTokenSource {
        override val refreshed: Flow<String> = emptyFlow()
        override suspend fun currentToken(): String? = null
    }
}
