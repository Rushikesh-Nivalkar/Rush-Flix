package com.rushflix.app;

import android.util.Log;
import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Map;
import fi.iki.elonen.NanoHTTPD;

public class TokenRelayServer extends NanoHTTPD {
    private static final String TAG = "TokenRelayServer";
    private volatile String pendingToken = null;

    public TokenRelayServer() throws IOException {
        super(8080);
        start(SOCKET_READ_TIMEOUT, false);
        Log.i(TAG, "Token relay server started on port 8080");
    }

    @Override
    public Response serve(IHTTPSession session) {
        String uri = session.getUri();
        Method method = session.getMethod();

        // CORS preflight
        if (method == Method.OPTIONS) {
            return cors(newFixedLengthResponse(Response.Status.OK, "text/plain", ""));
        }

        // GET /api/my-ip — returns device's LAN IP so React can build the QR URL
        if (uri.equals("/api/my-ip") && method == Method.GET) {
            String ip = getLocalIpAddress();
            String json = ip != null ? "{\"ip\":\"" + ip + "\"}" : "{\"ip\":null}";
            return cors(newFixedLengthResponse(Response.Status.OK, "application/json", json));
        }

        // GET /api/token-status — TV polls this while QR screen is showing
        if (uri.equals("/api/token-status") && method == Method.GET) {
            String json = pendingToken != null
                ? "{\"token\":\"" + pendingToken.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}"
                : "{\"token\":null}";
            return cors(newFixedLengthResponse(Response.Status.OK, "application/json", json));
        }

        // POST /api/submit-token — phone submits the TMDB token
        if (uri.equals("/api/submit-token") && method == Method.POST) {
            try {
                Map<String, String> body = new HashMap<>();
                session.parseBody(body);
                String postBody = body.get("postData");
                if (postBody != null) {
                    int keyIdx = postBody.indexOf("\"token\"");
                    if (keyIdx >= 0) {
                        int start = postBody.indexOf("\"", keyIdx + 7) + 1;
                        int end = postBody.indexOf("\"", start);
                        if (start > 0 && end > start) {
                            pendingToken = postBody.substring(start, end);
                            Log.i(TAG, "Token received from phone");
                        }
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Error parsing token body", e);
            }
            return cors(newFixedLengthResponse(Response.Status.OK, "application/json", "{\"ok\":true}"));
        }

        // GET /?setup=phone (or any non-API path) — serve phone token entry form
        if (method == Method.GET) {
            return cors(newFixedLengthResponse(Response.Status.OK, "text/html; charset=utf-8", getPhoneSetupHtml()));
        }

        return cors(newFixedLengthResponse(Response.Status.NOT_FOUND, "application/json", "{\"error\":\"not found\"}"));
    }

    private Response cors(Response r) {
        r.addHeader("Access-Control-Allow-Origin", "*");
        r.addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        r.addHeader("Access-Control-Allow-Headers", "Content-Type");
        return r;
    }

    private String getLocalIpAddress() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface iface = interfaces.nextElement();
                if (!iface.isUp() || iface.isLoopback()) continue;
                Enumeration<InetAddress> addresses = iface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress addr = addresses.nextElement();
                    if (!addr.isLoopbackAddress() && addr instanceof Inet4Address) {
                        return addr.getHostAddress();
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error getting local IP", e);
        }
        return null;
    }

    public void clear() {
        pendingToken = null;
    }

    private String getPhoneSetupHtml() {
        return "<!DOCTYPE html><html><head><meta charset='utf-8'>" +
            "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
            "<title>Rush Flix — Add TMDB Token</title>" +
            "<style>*{box-sizing:border-box;margin:0;padding:0}" +
            "body{background:#0a0a0a;color:#fff;font-family:system-ui,sans-serif;" +
            "display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}" +
            ".card{background:#1a1a1a;border-radius:16px;padding:32px 24px;max-width:480px;width:100%;text-align:center}" +
            ".logo{font-size:20px;font-weight:900;letter-spacing:.15em;color:#e50914;margin-bottom:16px}" +
            "h1{font-size:20px;font-weight:700;margin:0 0 16px}" +
            "p{font-size:14px;color:#aaa;line-height:1.7;margin-bottom:20px;text-align:left}" +
            "a{color:#e50914}" +
            "textarea{width:100%;background:#111;border:1px solid #333;border-radius:8px;" +
            "color:#fff;font-size:13px;padding:12px;resize:vertical;font-family:monospace}" +
            ".err{color:#e50914;font-size:13px;margin:10px 0 0;text-align:left;display:none}" +
            "button{margin-top:20px;width:100%;background:#e50914;color:#fff;border:none;" +
            "border-radius:8px;padding:16px;font-size:16px;font-weight:700;cursor:pointer}" +
            ".done{padding:24px 0;display:none}" +
            ".check{font-size:52px;color:#22c55e;margin-bottom:12px}" +
            ".done p{color:#aaa;font-size:16px;text-align:center}</style></head>" +
            "<body><div class='card'>" +
            "<div class='logo'>RUSH · FLIX</div>" +
            "<div id='form'>" +
            "<h1>Add TMDB Token</h1>" +
            "<p>Go to <a href='https://www.themoviedb.org/settings/api' target='_blank'>themoviedb.org → Settings → API</a>" +
            " and copy the <strong>API Read Access Token</strong> (long JWT starting with eyJ…).</p>" +
            "<textarea id='t' rows='5' placeholder='Paste token here (eyJ…)'></textarea>" +
            "<p class='err' id='err'>Could not reach TV. Make sure phone and TV are on the same Wi-Fi.</p>" +
            "<button onclick='send()' id='btn'>Send to TV</button>" +
            "</div>" +
            "<div class='done' id='done'>" +
            "<div class='check'>✓</div>" +
            "<p>Token received. Check your TV — it should load now.</p>" +
            "</div></div>" +
            "<script>" +
            "async function send(){" +
            "var t=document.getElementById('t').value.trim();" +
            "if(!t)return;" +
            "var btn=document.getElementById('btn'),err=document.getElementById('err');" +
            "btn.textContent='Sending…';btn.disabled=true;err.style.display='none';" +
            "try{" +
            "var r=await fetch('/api/submit-token',{method:'POST'," +
            "headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t})});" +
            "if(r.ok){document.getElementById('form').style.display='none';" +
            "document.getElementById('done').style.display='block';}" +
            "else{throw new Error();}" +
            "}catch(e){" +
            "err.style.display='block';btn.textContent='Send to TV';btn.disabled=false;" +
            "}}" +
            "</script></body></html>";
    }
}
