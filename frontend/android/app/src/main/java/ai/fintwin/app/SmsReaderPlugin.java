package ai.fintwin.app;

import android.Manifest;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.util.regex.Pattern;

/*
 * Reads bank SMS from the phone's inbox for FinTwin to turn into
 * transactions. Only messages that could be a bank alert leave the phone:
 * from a registered business sender (a DLT header like "VM-HDFCBK", never a
 * personal phone number) and mentioning an amount. The server then keeps
 * only known banks and completed transactions.
 *
 * checkPermissions() / requestPermissions() come from Plugin, for alias "sms".
 */
@CapacitorPlugin(name = "SmsReader", permissions = { @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS }) })
public class SmsReaderPlugin extends Plugin {

    private static final Pattern BUSINESS_SENDER = Pattern.compile("^(?:[A-Za-z]{2}-)?[A-Za-z0-9]{6}(?:-[A-Za-z])?$");
    private static final Pattern ALL_DIGITS = Pattern.compile("^[0-9-]+$");
    private static final Pattern MONEY = Pattern.compile("(?i)(rs\\.?|inr|₹|debited|credited)");
    private static final int MAX_LIMIT = 5000;

    /** { since: epoch ms (exclusive), limit } → { messages: [{ sender, body, receivedAt }], scanned } */
    @PluginMethod
    public void inbox(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("SMS permission not granted", "PERMISSION_DENIED");
            return;
        }
        long since = call.getLong("since", 0L);
        int limit = Math.max(1, Math.min(call.getInt("limit", 2000), MAX_LIMIT));

        JSArray messages = new JSArray();
        int scanned = 0;
        Uri uri = Telephony.Sms.Inbox.CONTENT_URI;
        String[] columns = { Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE };
        try (Cursor c = getContext().getContentResolver().query(uri, columns,
                Telephony.Sms.DATE + " > ?", new String[] { String.valueOf(since) },
                Telephony.Sms.DATE + " ASC")) {
            if (c != null) {
                while (c.moveToNext() && messages.length() < limit) {
                    scanned++;
                    String sender = c.getString(0);
                    String body = c.getString(1);
                    long date = c.getLong(2);
                    if (sender == null || body == null) continue;
                    String s = sender.trim();
                    if (!BUSINESS_SENDER.matcher(s).matches() || ALL_DIGITS.matcher(s).matches()) continue;
                    if (!MONEY.matcher(body).find()) continue;
                    JSObject m = new JSObject();
                    m.put("sender", s);
                    m.put("body", body);
                    m.put("receivedAt", date);
                    messages.put(m);
                }
            }
        } catch (SecurityException e) {
            call.reject("SMS permission not granted", "PERMISSION_DENIED");
            return;
        }
        JSObject out = new JSObject();
        out.put("messages", messages);
        out.put("scanned", scanned);
        call.resolve(out);
    }
}
