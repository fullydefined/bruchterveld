var SHEET_HEADERS = {
  Players: [
    "playerId",
    "name",
    "nameKey",
    "elo",
    "status",
    "currentMatchId",
    "opponentId",
    "opponentName",
    "sessionToken",
    "createdAt",
    "updatedAt"
  ],
  Games: [
    "gameId",
    "title",
    "description",
    "status",
    "matchId",
    "player1Id",
    "player1Name",
    "player2Id",
    "player2Name",
    "startedAt",
    "endedAt"
  ],
  "Game History": [
    "historyId",
    "matchId",
    "gameId",
    "gameTitle",
    "player1Id",
    "player1Name",
    "player1EloStart",
    "player1EloEnd",
    "player2Id",
    "player2Name",
    "player2EloStart",
    "player2EloEnd",
    "winnerId",
    "winnerName",
    "startTimestamp",
    "endTimestamp",
    "resultSource"
  ]
};

var DEFAULT_GAMES = [
  ["g-rocket-duel", "Rocket Duel", "A fast duel where both players race to complete the objective first.", "AVAILABLE", "", "", "", "", "", "", ""],
  ["g-grid-control", "Grid Control", "Take control of the board and force your opponent into bad positions.", "AVAILABLE", "", "", "", "", "", "", ""],
  ["g-tactics-pulse", "Tactics Pulse", "A short competitive match with a clear winner decided by the players.", "AVAILABLE", "", "", "", "", "", "", ""]
];

function doGet(e) {
  return handleRequest_(e, "GET");
}

function doPost(e) {
  return handleRequest_(e, "POST");
}

function handleRequest_(e, method) {
  try {
    var payload = method === "POST" ? parseBody_(e) : {};
    var action = (payload.action || (e && e.parameter && e.parameter.action) || "bootstrap").toString();

    if (action === "bootstrap") {
      return json_(getBootstrap_(payload));
    }

    if (action === "registerPlayer") {
      return json_(registerPlayer_(payload));
    }

    if (action === "findMatch") {
      return json_(findMatch_(payload));
    }

    if (action === "matchStatus") {
      return json_(matchStatus_(payload));
    }

    if (action === "reportLoss") {
      return json_(reportLoss_(payload));
    }

    return json_({
      status: "error",
      message: "Unknown action: " + action
    });
  } catch (error) {
    return json_({
      status: "error",
      message: error.message || String(error)
    });
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    return {};
  }
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (spreadsheet) {
    return spreadsheet;
  }

  var spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");

  if (!spreadsheetId) {
    throw new Error("No active spreadsheet found and no SPREADSHEET_ID script property configured.");
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function getSheet_(name) {
  var spreadsheet = getSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  ensureHeaders_(sheet, SHEET_HEADERS[name]);
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  if (!headers || !headers.length) {
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (sheet.getName() === "Games") {
      sheet.getRange(2, 1, DEFAULT_GAMES.length, headers.length).setValues(DEFAULT_GAMES);
    }
    return;
  }

  var existingHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var needsUpdate = existingHeaders.join("") !== headers.join("");

  if (needsUpdate) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function getRecords_(sheetName) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  var headers = values[0];
  return values.slice(1).map(function (row, index) {
    var record = {
      _row: index + 2
    };

    headers.forEach(function (header, columnIndex) {
      record[header] = row[columnIndex];
    });

    return record;
  });
}

function writeRecord_(sheet, rowIndex, headers, record) {
  var row = headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : "";
  });

  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
}

function appendRecord_(sheet, headers, record) {
  var row = headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : "";
  });

  sheet.appendRow(row);
}

function normalizeName_(name) {
  return (name || "").toString().trim();
}

function nameKey_(name) {
  return normalizeName_(name).toLowerCase();
}

function nowIso_() {
  return new Date().toISOString();
}

function createPlayer_(name) {
  var normalizedName = normalizeName_(name);

  if (!normalizedName) {
    throw new Error("Player name is required.");
  }

  var playersSheet = getSheet_("Players");
  var players = getRecords_("Players");
  var existing = players.find(function (player) {
    return player.nameKey === nameKey_(normalizedName);
  });

  if (existing) {
    existing.name = normalizedName;
    existing.updatedAt = nowIso_();
    if (!existing.sessionToken) {
      existing.sessionToken = Utilities.getUuid();
    }
    writeRecord_(playersSheet, existing._row, SHEET_HEADERS.Players, existing);
    return existing;
  }

  var player = {
    playerId: "p-" + Utilities.getUuid(),
    name: normalizedName,
    nameKey: nameKey_(normalizedName),
    elo: 1000,
    status: "IDLE",
    currentMatchId: "",
    opponentId: "",
    opponentName: "",
    sessionToken: Utilities.getUuid(),
    createdAt: nowIso_(),
    updatedAt: nowIso_()
  };

  appendRecord_(playersSheet, SHEET_HEADERS.Players, player);
  return player;
}

function findPlayerByToken_(token) {
  var normalizedToken = normalizeName_(token);
  if (!normalizedToken) {
    return null;
  }

  return getRecords_("Players").find(function (player) {
    return player.sessionToken === normalizedToken;
  }) || null;
}

function findPlayerById_(playerId) {
  var normalizedPlayerId = normalizeName_(playerId);
  if (!normalizedPlayerId) {
    return null;
  }

  return getRecords_("Players").find(function (player) {
    return player.playerId === normalizedPlayerId;
  }) || null;
}

function getPlayerFromPayload_(payload) {
  if (!payload) {
    return null;
  }

  var player = null;

  if (payload.token) {
    player = findPlayerByToken_(payload.token);
  }

  if (!player && payload.playerId) {
    player = findPlayerById_(payload.playerId);
  }

  if (!player && payload.name) {
    player = getRecords_("Players").find(function (record) {
      return record.nameKey === nameKey_(payload.name);
    }) || null;
  }

  return player;
}

function getCounts_() {
  var players = getRecords_("Players");

  return {
    waiting: players.filter(function (player) { return player.status === "WAITING"; }).length,
    searching: players.filter(function (player) { return player.status === "SEARCHING"; }).length,
    inGame: players.filter(function (player) { return player.status === "IN_GAME"; }).length,
    idle: players.filter(function (player) { return player.status === "IDLE"; }).length,
    totalPlayers: players.length,
    availableGames: getRecords_("Games").filter(function (game) { return game.status === "AVAILABLE"; }).length
  };
}

function sanitizePlayer_(player) {
  if (!player) {
    return null;
  }

  return {
    playerId: player.playerId,
    name: player.name,
    elo: Number(player.elo) || 1000,
    status: player.status || "IDLE",
    currentMatchId: player.currentMatchId || "",
    opponentId: player.opponentId || "",
    opponentName: player.opponentName || "",
    sessionToken: player.sessionToken || "",
    updatedAt: player.updatedAt || ""
  };
}

function sanitizeMatch_(match) {
  if (!match) {
    return null;
  }

  return {
    matchId: match.matchId,
    gameId: match.gameId,
    gameTitle: match.gameTitle,
    gameDescription: match.gameDescription,
    status: match.status,
    player1Id: match.player1Id,
    player1Name: match.player1Name,
    player1Elo: Number(match.player1Elo) || 1000,
    player2Id: match.player2Id,
    player2Name: match.player2Name,
    player2Elo: Number(match.player2Elo) || 1000,
    winnerId: match.winnerId || "",
    winnerName: match.winnerName || "",
    startTimestamp: match.startTimestamp || "",
    endTimestamp: match.endTimestamp || "",
    resultSource: match.resultSource || "",
    players: [
      {
        playerId: match.player1Id,
        name: match.player1Name,
        elo: Number(match.player1Elo) || 1000
      },
      {
        playerId: match.player2Id,
        name: match.player2Name,
        elo: Number(match.player2Elo) || 1000
      }
    ]
  };
}

function getBootstrap_(payload) {
  var player = getPlayerFromPayload_(payload);
  var match = player && player.currentMatchId ? getMatchById_(player.currentMatchId) : null;

  return {
    status: "success",
    counts: getCounts_(),
    player: player ? sanitizePlayer_(player) : null,
    match: match ? sanitizeMatch_(match) : null,
    serverTime: nowIso_()
  };
}

function registerPlayer_(payload) {
  var player = createPlayer_(payload.name);

  return {
    status: "success",
    counts: getCounts_(),
    player: sanitizePlayer_(player),
    message: "Player registered."
  };
}

function findMatch_(payload) {
  var player = getPlayerFromPayload_(payload);

  if (!player) {
    throw new Error("Player not found. Register the player before searching.");
  }

  if (player.currentMatchId) {
    return {
      status: "success",
      state: "MATCHED",
      counts: getCounts_(),
      player: sanitizePlayer_(player),
      match: sanitizeMatch_(getMatchById_(player.currentMatchId)),
      message: "Player already matched."
    };
  }

  var playersSheet = getSheet_("Players");
  var players = getRecords_("Players");
  var thisPlayer = players.find(function (record) {
    return record.playerId === player.playerId;
  });

  if (!thisPlayer) {
    throw new Error("Player record could not be loaded.");
  }

  thisPlayer.status = "SEARCHING";
  thisPlayer.updatedAt = nowIso_();
  writeRecord_(playersSheet, thisPlayer._row, SHEET_HEADERS.Players, thisPlayer);

  var lock = LockService.getScriptLock();
  lock.waitLock(3000);

  try {
    var refreshedPlayers = getRecords_("Players");
    var currentPlayer = refreshedPlayers.find(function (record) {
      return record.playerId === player.playerId;
    });

    if (!currentPlayer) {
      throw new Error("Player record could not be refreshed.");
    }

    if (currentPlayer.currentMatchId) {
      return {
        status: "success",
        state: "MATCHED",
        counts: getCounts_(),
        player: sanitizePlayer_(currentPlayer),
        match: sanitizeMatch_(getMatchById_(currentPlayer.currentMatchId))
      };
    }

    var opponent = refreshedPlayers
      .filter(function (record) {
        return record.playerId !== currentPlayer.playerId && record.status === "SEARCHING" && !record.currentMatchId;
      })
      .sort(function (a, b) {
        return String(a.updatedAt || "").localeCompare(String(b.updatedAt || ""));
      })[0] || null;

    if (!opponent) {
      currentPlayer.status = "SEARCHING";
      currentPlayer.updatedAt = nowIso_();
      writeRecord_(playersSheet, currentPlayer._row, SHEET_HEADERS.Players, currentPlayer);

      return {
        status: "success",
        state: "SEARCHING",
        counts: getCounts_(),
        player: sanitizePlayer_(currentPlayer),
        match: null,
        message: "Waiting for an opponent."
      };
    }

    var game = lockAndClaimGame_(currentPlayer, opponent);

    if (!game) {
      currentPlayer.status = "SEARCHING";
      currentPlayer.updatedAt = nowIso_();
      writeRecord_(playersSheet, currentPlayer._row, SHEET_HEADERS.Players, currentPlayer);

      return {
        status: "success",
        state: "SEARCHING",
        counts: getCounts_(),
        player: sanitizePlayer_(currentPlayer),
        match: null,
        message: "No available game yet."
      };
    }

    var match = createMatch_(currentPlayer, opponent, game);

    return {
      status: "success",
      state: "MATCHED",
      counts: getCounts_(),
      player: sanitizePlayer_(findPlayerById_(currentPlayer.playerId)),
      match: sanitizeMatch_(match),
      message: "Match found."
    };
  } finally {
    lock.releaseLock();
  }
}

function lockAndClaimGame_(player1, player2) {
  var gamesSheet = getSheet_("Games");
  var games = getRecords_("Games");
  var availableGame = games.find(function (game) {
    return String(game.status || "").toUpperCase() === "AVAILABLE";
  });

  if (!availableGame) {
    return null;
  }

  availableGame.status = "IN_PROGRESS";
  availableGame.matchId = "";
  availableGame.player1Id = player1.playerId;
  availableGame.player1Name = player1.name;
  availableGame.player2Id = player2.playerId;
  availableGame.player2Name = player2.name;
  availableGame.startedAt = nowIso_();
  availableGame.endedAt = "";
  writeRecord_(gamesSheet, availableGame._row, SHEET_HEADERS.Games, availableGame);

  return availableGame;
}

function createMatch_(player1, player2, game) {
  var matchId = "m-" + Utilities.getUuid();
  var startTimestamp = nowIso_();
  var playersSheet = getSheet_("Players");
  var updatedPlayers = getRecords_("Players");
  var player1Record = updatedPlayers.find(function (record) {
    return record.playerId === player1.playerId;
  });
  var player2Record = updatedPlayers.find(function (record) {
    return record.playerId === player2.playerId;
  });
  var gamesSheet = getSheet_("Games");
  var games = getRecords_("Games");
  var gameRecord = games.find(function (record) {
    return record.gameId === game.gameId;
  });

  if (!player1Record || !player2Record || !gameRecord) {
    throw new Error("Unable to start match.");
  }

  player1Record.status = "IN_GAME";
  player1Record.currentMatchId = matchId;
  player1Record.opponentId = player2Record.playerId;
  player1Record.opponentName = player2Record.name;
  player1Record.updatedAt = startTimestamp;

  player2Record.status = "IN_GAME";
  player2Record.currentMatchId = matchId;
  player2Record.opponentId = player1Record.playerId;
  player2Record.opponentName = player1Record.name;
  player2Record.updatedAt = startTimestamp;

  writeRecord_(playersSheet, player1Record._row, SHEET_HEADERS.Players, player1Record);
  writeRecord_(playersSheet, player2Record._row, SHEET_HEADERS.Players, player2Record);

  gameRecord.matchId = matchId;
  gameRecord.player1Id = player1Record.playerId;
  gameRecord.player1Name = player1Record.name;
  gameRecord.player2Id = player2Record.playerId;
  gameRecord.player2Name = player2Record.name;
  gameRecord.startedAt = startTimestamp;
  gameRecord.endedAt = "";
  gameRecord.status = "IN_PROGRESS";
  writeRecord_(gamesSheet, gameRecord._row, SHEET_HEADERS.Games, gameRecord);

  return {
    matchId: matchId,
    gameId: gameRecord.gameId,
    gameTitle: gameRecord.title,
    gameDescription: gameRecord.description,
    status: "IN_PROGRESS",
    player1Id: player1Record.playerId,
    player1Name: player1Record.name,
    player1Elo: Number(player1Record.elo) || 1000,
    player2Id: player2Record.playerId,
    player2Name: player2Record.name,
    player2Elo: Number(player2Record.elo) || 1000,
    winnerId: "",
    winnerName: "",
    startTimestamp: startTimestamp,
    endTimestamp: "",
    resultSource: ""
  };
}

function getMatchById_(matchId) {
  var normalizedMatchId = normalizeName_(matchId);
  if (!normalizedMatchId) {
    return null;
  }

  var game = getRecords_("Games").find(function (record) {
    return record.matchId === normalizedMatchId;
  });

  if (!game) {
    return null;
  }

  var player1 = findPlayerById_(game.player1Id);
  var player2 = findPlayerById_(game.player2Id);

  return {
    matchId: game.matchId,
    gameId: game.gameId,
    gameTitle: game.title,
    gameDescription: game.description,
    status: game.status,
    player1Id: game.player1Id,
    player1Name: game.player1Name,
    player1Elo: player1 ? Number(player1.elo) || 1000 : 1000,
    player2Id: game.player2Id,
    player2Name: game.player2Name,
    player2Elo: player2 ? Number(player2.elo) || 1000 : 1000,
    winnerId: game.winnerId || "",
    winnerName: game.winnerName || "",
    startTimestamp: game.startedAt || "",
    endTimestamp: game.endedAt || "",
    resultSource: game.resultSource || ""
  };
}

function matchStatus_(payload) {
  var player = getPlayerFromPayload_(payload);

  if (!player) {
    throw new Error("Player not found.");
  }

  return {
    status: "success",
    counts: getCounts_(),
    player: sanitizePlayer_(player),
    match: player.currentMatchId ? sanitizeMatch_(getMatchById_(player.currentMatchId)) : null
  };
}

function reportLoss_(payload) {
  var player = getPlayerFromPayload_(payload);

  if (!player) {
    throw new Error("Player not found.");
  }

  if (!player.currentMatchId) {
    return {
      status: "success",
      message: "Player is not in a match.",
      counts: getCounts_(),
      player: sanitizePlayer_(player),
      match: null
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(3000);

  try {
    var match = getMatchById_(player.currentMatchId);

    if (!match) {
      throw new Error("Match not found.");
    }

    if (match.status === "COMPLETED") {
      return {
        status: "success",
        counts: getCounts_(),
        player: sanitizePlayer_(findPlayerById_(player.playerId)),
        match: sanitizeMatch_(match),
        message: "Match already completed."
      };
    }

    var winner = match.player1Id === player.playerId ? findPlayerById_(match.player2Id) : findPlayerById_(match.player1Id);
    var loser = findPlayerById_(player.playerId);

    if (!winner || !loser) {
      throw new Error("Unable to resolve winner and loser.");
    }

    finalizeMatch_(match, winner, loser, "reported_loss");

    return {
      status: "success",
      message: winner.name + " wins by opponent report.",
      counts: getCounts_(),
      player: sanitizePlayer_(findPlayerById_(winner.playerId)),
      match: sanitizeMatch_(getMatchById_(match.matchId))
    };
  } finally {
    lock.releaseLock();
  }
}

function finalizeMatch_(match, winner, loser, resultSource) {
  var playersSheet = getSheet_("Players");
  var gamesSheet = getSheet_("Games");
  var historySheet = getSheet_("Game History");
  var currentPlayers = getRecords_("Players");
  var currentGames = getRecords_("Games");
  var player1 = currentPlayers.find(function (record) { return record.playerId === match.player1Id; });
  var player2 = currentPlayers.find(function (record) { return record.playerId === match.player2Id; });
  var game = currentGames.find(function (record) { return record.matchId === match.matchId; });

  if (!player1 || !player2 || !game) {
    throw new Error("Unable to finalize match.");
  }

  var startTimestamp = game.startedAt || nowIso_();
  var endTimestamp = nowIso_();
  var player1StartElo = Number(player1.elo) || 1000;
  var player2StartElo = Number(player2.elo) || 1000;
  var winnerRecord = winner.playerId === player1.playerId ? player1 : player2;
  var loserRecord = loser.playerId === player1.playerId ? player1 : player2;
  var winnerStartElo = Number(winnerRecord.elo) || 1000;
  var loserStartElo = Number(loserRecord.elo) || 1000;
  var winnerEloDelta = calculateEloDelta_(winnerStartElo, loserStartElo, 1);
  var loserEloDelta = calculateEloDelta_(loserStartElo, winnerStartElo, 0);

  winnerRecord.elo = winnerStartElo + winnerEloDelta;
  loserRecord.elo = loserStartElo + loserEloDelta;
  winnerRecord.status = "IDLE";
  loserRecord.status = "IDLE";
  winnerRecord.currentMatchId = "";
  loserRecord.currentMatchId = "";
  winnerRecord.opponentId = "";
  loserRecord.opponentId = "";
  winnerRecord.opponentName = "";
  loserRecord.opponentName = "";
  winnerRecord.updatedAt = endTimestamp;
  loserRecord.updatedAt = endTimestamp;

  writeRecord_(playersSheet, player1._row, SHEET_HEADERS.Players, player1.playerId === winnerRecord.playerId ? winnerRecord : loserRecord);
  writeRecord_(playersSheet, player2._row, SHEET_HEADERS.Players, player2.playerId === winnerRecord.playerId ? winnerRecord : loserRecord);

  game.status = "COMPLETED";
  game.endedAt = endTimestamp;
  game.resultSource = resultSource;
  writeRecord_(gamesSheet, game._row, SHEET_HEADERS.Games, game);

  appendRecord_(historySheet, SHEET_HEADERS["Game History"], {
    historyId: "h-" + Utilities.getUuid(),
    matchId: match.matchId,
    gameId: game.gameId,
    gameTitle: game.title,
    player1Id: player1.playerId,
    player1Name: player1.name,
    player1EloStart: player1StartElo,
    player1EloEnd: player1.playerId === winnerRecord.playerId ? winnerRecord.elo : loserRecord.elo,
    player2Id: player2.playerId,
    player2Name: player2.name,
    player2EloStart: player2StartElo,
    player2EloEnd: player2.playerId === winnerRecord.playerId ? winnerRecord.elo : loserRecord.elo,
    winnerId: winnerRecord.playerId,
    winnerName: winnerRecord.name,
    startTimestamp: startTimestamp,
    endTimestamp: endTimestamp,
    resultSource: resultSource
  });
}

function calculateEloDelta_(rating, opponentRating, score) {
  var kFactor = 32;
  var expectedScore = 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
  return Math.round(kFactor * (score - expectedScore));
}