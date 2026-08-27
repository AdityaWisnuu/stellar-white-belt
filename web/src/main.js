import "./style.css";
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
import {
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";

const HORIZON = "https://horizon-testnet.stellar.org";
const EXPLORER = "https://stellar.expert/explorer/testnet";
const STORAGE_KEY = "white-belt-wallet";

const server = new Horizon.Server(HORIZON);

// ---------- state ----------
let localWallet = loadLocalWallet(); // { public, secret } | null
let freighterAddress = null;

function loadLocalWallet() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

// ---------- helpers Stellar ----------
async function getBalance(pubkey) {
  try {
    const account = await server.loadAccount(pubkey);
    return account.balances.find((b) => b.asset_type === "native").balance;
  } catch (e) {
    if (e?.response?.status === 404) return null; // akun belum ada di ledger
    throw e;
  }
}

async function fundWithFriendbot(pubkey) {
  const res = await fetch(`https://friendbot.stellar.org?addr=${pubkey}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || `friendbot gagal (${res.status})`);
  }
}

// Payment kalau akun tujuan sudah ada, createAccount kalau belum.
async function buildTransfer(sourcePub, destination, amount, memoText) {
  const destExists = (await getBalance(destination)) !== null;
  const source = await server.loadAccount(sourcePub);
  const builder = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  }).addOperation(
    destExists
      ? Operation.payment({
          destination,
          asset: Asset.native(),
          amount,
        })
      : Operation.createAccount({ destination, startingBalance: amount })
  );
  if (memoText) builder.addMemo(Memo.text(memoText.slice(0, 28)));
  return builder.setTimeout(60).build();
}

async function recentPayments(pubkey) {
  const { records } = await server
    .payments()
    .forAccount(pubkey)
    .order("desc")
    .limit(5)
    .call();
  return records;
}

// ---------- UI ----------
const app = document.querySelector("#app");

function render() {
  app.innerHTML = `
    <main>
      <header>
        <h1>🥋 Stellar White Belt Wallet</h1>
        <p>Create wallets, check balances, and submit on-chain transactions on Stellar <strong>testnet</strong>.</p>
      </header>

      <section class="card">
        <h2>1 · Local wallet</h2>
        ${
          localWallet
            ? `
          <p class="addr" title="${localWallet.public}">${short(localWallet.public)}</p>
          <p>Balance: <strong id="local-balance">loading…</strong></p>
          <div class="row">
            <button id="fund">Fund with friendbot</button>
            <button id="forget" class="ghost">Forget wallet</button>
          </div>`
            : `
          <p>No wallet yet. Generate a fresh Ed25519 keypair — stored only in your browser.</p>
          <button id="generate">Generate wallet</button>`
        }
      </section>

      <section class="card">
        <h2>2 · Freighter</h2>
        ${
          freighterAddress
            ? `
          <p class="addr" title="${freighterAddress}">${short(freighterAddress)}</p>
          <p>Balance: <strong id="freighter-balance">loading…</strong></p>`
            : `
          <p>Connect the Freighter extension (switched to Testnet).</p>
          <button id="connect">Connect Freighter</button>`
        }
      </section>

      <section class="card">
        <h2>3 · Send XLM</h2>
        <form id="send-form">
          <label>Send from
            <select id="send-source">
              ${localWallet ? `<option value="local">Local wallet</option>` : ""}
              ${freighterAddress ? `<option value="freighter">Freighter</option>` : ""}
            </select>
          </label>
          <label>To (public key G…)
            <input id="send-dest" required pattern="G[A-Z2-7]{55}" placeholder="GABC…" />
          </label>
          <label>Amount (XLM)
            <input id="send-amount" required type="number" min="0.0000001" step="any" value="10" />
          </label>
          <label>Memo (optional)
            <input id="send-memo" maxlength="28" placeholder="hello from white belt" />
          </label>
          <button ${localWallet || freighterAddress ? "" : "disabled"}>Send</button>
        </form>
        <p id="send-status"></p>
      </section>

      <section class="card">
        <h2>Recent activity</h2>
        <ul id="history"><li>—</li></ul>
      </section>
    </main>
  `;
  wire();
  refresh();
}

function short(addr) {
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

function setStatus(msg, isError = false) {
  const el = document.querySelector("#send-status");
  el.innerHTML = msg;
  el.className = isError ? "error" : "ok";
}

function wire() {
  document.querySelector("#generate")?.addEventListener("click", () => {
    const kp = Keypair.random();
    localWallet = { public: kp.publicKey(), secret: kp.secret() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localWallet));
    render();
  });

  document.querySelector("#forget")?.addEventListener("click", () => {
    if (!confirm("Remove the local wallet from this browser?")) return;
    localStorage.removeItem(STORAGE_KEY);
    localWallet = null;
    render();
  });

  document.querySelector("#fund")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Requesting friendbot…";
    try {
      await fundWithFriendbot(localWallet.public);
    } catch (err) {
      alert(err.message);
    }
    render();
  });

  document.querySelector("#connect")?.addEventListener("click", async () => {
    const conn = await isConnected();
    if (!conn?.isConnected) {
      alert("Freighter not detected. Install it from freighter.app first.");
      return;
    }
    const access = await requestAccess();
    if (access.error) {
      alert(access.error);
      return;
    }
    freighterAddress = access.address;
    render();
  });

  document.querySelector("#send-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const source = document.querySelector("#send-source").value;
    const dest = document.querySelector("#send-dest").value.trim();
    const amount = document.querySelector("#send-amount").value;
    const memo = document.querySelector("#send-memo").value.trim();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    setStatus("Building & signing transaction…");
    try {
      const sourcePub =
        source === "freighter" ? freighterAddress : localWallet.public;
      const tx = await buildTransfer(sourcePub, dest, amount, memo);

      let signedTx;
      if (source === "freighter") {
        const signed = await signTransaction(tx.toXDR(), {
          networkPassphrase: Networks.TESTNET,
          address: freighterAddress,
        });
        if (signed.error) throw new Error(signed.error);
        signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, Networks.TESTNET);
      } else {
        tx.sign(Keypair.fromSecret(localWallet.secret));
        signedTx = tx;
      }

      setStatus("Submitting to the network…");
      const res = await server.submitTransaction(signedTx);
      setStatus(
        `✅ Sent! <a href="${EXPLORER}/tx/${res.hash}" target="_blank" rel="noreferrer">View on explorer</a>`
      );
      refresh();
    } catch (err) {
      const codes =
        err?.response?.data?.extras?.result_codes?.operations?.join(", ");
      setStatus(`Failed: ${codes || err.message}`, true);
    } finally {
      btn.disabled = false;
    }
  });
}

async function refresh() {
  if (localWallet) {
    const el = document.querySelector("#local-balance");
    const bal = await getBalance(localWallet.public).catch(() => null);
    if (el) el.textContent = bal === null ? "not funded yet" : `${bal} XLM`;
  }
  if (freighterAddress) {
    const el = document.querySelector("#freighter-balance");
    const bal = await getBalance(freighterAddress).catch(() => null);
    if (el) el.textContent = bal === null ? "not funded yet" : `${bal} XLM`;
  }
  const active = freighterAddress || localWallet?.public;
  if (active) {
    const list = document.querySelector("#history");
    try {
      const records = await recentPayments(active);
      list.innerHTML =
        records
          .map((r) => {
            const amt =
              r.type === "create_account" ? r.starting_balance : r.amount;
            const dir = (r.to || r.account) === active ? "⬇️ in" : "⬆️ out";
            return `<li>${dir} ${amt} XLM — <a href="${EXPLORER}/tx/${r.transaction_hash}" target="_blank" rel="noreferrer">${r.transaction_hash.slice(0, 8)}…</a></li>`;
          })
          .join("") || "<li>No transactions yet.</li>";
    } catch {
      list.innerHTML = "<li>No transactions yet.</li>";
    }
  }
}

render();
