package com.stonefive.chalkak.platform

import android.Manifest
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.core.content.ContextCompat
import kr.chalkak.feature.notification.NotificationPermissionPort
import kr.chalkak.feature.notification.PermissionPromptStore
import kr.chalkak.feature.notification.PermissionRequestResult
import kr.chalkak.feature.settings.DeviceNotificationSettings
import kr.chalkak.feature.settings.NotificationPermission

/**
 * Device-level notification permission for the settings switches (REQ-SET-015..018), on top of the push module's POST_NOTIFICATIONS port.
 *
 * - Android 12 and below (no runtime permission): [NotificationPermission.Granted] / [NotificationPermission.Denied] from "notifications
 *   allowed for this app".
 * - Android 13+: granted and allowed -> Granted; granted but blocked in system settings -> Denied; not granted -> NotDetermined, because
 *   the OS does not say whether it was never asked or refused for good. [requestPermission] settles that with the install-wide "already
 *   asked" flag the push flow keeps: never asked -> the OS prompt through [port] (flag set first); asked before, the OS shows no dialog
 *   again -> the app's system notification settings open instead and the answer is Denied.
 */
class AndroidDeviceNotificationSettings(
    private val port: NotificationPermissionPort,
    private val prompts: PermissionPromptStore,
    private val sdkInt: Int,
    private val notificationsEnabled: () -> Boolean,
    private val runtimePermissionHeld: () -> Boolean,
    private val systemSettings: () -> Unit,
) : DeviceNotificationSettings {

    override fun permission(): NotificationPermission = when {
        !notificationsEnabled() -> if (sdkInt >= TIRAMISU && !runtimePermissionHeld()) NotificationPermission.NotDetermined else NotificationPermission.Denied
        else -> NotificationPermission.Granted
    }

    override suspend fun requestPermission(): NotificationPermission {
        if (sdkInt < TIRAMISU) return permission()
        if (prompts.wasRequested()) {
            systemSettings()
            return NotificationPermission.Denied
        }
        prompts.markRequested()
        val answer = try {
            port.request()
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            PermissionRequestResult.Failed
        }
        return if (answer == PermissionRequestResult.Granted) NotificationPermission.Granted else NotificationPermission.Denied
    }

    /** `ACTION_APP_NOTIFICATION_SETTINGS`; the app details screen when no settings app answers that action. */
    override fun openSystemSettings() = systemSettings()

    companion object {
        private const val TIRAMISU = 33

        fun android(context: Context, push: PushPlatform, sdkInt: Int = android.os.Build.VERSION.SDK_INT): AndroidDeviceNotificationSettings {
            val app = context.applicationContext
            return AndroidDeviceNotificationSettings(
                port = push.permission,
                prompts = push.promptStore,
                sdkInt = sdkInt,
                notificationsEnabled = { app.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled() != false },
                runtimePermissionHeld = {
                    sdkInt < TIRAMISU ||
                        ContextCompat.checkSelfPermission(app, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
                },
                systemSettings = { openSystemNotificationSettings(app) },
            )
        }

        private fun openSystemNotificationSettings(app: Context) {
            val notificationSettings = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, app.packageName)
            val appDetails = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", app.packageName, null))
            if (!start(app, notificationSettings)) start(app, appDetails)
        }

        private fun start(app: Context, intent: Intent): Boolean = try {
            app.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (e: ActivityNotFoundException) {
            false
        }
    }
}

/** JVM tests and previews: notifications allowed, nothing to open. */
object InertDeviceNotificationSettings : DeviceNotificationSettings {
    override fun permission() = NotificationPermission.Granted
    override suspend fun requestPermission() = NotificationPermission.Granted
    override fun openSystemSettings() = Unit
}
