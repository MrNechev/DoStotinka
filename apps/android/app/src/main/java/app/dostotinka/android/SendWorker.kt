package app.dostotinka.android

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * Posts one notification to `POST /api/ingest/notification`. Runs through WorkManager, so it is
 * retried when the phone is offline or the server is not reachable right now.
 */
class SendWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val prefs = Prefs(applicationContext)
        val server = prefs.serverUrl ?: return@withContext Result.failure()
        val token = prefs.token ?: return@withContext Result.failure()
        val fields = listOf(
            "app" to (inputData.getString("app") ?: ""),
            "title" to (inputData.getString("title") ?: ""),
            "text" to (inputData.getString("text") ?: ""),
            "time" to inputData.getLong("time", System.currentTimeMillis()).toString(),
        )
        val body = fields.joinToString("&") { (k, v) ->
            "$k=${URLEncoder.encode(v.take(3900), "UTF-8")}"
        }
        try {
            val conn = (URL("$server/api/ingest/notification").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15_000
                readTimeout = 20_000
                doOutput = true
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
            }
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            conn.disconnect()
            when {
                code in 200..299 -> {
                    prefs.lastSentAt = System.currentTimeMillis()
                    prefs.sentCount = prefs.sentCount + 1
                    prefs.lastError = null
                    Result.success()
                }
                // Token removed, phone paused or the feature switched off: retrying will not help.
                code == 401 || code == 403 || code == 404 -> {
                    prefs.lastError = "HTTP $code"
                    Result.failure()
                }
                code in 400..499 && code != 429 -> {
                    prefs.lastError = "HTTP $code"
                    Result.failure()
                }
                else -> retry(prefs, "HTTP $code")
            }
        } catch (e: IOException) {
            retry(prefs, e.message ?: "network error")
        }
    }

    private fun retry(prefs: Prefs, error: String): Result {
        prefs.lastError = error
        return if (runAttemptCount < 20) Result.retry() else Result.failure()
    }

    companion object {
        fun enqueue(context: Context, app: String, title: String, text: String, time: Long) {
            val request = OneTimeWorkRequestBuilder<SendWorker>()
                .setInputData(workDataOf("app" to app, "title" to title, "text" to text, "time" to time))
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .addTag("send")
                .build()
            WorkManager.getInstance(context).enqueue(request)
        }
    }
}
