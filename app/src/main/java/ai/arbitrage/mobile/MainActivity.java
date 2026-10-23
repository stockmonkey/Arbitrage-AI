package ai.arbitrage.mobile;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.graphics.Color;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import android.view.View;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.BufferedReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** A minimal offline WebView app shell. No trading/order APIs are present. */
public final class MainActivity extends Activity {
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String APP_PATH = "/assets/";
    private static final String[] REFERENCE_SYMBOLS = {"EUR/USD", "GBP/USD", "AAPL", "MSFT"};
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicBoolean refreshInFlight = new AtomicBoolean(false);
    private WebView web;
    private SharedPreferences prefs;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("reference_provider", MODE_PRIVATE);
        getWindow().setStatusBarColor(Color.rgb(249, 250, 249));
        getWindow().setNavigationBarColor(Color.rgb(249, 250, 249));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR |
                View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1,-1));
        setContentView(root);
        if(Build.VERSION.SDK_INT>=35){
            root.setOnApplyWindowInsetsListener((v,insets)->{
                android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars());
                v.setPadding(bars.left,bars.top,bars.right,bars.bottom);
                return insets;
            });
            root.requestApplyInsets();
        }
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        web.setWebContentsDebuggingEnabled(false);
        web.setWebViewClient(new WebViewClient(){
            private boolean isLocal(Uri u){
                return "https".equals(u.getScheme())&&APP_HOST.equals(u.getHost())&&
                        u.getPath()!=null&&u.getPath().startsWith(APP_PATH);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request){
                Uri target=request.getUrl();
                if(isLocal(target))return false;
                if(request.isForMainFrame()) {
                    String scheme=target.getScheme();
                    if("https".equals(scheme)) {
                        try {startActivity(new Intent(Intent.ACTION_VIEW,target));}
                        catch(Exception ignored){}
                    }
                }
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request){
                Uri target=request.getUrl();
                if(isLocal(target)) {
                    String resource=target.getPath().substring(APP_PATH.length());
                    if(!resource.matches("[A-Za-z0-9._/-]{1,120}")||resource.contains(".."))return blocked();
                    if(resource.isEmpty())resource="index.html";
                    try {
                        InputStream input=getAssets().open(resource);
                        String mime=resource.endsWith(".js")?"application/javascript":
                                resource.endsWith(".css")?"text/css":
                                resource.endsWith(".png")?"image/png":"text/html";
                        return new WebResourceResponse(mime,"UTF-8",input);
                    }catch(Exception ex){return blocked();}
                }
                // WebView never makes network requests or executes third-party scripts.
                // External links are instead opened in the device browser.
                return blocked();
            }
            private WebResourceResponse blocked(){
                return new WebResourceResponse("text/plain","UTF-8",
                        new ByteArrayInputStream(new byte[0]));
            }
        });
        web.addJavascriptInterface(new ProviderBridge(),"AndroidData");
        web.loadUrl("https://"+APP_HOST+APP_PATH+"index.html");
    }

    private final class ProviderBridge {
        @JavascriptInterface public boolean hasKey(){
            return !prefs.getString(prefs.getString("active_provider","alphavantage")+"_key","").isEmpty();
        }
        @JavascriptInterface public boolean saveKey(String key){
            if(key==null || !key.matches("[A-Za-z0-9_-]{6,128}"))return false;
            return prefs.edit().putString(prefs.getString("active_provider","alphavantage")+"_key",key).commit();
        }
        @JavascriptInterface public void clearKey(){prefs.edit().remove(prefs.getString("active_provider","alphavantage")+"_key").apply();}
        @JavascriptInterface public boolean selectProvider(String provider){
            if(!"alphavantage".equals(provider)&&!"twelvedata".equals(provider))return false;
            return prefs.edit().putString("active_provider",provider).commit();
        }
        @JavascriptInterface public String getProvider(){return prefs.getString("active_provider","alphavantage");}
        @JavascriptInterface public void refreshPrices(){
            if(!refreshInFlight.compareAndSet(false,true))return;
            io.execute(()->{
                JSONObject result=new JSONObject();
                JSONArray prices=new JSONArray(), errors=new JSONArray();
                try {
                    String provider=prefs.getString("active_provider","alphavantage");
                    String key=prefs.getString(provider+"_key","");
                    if(key.isEmpty())throw new IllegalStateException("No provider key configured");
                    for(String symbol:REFERENCE_SYMBOLS){
                        try {
                            JSONObject response=requestReference(symbol,key,provider);
                            if("error".equals(response.optString("status")))
                                throw new IllegalArgumentException("Provider rejected request");
                            double price=Double.parseDouble(response.getString("price"));
                            if(!Double.isFinite(price)||price<=0)throw new IllegalArgumentException("Invalid returned price");
                            JSONObject q=new JSONObject();
                            q.put("symbol",symbol);q.put("price",price);q.put("source","alphavantage".equals(provider)?"Alpha Vantage":"Twelve Data");
                            q.put("fetched_at",System.currentTimeMillis()/1000L);
                            prices.put(q);
                        }catch(Exception e){errors.put(symbol+": "+ e.getClass().getSimpleName());}
                    }
                }catch(Exception e){errors.put("Refresh failed: "+ e.getClass().getSimpleName());}
                finally{refreshInFlight.set(false);}
                try {result.put("prices",prices);result.put("errors",errors);}catch(Exception ignored){}
                final String content=result.toString();
                runOnUiThread(()->{
                    if(web!=null)web.evaluateJavascript(
                      "window.__mobileOnPrices("+JSONObject.quote(content)+")",null);
                });
            });
        }
    }
    private static JSONObject requestReference(String symbol,String key,String provider) throws Exception{
        String target;
        if("alphavantage".equals(provider)){
            if(symbol.contains("/")){
                String[] pair=symbol.split("/");
                target="https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency="+
                    URLEncoder.encode(pair[0],"UTF-8")+"&to_currency="+URLEncoder.encode(pair[1],"UTF-8")+
                    "&apikey="+URLEncoder.encode(key,"UTF-8");
            }else{
                target="https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol="+
                    URLEncoder.encode(symbol,"UTF-8")+"&apikey="+URLEncoder.encode(key,"UTF-8");
            }
        }else{
            target="https://api.twelvedata.com/price?symbol="+
                URLEncoder.encode(symbol,"UTF-8")+"&apikey="+URLEncoder.encode(key,"UTF-8");
        }
        HttpURLConnection conn=(HttpURLConnection)new URL(target).openConnection();
        conn.setConnectTimeout(8000);conn.setReadTimeout(8000);
        conn.setRequestMethod("GET");
        conn.setRequestProperty("User-Agent","ArbitrageAI-Android-Paper-Research/0.5");
        try {
            if(conn.getResponseCode()!=200)throw new IllegalStateException("Provider returned non-200");
            try(BufferedReader reader=new BufferedReader(new InputStreamReader(conn.getInputStream(),StandardCharsets.UTF_8))){
                StringBuilder text=new StringBuilder();char[] chunk=new char[2048];int size;
                while((size=reader.read(chunk))!=-1){
                    text.append(chunk,0,size);if(text.length()>16000)throw new IllegalStateException("Response too large");
                }
                JSONObject raw=new JSONObject(text.toString());
                if(!"alphavantage".equals(provider))return raw;
                if(raw.has("Note")||raw.has("Information")||raw.has("Error Message"))
                    throw new IllegalStateException("Alpha Vantage limit or provider error");
                String value=symbol.contains("/")?
                    raw.optJSONObject("Realtime Currency Exchange Rate")==null?"":raw.getJSONObject("Realtime Currency Exchange Rate").optString("5. Exchange Rate"):
                    raw.optJSONObject("Global Quote")==null?"":raw.getJSONObject("Global Quote").optString("05. price");
                JSONObject normalized=new JSONObject();normalized.put("price",value);return normalized;
            }
        } finally {conn.disconnect();}
    }
    @Override public void onBackPressed(){
        // Browser navigation within the app is handled by the on-page tabs.
        super.onBackPressed();
    }
    @Override public void onDestroy(){
        io.shutdownNow();
        if(web!=null){web.removeJavascriptInterface("AndroidData");web.destroy();web=null;}
        super.onDestroy();
    }
}
