package app.dostotinka.android

import android.content.Context
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * A copy of the web app (HTML, scripts, styles, icons – never data from the API) kept in the app's
 * storage. Every file loaded from the server is saved; when the server cannot be reached (away
 * from home), the saved files are used, so records can still be added offline – the web app sends
 * them when the server is back.
 */
class OfflineFiles(context: Context) {
    private val dir = File(context.filesDir, "web")

    /** Called on a background thread for every request of the WebView. */
    fun intercept(request: WebResourceRequest, server: String): WebResourceResponse? {
        if (request.method != "GET") return null
        val url = request.url
        if (!sameOrigin(url, Uri.parse(server))) return null
        val path = url.path.takeUnless { it.isNullOrEmpty() } ?: "/"
        if (path.startsWith("/api/") || path.contains("..")) return null

        // Pages of the single page app are all index.html.
        val name = path.substringAfterLast('/')
        val key = if (path.startsWith("/assets/") || name.contains('.')) path.trimStart('/') else "index.html"
        val file = File(dir, key)
        // Build files have a hash in their name and never change.
        if (path.startsWith("/assets/") && file.isFile) return serve(file)

        return try {
            val conn = URL(url.toString()).openConnection() as HttpURLConnection
            conn.connectTimeout = 4_000
            conn.readTimeout = 10_000
            conn.instanceFollowRedirects = false
            request.requestHeaders["User-Agent"]?.let { conn.setRequestProperty("User-Agent", it) }
            if (conn.responseCode != 200) {
                conn.disconnect()
                return null // let the WebView load it (and show the server's answer)
            }
            val bytes = conn.inputStream.use { it.readBytes() }
            val type = conn.contentType
            conn.disconnect()
            store(file, bytes)
            WebResourceResponse(mimeOf(key, type), "utf-8", bytes.inputStream()).apply {
                responseHeaders = mapOf("Cache-Control" to "no-cache")
            }
        } catch (_: IOException) {
            if (file.isFile) serve(file) else null
        }
    }

    private fun store(file: File, bytes: ByteArray) {
        try {
            file.parentFile?.mkdirs()
            val tmp = File(file.parentFile, "${file.name}.tmp")
            tmp.writeBytes(bytes)
            tmp.renameTo(file)
        } catch (_: IOException) {
            // Not critical: the app works online without the copy.
        }
    }

    private fun serve(file: File) =
        WebResourceResponse(mimeOf(file.name, null), "utf-8", file.inputStream())

    private fun mimeOf(name: String, header: String?): String {
        header?.substringBefore(';')?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        return when (name.substringAfterLast('.', "html").lowercase()) {
            "js", "mjs" -> "text/javascript"
            "css" -> "text/css"
            "svg" -> "image/svg+xml"
            "png" -> "image/png"
            "webp" -> "image/webp"
            "ico" -> "image/x-icon"
            "json", "webmanifest" -> "application/json"
            "woff2" -> "font/woff2"
            "woff" -> "font/woff"
            else -> "text/html"
        }
    }

    /** Removes the copy (another server was chosen). */
    fun clear() {
        dir.deleteRecursively()
    }

    private fun sameOrigin(a: Uri, b: Uri): Boolean {
        fun port(u: Uri) = if (u.port != -1) u.port else if (u.scheme == "https") 443 else 80
        return a.scheme == b.scheme && a.host == b.host && port(a) == port(b)
    }
}
