var GAME_BASE = new URL(window.FLASH_GAMES_CONFIG.gameBase, window.location.href).href.replace(/\/?$/, "/");

var state = { games: [], tags: [], filter: "all", query: "" };

var $ = function (s) { return document.querySelector(s); };

function swfPath(game) { return GAME_BASE + game.id + "/" + game.id + ".swf"; }

function coverPath(game) { return GAME_BASE + game.id + "/" + game.id + ".jpg"; }

function isSolValue(value) {
  if (typeof value !== "string") return false;
  try {
    var d = atob(value);
    return d.charCodeAt(0) === 0x00 && d.charCodeAt(1) === 0xbf && d.slice(6, 10) === "TCSO" && [0x00, 0x04, 0x00, 0x00, 0x00, 0x00].every(function (b, i) { return d.charCodeAt(10 + i) === b; });
  } catch (e) { return false; }
}

function collectEntries() {
  var entries = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i), v = k ? localStorage.getItem(k) : null;
    if (k && isSolValue(v)) entries.push({ key: k, value: v });
  }
  return entries;
}

function downloadJson(filename, data) {
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function setStatus(el, msg, isErr) { if (!el) return; el.textContent = msg; el.classList.toggle("status-text--error", !!isErr); }

function exportBackup(el) {
  var entries = collectEntries();
  if (!entries.length) { setStatus(el, "当前没有找到可导出的存档。", true); return; }
  downloadJson("flash-save-backup.json", { version: 1, exportedAt: new Date().toISOString(), origin: GAME_BASE, entries: entries });
  setStatus(el, "已导出 " + entries.length + " 项存档。");
}

function importBackup(file, el) {
  var r = new FileReader();
  r.onload = function () {
    try {
      var b = JSON.parse(r.result);
      if (b.version !== 1 || !Array.isArray(b.entries)) throw new Error("格式不正确");
      var oldOrigin = b.origin || "";
      var oldPrefix = oldOrigin.replace(/^https?:\/\//, "").replace(/:\d+/, "");
      var newPrefix = GAME_BASE.replace(/^https?:\/\//, "").replace(/:\d+/, "");
      var entries = b.entries.filter(function (e) { return typeof e.key === "string" && isSolValue(e.value); });
      if (!entries.length) throw new Error("没有可导入的存档");
      if (!window.confirm("将覆盖 " + entries.length + " 项本地存档，是否继续？")) return;
      entries.forEach(function (e) { localStorage.setItem(oldPrefix ? e.key.replace(oldPrefix, newPrefix) : e.key, e.value); });
      setStatus(el, "已导入 " + entries.length + " 项存档，请重新载入游戏。");
    } catch (err) { setStatus(el, "导入失败：" + err.message, true); }
  };
  r.readAsText(file);
}

function gameMatches(game) {
  var text = (game.title + " " + (game.originalName || "")).toLowerCase();
  return text.includes(state.query.trim().toLowerCase()) && (state.filter === "all" || game.tags.includes(state.filter));
}

function buildFilterChips() {
  var html = '<button class="filter-chip is-active" type="button" data-filter="all">全部</button>';
  state.tags.forEach(function (t) { html += '<button class="filter-chip" type="button" data-filter="' + t + '">' + t + '</button>'; });
  return html;
}

function renderGames() {
  var grid = $("#game-grid"); if (!grid) return;
  var games = state.games.filter(gameMatches);
  grid.innerHTML = games.map(function (g) {
    return '<a class="game-card" href="play.html?id=' + encodeURIComponent(g.id) + '">' +
      '<div class="game-card__cover">' +
      '<img src="' + coverPath(g) + '" alt="' + g.title + '" loading="lazy"></div>' +
      '<div class="game-card__body"><h2>' + g.title + '</h2>' +
      (g.originalName ? "<p>" + g.originalName + "</p>" : "") +
      "</div></a>";
  }).join("");
  $("#result-count").textContent = "显示 " + games.length + " / " + state.games.length;
  $("#empty-state").hidden = games.length !== 0;
}

async function initIndex() {
  var resp = await fetch("data/games.json");
  if (!resp.ok) throw new Error("游戏清单请求失败");
  state.games = await resp.json();
  var tagSet = new Set();
  state.games.forEach(function (g) { g.tags.filter(Boolean).forEach(function (t) { tagSet.add(t); }); });
  state.tags = Array.from(tagSet).sort();
  var fg = document.querySelector(".filter-group");
  if (fg) fg.innerHTML = buildFilterChips();
  $("#game-count").textContent = state.games.length + " 款游戏";
  renderGames();
  $("#game-search").addEventListener("input", function (e) { state.query = e.target.value; renderGames(); });
  fg.addEventListener("click", function (e) { var c = e.target.closest("[data-filter]"); if (!c) return; state.filter = c.dataset.filter; fg.querySelectorAll("[data-filter]").forEach(function (i) { i.classList.toggle("is-active", i === c); }); renderGames(); });
  $("#export-all").addEventListener("click", function () { exportBackup($("#backup-status")); });
  $("#import-all").addEventListener("change", function (e) { if (e.target.files[0]) importBackup(e.target.files[0], $("#backup-status")); e.target.value = ""; });
}

async function initPlay() {
  var gid = new URLSearchParams(window.location.search).get("id");
  var resp = await fetch("data/games.json");
  if (!resp.ok) throw new Error("游戏清单请求失败");
  var games = await resp.json();
  var game = games.find(function (g) { return g.id === gid; });
  if (!game) { $("#play-title").textContent = "游戏不存在"; $("#player-status").textContent = "请返回列表选择一个游戏。"; return; }
  document.title = game.title + " · Flash 游戏柜";
  $("#play-title").textContent = game.title;
  $("#play-subtitle").textContent = game.originalName || "";
  $("#details-title").textContent = game.title;
  var loadPlayer = function () {
    var c = $("#player-container"); c.innerHTML = "";
    var p = window.RufflePlayer && window.RufflePlayer.newest && window.RufflePlayer.newest().createPlayer();
    if (!p) { c.innerHTML = '<div class="loading-state" role="status">Ruffle 加载失败，请检查网络后重新载入。</div>'; return; }
    p.style.width = "100%"; p.style.height = "100%"; c.appendChild(p);
    p.ruffle().config = { base: new URL(swfPath(game), document.baseURI).href.replace(/[^/]*$/, ""), backgroundColor: "#000000", forceScale: true, letterbox: "on", scale: "showAll" };
    p.ruffle().load(swfPath(game)).catch(function () { c.innerHTML = '<div class="loading-state" role="status">游戏资源加载失败，请稍后重新载入。</div>'; });
  };
  $("#reload-game").addEventListener("click", loadPlayer);
  $("#fullscreen-game").addEventListener("click", function () { $("#player-container").requestFullscreen && $("#player-container").requestFullscreen(); });
  loadPlayer();
}

if (document.body.dataset.page === "index") initIndex().catch(function () { setStatus($("#backup-status"), "游戏清单加载失败。", true); });
if (document.body.dataset.page === "play") initPlay().catch(function () { $("#play-title").textContent = "页面加载失败"; });
