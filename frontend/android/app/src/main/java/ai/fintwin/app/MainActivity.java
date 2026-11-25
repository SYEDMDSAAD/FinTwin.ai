package ai.fintwin.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.net.URISyntaxException;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("intent".equals(url.getScheme())) return openIntentUrl(url.toString());
                return super.shouldOverrideUrlLoading(view, request);
            }
        });
    }

    /*
     * Spend Guard hands a payment to Google Pay, PhonePe or Paytm with an
     * intent:// link (intent://pay?...#Intent;scheme=upi;package=...;end).
     * Chrome understands those; a WebView doesn't, so open it here. If that
     * app isn't installed, send the plain upi:// link to whichever UPI app the
     * phone has, the way Chrome falls back to the Play Store.
     */
    private boolean openIntentUrl(String link) {
        Intent intent;
        try {
            intent = Intent.parseUri(link, Intent.URI_INTENT_SCHEME);
        } catch (URISyntaxException e) {
            return true;
        }
        // Only a VIEW of the parsed data, never a component or extras from the page
        Intent view = new Intent(Intent.ACTION_VIEW, intent.getData());
        view.addCategory(Intent.CATEGORY_BROWSABLE);
        view.setPackage(intent.getPackage());
        try {
            startActivity(view);
        } catch (ActivityNotFoundException e) {
            view.setPackage(null);
            try {
                startActivity(view);
            } catch (ActivityNotFoundException ignored) {
                // No UPI app at all: nothing to open
            }
        }
        return true;
    }
}
