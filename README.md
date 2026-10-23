# ArbitrageAI Android v0.5 beta

**Status:** Complete Android Studio project; **source project, not a precompiled APK**. It has not been built or run on an Android device here because this build environment has no Android SDK or Gradle. The Java/Android compilation must be completed on a machine with the Android development tools.

## What it is

An Android-portable version of the user's v0.4 **minimalist Wealthsimple-style dashboard**, using a genuine Android application window (`WebView`) and bundled HTML/CSS/JS assets. The design is adapted to narrow screens but retains the same typography, cards, navigation, and account/analyst features.

Unlike the Intel macOS version, Android cannot run the bundled Mac Swift launcher or Python service. This Android edition replaces the Python service with an **offline JavaScript paper-simulation engine**, retaining the original front-end and its logical API. It is not a one-to-one port of the Python implementation, so simulation numbers and behavior will differ. It runs entirely on the phone; it does not require the Mac to be online.

### Implemented

- Overview, Markets, Opportunities, Accounts, AI Analyst, Paper activity, Performance, Risk Controls, and Settings.
- Six synthetic Forex/stock instruments across two synthetic venues. USD/JPY appears in the watchlist but is excluded from modeled P&L until a currency-conversion model is implemented.
- Buy at ask / sell at bid candidate math, illustrative fees and slippage, same-asset/same-currency checks, quote age, limited virtual notional and quantity.
- Adjustable virtual accounts (up to **40**, maximum **$1 billion each**), account selection, and per-account P&L reset; saved locally on the phone.
- Pause/resume, emergency stop, editable paper risk limits, recent activity and performance charts.
- Optional Twelve Data **reference-only** Forex/stock latest prices. Requests run in Android Java networking; the API key is saved in the app's private preferences. No executable bid/ask feed is delivered to the simulator.
- Manual TradingView alert text import. TradingView charts open in the user's external browser.
- Analyst screen with saved risk preferences and a **clearly identified offline, rules-based research outline**. This Android edition does *not* include a live LLM or live world-news research. Those require a separate, authenticated source and/or backend integration.
- No trading/broker passwords, no submitted orders, no Wealthsimple account access or TradingView private-data scraping.

### Important financial warning

**All arbitrage quotes, opportunities and P&L are synthetic.** This is an educational simulator, not proof of market profitability. It does not place live or paper orders at any broker. Device compute timing is not quote-to-exchange or execution latency.

## Build an installable APK on your Intel Mac

1. Install **Android Studio for Intel Mac** from https://developer.android.com/studio. The 2017 iMac running macOS Ventura can develop Android apps; Android Studio versions may differ in macOS requirements, so download a compatible Intel build.
2. Launch Android Studio, complete the Setup Wizard and install **Android SDK Platform 35 (Android 15)** through **Settings → Languages & Frameworks → Android SDK**, if not already installed.
3. Extract this ZIP to Downloads. In Finder open `ArbitrageAI-Android`.
4. Right-click `build_android_on_mac.command` → **Open**. Or in Terminal:

   ```bash
   cd ~/Downloads/ArbitrageAI-Android
   bash build_android_on_mac.command
   ```

   The build helper checks the Android SDK, uses Android Studio's bundled JDK, downloads **Gradle 8.9** if needed, builds the debug APK, and opens the output folder.
5. The APK should be at `ArbitrageAI-Android/app/build/outputs/apk/debug/app-debug.apk`.
6. Copy that **APK** to your Galaxy S23 via USB, Nearby/Quick Share, or cloud storage. Open it from **My Files**. Android may ask you to allow your file-manager app to install unknown apps: enable it *only for this installation if you trust the source*, then turn it off afterward. Follow Samsung's security prompts. Do not disable Play Protect or system security globally.

Google's official instructions confirm that Gradle `assembleDebug` creates a debug-signed, installable APK: https://developer.android.com/build/building-cmdline.

### Alternative build path

Open the extracted project folder in Android Studio, let it sync, and use **Build → Generate Bundle(s) / APK(s) → Generate APK(s)**, using the Debug variant. If Studio requests a Gradle wrapper first, run the provided build helper once, which downloads Gradle and builds the project directly.

### Developer tests

With Node.js installed:

```bash
node tests/run-tests.js
```

These are unit tests of the on-device JavaScript engine, not Android UI or APK installation tests.

## Data handling and limitations

- Accounts and simulated results are stored in Android WebView's private local storage under the secure `appassets.androidplatform.net` origin. Uninstalling the app normally removes them; **not synced** with the Mac.
- The optional Twelve Data key is stored in Android private SharedPreferences. This is not a dedicated hardware-backed encrypted secret store. Do not supply brokerage credentials.
- The application only renders packaged local assets inside its WebView. External links open in the user's browser; external scripts are blocked.
- Provider quotes are **reference prices**, not executable cross-venue bid/ask levels. No claim of microsecond feed or trading latency is made.
- The news workspace does not claim to fetch current headlines or connect to Ollama on the device; the analyst is a static risk-aware decision-support outline.
- The Android SDK, Gradle, and signing infrastructure are required to build an APK. This repository contains no APK binary.

## Project layout

```
ArbitrageAI-Android/
├── app/build.gradle
├── app/src/main/AndroidManifest.xml
├── app/src/main/java/ai/arbitrage/mobile/MainActivity.java
├── app/src/main/assets/
│   ├── index.html         # Approved Wealthsimple-style UI
│   ├── style.css          # Light desktop style + mobile refinements
│   ├── app.js             # Shared screen UI and handlers
│   └── mobile-api.js      # On-device paper engine and accounts
├── build_android_on_mac.command
├── tests/run-tests.js
└── README.md
```

## Build entirely from an Android phone

This package also includes `.github/workflows/build-apk.yml` for a cloud **GitHub Actions** build. See [PHONE-ONLY-BUILD.md](PHONE-ONLY-BUILD.md) for two phone-only routes (Chrome + Codespaces, or Termux + GitHub CLI). No Mac is required for either route. The workflow compiles a **debug APK**; it has not yet been verified against a real GitHub Actions runner or installed on a physical Samsung device.


## v0.9 Android changes
- Combined market directory shows all simulated symbols and per-broker bid/ask quotations. Personal favorites remain independently saved.
- Settings allows entering, selecting, and removing Alpha Vantage and Twelve Data API keys on-device. No API key is bundled in source or APK.
- Alpha Vantage reference pricing uses GLOBAL_QUOTE (equities) and CURRENCY_EXCHANGE_RATE (Forex) for the four existing reference symbols. Free-tier limits, delayed data, and response restrictions apply. Quotes are **not** used for execution or synthetic arbitrage calculations.
- Keys are saved in Android private SharedPreferences; this is not encrypted-at-rest credential storage. Avoid distributing a phone backup containing credentials.
