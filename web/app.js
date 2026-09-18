const statusEl = document.getElementById("status");
const holeSelect = document.getElementById("holeSelect");
const holeInfoEl = document.getElementById("holeInfo");
const distancesEl = document.getElementById("distances");
const toggleMappingBtn = document.getElementById("toggleMapping");
const mappingPanel = document.getElementById("mappingPanel");
const mappingLog = document.getElementById("mappingLog");
const caddyTipEl = document.getElementById("caddyTip");
const caddyClubEl = document.getElementById("caddyClub");
const caddyAdviceEl = document.getElementById("caddyAdvice");
const caddyFootnoteEl = document.getElementById("caddyFootnote");
const toggleScorecardBtn = document.getElementById("toggleScorecard");
const scorecardPanel = document.getElementById("scorecardPanel");
const historyPanel = document.getElementById("historyPanel");
const clubsPanel = document.getElementById("clubsPanel");
const hcpInput = document.getElementById("hcpInput");
const scNewRoundBtn = document.getElementById("scNewRound");
const emojiPopEl = document.getElementById("emojiPop");
const statBackdrop = document.getElementById("statBackdrop");

let holes = [];
let currentHole = null;
let currentCourseId = null;
let currentPosition = null;
let mappingMode = false;
let scorecardMode = false;
let currentRound = null; // { id, scores: { [holeId]: {strokes, putts, fairway_hit, green_in_regulation, miss_direction} } }
let liveRound = null; // the actual in-progress round
let statHoleId = null;
let userClubs = [];
let currentWind = null; // { speed, fromDeg }
let lastWindFetch = 0;

const clubBag = [
  { name: "Driver", dist: 195 },
  { name: "3-trä", dist: 180 },
  { name: "Hybrid", dist: 160 },
  { name: "5-järn", dist: 145 },
  { name: "6-järn", dist: 135 },
  { name: "7-järn", dist: 125 },
  { name: "8-järn", dist: 115 },
  { name: "9-järn", dist: 100 },
  { name: "PW", dist: 85 },
  { name: "SW", dist: 60 },
];

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined)) return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function bearingTo(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

async function loadCourse() {
  setStatus("Laddar bana...");
  const courses = await fetch("/api/courses").then((r) => r.json());
  const course = courses[0];
  if (!course) {
    setStatus("Ingen bana hittades.", true);
    return;
  }
  currentCourseId = course.id;
  holes = await fetch(`/api/courses/${course.id}/holes`).then((r) => r.json());
  holeSelect.disabled = false;
  holeSelect.innerHTML = holes
    .map((h) => `<option value="${h.id}">Hål ${h.hole_number} (par ${h.par})</option>`)
    .join("");
  setStatus(`${course.name} — ${holes.length} hål inlästa`);
  selectHole(holes[0]?.id);
  buildScorecard();
  loadActiveRound();
}

function selectHole(holeId) {
  currentHole = holes.find((h) => h.id === Number(holeId)) || null;
  holeSelect.value = holeId;
  renderHoleInfo();
  renderPhotoMap();
  renderDistances();
}

function renderHoleInfo() {
  if (!currentHole) return;
  const meta = `Hål ${currentHole.hole_number} · Par ${currentHole.par} · ${currentHole.length_meters ?? "?"} m · Hcp ${currentHole.handicap_index ?? "?"}`;
  const tips = currentHole.tips
    ? `<p class="hole-tips">${currentHole.tips.replace(/\n/g, "<br>")}</p>`
    : "";
  holeInfoEl.innerHTML = `<div class="hole-meta">${meta}</div>${tips}`;
}

function hasGreenCoords(h) {
  return h && h.green_mid_lat != null && h.green_mid_lng != null;
}

let markerDragging = false;

function setMarkerPercent(xPct, yPct) {
  const marker = document.getElementById("photoMarker");
  if (!marker) return;
  marker.style.left = xPct + "%";
  marker.style.top = yPct + "%";
  updateMapEstimate(yPct);
}

function updateMapEstimate(yPct) {
  const estEl = document.getElementById("mapEstimate");
  if (!currentHole || !estEl) return;
  const length = currentHole.length_meters;
  if (!length) {
    estEl.textContent = "Avstånd saknas för det här hålet.";
    return;
  }
  const progress = yPct / 100; // 0 = överkant bild (green), 1 = nederkant (tee)
  const mid = Math.max(Math.round(length * progress), 0);
  const front = Math.max(mid - 8, 0);
  const back = mid + 8;
  estEl.textContent = `Uppskattat: Fram ~${front} m · Mitt ~${mid} m · Bak ~${back} m`;
}

function photoMapPointFromEvent(e) {
  const rect = document.getElementById("photoMap").getBoundingClientRect();
  const xPct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
  const yPct = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
  return { xPct, yPct };
}

function initPhotoMap() {
  const marker = document.getElementById("photoMarker");
  const photoMapEl = document.getElementById("photoMap");

  marker.addEventListener("pointerdown", (e) => {
    markerDragging = true;
    marker.classList.add("dragging");
    marker.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  marker.addEventListener("pointermove", (e) => {
    if (!markerDragging) return;
    const { xPct, yPct } = photoMapPointFromEvent(e);
    setMarkerPercent(xPct, yPct);
  });
  marker.addEventListener("pointerup", () => {
    markerDragging = false;
    marker.classList.remove("dragging");
  });
  marker.addEventListener("pointercancel", () => {
    markerDragging = false;
    marker.classList.remove("dragging");
  });

  photoMapEl.addEventListener("pointerdown", (e) => {
    if (e.target === marker) return;
    const { xPct, yPct } = photoMapPointFromEvent(e);
    setMarkerPercent(xPct, yPct);
  });
}

function renderPhotoMap() {
  if (!currentHole) return;
  const img = document.getElementById("holePhoto");
  img.src = currentHole.image_url || "";
  img.alt = `Hål ${currentHole.hole_number}`;
  setMarkerPercent(50, 88);
}

function renderDistances() {
  if (!currentHole || !currentPosition) {
    distancesEl.textContent = currentPosition ? "" : "Väntar på GPS-position...";
    caddyTipEl.hidden = true;
    return;
  }
  const { lat, lng } = currentPosition;
  const front = distanceMeters(lat, lng, currentHole.green_front_lat, currentHole.green_front_lng);
  const mid = distanceMeters(lat, lng, currentHole.green_mid_lat, currentHole.green_mid_lng);
  const back = distanceMeters(lat, lng, currentHole.green_back_lat, currentHole.green_back_lng);
  const fmt = (d) => (d !== null ? d + " m" : "—");
  distancesEl.textContent = `Fram: ${fmt(front)} · Mitt: ${fmt(mid)} · Bak: ${fmt(back)}`;
  updateCaddyTip(mid);
}

function activeClubBag() {
  const withDist = userClubs
    .filter((c) => c.average_distance_m != null)
    .map((c) => ({ name: c.name, dist: c.average_distance_m }));
  return withDist.length > 0 ? withDist : clubBag;
}

function recommendClub(distance) {
  const bag = activeClubBag();
  let best = bag[0];
  let bestDiff = Math.abs(bag[0].dist - distance);
  bag.forEach((c) => {
    const diff = Math.abs(c.dist - distance);
    if (diff < bestDiff) { best = c; bestDiff = diff; }
  });
  return best;
}

function windAdjustment() {
  if (!currentWind || currentWind.speed < 2 || !currentPosition || !currentHole || !hasGreenCoords(currentHole)) {
    return { text: "", meters: 0 };
  }
  const shotBearing = bearingTo(
    currentPosition.lat, currentPosition.lng,
    currentHole.green_mid_lat, currentHole.green_mid_lng
  );
  let diff = Math.abs(shotBearing - currentWind.fromDeg);
  if (diff > 180) diff = 360 - diff;
  const speed = Math.round(currentWind.speed);
  if (diff <= 45) return { text: `motvind ${speed} m/s`, meters: Math.round(currentWind.speed * 3) };
  if (diff >= 135) return { text: `medvind ${speed} m/s`, meters: -Math.round(currentWind.speed * 2) };
  return { text: `sidvind ${speed} m/s`, meters: 0 };
}

function updateCaddyTip(mid) {
  if (mid === null) {
    caddyTipEl.hidden = true;
    return;
  }
  caddyTipEl.hidden = false;
  caddyFootnoteEl.hidden = userClubs.some((c) => c.average_distance_m != null);

  if (mid <= 15) {
    caddyClubEl.textContent = "Ingen klubba behövs — putt eller kort chip.";
    caddyAdviceEl.textContent = "Du är precis vid green — tänk kort spel och en säker putt.";
    return;
  }
  const wind = windAdjustment();
  const effective = Math.max(mid + wind.meters, 1);
  const club = recommendClub(effective);
  const windSuffix = wind.text ? ` — ${wind.text}` : "";
  caddyClubEl.textContent = `Rekommenderad klubba: ${club.name} (≈${club.dist} m)${windSuffix}`;
  caddyAdviceEl.textContent = mid <= 40
    ? "Nära green — chippa eller kör en kort wedge in mot flaggan."
    : `${mid} m kvar till mitten av green.`;
}

async function fetchWind(lat, lng) {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms`
    );
    const data = await res.json();
    if (data && data.current) {
      currentWind = { speed: data.current.wind_speed_10m, fromDeg: data.current.wind_direction_10m };
      renderDistances();
    }
  } catch (err) {
    // wind is a nice-to-have — fail silently
  }
}

function maybeFetchWind() {
  if (!currentPosition) return;
  const now = Date.now();
  if (now - lastWindFetch < 10 * 60 * 1000) return;
  lastWindFetch = now;
  fetchWind(currentPosition.lat, currentPosition.lng);
}

function watchPosition() {
  if (!("geolocation" in navigator)) {
    setStatus("GPS stöds inte i den här webbläsaren.", true);
    return;
  }
  navigator.geolocation.watchPosition(
    (pos) => {
      currentPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      renderDistances();
      maybeFetchWind();
    },
    (err) => setStatus(`GPS-fel: ${err.message}`, true),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
  );
}

function getAdminKey() {
  let key = sessionStorage.getItem("mc_admin_key");
  if (!key) {
    key = prompt("Adminnyckel för kartläggningsläge:") || "";
    sessionStorage.setItem("mc_admin_key", key);
  }
  return key;
}

async function saveCoord(pointPrefix) {
  if (!currentHole || !currentPosition) {
    mappingLog.textContent = "Ingen position tillgänglig ännu.";
    return;
  }
  const body = {
    [`${pointPrefix}_lat`]: currentPosition.lat,
    [`${pointPrefix}_lng`]: currentPosition.lng,
  };
  const key = getAdminKey();
  try {
    const res = await fetch(`/api/holes/${currentHole.id}/coords`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-admin-key": key },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      sessionStorage.removeItem("mc_admin_key");
      mappingLog.textContent = "Fel adminnyckel.";
      return;
    }
    const updated = await res.json();
    Object.assign(currentHole, updated);
    mappingLog.textContent = `Sparat ${pointPrefix} för hål ${currentHole.hole_number}.`;
    renderDistances();
  } catch (err) {
    mappingLog.textContent = `Kunde inte spara: ${err.message}`;
  }
}

// --- Scorekort ---

function popEmoji() {
  emojiPopEl.classList.add("show");
  clearTimeout(popEmoji._t);
  popEmoji._t = setTimeout(() => emojiPopEl.classList.remove("show"), 3000);
}

function strokesForHole(hole, hcp) {
  const base = Math.floor(hcp / 18);
  const rem = hcp % 18;
  return base + (hole.handicap_index <= rem ? 1 : 0);
}

function cellClass(diff) {
  if (diff <= -3) return "albatross";
  if (diff === -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 1) return "bogey";
  if (diff === 2) return "dbogey";
  if (diff >= 3) return "tbogey";
  return "";
}

function buildScoreGrid(containerId, subset, totalLabel) {
  const el = document.getElementById(containerId);
  const holesRow = '<div class="sc-grid-row holes">' +
    subset.map((h) => `<span>${h.hole_number}</span>`).join("") +
    `<span>${totalLabel}</span></div>`;
  const parRow = '<div class="sc-grid-row par">' +
    subset.map((h) => `<span>${h.par}</span>`).join("") +
    `<span class="out" id="scPar-${containerId}">–</span></div>`;
  const scoreRow = '<div class="sc-grid-row score">' +
    subset.map((h) => {
      let opts = '<option value="">–</option>';
      for (let s = 1; s <= h.par + 8; s++) opts += `<option value="${s}">${s}</option>`;
      return `<span><select class="cell" data-h="${h.id}" id="cell-${h.id}">${opts}</select></span>`;
    }).join("") +
    `<span class="out" id="scSub-${containerId}">–</span></div>`;
  const detailRow = '<div class="sc-grid-row detail">' +
    subset.map((h) => `<span><button class="detail-btn" id="detail-${h.id}" disabled>·</button></span>`).join("") +
    `<span></span></div>`;
  const netRow = '<div class="sc-grid-row net">' +
    subset.map((h) => `<span id="net-${h.id}">–</span>`).join("") +
    `<span id="scNetSub-${containerId}">–</span></div>`;
  el.innerHTML = holesRow + parRow + scoreRow + detailRow + netRow;
  el.querySelectorAll("select.cell").forEach((sel) => {
    sel.addEventListener("focus", () => handleCellFocus(Number(sel.dataset.h)));
    sel.addEventListener("change", () => handleCellChange(Number(sel.dataset.h), sel.value));
    sel.addEventListener("blur", () => {
      const holeId = Number(sel.dataset.h);
      setTimeout(() => {
        const v = currentRound && currentRound.scores[holeId];
        if (v && v.strokes !== undefined && v.strokes !== null) openStatSheet(holeId);
      }, 200);
    });
  });
  el.querySelectorAll(".detail-btn").forEach((btn) => {
    btn.addEventListener("click", () => openStatSheet(Number(btn.id.replace("detail-", ""))));
  });
}

function buildScorecard() {
  buildScoreGrid("scGridFront", holes.filter((h) => h.hole_number <= 9), "Out");
  buildScoreGrid("scGridBack", holes.filter((h) => h.hole_number > 9), "In");
}

async function saveScore(holeId, strokes) {
  const hole = holes.find((h) => h.id === holeId);
  currentRound.scores[holeId] = { ...(currentRound.scores[holeId] || {}), strokes };
  if (strokes - hole.par >= 3) popEmoji();
  renderScorecard();
  try {
    await fetch(`/api/rounds/${currentRound.id}/holes/${holeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strokes }),
    });
  } catch (err) {
    setStatus(`Kunde inte spara: ${err.message}`, true);
  }
}

function handleCellFocus(holeId) {
  if (!currentRound || currentRound !== liveRound) return;
  const existing = currentRound.scores[holeId];
  if (existing && existing.strokes !== undefined && existing.strokes !== null) return;
  const hole = holes.find((h) => h.id === holeId);
  saveScore(holeId, hole.par);
}

async function handleCellChange(holeId, rawValue) {
  if (!currentRound || currentRound !== liveRound) return;
  if (rawValue === "") {
    delete currentRound.scores[holeId];
    renderScorecard();
    try {
      await fetch(`/api/rounds/${currentRound.id}/holes/${holeId}`, { method: "DELETE" });
    } catch (err) {
      setStatus(`Kunde inte spara: ${err.message}`, true);
    }
    return;
  }
  await saveScore(holeId, Number(rawValue));
}

function renderScorecard() {
  const hcp = Number(hcpInput.value) || 0;
  const scores = currentRound ? currentRound.scores : {};
  let total = 0, netTotal = 0, played = 0, frontSum = 0, backSum = 0, frontNet = 0, backNet = 0, playedPar = 0;

  holes.forEach((h) => {
    const v = scores[h.id];
    const cell = document.getElementById(`cell-${h.id}`);
    const netEl = document.getElementById(`net-${h.id}`);
    const detailBtn = document.getElementById(`detail-${h.id}`);
    if (!cell || !netEl) return;
    if (!v || v.strokes === undefined || v.strokes === null) {
      cell.value = String(h.par);
      cell.className = "cell empty";
      netEl.textContent = "–";
      if (detailBtn) { detailBtn.disabled = true; detailBtn.textContent = "·"; }
      return;
    }
    const diff = v.strokes - h.par;
    cell.value = String(v.strokes);
    cell.className = `cell ${cellClass(diff)}`;
    if (detailBtn) {
      detailBtn.disabled = false;
      detailBtn.textContent = v.putts !== undefined && v.putts !== null ? `${v.putts}p` : "•";
    }
    const net = v.strokes - strokesForHole(h, hcp);
    netEl.textContent = net;
    total += v.strokes;
    netTotal += net;
    played++;
    playedPar += h.par;
    if (h.hole_number <= 9) { frontSum += v.strokes; frontNet += net; } else { backSum += v.strokes; backNet += net; }
  });

  const frontPar = holes.filter((h) => h.hole_number <= 9).reduce((s, h) => s + h.par, 0);
  const backPar = holes.filter((h) => h.hole_number > 9).reduce((s, h) => s + h.par, 0);
  document.getElementById("scPar-scGridFront").textContent = frontPar || "–";
  document.getElementById("scPar-scGridBack").textContent = backPar || "–";
  document.getElementById("scSub-scGridFront").textContent = frontSum || "–";
  document.getElementById("scSub-scGridBack").textContent = backSum || "–";
  document.getElementById("scNetSub-scGridFront").textContent = frontNet || "–";
  document.getElementById("scNetSub-scGridBack").textContent = backNet || "–";

  document.getElementById("scParTotal").textContent = frontPar + backPar || "–";
  document.getElementById("scTotal").textContent = played ? total : "–";
  const toParEl = document.getElementById("scToPar");
  if (played) {
    const toPar = total - playedPar;
    toParEl.textContent = toPar > 0 ? `+${toPar}` : toPar === 0 ? "E" : toPar;
    toParEl.className = `topar ${toPar < 0 ? "under" : toPar > 0 ? "over" : ""}`;
  } else {
    toParEl.textContent = "–";
    toParEl.className = "topar";
  }
  document.getElementById("scGrossNet").textContent = played ? `${total} / ${netTotal}` : "–";
}

async function loadActiveRound() {
  if (!currentCourseId) return;
  try {
    const res = await fetch(`/api/rounds/active?course_id=${currentCourseId}`);
    const data = await res.json();
    if (data) {
      currentRound = { id: data.id, scores: data.scores };
    } else {
      currentRound = await startNewRound();
    }
    liveRound = currentRound;
    renderScorecard();
  } catch (err) {
    setStatus(`Kunde inte ladda scorekort: ${err.message}`, true);
  }
}

async function startNewRound() {
  const res = await fetch("/api/rounds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ course_id: currentCourseId }),
  });
  const data = await res.json();
  return { id: data.id, scores: {} };
}

function setScorecardEditable(editable) {
  document.querySelectorAll("select.cell").forEach((sel) => { sel.disabled = !editable; });
}

function formatRoundDate(iso) {
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
}

// --- Statistik-sheet (dyker upp direkt efter score) ---

let statSheetReadOnly = false;

function openStatSheet(holeId) {
  const hole = holes.find((h) => h.id === holeId);
  statHoleId = holeId;
  statSheetReadOnly = currentRound !== liveRound;
  document.getElementById("statSheetTitle").textContent =
    `Hål ${hole.hole_number} — detaljer${statSheetReadOnly ? " (skrivskyddad)" : ""}`;
  document.getElementById("firRow").style.display = hole.par === 3 ? "none" : "";
  document.getElementById("statSheet").classList.toggle("readonly", statSheetReadOnly);
  const stat = currentRound.scores[holeId] || {};
  document.querySelectorAll(".stat-btns").forEach((group) => {
    const field = group.dataset.field;
    let strVal;
    const raw = stat[field];
    if (raw === undefined || raw === null) strVal = undefined;
    else if (field === "putts") strVal = raw >= 4 ? "4" : String(raw);
    else if (field === "miss_direction") strVal = raw;
    else strVal = String(raw);
    group.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", strVal !== undefined && btn.dataset.val === strVal);
      btn.disabled = statSheetReadOnly;
    });
  });
  statBackdrop.hidden = false;
}

function closeStatSheet() {
  statBackdrop.hidden = true;
  statHoleId = null;
}

async function saveStat(holeId, field, value) {
  if (!currentRound || currentRound !== liveRound) return;
  currentRound.scores[holeId] = { ...(currentRound.scores[holeId] || {}), [field]: value };
  try {
    await fetch(`/api/rounds/${currentRound.id}/holes/${holeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  } catch (err) {
    setStatus(`Kunde inte spara: ${err.message}`, true);
  }
}

document.querySelectorAll(".stat-btns").forEach((group) => {
  group.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const field = group.dataset.field;
      const val = btn.dataset.val;
      let sendVal;
      if (field === "fairway_hit" || field === "green_in_regulation") sendVal = val === "true";
      else if (field === "putts") sendVal = val === "4" ? 4 : Number(val);
      else sendVal = val;
      group.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (statHoleId !== null) saveStat(statHoleId, field, sendVal);
    });
  });
});

document.getElementById("statSheetClose").addEventListener("click", closeStatSheet);
statBackdrop.addEventListener("click", (e) => {
  if (e.target === statBackdrop) closeStatSheet();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !statBackdrop.hidden) closeStatSheet();
});

// --- Rundor (historik) ---

async function loadHistory() {
  const listEl = document.getElementById("historyList");
  listEl.innerHTML = '<p class="history-empty">Laddar...</p>';
  try {
    const res = await fetch(`/api/rounds?course_id=${currentCourseId}`);
    const rounds = await res.json();
    if (rounds.length === 0) {
      listEl.innerHTML = '<p class="history-empty">Inga sparade rundor ännu.</p>';
      return;
    }
    listEl.innerHTML = rounds.map((r) => {
      const played = r.holes_played > 0;
      const toPar = r.total_strokes - r.total_par;
      const toParStr = played ? (toPar > 0 ? `+${toPar}` : toPar === 0 ? "E" : toPar) : "–";
      const label = r.finished ? "" : " · pågående";
      return `<div class="history-row" data-id="${r.id}">
        <span class="date">${formatRoundDate(r.played_at)}${label}</span>
        <span class="stat">${played ? r.total_strokes + " slag" : "inga slag"} · ${toParStr}</span>
      </div>`;
    }).join("");
    listEl.querySelectorAll(".history-row").forEach((row) => {
      row.addEventListener("click", () => viewRound(Number(row.dataset.id)));
    });
  } catch (err) {
    listEl.innerHTML = `<p class="history-empty">Kunde inte ladda: ${err.message}</p>`;
  }
}

async function viewRound(roundId) {
  try {
    const res = await fetch(`/api/rounds/${roundId}`);
    const data = await res.json();
    currentRound = { id: data.id, scores: data.scores };
    const isLive = liveRound && data.id === liveRound.id;
    hideSecondaryPanels();
    scorecardPanel.hidden = false;
    scorecardMode = true;
    toggleScorecardBtn.textContent = "Dölj scorekort";
    setScorecardEditable(isLive);
    document.getElementById("historyBannerText").textContent = isLive
      ? "Pågående runda"
      : `Visar rundan från ${formatRoundDate(data.played_at)} (skrivskyddad)`;
    document.getElementById("historyBanner").hidden = isLive;
    renderScorecard();
  } catch (err) {
    setStatus(`Kunde inte ladda rundan: ${err.message}`, true);
  }
}

function backToLive() {
  currentRound = liveRound;
  document.getElementById("historyBanner").hidden = true;
  setScorecardEditable(true);
  renderScorecard();
}

// --- Klubbor ---

async function loadClubs() {
  try {
    const res = await fetch("/api/clubs");
    userClubs = await res.json();
    renderClubsList();
  } catch (err) {
    // caddytipset faller tillbaka på generiska avstånd
  }
}

function renderClubsList() {
  const listEl = document.getElementById("clubsList");
  if (userClubs.length === 0) {
    listEl.innerHTML = '<p class="history-empty">Inga klubbor tillagda — caddytipset använder generiska avstånd tills vidare.</p>';
    return;
  }
  listEl.innerHTML = userClubs.map((c) => `
    <div class="club-row">
      <span class="club-name">${c.name}</span>
      <span class="club-dist">${c.average_distance_m != null ? c.average_distance_m + " m" : "—"}</span>
      <button class="club-del" data-id="${c.id}">Ta bort</button>
    </div>
  `).join("");
  listEl.querySelectorAll(".club-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await fetch(`/api/clubs/${btn.dataset.id}`, { method: "DELETE" });
        loadClubs();
      } catch (err) {
        setStatus(`Kunde inte ta bort: ${err.message}`, true);
      }
    });
  });
}

document.getElementById("clubAddBtn").addEventListener("click", async () => {
  const nameInput = document.getElementById("clubNameInput");
  const distInput = document.getElementById("clubDistInput");
  const name = nameInput.value.trim();
  if (!name) return;
  try {
    await fetch("/api/clubs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, average_distance_m: distInput.value ? Number(distInput.value) : null }),
    });
    nameInput.value = "";
    distInput.value = "";
    loadClubs();
  } catch (err) {
    setStatus(`Kunde inte lägga till klubba: ${err.message}`, true);
  }
});

// --- Panel-navigering ---

function hideSecondaryPanels() {
  scorecardPanel.hidden = true;
  historyPanel.hidden = true;
  clubsPanel.hidden = true;
  scorecardMode = false;
  toggleScorecardBtn.textContent = "Scorekort";
}

holeSelect.addEventListener("change", (e) => selectHole(e.target.value));

toggleMappingBtn.addEventListener("click", () => {
  mappingMode = !mappingMode;
  mappingPanel.hidden = !mappingMode;
  toggleMappingBtn.textContent = mappingMode ? "Avsluta kartläggning" : "Kartläggningsläge";
});

document.querySelectorAll("#mappingPanel button[data-point]").forEach((btn) => {
  btn.addEventListener("click", () => saveCoord(btn.dataset.point));
});

toggleScorecardBtn.addEventListener("click", () => {
  const opening = scorecardPanel.hidden;
  hideSecondaryPanels();
  scorecardPanel.hidden = !opening;
  scorecardMode = opening;
  toggleScorecardBtn.textContent = opening ? "Dölj scorekort" : "Scorekort";
  if (opening && currentRound !== liveRound) backToLive();
});

document.getElementById("toggleHistory").addEventListener("click", () => {
  const opening = historyPanel.hidden;
  hideSecondaryPanels();
  historyPanel.hidden = !opening;
  if (opening) loadHistory();
});

document.getElementById("toggleClubs").addEventListener("click", () => {
  const opening = clubsPanel.hidden;
  hideSecondaryPanels();
  clubsPanel.hidden = !opening;
});

document.getElementById("backToLive").addEventListener("click", backToLive);

hcpInput.addEventListener("input", () => {
  localStorage.setItem("mc_hcp", hcpInput.value);
  renderScorecard();
});

scNewRoundBtn.addEventListener("click", async () => {
  if (!confirm("Starta en ny runda? Den pågående rundan avslutas.")) return;
  currentRound = liveRound = await startNewRound();
  document.getElementById("historyBanner").hidden = true;
  setScorecardEditable(true);
  renderScorecard();
});

const savedHcp = localStorage.getItem("mc_hcp");
if (savedHcp) hcpInput.value = savedHcp;

initPhotoMap();
loadCourse().catch((err) => setStatus(`Kunde inte ladda bana: ${err.message}`, true));
loadClubs();
watchPosition();
