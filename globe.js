// [file name]: globe.js
// [file content begin]
import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls, globe, earthGroup;
let impactTrajectory, missTrajectory, deflectionTrajectory;
let isRotating = true;
let currentMeteor = null;

// Starfield function
function getStarfield({ numStars = 2000, fog = false } = {}) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(numStars * 3);
  const colors = new Float32Array(numStars * 3);

  for (let i = 0; i < numStars; i++) {
    const i3 = i * 3;
    const radius = 100 + Math.random() * 400;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);

    positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = radius * Math.cos(phi);

    const colorVariation = Math.random() * 0.3;
    const blueTint = Math.random() * 0.2;
    colors[i3] = 0.7 + colorVariation;
    colors[i3 + 1] = 0.7 + colorVariation;
    colors[i3 + 2] = 0.8 + colorVariation + blueTint;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.5,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true
  });

  return new THREE.Points(geometry, material);
}

export function initGlobe() {
  const container = document.getElementById('three-globe');
  if (!container) return;

  // Scene setup
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  // Add starfield to scene
  scene.add(getStarfield({ numStars: 2000 }));

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Earth group for rotation
  earthGroup = new THREE.Group();
  scene.add(earthGroup);

  // Create Earth
  createEarth();

  // Position camera
  camera.position.z = 5;

  // Handle resize
  window.addEventListener('resize', onWindowResize);

  // Start animation loop
  animate();

  // Wire up globe controls
  wireGlobeControls();
}

function createEarth() {
  const geometry = new THREE.SphereGeometry(2, 64, 64);
  
  // Load Earth texture
  const textureLoader = new THREE.TextureLoader();
  const earthTexture = textureLoader.load('https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg');
  const bumpMap = textureLoader.load('https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png');
  
  const material = new THREE.MeshPhongMaterial({
    map: earthTexture,
    bumpMap: bumpMap,
    bumpScale: 0.05,
    specular: new THREE.Color(0x333333),
    shininess: 5
  });
  
  globe = new THREE.Mesh(geometry, material);
  earthGroup.add(globe);

  // Add atmosphere
  const atmosphereGeometry = new THREE.SphereGeometry(2.05, 64, 64);
  const atmosphereMaterial = new THREE.MeshPhongMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.1,
    side: THREE.BackSide
  });
  const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
  earthGroup.add(atmosphere);

  // Add ambient light
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  // Add directional light (sun)
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 3, 5);
  scene.add(directionalLight);
}

function onWindowResize() {
  const container = document.getElementById('three-globe');
  if (!container) return;

  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
  requestAnimationFrame(animate);

  if (isRotating && earthGroup) {
    earthGroup.rotation.y += 0.001;
  }

  controls.update();
  renderer.render(scene, camera);
}

function wireGlobeControls() {
  const resetBtn = document.getElementById('reset-globe-view');
  const rotateBtn = document.getElementById('toggle-globe-rotation');

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      controls.reset();
      camera.position.z = 5;
    });
  }

  if (rotateBtn) {
    rotateBtn.addEventListener('click', () => {
      isRotating = !isRotating;
      rotateBtn.textContent = isRotating ? 'Pause' : 'Rotate';
    });
  }
}

// Update trajectory based on meteor data
export function updateMeteorTrajectory(meteor) {
  currentMeteor = meteor;
  
  // Clear existing trajectories
  if (impactTrajectory) earthGroup.remove(impactTrajectory);
  if (missTrajectory) earthGroup.remove(missTrajectory);
  if (deflectionTrajectory) earthGroup.remove(deflectionTrajectory);

  if (!meteor.impact_point_2d) return;

  const { lat, lon } = meteor.impact_point_2d;
  
  // Convert lat/lon to 3D position on Earth surface
  const impactPos = latLonToVector3(lat, lon, 2.02);
  
  // Create impact trajectory (red)
  impactTrajectory = createTrajectory(
    new THREE.Vector3(10, 5, 8), // Start point in space
    impactPos, // Impact point on Earth
    0xff0000, // Red color
    'Impact Trajectory'
  );
  earthGroup.add(impactTrajectory);

  // Create near-miss trajectory (cyan) - slightly offset
  const missPos = latLonToVector3(lat + 5, lon + 5, 2.5);
  missTrajectory = createTrajectory(
    new THREE.Vector3(10, 5, 8),
    missPos,
    0x00ffff, // Cyan color
    'Near Miss'
  );
  earthGroup.add(missTrajectory);

  // Check if we have deflection applied
  const deflectionSlider = document.getElementById('deflection-slider');
  const isDeflected = deflectionSlider && parseFloat(deflectionSlider.value) > 0;
  
  if (isDeflected) {
    // Create deflected trajectory (green) - significantly offset
    const deflectionPos = latLonToVector3(lat + 15, lon + 15, 4.0);
    deflectionTrajectory = createTrajectory(
      new THREE.Vector3(10, 5, 8),
      deflectionPos,
      0x00ff00, // Green color
      'Deflected Path'
    );
    earthGroup.add(deflectionTrajectory);
  }

  // Add impact point marker
  addImpactMarker(impactPos);
}

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function createTrajectory(start, end, color, name) {
  const curve = new THREE.LineCurve3(start, end);
  const points = curve.getPoints(50);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  
  const material = new THREE.LineBasicMaterial({ 
    color: color,
    linewidth: 2
  });
  
  const trajectory = new THREE.Line(geometry, material);
  trajectory.name = name;
  
  // Add arrow head at the end
  const direction = new THREE.Vector3().subVectors(end, start).normalize();
  const arrowHelper = new THREE.ArrowHelper(direction, end, 0.3, color, 0.2, 0.1);
  trajectory.add(arrowHelper);
  
  return trajectory;
}

function addImpactMarker(position) {
  // Remove existing marker
  const existingMarker = earthGroup.getObjectByName('impactMarker');
  if (existingMarker) earthGroup.remove(existingMarker);

  // Create impact marker (red sphere)
  const markerGeometry = new THREE.SphereGeometry(0.05, 16, 16);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const marker = new THREE.Mesh(markerGeometry, markerMaterial);
  marker.position.copy(position);
  marker.name = 'impactMarker';
  
  earthGroup.add(marker);
}

// Initialize globe when DOM is loaded
document.addEventListener('DOMContentLoaded', initGlobe);
// [file content end]