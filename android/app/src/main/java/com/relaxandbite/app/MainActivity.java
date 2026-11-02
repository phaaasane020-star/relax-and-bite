package com.relaxandbite.app;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    // The app's bars and page background (the app is white)
    private static final int LIGHT_BARS = Color.parseColor("#FFFFFF");
    private static final int LIGHT_PAGE = Color.parseColor("#FFFFFF");
    // The start-up screen and the intro: white (name kept from the orange version)
    private static final int ORANGE = Color.parseColor("#FFFFFF");

    // Stop waiting for the intro after this long, whatever happens (ms)
    private static final long INTRO_LIMIT = 8000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean introDone = false;
    private boolean watching = false;
    private long watchStarted = 0;
    // A Google sign-in waiting to be finished once our site has loaded
    private String pendingClaim = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // From tapping the icon to the end of the intro everything is white:
        // the start-up screen, the bars, and the space behind the page while it
        // loads. So there's no flash before the intro starts.
        paintBars(ORANGE, false);
        WebView webView = getBridge().getWebView();
        // Pages are laid out for the phone's screen. Without this, a bigger
        // font size in the phone's settings enlarges all text in the app and
        // pushes buttons, cards and menus off the screen.
        webView.getSettings().setTextZoom(100);
        webView.setBackgroundColor(ORANGE);
        // Lets the page ask the app for things (open Google sign-in in the browser)
        webView.addJavascriptInterface(new PageBridge(), "RBNative");
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                if (pendingClaim != null) openClaim();
                if (introDone) applyTheme();
                else watchIntro();
            }
        });
        // Opened from the browser after "Continue with Google", or from the order tracker
        handleSignIn(getIntent());
        // An order that was on the lock screen before the app was closed: keep it updating
        OrderTracker.resume(this);
        // The phone's back button / back swipe goes back inside the app
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                goBack();
            }
        });
    }

    // Closes an open pop-up (cart, sign-in, a sheet) if there is one
    private static final String CLOSE_POPUP =
        "(function(){var d=document.querySelector('dialog[open]');"
            + "if(d){d.close();return 'closed'}return 'none'})()";

    /**
     * Back, the way people expect in an app: first close a pop-up, then go to
     * the page before. With nothing to go back to: from any other page go to
     * Home, and from Home (or the welcome screen) leave the app, which stays
     * open in the background rather than closing.
     */
    private void goBack() {
        WebView webView;
        try {
            webView = getBridge().getWebView();
        } catch (Exception e) {
            moveTaskToBack(true);
            return;
        }
        final WebView view = webView;
        try {
            view.evaluateJavascript(CLOSE_POPUP, (result) -> {
                if ("\"closed\"".equals(result)) return;
                if (view.canGoBack()) {
                    view.goBack();
                    return;
                }
                String base = siteBase();
                String path = "/";
                try {
                    String current = view.getUrl();
                    if (current != null && Uri.parse(current).getPath() != null) path = Uri.parse(current).getPath();
                } catch (Exception ignored) {
                    // keep "/"
                }
                boolean atStart = path.equals("/") || path.isEmpty() || path.startsWith("/welcome");
                if (!atStart && base != null) view.loadUrl(base + "/");
                else moveTaskToBack(true);
            });
        } catch (Exception e) {
            if (view.canGoBack()) view.goBack();
            else moveTaskToBack(true);
        }
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleSignIn(intent);
    }

    /**
     * relaxbite://signin?ticket=...&next=... comes from the phone's browser once
     * Google sign-in is done. The app opens our own claim page with the one-time
     * ticket, which signs the person in inside the app.
     */
    private void handleSignIn(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        Uri data = intent.getData();
        if (!"relaxbite".equals(data.getScheme())) return;
        // relaxbite://order/RB-1005 comes from tapping the order tracker notification
        if ("order".equals(data.getHost())) {
            String code = data.getLastPathSegment();
            if (code == null || !code.matches("[A-Za-z0-9-]{3,20}")) return;
            pendingClaim = "/orders/" + code;
            intent.setData(null);
            handler.post(this::openClaim);
            return;
        }
        if (!"signin".equals(data.getHost())) return;
        String ticket = data.getQueryParameter("ticket");
        if (ticket == null || !ticket.matches("[A-Za-z0-9_-]{20,64}")) return;
        String next = data.getQueryParameter("next");
        if (next == null || !next.startsWith("/") || next.startsWith("//")) next = "/";
        pendingClaim = "/api/auth/claim?ticket=" + Uri.encode(ticket) + "&next=" + Uri.encode(next);
        intent.setData(null); // only once, even if the app is recreated
        handler.post(this::openClaim);
    }

    /** Our site's address (from the page showing now), e.g. https://relaxandbite.com, or null before the first page. */
    private String siteBase() {
        try {
            String current = getBridge().getWebView().getUrl();
            if (current == null) return null;
            Uri u = Uri.parse(current);
            if (!"https".equals(u.getScheme()) && !"http".equals(u.getScheme())) return null;
            return u.getScheme() + "://" + u.getEncodedAuthority();
        } catch (Exception e) {
            return null;
        }
    }

    private void openClaim() {
        String base = siteBase();
        if (pendingClaim == null || base == null) return; // tried again when the first page loads
        String url = base + pendingClaim;
        pendingClaim = null;
        getBridge().getWebView().loadUrl(url);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Some phones reset the bars when the app comes back
        if (introDone) applyTheme();
        else paintBars(ORANGE, false);
    }

    // Android keeps new cookies in memory and only writes them to storage now and
    // then. If the app is swiped away before that, the sign-in cookie is lost and
    // the person has to sign in again. Save them whenever the app leaves the screen.
    @Override
    public void onPause() {
        saveCookies();
        super.onPause();
    }

    @Override
    public void onStop() {
        saveCookies();
        super.onStop();
    }

    private void saveCookies() {
        try {
            CookieManager.getInstance().flush();
        } catch (Exception ignored) {
            // No WebView yet (very early in start-up): nothing to save
        }
    }

    /**
     * Once the first page has loaded, checks every tenth of a second whether the
     * intro is still showing, and sets the app's bars the moment it's gone
     * (finished or tapped away). If the page has no intro (an error page, say),
     * that happens straight away.
     */
    private void watchIntro() {
        if (introDone || watching) return;
        watching = true;
        watchStarted = System.currentTimeMillis();
        handler.post(checkIntro);
    }

    private final Runnable checkIntro = new Runnable() {
        @Override
        public void run() {
            if (introDone) return;
            if (System.currentTimeMillis() - watchStarted > INTRO_LIMIT) {
                endIntro();
                return;
            }
            try {
                getBridge().getWebView().evaluateJavascript(
                    "document.documentElement.classList.contains('intro')",
                    (showing) -> {
                        if ("true".equals(showing)) handler.postDelayed(checkIntro, 100);
                        else endIntro();
                    });
            } catch (Exception e) {
                endIntro();
            }
        }
    };

    private void endIntro() {
        if (introDone) return;
        introDone = true;
        applyTheme();
    }

    private void applyTheme() {
        try {
            getBridge().getWebView().setBackgroundColor(LIGHT_PAGE);
        } catch (Exception ignored) {
            // WebView gone (app closing): nothing to change
        }
        // White bars with dark icons
        paintBars(LIGHT_BARS, false);
    }

    /** Things the page can ask the app for (window.RBNative). */
    private class PageBridge {
        /** The order page: keep this order on the lock screen while it's on the way. */
        @JavascriptInterface
        public void trackOrder(String json) {
            runOnUiThread(() -> OrderTracker.update(MainActivity.this, siteBase(), json));
        }

        /** Opens one of our own sign-in pages in the phone's browser (Google won't sign in inside apps). */
        @JavascriptInterface
        public void openInBrowser(String url) {
            runOnUiThread(() -> {
                // Only our own Google sign-in page
                String base = siteBase();
                if (url == null || base == null || !url.startsWith(base + "/api/auth/google?")) return;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                    // No browser on the phone: nothing we can do
                }
            });
        }
    }

    /** Status bar and navigation bar in one colour, with light or dark icons. */
    @SuppressWarnings("deprecation")
    private void paintBars(int colour, boolean lightIcons) {
        Window window = getWindow();
        // Shows behind the bars on Android 15+, where apps draw edge to edge
        window.getDecorView().setBackgroundColor(colour);
        // Older Android versions colour the bars directly
        window.setStatusBarColor(colour);
        window.setNavigationBarColor(colour);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        // White icons on dark or orange bars, dark icons on white bars
        WindowInsetsControllerCompat icons = WindowCompat.getInsetsController(window, window.getDecorView());
        icons.setAppearanceLightStatusBars(!lightIcons);
        icons.setAppearanceLightNavigationBars(!lightIcons);
    }
}
