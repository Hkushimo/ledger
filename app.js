const API_URL = "https://script.google.com/macros/s/AKfycbzonW0VKREVtOx8jb7h7mv9iAnmJGJ7OaOWRle4tyZf8AhRt1hyEHPslu_iCCmv55LZNA/exec";
const CACHE_KEY = "shared-ledger-cache-v1";
const UNASSIGNED = "Unassigned";

const form = document.querySelector("#transactionForm");
const dateInput = document.querySelector("#date");
const personInput = document.querySelector("#person");
const typeInput = document.querySelector("#type");
const amountInput = document.querySelector("#amount");
const memoInput = document.querySelector("#memo");
const searchInput = document.querySelector("#search");
const typeFilter = document.querySelector("#typeFilter");
const personFilter = document.querySelector("#personFilter");
const transactionsBody = document.querySelector("#transactions");
const balancesEl = document.querySelector("#balances");
const peopleList = document.querySelector("#peopleList");
const statusEl = document.querySelector("#status");
const entryCountEl = document.querySelector("#entryCount");

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

let transactions = loadCachedTransactions();
let busy = false;

registerServiceWorker();
dateInput.valueAsDate = new Date();
render();
refreshRemote();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const amount = Number(amountInput.value);
  if (!Number.isFinite(amount) || amount <= 0 || busy) return;

  const entry = {
    id: crypto.randomUUID(),
    date: dateInput.value,
    person: normalizePerson(personInput.value),
    type: typeInput.value,
    amount: roundMoney(amount),
    memo: memoInput.value.trim(),
  };

  try {
    setBusy(true, "Saving to shared sheet...");
    await postRemote("add", { entry });
    form.reset();
    dateInput.valueAsDate = new Date();
    personInput.focus();
    await refreshRemote("Saved.");
  } catch (error) {
    showError(error);
  }
});

transactionsBody.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button || busy) return;

  try {
    setBusy(true, "Deleting from shared sheet...");
    await postRemote("delete", { id: button.dataset.delete });
    await refreshRemote("Deleted.");
  } catch (error) {
    showError(error);
  }
});

searchInput.addEventListener("input", renderTransactions);
typeFilter.addEventListener("change", renderTransactions);
personFilter.addEventListener("input", renderBalances);

document.querySelector("#refresh").addEventListener("click", () => {
  if (!busy) refreshRemote();
});

document.querySelector("#clearAll").addEventListener("click", async () => {
  if (!transactions.length || busy) return;
  const confirmed = window.confirm("Clear all entries from the shared Google Sheet?");
  if (!confirmed) return;

  try {
    setBusy(true, "Clearing shared sheet...");
    await postRemote("clear", {});
    await refreshRemote("Cleared.");
  } catch (error) {
    showError(error);
  }
});

document.querySelector("#exportCsv").addEventListener("click", () => {
  const rows = [
    ["date", "person", "type", "amount", "memo"],
    ...transactions.map((entry) => [
      entry.date,
      entry.person,
      entry.type,
      Number(entry.amount).toFixed(2),
      entry.memo,
    ]),
  ];

  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

document.querySelector("#importCsv").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file || busy) return;

  const text = await file.text();
  const imported = parseCsv(text)
    .slice(1)
    .map(rowToEntry)
    .filter(Boolean);

  if (!imported.length) {
    window.alert("No valid entries found in that CSV.");
    event.target.value = "";
    return;
  }

  try {
    setBusy(true, "Importing to shared sheet...");
    await postRemote("import", { entries: imported });
    event.target.value = "";
    await refreshRemote("Imported.");
  } catch (error) {
    showError(error);
  }
});

async function refreshRemote(doneMessage = "Synced.") {
  try {
    setBusy(true, "Loading shared sheet...");
    const payload = await getRemote("list");
    transactions = Array.isArray(payload.entries) ? payload.entries.filter(isEntry) : [];
    saveCachedTransactions();
    render();
    setBusy(false, doneMessage);
  } catch (error) {
    showError(error);
  }
}

function render() {
  renderSummary();
  renderPeopleList();
  renderBalances();
  renderTransactions();
  entryCountEl.textContent = `${transactions.length} ${transactions.length === 1 ? "entry" : "entries"}`;
}

function renderSummary() {
  const totals = transactions.reduce(
    (acc, entry) => {
      if (entry.type === "deposit") acc.deposits += Number(entry.amount);
      if (entry.type === "withdrawal") acc.withdrawals += Number(entry.amount);
      if (entry.type === "fee") acc.fees += Number(entry.amount);
      return acc;
    },
    { deposits: 0, withdrawals: 0, fees: 0 },
  );

  document.querySelector("#accountBalance").textContent = money.format(
    totals.deposits - totals.withdrawals - totals.fees,
  );
  document.querySelector("#totalDeposits").textContent = money.format(totals.deposits);
  document.querySelector("#totalWithdrawals").textContent = money.format(totals.withdrawals);
  document.querySelector("#totalFees").textContent = money.format(totals.fees);
}

function renderPeopleList() {
  const people = [...new Set(transactions.map((entry) => entry.person))]
    .filter((person) => person !== UNASSIGNED)
    .sort((a, b) => a.localeCompare(b));

  peopleList.innerHTML = people.map((person) => `<option value="${escapeHtml(person)}"></option>`).join("");
}

function renderBalances() {
  const filter = personFilter.value.trim().toLowerCase();
  const balances = new Map();

  transactions.forEach((entry) => {
    const current = balances.get(entry.person) || {
      person: entry.person,
      deposits: 0,
      withdrawals: 0,
      fees: 0,
      balance: 0,
    };

    if (entry.type === "deposit") current.deposits += Number(entry.amount);
    if (entry.type === "withdrawal") current.withdrawals += Number(entry.amount);
    if (entry.type === "fee") current.fees += Number(entry.amount);
    current.balance += signedAmount(entry);
    balances.set(entry.person, current);
  });

  const rows = [...balances.values()]
    .filter((row) => row.person.toLowerCase().includes(filter))
    .sort((a, b) => b.balance - a.balance || a.person.localeCompare(b.person));

  if (!rows.length) {
    balancesEl.innerHTML = '<div class="empty">No balances yet.</div>';
    return;
  }

  balancesEl.innerHTML = rows
    .map((row) => {
      const tone = row.balance < 0 ? "negative" : "positive";
      return `
        <div class="balance-row">
          <div>
            <div class="person-name">${escapeHtml(row.person)}</div>
            <div class="person-detail">
              Deposits ${money.format(row.deposits)} | Withdrawals ${money.format(row.withdrawals)} | Fees ${money.format(row.fees)}
            </div>
          </div>
          <div class="balance-amount ${tone}">${money.format(row.balance)}</div>
        </div>
      `;
    })
    .join("");
}

function renderTransactions() {
  const search = searchInput.value.trim().toLowerCase();
  const type = typeFilter.value;
  const filtered = transactions.filter((entry) => {
    const matchesType = type === "all" || entry.type === type;
    const haystack = `${entry.date} ${entry.person} ${entry.type} ${entry.memo}`.toLowerCase();
    return matchesType && haystack.includes(search);
  });

  if (!filtered.length) {
    transactionsBody.innerHTML = '<tr><td class="empty" colspan="6">No entries match.</td></tr>';
    return;
  }

  transactionsBody.innerHTML = filtered
    .map((entry) => {
      const signed = signedAmount(entry);
      const tone = signed < 0 ? "negative" : "positive";
      return `
        <tr>
          <td>${escapeHtml(entry.date)}</td>
          <td>${escapeHtml(entry.person)}</td>
          <td><span class="type-pill">${labelForType(entry.type)}</span></td>
          <td>${escapeHtml(entry.memo || "")}</td>
          <td class="money ${tone}">${money.format(signed)}</td>
          <td><button class="danger delete-row" type="button" data-delete="${entry.id}" ${busy ? "disabled" : ""}>Delete</button></td>
        </tr>
      `;
    })
    .join("");
}

function getRemote(action) {
  return new Promise((resolve, reject) => {
    const callbackName = `ledgerCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(API_URL);
    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("_", String(Date.now()));

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("The shared sheet did not respond."));
    }, 20000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (payload) => {
      cleanup();
      if (payload && payload.ok) {
        resolve(payload);
      } else {
        reject(new Error((payload && payload.error) || "Shared sheet request failed."));
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Unable to connect to the shared sheet."));
    };

    script.src = url.toString();
    document.head.append(script);
  });
}

async function postRemote(action, payload) {
  await fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({ action, ...payload }),
  });

  await delay(700);
}

function setBusy(nextBusy, message) {
  busy = nextBusy;
  statusEl.textContent = message;
  document.querySelectorAll("button").forEach((button) => {
    button.disabled = nextBusy;
  });
  renderTransactions();
}

function showError(error) {
  setBusy(false, "Sync error.");
  window.alert(error && error.message ? error.message : String(error));
}

function signedAmount(entry) {
  return entry.type === "deposit" ? Number(entry.amount) : -Number(entry.amount);
}

function labelForType(type) {
  if (type === "deposit") return "Deposit";
  if (type === "withdrawal") return "Withdrawal";
  return "Service fee";
}

function normalizePerson(value) {
  return value.trim() || UNASSIGNED;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function loadCachedTransactions() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function saveCachedTransactions() {
  localStorage.setItem(CACHE_KEY, JSON.stringify(transactions));
}

function isEntry(entry) {
  return (
    entry &&
    typeof entry.id === "string" &&
    typeof entry.date === "string" &&
    typeof entry.person === "string" &&
    ["deposit", "withdrawal", "fee"].includes(entry.type) &&
    Number.isFinite(Number(entry.amount))
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function rowToEntry(row) {
  const [date, person, type, amount, memo = ""] = row;
  const value = Number(amount);

  if (!date || !["deposit", "withdrawal", "fee"].includes(type) || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    date,
    person: normalizePerson(person || ""),
    type,
    amount: roundMoney(value),
    memo,
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // The ledger still runs without offline caching.
    });
  });
}
