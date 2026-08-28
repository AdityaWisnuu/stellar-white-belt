# 🥋 Stellar White Belt Wallet

White Belt submission for **Stellar Journey to Mastery: Monthly Builder Challenges** (Rise In × Stellar).

**🌐 Live demo: https://stellar-white-belt.netlify.app** (Stellar testnet)

> Level 1 requirement: *Build wallets, handle balances, and submit your first on-chain transactions on Stellar.*

## What's inside

| Part | What it does |
|---|---|
| `web/` | A wallet web app (Vite + vanilla JS): generate an Ed25519 keypair in the browser, fund it via friendbot, check live balances from Horizon, send XLM (`payment` or `createAccount` when the destination doesn't exist yet), connect **Freighter** and sign with it, and view recent on-chain activity. |
| `scripts/demo.js` | An end-to-end CLI walkthrough: create two wallets → fund via friendbot → read balances → submit a `createAccount` transaction → submit a `payment` transaction with a memo → read final balances. |

## Proof of on-chain transactions (testnet)

First run of `scripts/demo.js` produced these live testnet transactions:

- `createAccount` — [`277b4571…`](https://stellar.expert/explorer/testnet/tx/277b4571ab855988f1e93b95e2d1ef7c4c1dd37286daab6ce38b16e3ed204193)
- `payment` (25 XLM, memo `white belt: first payment`) — [`e055ed63…`](https://stellar.expert/explorer/testnet/tx/e055ed638a37f203cc5531d5bdf9a40f6d2be7d65747b810963e14104360c9c7)

## Run it

```bash
# CLI demo (creates fresh wallets and submits two real testnet transactions)
npm install
node scripts/demo.js

# Web app
cd web
npm install
npm run dev
```

The web app runs entirely against **testnet** (Horizon `https://horizon-testnet.stellar.org`). No real funds involved. Local wallet secrets never leave your browser (`localStorage`); the CLI demo writes its throwaway keys to `wallets.json` (gitignored).

## Stack

- [`@stellar/stellar-sdk`](https://github.com/stellar/js-stellar-sdk) — keypairs, transaction building, Horizon queries
- [`@stellar/freighter-api`](https://docs.freighter.app/) — browser wallet connection & signing
- Vite, vanilla JS — no framework, the point is the Stellar plumbing

## Author

Aditya Wisnu Wardana — [@AdityaWisnuu](https://github.com/AdityaWisnuu)
