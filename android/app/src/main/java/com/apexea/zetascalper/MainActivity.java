package com.apexea.zetascalper;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Client trading app shell. UI is packaged in the APK for fast cold start;
 * PayPal, licenses, Chart Scanner, MetaAPI, and secrets stay on apex-ea.com.
 * Mentor/admin portal routes are blocked inside the APK.
 */
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    Bridge bridge = this.getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;

    // Prefer GPU compositing; pause timers when backgrounded (see onPause/onResume).
    webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    WebSettings settings = webView.getSettings();
    if (settings != null) {
      settings.setCacheMode(WebSettings.LOAD_DEFAULT);
      settings.setDomStorageEnabled(true);
    }

    webView.setWebViewClient(
      new BridgeWebViewClient(bridge) {
        private boolean isAdminUrl(String url) {
          if (url == null) return false;
          String lower = url.toLowerCase();
          return lower.contains("/admin") || lower.contains("/admin/");
        }

        private void goHome() {
          Bridge b = MainActivity.this.getBridge();
          if (b != null && b.getWebView() != null) {
            // Packaged Capacitor assets (not the remote website).
            b.getWebView().loadUrl("https://localhost/");
          }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
          if (request != null && request.getUrl() != null && isAdminUrl(request.getUrl().toString())) {
            goHome();
            return true;
          }
          return super.shouldOverrideUrlLoading(view, request);
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
          if (isAdminUrl(url)) {
            goHome();
            return true;
          }
          return super.shouldOverrideUrlLoading(view, url);
        }
      }
    );
  }

  @Override
  public void onPause() {
    Bridge bridge = this.getBridge();
    WebView webView = bridge != null ? bridge.getWebView() : null;
    if (webView != null) {
      webView.onPause();
      webView.pauseTimers();
      webView.evaluateJavascript(
        "document.documentElement.classList.add('is-paused');",
        null
      );
    }
    super.onPause();
  }

  @Override
  public void onResume() {
    super.onResume();
    Bridge bridge = this.getBridge();
    WebView webView = bridge != null ? bridge.getWebView() : null;
    if (webView != null) {
      webView.resumeTimers();
      webView.onResume();
      webView.evaluateJavascript(
        "document.documentElement.classList.remove('is-paused');",
        null
      );
    }
  }
}
