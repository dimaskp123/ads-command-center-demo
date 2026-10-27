# Client Ads Command Center: demo

A copy of the Client Ads Command Center that holds **sample data only**: every client, account, campaign, ad set, ad and creator name is fictional, every ID is random, and every number is synthetic. Use it to show the product to prospects.

- **Clients:** seven fictional brands (Alpha Fitness … Eta Coffee) across Meta, Google Ads and TikTok, in USD, IDR and TWD, converted to IDR with a fixed sample FX table.
- **Creative Library:** sample creators and captions with sample write-ups; no real posts are embedded.
- **No live connections:** there is no data refresh, Meta token or FX sheet. The data is a static file (`lib/clients/snapshot.json`).

## Running it

```
npm install
npm run dev
```

The login wall from the main product is kept. Set these environment variables, locally or in Vercel:

- `AUTH_SECRET`: 32+ random characters
- `DASHBOARD_USERS`: comma-separated `user:password` pairs, e.g. `demo:choose-a-password`

Without them, the site stays locked.
