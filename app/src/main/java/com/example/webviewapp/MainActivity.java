package com.example.webviewapp;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView webView;
    private boolean errorShown = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                if (consoleMessage.messageLevel() == ConsoleMessage.MessageLevel.ERROR && !errorShown) {
                    errorShown = true;
                    String msg = "<html><body style='font-family:sans-serif;padding:20px;direction:ltr;'>"
                            + "<h3>JavaScript Error</h3>"
                            + "<p>" + consoleMessage.message() + "</p>"
                            + "<p>Line: " + consoleMessage.lineNumber() + " | Source: " + consoleMessage.sourceId() + "</p>"
                            + "</body></html>";
                    webView.loadDataWithBaseURL(null, msg, "text/html", "UTF-8", null);
                }
                return super.onConsoleMessage(consoleMessage);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && !errorShown) {
                    errorShown = true;
                    String html = "<html><body style='font-family:sans-serif;padding:20px;direction:rtl;'>"
                            + "<h3>خطأ في تحميل الصفحة</h3>"
                            + "<p>" + error.getDescription() + "</p>"
                            + "</body></html>";
                    view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
                }
            }
        });

        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
