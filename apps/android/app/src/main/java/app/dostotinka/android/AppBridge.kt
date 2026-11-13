package app.dostotinka.android

import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.webkit.JavascriptInterface
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * The web app talks to the phone through `window.DoStotinkaApp`. It is only usable by pages of
 * the configured server (the WebView never shows other sites – they open in the browser).
 */
class AppBridge(private val activity: MainActivity) {
    private val prefs = Prefs(activity)

    private fun allowed(): Boolean = activity.isOnServerPage()

    @JavascriptInterface
    fun getInfo(): String {
        if (!allowed()) return "{}"
        val access = NotificationManagerCompat.getEnabledListenerPackages(activity)
            .contains(activity.packageName)
        return JSONObject()
            .put("appVersion", BuildConfig.VERSION_NAME)
            .put("device", "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}")
            .put("server", prefs.serverUrl)
            .put("connected", prefs.token != null)
            .put("sourceId", prefs.sourceId)
            .put("sourceName", prefs.sourceName)
            .put("notificationAccess", access)
            .put("watched", JSONArray(prefs.watched.toList()))
            .put("recent", prefs.recentAppsArray())
            .put("lastSentAt", prefs.lastSentAt)
            .put("sentCount", prefs.sentCount)
            .put("lastError", prefs.lastError)
            .toString()
    }

    /** Stores the token of the notification source the web app created for this phone. */
    @JavascriptInterface
    fun connect(token: String, sourceId: String, name: String): Boolean {
        if (!allowed() || !token.startsWith("dsn_")) return false
        prefs.token = token
        prefs.sourceId = sourceId
        prefs.sourceName = name
        prefs.lastError = null
        return true
    }

    @JavascriptInterface
    fun disconnect() {
        if (allowed()) prefs.disconnect()
    }

    @JavascriptInterface
    fun setWatched(json: String) {
        if (!allowed()) return
        val arr = JSONArray(json)
        prefs.watched = (0 until arr.length()).map { arr.getString(it) }.toSet()
    }

    @JavascriptInterface
    fun openNotificationAccess() {
        if (!allowed()) return
        activity.runOnUiThread {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(
                    Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                    ComponentName(activity, NotificationService::class.java).flattenToString(),
                )
            } else {
                Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            }
            try {
                activity.startActivity(intent)
            } catch (_: Exception) {
                activity.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
        }
    }

    /** App info page – where "Allow restricted settings" lives for apps not from an app store. */
    @JavascriptInterface
    fun openAppInfo() {
        if (!allowed()) return
        activity.runOnUiThread {
            activity.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(android.net.Uri.fromParts("package", activity.packageName, null)),
            )
        }
    }

    @JavascriptInterface
    fun changeServer() {
        if (!allowed()) return
        activity.runOnUiThread { activity.changeServer() }
    }
}
