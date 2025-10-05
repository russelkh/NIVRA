// [file name]: index.js
// [file content begin]
// ---- Globals ----
let allMeteors = [];
let currentMeteorIndex = 0;
let totalMeteors = 0;
let currentFeedImageIndex = 0;
let map, coreCircle, pulseCircle, craterCircle, tsunamiCircle, pulseInterval;
let impactRadius = 500000;
let currentMode = 'feed';
let currentPhysics = null;
let isDeflected = false;
let originalMeteorData = null;

import { updateMeteorTrajectory } from "./globe.js";
import { calculateImpactPhysics, applyDeflection } from "./physics.js";

// ---- Default images ----
const TOTAL_IMAGES = 50;
const DEFAULT_IMAGES = Array.from({ length: TOTAL_IMAGES }, (_, i) => `/static/images/meteor${i + 1}.png`);

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  wireModeSelection();
  wireControls();
  wireMeteorNavigation();
  wireRightPanelTabs();
  wireSimulationControls();
  initMap();
  injectDynamicCSS();
  fetchAndRenderMeteors('feed');
});

// ---- Simulation Controls ----
function wireSimulationControls() {
  const sizeSlider = document.getElementById('size-slider');
  const velocitySlider = document.getElementById('velocity-slider');
  const deflectionSlider = document.getElementById('deflection-slider');
  const applyBtn = document.getElementById('apply-simulation');
  const resetBtn = document.getElementById('reset-simulation');

  // Update slider value displays
  sizeSlider.addEventListener('input', () => {
    document.getElementById('size-value').textContent = `${sizeSlider.value} m`;
  });

  velocitySlider.addEventListener('input', () => {
    document.getElementById('velocity-value').textContent = `${velocitySlider.value} km/s`;
  });

  deflectionSlider.addEventListener('input', () => {
    document.getElementById('deflection-value').textContent = `${deflectionSlider.value} m/s`;
  });

  // Apply simulation
  applyBtn.addEventListener('click', () => {
    if (!allMeteors.length || currentMeteorIndex >= allMeteors.length) return;
    
    const meteor = allMeteors[currentMeteorIndex];
    originalMeteorData = {...meteor}; // Save original data
    
    // Apply user modifications
    meteor.diameter = sizeSlider.value;
    meteor.velocity_km_s = parseFloat(velocitySlider.value);
    
    const deflectionDeltaV = parseFloat(deflectionSlider.value);
    if (deflectionDeltaV > 0) {
      const deflectionResult = applyDeflection(meteor.velocity_km_s, deflectionDeltaV);
      meteor.velocity_km_s = deflectionResult.newVelocity;
      isDeflected = true;
    } else {
      isDeflected = false;
    }
    
    // Recalculate physics and update visualizations
    updatePhysicsAndVisualizations(meteor);
  });

  // Reset simulation
  resetBtn.addEventListener('click', () => {
    if (originalMeteorData && allMeteors.length) {
      allMeteors[currentMeteorIndex] = {...originalMeteorData};
      isDeflected = false;
      updatePhysicsAndVisualizations(allMeteors[currentMeteorIndex]);
      
      // Reset sliders to original values
      sizeSlider.value = originalMeteorData.diameter || 150;
      velocitySlider.value = originalMeteorData.velocity_km_s || 25;
      deflectionSlider.value = 0;
      
      document.getElementById('size-value').textContent = `${sizeSlider.value} m`;
      document.getElementById('velocity-value').textContent = `${velocitySlider.value} km/s`;
      document.getElementById('deflection-value').textContent = `${deflectionSlider.value} m/s`;
    }
  });
}

// ---- Update Physics and Visualizations ----
function updatePhysicsAndVisualizations(meteor) {
  // Calculate physics
  currentPhysics = calculateImpactPhysics(meteor);
  
  // Update physics results display
  updatePhysicsResults(currentPhysics);
  
  // Update map with new impact zones
  if (meteor.impact_point_2d) {
    updateMap(
      meteor.impact_point_2d.lat, 
      meteor.impact_point_2d.lon, 
      currentPhysics
    );
  }
  
  // Update globe trajectory
  updateMeteorTrajectory(meteor);
  
  // Update meteor card
  renderCurrentMeteor();
}

// ---- Update Physics Results Display ----
function updatePhysicsResults(physics) {
  document.getElementById('energy-value').textContent = `${physics.energyMegatons.toFixed(2)} MT`;
  document.getElementById('crater-value').textContent = `${physics.craterDiameter.toFixed(0)} m`;
  document.getElementById('seismic-value').textContent = `M ${physics.seismicMagnitude.toFixed(1)}`;
  document.getElementById('impact-type').textContent = physics.isOceanic ? 'Oceanic' : 'Terrestrial';
  
  // Show/hide tsunami info
  const tsunamiItem = document.getElementById('tsunami-item');
  const tsunamiValue = document.getElementById('tsunami-value');
  if (physics.isOceanic && physics.tsunamiRadius > 0) {
    tsunamiItem.style.display = 'flex';
    tsunamiValue.textContent = `${physics.tsunamiRadius.toFixed(0)} km`;
  } else {
    tsunamiItem.style.display = 'none';
  }
  
  // Show deflection status
  const deflectionResult = document.getElementById('deflection-result');
  const deflectionStatus = document.getElementById('deflection-status');
  if (isDeflected) {
    deflectionResult.style.display = 'flex';
    // Simple check: if deflection > 50 m/s, consider it successful
    const deflectionSuccess = parseFloat(document.getElementById('deflection-slider').value) > 50;
    if (deflectionSuccess) {
      deflectionStatus.textContent = 'Earth Safe ✅';
      deflectionStatus.className = 'result-value safe';
    } else {
      deflectionStatus.textContent = 'Partial Deflection ⚠️';
      deflectionStatus.className = 'result-value warning';
    }
  } else {
    deflectionResult.style.display = 'none';
  }
}

// ---- Mode Selection ----
function wireModeSelection() {
  const modeButtons = document.querySelectorAll('.mode-button');
  const modePanels = document.querySelectorAll('.mode-panel');

  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      modePanels.forEach(p => p.classList.toggle('active', p.getAttribute('data-mode') === mode));
      currentMode = mode;

      // Reset index each switch
      currentMeteorIndex = 0;
      isDeflected = false;

      // Show/hide navigation buttons based on mode
      updateNavigationVisibility();

      if (mode === 'feed') fetchAndRenderMeteors('feed');
    });
  });
}

// ---- Controls ----
function wireControls() {
  const refreshBtn = document.getElementById('refresh-data-btn');
  refreshBtn.addEventListener('click', async () => {
    try {
      refreshBtn.disabled = true;
      refreshBtn.textContent = currentMode === 'feed' ? '🔄 Loading...' : '🔄 Refreshing...';

      if (currentMode === 'feed') {
        if (allMeteors.length > 0) {
          currentMeteorIndex = (currentMeteorIndex + 1) % allMeteors.length;
          isDeflected = false;
          updatePhysicsAndVisualizations(allMeteors[currentMeteorIndex]);
          updateMeteorNavigation();
          updateAnalysisDashboard();
          updateDataStatus('feed', `Showing meteor ${currentMeteorIndex + 1} of ${allMeteors.length}`, 'active');
        } else {
          await fetchAndRenderMeteors('feed');
        }
      } else {
        const yearInput = document.getElementById('year-input');
        const year = parseInt(yearInput.value);
        if (!year || year < 1900 || year > 2030) {
          alert('Enter a valid year to refresh browse data');
          return;
        }
        await fetchAndRenderMeteors('browse', year);
      }
    } catch (e) {
      console.error(e);
      updateDataStatus(currentMode, 'Error refreshing data', 'error');
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = currentMode === 'feed' ? '🔄 Next Meteor' : '🔄 Refresh Data';
    }
  });

  const yearInput = document.getElementById('year-input');
  const searchBtn = document.getElementById('search-year-btn');

  searchBtn.addEventListener('click', async () => {
    const year = parseInt(yearInput.value);
    if (!year || year < 1900 || year > 2030) {
      alert('Please enter a valid year between 1900 and 2030');
      return;
    }
    try {
      searchBtn.disabled = true;
      searchBtn.textContent = '🔍 Searching...';
      updateDataStatus('browse', `Searching year ${year}...`, 'loading');

      await fetchAndRenderMeteors('browse', year);
    } catch (e) {
      console.error(e);
      updateDataStatus('browse', 'Search failed', 'error');
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = '🔍 Search';
    }
  });

  yearInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchBtn.click();
  });
}

// ---- Meteor Navigation ----
function wireMeteorNavigation() {
  const prevBtn = document.getElementById('prev-meteor');
  const nextBtn = document.getElementById('next-meteor');

  prevBtn.addEventListener('click', () => {
    if (currentMode === 'browse' && currentMeteorIndex > 0) {
      currentMeteorIndex--;
      isDeflected = false;
      updatePhysicsAndVisualizations(allMeteors[currentMeteorIndex]);
      updateMeteorNavigation();
      updateAnalysisDashboard();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (currentMode === 'browse' && currentMeteorIndex < allMeteors.length - 1) {
      currentMeteorIndex++;
      isDeflected = false;
      updatePhysicsAndVisualizations(allMeteors[currentMeteorIndex]);
      updateMeteorNavigation();
      updateAnalysisDashboard();
    }
  });
}

function updateMeteorNavigation() {
  const prevBtn = document.getElementById('prev-meteor');
  const nextBtn = document.getElementById('next-meteor');
  const counter = document.getElementById('meteor-counter');

  if (!allMeteors.length) {
    if (counter) counter.textContent = '0 / 0';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  if (currentMode === 'browse') {
    counter.textContent = `${currentMeteorIndex + 1} / ${allMeteors.length}`;
    prevBtn.disabled = currentMeteorIndex === 0;
    nextBtn.disabled = currentMeteorIndex >= allMeteors.length - 1;
  } else {
    counter.textContent = '';
    prevBtn.disabled = true;
    nextBtn.disabled = true;
  }
}

function updateNavigationVisibility() {
  const navContainer = document.querySelector('.meteor-nav');
  const counter = document.getElementById('meteor-counter');
  if (navContainer) navContainer.style.display = currentMode === 'browse' ? 'flex' : 'none';
  if (counter) counter.style.display = currentMode === 'browse' ? 'inline-block' : 'none';
}

// ---- Right Panel Tabs ----
function wireRightPanelTabs() {
  const viewTabs = document.querySelectorAll('.view-tab');
  const viewPanels = document.querySelectorAll('.view-panel');

  viewTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.getAttribute('data-view');
      viewTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      viewPanels.forEach(p => p.classList.toggle('active', p.getAttribute('data-view') === view));
      if (view === 'map' && map) setTimeout(() => map.invalidateSize(), 300);
    });
  });
}

// ---- Image Assignment ----
function assignImagesSequential(meteors) {
  meteors.forEach(meteor => {
    currentFeedImageIndex = (currentFeedImageIndex % TOTAL_IMAGES) + 1;
    meteor.image_url = `/static/images/meteor${currentFeedImageIndex}.png`;
  });
}

function assignImagesById(meteors) {
  meteors.forEach(meteor => {
    const identifier = meteor.id || meteor.name || meteor.date || "";
    let hash = 0;
    for (let i = 0; i < identifier.length; i++) {
      hash = ((hash << 5) - hash) + identifier.charCodeAt(i);
      hash &= hash;
    }
    meteor.image_url = DEFAULT_IMAGES[Math.abs(hash) % TOTAL_IMAGES];
  });
}

// ---- Data Status ----
function updateDataStatus(mode, message, status) {
  const containerId = mode === 'feed' ? 'feed-status' : 'browse-status';
  const container = document.getElementById(containerId);
  if (!container) return;

  const statusText = container.querySelector('.status-text');
  const statusDot = container.querySelector('.status-dot');

  if (statusText) statusText.textContent = message;
  if (statusDot) {
    statusDot.className = 'status-dot';
    statusDot.style.background =
      status === 'loading' ? '#fbbf24' :
      status === 'error'   ? '#ef4444' :
      '#00ffcc';
  }
}

// ---- Backend Fetch ----
async function fetchAndRenderMeteors(apiType = 'feed', year = null) {
  try {
    updateDataStatus(apiType, 'Loading meteors...', 'loading');

    let url;
    let options = {};
    if (apiType === 'feed') {
      url = '/api/meteors';
    } else if (apiType === 'browse') {
      if (!year) throw new Error('Year is required for browse mode');
      url = `/api/browse/${year}`;
      options = { method: 'POST' };
    }

    const res = await fetch(url, options);
    if (!res.ok) throw new Error('Failed to fetch meteors');
    const meteors = await res.json();

    allMeteors = Array.isArray(meteors) ? meteors : [];

    if (!allMeteors.length) {
      updateDataStatus(apiType, 'No meteors found', 'error');
      renderEmptyState();
      return;
    }

    if (apiType === 'feed') {
      assignImagesSequential(allMeteors);
      updateDataStatus(apiType, `Loaded ${allMeteors.length} meteors`, 'active');
      toggleNavControls(false);
    } else {
      assignImagesById(allMeteors);
      updateDataStatus(apiType, `Loaded ${allMeteors.length} meteors for year ${year}`, 'active');
      toggleNavControls(true);
    }

    currentMeteorIndex = 0;
    isDeflected = false;
    updatePhysicsAndVisualizations(allMeteors[currentMeteorIndex]);
    updateMeteorNavigation();
    updateAnalysisDashboard();

  } catch (error) {
    console.error(error);
    updateDataStatus(apiType, 'Error loading meteors', 'error');
    renderEmptyState();
  }
}

// ---- Meteor Rendering ----
function renderCurrentMeteor() {
  const carousel = document.getElementById('meteor-carousel');
  if (!allMeteors.length) { renderEmptyState(); return; }

  const meteor = allMeteors[currentMeteorIndex];
  if (!meteor) { renderEmptyState(); return; }

  const card = createMeteorCard(meteor);
  carousel.innerHTML = '';
  carousel.appendChild(card);
}

function createMeteorCard(meteor) {
  const card = document.createElement('div');
  card.className = 'meteor-card active';
  card.dataset.meteor = currentMeteorIndex;
  card.innerHTML = `
    <div class="meteor-visual">
      <img class="meteor-image" src="${meteor.image_url || ''}" alt="${meteor.name || 'Meteor'}" />
    </div>
    <div class="meteor-data">
      <div class="data-row"><span class="data-label">Object:</span><span class="data-value">${meteor.name || '—'}</span></div>
      <div class="data-row"><span class="data-label">Diameter:</span><span class="data-value">${meteor.diameter || '—'}</span></div>
      <div class="data-row"><span class="data-label">Velocity:</span><span class="data-value">${meteor.velocity_km_s != null ? meteor.velocity_km_s + ' km/s' : '—'}</span></div>
      <div class="data-row"><span class="data-label">Impact Risk:</span><span class="data-value">${meteor.impact_risk || '—'}</span></div>
      <div class="data-row"><span class="data-label">Date:</span><span class="data-value">${meteor.date || '—'}</span></div>
    </div>
  `;
  return card;
}

function renderEmptyState() {
  const carousel = document.getElementById('meteor-carousel');
  carousel.innerHTML = `
    <div class="meteor-card active">
      <div class="meteor-visual"><div class="loading-placeholder"><p>❌ No meteors available</p></div></div>
      <div class="meteor-data"><div class="data-row"><span class="data-label">Status:</span><span class="data-value">No Data</span></div></div>
    </div>
  `;
  updateMeteorNavigation();
}

function toggleNavControls(show) {
  const navControls = document.getElementById('nav-controls');
  if (navControls) navControls.style.display = show ? 'flex' : 'none';
}

// ---- Map ----
function initMap() {
  map = L.map('impact-map').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
}

function updateMap(lat, lon, physics) {
  if (!map) return;

  // Clear existing circles
  if (coreCircle) map.removeLayer(coreCircle);
  if (pulseCircle) map.removeLayer(pulseCircle);
  if (craterCircle) map.removeLayer(craterCircle);
  if (tsunamiCircle) map.removeLayer(tsunamiCircle);

  // Clear existing interval
  if (pulseInterval) clearInterval(pulseInterval);

  // Set map center
  map.setView([lat, lon], 4);

  // Add impact point
  L.marker([lat, lon]).addTo(map)
    .bindPopup('Impact Point')
    .openPopup();

  // Add core impact zone (red)
  coreCircle = L.circle([lat, lon], {
    color: 'red',
    fillColor: '#f03',
    fillOpacity: 0.5,
    radius: physics ? physics.craterDiameter / 2 : 1000
  }).addTo(map);

  // Add detection radius (blue)
  pulseCircle = L.circle([lat, lon], {
    color: 'blue',
    fillColor: '#03f',
    fillOpacity: 0.1,
    radius: impactRadius
  }).addTo(map);

  // Add crater radius (yellow)
  if (physics && physics.craterDiameter) {
    craterCircle = L.circle([lat, lon], {
      color: 'yellow',
      fillColor: '#ff0',
      fillOpacity: 0.3,
      radius: physics.craterDiameter / 2
    }).addTo(map);
  }

  // Add tsunami zone (blue) for oceanic impacts
  if (physics && physics.isOceanic && physics.tsunamiRadius) {
    tsunamiCircle = L.circle([lat, lon], {
      color: 'blue',
      fillColor: '#00f',
      fillOpacity: 0.2,
      radius: physics.tsunamiRadius * 1000 // Convert km to meters
    }).addTo(map);
  }

  // Animate pulse
  let pulseRadius = impactRadius;
  pulseInterval = setInterval(() => {
    pulseRadius += 50000;
    if (pulseRadius > impactRadius * 2) pulseRadius = impactRadius;
    pulseCircle.setRadius(pulseRadius);
  }, 1000);
}

// ---- Analysis Dashboard ----
function updateAnalysisDashboard() {
  if (!allMeteors.length || currentMeteorIndex >= allMeteors.length) return;

  const meteor = allMeteors[currentMeteorIndex];
  const velocityDisplay = document.getElementById('velocity-display');
  const diameterDisplay = document.getElementById('diameter-display');
  const detectionTimeDisplay = document.getElementById('detection-time-display');
  const missDistanceDisplay = document.getElementById('miss-distance-display');

  if (velocityDisplay) velocityDisplay.textContent = `${meteor.velocity_km_s || '—'} km/s`;
  if (diameterDisplay) diameterDisplay.textContent = `${meteor.diameter || '—'} m`;
  if (detectionTimeDisplay) detectionTimeDisplay.textContent = meteor.date || '—';
  if (missDistanceDisplay) missDistanceDisplay.textContent = meteor.miss_distance_km || '—';

  // Update risk assessment
  updateRiskAssessment(meteor);
}

function updateRiskAssessment(meteor) {
  const riskLevel = document.getElementById('risk-level');
  const riskAssessment = document.getElementById('risk-assessment');

  if (!riskLevel || !riskAssessment) return;

  // Simple risk calculation based on diameter and velocity
  const diameter = parseFloat(meteor.diameter) || 0;
  const velocity = parseFloat(meteor.velocity_km_s) || 0;
  
  let riskPercent = Math.min((diameter / 1000) * (velocity / 50) * 100, 100);
  let riskText = 'Low Risk';
  
  if (riskPercent > 70) riskText = 'High Risk';
  else if (riskPercent > 30) riskText = 'Medium Risk';

  riskLevel.style.width = `${riskPercent}%`;
  riskAssessment.textContent = riskText;
}

// ---- Dynamic CSS ----
function injectDynamicCSS() {
  const style = document.createElement('style');
  style.textContent = `
    .simulation-controls {
      margin: 1rem 0;
      padding: 1rem;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
    }
    
    .simulation-controls h3 {
      margin: 0 0 1rem 0;
      color: #00ffcc;
      font-size: 1.1rem;
    }
    
    .control-item {
      display: flex;
      align-items: center;
      margin-bottom: 0.8rem;
      gap: 0.5rem;
    }
    
    .control-item label {
      flex: 1;
      font-size: 0.9rem;
      color: #ccc;
    }
    
    .sim-slider {
      flex: 2;
      height: 4px;
      background: #333;
      border-radius: 2px;
      outline: none;
    }
    
    .control-item span {
      min-width: 60px;
      text-align: right;
      font-size: 0.9rem;
      color: #00ffcc;
    }
    
    .physics-results {
      margin: 1rem 0;
      padding: 1rem;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
    }
    
    .physics-results h4 {
      margin: 0 0 1rem 0;
      color: #00ffcc;
      font-size: 1.1rem;
    }
    
    .results-grid {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    
    .result-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .result-item.full-width {
      grid-column: 1 / -1;
    }
    
    .result-label {
      flex: 1;
      font-size: 0.9rem;
      color: #ccc;
    }
    
    .result-value {
      font-weight: bold;
      color: #fff;
    }
    
    .result-value.safe {
      color: #00ff00;
    }
    
    .result-value.warning {
      color: #ffaa00;
    }
    
    .result-tooltip {
      cursor: help;
      opacity: 0.7;
    }
    
    .secondary-btn {
      background: #555;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      cursor: pointer;
      margin-left: 0.5rem;
    }
    
    .secondary-btn:hover {
      background: #666;
    }
  `;
  document.head.appendChild(style);
}
// [file content end]