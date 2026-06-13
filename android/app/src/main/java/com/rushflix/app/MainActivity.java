package com.rushflix.app;

import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private TokenRelayServer tokenRelayServer;
    private WebView overlayWebView;
    private boolean overlayVisible = false;
    private double pendingSeekTo = 0;

    // Injected into the overlay WebView after each page load via evaluateJavascript.
    // Runs as the top-level page (not a cross-origin iframe), so video.play() is
    // allowed directly by setMediaPlaybackRequiresUserGesture(false).
    private static final String OVERLAY_SCRIPT =
        "(function(){" +
        "var _v=null,_s=window._rushflixSeekTo||0;" +
        "function setup(v){" +
        "_v=v;window._rushflixVideo=v;" +
        "v.addEventListener('loadedmetadata',function(){" +
        "if(_s>0){v.currentTime=_s;_s=0;}" +
        "v.play().catch(function(){});" +
        "});" +
        "if(_s>0&&v.readyState>=1){v.currentTime=_s;_s=0;}" +
        "v.play().catch(function(){});" +
        "setInterval(function(){" +
        "if(!v.paused&&v.duration>0){" +
        "try{RushFlixProgress.report(v.currentTime,v.duration);}catch(e){}}" +
        "},5000);" +
        "}" +
        "function wait(){" +
        "var v=document.querySelector('video');" +
        "if(v){setup(v);return;}" +
        "new MutationObserver(function(m,obs){" +
        "var v=document.querySelector('video');" +
        "if(v){obs.disconnect();setup(v);}" +
        "}).observe(document.documentElement,{childList:true,subtree:true});" +
        "}" +
        "if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',wait);}else{wait();}" +
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
            overlayWebView.post(() -> overlayWebView.evaluateJavascript(
                "if(window._rushflixVideo){" +
                "window._rushflixVideo.currentTime=Math.max(0,Math.min(" +
                "window._rushflixVideo.currentTime+" + delta + "," +
                "window._rushflixVideo.duration||Infinity));}", null));
        }
    }

    // Exposed to the overlay WebView.
    // Injected script calls: RushFlixProgress.report(currentTime, duration)
    private class RushFlixProgress {
        private final WebView main;
        RushFlixProgress(WebView wv) { main = wv; }

        @JavascriptInterface
        public void report(double currentTime, double duration) {
            main.post(() -> main.evaluateJavascript(
                "window.postMessage({type:'rushflix_progress',currentTime:" +
                currentTime + ",duration:" + duration + "},'*')", null));
        }
    }

    private void setupOverlayWebView(WebView mainWebView) {
        overlayWebView = new WebView(this);
        WebSettings s = overlayWebView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);

        overlayWebView.setWebChromeClient(new WebChromeClient());
        overlayWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Inject seek position then run the autoplay + progress script
                view.evaluateJavascript(
                    "window._rushflixSeekTo=" + pendingSeekTo + ";" + OVERLAY_SCRIPT,
                    null);
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
                        overlayWebView.evaluateJavascript(
                            "if(window._rushflixVideo)" +
                            "window._rushflixVideo.currentTime=" +
                            "Math.max(0,window._rushflixVideo.currentTime-10);", null);
                        return true;
                    case KeyEvent.KEYCODE_DPAD_RIGHT:
                        overlayWebView.evaluateJavascript(
                            "if(window._rushflixVideo)" +
                            "window._rushflixVideo.currentTime=" +
                            "Math.min(window._rushflixVideo.currentTime+10," +
                            "window._rushflixVideo.duration||Infinity);", null);
                        return true;
                    case KeyEvent.KEYCODE_DPAD_CENTER:
                    case KeyEvent.KEYCODE_NUMPAD_ENTER:
                    case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                        // If video loaded: toggle play/pause.
                        // If not yet (player overlay visible): click center of screen
                        // which is where Videasy's play button sits.
                        overlayWebView.evaluateJavascript(
                            "(function(){" +
                            "if(window._rushflixVideo){" +
                            "if(window._rushflixVideo.paused)" +
                            "window._rushflixVideo.play().catch(function(){});" +
                            "else window._rushflixVideo.pause();" +
                            "}else{" +
                            "var cx=window.innerWidth/2,cy=window.innerHeight/2;" +
                            "var el=document.elementFromPoint(cx,cy);" +
                            "if(el){el.click();}" +
                            "}" +
                            "})()", null);
                        return true;
                    case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                        overlayWebView.evaluateJavascript(
                            "if(window._rushflixVideo)" +
                            "window._rushflixVideo.currentTime=" +
                            "Math.min(window._rushflixVideo.currentTime+30," +
                            "window._rushflixVideo.duration||Infinity);", null);
                        return true;
                    case KeyEvent.KEYCODE_MEDIA_REWIND:
                        overlayWebView.evaluateJavascript(
                            "if(window._rushflixVideo)" +
                            "window._rushflixVideo.currentTime=" +
                            "Math.max(0,window._rushflixVideo.currentTime-30);", null);
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
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.evaluateJavascript(
                "window.dispatchEvent(new KeyboardEvent('keydown'," +
                "{key:'GoBack',bubbles:true,cancelable:true}))", null);
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
