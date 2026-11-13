package app.dostotinka.android

import android.app.Notification
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Sees the notifications of other apps (after the user granted notification access) and forwards
 * those of the chosen apps – banking apps, Google Wallet, SMS – to the user's DoStotinka server.
 * Notifications of other apps are never read beyond the app's name.
 */
class NotificationService : NotificationListenerService() {

    private val recentKeys = LinkedHashMap<String, Long>()

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName ?: return
        if (pkg == packageName) return
        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        if (n.flags and Notification.FLAG_ONGOING_EVENT != 0) return
        if (n.flags and Notification.FLAG_FOREGROUND_SERVICE != 0) return

        val prefs = Prefs(this)
        val time = sbn.postTime
        prefs.rememberApp(pkg, appLabel(pkg), time)
        if (prefs.token == null || pkg !in prefs.watched) return

        val extras = n.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
            ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()?.trim().orEmpty()
        if (title.isEmpty() && text.isEmpty()) return

        // Apps often update the same notification several times – forward each text once.
        val key = "$pkg|$title|$text"
        synchronized(recentKeys) {
            val now = System.currentTimeMillis()
            recentKeys.entries.removeAll { now - it.value > 5 * 60_000 }
            if (recentKeys.containsKey(key)) return
            recentKeys[key] = now
        }
        SendWorker.enqueue(this, app = pkg, title = title, text = text, time = time)
    }

    private fun appLabel(pkg: String): String =
        try {
            val info = packageManager.getApplicationInfo(pkg, 0)
            packageManager.getApplicationLabel(info).toString()
        } catch (_: PackageManager.NameNotFoundException) {
            pkg
        }
}
