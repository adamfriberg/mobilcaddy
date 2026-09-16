const statusEl = document.getElementById("status");
const holeSelect = document.getElementById("holeSelect");
const holeInfoEl = document.getElementById("holeInfo");
const distancesEl = document.getElementById("distances");
const mapEl = document.getElementById("holeMap");
const toggleMappingBtn = document.getElementById("toggleMapping");
const mappingPanel = document.getElementById("mappingPanel");
const mappingLog = document.getElementById("mappingLog");
const caddyTipEl = document.getElementById("caddyTip");
const caddyClubEl = document.getElementById("caddyClub");
const caddyAdviceEl = document.getElementById("caddyAdvice");
const toggleScorecardBtn = document.getElementById("toggleScorecard");
const scorecardPanel = document.getElementById("scorecardPanel");
const hcpInput = document.getElementById("hcpInput");
const scNewRoundBtn = document.getElementById("scNewRound");
const emojiPopEl = document.getElementById("emojiPop");

let holes = [];
let currentHole = null;
let currentCourseId = null;
let currentPosition = null;
let mappingMode = false;
let scorecardMode = false;
let currentRound = null; // { id, scores: { [holeId]: strokes } }

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
  renderMap();
  renderDistances();
}

function renderHoleInfo() {
  if (!currentHole) return;
  const meta = `Hål ${currentHole.hole_number} · Par ${currentHole.par} · ${currentHole.length_meters ?? "?"} m · Hcp ${currentHole.handicap_index ?? "?"}`;
  const image = currentHole.image_url
    ? `<img src="${currentHole.image_url}" alt="Hål ${currentHole.hole_number}" class="hole-image">`
    : "";
  const tips = currentHole.tips
    ? `<p class="hole-tips">${currentHole.tips.replace(/\n/g, "<br>")}</p>`
    : "";
  holeInfoEl.innerHTML = `<div class="hole-meta">${meta}</div>${image}${tips}`;
}

function hasGreenCoords(h) {
  return h && h.green_mid_lat != null && h.green_mid_lng != null;
}

function renderMap() {
  mapEl.innerHTML = "";
  if (!currentHole) return;

  const ns = "http://www.w3.org/2000/svg";
  const teeY = 460, greenY = 60, midX = 150;

  const fairway = document.createElementNS(ns, "line");
  fairway.setAttribute("x1", midX);
  fairway.setAttribute("y1", teeY);
  fairway.setAttribute("x2", midX);
  fairway.setAttribute("y2", greenY);
  fairway.setAttribute("class", "fairway-line");
  mapEl.appendChild(fairway);

  for (let d = 50; d < 450; d += 50) {
    const y = teeY - (d / 450) * (teeY - greenY);
    const ring = document.createElementNS(ns, "text");
    ring.setAttribute("x", midX + 20);
    ring.setAttribute("y", y);
    ring.setAttribute("class", "distance-ring");
    ring.textContent = `${d}m`;
    mapEl.appendChild(ring);
  }

  const tee = document.createElementNS(ns, "circle");
  tee.setAttribute("cx", midX);
  tee.setAttribute("cy", teeY);
  tee.setAttribute("r", 8);
  tee.setAttribute("class", "tee-marker");
  mapEl.appendChild(tee);

  const green = document.createElementNS(ns, "ellipse");
  green.setAttribute("cx", midX);
  green.setAttribute("cy", greenY);
  green.setAttribute("rx", 26);
  green.setAttribute("ry", 18);
  green.setAttribute("class", hasGreenCoords(currentHole) ? "green-marker" : "green-marker unmapped");
  mapEl.appendChild(green);

  if (!hasGreenCoords(currentHole)) {
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", midX);
    label.setAttribute("y", greenY - 28);
    label.setAttribute("class", "unmapped-label");
    label.setAttribute("text-anchor", "middle");
    label.textContent = "Green ej kartlagd";
    mapEl.appendChild(label);
  }
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

function recommendClub(distance) {
  let best = clubBag[0];
  let bestDiff = Math.abs(clubBag[0].dist - distance);
  clubBag.forEach((c) => {
    const diff = Math.abs(c.dist - distance);
    if (diff < bestDiff) { best = c; bestDiff = diff; }
  });
  return best;
}

function updateCaddyTip(mid) {
  if (mid === null) {
    caddyTipEl.hidden = true;
    return;
  }
  caddyTipEl.hidden = false;
  if (mid <= 15) {
    caddyClubEl.textContent = "Ingen klubba behövs — putt eller kort chip.";
    caddyAdviceEl.textContent = "Du är precis vid green — tänk kort spel och en säker putt.";
    return;
  }
  const club = recommendClub(mid);
  caddyClubEl.textContent = `Rekommenderad klubba: ${club.name} (≈${club.dist} m)`;
  caddyAdviceEl.textContent = mid <= 40
    ? "Nära green — chippa eller kör en kort wedge in mot flaggan."
    : `${mid} m kvar till mitten av green.`;
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
    renderMap();
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
  const netRow = '<div class="sc-grid-row net">' +
    subset.map((h) => `<span id="net-${h.id}">–</span>`).join("") +
    `<span id="scNetSub-${containerId}">–</span></div>`;
  el.innerHTML = holesRow + parRow + scoreRow + netRow;
  el.querySelectorAll("select.cell").forEach((sel) => {
    sel.addEventListener("focus", () => handleCellFocus(Number(sel.dataset.h)));
    sel.addEventListener("change", () => handleCellChange(Number(sel.dataset.h), sel.value));
  });
}

function buildScorecard() {
  buildScoreGrid("scGridFront", holes.filter((h) => h.hole_number <= 9), "Out");
  buildScoreGrid("scGridBack", holes.filter((h) => h.hole_number > 9), "In");
}

async function saveScore(holeId, strokes) {
  const hole = holes.find((h) => h.id === holeId);
  currentRound.scores[holeId] = strokes;
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
  if (!currentRound) return;
  if (currentRound.scores[holeId] !== undefined) return;
  const hole = holes.find((h) => h.id === holeId);
  saveScore(holeId, hole.par);
}

async function handleCellChange(holeId, rawValue) {
  if (!currentRound) return;
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
    if (!cell || !netEl) return;
    if (v === undefined) {
      cell.value = String(h.par);
      cell.className = "cell empty";
      netEl.textContent = "–";
      return;
    }
    const diff = v - h.par;
    cell.value = String(v);
    cell.className = `cell ${cellClass(diff)}`;
    const net = v - strokesForHole(h, hcp);
    netEl.textContent = net;
    total += v;
    netTotal += net;
    played++;
    playedPar += h.par;
    if (h.hole_number <= 9) { frontSum += v; frontNet += net; } else { backSum += v; backNet += net; }
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
  scorecardMode = !scorecardMode;
  scorecardPanel.hidden = !scorecardMode;
  toggleScorecardBtn.textContent = scorecardMode ? "Dölj scorekort" : "Scorekort";
});

hcpInput.addEventListener("input", () => {
  localStorage.setItem("mc_hcp", hcpInput.value);
  renderScorecard();
});

scNewRoundBtn.addEventListener("click", async () => {
  if (!confirm("Starta en ny runda? Den pågående rundan avslutas.")) return;
  currentRound = await startNewRound();
  renderScorecard();
});

const savedHcp = localStorage.getItem("mc_hcp");
if (savedHcp) hcpInput.value = savedHcp;

loadCourse().catch((err) => setStatus(`Kunde inte ladda bana: ${err.message}`, true));
watchPosition();
