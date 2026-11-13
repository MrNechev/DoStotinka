package app.dostotinka.android

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/** Everything the app remembers, in one SharedPreferences file (private to the app). */
class Prefs(context: Context) {
    private val p: SharedPreferences =
        context.applicationContext.getSharedPreferences("dostotinka", Context.MODE_PRIVATE)

    /** Address of the user's DoStotinka server, e.g. "http://192.168.1.10:8742". */
    var serverUrl: String?
        get() = p.getString("server", null)
        set(v) = p.edit().putString("server", v).apply()

    /** Token of this phone as a notification source (only adds notifications). */
    var token: String?
        get() = p.getString("token", null)
        set(v) = p.edit().putString("token", v).apply()

    var sourceId: String?
        get() = p.getString("sourceId", null)
        set(v) = p.edit().putString("sourceId", v).apply()

    var sourceName: String?
        get() = p.getString("sourceName", null)
        set(v) = p.edit().putString("sourceName", v).apply()

    /** Package names whose notifications are forwarded. */
    var watched: Set<String>
        get() = p.getStringSet("watched", emptySet()) ?: emptySet()
        set(v) = p.edit().putStringSet("watched", v.toSet()).apply()

    var lastSentAt: Long
        get() = p.getLong("lastSentAt", 0)
        set(v) = p.edit().putLong("lastSentAt", v).apply()

    var lastError: String?
        get() = p.getString("lastError", null)
        set(v) = p.edit().putString("lastError", v).apply()

    var sentCount: Int
        get() = p.getInt("sentCount", 0)
        set(v) = p.edit().putInt("sentCount", v).apply()

    /**
     * Apps that recently showed a notification (package → label and time), so the user can pick
     * which ones to forward. Only names are kept, never the contents of other apps' notifications.
     */
    fun recentApps(): JSONObject =
        try {
            JSONObject(p.getString("recent", "{}") ?: "{}")
        } catch (_: Exception) {
            JSONObject()
        }

    @Synchronized
    fun rememberApp(pkg: String, label: String, time: Long) {
        val all = recentApps()
        all.put(pkg, JSONObject().put("label", label).put("lastSeen", time))
        // Keep the 40 most recent apps.
        if (all.length() > 40) {
            val oldest = all.keys().asSequence().minByOrNull { all.getJSONObject(it).optLong("lastSeen") }
            if (oldest != null) all.remove(oldest)
        }
        p.edit().putString("recent", all.toString()).apply()
    }

    fun recentAppsArray(): JSONArray {
        val all = recentApps()
        val list = all.keys().asSequence().map { k ->
            val o = all.getJSONObject(k)
            JSONObject().put("app", k).put("label", o.optString("label", k)).put("lastSeen", o.optLong("lastSeen"))
        }.sortedByDescending { it.optLong("lastSeen") }.toList()
        return JSONArray(list)
    }

    fun disconnect() {
        p.edit().remove("token").remove("sourceId").remove("sourceName").remove("lastError").apply()
    }

    fun resetServer() {
        disconnect()
        p.edit().remove("server").apply()
    }
}
