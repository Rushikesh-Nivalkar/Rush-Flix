package com.rushflix.app;

import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private TokenRelayServer tokenRelayServer;

    /**
     * Injected into HTML responses from embed player domains.
     * Runs inside the iframe's own origin so it has full access to the video element.
     * Responsibilities:
     *   - Waits for <video> element (MutationObserver handles async player init)
     *   - On loadedmetadata: seeks to pending position then autoplays
     *   - Every 5s: postMessages progress to parent (rushflix_progress)
     *   - Listens for rushflix_play (seek+play) and rushflix_seek_relative (±10s)
     */
    private static final String INJECT_SCRIPT =
        "<script>(function(){" +
        "var video=null,pendingSeek=0;" +
        "function setup(v){" +
        "video=v;" +
        "v.addEventListener('loadedmetadata',function(){" +
        "if(pendingSeek>0){v.currentTime=pendingSeek;pendingSeek=0;}" +
        "v.play().catch(function(){});" +
        "});" +
        "if(pendingSeek>0&&v.readyState>=1){v.currentTime=pendingSeek;pendingSeek=0;}" +
        "v.play().catch(function(){});" +
        "setInterval(function(){" +
        "if(!v.paused&&v.duration>0){" +
        "try{window.parent.postMessage({type:'rushflix_progress',currentTime:v.currentTime,duration:v.duration},'*');}catch(e){}}" +
        "},5000);" +
        "}" +
        "window.addEventListener('message',function(e){" +
        "var d=e.data||{};" +
        "if(d.type==='rushflix_play'){" +
        "pendingSeek=d.seekTo||0;" +
        "if(video){if(pendingSeek>0)video.currentTime=pendingSeek;video.play().catch(function(){});}" +
        "}" +
        "if(d.type==='rushflix_seek_relative'&&typeof d.delta==='number'&&video){" +
        "video.currentTime=Math.max(0,Math.min(video.currentTime+d.delta,video.duration||Infinity));}" +
        "});" +
        "function wait(){" +
        "var v=document.querySelector('video');" +
        "if(v){setup(v);return;}" +
        "new MutationObserver(function(m,obs){" +
        "var v=document.querySelector('video');" +
        "if(v){obs.disconnect();setup(v);}" +
        "}).observe(document.documentElement,{childList:true,subtree:true});" +
        "}" +
        "if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',wait);}else{wait();}" +
        "})()</script>";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.requestFocus();

        // Allow media inside iframes to autoplay without requiring a direct
        // user gesture on the iframe element itself.
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);

        // Replace Capacitor's WebViewClient with our subclass that injects
        // the rushflix script into embed player HTML pages.
        webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String host = request.getUrl().getHost();
                if (host == null) return super.shouldInterceptRequest(view, request);

                boolean isEmbedDomain =
                    host.equals("player.videasy.net") ||
                    host.equals("vidsrc.to") ||
                    host.endsWith(".vidsrc.to") ||
                    host.equals("www.2embed.online") ||
                    host.endsWith(".2embed.online");

                if (!isEmbedDomain) return super.shouldInterceptRequest(view, request);

                // Skip static assets — only inject into HTML documents
                String path = request.getUrl().getPath();
                if (path != null && path.matches("(?i).*\\.(js|css|png|jpg|jpeg|gif|svg|woff2?|ico|mp4|m3u8|ts|vtt|webp|json|xml)$")) {
                    return super.shouldInterceptRequest(view, request);
                }

                // Only proceed for HTML requests
                Map<String, String> reqHeaders = request.getRequestHeaders();
                String accept = reqHeaders.get("Accept");
                if (accept == null || !accept.contains("text/html")) {
                    return super.shouldInterceptRequest(view, request);
                }

                try {
                    URL url = new URL(request.getUrl().toString());
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(15000);
                    conn.setInstanceFollowRedirects(true);
                    // Forward original request headers (cookies, User-Agent, etc.)
                    for (Map.Entry<String, String> h : reqHeaders.entrySet()) {
                        conn.setRequestProperty(h.getKey(), h.getValue());
                    }

                    int code = conn.getResponseCode();
                    String ct = conn.getContentType();
                    if (ct == null || !ct.contains("text/html")) {
                        conn.disconnect();
                        return super.shouldInterceptRequest(view, request);
                    }

                    InputStream is = conn.getInputStream();
                    String html = new String(readBytes(is), "UTF-8");
                    is.close();
                    conn.disconnect();

                    // Inject before </body>; fall back to appending at end
                    int bodyClose = html.lastIndexOf("</body>");
                    html = bodyClose >= 0
                        ? html.substring(0, bodyClose) + INJECT_SCRIPT + html.substring(bodyClose)
                        : html + INJECT_SCRIPT;

                    Map<String, String> resHeaders = new HashMap<>();
                    resHeaders.put("Content-Type", "text/html; charset=UTF-8");
                    resHeaders.put("Access-Control-Allow-Origin", "*");

                    return new WebResourceResponse(
                        "text/html", "UTF-8", code, "OK",
                        resHeaders,
                        new ByteArrayInputStream(html.getBytes("UTF-8"))
                    );
                } catch (Exception e) {
                    Log.e(TAG, "inject failed: " + request.getUrl(), e);
                    return super.shouldInterceptRequest(view, request);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url == null) return;
                try {
                    String host = new URL(url).getHost();
                    if (host == null) return;
                    boolean isEmbed =
                        host.equals("player.videasy.net") ||
                        host.equals("vidsrc.to") ||
                        host.endsWith(".vidsrc.to") ||
                        host.equals("www.2embed.online") ||
                        host.endsWith(".2embed.online");
                    if (isEmbed) scheduleAutoplayTap(view);
                } catch (Exception ignored) {}
            }
        });

        try {
            tokenRelayServer = new TokenRelayServer();
        } catch (Exception e) {
            Log.e(TAG, "Failed to start token relay server", e);
        }
    }

    /**
     * Intercept D-pad keys before the WebView's internal navigation consumes them.
     * Android TV WebView eats arrow keys for its own spatial nav — they never reach
     * the JS window.keydown listener. We bypass that by injecting synthetic events.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                switch (event.getKeyCode()) {
                    case KeyEvent.KEYCODE_DPAD_UP:
                        injectKey(webView, "ArrowUp");
                        return true;
                    case KeyEvent.KEYCODE_DPAD_DOWN:
                        injectKey(webView, "ArrowDown");
                        return true;
                    case KeyEvent.KEYCODE_DPAD_LEFT:
                        injectKey(webView, "ArrowLeft");
                        return true;
                    case KeyEvent.KEYCODE_DPAD_RIGHT:
                        injectKey(webView, "ArrowRight");
                        return true;
                    case KeyEvent.KEYCODE_DPAD_CENTER:
                    case KeyEvent.KEYCODE_NUMPAD_ENTER:
                        // If the focused element is an iframe, route Enter as a rushflix_play
                        // postMessage into the iframe instead of clicking the wrapper element.
                        // This triggers the injected script's play handler inside the player's origin.
                        webView.evaluateJavascript(
                            "(function(){" +
                            "var el=document.activeElement;" +
                            "if(el&&el.tagName==='IFRAME'){" +
                            "try{el.contentWindow.postMessage({type:'rushflix_play',seekTo:0},'*');}catch(e){}" +
                            "}else if(el&&el!==document.body){" +
                            "  el.click();" +
                            "  el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));" +
                            "}" +
                            "})()",
                            null
                        );
                        return true;
                    case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                        injectKey(webView, "MediaPlayPause");
                        return true;
                    case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                        injectKey(webView, "MediaFastForward");
                        return true;
                    case KeyEvent.KEYCODE_MEDIA_REWIND:
                        injectKey(webView, "MediaRewind");
                        return true;
                    default:
                        break;
                }
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private void injectKey(WebView webView, String key) {
        webView.evaluateJavascript(
            "(function(){" +
            "var el=document.activeElement||document.body;" +
            "el.dispatchEvent(new KeyboardEvent('keydown',{key:'" + key + "',bubbles:true,cancelable:true}));" +
            "})()",
            null
        );
    }

    @Override
    public void onBackPressed() {
        // Fire synthetic GoBack keyboard event into JavaScript instead of exiting the app.
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.evaluateJavascript(
                "window.dispatchEvent(new KeyboardEvent('keydown',{key:'GoBack',bubbles:true,cancelable:true}))",
                null
            );
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (tokenRelayServer != null) {
            tokenRelayServer.stop();
            tokenRelayServer = null;
        }
    }

    // Dispatches a real touch tap at the WebView centre after a delay.
    // Embed players gate autoplay behind a user-gesture; this satisfies that gate
    // without requiring the user to physically tap the screen on TV.
    private void scheduleAutoplayTap(WebView webView) {
        webView.postDelayed(() -> {
            int w = webView.getWidth();
            int h = webView.getHeight();
            if (w == 0 || h == 0) return;
            float x = w / 2f;
            float y = h / 2f;
            long t = SystemClock.uptimeMillis();
            MotionEvent down = MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, x, y, 0);
            MotionEvent up   = MotionEvent.obtain(t, t + 50, MotionEvent.ACTION_UP,   x, y, 0);
            webView.dispatchTouchEvent(down);
            webView.dispatchTouchEvent(up);
            down.recycle();
            up.recycle();
        }, 2500);
    }

    private static byte[] readBytes(InputStream is) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        while ((n = is.read(chunk)) != -1) {
            buf.write(chunk, 0, n);
        }
        return buf.toByteArray();
    }
}
