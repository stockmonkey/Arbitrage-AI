# Broker adapter contract (planned, not connected)

Modes: `synthetic`, `paper_external`, `reference_only`. Never infer executable bid/ask prices from a reference-only midpoint.

Adapter fields: `id`, `asset_class`, `mode`, `quote_timestamp`, `bid`, `ask`, `bid_size`, `ask_size`, `currency`, `fees_bps`, `quote_source`, `stale_after_ms`.

Future OANDA Practice: use practice REST/streaming pricing and practice-order endpoints only after separate explicit authorization and secure credential storage.
Future Alpaca Paper: use paper account and supported market-data endpoints; market data subscription and delayed/indicative prices must be identified.

No real-money order routes are implemented. No API credentials are bundled. Simulation results do not establish executable arbitrage.
