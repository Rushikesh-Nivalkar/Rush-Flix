package com.rushflix.app;

import android.content.Context;
import android.util.Log;
import android.webkit.WebResourceResponse;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Locale;

/**
 * Blocks ad/tracker requests made inside the overlay player WebView.
 *
 * The list (assets/adblock/domains.txt) is HaGeZi Pro + scripts/adblock-custom.txt,
 * refreshed with `npm run update:blocklist`. A listed domain also blocks its
 * subdomains. ~200k domains are kept as a sorted array of 64-bit FNV-1a hashes
 * (~1.6 MB) instead of Strings, so it stays light on Fire TV sticks.
 *
 * Video streams come from throwaway domains too, so nothing is blocked by
 * pattern here — only by exact list entry. Script-level blocking of ad loaders
 * lives in PLAYER_SCRIPT (MainActivity).
 */
final class AdBlocker {
    private static final String TAG = "AdBlocker";
    private static final String ASSET = "adblock/domains.txt";

    // Hosts the player needs — never blocked, even if a list ever includes them.
    private static final String[] NEVER = {
        "cineby.homes", "cloudorchestranova.com", "vsembed.ru", "vidsrc.sh", "vidapi.cloud",
        "themoviedb.org", "tmdb.org", "jsdelivr.net", "opensubtitles.org",
    };

    private volatile long[] hashes = new long[0];

    /** Loads the list off the UI thread; requests pass through until it's ready. */
    void loadAsync(Context context) {
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            long start = System.currentTimeMillis();
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(app.getAssets().open(ASSET), StandardCharsets.UTF_8), 1 << 16)) {
                long[] buf = new long[1 << 18];
                int n = 0;
                String line;
                while ((line = r.readLine()) != null) {
                    line = line.trim();
                    if (line.isEmpty() || line.charAt(0) == '#') continue;
                    if (n == buf.length) buf = Arrays.copyOf(buf, n * 2);
                    buf[n++] = fnv(line.toLowerCase(Locale.ROOT));
                }
                long[] sorted = Arrays.copyOf(buf, n);
                Arrays.sort(sorted);
                hashes = sorted;
                Log.i(TAG, "Blocklist loaded: " + n + " domains in " + (System.currentTimeMillis() - start) + " ms");
            } catch (Exception e) {
                Log.e(TAG, "Blocklist load failed — ad blocking off", e);
            }
        }, "adblock-load").start();
    }

    /** True if host (or any parent domain) is listed. allowHost = the player page's own host. */
    boolean isBlocked(String host, String allowHost) {
        if (host == null || host.isEmpty()) return false;
        host = host.toLowerCase(Locale.ROOT);
        if (allowHost != null && (host.equals(allowHost) || host.endsWith("." + allowHost))) return false;
        for (String n : NEVER) if (host.equals(n) || host.endsWith("." + n)) return false;
        long[] h = hashes;
        if (h.length == 0) return false;
        String d = host;
        while (true) {
            if (Arrays.binarySearch(h, fnv(d)) >= 0) return true;
            int dot = d.indexOf('.');
            if (dot < 0) return false;
            d = d.substring(dot + 1);
            if (d.indexOf('.') < 0) return false; // stop at the bare TLD
        }
    }

    /** Empty 204 — the page sees a request that returned nothing. */
    WebResourceResponse emptyResponse() {
        return new WebResourceResponse("text/plain", "utf-8", 204, "No Content",
            new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }

    // 64-bit FNV-1a
    private static long fnv(String s) {
        long h = 0xcbf29ce484222325L;
        for (int i = 0; i < s.length(); i++) {
            h ^= s.charAt(i);
            h *= 0x100000001b3L;
        }
        return h;
    }
}
