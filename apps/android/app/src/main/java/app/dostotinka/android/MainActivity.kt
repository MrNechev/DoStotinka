package app.dostotinka.android

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.Message
import android.view.View
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.isVisible
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Shows the user's own DoStotinka server full-screen (no browser bars). On the first start it
 * asks for the server address – like the Immich app.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var prefs: Prefs
    private lateinit var webView: WebView
    private lateinit var setup: View
    private lateinit var offline: View
    @Volatile private var currentUrl: String? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val pickFiles =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
            fileCallback = null
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = Prefs(this)
        webView = findViewById(R.id.web)
        setup = findViewById(R.id.setup)
        offline = findViewById(R.id.offline)

        // Keep content out from under the status bar, navigation bar and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.root)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        configureWebView()
        configureSetup()
        findViewById<Button>(R.id.retry).setOnClickListener { loadServer() }
        findViewById<Button>(R.id.change_server).setOnClickListener {
            prefs.resetServer()
            showSetup()
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.isVisible && webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState != null && prefs.serverUrl != null) {
            webView.restoreState(savedInstanceState)
            showWeb()
        } else if (prefs.serverUrl == null) {
            showSetup()
        } else {
            loadServer()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    /** True while the WebView shows a page of the configured server (guards the JS bridge). */
    fun isOnServerPage(): Boolean {
        val server = prefs.serverUrl ?: return false
        val url = currentUrl ?: return false
        return sameOrigin(url, server)
    }

    private fun sameOrigin(a: String, b: String): Boolean {
        val ua = Uri.parse(a)
        val ub = Uri.parse(b)
        return ua.scheme == ub.scheme && ua.host == ub.host && portOf(ua) == portOf(ub)
    }

    private fun portOf(u: Uri) = if (u.port != -1) u.port else if (u.scheme == "https") 443 else 80

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        // Debug builds can be inspected with chrome://inspect (and driven by tests).
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setSupportMultipleWindows(true)
            javaScriptCanOpenWindowsAutomatically = true
            userAgentString = "$userAgentString DoStotinkaApp/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().setAcceptCookie(true)
        webView.addJavascriptInterface(AppBridge(this), "DoStotinkaApp")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                val server = prefs.serverUrl ?: return false
                if (sameOrigin(url, server)) return false
                openExternally(request.url)
                return true
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                currentUrl = url
            }

            override fun onPageFinished(view: WebView, url: String) {
                currentUrl = url
                CookieManager.getInstance().flush()
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showOffline(error.description?.toString())
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            // window.open (e.g. the bank's consent page) opens in the browser.
            override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
                val popup = WebView(this@MainActivity)
                popup.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                        openExternally(request.url)
                        v.destroy()
                        return true
                    }
                }
                (resultMsg.obj as WebView.WebViewTransport).webView = popup
                resultMsg.sendToTarget()
                return true
            }

            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    pickFiles.launch(params.createIntent())
                    true
                } catch (_: ActivityNotFoundException) {
                    fileCallback = null
                    false
                }
            }
        }

        // CSV exports and backups: download with the login cookie.
        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            try {
                val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
                val request = DownloadManager.Request(Uri.parse(url))
                    .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
                    .addRequestHeader("User-Agent", userAgent)
                    .setMimeType(mimeType)
                    .setTitle(name)
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
                (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
                Toast.makeText(this, getString(R.string.downloading, name), Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this, e.message, Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun openExternally(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, uri.toString(), Toast.LENGTH_LONG).show()
        }
    }

    private fun configureSetup() {
        val input = findViewById<EditText>(R.id.server_input)
        val button = findViewById<Button>(R.id.connect)
        input.setOnEditorActionListener { _, action, _ ->
            if (action == EditorInfo.IME_ACTION_GO) {
                button.performClick()
                true
            } else false
        }
        button.setOnClickListener { checkServer(input.text.toString()) }
    }

    fun showSetup() {
        webView.isVisible = false
        offline.isVisible = false
        setup.isVisible = true
        findViewById<EditText>(R.id.server_input).setText(prefs.serverUrl ?: "")
    }

    private fun showWeb() {
        setup.isVisible = false
        offline.isVisible = false
        webView.isVisible = true
    }

    private fun showOffline(reason: String?) {
        webView.isVisible = false
        setup.isVisible = false
        offline.isVisible = true
        findViewById<TextView>(R.id.offline_detail).text =
            listOfNotNull(prefs.serverUrl, reason).joinToString("\n")
    }

    private fun loadServer() {
        val server = prefs.serverUrl ?: return showSetup()
        showWeb()
        webView.loadUrl(server)
    }

    /** Normalises the typed address and checks that a DoStotinka server answers there. */
    private fun checkServer(raw: String) {
        var url = raw.trim().trimEnd('/')
        if (url.isEmpty()) return
        if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://$url"
        val error = findViewById<TextView>(R.id.setup_error)
        val progress = findViewById<ProgressBar>(R.id.setup_progress)
        val button = findViewById<Button>(R.id.connect)
        error.isVisible = false
        progress.isVisible = true
        button.isEnabled = false
        Thread {
            val result = runCatching {
                val conn = URL("$url/api/health").openConnection() as HttpURLConnection
                conn.connectTimeout = 10_000
                conn.readTimeout = 10_000
                val code = conn.responseCode
                val body = (if (code < 400) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() }
                conn.disconnect()
                JSONObject(body ?: "{}").optString("status") == "ok"
            }
            runOnUiThread {
                progress.isVisible = false
                button.isEnabled = true
                if (result.getOrDefault(false)) {
                    (getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager)
                        .hideSoftInputFromWindow(button.windowToken, 0)
                    prefs.serverUrl = url
                    loadServer()
                } else {
                    error.text = getString(R.string.setup_error, result.exceptionOrNull()?.message ?: url)
                    error.isVisible = true
                }
            }
        }.start()
    }
}
