window.initLegacy = function initLegacy() {
  if (window.__legacyInit) return;
  window.__legacyInit = true;

const $ = (id) => document.getElementById(id);

  const navItems = Array.from(document.querySelectorAll(".nav-item"));
  const panels = Array.from(document.querySelectorAll(".panel"));

  function setPanel(id) {
    panels.forEach(p => p.classList.toggle("active", p.id === id));
    navItems.forEach(n => n.classList.toggle("active", n.dataset.panel === id));
    localStorage.setItem("activePanel", id);
  }

  const savedPanel = localStorage.getItem("activePanel") || "dashboard";
  setPanel(savedPanel);

  navItems.forEach(btn => {
    btn.addEventListener("click", () => setPanel(btn.dataset.panel));
  });

  const journal = $("journalText");
  if (journal) {
    journal.value = localStorage.getItem("journalText") || "";
    journal.addEventListener("input", () => {
      localStorage.setItem("journalText", journal.value);
    });
  }

  const heroUpdate = $("btnRefreshDataHero");
  if (heroUpdate) heroUpdate.addEventListener("click", refreshLiveData);

  // Table currency toggle state
  let tableCurrency = "USD"; // "USD" | "GBP"

  const inputs = [
    "price",
    "slPips","tp1Pips","tp2Pips",
    "lotInput","usdToGbp","ladderLots"
  ].map($);

  function n(v) {
    const x = Number(v);
    return Number.isFinite(x) ? x : NaN;
  }

  function fmtMoney(x, ccy="USD") {
    if (!Number.isFinite(x)) return "—";
    return new Intl.NumberFormat(undefined, { style:"currency", currency: ccy, maximumFractionDigits: 2 }).format(x);
  }

  function fmtNum(x, digits=2) {
    if (!Number.isFinite(x)) return "—";
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(x);
  }

  // USD formatting as "$" (not "US$")
  function fmtUsd(x) {
    if (!Number.isFinite(x)) return "—";
    const sign = x < 0 ? "-" : "";
    const abs = Math.abs(x);
    return sign + "$" + new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(abs);
  }

  // GBP formatting as "£"
  function fmtGbp(x) {
    if (!Number.isFinite(x)) return "—";
    const sign = x < 0 ? "-" : "";
    const abs = Math.abs(x);
    return sign + "£" + new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(abs);
  }

  function parseLots(text) {
    return String(text || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter(v => Number.isFinite(v) && v > 0);
  }

  // Fixed broker/product rules
  const LEVERAGE = 500;      // 1:500
  const PIP_PER_OZ = 0.1;    // $0.10 per oz per pip
  const PIP_SIZE = 0.1;      // price units per pip (for the "≈ price/oz" hint)
  const CONTRACT_SIZE = 100; // 1 lot = 100 oz (fixed)

  function coreForLot(lot, price, slPips, tp1Pips, tp2Pips) {
    const ozExposure = lot * CONTRACT_SIZE;
    const notionalUsd = ozExposure * price;
    const marginUsd = notionalUsd / LEVERAGE;
    const pipValueUsd = ozExposure * PIP_PER_OZ;

    const slUsd = -pipValueUsd * slPips;
    const tp1Usd = pipValueUsd * tp1Pips;
    const tp2Usd = pipValueUsd * tp2Pips;

    return { ozExposure, notionalUsd, marginUsd, pipValueUsd, slUsd, tp1Usd, tp2Usd };
  }

  async function fetchUsdGbp() {
    const url = "https://open.er-api.com/v6/latest/USD";
    const res = await fetch(url);
    if (!res.ok) throw new Error("FX fetch failed");
    const data = await res.json();

    const rate = data?.rates?.GBP;
    if (!Number.isFinite(rate)) throw new Error("Bad FX data");

    $("usdToGbp").value = rate.toFixed(4);
  }

  async function fetchXauUsd() {
    const url = "https://giavang.now/api/prices?type=XAUUSD";
    const res = await fetch(url);
    if (!res.ok) throw new Error("XAUUSD fetch failed");

    const data = await res.json();

    const toNum = (v) => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v !== "string") return NaN;

      const cleaned = v.replace(/[^0-9.\-]/g, "");
      if (!cleaned || !/[0-9]/.test(cleaned)) return NaN;

      const num = Number(cleaned);
      return Number.isFinite(num) ? num : NaN;
    };

    const rows = Array.isArray(data?.data) ? data.data : [];
    const row =
      rows.find(r => String(r?.type || r?.symbol || r?.name || "").toUpperCase().includes("XAUUSD")) ||
      rows[0] ||
      null;

    const candidates = [
      row?.sell, row?.buy,
      row?.ask, row?.bid,
      row?.price,
      data?.sell, data?.buy,
      data?.ask, data?.bid,
      data?.price
    ];

    let price = NaN;
    for (const c of candidates) {
      const nn = toNum(c);
      if (Number.isFinite(nn) && nn > 100 && nn < 20000) {
        price = nn;
        break;
      }
    }

    if (!Number.isFinite(price)) {
      console.log("XAUUSD raw response:", data);
      throw new Error("Bad XAUUSD data (see console: XAUUSD raw response)");
    }

    return price;
  }

  async function refreshLiveData() {
    try { await fetchUsdGbp(); } catch (e) { console.warn(e); }

    try {
      const gold = await fetchXauUsd();
      $("price").value = gold.toFixed(2);
    } catch (e) {
      console.warn(e);
    }

    compute();
  }

  $("btnRefreshData").addEventListener("click", refreshLiveData);

  let liveTimer = null;
  $("autoLive").addEventListener("change", () => {
    if ($("autoLive").checked) {
      refreshLiveData();
      liveTimer = setInterval(refreshLiveData, 60_000);
    } else {
      clearInterval(liveTimer);
      liveTimer = null;
    }
  });

  // Table USD/GBP toggle
  $("toggleTableCurrency").addEventListener("click", () => {
    tableCurrency = tableCurrency === "USD" ? "GBP" : "USD";
    $("toggleTableCurrency").textContent = tableCurrency === "USD" ? "Show GBP" : "Show USD";
    compute();
  });

  ["entryPrice","exitPrice","calcLot"].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("input", computePriceMove);
  });

  function computePriceMove() {
    const entry = n($("entryPrice")?.value);
    const exit = n($("exitPrice")?.value);
    const lot = n($("calcLot")?.value);

    if (!Number.isFinite(entry) || !Number.isFinite(exit) || !Number.isFinite(lot)) {
      $("priceMoveResult").textContent = "—";
      return;
    }

    const move = exit - entry;
    const oz = lot * CONTRACT_SIZE;

    const pnl = move * oz;

    const label = pnl >= 0 ? "Profit" : "Loss";

    $("priceMoveResult").textContent =
      `${label}: ${fmtUsd(pnl)}`;

    $("priceMoveDetail").textContent =
      `Move: ${fmtNum(move,2)} × ${fmtNum(oz,2)} oz = ${fmtUsd(pnl)}`;
  }

  // ---- Risk Flow ----
  const flowState = {
    outcomes: [] // 0=SL, 1=TP1, 2=TP2 per trade index
  };

  function parseFlowLots(text) {
    return String(text || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter(v => Number.isFinite(v) && v > 0);
  }

  function outcomePnlUsd(r, outcomeIdx) {
    if (outcomeIdx === 0) return r.slUsd;   // already negative
    if (outcomeIdx === 1) return r.tp1Usd;
    return r.tp2Usd;
  }

  function renderRiskFlow() {
    const flowEl = $("flow");
    if (!flowEl) return;

    const price = n($("price").value);
    const slPips = n($("slPips").value);
    const tp1Pips = n($("tp1Pips").value);
    const tp2Pips = n($("tp2Pips").value);

    const startBal = n($("startBal")?.value);
    const stopBelow = n($("stopBelow")?.value);

    const lots = parseFlowLots($("flowLots")?.value);

    // Ensure outcomes length
    while (flowState.outcomes.length < lots.length) flowState.outcomes.push(2); // default TP2
    flowState.outcomes = flowState.outcomes.slice(0, lots.length);

    flowEl.innerHTML = "";

    let bal = Number.isFinite(startBal) ? startBal : 0;
    let stopped = false;

    lots.forEach((lot, i) => {
      const r = coreForLot(lot, price, slPips, tp1Pips, tp2Pips);
      const outcome = flowState.outcomes[i] ?? 2;
      const pnl = outcomePnlUsd(r, outcome);

      const before = bal;
      if (!stopped) bal = bal + pnl;

      const node = document.createElement("div");
      node.className = "flow-node";

      node.innerHTML = `
        <div class="flow-top">
          <div>
            <div class="flow-title">Trade #${i + 1} <span class="badge">lot ${fmtNum(lot, 2)}</span></div>
            <div class="flow-sub">1 pip move: ${fmtUsd(r.pipValueUsd)} • SL: ${fmtUsd(r.slUsd)} • TP1: ${fmtUsd(r.tp1Usd)} • TP2: ${fmtUsd(r.tp2Usd)}</div>
          </div>

          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <label class="small" style="margin:0;opacity:.75;">Outcome</label>
            <select data-flow-idx="${i}" style="width:auto;grid-column:auto;">
              <option value="0">Hit SL</option>
              <option value="1">Hit TP1</option>
              <option value="2">Hit TP2</option>
            </select>
          </div>
        </div>

        <div class="flow-grid">
          <div class="flow-bubble">Before: ${fmtUsd(before)}</div>
          <div class="flow-bubble">After: ${stopped ? "— (stopped)" : fmtUsd(bal)}</div>
        </div>
      `;

      const sel = node.querySelector("select");
      sel.value = String(outcome);
      sel.addEventListener("change", (e) => {
        flowState.outcomes[i] = Number(e.target.value);
        renderRiskFlow();
      });

      flowEl.appendChild(node);

      // Stop rule check
      if (!stopped && Number.isFinite(stopBelow) && bal <= stopBelow) {
        stopped = true;

        const end = document.createElement("div");
        end.className = "flow-end";
        end.innerHTML = `<div class="flow-title">Stop trading</div>
                         <div class="small">Balance fell to ${fmtUsd(bal)} (≤ ${fmtUsd(stopBelow)}).</div>`;
        flowEl.appendChild(end);
      }
    });

    if (!stopped) {
      const end = document.createElement("div");
      end.className = "flow-end";
      end.innerHTML = `<div class="flow-title">End day on ${fmtUsd(bal)}</div>
                       <div class="small">End-of-day balance projection</div>`;
      flowEl.appendChild(end);
    }
  }

  function compute() {
    const heroPrice = $("heroPrice");
    const heroFx = $("heroFx");
    const heroPip = $("heroPip");
    const heroRr = $("heroRr");

    const price = n($("price").value);

    const slPips = n($("slPips").value);
    const tp1Pips = n($("tp1Pips").value);
    const tp2Pips = n($("tp2Pips").value);

    const lot = n($("lotInput").value);

    const rate = n($("usdToGbp").value); // USD → GBP
    const fxOk = Number.isFinite(rate) && rate > 0;

    // Single-lot
    const one = coreForLot(lot, price, slPips, tp1Pips, tp2Pips);

    $("ozOut").textContent = fmtNum(one.ozExposure, 2);
    $("notionalOut").textContent = fmtMoney(one.notionalUsd, "USD");
    $("marginOut").textContent = fmtMoney(one.marginUsd, "USD");
    $("pipValueOut").textContent = fmtMoney(one.pipValueUsd, "USD");

    $("targetsOut").textContent =
      `${fmtMoney(one.slUsd, "USD")} / ${fmtMoney(one.tp1Usd, "USD")} / ${fmtMoney(one.tp2Usd, "USD")}`;

    const movePriceSl = slPips * PIP_SIZE;
    const movePriceTp1 = tp1Pips * PIP_SIZE;
    const movePriceTp2 = tp2Pips * PIP_SIZE;

    $("targetsDetail").textContent =
      `SL ${fmtNum(slPips,0)} pips (≈ ${fmtNum(movePriceSl,2)} price/oz), TP1 ${fmtNum(tp1Pips,0)} pips (≈ ${fmtNum(movePriceTp1,2)}), TP2 ${fmtNum(tp2Pips,0)} pips (≈ ${fmtNum(movePriceTp2,2)})`;

    // FX line (GBP only)
    $("fxHint").textContent = fxOk
      ? `Using USD → GBP rate: ${fmtNum(rate,4)}`
      : "Set a valid USD → GBP rate.";

    $("acctOut").textContent = fxOk
      ? `Notional: ${fmtMoney(one.notionalUsd*rate, "GBP")}  |  Margin: ${fmtMoney(one.marginUsd*rate, "GBP")}  |  £/pip: ${fmtMoney(one.pipValueUsd*rate, "GBP")}  |  SL/TP1/TP2: ${fmtMoney(one.slUsd*rate, "GBP")} / ${fmtMoney(one.tp1Usd*rate, "GBP")} / ${fmtMoney(one.tp2Usd*rate, "GBP")}`
      : "—";

    // Ladder table (USD/GBP toggle)
    const lots = parseLots($("ladderLots").value);
    const tbody = $("ladderBody");
    tbody.innerHTML = "";

    const mult = (tableCurrency === "GBP" && fxOk) ? rate : 1;

    for (const L of lots) {
      const r = coreForLot(L, price, slPips, tp1Pips, tp2Pips);

      const tr = document.createElement("tr");

      const cLot = document.createElement("td");
      cLot.textContent = fmtNum(L, 2);
      tr.appendChild(cLot);

      const cPip = document.createElement("td");
      const cSL  = document.createElement("td");
      const cTP1 = document.createElement("td");
      const cTP2 = document.createElement("td");

      if (tableCurrency === "GBP") {
        cPip.textContent = fxOk ? fmtGbp(r.pipValueUsd * mult) : "—";
        cSL.textContent  = fxOk ? fmtGbp(r.slUsd * mult) : "—";
        cTP1.textContent = fxOk ? fmtGbp(r.tp1Usd * mult) : "—";
        cTP2.textContent = fxOk ? fmtGbp(r.tp2Usd * mult) : "—";
      } else {
        cPip.textContent = fmtUsd(r.pipValueUsd);
        cSL.textContent  = fmtUsd(r.slUsd);
        cTP1.textContent = fmtUsd(r.tp1Usd);
        cTP2.textContent = fmtUsd(r.tp2Usd);
      }

      tr.appendChild(cPip);
      tr.appendChild(cSL);
      tr.appendChild(cTP1);
      tr.appendChild(cTP2);

      tbody.appendChild(tr);
    }

    // RR display (TP2/SL)
    const rr = (Number.isFinite(tp2Pips) && Number.isFinite(slPips) && slPips > 0) ? (tp2Pips / slPips) : NaN;
    $("rrOut").textContent = Number.isFinite(rr)
      ? `RR: 1:${Number.isInteger(rr) ? rr : rr.toFixed(2)}`
      : "RR: —";

    if (heroPrice) heroPrice.textContent = Number.isFinite(price) ? `$${fmtNum(price,2)}` : "$—";
    if (heroFx) heroFx.textContent = fxOk ? fmtNum(rate,4) : "—";
    if (heroPip) heroPip.textContent = fmtUsd(one.pipValueUsd);
    if (heroRr) heroRr.textContent = Number.isFinite(rr) ? `1:${Number.isInteger(rr) ? rr : rr.toFixed(2)}` : "—";

    // Explain panel (step-by-step)
    const oz = one.ozExposure;
    const explain =
`Fixed settings:
  Contract size = ${CONTRACT_SIZE} oz per 1 lot
  Leverage = 1:${LEVERAGE}
  Pip value per oz = $${fmtNum(PIP_PER_OZ,2)} per pip per oz
  Pip size = ${fmtNum(PIP_SIZE,2)} price units per pip

1) Ounces
  ozExposure = lot × contractSize
            = ${fmtNum(lot,2)} × ${CONTRACT_SIZE}
            = ${fmtNum(oz,2)} oz

2) Notional value (USD)
  notional = ozExposure × price
          = ${fmtNum(oz,2)} × ${fmtNum(price,2)}
          = ${fmtNum(one.notionalUsd,2)} USD

3) Margin required (USD)
  margin = notional / leverage
         = ${fmtNum(one.notionalUsd,2)} / ${fmtNum(LEVERAGE,0)}
         = ${fmtNum(one.marginUsd,2)} USD

4) Pip value (USD per pip)
  pipValue = ozExposure × pipPerOz
           = ${fmtNum(oz,2)} × ${fmtNum(PIP_PER_OZ,2)}
           = ${fmtNum(one.pipValueUsd,2)} USD/pip

5) SL/TP money outcomes (USD)
  SL$  = -pipValue × SLpips  = -${fmtNum(one.pipValueUsd,2)} × ${fmtNum(slPips,0)} = ${fmtNum(one.slUsd,2)}
  TP1$ =  pipValue × TP1pips =  ${fmtNum(one.pipValueUsd,2)} × ${fmtNum(tp1Pips,0)} = ${fmtNum(one.tp1Usd,2)}
  TP2$ =  pipValue × TP2pips =  ${fmtNum(one.pipValueUsd,2)} × ${fmtNum(tp2Pips,0)} = ${fmtNum(one.tp2Usd,2)}

(Optional) Converting pips → price move per oz
  priceMove = pips × pipSize
  SL move:  ${fmtNum(slPips,0)} × ${fmtNum(PIP_SIZE,2)} = ${fmtNum(slPips*PIP_SIZE,2)} (USD/oz)
  TP1 move: ${fmtNum(tp1Pips,0)} × ${fmtNum(PIP_SIZE,2)} = ${fmtNum(tp1Pips*PIP_SIZE,2)} (USD/oz)
  TP2 move: ${fmtNum(tp2Pips,0)} × ${fmtNum(PIP_SIZE,2)} = ${fmtNum(tp2Pips*PIP_SIZE,2)} (USD/oz)

(Optional) USD → GBP
  valueGBP = valueUSD × rate
  rate = ${fxOk ? fmtNum(rate,4) : "—"}
`;
    $("explainBlock").textContent = explain;

    renderRiskFlow();
  }

  inputs.forEach(el => el.addEventListener("input", compute));

  ["startBal","stopBelow","flowLots"].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("input", compute);
  });

  $("btnLoadYourTable").addEventListener("click", () => {
    $("slPips").value = 100;
    $("tp1Pips").value = 30;
    $("tp2Pips").value = 300;
    $("ladderLots").value = "0.01,0.05,0.1,0.15,0.2,0.25,0.3,0.4,0.5";
    compute();
  });

  computePriceMove();
  compute();

};
