package com.wasil.messenger;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> pendingFileCallback;
    private PermissionRequest pendingWebPermissionRequest;

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
        registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            if (pendingFileCallback == null) return;
            Uri[] results = null;
            if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                Intent data = result.getData();
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            pendingFileCallback.onReceiveValue(results);
            pendingFileCallback = null;
        });

    private final ActivityResultLauncher<String[]> runtimePermissionLauncher =
        registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), grants -> {
            if (pendingWebPermissionRequest != null) {
                boolean allGranted = !grants.isEmpty();
                for (Boolean granted : grants.values()) {
                    if (!Boolean.TRUE.equals(granted)) {
                        allGranted = false;
                        break;
                    }
                }
                if (allGranted) {
                    pendingWebPermissionRequest.grant(pendingWebPermissionRequest.getResources());
                } else {
                    pendingWebPermissionRequest.deny();
                }
                pendingWebPermissionRequest = null;
            }
        });

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
        setContentView(R.layout.activity_main);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(ContextCompat.getColor(this, R.color.wasil_primary_dark));
        }

        webView = findViewById(R.id.webview);
        progressBar = findViewById(R.id.loading_progress);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        final String appOrigin = getString(R.string.wasil_app_url);
        final String appHost = Uri.parse(appOrigin).getHost();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) return false;
                String scheme = uri.getScheme() != null ? uri.getScheme() : "";
                String host = uri.getHost() != null ? uri.getHost() : "";
                if ("https".equalsIgnoreCase(scheme) && (host.equalsIgnoreCase(appHost)
                        || host.endsWith(".firebaseapp.com")
                        || host.endsWith(".google.com")
                        || host.endsWith(".googleapis.com"))) {
                    return false;
                }
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)
                        || "mailto".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme)) {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    return true;
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    String offlineHtml = "<html dir='rtl' lang='ar'><body style='font-family:sans-serif;text-align:center;padding:48px 20px;background:#EAE6DF;color:#111B21;'>"
                        + "<h2 style='color:#008069;'>تواصل - الاتصال غير متاح</h2>"
                        + "<p>تحقق من اتصال الإنترنت ثم أعد المحاولة لفتح المحادثات المشفرة.</p>"
                        + "<button onclick=\"location.href='" + appOrigin + "'\" style='margin-top:16px;padding:12px 24px;border:none;border-radius:999px;background:#00A884;color:#fff;font-weight:bold;font-size:15px;'>إعادة المحاولة</button>"
                        + "</body></html>";
                    view.loadDataWithBaseURL(null, offlineHtml, "text/html", "UTF-8", null);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> filePathCallback,
                FileChooserParams fileChooserParams
            ) {
                if (pendingFileCallback != null) {
                    pendingFileCallback.onReceiveValue(null);
                }
                pendingFileCallback = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                fileChooserLauncher.launch(intent);
                return true;
            }

            @Override
            public void onPermissionRequest(@NonNull final PermissionRequest request) {
                List<String> needed = new ArrayList<>();
                for (String res : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)
                        && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                            != PackageManager.PERMISSION_GRANTED) {
                        needed.add(Manifest.permission.CAMERA);
                    }
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)
                        && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                            != PackageManager.PERMISSION_GRANTED) {
                        needed.add(Manifest.permission.RECORD_AUDIO);
                    }
                }
                if (needed.isEmpty()) {
                    request.grant(request.getResources());
                } else {
                    pendingWebPermissionRequest = request;
                    runtimePermissionLauncher.launch(needed.toArray(new String[0]));
                }
            }
        });

        handleIncomingIntent(getIntent(), appOrigin);
    }

    private void handleIncomingIntent(Intent intent, String fallbackUrl) {
        if (intent != null && intent.getData() != null) {
            Uri data = intent.getData();
            if ("https".equalsIgnoreCase(data.getScheme())) {
                webView.loadUrl(data.toString());
                return;
            }
        }
        webView.loadUrl(fallbackUrl);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIncomingIntent(intent, getString(R.string.wasil_app_url));
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
