const statusEl = document.getElementById("status");
const holeSelect = document.getElementById("holeSelect");
const holeInfoEl = document.getElementById("holeInfo");
const distancesEl = document.getElementById("distances");
const mapEl = document.getElementById("holeMap");
const toggleMappingBtn = document.getElementById("toggleMapping");
const mappingPanel = document.getElementById("mappingPanel");
const mappingLog = document.getElementById("mappingLog");

let holes = [];
let currentHole = null;
let currentPosition = null;
let mappingMode = false;

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
  holes = await fetch(`/api/courses/${course.id}/holes`).then((r) => r.json());
  holeSelect.disabled = false;
  holeSelect.innerHTML = holes
    .map((h) => `<option value="${h.id}">Hål ${h.hole_number} (par ${h.par})</option>`)
    .join("");
  setStatus(`${course.name} — ${holes.length} hål inlästa`);
  selectHole(holes[0]?.id);
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
  holeInfoEl.textContent = `Hål ${currentHole.hole_number} · Par ${currentHole.par} · ${currentHole.length_meters ?? "?"} m · Hcp ${currentHole.handicap_index ?? "?"}`;
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
    return;
  }
  const { lat, lng } = currentPosition;
  const points = [
    ["Fram", currentHole.green_front_lat, currentHole.green_front_lng],
    ["Mitt", currentHole.green_mid_lat, currentHole.green_mid_lng],
    ["Bak", currentHole.green_back_lat, currentHole.green_back_lng],
  ];
  const parts = points.map(([label, glat, glng]) => {
    const d = distanceMeters(lat, lng, glat, glng);
    return `${label}: ${d !== null ? d + " m" : "—"}`;
  });
  distancesEl.textContent = parts.join(" · ");
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

holeSelect.addEventListener("change", (e) => selectHole(e.target.value));

toggleMappingBtn.addEventListener("click", () => {
  mappingMode = !mappingMode;
  mappingPanel.hidden = !mappingMode;
  toggleMappingBtn.textContent = mappingMode ? "Avsluta kartläggning" : "Kartläggningsläge";
});

document.querySelectorAll("#mappingPanel button[data-point]").forEach((btn) => {
  btn.addEventListener("click", () => saveCoord(btn.dataset.point));
});

loadCourse().catch((err) => setStatus(`Kunde inte ladda bana: ${err.message}`, true));
watchPosition();
