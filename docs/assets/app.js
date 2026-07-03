const GAS_URL = "https://script.google.com/macros/s/AKfycbwq6LDLCrEi6_b8_eJL3kE2uHPfqdSItc2xocvdKD_gY0cJfeXylIEH3BOAUPwgEtjpVw/exec";
const STORAGE_KEY = "bruchterveld_player";

function loadPlayer() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch (error) {
    return null;
  }
}

function savePlayer(player) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(player));
}

function clearPlayer() {
  localStorage.removeItem(STORAGE_KEY);
}

function ensurePlayer() {
  const player = loadPlayer();
  if (!player || !player.sessionToken) {
    window.location.href = "index.html";
    return null;
  }
  return player;
}

async function api(action, payload = {}) {
  const response = await fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({ action, ...payload })
  });

  const data = await response.json();

  if (data.status === "error") {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

function formatElo(value) {
  return Number(value || 1000).toLocaleString();
}

function updateStatElements(map) {
  Object.entries(map).forEach(([key, value]) => {
    document.querySelectorAll(`[data-stat="${key}"]`).forEach((element) => {
      element.textContent = value;
    });
  });
}

function playerLabel(player) {
  if (!player) {
    return "Unknown player";
  }

  return `${player.name} (${formatElo(player.elo)})`;
}

function setBannerText(text) {
  const element = document.querySelector("[data-banner-copy]");
  if (element && text) {
    element.textContent = text;
  }
}

window.Bruchterveld = {
  api,
  clearPlayer,
  ensurePlayer,
  formatElo,
  loadPlayer,
  playerLabel,
  savePlayer,
  setBannerText,
  updateStatElements
};