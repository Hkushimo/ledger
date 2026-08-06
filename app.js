const STORAGE_KEY = "simple-ledger-transactions-v1";
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

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

let transactions = loadTransactions();

registerServiceWorker();
dateInput.valueAsDate = new Date();
render();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const amount = Number(amountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) return;

  transactions.unshift({
    id: crypto.randomUUID(),
    date: dateInput.value,
    person: normalizePerson(personInput.value),
    type: typeInput.value,
    amount: roundMoney(amount),
    memo: memoInput.value.trim(),
  });

  saveTransactions();
  form.reset();
  dateInput.valueAsDate = new Date();
  personInput.focus();
  render();
});

transactionsBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;

  transactions = transactions.filter((entry) => entry.id !== button.dataset.delete);
  saveTransactions();
  render();
});

searchInput.addEventListener("input", renderTransactions);
typeFilter.addEventListener("change", renderTransactions);
personFilter.addEventListener("input", renderBalances);

document.querySelector("#clearAll").addEventListener("click", () => {
  if (!transactions.length) return;
  const confirmed = window.confirm("Clear all ledger entries from this browser?");
  if (!confirmed) return;
  transactions = [];
  saveTransactions();
  render();
});

document.querySelector("#exportCsv").addEventListener("click", () => {
  const rows = [
    ["date", "person", "type", "amount", "memo"],
    ...transactions.map((entry) => [
      entry.date,
      entry.person,
      entry.type,
      entry.amount.toFixed(2),
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
  if (!file) return;

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

  transactions = [...imported, ...transactions];
  saveTransactions();
  event.target.value = "";
  render();
});

function render() {
  renderSummary();
  renderPeopleList();
  renderBalances();
  renderTransactions();
}

function renderSummary() {
  const totals = transactions.reduce(
    (acc, entry) => {
      if (entry.type === "deposit") acc.deposits += entry.amount;
      if (entry.type === "withdrawal") acc.withdrawals += entry.amount;
      if (entry.type === "fee") acc.fees += entry.amount;
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

    if (entry.type === "deposit") current.deposits += entry.amount;
    if (entry.type === "withdrawal") current.withdrawals += entry.amount;
    if (entry.type === "fee") current.fees += entry.amount;
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
          <td><button class="danger delete-row" type="button" data-delete="${entry.id}">Delete</button></td>
        </tr>
      `;
    })
    .join("");
}

function signedAmount(entry) {
  return entry.type === "deposit" ? entry.amount : -entry.amount;
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

function loadTransactions() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

function isEntry(entry) {
  return (
    entry &&
    typeof entry.id === "string" &&
    typeof entry.date === "string" &&
    typeof entry.person === "string" &&
    ["deposit", "withdrawal", "fee"].includes(entry.type) &&
    Number.isFinite(entry.amount)
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

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // The ledger still runs without offline caching.
    });
  });
}
