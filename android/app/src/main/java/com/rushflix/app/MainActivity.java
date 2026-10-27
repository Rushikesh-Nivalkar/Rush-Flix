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
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private TokenRelayServer tokenRelayServer;
    private WebView overlayWebView;
    private boolean overlayVisible = false;
    private volatile double pendingSeekTo = 0;
    // Players currently playing ("overlay", "live", "video"). While any is
    // playing the screen is kept on so the TV screensaver doesn't start.
    // UI thread only.
    private final Set<String> keepAwakeReasons = new HashSet<>();
    // Host of the embed URL currently loaded — top-level navigations elsewhere are ads.
    // volatile: read by shouldInterceptRequest on WebView network threads.
    private volatile String playerHost = null;
    // Drops ad/tracker requests made inside the player (assets/adblock/domains.txt).
    private final AdBlocker adBlocker = new AdBlocker();
    // True once PLAYER_SCRIPT found a <video> in any frame of the current player page.
    private volatile boolean videoAttached = false;
    // Remote is driving the player's own buttons/menus (set by PLAYER_SCRIPT).
    private volatile boolean controlsMode = false;
    // Autoplay next episode: episodes finished in a row with no remote press / tap.
    // At AUTOPLAY_LIMIT the next one waits behind "Are you still watching?".
    private static final int AUTOPLAY_LIMIT = 3;
    private volatile int autoStreak = 0;
    private volatile String lastEpisode = null;
    // URL the overlay player was opened with (…/tv/{id}/{s}/{e}); next episodes reuse it.
    private volatile String playerUrl = null;
    // Label of the next episode to open HELD behind the still-watching prompt ("" = none).
    private volatile String pendingHold = "";
    // Our own centre taps (landing Play button) must not count as "someone's watching".
    private volatile boolean syntheticTouch = false;
    // False when the WebView can't inject at document start → onPageFinished fallback.
    private boolean scriptInAllFrames = false;

    // Runs in EVERY frame of the overlay WebView (embed players nest the real
    // <video> inside cross-origin iframes, which evaluateJavascript can't reach).
    // - blocks window.open popups
    // - finds the <video>, autoplays it, reports progress via RushFlixProgress
    //   (Java interfaces are exposed to all frames)
    // - window.__rfCmd(action, value) applies toggle / seek_rel / seek_abs to this
    //   frame's video and relays the command to every child frame via postMessage
    // - each command carries an id and is applied once per frame: embed pages
    //   (Cineby / vsembed) also forward parent messages to their player frame, so
    //   without the id a toggle arrived twice (pause → instant resume)
    // - refuses <script src> from third-party throwaway-TLD hosts: the QR-scam ad
    //   loader arrives that way. Video streams also use such domains but via
    //   fetch/XHR, which stays allowed (blocking those domains outright broke playback)
    private static final String PLAYER_SCRIPT =
        "(function(){" +
        "if(window.__rfInit)return;window.__rfInit=1;" +
        "try{window.open=function(){return null;};}catch(e){}" +
        "var BAD=/\\.(cfd|cyou|sbs|space|rest|icu|buzz|quest|click|bond|mom|lol|autos|boats|yachts|motorcycles|beauty|hair|skin|makeup|pics|monster|cam)$/i;" +
        "function badSrc(u){try{var h=new URL(u,location.href).hostname;return h!==location.hostname&&BAD.test(h);}catch(e){return false;}}" +
        "try{var sd=Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype,'src');" +
        "Object.defineProperty(HTMLScriptElement.prototype,'src',{configurable:true,get:sd.get," +
        "set:function(u){if(badSrc(u)){this.type='rf/blocked';return;}sd.set.call(this,u);}});" +
        "var sa=Element.prototype.setAttribute;" +
        "Element.prototype.setAttribute=function(n,u){" +
        "if(this instanceof HTMLScriptElement&&String(n).toLowerCase()==='src'&&badSrc(u)){this.type='rf/blocked';return;}" +
        "return sa.apply(this,arguments);};}catch(e){}" +
        "var v=null,ctl=false,sel=-1,opener=null;" +
        // The player's own wrapper (Cineby: #player). Its show/hide timer runs on pointer
        // events, so wake() = synthetic pointermove → bar shows, 2.8 s auto-hide restarts.
        // Remote commands that bypass the player UI must wake() or the bar never hides.
        "function root(){return document.querySelector('#player')||(v&&v.parentElement)||document.body;}" +
        "var lastAct=0;" +
        "['pointermove','pointerdown','keydown'].forEach(function(t){document.addEventListener(t,function(){lastAct=Date.now();},true);});" +
        "function wake(){lastAct=Date.now();try{var r=root(),b=r.getBoundingClientRect();" +
        "r.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:b.left+b.width/2,clientY:b.top+b.height/2}));}catch(e){}}" +
        "function vis(e){var r=e.getBoundingClientRect();if(r.width<2||r.height<2)return false;" +
        "var cs=getComputedStyle(e);return cs.display!=='none'&&cs.visibility!=='hidden'&&cs.pointerEvents!=='none';}" +
        // Controls mode: remote highlight over the player's buttons / open menu items.
        "function items(){var ps=document.getElementById('rf-still')||document.getElementById('rf-next');if(ps)return [].slice.call(ps.querySelectorAll('button'));" +
        "var m=document.querySelector('.jw-menu.is-open');" +
        "var l=m?m.querySelectorAll('.jw-row,.jw-result,.jw-menu-close,button,select,input')" +
        ":document.querySelectorAll('#controls button.jw-btn,#rew,#bigPlay,#fwd,#upnextPlay,#upnextCancel');" +
        "return [].filter.call(l,function(e){return vis(e)&&!/^(airBtn|castBtn|fsBtn)$/.test(e.id);});}" +
        "function css(){if(document.getElementById('rf-st'))return;var s=document.createElement('style');s.id='rf-st';" +
        "s.textContent='.rf-focus{outline:3px solid #e50914!important;outline-offset:2px!important;border-radius:6px}';" +
        "(document.head||document.documentElement).appendChild(s);}" +
        "function mark(l){[].forEach.call(document.querySelectorAll('.rf-focus'),function(e){e.classList.remove('rf-focus');});" +
        "if(sel>=0&&l[sel]){l[sel].classList.add('rf-focus');try{l[sel].scrollIntoView({block:'nearest'});}catch(e){}}}" +
        "function setCtl(on){if(ctl===on)return;ctl=on;if(!on){sel=-1;mark([]);}" +
        "try{RushFlixProgress.controlsMode(on);}catch(e){}}" +
        "function ctlEnter(){wake();var l=items();if(!l.length)return;css();setCtl(true);" +
        "var p=l.indexOf(document.querySelector('#play'));if(p<0)p=l.indexOf(document.querySelector('#bigPlay'));" +
        "sel=p>=0?p:0;mark(l);}" +
        // dir: 1=left 2=right 3=up 4=down. Bar = left/right; open menu = up/down (left/right too).
        "function ctlMove(d){wake();var l=items();if(!l.length)return;" +
        "var cur=l.indexOf(document.querySelector('.rf-focus'));if(cur<0)cur=0;" +
        "var menu=!!document.querySelector('.jw-menu.is-open,#rf-still,#rf-next');" +
        "var st=menu?((d===2||d===4)?1:-1):(d===2?1:d===1?-1:0);" +
        "sel=Math.max(0,Math.min(l.length-1,cur+st));mark(l);}" +
        "function ctlOk(){var l=items(),e=document.querySelector('.rf-focus')||l[sel];if(!e)return;" +
        "if(!document.querySelector('.jw-menu.is-open'))opener=e;" +
        "if(e.tagName==='SELECT'){e.selectedIndex=(e.selectedIndex+1)%e.options.length;" +
        "e.dispatchEvent(new Event('change',{bubbles:true}));}else e.click();" +
        "setTimeout(function(){if(!ctl)return;var l2=items(),i=l2.indexOf(e);sel=i>=0?i:pick(l2);mark(l2);wake();},150);}" +
        // Menu just opened / rebuilt: start on its selected row, else its first row.
        "function pick(l){for(var i=0;i<l.length;i++)if(/(^|\\s)(active|selected|is-active)(\\s|$)/.test(l[i].className)||l[i].getAttribute('aria-checked')==='true')return i;" +
        "for(i=0;i<l.length;i++)if(!l[i].classList.contains('jw-menu-close'))return i;return 0;}" +
        // Back: close an open menu (player's own Escape handler) else leave controls mode.
        "function ctlBack(){if(document.getElementById('rf-still')){stillStop();return;}" +
        "var rn=document.getElementById('rf-no');if(rn){rn.click();return;}" +
        "if(document.querySelector('.jw-menu.is-open')){" +
        "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));" +
        "[].forEach.call(document.querySelectorAll('.jw-menu.is-open'),function(m){m.classList.remove('is-open');});" +
        "setTimeout(function(){var l=items();sel=Math.max(0,l.indexOf(opener));mark(l);wake();},120);" +
        "return;}setCtl(false);wake();}" +
        // Play/pause through the player's own button when it's showing (keeps its UI in sync).
        "function setPlaying(want){if(!v||want===!v.paused)return;var b=document.querySelector('#play');" +
        "if(b&&vis(b))b.click();else if(want)v.play().catch(function(){});else v.pause();}" +
        // ── Autoplay next episode, Netflix-style ──
        // Cineby's auto-next is switched on only so it works out WHICH episode is next
        // (it shows #upnext with the S/E). Its own in-place load is cancelled: its
        // single-use stream pass expires ~1 min after the page opens, so after a real
        // episode it failed (media unavailable / replayed the old episode). Instead the
        // app reloads the player on the next episode (fresh page, fresh pass) after our
        // own 8 s countdown. Java counts episodes finished with no remote press/tap; at
        // the limit the next episode is reloaded HELD (paused) behind the
        // Are-you-still-watching prompt — no timeout, it stays until Continue / Stop / Back.
        "var hold=false,nx=false,holdChecked=false;" +
        "function pad2(x){return (x<10?'0':'')+x;}" +
        "function box(id){var d=document.createElement('div');d.id=id;return d;}" +
        "function btn(id,label,bg){var x=document.createElement('button');x.id=id;x.textContent=label;" +
        "x.style.cssText='font-size:20px;padding:12px 28px;border:0;border-radius:8px;color:#fff;cursor:pointer;background:'+bg;return x;}" +
        "function goNext(s,e,h){try{RushFlixProgress.next(s,e,h);}catch(x){}}" +
        "function upNext(s,e){var d=box('rf-next'),t=8;" +
        "d.style.cssText='position:absolute;right:4%;bottom:14%;z-index:2147483647;background:#141414;border-radius:12px;padding:20px 24px;color:#fff;font-family:sans-serif;min-width:300px';" +
        "var h=document.createElement('div');h.style.cssText='font-size:16px;opacity:.75;margin-bottom:4px';h.textContent='Up next';" +
        "var n=document.createElement('div');n.style.cssText='font-size:24px;font-weight:700;margin-bottom:16px';n.textContent='S'+pad2(s)+' E'+pad2(e);" +
        "var a=document.createElement('div');a.style.cssText='display:flex;gap:12px';" +
        "var go=btn('rf-go','Play now ('+t+')','#e50914'),no=btn('rf-no','Cancel','#333');a.appendChild(go);a.appendChild(no);" +
        "d.appendChild(h);d.appendChild(n);d.appendChild(a);(document.getElementById('player')||document.body).appendChild(d);" +
        "var iv=setInterval(function(){t--;go.textContent='Play now ('+t+')';if(t<=0){clearInterval(iv);goNext(s,e,false);}},1000);" +
        "go.onclick=function(){clearInterval(iv);goNext(s,e,false);};" +
        "no.onclick=function(){clearInterval(iv);d.remove();setCtl(false);wake();};" +
        "css();setCtl(true);sel=0;mark(items());}" +
        "function still(label){if(document.getElementById('rf-still'))return;hold=true;" +
        "if(v&&!v.paused)v.pause();var nt=label||'';" +
        "var d=document.createElement('div');d.id='rf-still';" +
        "d.style.cssText='position:absolute;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);font-family:sans-serif';" +
        "var b=document.createElement('div');b.style.cssText='background:#141414;border-radius:12px;padding:32px 40px;text-align:center;color:#fff;max-width:80%';" +
        "var h=document.createElement('div');h.textContent='Are you still watching?';h.style.cssText='font-size:28px;font-weight:700;margin-bottom:8px';" +
        "var s=document.createElement('div');s.textContent=nt;s.style.cssText='font-size:18px;opacity:.75;margin-bottom:24px';" +
        "var a=document.createElement('div');a.style.cssText='display:flex;gap:16px;justify-content:center';" +
        "[['rf-cont','Continue watching','#e50914'],['rf-stop','Stop','#333']].forEach(function(o){var x=document.createElement('button');" +
        "x.id=o[0];x.textContent=o[1];x.style.cssText='font-size:20px;padding:12px 28px;border:0;border-radius:8px;color:#fff;cursor:pointer;background:'+o[2];a.appendChild(x);});" +
        "b.appendChild(h);b.appendChild(s);b.appendChild(a);d.appendChild(b);" +
        "(document.getElementById('player')||document.body).appendChild(d);" +
        "d.querySelector('#rf-cont').onclick=stillContinue;d.querySelector('#rf-stop').onclick=stillStop;" +
        "css();setCtl(true);sel=0;mark(items());}" +
        "function stillContinue(){var d=document.getElementById('rf-still');if(d)d.remove();hold=false;setCtl(false);" +
        "if(v)v.play().catch(function(){});wake();}" +
        "function stillStop(){try{RushFlixProgress.stop();}catch(e){}}" +
        "function apply(a,x){" +
        "if(!v)return;" +
        "if(hold&&(a==='toggle'||a==='play')){stillContinue();return;}" +
        "var rg=document.getElementById('rf-go');if(rg&&(a==='toggle'||a==='play')){rg.click();return;}" +
        "if(a==='toggle'){setPlaying(v.paused);wake();}" +
        "else if(a==='play'){setPlaying(true);wake();}" +
        "else if(a==='pause'){setPlaying(false);wake();}" +
        "else if(a==='seek_rel'){v.currentTime=Math.max(0,Math.min(v.currentTime+x,v.duration||Infinity));wake();}" +
        "else if(a==='seek_abs'){" +
        "if(v.readyState>=1)v.currentTime=x;" +
        "else v.addEventListener('loadedmetadata',function(){v.currentTime=x;},{once:true});}" +
        "else if(a==='ctl_enter'){ctlEnter();}" +
        "else if(a==='ctl_move'){if(ctl)ctlMove(x);}" +
        "else if(a==='ctl_ok'){if(ctl)ctlOk();}" +
        "else if(a==='ctl_back'){if(ctl)ctlBack();}" +
        "}" +
        "function relay(a,x,id){" +
        "var f=document.querySelectorAll('iframe');" +
        "for(var i=0;i<f.length;i++){" +
        "try{f[i].contentWindow.postMessage({__rf:1,action:a,value:x,id:id},'*');}catch(e){}}" +
        "}" +
        "var lastId=null;" +
        "window.__rfCmd=function(a,x,id){" +
        "id=id||(Date.now()+'-'+Math.random());" +
        "if(id===lastId)return;lastId=id;" +
        "apply(a,x);relay(a,x,id);};" +
        "window.addEventListener('message',function(e){" +
        "var d=e.data;if(d&&d.__rf===1)window.__rfCmd(d.action,d.value,d.id);" +
        // The player posts TV_STATE to its parent frame whenever its episode changes
        // (auto-next, its own episode menu) → the app saves progress under the right one.
        "else if(d&&d.type==='TV_STATE'&&d.season!=null&&d.episode!=null)" +
        "{try{RushFlixProgress.episode(Number(d.season),Number(d.episode));}catch(x){}}});" +
        "function setup(n){" +
        "if(v===n)return;v=n;window._rushflixVideo=n;" +
        // Keep the TV screen on only while this video is actually playing.
        "n.addEventListener('playing',function(){try{RushFlixProgress.playState(true);}catch(e){}});" +
        // The player hides its bar from ONE 2.8 s timer armed by pointer events, and skips
        // the hide if the video is paused when it fires (it never re-arms). Autoplay after
        // loadedmetadata / buffering often takes longer than that → bar stuck for good.
        // So: re-arm on every 'playing', plus a watchdog for any other stuck case.
        "n.addEventListener('playing',wake);" +
        "setInterval(function(){if(v===n&&!n.paused&&!document.querySelector('.jw-menu.is-open')&&" +
        "root().classList.contains('show-ui')&&Date.now()-lastAct>4000)wake();},1500);" +
        "['pause','ended','emptied','error'].forEach(function(t){" +
        "n.addEventListener(t,function(){try{RushFlixProgress.playState(false);}catch(e){}});});" +
        // Autoplay only once the player is ready. Our script sees the <video> before the
        // player's own script has attached its 'play' listener; playing that early left the
        // player thinking it was paused — on phones it then never showed its pause button.
        "if(n.readyState>=1){if(!hold)n.play().catch(function(){});}" +
        "else n.addEventListener('loadedmetadata',function(){if(!hold)n.play().catch(function(){});},{once:true});" +
        // Autoplay next: TV shows only (player frame of a series). The page sets CONFIG
        // after the <video> appears, so switch auto-next on from the 1 s check, not here.
        "n.addEventListener('ended',function(){try{RushFlixProgress.ended();}catch(e){}});" +
        "n.addEventListener('play',function(){if(hold)n.pause();});" +
        // This page was opened as the held episode (limit reached) → prompt over it.
        "function checkHold(){if(holdChecked||!document.getElementById('controls'))return;holdChecked=true;" +
        "var lab='';try{lab=RushFlixProgress.takeHold();}catch(e){}if(lab)still(lab);}" +
        "checkHold();" +
        "setInterval(function(){checkHold();" +
        "try{var C=window.CONFIG;if(C&&C.mediaType==='tv'&&C.streamBase&&!C.autoNext)C.autoNext=true;}catch(e){}" +
        "var un=document.getElementById('upnext');" +
        "if(v!==n||nx||hold||!un||getComputedStyle(un).display==='none')return;" +
        "var m=((document.getElementById('upnextTitle')||{}).textContent||'').match(/S\\s*0*(\\d+)\\s*E\\s*0*(\\d+)/i);" +
        "if(!m)return;nx=true;var cb=document.getElementById('upnextCancel');if(cb)cb.click();" +
        "var s=+m[1],e=+m[2],ok=true;try{ok=RushFlixProgress.autoNextAllowed();}catch(x){}" +
        "if(ok)upNext(s,e);else goNext(s,e,true);},1000);" +
        // Leave controls mode when the player hides its bar (no menu / prompt open).
        "try{var ro=root();new MutationObserver(function(){" +
        "if(ctl&&!ro.classList.contains('show-ui')&&!document.querySelector('.jw-menu.is-open,#rf-still,#rf-next'))setCtl(false);" +
        "}).observe(ro,{attributes:true,attributeFilter:['class']});}catch(e){}" +
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

        // Back pressed on the Home screen (App.jsx rushflix:backButton handler).
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(() -> finish());
        }

        // Live TV / direct-video players (src/utils/platform.js keepAwake).
        @JavascriptInterface
        public void setKeepAwake(String reason, boolean on) {
            updateKeepAwake(reason, on);
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
        public void playState(boolean playing) {
            updateKeepAwake("overlay", playing);
        }

        @JavascriptInterface
        public void controlsMode(boolean on) {
            controlsMode = on;
        }

        // The player switched episode in place (auto-next or its own episode menu).
        @JavascriptInterface
        public void episode(int season, int episode) {
            String key = season + "x" + episode;
            if (key.equals(lastEpisode)) return;
            lastEpisode = key;
            main.post(() -> main.evaluateJavascript(
                "window.postMessage({type:'rushflix_episode',season:" + season +
                ",episode:" + episode + "},'*')", null));
        }

        @JavascriptInterface
        public void ended() {
            autoStreak++;
            Log.d(TAG, "Episode ended, autoplay streak " + autoStreak);
        }

        @JavascriptInterface
        public boolean autoNextAllowed() {
            return autoStreak < AUTOPLAY_LIMIT;
        }
        // Autoplay: open the next episode in a fresh player page. Cineby's in-place
        // switch can't be used — its single-use stream pass expires about a minute
        // after the page loads. holdIt = limit reached: open it paused behind the prompt.
        @JavascriptInterface
        public void next(int season, int episode, boolean holdIt) {
            episode(season, episode);
            runOnUiThread(() -> loadNextEpisode(season, episode, holdIt));
        }

        // Read once by the new page's player frame: non-empty = show the prompt, held.
        @JavascriptInterface
        public String takeHold() {
            String h = pendingHold;
            pendingHold = "";
            return h;
        }

        // "Are you still watching?" → Stop: leave the player.
        @JavascriptInterface
        public void stop() {
            runOnUiThread(MainActivity.this::hidePlayerOverlay);
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

    // Keeps the screen on (no TV screensaver) while any player reports it's playing.
    // Paused / closed players release it, so a long pause still lets the TV sleep.
    private void updateKeepAwake(String reason, boolean on) {
        runOnUiThread(() -> {
            boolean changed = on ? keepAwakeReasons.add(reason) : keepAwakeReasons.remove(reason);
            if (!changed) return;
            if (keepAwakeReasons.isEmpty()) {
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            Log.d(TAG, "Keep screen on: " + !keepAwakeReasons.isEmpty() + " " + keepAwakeReasons);
        });
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
        syntheticTouch = true;
        overlayWebView.dispatchTouchEvent(down);
        overlayWebView.dispatchTouchEvent(up);
        syntheticTouch = false;
        down.recycle();
        up.recycle();
    }

    // Autoplay next: reload the player on …/tv/{id}/{season}/{episode} and press the
    // landing page's Play for the viewer (it needs a tap before the video exists).
    private void loadNextEpisode(int season, int episode, boolean holdIt) {
        if (!overlayVisible || overlayWebView == null || playerUrl == null) return;
        String url = playerUrl.replaceFirst("/tv/(\\d+)/\\d+/\\d+", "/tv/$1/" + season + "/" + episode);
        if (url.equals(playerUrl)) return; // not a series URL
        Log.d(TAG, "Autoplay next → " + url + (holdIt ? " (held)" : ""));
        playerUrl = url;
        pendingHold = holdIt ? String.format(Locale.US, "S%02d E%02d", season, episode) : "";
        pendingSeekTo = 0;
        videoAttached = false;
        controlsMode = false;
        overlayWebView.loadUrl(url);
        autoTap(0);
    }

    private void autoTap(int attempt) {
        overlayWebView.postDelayed(() -> {
            if (!overlayVisible || videoAttached || attempt >= 6) return;
            tapPlayerCentre();
            autoTap(attempt + 1);
        }, 2500);
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
            // Every request from every frame of the player (scripts, frames, trackers)
            // is checked against the blocklist; ads get an empty response.
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String host = request.getUrl().getHost();
                if (adBlocker.isBlocked(host, playerHost)) {
                    Log.d(TAG, "Blocked ad request: " + host);
                    return adBlocker.emptyResponse();
                }
                return super.shouldInterceptRequest(view, request);
            }

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

        // Phone: a tap on the player also counts as "someone's watching".
        overlayWebView.setOnTouchListener((view, ev) -> {
            if (ev.getActionMasked() == MotionEvent.ACTION_DOWN && !syntheticTouch) autoStreak = 0;
            return false;
        });

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
        controlsMode = false;
        autoStreak = 0;
        lastEpisode = null;
        playerUrl = url;
        pendingHold = "";
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
        controlsMode = false;
        playerHost = null;
        updateKeepAwake("overlay", false);
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

        adBlocker.loadAsync(this);
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
                autoStreak = 0; // someone's watching: any press restarts the autoplay count
                // Controls mode (Up/Down): the arrows move a highlight over the player's
                // own buttons and menus (CC, quality…); OK presses, Back closes/leaves.
                switch (event.getKeyCode()) {
                    case KeyEvent.KEYCODE_BACK:
                        if (controlsMode) sendPlayerCommand("ctl_back", 0);
                        else hidePlayerOverlay();
                        return true;
                    case KeyEvent.KEYCODE_DPAD_UP:
                        if (controlsMode) sendPlayerCommand("ctl_move", 3);
                        else if (videoAttached) sendPlayerCommand("ctl_enter", 0);
                        return true;
                    case KeyEvent.KEYCODE_DPAD_DOWN:
                        if (controlsMode) sendPlayerCommand("ctl_move", 4);
                        else if (videoAttached) sendPlayerCommand("ctl_enter", 0);
                        return true;
                    case KeyEvent.KEYCODE_DPAD_LEFT:
                        if (controlsMode) sendPlayerCommand("ctl_move", 1);
                        else sendPlayerCommand("seek_rel", -10);
                        return true;
                    case KeyEvent.KEYCODE_DPAD_RIGHT:
                        if (controlsMode) sendPlayerCommand("ctl_move", 2);
                        else sendPlayerCommand("seek_rel", 10);
                        return true;
                    case KeyEvent.KEYCODE_DPAD_CENTER:
                    case KeyEvent.KEYCODE_ENTER:
                    case KeyEvent.KEYCODE_NUMPAD_ENTER:
                        if (controlsMode) {
                            sendPlayerCommand("ctl_ok", 0);
                            return true;
                        }
                        // fall through: OK without controls mode = play/pause
                    case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                        // Video found: toggle play/pause in whichever frame holds it.
                        // Not yet: tap the centre, where the embed player's play button sits.
                        if (videoAttached) sendPlayerCommand("toggle", 0);
                        else tapPlayerCentre();
                        return true;
                    case KeyEvent.KEYCODE_MEDIA_PLAY:
                        if (videoAttached) sendPlayerCommand("play", 0);
                        else tapPlayerCentre();
                        return true;
                    case KeyEvent.KEYCODE_MEDIA_PAUSE:
                        sendPlayerCommand("pause", 0);
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
