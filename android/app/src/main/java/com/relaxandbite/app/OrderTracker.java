package com.relaxandbite.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The order tracker on the lock screen: one notification that stays while an
 * order is on its way (placed, accepted, cooking, rider on the way) and updates
 * itself, then says "Delivered" and goes away on its own.
 *
 * The order page starts it (only when the person allows notifications). After
 * that the app asks our site for updates every 30 seconds, even when the page
 * or the app is closed, for as long as the phone keeps the app running.
 * On Android 16 phones it also shows as a Live Update (Samsung: the Now Bar).
 */
final class OrderTracker {

    private static final String CHANNEL = "order_tracker";
    private static final int NOTIFICATION_ID = 4210;
    private static final int ORANGE = Color.parseColor("#EF4444"); // brand red (name kept)
    private static final long POLL_EVERY = 30_000;
    /** Stop after this long, whatever happens (an order is never this slow) */
    private static final long GIVE_UP_AFTER = 3 * 60 * 60 * 1000L;
    private static final String PREFS = "order_tracker";

    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static final ExecutorService net = Executors.newSingleThreadExecutor();

    private static String code = null;
    private static String api = null;
    private static long startedAt = 0;
    private static String lastShown = null;

    private OrderTracker() {}

    /**
     * From the order page. siteBase is our site's address (e.g. https://relaxandbite.com);
     * the update address must be on it.
     */
    static void update(Context context, String siteBase, String json) {
        Context app = context.getApplicationContext();
        try {
            JSONObject o = new JSONObject(json);
            String c = o.optString("code", "");
            String a = o.optString("api", "");
            boolean finished = o.optBoolean("final", false);
            if (c.isEmpty() || siteBase == null || !a.startsWith(siteBase + "/api/orders/")) return;
            // A finished order we weren't tracking (looking back at an old order): nothing to show
            if (finished && !c.equals(code)) return;
            if (!c.equals(code)) {
                code = c;
                startedAt = System.currentTimeMillis();
                lastShown = null;
            }
            api = a;
            remember(app);
            if (!finished) askOnce(context);
            show(app, o);
            if (finished) stop(app, false);
            else schedulePoll(app);
        } catch (Exception ignored) {
            // Bad data from the page: leave things as they are
        }
    }

    /** When the app starts: pick up an order that was being tracked before it was closed. */
    static void resume(Context context) {
        Context app = context.getApplicationContext();
        if (code != null) return;
        SharedPreferences p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String c = p.getString("code", null);
        String a = p.getString("api", null);
        long started = p.getLong("startedAt", 0);
        if (c == null || a == null) return;
        if (System.currentTimeMillis() - started > GIVE_UP_AFTER) {
            stop(app, true);
            return;
        }
        code = c;
        api = a;
        startedAt = started;
        schedulePoll(app);
        handler.post(() -> poll(app)); // fresh straight away
    }

    /**
     * Android 13+: notifications need the person's OK. Asked once, the first time
     * they follow an order; if they say yes, the tracker shows on the next update.
     */
    private static void askOnce(Context context) {
        if (Build.VERSION.SDK_INT < 33 || !(context instanceof Activity)) return;
        Context app = context.getApplicationContext();
        if (NotificationManagerCompat.from(app).areNotificationsEnabled()) return;
        SharedPreferences p = app.getSharedPreferences(PREFS + "_ask", Context.MODE_PRIVATE);
        if (p.getBoolean("asked", false)) return;
        p.edit().putBoolean("asked", true).apply();
        ActivityCompat.requestPermissions((Activity) context, new String[] { Manifest.permission.POST_NOTIFICATIONS }, 4211);
    }

    private static void remember(Context app) {
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("code", code).putString("api", api).putLong("startedAt", startedAt).apply();
    }

    /** Stops updating. clear: also take the notification away. */
    private static void stop(Context app, boolean clear) {
        handler.removeCallbacksAndMessages(null);
        if (clear) NotificationManagerCompat.from(app).cancel(NOTIFICATION_ID);
        code = null;
        api = null;
        lastShown = null;
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
    }

    private static void schedulePoll(Context app) {
        handler.removeCallbacksAndMessages(null);
        handler.postDelayed(() -> poll(app), POLL_EVERY);
    }

    private static void poll(Context app) {
        final String c = code;
        final String a = api;
        if (c == null || a == null) return;
        if (System.currentTimeMillis() - startedAt > GIVE_UP_AFTER) {
            stop(app, true);
            return;
        }
        net.execute(() -> {
            int status = 0;
            String body = null;
            HttpURLConnection http = null;
            try {
                http = (HttpURLConnection) new URL(a).openConnection();
                http.setConnectTimeout(10_000);
                http.setReadTimeout(10_000);
                // Signed in as the person who placed the order (the app's own cookies)
                String cookies = CookieManager.getInstance().getCookie(a);
                if (cookies != null) http.setRequestProperty("Cookie", cookies);
                http.setRequestProperty("Accept", "application/json");
                status = http.getResponseCode();
                if (status == 200) {
                    StringBuilder sb = new StringBuilder();
                    try (BufferedReader r = new BufferedReader(new InputStreamReader(http.getInputStream(), StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = r.readLine()) != null) sb.append(line);
                    }
                    body = sb.toString();
                }
            } catch (Exception ignored) {
                // No internet for a moment: try again next time
            } finally {
                if (http != null) http.disconnect();
            }
            final int got = status;
            final String json = body;
            handler.post(() -> {
                if (!c.equals(code)) return; // another order took over meanwhile
                if (got == 404 || got == 401 || got == 403) {
                    stop(app, true); // signed out, or not their order any more
                    return;
                }
                if (json != null) {
                    try {
                        JSONObject o = new JSONObject(json);
                        show(app, o);
                        if (o.optBoolean("final", false)) {
                            stop(app, false);
                            return;
                        }
                    } catch (Exception ignored) {
                        // Odd reply: try again next time
                    }
                }
                schedulePoll(app);
            });
        });
    }

    @SuppressLint("MissingPermission") // checked: areNotificationsEnabled()
    private static void show(Context app, JSONObject o) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(app);
        // Only when the person allowed notifications
        if (!nm.areNotificationsEnabled()) return;
        makeChannel(app);

        String c = o.optString("code", "");
        String title = o.optString("title", "Your order");
        String text = o.optString("text", "");
        String chip = o.optString("chip", "");
        int progress = Math.max(0, Math.min(100, o.optInt("progress", 0)));
        boolean finished = o.optBoolean("final", false);

        // Nothing new: leave it alone (no flicker)
        String key = title + "|" + text + "|" + progress + "|" + finished;
        if (key.equals(lastShown)) return;
        lastShown = key;

        Intent open = new Intent(app, MainActivity.class)
            .setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("relaxbite://order/" + Uri.encode(c)))
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(app, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(app, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_order)
            .setColor(ORANGE)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setSubText(c)
            .setContentIntent(tap)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setShowWhen(false)
            .setOnlyAlertOnce(true);

        if (finished) {
            // "Delivered": can be swiped away, and clears itself after half an hour
            b.setOngoing(false).setAutoCancel(true).setTimeoutAfter(30 * 60 * 1000L);
        } else {
            b.setOngoing(true).setProgress(100, progress, false).setTimeoutAfter(GIVE_UP_AFTER);
            // Android 16: show as a Live Update (top of the lock screen, chip in the status bar).
            // Needs POST_PROMOTED_NOTIFICATIONS in the manifest; ignored on older phones.
            Bundle extras = new Bundle();
            extras.putBoolean("android.requestPromotedOngoing", true);
            if (!chip.isEmpty()) extras.putString("android.shortCriticalText", chip);
            b.addExtras(extras);
        }

        try {
            nm.notify(NOTIFICATION_ID, b.build());
        } catch (SecurityException ignored) {
            // Notification permission taken away just now
        }
    }

    private static void makeChannel(Context app) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = app.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Order tracker", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("Your order on the lock screen while it's on the way");
        ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }
}
