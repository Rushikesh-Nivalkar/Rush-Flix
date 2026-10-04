package com.rushflix.app;

import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.os.SystemClock;
import android.util.Log;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import java.util.Collections;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private TokenRelayServer tokenRelayServer;
    private WebView overlayWebView;
    private boolean overlayVisible = false;
    private volatile double pendingSeekTo = 0;
    // Host of the embed URL currently loaded — top-level navigations elsewhere are ads.
    private String playerHost = null;
    // True once PLAYER_SCRIPT found a <video> in any frame of the current player page.
    private volatile boolean videoAttached = false;
    // False when the WebView can't inject at document start → onPageFinished fallback.
    private boolean scriptInAllFrames = false;

    // Runs in EVERY frame of the overlay WebView (embed players nest the real
    // <video> inside cross-origin iframes, which evaluateJavascript can't reach).
    // - blocks window.open popups
    // - finds the <video>, autoplays it, reports progress via RushFlixProgress
    //   (Java interfaces are exposed to all frames)
    // - window.__rfCmd(action, value) applies toggle / seek_rel / seek_abs to this
    //   frame's video and relays the command to every child frame via postMessage
    private static final String PLAYER_SCRIPT =
        "(function(){" +
        "if(window.__rfInit)return;window.__rfInit=1;" +
        "try{window.open=function(){return null;};}catch(e){}" +
        "var v=null;" +
        "function apply(a,x){" +
        "if(!v)return;" +
        "if(a==='toggle'){if(v.paused)v.play().catch(function(){});else v.pause();}" +
        "else if(a==='seek_rel'){v.currentTime=Math.max(0,Math.min(v.currentTime+x,v.duration||Infinity));}" +
        "else if(a==='seek_abs'){" +
        "if(v.readyState>=1)v.currentTime=x;" +
        "else v.addEventListener('loadedmetadata',function(){v.currentTime=x;},{once:true});}" +
        "}" +
        "function relay(a,x){" +
        "var f=document.querySelectorAll('iframe');" +
        "for(var i=0;i<f.length;i++){" +
        "try{f[i].contentWindow.postMessage({__rf:1,action:a,value:x},'*');}catch(e){}}" +
        "}" +
        "window.__rfCmd=function(a,x){apply(a,x);relay(a,x);};" +
        "window.addEventListener('message',function(e){" +
        "var d=e.data;if(d&&d.__rf===1)window.__rfCmd(d.action,d.value);});" +
        "function setup(n){" +
        "if(v===n)return;v=n;window._rushflixVideo=n;" +
        "n.play().catch(function(){});" +
        "try{RushFlixProgress.videoReady();}catch(e){}" +
        "setInterval(function(){" +
        "if(v===n&&!n.paused&&n.duration>0){" +
        "try{RushFlixProgress.report(n.currentTime,n.duration);}catch(e){}}" +
        "},5000);" +
        "}" +
        "function find(){var n=document.querySelector('video');if(n)setup(n);}" +
        "new MutationObserver(find).observe(document,{childList:true,subtree:true});" +
        "find();" +
        "})()";

    // Exposed to the Rush Flix React app (main WebView).
    // JS calls: window.RushFlixBridge.openPlayer(url, seekTo)
    private class RushFlixBridge {
        @JavascriptInterface
        public void openPlayer(String url, double seekTo) {
            Log.d(TAG, "RushFlixBridge.openPlayer called: " + url);
            runOnUiThread(() -> showPlayerOverlay(url, seekTo));
        }

        @JavascriptInterface
        public void closePlayer() {
            runOnUiThread(() -> hidePlayerOverlay());
        }

        @JavascriptInterface
        public void seekRelative(double delta) {
            if (!overlayVisible || overlayWebView == null) return;
            sendPlayerCommand("seek_rel", delta);
        }
    }

    // Exposed to every frame of the overlay WebView.
    // PLAYER_SCRIPT calls: RushFlixProgress.videoReady() / report(currentTime, duration)
    private class RushFlixProgress {
        private final WebView main;
        RushFlixProgress(WebView wv) { main = wv; }

        @JavascriptInterface
        public void report(double currentTime, double duration) {
            main.post(() -> main.evaluateJavascript(
                "window.postMessage({type:'rushflix_progress',currentTime:" +
                currentTime + ",duration:" + duration + "},'*')", null));
        }

        @JavascriptInterface
        public void videoReady() {
            videoAttached = true;
            // Resume position: applied once, as soon as the first video appears.
            if (pendingSeekTo > 0) {
                double seekTo = pendingSeekTo;
                pendingSeekTo = 0;
                sendPlayerCommand("seek_abs", seekTo);
            }
        }
    }

    // Runs a PLAYER_SCRIPT command in the top frame; __rfCmd relays it to all child frames.
    private void sendPlayerCommand(String action, double value) {
        if (overlayWebView == null) return;
        overlayWebView.post(() -> {
            if (overlayWebView == null) return;
            overlayWebView.evaluateJavascript(
                "window.__rfCmd&&window.__rfCmd('" + action + "'," + value + ")", null);
        });
    }

    // Real touch at the centre of the player — passes through nested iframes like a
    // finger tap, so it hits the embed player's own Play button.
    private void tapPlayerCentre() {
        float x = overlayWebView.getWidth() / 2f;
        float y = overlayWebView.getHeight() / 2f;
        long t = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(t, t, MotionEvent.ACTION_DOWN, x, y, 0);
        MotionEvent up = MotionEvent.obtain(t, t + 50, MotionEvent.ACTION_UP, x, y, 0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        overlayWebView.dispatchTouchEvent(down);
        overlayWebView.dispatchTouchEvent(up);
        down.recycle();
        up.recycle();
    }

    private void setupOverlayWebView(WebView mainWebView) {
        overlayWebView = new WebView(this);
        WebSettings s = overlayWebView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        // Popups: with multiple windows supported, window.open goes to onCreateWindow
        // (which refuses it) instead of replacing the player page.
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false);

        // Embed players run in third-party iframes and need cookies (Cloudflare
        // challenge, player session). WebView blocks third-party cookies by default.
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(overlayWebView, true);

        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(
                overlayWebView, PLAYER_SCRIPT, Collections.singleton("*"));
            scriptInAllFrames = true;
        }

        overlayWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                                          boolean isUserGesture, Message resultMsg) {
                Log.d(TAG, "Blocked popup window from player");
                return false;
            }
        });
        overlayWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame() || request.isRedirect()) return false;
                Uri uri = request.getUrl();
                if ("about".equals(uri.getScheme())) return false;
                String host = uri.getHost();
                if (host != null && host.equals(playerHost)) return false;
                // Ad scripts navigate the whole player page away — keep the player.
                Log.d(TAG, "Blocked player redirect to " + uri);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Fallback for old WebViews: top frame only.
                if (!scriptInAllFrames) view.evaluateJavascript(PLAYER_SCRIPT, null);
            }
        });
        overlayWebView.addJavascriptInterface(
            new RushFlixProgress(mainWebView), "RushFlixProgress");

        overlayWebView.setVisibility(View.GONE);
        // Add to decor view root — guaranteed full-screen, always above Capacitor's layout
        ViewGroup decorView = (ViewGroup) getWindow().getDecorView();
        decorView.addView(overlayWebView,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void showPlayerOverlay(String url, double seekTo) {
        if (overlayWebView == null) return;
        Log.d(TAG, "showPlayerOverlay: " + url + " seekTo=" + seekTo);
        pendingSeekTo = seekTo;
        videoAttached = false;
        playerHost = Uri.parse(url).getHost();
        overlayWebView.setVisibility(View.VISIBLE);
        overlayWebView.bringToFront();
        overlayWebView.loadUrl(url);
        overlayWebView.requestFocus();
        overlayVisible = true;
    }

    private void hidePlayerOverlay() {
        if (overlayWebView == null) return;
        overlayWebView.loadUrl("about:blank");
        overlayWebView.setVisibility(View.GONE);
        overlayVisible = false;
        videoAttached = false;
        playerHost = null;
        getBridge().getWebView().requestFocus();
        // Tell React the player was closed (e.g. via Back button)
        getBridge().getWebView().post(() ->
            getBridge().getWebView().evaluateJavascript(
                "window.postMessage({type:'rushflix_player_closed'},'*')", null));
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.requestFocus();
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);

        // Register bridge so React JS can call openPlayer / closePlayer / seekRelative
        webView.addJavascriptInterface(new RushFlixBridge(), "RushFlixBridge");
        // Register APK updater — JS calls window.RushFlixUpdater.downloadAndInstall(url)
        webView.addJavascriptInterface(new ApkUpdaterPlugin(this, webView), "RushFlixUpdater");

        setupOverlayWebView(webView);

        try {
            tokenRelayServer = new TokenRelayServer();
        } catch (Exception e) {
            Log.e(TAG, "Failed to start token relay server", e);
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            // ── Overlay visible: control the embed player directly ──────────
            if (overlayVisible && overlayWebView != null) {
                switch (event.getKeyCode()) {
                    case KeyEvent.KEYCODE_BACK:
                        hidePlayerOverlay();
                        return true;
                    case KeyEvent.KEYCODE_DPAD_LEFT:
                        sendPlayerCommand("seek_rel", -10);
                        return true;
                    case KeyEvent.KEYCODE_DPAD_RIGHT:
                        sendPlayerCommand("seek_rel", 10);
                        return true;
                    case KeyEvent.KEYCODE_DPAD_CENTER:
                    case KeyEvent.KEYCODE_NUMPAD_ENTER:
                    case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                        // Video found: toggle play/pause in whichever frame holds it.
                        // Not yet: tap the centre, where the embed player's play button sits.
                        if (videoAttached) sendPlayerCommand("toggle", 0);
                        else tapPlayerCentre();
                        return true;
                    case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                        sendPlayerCommand("seek_rel", 30);
                        return true;
                    case KeyEvent.KEYCODE_MEDIA_REWIND:
                        sendPlayerCommand("seek_rel", -30);
                        return true;
                    default:
                        return true; // consume all other keys while overlay is up
                }
            }

            // ── Main WebView: inject synthetic keyboard events into React ───
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
                        webView.evaluateJavascript(
                            "(function(){var el=document.activeElement;" +
                            "if(el&&el!==document.body){el.click();" +
                            "el.dispatchEvent(new KeyboardEvent('keydown'," +
                            "{key:'Enter',bubbles:true,cancelable:true}));}})()", null);
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
            "(function(){var el=document.activeElement||document.body;" +
            "el.dispatchEvent(new KeyboardEvent('keydown'," +
            "{key:'" + key + "',bubbles:true,cancelable:true}));})()", null);
    }

    @Override
    public void onBackPressed() {
        if (overlayVisible) {
            hidePlayerOverlay();
            return;
        }
        // Calling super.onBackPressed() in Capacitor 8 calls finish() directly.
        // Instead, fire a custom JS event — App.jsx handles all navigation cases.
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.post(() -> webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('rushflix:backButton'))", null));
        } else {
            super.onBackPressed();
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (overlayWebView != null) {
            overlayWebView.destroy();
            overlayWebView = null;
        }
        if (tokenRelayServer != null) {
            tokenRelayServer.stop();
            tokenRelayServer = null;
        }
    }
}
