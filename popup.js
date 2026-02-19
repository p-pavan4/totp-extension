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
const progressBar = document.getElementById("progress-bar");
const searchEl = document.getElementById("search");

// Search Logic
// Search & Selection Logic
let selectedIndex = 0;

function getVisibleTokens() {
  return Array.from(document.querySelectorAll(".token")).filter(t => t.style.display !== "none");
}

function updateSelection() {
  const visible = getVisibleTokens();
  if (visible.length === 0) return;

  // Clamp index
  if (selectedIndex < 0) selectedIndex = 0;
  if (selectedIndex >= visible.length) selectedIndex = visible.length - 1;

  // Update UI
  document.querySelectorAll(".token").forEach(t => t.classList.remove("selected"));
  const selected = visible[selectedIndex];
  if (selected) {
    selected.classList.add("selected");
    selected.scrollIntoView({ block: "nearest" });
  }
}

searchEl.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase();
  const tokens = document.querySelectorAll(".token");
  tokens.forEach(token => {
    const name = token.querySelector(".name").textContent.toLowerCase();
    token.style.display = name.includes(query) ? "flex" : "none";
  });
  selectedIndex = 0;
  updateSelection();
});

searchEl.addEventListener("keydown", (e) => {
  const visible = getVisibleTokens();

  if (e.key === "ArrowDown") {
    e.preventDefault(); // Prevent cursor moving in input
    selectedIndex++;
    if (selectedIndex >= visible.length) selectedIndex = 0; // Wrap around
    updateSelection();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selectedIndex--;
    if (selectedIndex < 0) selectedIndex = visible.length - 1; // Wrap around
    updateSelection();
  } else if (e.key === "Enter") {
    if (visible[selectedIndex]) {
      const code = visible[selectedIndex].querySelector(".code").textContent;
      navigator.clipboard.writeText(code);
      // Visual feedback
      visible[selectedIndex].style.backgroundColor = "#d1fae5"; // light green
      setTimeout(() => {
        visible[selectedIndex].style.backgroundColor = "";
        window.close(); // Close popup on success
      }, 200);
    }
  }
});

// Focus search on load and init selection
setTimeout(() => {
  searchEl.focus();
  updateSelection();
}, 100);

// Modal refs
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modal-title");
const qrContainer = document.getElementById("qrcode-container");
const closeModalBtn = document.getElementById("close-modal");

closeModalBtn.onclick = () => {
  modal.style.display = "none";
  qrContainer.innerHTML = "";
};

window.onclick = (e) => {
  if (e.target === modal) {
    modal.style.display = "none";
    qrContainer.innerHTML = "";
  }
};

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



    const copyBtn = Object.assign(document.createElement("button"), {
      className: "smallbtn",
      textContent: "📋"
    });
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(code.textContent);
      copyBtn.textContent = "✓";
      setTimeout(() => (copyBtn.textContent = "📋"), 800);
    };

    const qrBtn = Object.assign(document.createElement("button"), {
      className: "smallbtn",
      textContent: "📱",
      title: "Show QR Code"
    });
    qrBtn.onclick = () => {
      // Generate otpauth URI
      const label = encodeURIComponent(t.name);
      const issuer = encodeURIComponent("TOTP Manager");
      const uri = `otpauth://totp/${label}?secret=${t.secret}&issuer=${issuer}&digits=${t.digits || 6}&period=${t.period || 30}`;

      // Generate QR via CDN
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}`;

      modalTitle.textContent = `Scan for ${t.name}`;
      qrContainer.innerHTML = `<img src="${qrUrl}" alt="QR Code" style="width:200px;height:200px;border:1px solid #eee;border-radius:4px;">`;
      modal.style.display = "flex";
    };

    const delBtn = Object.assign(document.createElement("button"), {
      className: "delete-btn",
      textContent: "×",
      title: "Delete"
    });
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteToken(t.name);
    };

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.append(copyBtn, qrBtn);

    div.append(delBtn, name, code, meta);
    listEl.appendChild(div);
    return { ...t, code };
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
    const now = Date.now() / 1000;
    const period = 30; // Global timer
    const remain = period - (now % period);
    const percent = (remain / period) * 100;
    if (progressBar) progressBar.style.width = `${percent}%`;
  }

  await updateCodes();
  updateCountdowns();
  intervalTimer = setInterval(updateCodes, 1000);
  countdownTimer = setInterval(updateCountdowns, 1000);
  updateSelection();
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
