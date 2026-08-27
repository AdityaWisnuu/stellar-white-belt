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
let firstRender = true;
let displayedBalance = 0;

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
    throw new Error(body?.detail || `friendbot failed (${res.status})`);
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
    .limit(6)
    .call();
  return records;
}

// ---------- UI ----------
const app = document.querySelector("#app");
const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function short(addr) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function activeAccount() {
  return freighterAddress || localWallet?.public || null;
}

function render() {
  const active = activeAccount();
  app.innerHTML = `
    <div class="wrap ${firstRender ? "reveal" : ""}">
      <header class="masthead">
        <p class="kicker">Stellar Dojo · Journey to Mastery · <b>Level 1 — White Belt</b></p>
        <h1>First<br />Steps 🥋</h1>
        <div class="beltline" role="presentation"></div>
        <p class="lede">Forge a wallet, fund it from the faucet, and land your first transactions on the <a href="https://stellar.org" target="_blank" rel="noreferrer">Stellar</a> testnet ledger.</p>
      </header>

      <section class="stats" aria-label="Account overview">
        <div class="stat"><output id="stat-balance">0</output><label>XLM balance</label></div>
        <div class="stat">
          <output>${active ? `<a href="${EXPLORER}/account/${active}" target="_blank" rel="noreferrer">${short(active)}</a>` : "—"}</output>
          <label>active account</label>
        </div>
        <div class="stat"><output>testnet</output><label>network</label></div>
      </section>

      <div class="stage">
        <div>
          <section class="panel">
            <h2>Local wallet</h2>
            ${
              localWallet
                ? `<p class="addr" title="${localWallet.public}">${short(localWallet.public)} <span class="muted small">· in-browser keypair</span></p>
                   <p class="small" id="local-balance-line">Balance <strong id="local-balance">…</strong></p>
                   <p style="display:flex;gap:0.6rem;flex-wrap:wrap">
                     <button id="fund">Fund with friendbot</button>
                     <button id="forget" class="ghost">Forget wallet</button>
                   </p>`
                : `<p class="muted">Generate a fresh Ed25519 keypair — it never leaves your browser.</p>
                   <button id="generate">Generate wallet</button>`
            }
          </section>

          <section class="panel">
            <h2>Freighter</h2>
            ${
              freighterAddress
                ? `<p class="addr" title="${freighterAddress}">${short(freighterAddress)} <span class="muted small">· Freighter</span></p>
                   <p class="small">Balance <strong id="freighter-balance">…</strong></p>`
                : `<p class="muted">Or connect the Freighter extension, switched to testnet.</p>
                   <button id="connect">Connect Freighter</button>`
            }
          </section>

          <section class="panel">
            <h2>Send XLM</h2>
            <form id="send-form">
              <label><span>From</span>
                <select id="send-source" style="background:var(--ink-2);color:var(--paper);border:1px solid var(--line);padding:0.75rem 0.85rem;font:inherit">
                  ${localWallet ? `<option value="local">Local wallet</option>` : ""}
                  ${freighterAddress ? `<option value="freighter">Freighter</option>` : ""}
                </select>
              </label>
              <label><span>To · public key</span>
                <input id="send-dest" required pattern="G[A-Z2-7]{55}" placeholder="G…" />
              </label>
              <label><span>Amount · XLM</span>
                <input id="send-amount" required type="number" min="0.0000001" step="any" value="10" />
              </label>
              <label><span>Memo · optional</span>
                <input id="send-memo" maxlength="28" placeholder="hello from the dojo" />
              </label>
              <button ${localWallet || freighterAddress ? "" : "disabled"}>Send on-chain</button>
            </form>
            <p class="status" id="send-status" role="status"></p>
          </section>
        </div>

        <section class="panel">
          <div class="feedhead"><h2>On-chain activity</h2></div>
          <ul id="feed"><li class="muted">No account yet — generate a wallet to begin.</li></ul>
        </section>
      </div>

      <footer class="belts">
        <i style="--b:#f2f0e9" class="on"></i>
        <i style="--b:#ffd42d"></i>
        <i style="--b:#ff9d2d"></i>
        <i style="--b:#57d364"></i>
        <i style="--b:#4aa3ff"></i>
        <i style="--b:#666"></i>
        <span>white belt · built by <a href="https://github.com/AdityaWisnuu/stellar-white-belt" style="color:var(--paper)">AdityaWisnuu</a></span>
      </footer>
    </div>
  `;
  firstRender = false;
  wire();
  refresh();
}

function countUp(el, from, to) {
  const t0 = performance.now();
  const dur = 700;
  const tick = (t) => {
    const p = Math.min((t - t0) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt.format(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(tick);
    else el.classList.add("lit");
  };
  requestAnimationFrame(tick);
}

function setStatus(msg, isError = false) {
  const el = document.querySelector("#send-status");
  el.innerHTML = msg;
  el.className = `status ${isError ? "error" : "ok"}`;
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
  const active = activeAccount();

  if (localWallet) {
    const el = document.querySelector("#local-balance");
    const bal = await getBalance(localWallet.public).catch(() => null);
    if (el) el.textContent = bal === null ? "not funded yet" : `${fmt.format(Number(bal))} XLM`;
    if (!freighterAddress && bal !== null) updateBalanceStat(Number(bal));
    if (bal === null) updateBalanceStat(0);
  }
  if (freighterAddress) {
    const el = document.querySelector("#freighter-balance");
    const bal = await getBalance(freighterAddress).catch(() => null);
    if (el) el.textContent = bal === null ? "not funded" : `${fmt.format(Number(bal))} XLM`;
    if (bal !== null) updateBalanceStat(Number(bal));
  }

  if (active) {
    const list = document.querySelector("#feed");
    try {
      const records = await recentPayments(active);
      list.innerHTML =
        records
          .map((r) => {
            const amt = r.type === "create_account" ? r.starting_balance : r.amount;
            const dir = (r.to || r.account) === active ? "⬇ in" : "⬆ out";
            return `<li><span class="amt">${fmt.format(Number(amt))} XLM</span> ${dir}<br />
              <a class="small" href="${EXPLORER}/tx/${r.transaction_hash}" target="_blank" rel="noreferrer">${r.transaction_hash.slice(0, 8)}… ↗</a></li>`;
          })
          .join("") || `<li class="muted">No transactions yet.</li>`;
    } catch {
      list.innerHTML = `<li class="muted">No transactions yet — fund the wallet first.</li>`;
    }
  }
}

function updateBalanceStat(value) {
  const el = document.querySelector("#stat-balance");
  if (!el || value === displayedBalance) return;
  countUp(el, displayedBalance, value);
  displayedBalance = value;
}

render();
setInterval(refresh, 12000);
