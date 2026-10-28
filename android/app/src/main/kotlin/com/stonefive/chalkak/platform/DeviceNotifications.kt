package com.stonefive.chalkak.platform

import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import kr.chalkak.feature.settings.DeviceNotificationSettings
import kr.chalkak.feature.settings.NotificationPermission

/**
 * Device-level notification permission for the settings switches (REQ-SET-015..018). "Notifications allowed for this app" is the whole
 * answer on Android: [NotificationPermission.Granted] or [NotificationPermission.Denied]. The runtime prompt belongs to the push
 * registration flow, so [requestPermission] only re-reads the current answer; a switch turned on while it is off opens the app's system
 * notification settings instead ([openSystemSettings]).
 */
class AndroidDeviceNotificationSettings(context: Context) : DeviceNotificationSettings {
    private val app = context.applicationContext

    override fun permission(): NotificationPermission =
        if (app.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled() == false) {
            NotificationPermission.Denied
        } else {
            NotificationPermission.Granted
        }

    override suspend fun requestPermission(): NotificationPermission = permission()

    /** `ACTION_APP_NOTIFICATION_SETTINGS`; the app details screen when no settings app answers that action. */
    override fun openSystemSettings() {
        val notificationSettings = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, app.packageName)
        val appDetails = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", app.packageName, null))
        if (!start(notificationSettings)) start(appDetails)
    }

    private fun start(intent: Intent): Boolean = try {
        app.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (e: ActivityNotFoundException) {
        false
    }
}

/** JVM tests and previews: notifications allowed, nothing to open. */
object InertDeviceNotificationSettings : DeviceNotificationSettings {
    override fun permission() = NotificationPermission.Granted
    override suspend fun requestPermission() = NotificationPermission.Granted
    override fun openSystemSettings() = Unit
}
