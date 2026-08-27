// White Belt demo — Stellar Journey to Mastery
// Alur lengkap: bikin wallet → funding testnet → cek balance → transaksi on-chain.
// Jalankan: node scripts/demo.js
import {
  Keypair,
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  Memo,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { writeFileSync } from "node:fs";

const server = new Horizon.Server("https://horizon-testnet.stellar.org");
const EXPLORER = "https://stellar.expert/explorer/testnet";

const log = (label, value) => console.log(`${label.padEnd(28)} ${value}`);

// 1. Bikin dua wallet (keypair Ed25519)
const alice = Keypair.random();
const bob = Keypair.random();
console.log("\n=== 1. Wallet baru dibuat ===");
log("Alice (public key):", alice.publicKey());
log("Bob   (public key):", bob.publicKey());

// Simpan secret key lokal biar bisa dipakai ulang (file ini di-gitignore)
writeFileSync(
  new URL("../wallets.json", import.meta.url),
  JSON.stringify(
    {
      alice: { public: alice.publicKey(), secret: alice.secret() },
      bob: { public: bob.publicKey(), secret: bob.secret() },
    },
    null,
    2
  )
);

// 2. Funding Alice lewat friendbot (10.000 XLM testnet, gratis)
console.log("\n=== 2. Funding Alice via friendbot ===");
const fb = await fetch(
  `https://friendbot.stellar.org?addr=${alice.publicKey()}`
);
if (!fb.ok) throw new Error(`Friendbot gagal: ${fb.status}`);
console.log("Alice terdanai 10.000 XLM (testnet).");

// 3. Baca balance dari ledger
const balanceOf = async (pubkey) => {
  const account = await server.loadAccount(pubkey);
  return account.balances.find((b) => b.asset_type === "native").balance;
};
console.log("\n=== 3. Balance awal ===");
log("Alice:", `${await balanceOf(alice.publicKey())} XLM`);

// 4. Transaksi on-chain #1 — createAccount: Alice mendaftarkan akun Bob
//    (akun baru di Stellar harus dibuat lewat operasi createAccount, bukan payment)
console.log("\n=== 4. Transaksi #1: createAccount untuk Bob ===");
const aliceAccount = await server.loadAccount(alice.publicKey());
const createTx = new TransactionBuilder(aliceAccount, {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(
    Operation.createAccount({
      destination: bob.publicKey(),
      startingBalance: "100",
    })
  )
  .setTimeout(60)
  .build();
createTx.sign(alice);
const createRes = await server.submitTransaction(createTx);
log("Tx hash:", createRes.hash);
log("Explorer:", `${EXPLORER}/tx/${createRes.hash}`);

// 5. Transaksi on-chain #2 — payment 25 XLM Alice → Bob
console.log("\n=== 5. Transaksi #2: payment 25 XLM Alice → Bob ===");
const aliceAccount2 = await server.loadAccount(alice.publicKey());
const payTx = new TransactionBuilder(aliceAccount2, {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(
    Operation.payment({
      destination: bob.publicKey(),
      asset: Asset.native(),
      amount: "25",
    })
  )
  .addMemo(Memo.text("white belt: first payment"))
  .setTimeout(60)
  .build();
payTx.sign(alice);
const payRes = await server.submitTransaction(payTx);
log("Tx hash:", payRes.hash);
log("Explorer:", `${EXPLORER}/tx/${payRes.hash}`);

// 6. Balance akhir
console.log("\n=== 6. Balance akhir ===");
log("Alice:", `${await balanceOf(alice.publicKey())} XLM`);
log("Bob:", `${await balanceOf(bob.publicKey())} XLM`);
console.log("\nSelesai — dua transaksi nyata sudah tercatat di Stellar testnet.\n");
