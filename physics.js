// [file name]: physics.js
// [file content begin]
// Asteroid Impact Physics Calculations

// Constants
const DENSITY_KG_M3 = 3000; // Average asteroid density
const EARTH_RADIUS_KM = 6371;
const GRAVITY_M_S2 = 9.81;
const TNT_EQUIVALENT_JOULE = 4.184e9; // 1 ton TNT = 4.184e9 J

// Calculate asteroid mass from diameter (assuming spherical)
export function calculateMass(diameterM) {
    const radius = diameterM / 2;
    const volume = (4/3) * Math.PI * Math.pow(radius, 3);
    return volume * DENSITY_KG_M3;
}

// Calculate kinetic energy
export function calculateKineticEnergy(massKg, velocityMs) {
    return 0.5 * massKg * Math.pow(velocityMs, 2);
}

// Convert energy to megatons TNT equivalent
export function energyToMegatons(energyJoules) {
    return energyJoules / (TNT_EQUIVALENT_JOULE * 1e6); // Convert to megatons
}

// Estimate crater diameter using scaling law (simple approximation)
export function estimateCraterDiameter(energyJoules, isOceanic = false) {
    // Simple scaling: D ∝ E^(1/3.4)
    const energyMegatons = energyToMegatons(energyJoules);
    
    if (isOceanic) {
        // For oceanic impacts, crater is smaller due to water cushioning
        return Math.pow(energyMegatons, 1/3.4) * 500; // meters
    } else {
        // For land impacts
        return Math.pow(energyMegatons, 1/3.4) * 800; // meters
    }
}

// Estimate seismic magnitude equivalent
export function estimateSeismicMagnitude(energyJoules) {
    // Richter scale approximation: M ≈ (log10(E) - 4.8) / 1.5
    const energyErgs = energyJoules * 1e7; // Convert to ergs
    return (Math.log10(energyErgs) - 4.8) / 1.5;
}

// Estimate tsunami radius for oceanic impacts
export function estimateTsunamiRadius(energyJoules, depthM = 4000) {
    const energyMegatons = energyToMegatons(energyJoules);
    
    // Simple scaling based on impact energy and water depth
    const baseRadius = Math.pow(energyMegatons, 0.25) * 50; // km
    const depthFactor = Math.sqrt(depthM / 4000); // Scale by depth
    
    return baseRadius * depthFactor;
}

// Check if impact point is oceanic
export function isOceanicImpact(lat, lon) {
    // Simple approximation - consider coordinates between ±60 latitude as potential ocean
    // In a real app, you'd use a proper ocean/land dataset
    const isTropical = Math.abs(lat) < 60;
    const isLikelyOcean = isTropical && (Math.random() > 0.3); // 70% chance it's ocean in tropical zones
    
    return isLikelyOcean;
}

// Calculate all physics for a given meteor
export function calculateImpactPhysics(meteor) {
    const diameterM = parseFloat(meteor.diameter) || 100; // Default 100m
    const velocityMs = (meteor.velocity_km_s || 20) * 1000; // Convert km/s to m/s
    const lat = meteor.impact_point_2d?.lat || 0;
    const lon = meteor.impact_point_2d?.lon || 0;
    
    const mass = calculateMass(diameterM);
    const energy = calculateKineticEnergy(mass, velocityMs);
    const energyMegatons = energyToMegatons(energy);
    const oceanic = isOceanicImpact(lat, lon);
    const craterDiameter = estimateCraterDiameter(energy, oceanic);
    const magnitude = estimateSeismicMagnitude(energy);
    const tsunamiRadius = oceanic ? estimateTsunamiRadius(energy) : 0;
    
    return {
        mass: mass,
        massTons: mass / 1000,
        energyJoules: energy,
        energyMegatons: energyMegatons,
        craterDiameter: craterDiameter,
        seismicMagnitude: magnitude,
        isOceanic: oceanic,
        tsunamiRadius: tsunamiRadius,
        velocityMs: velocityMs
    };
}

// Apply deflection to trajectory
export function applyDeflection(originalVelocity, deltaV, deflectionAngle = 0) {
    // Convert deltaV from m/s to km/s if needed
    const deltaVKmS = deltaV / 1000;
    
    // Simple deflection: adjust velocity magnitude and direction
    const newVelocity = originalVelocity + deltaVKmS;
    
    return {
        newVelocity: newVelocity,
        deflectionApplied: deltaVKmS,
        deflectionAngle: deflectionAngle
    };
}
// [file content end]