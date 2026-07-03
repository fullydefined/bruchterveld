const GAS_URL = "https://script.google.com/macros/s/AKfycbwq6LDLCrEi6_b8_eJL3kE2uHPfqdSItc2xocvdKD_gY0cJfeXylIEH3BOAUPwgEtjpVw/exec";
const STORAGE_KEY = "bruchterveld_player";
const URL_PLAYER_KEYS = ["playerId", "name", "elo", "sessionToken", "status", "currentMatchId", "opponentId", "opponentName"];

function safeStorageGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch (error) {
    return null;
  }
}

function safeStorageSet(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    return false;
  }
}

function safeStorageRemove(storage, key) {
  try {
    storage.removeItem(key);
    return true;
  } catch (error) {
    return false;
  }
}

function playerFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const player = {};

  URL_PLAYER_KEYS.forEach((key) => {
    const value = params.get(key);
    if (value !== null && value !== "") {
      player[key] = key === "elo" ? Number(value) || 1000 : value;
    }
  });

  return Object.keys(player).length ? player : null;
}

function setPlayerInUrl(player) {
  const url = new URL(window.location.href);

  URL_PLAYER_KEYS.forEach((key) => {
    url.searchParams.delete(key);
  });

  if (player) {
    URL_PLAYER_KEYS.forEach((key) => {
      if (player[key] !== undefined && player[key] !== null && player[key] !== "") {
        url.searchParams.set(key, String(player[key]));
      }
    });
  }

  window.history.replaceState({}, "", url.toString());
}

function loadPlayer() {
  try {
    const stored = safeStorageGet(localStorage, STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) || null;
    }
  } catch (error) {
    // ignore and fall back to URL state
  }

  return playerFromUrl();
}

function savePlayer(player) {
  safeStorageSet(localStorage, STORAGE_KEY, JSON.stringify(player));
  setPlayerInUrl(player);
}

function clearPlayer() {
  safeStorageRemove(localStorage, STORAGE_KEY);
  setPlayerInUrl(null);
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
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action, ...payload })
  });

  const text = await response.text();

  try {
    const data = JSON.parse(text);

    if (data.status === "error") {
      throw new Error(data.message || "Request failed");
    }

    return data;
  } catch (error) {
    throw new Error(`Invalid GAS response: ${text.slice(0, 120)}`);
  }
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
  setPlayerInUrl,
  updateStatElements
};

window.BruchterveldReady = true;