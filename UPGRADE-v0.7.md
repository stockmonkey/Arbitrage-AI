# Android v0.7 mobile-only upgrade

- 12 accurately named FX pairs, including 12 distinct currency codes; 50 labeled stock tickers. All prices are synthetic starting levels, not actual quotes.
- 6 simulated brokers (3 FX, 3 equities); 1,200 synthetic participants with five strategy archetypes, different latencies, and probabilistic order competition.
- Competing order volume reduces fill size; modeled latency and momentum participants reduce fill probability/edge. Parameters are plausible educational assumptions, not empirically calibrated or validated historical market data.
- Median and p95 measured using `performance.now()` and displayed to 0.0001 ms. Four decimal places are DISPLAY RESOLUTION, not guaranteed physical measurement accuracy; Android WebView clock resolution and scheduling noise apply.
- Analyst overlay styling simplified for mobile. No live market connectivity, real participants, or live orders.
- GitHub Actions builds an unsigned-for-distribution debug APK.
