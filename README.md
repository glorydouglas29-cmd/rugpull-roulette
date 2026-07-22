# 🔥 Rugpull Roulette v2

**Solana Wallet Roast + Exit Liquidity Detector**

A Cloudflare-native Web3 tool that roasts wallets and classifies traders. Built for degens.

## Features

### 🔥 Roast Mode
- Scans wallet balances, transactions, NFTs
- Generates savage, shareable roasts
- Degen score (0-10)
- One-click X/Twitter share

### 📊 Classify Mode (Exit Liquidity Detector)
- Analyzes trade patterns & win rates
- Classifies wallets:
  - ⚫ **BOT / SNIPER** — Too fast to be human
  - 🔴 **EXIT LIQUIDITY** — Professional bag holder
  - 🟡 **PAPER HANDS** — Panic seller
  - 🟢 **AVERAGE DEGEN** — Normal crypto degenerate
  - 🔵 **SMART MONEY** — Actually profitable
  - 👑 **WHALE / LEGEND** — Time traveler or insider
- **Countertrade recommendation** — "Do the opposite of this wallet"
- Classification factors with visual breakdown

### 🏆 Leaderboard
- Ranks all classified wallets
- Toggle: Worst Degens vs Smart Money
- Persistent via Cloudflare KV

## Architecture

```
Cloudflare Worker (src/index.js)
├── /api/roast       → Roast engine
├── /api/classify    → Exit Liquidity Detector
├── /api/countertrade → Countertrade generator
├── /api/leaderboard → KV-backed rankings
└── /api/health      → Health check

Cloudflare Pages (static/index.html)
├── Roast Mode UI
├── Classify Mode UI
└── Leaderboard UI
```

## Deploy

### 1. Clone & Setup
```bash
git clone <your-repo>
cd rugpull-roulette
npm install
```

### 2. Login to Cloudflare
```bash
npx wrangler login
```

### 3. Set Secrets
```bash
# Helius API Key
npx wrangler secret put HELIUS_API_KEY

# For leaderboard (optional)
npx wrangler kv:namespace create "LEADERBOARD_KV"
# Copy the ID from output, paste into wrangler.toml
```

### 4. Deploy
```bash
# Deploy Worker
npx wrangler deploy

# Deploy Frontend (Pages)
npx wrangler pages deploy static --project-name=rugpull-roulette
```

### 5. GitHub Actions Auto-Deploy (Optional)
1. Go to GitHub repo → Settings → Secrets
2. Add `CLOUDFLARE_API_TOKEN` (get from Cloudflare dashboard → My Profile → API Tokens)
3. Add `HELIUS_API_KEY`
4. Push to `main` — auto-deploys!

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/roast?address=` | Get roast data |
| `GET /api/classify?address=` | Get classification + countertrade |
| `GET /api/countertrade?address=` | Get countertrade only |
| `GET /api/leaderboard?sort=worst|best&limit=20` | Get rankings |
| `GET /api/health` | Health check |

## Roast Examples

> "You have 0.0263 SOL. That's not a wallet, that's a receipt."

> "Holding 6 memecoins. Your portfolio is a circus and you're the clown."

> "Bought the top 4 times. You're not an investor — you're exit liquidity with a seed phrase."

## Credits

- Data: Helius + Jupiter
- Hosting: Cloudflare Workers + Pages
- Built for degens, by degens

## Disclaimer

Not financial advice. This is satire. Don't actually countertrade strangers. Or do. We're not your dad.
