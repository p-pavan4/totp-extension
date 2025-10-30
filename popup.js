import { decodeSecretToBytes, totp as totpImpl } from './totp.js';

async function getTimeOffset() {
  try {
    const res = await fetch('https://worldtimeapi.org/api/ip');
    const data = await res.json();
    return Math.floor((new Date(data.datetime).getTime() - Date.now()) / 1000);
  } catch {
    return 0;
  }
}

async function totp(secret, digits = 6, period = 30) {
  const keyBytes = decodeSecretToBytes(secret, 'base32');
  const offset = await getTimeOffset();
  const now = Math.floor(Date.now() / 1000) + offset;
  return totpImpl(keyBytes, { digits, period, timestamp: now });
}

// === DOM references ===
const nameEl = document.getElementById("name");
const secretEl = document.getElementById("secret");
const digitsEl = document.getElementById("digits");
const periodEl = document.getElementById("period");
const addBtn = document.getElementById("add");
const clearBtn = document.getElementById("clear");
const listEl = document.getElementById("list");

let intervalTimer, countdownTimer;

// === Storage helpers ===
async function loadTokens() {
  const res = await chrome.storage.local.get("tokens");
  return res.tokens || [];
}
async function saveTokens(tokens) {
  await chrome.storage.local.set({ tokens });
}
async function deleteToken(name) {
  const tokens = (await loadTokens()).filter(t => t.name !== name);
  await saveTokens(tokens);
  renderList(tokens);
}

// === UI rendering ===
async function renderList(tokens) {
  listEl.innerHTML = tokens.length
    ? ""
    : "<div style='color:#777;font-size:13px;'>No tokens added yet</div>";

  if (!tokens.length) return;

  const entries = tokens.map(t => {
    const div = document.createElement("div");
    div.className = "token";

    const name = Object.assign(document.createElement("div"), {
      className: "name",
      textContent: t.name
    });

    const code = Object.assign(document.createElement("div"), {
      className: "code",
      textContent: "—"
    });

    const countdown = Object.assign(document.createElement("span"), {
      textContent: "⏱ ..."
    });

    const copyBtn = Object.assign(document.createElement("button"), {
      className: "smallbtn",
      textContent: "📋"
    });
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(code.textContent);
      copyBtn.textContent = "✓";
      setTimeout(() => (copyBtn.textContent = "📋"), 800);
    };

    const delBtn = Object.assign(document.createElement("button"), {
      className: "smallbtn",
      textContent: "🗑️"
    });
    delBtn.onclick = () => deleteToken(t.name);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.append(countdown, copyBtn, delBtn);

    div.append(name, code, meta);
    listEl.appendChild(div);
    return { ...t, code, countdown };
  });

  if (intervalTimer) clearInterval(intervalTimer);
  if (countdownTimer) clearInterval(countdownTimer);

  async function updateCodes() {
    const now = Math.floor(Date.now() / 1000);
    for (const e of entries) {
      const period = Number(e.period || 30);
      const digits = Number(e.digits || 6);
      const counter = Math.floor(now / period);
      if (e._lastCounter !== counter) {
        e._lastCounter = counter;
        try {
          e.code.textContent = await totp(e.secret, digits, period);
        } catch {
          e.code.textContent = "Error";
        }
      }
    }
  }

  function updateCountdowns() {
    const now = Math.floor(Date.now() / 1000);
    for (const e of entries) {
      const remain = (Number(e.period) || 30) - (now % (Number(e.period) || 30));
      e.countdown.textContent = `⏱ ${remain}s`;
    }
  }

  await updateCodes();
  updateCountdowns();
  intervalTimer = setInterval(updateCodes, 1000);
  countdownTimer = setInterval(updateCountdowns, 1000);
}

// === Events ===
addBtn.onclick = async () => {
  const name = nameEl.value.trim();
  const secret = secretEl.value.trim();
  if (!name || !secret) return alert("Please fill both Name and Secret");

  try {
    decodeSecretToBytes(secret, 'base32');
  } catch {
    return alert("Invalid Base32 secret");
  }

  const digits = Number(digitsEl.value) || 6;
  const period = Number(periodEl.value) || 30;
  const tokens = await loadTokens();

  if (tokens.find(t => t.name === name)) {
    return alert("A token with that name already exists.");
  }

  tokens.push({ name, secret, digits, period });
  await saveTokens(tokens);
  nameEl.value = secretEl.value = "";
  renderList(tokens);
};

clearBtn.onclick = () => {
  nameEl.value = "";
  secretEl.value = "";
};

// === Init ===
(async () => {
  const tokens = await loadTokens();
  renderList(tokens);
})();
