document.addEventListener("DOMContentLoaded", () => {
  const app = window.Bruchterveld || {
    api: async () => ({ counts: {} }),
    loadPlayer: () => null,
    savePlayer: () => {},
    setPlayerInUrl: () => {},
    formatElo: (value) => Number(value || 1000).toLocaleString(),
    updateStatElements: () => {}
  };

  const { api, loadPlayer, savePlayer, setPlayerInUrl, formatElo, updateStatElements } = app;
  const profileName = document.getElementById("profileName");
  const profileElo = document.getElementById("profileElo");
  const profileStatus = document.getElementById("profileStatus");
  const profileNote = document.getElementById("profileNote");
  const findMatchButton = document.getElementById("findMatchButton");
  const refreshProfileButton = document.getElementById("refreshProfileButton");

  function playerQueryString(player) {
    const query = new URLSearchParams();
    ["playerId", "name", "elo", "sessionToken", "status", "currentMatchId", "opponentId", "opponentName"].forEach((key) => {
      if (player[key] !== undefined && player[key] !== null && player[key] !== "") {
        query.set(key, String(player[key]));
      }
    });
    return query.toString();
  }

  let player = loadPlayer();

  if (player) {
    profileName.textContent = player.name || "Loading...";
    profileElo.textContent = `Current ELO: ${formatElo(player.elo)}`;
    profileStatus.textContent = player.sessionToken ? "Checking account..." : "Creating profile...";
  }

  async function ensureRegistered(stored) {
    if (!stored) {
      return null;
    }

    if (stored.sessionToken) {
      return stored;
    }

    try {
      const result = await api("registerPlayer", { name: stored.name });
      if (!result.player) {
        return stored;
      }

      const registered = {
        ...stored,
        playerId: result.player.playerId,
        name: result.player.name,
        elo: result.player.elo,
        sessionToken: result.player.sessionToken,
        status: result.player.status,
        currentMatchId: result.player.currentMatchId || ""
      };

      savePlayer(registered);
      setPlayerInUrl(registered);
      return registered;
    } catch (error) {
      return stored;
    }
  }

  async function refreshProfile() {
    const stored = loadPlayer();
    if (!stored) {
      const params = new URLSearchParams(window.location.search);
      const queryName = params.get("name");
      if (!queryName) {
        window.location.href = "index.html";
        return;
      }

      const draft = { name: queryName, status: "IDLE", currentMatchId: "" };
      savePlayer(draft);
      setPlayerInUrl(draft);
      player = draft;
      profileName.textContent = draft.name;
      profileElo.textContent = `Current ELO: ${formatElo(draft.elo)}`;
      profileStatus.textContent = "Creating profile...";
      return refreshProfile();
    }

    profileName.textContent = stored.name || "Loading...";
    profileElo.textContent = `Current ELO: ${formatElo(stored.elo)}`;
    profileStatus.textContent = stored.sessionToken ? "Checking account..." : "Creating profile...";

    try {
      const registered = await ensureRegistered(stored);
      const data = await api("bootstrap", { token: registered.sessionToken });
      updateStatElements(data.counts || {});

      if (data.player) {
        player = { ...registered, ...data.player };
        savePlayer(player);
      } else {
        player = registered;
      }

      profileName.textContent = player.name;
      profileElo.textContent = `Current ELO: ${formatElo(player.elo)}`;
      profileStatus.textContent = player.status === "IN_GAME"
        ? `In a match: ${player.opponentName || "opponent"}`
        : player.status === "SEARCHING"
          ? "Searching for a match"
          : "Ready to find a match";

      if (data.match && data.match.matchId) {
        profileNote.textContent = `Active match ${data.match.gameTitle} is attached to your account.`;
      } else {
        profileNote.textContent = "The profile page keeps polling for live counts from GAS.";
      }

    } catch (error) {
      profileStatus.textContent = error.message;
    }
  }

  async function findMatch() {
    const stored = loadPlayer();
    if (!stored) {
      window.location.href = "index.html";
      return;
    }

    findMatchButton.disabled = true;
    findMatchButton.textContent = "Searching...";
    profileStatus.textContent = "Requesting a match...";

    try {
      const result = await api("findMatch", { token: stored.sessionToken, name: stored.name, playerId: stored.playerId });
      if (result.player) {
        savePlayer({ ...stored, ...result.player });
      }

      if (result.state === "MATCHED" && result.match) {
        const nextPlayer = result.player || stored;
        const query = playerQueryString(nextPlayer);
        window.location.assign(`match.html${query ? `?${query}` : ""}`);
        return;
      }

      const nextPlayer = result.player || stored;
      const query = playerQueryString(nextPlayer);
      window.location.assign(`matchmaking.html${query ? `?${query}` : ""}`);
    } catch (error) {
      profileStatus.textContent = error.message;
    } finally {
      findMatchButton.disabled = false;
      findMatchButton.textContent = "Find a match";
    }
  }

  findMatchButton.addEventListener("click", (event) => {
    event.preventDefault();
    findMatch();
  });
  refreshProfileButton.addEventListener("click", refreshProfile);

  refreshProfile();
  setInterval(refreshProfile, 5000);
});