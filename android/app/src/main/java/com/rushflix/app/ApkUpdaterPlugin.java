package com.rushflix.app;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import java.io.File;

public class ApkUpdaterPlugin {

    private final MainActivity activity;
    private final WebView webView;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long downloadId = -1;
    private Runnable pollRunnable;

    ApkUpdaterPlugin(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public void downloadAndInstall(String url) {
        activity.runOnUiThread(() -> {
            // Android 8+ requires explicit "install unknown apps" grant for this package
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!activity.getPackageManager().canRequestPackageInstalls()) {
                    postMessage("{\"type\":\"rushflix_update_permission_needed\"}");
                    Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    activity.startActivity(intent);
                    return;
                }
            }
            startDownload(url);
        });
    }

    @JavascriptInterface
    public void cancelDownload() {
        activity.runOnUiThread(() -> {
            if (downloadId != -1) {
                DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm != null) dm.remove(downloadId);
                downloadId = -1;
            }
            stopPolling();
            postMessage("{\"type\":\"rushflix_update_cancelled\"}");
        });
    }

    private void startDownload(String url) {
        DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) {
            postMessage("{\"type\":\"rushflix_update_error\",\"message\":\"DownloadManager unavailable\"}");
            return;
        }

        // Clean up any previous download file
        File destDir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (destDir != null) {
            File old = new File(destDir, "rush-flix-update.apk");
            if (old.exists()) old.delete();
        }

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
            .setTitle("Rush Flix Update")
            .setDescription("Downloading update…")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            .setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, "rush-flix-update.apk")
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(false);

        downloadId = dm.enqueue(request);
        postMessage("{\"type\":\"rushflix_update_progress\",\"percent\":0,\"downloaded\":0,\"total\":0}");
        startPolling(dm);
    }

    private void startPolling(DownloadManager dm) {
        pollRunnable = new Runnable() {
            @Override
            public void run() {
                if (downloadId == -1) return;

                DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
                Cursor cursor = dm.query(query);
                if (cursor == null) return;

                if (cursor.moveToFirst()) {
                    int statusCol = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                    int bytesCol = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
                    int totalCol = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
                    int reasonCol = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);

                    int status = cursor.getInt(statusCol);
                    long downloaded = cursor.getLong(bytesCol);
                    long total = cursor.getLong(totalCol);
                    int reason = cursor.getInt(reasonCol);

                    cursor.close();

                    if (status == DownloadManager.STATUS_SUCCESSFUL) {
                        downloadId = -1;
                        stopPolling();
                        triggerInstall();
                        return;
                    }

                    if (status == DownloadManager.STATUS_FAILED) {
                        downloadId = -1;
                        stopPolling();
                        String msg = reasonToString(reason);
                        postMessage("{\"type\":\"rushflix_update_error\",\"message\":\"" + escape(msg) + "\"}");
                        return;
                    }

                    int percent = (total > 0) ? (int) (downloaded * 100 / total) : 0;
                    postMessage("{\"type\":\"rushflix_update_progress\",\"percent\":" + percent +
                        ",\"downloaded\":" + downloaded + ",\"total\":" + total + "}");

                    handler.postDelayed(this, 500);
                } else {
                    cursor.close();
                    handler.postDelayed(this, 500);
                }
            }
        };
        handler.post(pollRunnable);
    }

    private void stopPolling() {
        if (pollRunnable != null) {
            handler.removeCallbacks(pollRunnable);
            pollRunnable = null;
        }
    }

    private void triggerInstall() {
        File apkFile = new File(
            activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
            "rush-flix-update.apk");

        if (!apkFile.exists()) {
            postMessage("{\"type\":\"rushflix_update_error\",\"message\":\"APK file not found after download\"}");
            return;
        }

        Uri apkUri = FileProvider.getUriForFile(
            activity,
            activity.getPackageName() + ".fileprovider",
            apkFile);

        Intent intent = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(apkUri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        postMessage("{\"type\":\"rushflix_update_complete\"}");
        activity.startActivity(intent);
    }

    private void postMessage(String json) {
        String js = "window.postMessage(" + json + ",'*')";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private String reasonToString(int reason) {
        switch (reason) {
            case DownloadManager.ERROR_INSUFFICIENT_SPACE: return "Insufficient storage space";
            case DownloadManager.ERROR_FILE_ERROR: return "Storage error";
            case DownloadManager.ERROR_HTTP_DATA_ERROR: return "Network data error";
            case DownloadManager.ERROR_UNHANDLED_HTTP_CODE: return "Unexpected server response";
            case DownloadManager.ERROR_TOO_MANY_REDIRECTS: return "Too many redirects";
            case DownloadManager.ERROR_CANNOT_RESUME: return "Download cannot be resumed";
            default: return "Download failed (code " + reason + ")";
        }
    }

    private String escape(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
