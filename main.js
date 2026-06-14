import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { fetchApod, getNearEarthObjects, getFireballEvents, getSentryVirtualImpactors, getSentryObjectDetails } from './services/nasaApi.js';
import { getCloseApproaches } from './services/asteroidApi.js';
import { searchSpaceExperiments, getExperimentDetails } from './services/researchApi.js';
import { getCoronalMassEjections, getCmeAnalysis } from './services/donkiApi.js';
import { getSatellites, getSatelliteById, getSatellitesByName, getSatcatRecordsByName } from './services/satelliteApi.js';
const canvas = document.querySelector('canvas.webgl');

// Scene
const scene = new THREE.Scene();

// Particles for a space-like background
const particlesGeometry = new THREE.BufferGeometry();
const particlesCount = 1500;
const posArray = new Float32Array(particlesCount * 3);

for (let i = 0; i < particlesCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 60;
}
particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const particlesMaterial = new THREE.PointsMaterial({
    size: 0.05,
    color: 0xffffff,
    transparent: true,
    opacity: 0.6,
});
const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
scene.add(particlesMesh);

// --- WARP SPEED EFFECT (Entering System) ---
const warpGeometry = new THREE.BufferGeometry();
const warpCount = 600;
const warpPositions = new Float32Array(warpCount * 6); // 2 points per line (start and end)
for (let i = 0; i < warpCount; i++) {
    // Start dynamically generated far away
    const x = (Math.random() - 0.5) * 200;
    const y = (Math.random() - 0.5) * 200;
    const z = -50 - Math.random() * 300;

    // Line start
    warpPositions[i * 6] = x;
    warpPositions[i * 6 + 1] = y;
    warpPositions[i * 6 + 2] = z;

    // Line end (stretched backward strongly)
    warpPositions[i * 6 + 3] = x;
    warpPositions[i * 6 + 4] = y;
    warpPositions[i * 6 + 5] = z - 60; // Long streaks
}
warpGeometry.setAttribute('position', new THREE.BufferAttribute(warpPositions, 3));
const warpMaterial = new THREE.LineBasicMaterial({
    color: 0x00fff9,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending
});
const warpLines = new THREE.LineSegments(warpGeometry, warpMaterial);
scene.add(warpLines);

// --- SOLAR FLARE EFFECT ---
const flareGeometry = new THREE.SphereGeometry(2, 32, 32);
const flareMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending
});
const solarFlare = new THREE.Mesh(flareGeometry, flareMaterial);
scene.add(solarFlare);

let isWarping = false; // Triggered after loading screen finishes

// --- GLOBAL STATE ---
let isZenMode = false;
let isDreamMode = false;
let hintTimeout;
let quoteInterval;
let quoteIndex = 0;
const zenQuotes = [
    { text: "Look again at that dot. That's here. That's home. That's us.", author: "Carl Sagan" },
    { text: "The cosmos is within us. We are made of star-stuff. ", author: "Carl Sagan" },
    { text: "Somewhere, something incredible is waiting to be known.", author: "Mary Anne Radmacher" },
    { text: "The universe is full of magical things, patiently waiting for our wits to grow sharper.", author: "Eden Phillpotts" },
    { text: "For small creatures such as we, the vastness is bearable only through love.", author: "Carl Sagan" },
    { text: "I have loved the stars too fondly to be fearful of the night.", author: "Sarah Williams" },
    { text: "Nature is not a place to visit. It is home.", author: "Gary Snyder" }
];

// --- PROCEDURAL NEBULA CLOUDS ---
const nebulaGroup = new THREE.Group();
const nebulaCount = 6;
// Generate a radial gradient texture programmatically to bypass CORS completely
const flareCanvas = document.createElement('canvas');
flareCanvas.width = 256;
flareCanvas.height = 256;
const ctx = flareCanvas.getContext('2d');
const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, 256, 256);
const nebulaMap = new THREE.CanvasTexture(flareCanvas);

for (let i = 0; i < nebulaCount; i++) {
    const geo = new THREE.PlaneGeometry(100, 100);
    const mat = new THREE.MeshBasicMaterial({
        map: nebulaMap,
        color: i % 2 === 0 ? 0x4f46e5 : 0x7c3aed,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const nebula = new THREE.Mesh(geo, mat);
    const dist = 60 + Math.random() * 40;
    const phi = Math.random() * Math.PI * 2;
    const theta = Math.random() * Math.PI;
    nebula.position.set(dist * Math.sin(theta) * Math.cos(phi), dist * Math.sin(theta) * Math.sin(phi), dist * Math.cos(theta));
    nebula.lookAt(0, 0, 0);
    nebula.rotation.z = Math.random() * Math.PI;
    nebulaGroup.add(nebula);
}
scene.add(nebulaGroup);
// Disable nebula planes (removes blue/purple corner haze)
nebulaGroup.visible = false;

// --- PROCEDURAL SATELLITE ---
const createSatellite = () => {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.7), bodyMat);
    group.add(body);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x2244ff, side: THREE.DoubleSide, metalness: 0.8 });
    const pL = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.6), panelMat); pL.position.x = -1; group.add(pL);
    const pR = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.6), panelMat); pR.position.x = 1; group.add(pR);
    const dish = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 8), bodyMat); dish.position.z = 0.5; dish.rotation.x = Math.PI / 2; group.add(dish);
    return group;
};
const satellite = createSatellite();
const satOrbit = { rX: 25, rZ: 32, speed: 0.003, angle: Math.random() * Math.PI * 2 };
scene.add(satellite);

// --- SURFACE SCAN PROJECTIONS ---
const scanPoints = new THREE.Group();
const scanPointMat = new THREE.MeshBasicMaterial({ color: 0x00fff9, transparent: true, opacity: 0.8 });
for (let i = 0; i < 30; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), scanPointMat.clone());
    const phi = Math.random() * Math.PI * 2; const theta = Math.random() * Math.PI; const r = 15.05;
    p.position.set(r * Math.sin(theta) * Math.cos(phi), r * Math.sin(theta) * Math.sin(phi), r * Math.cos(theta));
    scanPoints.add(p);
}


// --- VERTICAL SCANNER LINE ---
const scannerLineGeo = new THREE.TorusGeometry(15.2, 0.02, 8, 100);
const scannerLineMat = new THREE.MeshBasicMaterial({ color: 0x00fff9, transparent: true, opacity: 0.5 });
const scannerLine = new THREE.Mesh(scannerLineGeo, scannerLineMat);
scannerLine.rotation.x = Math.PI / 2;
scene.add(scannerLine);

// --- CONSTELLATION LINES ---
// Define famous constellation shapes as simple local 3D point arrays
const constellationShapes = {
    // Basic Big Dipper (with closed cup)
    'ursa_major': [
        [0, 0, 0], [1, 0.2, -0.1], // handle
        [1, 0.2, -0.1], [2, 0.5, -0.2], // handle
        [2, 0.5, -0.2], [3, 0, 0], // cup corner
        [3, 0, 0], [3, -1, 0.2], // cup bottom
        [3, -1, 0.2], [4, -0.8, 0.5], // cup front bottom
        [4, -0.8, 0.5], [4.1, 0.3, 0.3], // cup front top
        [4.1, 0.3, 0.3], [3, 0, 0], // cup top close
        [3, 0, 0], [2, 0.5, -0.2] // extra close to make the square obvious
    ],
    // Orion
    'orion': [
        [0, 2, 0], [-0.5, 0.5, 0.2], // head to shoulder
        [0, 2, 0], [0.8, 0.3, -0.1], // head to shoulder
        [-0.5, 0.5, 0.2], [0, -1, 0], // shoulder to belt
        [0.8, 0.3, -0.1], [0, -1, 0], // shoulder to belt
        [-0.4, -1.1, 0.1], [0.4, -0.9, -0.1], // belt
        [-0.5, -2.5, 0.3], [0, -1, 0], // belt to foot
        [0.6, -2.2, -0.2], [0, -1, 0], // belt to foot
        [-0.5, 0.5, 0.2], [0.8, 0.3, -0.1], // close top triangle
        [-0.5, -2.5, 0.3], [0.6, -2.2, -0.2] // close bottom triangle (hourglass shape)
    ],
    // Gemini (Twins - connected to form box)
    'gemini': [
        [0, 2, 0], [0, 1, 0], // Castor head to body
        [1.5, 1.8, 0], [1.5, 0.8, 0], // Pollux head to body
        [0, 1, 0], [-0.5, 0, 0], // Castor body to leg
        [0, 1, 0], [0.5, 0, 0], // Castor body to leg
        [1.5, 0.8, 0], [1, -0.2, 0], // Pollux body to leg
        [1.5, 0.8, 0], [2, -0.2, 0], // Pollux body to leg
        [0, 2, 0], [1.5, 1.8, 0], // connect heads
        [0, 1, 0], [1.5, 0.8, 0] // connect bodies
    ],
    // Pisces (V-shape fishes with closed triangles)
    'pisces': [
        [0, 0, 0], [1, 1, 0],
        [1, 1, 0], [1.5, 1.8, 0],
        [1.5, 1.8, 0], [1.2, 2.2, 0], // fish 1
        [1.5, 1.8, 0], [1.8, 2.0, 0], // fish 1
        [1.2, 2.2, 0], [1.8, 2.0, 0], // close fish 1 tail
        [0, 0, 0], [-1.5, -0.5, 0],
        [-1.5, -0.5, 0], [-2.5, -0.2, 0],
        [-2.5, -0.2, 0], [-3, 0.2, 0], // fish 2
        [-2.5, -0.2, 0], [-2.8, -0.6, 0], // fish 2
        [-3, 0.2, 0], [-2.8, -0.6, 0] // close fish 2 tail
    ]
};

// ZEN Mode Gentle Constellations
const zenConstellationShapes = {
    // A simple 6-petal flower
    'flower': [
        // Center pentagon
        [-0.3, -0.3, 0], [0.3, -0.3, 0],
        [0.3, -0.3, 0], [0.5, 0.2, 0],
        [0.5, 0.2, 0], [0, 0.6, 0],
        [0, 0.6, 0], [-0.5, 0.2, 0],
        [-0.5, 0.2, 0], [-0.3, -0.3, 0],
        // Petal 1 top
        [0, 0.6, 0], [0.5, 1.5, 0],
        [0.5, 1.5, 0], [-0.5, 1.5, 0],
        [-0.5, 1.5, 0], [0, 0.6, 0],
        // Petal 2 right
        [0.5, 0.2, 0], [1.5, 0.7, 0],
        [1.5, 0.7, 0], [1.5, -0.2, 0],
        [1.5, -0.2, 0], [0.3, -0.3, 0],
        // Petal 3 bottom right
        [0.3, -0.3, 0], [1.0, -1.2, 0],
        [1.0, -1.2, 0], [0.2, -1.5, 0],
        [0.2, -1.5, 0], [-0.3, -0.3, 0],
        // Petal 4 bottom left
        [-0.3, -0.3, 0], [-1.0, -1.2, 0],
        [-1.0, -1.2, 0], [-0.2, -1.5, 0],
        [-0.2, -1.5, 0], [0.3, -0.3, 0],
        // Petal 5 left
        [-0.5, 0.2, 0], [-1.5, 0.7, 0],
        [-1.5, 0.7, 0], [-1.5, -0.2, 0],
        [-1.5, -0.2, 0], [-0.3, -0.3, 0],
        // Stem
        [0, -0.3, 0], [0, -2.0, 0]
    ],
    // A butterfly
    'butterfly': [
        // Body
        [0, 1, 0], [0, -1, 0],
        [0, 1, 0], [0.1, 1.5, 0.2], // Antenna R
        [0, 1, 0], [-0.1, 1.5, 0.2], // Antenna L
        // Wing top right
        [0, 0.5, 0], [2, 1.5, 0.5],
        [2, 1.5, 0.5], [2.5, 0, 0],
        [2.5, 0, 0], [0, 0, 0],
        // Wing bot right
        [0, 0, 0], [1.5, -1.5, -0.2],
        [1.5, -1.5, -0.2], [0.5, -1, -0.1],
        [0.5, -1, -0.1], [0, -0.5, 0],
        // Wing top left
        [0, 0.5, 0], [-2, 1.5, 0.5],
        [-2, 1.5, 0.5], [-2.5, 0, 0],
        [-2.5, 0, 0], [0, 0, 0],
        // Wing bot left
        [0, 0, 0], [-1.5, -1.5, -0.2],
        [-1.5, -1.5, -0.2], [-0.5, -1, -0.1],
        [-0.5, -1, -0.1], [0, -0.5, 0]
    ],
    // A peaceful human face profile
    'face': [
        [0, 2, 0], [-0.5, 1.5, 0], // Forehead
        [-0.5, 1.5, 0], [-0.3, 1.0, 0], // Brow
        [-0.3, 1.0, 0], [-1.0, 0.5, 0], // Nose bridge
        [-1.0, 0.5, 0], [-1.0, 0.0, 0], // Nose tip
        [-1.0, 0.0, 0], [-0.5, -0.2, 0], // Upper lip
        [-0.5, -0.2, 0], [-0.6, -0.4, 0], // Mouth
        [-0.6, -0.4, 0], [-0.4, -0.6, 0], // Lower lip
        [-0.4, -0.6, 0], [-0.5, -1.0, 0], // Chin
        [-0.5, -1.0, 0], [0, -1.5, 0], // Jaw line
        [0, -1.5, 0], [0.5, -1.0, 0.5], // Jaw to neck
        [0.5, -1.0, 0.5], [0.8, 0, 0.5], // Ear
        [0.8, 0, 0.5], [0, 2, 0] // Back of head
    ],
    // A peaceful tree
    'tree': [
        // Trunk
        [0, -2, 0], [0, 0, 0],
        [0, -1.5, 0], [0.5, -1, 0.2], // Branch R
        [0, -1.2, 0], [-0.4, -0.6, -0.1], // Branch L
        // Canopy Outline (rough circle/cloud)
        [0, 0, 0], [1.5, 0.5, 0],
        [1.5, 0.5, 0], [2, 1.5, 0],
        [2, 1.5, 0], [1, 2.5, 0],
        [1, 2.5, 0], [0, 3, 0],
        [0, 3, 0], [-1, 2.5, 0],
        [-1, 2.5, 0], [-2, 1.5, 0],
        [-2, 1.5, 0], [-1.5, 0.5, 0],
        [-1.5, 0.5, 0], [0, 0, 0],
        // Inner Branch details
        [0, 0, 0], [0.8, 1.2, 0],
        [0, 0, 0], [-0.7, 1.0, 0],
        [0.5, -1, 0.2], [1.0, -0.5, 0.2], // Twig Right
        [-0.4, -0.6, -0.1], [-0.8, -0.2, -0.1] // Twig Left
    ],
    // A bird in flight
    'bird': [
        // Body (beak to tail)
        [1.5, 0, 0], [1.0, -0.1, 0], // Beak
        [1.0, -0.1, 0], [0, -0.3, 0], // Head to chest
        [0, -0.3, 0], [-1.5, 0.2, 0], // Chest to tail
        [-1.5, 0.2, 0], [-2, 0.5, 0], // Tail tip up
        [-1.5, 0.2, 0], [-1.8, 0, 0], // Tail tip lower
        // Near Wing
        [0.2, -0.2, 0], [0.5, 1.5, -0.5], // Wing up and back
        [0.5, 1.5, -0.5], [-1.0, 0.8, -0.2], // Wing tip back to body
        [-1.0, 0.8, -0.2], [-0.2, -0.2, 0], // Connect back
        // Far Wing
        [0.4, -0.2, 0], [1.0, 1.2, 0.8], // Wing up and forward
        [1.0, 1.2, 0.8], [-0.5, 0.7, 0.5], // Wing tip back to body
        [-0.5, 0.7, 0.5], [0.0, -0.2, 0] // Connect back
    ]
};

// ============================================================
// LIVING COSMOS — The Ultimate Zen Imagination System
// Earth as the center of a living, breathing galaxy
// ============================================================
const livingCosmos = new THREE.Group();
scene.add(livingCosmos);

// ---- 1. TWO-ARM GALAXY SPIRAL (5000 particles) ----
const galaxyParticleCount = 5000;
const galaxyGeo = new THREE.BufferGeometry();
const galaxyPos = new Float32Array(galaxyParticleCount * 3);
const galaxyMeta = []; // { armAngle, baseRadius, spread, speed }
const galaxyArms = 2;
const galaxySpread = 0.5;
const armTwist = 3.5; // How much each arm spirals

for (let i = 0; i < galaxyParticleCount; i++) {
    const arm = i % galaxyArms;
    const frac = (i / galaxyParticleCount);
    const radius = 10 + frac * 24;               // 10..34 from Earth
    const spinAngle = frac * armTwist * Math.PI * 2;
    const armOffset = (arm / galaxyArms) * Math.PI * 2;
    const scatter = (Math.random() - 0.5) * galaxySpread * radius * 0.4;
    const angle = spinAngle + armOffset;
    const flatness = 0.15;                          // How flat the disk is

    galaxyPos[i * 3] = Math.cos(angle) * radius + scatter;
    galaxyPos[i * 3 + 1] = (Math.random() - 0.5) * radius * flatness;
    galaxyPos[i * 3 + 2] = Math.sin(angle) * radius + scatter;
    galaxyMeta.push({ armAngle: angle, baseRadius: radius, speed: 0.00008 + (1 - frac) * 0.00018 });
}
galaxyGeo.setAttribute('position', new THREE.BufferAttribute(galaxyPos, 3));
const galaxyMat = new THREE.PointsMaterial({
    size: 0.09,
    transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: 0x88bbff
});
const galaxyPoints = new THREE.Points(galaxyGeo, galaxyMat);
livingCosmos.add(galaxyPoints);

// ---- 2. SIX ORBITAL GYROSCOPE RINGS ----
const ringDefs = [
    { radius: 13, color: 0xffd060, tiltX: 0.0, tiltZ: 0.0, speed: 0.003 },  // equatorial gold
    { radius: 16, color: 0x00ccff, tiltX: 1.0, tiltZ: 0.3, speed: -0.002 },  // cyan tilt
    { radius: 19, color: 0xff70b0, tiltX: 0.5, tiltZ: 1.2, speed: 0.0015 },  // rose tilt
    { radius: 22, color: 0xa080ff, tiltX: 1.5, tiltZ: 0.8, speed: -0.001 },  // violet
    { radius: 25, color: 0x40ffaa, tiltX: 0.3, tiltZ: 1.6, speed: 0.0008 },  // teal polar
    { radius: 11, color: 0xffffff, tiltX: 0.8, tiltZ: 0.5, speed: -0.004 },  // white inner
];
let mapMarkersGroup;

const ringMeshes = [];
const ringSeg = 180;

ringDefs.forEach(def => {
    const pts = [];
    for (let k = 0; k <= ringSeg; k++) {
        const a = (k / ringSeg) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * def.radius, 0, Math.sin(a) * def.radius));
    }
    const rGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const rMat = new THREE.LineBasicMaterial({
        color: def.color, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending
    });
    const ring = new THREE.Line(rGeo, rMat);
    ring.rotation.x = def.tiltX;
    ring.rotation.z = def.tiltZ;
    ring.userData = { speed: def.speed };
    ringMeshes.push(ring);
    livingCosmos.add(ring);
});

// ---- 3. SHIMMER CORE (tiny orbs near Earth) ----
const coreCount = 400;
const coreGeo = new THREE.BufferGeometry();
const corePos = new Float32Array(coreCount * 3);
const corePhase = new Float32Array(coreCount);
for (let i = 0; i < coreCount; i++) {
    const r = 8 + Math.random() * 3;
    const phi = Math.acos(2 * Math.random() - 1);
    const th = Math.random() * Math.PI * 2;
    corePos[i * 3] = r * Math.sin(phi) * Math.cos(th);
    corePos[i * 3 + 1] = r * Math.cos(phi);
    corePos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(th);
    corePhase[i] = Math.random() * Math.PI * 2;
}
coreGeo.setAttribute('position', new THREE.BufferAttribute(corePos, 3));
const coreMat = new THREE.PointsMaterial({
    size: 0.18, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffeebb
});
const corePoints = new THREE.Points(coreGeo, coreMat);
livingCosmos.add(corePoints);

// The visual group for constellations, managed independently to bind to Earth rotation later
const constellationGroup = new THREE.Group();
scene.add(constellationGroup); // Add to scene immediately, we will sync it manually in tick()

// Create a pool of 4 active constellations that randomly appear
const activeConstellations = [];
for (let i = 0; i < 4; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const mat = new THREE.LineBasicMaterial({
        color: 0x00fff9,
        transparent: true,
        opacity: 0,
        linewidth: 2
    });
    // We start as LineSegments for tactical mode.
    // Dream mode will swap this out for continuous THREE.Line logic during drawing.
    const line = new THREE.LineSegments(geo, mat);
    constellationGroup.add(line);

    activeConstellations.push({
        line: line,
        isDream: false,
        opacity: 0,
        state: 'waiting',
        timer: Math.random() * 100,
        pickNew: function () {
            this.isDream = isDreamMode; // Snapshot mode at time of birth

            if (this.isDream) {
                // Pick a Dream Shape (Continuous curves)
                const keys = Object.keys(zenConstellationShapes);
                const key = keys[Math.floor(Math.random() * keys.length)];
                const rawPoints = zenConstellationShapes[key];

                // zenConstellationShapes are point pairs for LineSegments
                // We'll treat each pair as a short stroke
                const strokes = [];
                for (let i = 0; i < rawPoints.length; i += 2) {
                    if (rawPoints[i] && rawPoints[i + 1]) {
                        strokes.push([rawPoints[i], rawPoints[i + 1]]);
                    }
                }

                this.targetStrokes = strokes; // An array of strokes

                // Adjust materials 
                this.line.material.color.setHex(0xffffff);
                this.line.material.linewidth = 1;

                // Randomly position shapes
                let cx, cy, cz, rotX, rotY, rotZ, scale;

                // Coordinates that ensure visibility from camera at Z=8
                const radius = 20;
                const theta = (Math.random() - 0.5) * 0.8;
                const phi = (Math.PI / 2) + (Math.random() - 0.5) * 0.6;

                cx = radius * Math.sin(phi) * Math.sin(theta);
                cy = radius * Math.cos(phi);
                cz = (Math.random() - 0.5) * 10;

                scale = Math.random() * 0.5 + 1.2;

                rotX = (Math.random() - 0.5) * 0.3;
                rotY = (Math.random() - 0.5) * 0.3;
                rotZ = (Math.random() - 0.5) * 0.3;

                const dummy = new THREE.Object3D();
                dummy.position.set(cx, cy, cz);
                dummy.rotation.set(rotX, rotY, rotZ);
                dummy.scale.set(scale, scale, scale);
                dummy.updateMatrix();

                // Process strokes into a massive array of sampled points
                const sampledPoints = [];
                strokes.forEach(stroke => {
                    // Convert basic arrays to Vectors
                    const rawVecs = stroke.map(p => {
                        const v = new THREE.Vector3(p[0], p[1], p[2]);
                        v.applyMatrix4(dummy.matrix);
                        return v;
                    });

                    // Create a smooth 3D Spline from the points
                    const curve = new THREE.CatmullRomCurve3(rawVecs);
                    curve.tension = 0.5;

                    // Sample beautifully dense smooth points for professional look
                    const segments = 60;
                    const points = curve.getPoints(segments);

                    // Because we draw this using LineSegments (which expect pairs Start/End),
                    // we construct the segments from the smooth points.
                    for (let i = 0; i < points.length - 1; i++) {
                        sampledPoints.push(
                            points[i].x, points[i].y, points[i].z,          // Start
                            points[i + 1].x, points[i + 1].y, points[i + 1].z     // End
                        );
                    }
                });

                this.targetPositions = sampledPoints;
                const zeroPositions = new Array(sampledPoints.length).fill(0);

                // Init array to prevent flying from 0,0,0
                for (let i = 0; i < sampledPoints.length; i += 3) {
                    zeroPositions[i] = sampledPoints[0];
                    zeroPositions[i + 1] = sampledPoints[1];
                    zeroPositions[i + 2] = sampledPoints[2];
                }

                this.line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(zeroPositions, 3));
                this.currentPointIndex = 0;
                this.drawProgress = 0;

            } else {
                // Pick rigid tactical shape depending on ZEN mode
                const activeShapes = isZenMode ? zenConstellationShapes : constellationShapes;
                const keys = Object.keys(activeShapes);
                const key = keys[Math.floor(Math.random() * keys.length)];
                const shapeLines = activeShapes[key];

                if (isZenMode) {
                    this.line.material.color.setHex(0xffffff);
                    this.line.material.linewidth = 1;
                } else {
                    this.line.material.color.setHex(0x00fff9);
                    this.line.material.linewidth = 2;
                }

                // Rigid lines logic
                const radius = 25;
                const theta = Math.random() * Math.PI - (Math.PI / 2);
                const phi = Math.random() * (Math.PI / 2) + Math.PI / 4;

                const cx = radius * Math.sin(phi) * Math.cos(theta);
                const cy = radius * Math.cos(phi);
                const cz = radius * Math.sin(phi) * Math.sin(theta) + 10;

                const scale = Math.random() * 2 + 2.0;

                const rotX = Math.random() * 0.5 - 0.25;
                const rotY = Math.random() * 0.5 - 0.25;
                const rotZ = Math.random() * Math.PI * 0.2 - (Math.PI * 0.1);

                const dummy = new THREE.Object3D();
                dummy.position.set(cx, cy, cz);
                dummy.rotation.set(rotX, rotY, rotZ);
                dummy.scale.set(scale, scale, scale);
                dummy.updateMatrix();

                const newPositions = [];

                shapeLines.forEach(pt => {
                    const targetVec = new THREE.Vector3(pt[0], pt[1], pt[2]);
                    targetVec.applyMatrix4(dummy.matrix);

                    if (isZenMode) {
                        newPositions.push(targetVec.x, targetVec.y, targetVec.z);
                    } else {
                        let nearestDistSq = Infinity;
                        let nearestX = 0, nearestY = 0, nearestZ = 0;

                        for (let j = 0; j < posArray.length; j += 3) {
                            const sx = posArray[j], sy = posArray[j + 1], sz = posArray[j + 2];
                            const distSq = (targetVec.x - sx) ** 2 + (targetVec.y - sy) ** 2 + (targetVec.z - sz) ** 2;
                            if (distSq < nearestDistSq) {
                                nearestDistSq = distSq;
                                nearestX = sx; nearestY = sy; nearestZ = sz;
                            }
                        }
                        newPositions.push(nearestX, nearestY, nearestZ);
                    }
                });

                this.targetPositions = newPositions;
                const zeroPositions = new Array(newPositions.length).fill(0);

                for (let i = 0; i < newPositions.length; i += 3) {
                    zeroPositions[i] = newPositions[0];
                    zeroPositions[i + 1] = newPositions[1];
                    zeroPositions[i + 2] = newPositions[2];
                }

                this.line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(zeroPositions, 3));
                this.currentPointIndex = 0;
                this.drawProgress = 0;
            }
        }
    });
}

// --- ADD SHOOTING STARS ---
const shootingStars = [];
const shootingStarMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8
});
// 0.01 head, 0.05 tail, 3 length, creates a stretched streaking tail
const shootingStarGeometry = new THREE.CylinderGeometry(0.01, 0.05, 3, 4);
shootingStarGeometry.translate(0, 1.5, 0); // shift origin to tail
shootingStarGeometry.rotateX(Math.PI / 2); // point along Z axis

for (let i = 0; i < 3; i++) {
    const star = new THREE.Mesh(shootingStarGeometry, shootingStarMaterial);
    scene.add(star);

    const starObj = {
        mesh: star,
        speed: Math.random() * 0.8 + 0.5,
        timer: Math.random() * 200, // randomized staggered spawn
        reset: function () {
            // Spawn far back and random X/Y
            this.mesh.position.set(
                (Math.random() - 0.5) * 80,
                (Math.random() - 0.5) * 60,
                -50 - Math.random() * 30
            );

            // Aim roughly towards the camera/screen
            const targetX = (Math.random() - 0.5) * 60;
            const targetY = (Math.random() - 0.5) * 60;
            this.mesh.lookAt(targetX, targetY, 20);

            // Calculate velocity vector based on facing direction
            this.velocity = new THREE.Vector3(0, 0, this.speed).applyQuaternion(this.mesh.quaternion);
            this.timer = Math.random() * 300 + 100; // Reset cool down
        }
    };
    starObj.reset();
    shootingStars.push(starObj);
}

// --- ZEN MODE STARDUST AMBIENCE ---
const stardustCount = 300;
const stardustGeometry = new THREE.BufferGeometry();
const stardustPositions = new Float32Array(stardustCount * 3);
const stardustSpeeds = new Float32Array(stardustCount);

for (let i = 0; i < stardustCount; i++) {
    const r = 20 + Math.random() * 40;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;

    stardustPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    stardustPositions[i * 3 + 1] = r * Math.cos(phi);
    stardustPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    stardustSpeeds[i] = Math.random() * 0.002 + 0.001;
}

stardustGeometry.setAttribute('position', new THREE.BufferAttribute(stardustPositions, 3));
const stardustMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.1,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending
});
const stardust = new THREE.Points(stardustGeometry, stardustMaterial);
scene.add(stardust);

// --- MASSIVE ASTEROID / DEBRIS BELT ---
const debrisCount = 4000; // Tons of flying rocks
// Low poly rocks with multiple geometries randomly mixed
const debrisGeometry = new THREE.DodecahedronGeometry(0.12, 0);
const debrisMaterial = new THREE.MeshStandardMaterial({
    color: 0x555566,
    roughness: 0.9,
    metalness: 0.4
});
const instancedDebris = new THREE.InstancedMesh(debrisGeometry, debrisMaterial, debrisCount);
const dummyDebris = new THREE.Object3D();
const debrisPivot = new THREE.Object3D();

// To animate the individual rocks later
const debrisSpeeds = new Float32Array(debrisCount);

for (let i = 0; i < debrisCount; i++) {
    // Distribute them in a dense Saturn-like ring around the Earth
    const angle = Math.random() * Math.PI * 2;
    // Radius clustered tighter near 18, scattering out to 35
    const innerR = 17;
    const outerR = 35;
    // Bias towards inner rings (exponential distribution)
    const radius = innerR + Math.pow(Math.random(), 2) * (outerR - innerR);

    const x = Math.cos(angle) * radius;
    // Taper the thickness based on distance (thicker in middle)
    const thickness = Math.max(0.5, 4 - (radius - innerR) * 0.2);
    const y = (Math.random() - 0.5) * thickness;
    const z = Math.sin(angle) * radius;

    dummyDebris.position.set(x, y, z);

    // Crazy random rotations
    dummyDebris.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

    const randomScale = Math.random() * 0.8 + 0.1; // Vast differences in rock size
    dummyDebris.scale.set(randomScale, randomScale, randomScale);

    dummyDebris.updateMatrix();
    instancedDebris.setMatrixAt(i, dummyDebris.matrix);

    // Assign varying orbit speeds so they don't move as one rigid disk block
    debrisSpeeds[i] = (Math.random() * 0.005 + 0.001) * (30 / radius);
}
// Add slight, distinct tilt to the debris ring compared to everything else
debrisPivot.rotation.x = Math.PI * 0.15;
debrisPivot.rotation.z = -Math.PI * 0.05;
debrisPivot.add(instancedDebris);
scene.add(debrisPivot);

// --- HOLOGRAM TECH RINGS ---
// Massive glowing wireframe rings hugging the earth
const holoGroup = new THREE.Group();
const createHoloRing = (radius, thickness, segments, color, offsetAngle) => {
    const geo = new THREE.TorusGeometry(radius, thickness, 2, segments);
    const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.15, // Highly transparent
        wireframe: true, // Key: renders as cool structural lines
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2 + offsetAngle;
    return mesh;
};

// Create a highly complex targeting UI cage
const uiRing1 = createHoloRing(15.5, 0.05, 128, 0x00fff9, 0); // Inner tight scanning bracket
const uiRing2 = createHoloRing(16.5, 0.2, 64, 0xff00c1, Math.PI * 0.05); // Offset magenta track
const uiRing3 = createHoloRing(18.0, 0.01, 200, 0x00fff9, -Math.PI * 0.02); // Outer fine dashed line

holoGroup.add(uiRing1, uiRing2, uiRing3);
// Position group aggressively
holoGroup.rotation.x = 0.2;
holoGroup.rotation.z = -0.1;
scene.add(holoGroup);

// --- POST PROCESSING SETUP VARIABLES ---
let composer, renderPass, bloomPass;


/**
 * Test Cube
 */
const geometry = new THREE.BoxGeometry(2, 2, 2);
const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
// Commented out testCube as it is no longer needed
// const testCube = new THREE.Mesh(geometry, material);
// scene.add(testCube);

/**
 * Lights
 */
const ambientLight = new THREE.AmbientLight(0xffffff, 0.2); // Toned down from 0.5 for realistic depth
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Toned down from 2.0 to avoid washing out textures
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

const backLight = new THREE.DirectionalLight(0x4f46e5, 0.6); // Toned down from 1.5 for a subtle premium purple rim light
backLight.position.set(-5, 0, -5);
scene.add(backLight);

/**
 * Sizes & Camera Defaults (Camera will be overwritten if GLB has one)
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
};

// We will replace this camera when the GLB loads
let camera = new THREE.PerspectiveCamera(45, sizes.width / sizes.height, 0.1, 100);
camera.position.set(0, 0, 8);
camera.zoom = 0.45;
camera.updateProjectionMatrix();
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: false // Better to disable MSAA when using EffectComposer passes in WebGL 1
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Initialize complex Post-Processing Pipeline
const initPostProcessing = () => {
    // 1. Scene Render Pass
    renderPass = new RenderPass(scene, camera);

    // 2. Cinematic Unreal Bloom Pass
    // Parameters: Resolution, Strength, Radius, Threshold
    // Threshold high enough that only bright cyan/magenta effects bloom
    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(sizes.width, sizes.height),
        0.4,  // Reduced strength from 0.8
        0.8,  // Soft radius
        0.3   // Higher threshold to keep it cleaner
    );

    // 3. Output Pass
    const outputPass = new OutputPass();

    // Stack them
    composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);
};

initPostProcessing();

window.addEventListener('resize', () => {
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;

    if (camera && camera.isPerspectiveCamera) {
        camera.aspect = sizes.width / sizes.height;
        camera.updateProjectionMatrix();
    }

    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if (composer) {
        composer.setSize(sizes.width, sizes.height);
    }
});

/**
 * Load Model
 */
let mixer = null;
let model = null;
let animationDuration = 0;
let originalFov = 45; // Store GLB camera's original FOV to avoid distortion

// --- LOADING SYSTEM ---
const loadingScreen = document.getElementById('site-loading-screen');
const loadingStatusText = document.getElementById('site-loading-status');
const loadingPercentageText = document.getElementById('site-loading-percentage');
const loadingBar = document.getElementById('site-loading-bar');

const LOADER_MIN_TIME = 4500;
const loaderStartTime = Date.now();
let actualLoadComplete = false;
let displayedPercent = 0;
let targetPercentComplete = 0; // Filled by onProgress

const updateLoadingVisuals = () => {
    if (!loadingScreen) return; // Skip if no screen

    const elapsed = Date.now() - loaderStartTime;
    // Approach 99% purely based on min time
    let targetP = Math.min(99, (elapsed / LOADER_MIN_TIME) * 100);

    // Only hit 100% if actual 3D model finished downloading/parsing AND we passed the min time
    if (actualLoadComplete && elapsed > LOADER_MIN_TIME) {
        targetP = 100;
    }

    // Ensure we don't go backwards, and take actual download progress into account if it's faster
    displayedPercent = Math.max(displayedPercent, targetP, targetPercentComplete > 0 && targetPercentComplete < 100 ? targetPercentComplete : 0);

    if (loadingPercentageText) loadingPercentageText.innerText = Math.floor(displayedPercent) + '%';
    if (loadingBar) loadingBar.style.width = displayedPercent + '%';

    if (displayedPercent < 100) {
        requestAnimationFrame(updateLoadingVisuals);
    } else {
        // Complete the sequence
        if (loadingStatusText) loadingStatusText.innerHTML = "UPLINK ESTABLISHED // SYSTEMS SYNCHRONIZED";
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            loadingScreen.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                loadingScreen.remove();
                isModelLoaded = true;

                // Trigger the intro warp/flare sequence now!
                isWarping = true;
                setTimeout(() => { isWarping = false; }, 3500);

                if (window.gltfActions) {
                    window.gltfActions.forEach(a => a.play());
                }
            }, 1000);
        }, 500); // Small delay to let 100% render briefly
    }
};

if (loadingScreen) {
    requestAnimationFrame(updateLoadingVisuals);
} else {
    isModelLoaded = true;
}
// --- /LOADING SYSTEM ---

const gltfLoader = new GLTFLoader();

gltfLoader.load(
    'EARTH.glb',
    (gltf) => {
        model = gltf.scene;

        // Tone down the extremely high emissive settings of the model materials (emissiveStrength = 10)
        // to make the texture fully visible while maintaining a beautiful sci-fi glow.
        model.traverse((child) => {
            if (child.isMesh && child.material) {
                if (child.material.emissive) {
                    console.log("Original material emissive:", child.material.emissive, "intensity:", child.material.emissiveIntensity);
                    // Tone down intensity so the texture remains beautifully crisp and clear
                    child.material.emissiveIntensity = 4.5;
                }
                if (child.material.roughness !== undefined) {
                    child.material.roughness = 0.8;
                }
                if (child.material.metalness !== undefined) {
                    child.material.metalness = 0.05;
                }
            }
        });

        // Rotate Earth by 110 degrees as requested by the user (converted to radians)
        model.rotation.y += 110 * (Math.PI / 180);

        // Find if there's a camera in the glTF data
        let gltfCamera = null;
        if (gltf.cameras && gltf.cameras.length > 0) {
            gltfCamera = gltf.cameras[0];
            // Ensure the camera is added to the scene graph if it has no parent
            if (!gltfCamera.parent) {
                gltf.scene.add(gltfCamera);
            }
            console.log("Found camera in gltf.cameras:", gltfCamera);
        } else {
            gltf.scene.traverse((node) => {
                if (node.isCamera) {
                    gltfCamera = node;
                    console.log("Found camera in GLB traversal:", gltfCamera);
                }
            });
        }

        // If we found a camera, let's use it!
        if (gltfCamera) {
            camera = gltfCamera;
            // Update aspect ratio for screen size
            if (camera.isPerspectiveCamera) {
                originalFov = camera.fov; // Store the original FOV of the glTF camera
                camera.aspect = sizes.width / sizes.height;
                camera.zoom = 0.65;
                camera.updateProjectionMatrix();
            }
            // Bind the complex EffectComposer to follow the new animated camera
            if (renderPass) {
                renderPass.camera = camera;
            }
        } else {
            // Fallback scaling if no custom camera found
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
                const scale = 15 / maxDim; // 15 brings it MUCH closer
                model.scale.set(scale, scale, scale);
            }
        }

        // Attach surface scan points to the model so they rotate with it
        model.add(scanPoints);

        // --- ADD ATMOSPHERE GLOW ---
        // Calculate the actual size of the earth to wrap the atmosphere precisely around it
        const finalBox = new THREE.Box3().setFromObject(model);
        const finalSize = finalBox.getSize(new THREE.Vector3());
        // Use the absolute global size to make a sphere that perfectly matches
        const baseRadius = Math.max(finalSize.x, finalSize.y, finalSize.z) / 2;

        // Slightly larger than the Earth to render the atmospheric edge
        const atmosphereGeometry = new THREE.SphereGeometry(baseRadius * 0.8, 64, 64);
        window.auraMaterial = new THREE.ShaderMaterial({
            uniforms: {
                sunDirection: { value: new THREE.Vector3(-1.0, 0.5, 0.2).normalize() }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vPositionNormal;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 sunDirection;
                varying vec3 vNormal;
                varying vec3 vPositionNormal;

                void main() {
                    // Calculate Fresnel effect based on view direction
                    // Dot product approaches 0 at the grazing edges, and 1 or -1 straight on
                    float fresnel = dot(vNormal, vPositionNormal);
                    fresnel = clamp(1.0 - abs(fresnel), 0.0, 1.0);
                    
                    // Sharpen the Fresnel curve to keep the atmosphere very thin and crisp
                    float edgeGlow = pow(fresnel, 4.0);
                    
                    // Light Direction Test
                    // Calculate how much the normal faces our imaginary sun (coming from the left)
                    float sunLight = dot(vNormal, sunDirection);
                    
                    // Smoothly fade out the glow on the dark side of the terminator line
                    // Negative numbers mean it's facing away from the sun
                    sunLight = smoothstep(-0.2, 0.6, sunLight);
                    
                    // The color of the scattered light
                    vec3 atmosphereColor = vec3(0.1, 0.55, 1.0);
                    
                    // Only apply the glow exactly on the edge that is lit by the sun
                    vec3 finalColor = atmosphereColor * edgeGlow * sunLight * 2.5;
                    
                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false
        });


        window.auraMesh = new THREE.Mesh(atmosphereGeometry, window.auraMaterial);

        // Add independently to the scene so it doesn't get double-scaled
        scene.add(window.auraMesh);

        scene.add(model);

        // Play ALL Animations from the file (Camera, Actions, etc)
        // Store actions so we can play them ONLY after the loading UI finishes
        window.gltfActions = [];
        if (gltf.animations && gltf.animations.length > 0) {
            // Provide the entire gltf.scene to the mixer so it can find all child objects, including the camera
            mixer = new THREE.AnimationMixer(gltf.scene);
            console.log(`Found ${gltf.animations.length} animations in GLB.`);

            // Loop through all tracks and play them so both Earth and Camera animate
            gltf.animations.forEach((clip) => {
                console.log("Animation Clip:", clip.name, "Tracks:", clip.tracks.map(t => t.name));
                const action = mixer.clipAction(clip);
                window.gltfActions.push(action);

                // Track longest duration
                if (clip.duration > animationDuration) {
                    animationDuration = clip.duration;
                }
            });
        }

        // Tell the visual loader that the 3D model is actually ready
        actualLoadComplete = true;

    },
    // onProgress callback
    (xhr) => {
        if (xhr.lengthComputable) {
            // Actual download percentage
            targetPercentComplete = Math.round((xhr.loaded / xhr.total) * 100);
        }
    },
    (error) => {
        console.error('Error loading glTF:', error);
        alert('Failed to load EARTH.glb! If you opened this file by double-clicking it (file:///), your browser blocked it due to CORS policy. Please run a local server (like VS Code Live Server).');
    }
);

// Load the MOON
let moonModel = null;
const moonPivot = new THREE.Object3D();
scene.add(moonPivot);

gltfLoader.load(
    'MOON.glb',
    (gltf) => {
        moonModel = gltf.scene;

        // The Moon orbits at a distance
        moonModel.position.set(30, 0, 0);

        // Scale the moon relative to its own original size
        const box = new THREE.Box3().setFromObject(moonModel);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            // Earth was scaled to 15. Moon is ~1/4th the diameter of Earth, so 4 is appropriate.
            const scale = 4 / maxDim;
            moonModel.scale.set(scale, scale, scale);
        }

        // Add to pivot so we can rotate the pivot to orbit the Earth
        moonPivot.add(moonModel);
    },
    undefined,
    (error) => {
        console.error('Error loading MOON.glb:', error);
    }
);

/**
 * Custom Sci-Fi Cursor
 */
const cursor = document.querySelector('.custom-cursor');
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let currentCursorX = window.innerWidth / 2;
let currentCursorY = window.innerHeight / 2;

let lastTrailTime = 0;
window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    // Add hover effect if over clickable elements
    const hoverable = e.target.closest('a, button, [role="button"]');
    if (hoverable) {
        cursor.classList.add('hovering');
    } else {
        cursor.classList.remove('hovering');
    }

    // Spawn light trail dots (throttled)
    const now = Date.now();
    if (now - lastTrailTime > 40) {
        lastTrailTime = now;
        const trail = document.createElement('div');
        trail.className = 'cursor-trail';
        trail.style.left = e.clientX + 'px';
        trail.style.top = e.clientY + 'px';
        document.body.appendChild(trail);
        // Remove after animation completes
        setTimeout(() => trail.remove(), 350);
    }
});

// Smoothly animate cursor to position in the tick function later

/**
 * Scroll Tracking
 */
let scrollY = window.scrollY;
let scrollFraction = 0;
const blackTransition = document.querySelector('.black-transition');
const animationTrack = document.querySelector('.animation-scroll-track');
const introOverlay = document.querySelector('.intro-overlay');

window.addEventListener('scroll', () => {
    scrollY = window.scrollY;

    // In Zen mode, keep things calm: no black flash / transition
    if (isZenMode) {
        if (blackTransition) blackTransition.style.opacity = '0';
        return;
    }

    // We only want to animate the 3D model while we are scrolling through the animation track.
    // The animation track acts as our 'timeline' duration.
    const trackHeight = animationTrack.offsetHeight - window.innerHeight;
    const fadeStart = trackHeight + window.innerHeight * 0.4;
    const fadeEnd = trackHeight + window.innerHeight * 1.2;

    if (fadeEnd > 0) {
        // Map scrolling to end exactly with the fade
        scrollFraction = Math.max(0, Math.min(1, scrollY / fadeEnd));
    }

    // Hide intro title if we scrolled down even a little bit
    if (scrollY > 50) {
        introOverlay.classList.add('fade-out');
    } else {
        introOverlay.classList.remove('fade-out');
    }

});

/**
 * Intersection Observer for Elements
 */
const contentBlocks = document.querySelectorAll('.content, .apod-new-header, .apod-unified-board');
// Hide them initially
contentBlocks.forEach(block => block.classList.add('hidden'));

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.remove('hidden');
        }
    });
}, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

contentBlocks.forEach(block => observer.observe(block));

/**
 * Animate
 */
const clock = new THREE.Clock();
let currentScrollFraction = 0;

let isModelLoaded = false;
const tick = () => {
    window.requestAnimationFrame(tick);

    // Do not run animations until the model is fully loaded and screen is gone
    if (!isModelLoaded) return;

    // Get absolute time just for particles
    const elapsedTime = clock.getElapsedTime();

    // Lerp the scroll fraction for smooth animation
    currentScrollFraction += (scrollFraction - currentScrollFraction) * 0.08;

    // Sync the black transition fade overlay perfectly with the GLB's currentScrollFraction!
    if (blackTransition && !isZenMode) {
        const fadeStartFraction = 0.55;
        const fadeEndFraction = 0.80; // Fade ends completely at 80% scroll fraction

        if (currentScrollFraction > fadeStartFraction) {
            const opacity = (currentScrollFraction - fadeStartFraction) / (fadeEndFraction - fadeStartFraction);
            blackTransition.style.opacity = Math.min(1, Math.max(0, opacity)).toString();
        } else {
            blackTransition.style.opacity = '0';
        }
    }

    // Floating HUD Docks Display Logic (Top & Bottom)
    const topDock = document.getElementById('top-nav-dock');
    const bottomDock = document.querySelector('.connection-dock');
    const showThreshold = 0.70; // Slide in slightly before the fade-out ends completely at 0.80
    const shouldShowDocks = currentScrollFraction >= showThreshold && !isZenMode;

    if (topDock) {
        if (shouldShowDocks) {
            topDock.classList.add('show-dock');
        } else {
            topDock.classList.remove('show-dock');
        }
    }

    if (bottomDock) {
        if (shouldShowDocks) {
            bottomDock.classList.add('show-dock');
        } else {
            bottomDock.classList.remove('show-dock');
        }
    }
    // Update particles slowly
    particlesMesh.rotation.y = elapsedTime * 0.03;

    // Sync constellations to the Earth's rotation frame if the earth explicitly exists
    if (model) {
        // Find exactly what rotation the 3D model currently has based on the mixer's logic.
        // It plays an action inside so we copy the y drift
        constellationGroup.rotation.y = model.rotation.y + (elapsedTime * 0.015);
        // We add a tiny offset so they still slowly drift along with the earth together
    }


    // ============================================================
    // LIVING COSMOS ANIMATION
    // ============================================================
    const cosmosActive = isZenMode && isDreamMode;
    const tgt = cosmosActive ? 1 : 0;

    // Fade galaxy particles
    galaxyMat.opacity += ((cosmosActive ? 0.55 : 0) - galaxyMat.opacity) * 0.02;
    coreMat.opacity += ((cosmosActive ? 0.7 : 0) - coreMat.opacity) * 0.02;

    if (cosmosActive || galaxyMat.opacity > 0.001) {
        // Rotate entire galaxy disk like a real galaxy
        livingCosmos.rotation.y += 0.0004;

        // Spin the galaxy particles: inner ones faster (Keplerian rotation)
        const galPos = galaxyGeo.attributes.position.array;
        for (let i = 0; i < galaxyParticleCount; i++) {
            const meta = galaxyMeta[i];
            meta.armAngle += meta.speed;
            const scatter = (Math.random() - 0.5) * galaxySpread * meta.baseRadius * 0.005;
            galPos[i * 3] = Math.cos(meta.armAngle) * meta.baseRadius + scatter;
            galPos[i * 3 + 2] = Math.sin(meta.armAngle) * meta.baseRadius + scatter;
        }
        galaxyGeo.attributes.position.needsUpdate = true;

        // Shift galaxy color: blue → violet → gold cycle
        const gHue = 0.55 + Math.sin(elapsedTime * 0.05) * 0.15;
        galaxyMat.color.setHSL(gHue, 1, 0.75);

        // Animate gyroscope rings — each at its own speed
        ringMeshes.forEach((ring, i) => {
            ring.rotation.y += ring.userData.speed;
            const ringTarget = cosmosActive ? 0.35 : 0;
            ring.material.opacity += (ringTarget - ring.material.opacity) * 0.03;

            // Pulse each ring's opacity individually
            const waveOpacity = ringTarget * (0.5 + 0.5 * Math.sin(elapsedTime * 0.5 + i * 1.2));
            ring.material.opacity += (waveOpacity - ring.material.opacity) * 0.05;
        });

        // Shimmer core pulsing flicker
        const shimmerBase = cosmosActive ? 0.5 : 0;
        coreMat.opacity += ((shimmerBase + Math.sin(elapsedTime * 2.3) * 0.2) - coreMat.opacity) * 0.05;
        const cHue = 0.1 + Math.sin(elapsedTime * 0.08) * 0.05;
        coreMat.color.setHSL(cHue, 0.9, 0.85);
    } else {
        // When fully invisible, ensure rings are also invisible
        ringMeshes.forEach(ring => { ring.material.opacity = 0; });
    }

    // Update dynamically forming constellations
    activeConstellations.forEach(c => {
        // SILENCE LINES IN DREAM MODE
        if (isZenMode && isDreamMode) {
            c.line.material.opacity = 0;
            return;
        }
        if (c.state === 'waiting') {
            c.timer--;
            if (c.timer <= 0) {
                c.pickNew();
                c.state = 'drawing';
                // Zen mode is much softer, normal mode is bright cyan
                c.opacity = isZenMode ? 0.5 : 0.8;
                c.line.material.opacity = c.opacity;
            }
        } else if (c.state === 'drawing') {
            // Animate forming the lines point by point
            if (c.targetPositions && c.currentPointIndex < c.targetPositions.length) {
                // Draw perfectly smooth shapes slightly faster so it looks soothing and majestic
                c.drawProgress += c.isDream ? 0.015 : 0.005;

                const positions = c.line.geometry.attributes.position.array;

                // We draw in pairs (LineSegments)
                if (c.currentPointIndex % 6 === 0) {
                    // Start of a new segment pair
                    const startX = c.targetPositions[c.currentPointIndex];
                    const startY = c.targetPositions[c.currentPointIndex + 1];
                    const startZ = c.targetPositions[c.currentPointIndex + 2];

                    const endX = c.targetPositions[c.currentPointIndex + 3];
                    const endY = c.targetPositions[c.currentPointIndex + 4];
                    const endZ = c.targetPositions[c.currentPointIndex + 5];

                    // Set the start point immediately
                    positions[c.currentPointIndex] = startX;
                    positions[c.currentPointIndex + 1] = startY;
                    positions[c.currentPointIndex + 2] = startZ;

                    // Interpolate the end point based on progress
                    positions[c.currentPointIndex + 3] = startX + (endX - startX) * Math.min(1, c.drawProgress);
                    positions[c.currentPointIndex + 4] = startY + (endY - startY) * Math.min(1, c.drawProgress);
                    positions[c.currentPointIndex + 5] = startZ + (endZ - startZ) * Math.min(1, c.drawProgress);
                }

                c.line.geometry.attributes.position.needsUpdate = true;

                if (c.drawProgress >= 1) {
                    // Two vertices (start and end), 3 floats each
                    // Draw faster in Zen Mode for a more "confident" stroke
                    c.currentPointIndex += c.isDream ? 12 : 6;
                    c.drawProgress = 0;

                    // If we finished drawing the whole shape
                    if (c.currentPointIndex >= c.targetPositions.length) {
                        c.state = 'holding';
                        c.timer = 80 + Math.random() * 60; // hold for a short bit
                    }
                }
            }
        } else if (c.state === 'holding') {
            c.timer--;
            if (c.timer <= 0) {
                c.state = 'fading_out';
            }
        } else if (c.state === 'fading_out') {
            c.opacity -= 0.02; // Fade the whole completed shape out
            c.line.material.opacity = c.opacity;
            if (c.opacity <= 0) {
                c.opacity = 0;
                c.state = 'waiting';
                c.timer = Math.random() * 60 + 30; // wait before forming next

                // Reset geometry so it disappears fully
                const positions = c.line.geometry.attributes.position.array;
                for (let i = 0; i < positions.length; i++) positions[i] = 0;
                c.line.geometry.attributes.position.needsUpdate = true;
            }
        }
    });

    // Update shooting stars
    shootingStars.forEach(s => {
        if (s.timer > 0) {
            s.timer--;
            // keep it hidden while waiting
            s.mesh.visible = false;
        } else {
            s.mesh.visible = true;
            s.mesh.position.add(s.velocity);

            // Reset if it flies way past camera or goes out of bounds
            if (s.mesh.position.z > 20 || s.mesh.position.length() > 100) {
                s.reset();
            }
        }
    });

    // Animate the Warp Speed Lines and Solar Flare
    if (isWarping) {
        warpMaterial.opacity = Math.min(1, warpMaterial.opacity + 0.05);
        solarFlare.material.opacity = Math.min(0.8, solarFlare.material.opacity + 0.02);
        solarFlare.scale.addScalar(0.1); // Flare grows

        // Cinematic FOV shift (starts wide, zooms in to the original GLB FOV)
        if (camera && camera.isPerspectiveCamera) {
            camera.fov = 75 + (originalFov - 75) * (Math.min(1, elapsedTime / 3.5));
            camera.updateProjectionMatrix();
        }

        const positions = warpLines.geometry.attributes.position.array;

        for (let i = 0; i < warpCount; i++) {
            const speed = 25 + (Math.random() * 10); // Varied speeds
            positions[i * 6 + 2] += speed;
            positions[i * 6 + 5] += speed;

            if (positions[i * 6 + 2] > 50) {
                positions[i * 6 + 2] = -300 - Math.random() * 200;
                positions[i * 6 + 5] = positions[i * 6 + 2] - (30 + Math.random() * 60); // Varied lengths
            }
        }
        warpLines.geometry.attributes.position.needsUpdate = true;
    } else {
        // Disengaged: fade them out and slow them down smoothly
        warpMaterial.opacity = Math.max(0, warpMaterial.opacity - 0.02);
        solarFlare.material.opacity = Math.max(0, solarFlare.material.opacity - 0.05);

        // Ensure FOV settles at the original GLB FOV
        if (camera && camera.isPerspectiveCamera && camera.fov !== originalFov) {
            camera.fov = originalFov;
            camera.updateProjectionMatrix();
        }

        if (warpMaterial.opacity > 0) {
            const positions = warpLines.geometry.attributes.position.array;
            for (let i = 0; i < warpCount; i++) {
                const residualSpeed = 5 * warpMaterial.opacity;
                positions[i * 6 + 2] += residualSpeed;
                positions[i * 6 + 5] += residualSpeed;
            }
            warpLines.geometry.attributes.position.needsUpdate = true;
        }
    }

    // Animate custom cursor with lerp for smoothness
    currentCursorX += (mouseX - currentCursorX) * 0.45;
    currentCursorY += (mouseY - currentCursorY) * 0.45;
    cursor.style.left = currentCursorX + 'px';
    cursor.style.top = currentCursorY + 'px';

    // Apply UI Tech Rings Rotations (Contra-rotating locks)
    uiRing1.rotation.z -= 0.005; // Inner spins CCW
    uiRing2.rotation.z += 0.002; // Nav track spins CW
    uiRing3.rotation.z -= 0.008; // Delicate boundary spins fast CCW

    // Rotate massive debris belt
    if (debrisPivot) {
        debrisPivot.rotation.y += 0.0005; // The entire system drifts very slowly

        // Bonus: Individually update the InstancedMesh for a chaotic swirling effect
        dummyDebris.position.set(0, 0, 0);
        for (let i = 0; i < debrisCount; i++) {
            instancedDebris.getMatrixAt(i, dummyDebris.matrix);
            // We use matrix decomposition so we can rotate them in place
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            dummyDebris.matrix.decompose(position, quaternion, scale);

            // Reapply dummy properties
            dummyDebris.position.copy(position);
            dummyDebris.quaternion.copy(quaternion);
            dummyDebris.scale.copy(scale);

            // Spin each rock individually like crazy
            dummyDebris.rotation.x += debrisSpeeds[i] * 5;
            dummyDebris.rotation.y += debrisSpeeds[i] * 5;

            // Precalculate next circular orbital position step based on its unique speed
            // Very math heavy: rotate the position vector around Y axis slightly
            const angleStep = debrisSpeeds[i];
            const cos = Math.cos(angleStep);
            const sin = Math.sin(angleStep);
            const newX = dummyDebris.position.x * cos - dummyDebris.position.z * sin;
            const newZ = dummyDebris.position.x * sin + dummyDebris.position.z * cos;

            dummyDebris.position.set(newX, dummyDebris.position.y, newZ);
            dummyDebris.updateMatrix();
            instancedDebris.setMatrixAt(i, dummyDebris.matrix);
        }
        instancedDebris.instanceMatrix.needsUpdate = true;
    }

    // Update aura animation
    if (window.auraMaterial) {
        // The new shader doesn't use a 'time' uniform, so this line can be removed or commented out
        // window.auraMaterial.uniforms.time.value = elapsedTime; 
    }

    // Update moon orbit
    if (moonPivot) {
        moonPivot.rotation.y += 0.002; // slow orbit speed
    }

    // Update moon orbit
    if (moonPivot) {
        // Tilt the moon's orbital plane slightly for a better 3D look
        moonPivot.rotation.z = Math.PI * 0.1;
        // Slowly orbit around the Y axis
        moonPivot.rotation.y += 0.002;

        // Make the moon itself slowly rotate on its own axis
        if (moonModel) {
            moonModel.rotation.y += 0.005;
        }
    }

    // Update map markers
    if (typeof mapMarkersGroup !== 'undefined') {
        const earthRotY = model ? model.rotation.y : 0;
        // The markers are added to the model so they inherit its rotation rotation automatically!
        // We only animate the pulse size.
        mapMarkersGroup.children.forEach((marker, i) => {
            if (marker.userData && marker.userData.isMarker) {
                const pulse = marker.userData.baseScale + Math.sin(elapsedTime * 3 + i) * 0.2;
                marker.scale.set(pulse, pulse, pulse);
            }
        });
    }

    // Update Aura Mesh Position to always exactly track the Earth
    if (window.auraMesh && model) {
        // Sync position manually
        window.auraMesh.position.copy(model.position);

        // If Earth is rotating via animation mixer, we don't strictly *need* to rotate the aura, 
        // because the noise shader animates independently over time!
    }

    // Update animation mixer based on scroll position
    if (mixer && animationDuration > 0) {
        // Map scroll fraction to animation duration, ending the GLB animation earlier at 80% of the scroll timeline
        const targetTime = Math.min(1, currentScrollFraction / 0.80) * animationDuration;

        // When setting time manually on a paused mixer, we call setTime directly on the mixer
        mixer.setTime(targetTime);
    }

    // CRITICAL: Explicitly update the nested camera's world matrix and projection matrix in every frame.
    // Since the camera is a nested child inside gltf.scene, Three.js needs this explicit update
    // to calculate the correct view and projection matrices during post-processing rendering.
    if (camera) {
        camera.updateMatrixWorld(true);
        if (camera.isPerspectiveCamera) {
            camera.updateProjectionMatrix();
        }
    }

    // Update nebula and satellite
    nebulaGroup.rotation.y += 0.0002;
    satOrbit.angle += satOrbit.speed;
    satellite.position.set(Math.cos(satOrbit.angle) * satOrbit.rX, Math.sin(satOrbit.angle) * 5, Math.sin(satOrbit.angle) * satOrbit.rZ);
    satellite.lookAt(0, 0, 0);

    // Animate scan points (flicker)
    scanPoints.children.forEach(p => {
        p.material.opacity = 0.3 + Math.abs(Math.sin(elapsedTime * 2 + Math.random())) * 0.7;
    });

    // Animate scanner line
    scannerLine.position.y = Math.sin(elapsedTime * 0.5) * 15;
    scannerLine.material.opacity = 0.2 + Math.abs(Math.sin(elapsedTime * 0.5)) * 0.4;

    // Update HUD readouts
    const timeEl = document.querySelector('.time-readout');
    if (timeEl) {
        const now = new Date();
        timeEl.textContent = now.toTimeString().split(' ')[0];
    }
    const coordEl = document.querySelector('.coords-display');
    if (coordEl) {
        const lat = (Math.sin(elapsedTime * 0.1) * 90).toFixed(4);
        const lon = (Math.cos(elapsedTime * 0.1) * 180).toFixed(4);
        coordEl.textContent = `${lat}° N, ${lon}° E`;
    }

    // Extremely smooth Mouse Parallax shifting the entire universe
    // This gives incredible 3D stereo depth when hovering over the window
    // Hard-locked to zero in Zen mode — only the Earth model rotates there, not the camera
    if (!isZenMode) {
        const targetRotX = (mouseY / window.innerHeight - 0.5) * 0.15; // Vertical tilt
        const targetRotY = (mouseX / window.innerWidth - 0.5) * 0.25;  // Horizontal pan

        // Lerp the master scene rotation towards cursor targets (Dampened feeling)
        scene.rotation.x += (targetRotX - scene.rotation.x) * 0.05;
        scene.rotation.y += (targetRotY - scene.rotation.y) * 0.05;
    }
    // (In Zen mode scene.rotation is locked to 0 — set immediately in toggleZenMode)

    // Animate Stardust Ambience
    if (stardust) {
        stardust.rotation.y += 0.0003;
        stardust.rotation.x += 0.0001;
        const targetOpacity = isZenMode ? 0.3 : 0;
        stardust.material.opacity += (targetOpacity - stardust.material.opacity) * 0.01;
    }

    // Aura Pulse (Heartbeat of Earth)
    if (window.auraMesh && isZenMode) {
        const pulse = 1.0 + Math.sin(elapsedTime * 0.8) * 0.015;
        window.auraMesh.scale.set(pulse, pulse, pulse);
    } else if (window.auraMesh) {
        window.auraMesh.scale.set(1, 1, 1);
    }

    // Zen mode: gently rotate Earth on its Z axis (like a slow tilt-spin)
    if (model && isZenMode) {
        model.rotation.z += 0.0015; // ~0.086 deg/frame → full rotation in ~70 seconds
    } else if (model && !isZenMode && Math.abs(model.rotation.z) > 0.001) {
        // Smoothly ease the Z rotation back to 0 when exiting zen mode
        model.rotation.z *= 0.97;
        if (Math.abs(model.rotation.z) < 0.001) model.rotation.z = 0;
    }


    // Render using the intense Post Processing Composer instead of flat renderer
    if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }

};

tick();

// --- ZEN MODE LOGIC ---
const zenModeBtn = document.getElementById('zen-mode-btn');
const dreamModeBtn = document.getElementById('dream-mode-btn');
const zenQuote = document.getElementById('zen-quote');
const zenExitHint = document.getElementById('zen-exit-hint');
const zenEnterBtn = document.getElementById('zen-enter-btn');

const cycleZenQuotes = () => {
    if (!isZenMode || !isDreamMode) return;
    zenQuote.classList.remove('show-quote');
    setTimeout(() => {
        quoteIndex = (quoteIndex + 1) % zenQuotes.length;
        const textEl = document.querySelector('.quote-text');
        const authorEl = document.querySelector('.zen-author');
        const q = zenQuotes[quoteIndex];
        if (textEl) textEl.textContent = `"${q.text}"`;
        if (authorEl) authorEl.textContent = `- ${q.author}`;
        if (isZenMode) zenQuote.classList.add('show-quote');
    }, 2000);
};

if (dreamModeBtn) {
    dreamModeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        isDreamMode = !isDreamMode;
        if (isDreamMode) {
            dreamModeBtn.classList.add('active');
            dreamModeBtn.textContent = "[ IMAGINATIONS ENABLED ]";
            // Start cycling quotes
            clearInterval(quoteInterval);
            quoteInterval = setInterval(cycleZenQuotes, 15000);
        } else {
            dreamModeBtn.classList.remove('active');
            dreamModeBtn.textContent = "[ ENABLE IMAGINATIONS ]";
            clearInterval(quoteInterval);
            // Reset to Pale Blue Dot
            zenQuote.classList.remove('show-quote');
            setTimeout(() => {
                const textEl = document.querySelector('.quote-text');
                const authorEl = document.querySelector('.zen-author');
                const q = zenQuotes[0]; // Pale Blue Dot
                if (textEl) textEl.textContent = `"${q.text}"`;
                if (authorEl) authorEl.textContent = `- ${q.author}`;
                if (isZenMode) zenQuote.classList.add('show-quote');
            }, 2000);
        }

        // Force redraw of active shapes to snap immediately to new mode
        activeConstellations.forEach(c => {
            if (c.state !== 'waiting') {
                c.state = 'fading_out';
            }
        });
    });
}

const toggleZenMode = () => {
    isZenMode = !isZenMode;

    if (isZenMode) {
        document.body.classList.add('zen-mode');
        // Lock scroll in Zen mode (both html + body for cross-browser consistency)
        document.documentElement.dataset.prevOverflow = document.documentElement.style.overflow || '';
        document.body.dataset.prevOverflow = document.body.style.overflow || '';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        // Instantly zero out scene parallax rotation so camera is perfectly still
        scene.rotation.x = 0;
        scene.rotation.y = 0;
        scene.rotation.z = 0;

        // Disable Sci-Fi 3D Elements
        holoGroup.visible = false;
        scanPoints.visible = false;
        debrisPivot.visible = false;
        warpLines.visible = false;
        solarFlare.visible = false;
        scannerLine.visible = false;

        shootingStars.forEach(s => s.mesh.visible = false);
        particlesMaterial.opacity = 0.1; // Dim background stars

        quoteIndex = 0; // Reset quote index to Pale Blue Dot

        // Force currently active constellations to immediately fade out to be reborn as ZEN shapes
        activeConstellations.forEach(c => {
            if (c.state !== 'waiting') {
                c.state = 'fading_out';
            }
        });

        // Dim Lights and Bloom
        if (bloomPass) bloomPass.strength = 0.0; // Remove bloom
        directionalLight.intensity = 0.5; // Dimmer sun for Zen relaxation
        ambientLight.intensity = 0.08; // Ultra-soft ambient
        backLight.intensity = 0.2; // Very subtle backlight rim

        // Hide Map Markers
        if (mapMarkersGroup) mapMarkersGroup.visible = false;

        // Prevention of Camera Clipping:
        // When scrolled, the camera is zoomed in on Earth. We want Zen mode to be from a distance.
        // We'll reset the scroll or the camera's zoom influence here.
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Show Quote after UI fades
        setTimeout(() => {
            if (isZenMode) {
                // Ensure initial quote is Pale Blue Dot
                const textEl = document.querySelector('.quote-text');
                const authorEl = document.querySelector('.zen-author');
                const q = zenQuotes[0];
                if (textEl) textEl.textContent = `"${q.text}"`;
                if (authorEl) authorEl.textContent = `- ${q.author}`;
                zenQuote.classList.add('show-quote');
            }
        }, 1200);

        // Show Hint briefly
        zenExitHint.classList.add('show-hint');
        clearTimeout(hintTimeout);
        hintTimeout = setTimeout(() => {
            zenExitHint.classList.remove('show-hint');
        }, 4000);

    } else {
        document.body.classList.remove('zen-mode');
        // Restore scroll
        const prevHtml = document.documentElement.dataset.prevOverflow ?? '';
        const prevBody = document.body.dataset.prevOverflow ?? '';
        document.documentElement.style.overflow = prevHtml;
        document.body.style.overflow = prevBody;
        delete document.documentElement.dataset.prevOverflow;
        delete document.body.dataset.prevOverflow;
        zenQuote.classList.remove('show-quote');
        zenExitHint.classList.remove('show-hint');
        clearInterval(quoteInterval);

        // Restore Sci-Fi 3D Elements
        holoGroup.visible = true;
        scanPoints.visible = true;
        debrisPivot.visible = true;
        if (!isWarping) { // Only if not in intro sequence
            warpLines.visible = true;
            solarFlare.visible = true;
        }
        scannerLine.visible = true;

        shootingStars.forEach(s => s.mesh.visible = true);
        particlesMaterial.opacity = 0.6; // Restore stars

        // Force currently active ZEN constellations to fade out to be reborn as Sci-Fi
        // Restore Map Markers
        if (mapMarkersGroup) mapMarkersGroup.visible = true;

        activeConstellations.forEach(c => {
            if (c.state !== 'waiting') {
                c.state = 'fading_out';
            }
        });

        // Restore Lights and Bloom to the new toned-down standard settings
        if (bloomPass) bloomPass.strength = 0.4;
        directionalLight.intensity = 1.0;
        ambientLight.intensity = 0.2;
        backLight.intensity = 0.6;
    }
};

if (zenModeBtn) {
    zenModeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleZenMode();
    });
}

if (zenEnterBtn) {
    zenEnterBtn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleZenMode();
    });
}

// Exit Zen Mode with ESC key or click
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isZenMode) {
        toggleZenMode();
    }
});
window.addEventListener('click', (e) => {
    if (isZenMode) {
        // Use closest() so clicking a child span inside the btn is still recognised
        const clickedZen = e.target.closest('#zen-mode-btn');
        const clickedDream = e.target.closest('#dream-mode-btn');
        if (!clickedZen && !clickedDream) {
            toggleZenMode();
        }
    }
});

// =========================================
// NASA APOD API INTEGRATION
// =========================================
const initApod = async () => {
    const loadingState = document.getElementById('apod-loading');
    const errorState = document.getElementById('apod-error');
    const dataState = document.getElementById('apod-data');

    const mediaContainer = document.getElementById('apod-media-container');
    const titleEl = document.getElementById('apod-title');
    const dateEl = document.getElementById('apod-date');
    const copyrightEl = document.getElementById('apod-copyright');
    const explanationEl = document.getElementById('apod-explanation');
    const retryBtn = document.getElementById('apod-retry-btn');

    const loadData = async () => {
        // Reset states
        if (loadingState) loadingState.style.display = 'flex';
        if (errorState) errorState.style.display = 'none';
        if (dataState) dataState.style.display = 'none';

        try {
            const data = await fetchApod();

            // Populate DOM
            if (titleEl) titleEl.textContent = data.title;
            if (dateEl) dateEl.textContent = data.date;

            // Advanced Explanation Formatting (Paragraph Splitting)
            if (explanationEl) {
                const container = document.getElementById('apod-explanation-container');
                if (container) {
                    container.innerHTML = ''; // Clear old content

                    // Split by double newline if exists, otherwise split by sentence logic
                    let paragraphs = data.explanation.split(/\n\s*\n/);

                    if (paragraphs.length === 1) {
                        // Fallback: split longer text into chunks of ~3-4 sentences
                        const sentences = data.explanation.match(/[^\.!\?]+[\.!\?]+/g) || [data.explanation];
                        paragraphs = [];
                        for (let i = 0; i < sentences.length; i += 3) {
                            paragraphs.push(sentences.slice(i, i + 3).join(' '));
                        }
                    }

                    paragraphs.forEach(text => {
                        if (text.trim()) {
                            const p = document.createElement('p');
                            p.className = 'apod-explanation';
                            p.textContent = text.trim();
                            container.appendChild(p);
                        }
                    });
                } else {
                    explanationEl.textContent = data.explanation;
                }
            }

            const hudStatus = document.getElementById('hud-status');
            if (hudStatus) hudStatus.textContent = data.title.toUpperCase();

            if (copyrightEl) {
                copyrightEl.textContent = data.copyright ? `Image Credit & Copyright: ${data.copyright}` : 'Public Domain';
            }


            // Handle Media
            if (mediaContainer) {
                mediaContainer.innerHTML = '';
                mediaContainer.className = 'apod-new-viewport'; // Reset classes

                if (data.media_type === 'image') {
                    mediaContainer.classList.add('is-image');
                    mediaContainer.style.setProperty('--apod-bg', `url("${data.url}")`);
                    const img = document.createElement('img');
                    img.src = data.url;
                    img.alt = data.title;

                    // Clicking on the image toggles fullscreen
                    img.onclick = () => {
                        if (!document.fullscreenElement) {
                            if (mediaContainer.requestFullscreen) {
                                mediaContainer.requestFullscreen();
                            } else if (mediaContainer.webkitRequestFullscreen) { /* Safari */
                                mediaContainer.webkitRequestFullscreen();
                            } else if (mediaContainer.msRequestFullscreen) { /* IE11 */
                                mediaContainer.msRequestFullscreen();
                            }
                        } else {
                            if (document.exitFullscreen) {
                                document.exitFullscreen();
                            } else if (document.webkitExitFullscreen) { /* Safari */
                                document.webkitExitFullscreen();
                            }
                        }
                    };
                    mediaContainer.appendChild(img);
                } else if (data.media_type === 'video') {
                    mediaContainer.classList.add('is-video');
                    const iframe = document.createElement('iframe');
                    iframe.src = data.url;
                    iframe.frameBorder = '0';
                    iframe.allow = 'encrypted-media';
                    iframe.allowFullscreen = true;
                    mediaContainer.appendChild(iframe);
                }
            }

            // Bind Control Actions
            const downloadBtn = document.getElementById('apod-download-btn');
            if (downloadBtn) {
                if (data.media_type === 'image') {
                    downloadBtn.style.display = 'flex';
                    downloadBtn.onclick = async () => {
                        if (data && data.url) {
                            const filename = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '.jpg';
                            try {
                                const response = await fetch(data.url);
                                const blob = await response.blob();
                                const blobUrl = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = blobUrl;
                                a.download = filename;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(blobUrl);
                            } catch (err) {
                                console.warn("Direct download blocked by CORS. Falling back to opening in a new tab:", err);
                                window.open(data.url, '_blank');
                            }
                        }
                    };
                } else {
                    downloadBtn.style.display = 'none';
                }
            }

            // Show data
            if (loadingState) loadingState.style.display = 'none';
            if (dataState) dataState.style.display = 'flex';
        } catch (err) {
            console.error("APOD Load Error:", err);
            if (loadingState) loadingState.style.display = 'none';
            if (errorState) errorState.style.display = 'flex';
        }
    };

    if (retryBtn) {
        retryBtn.addEventListener('click', loadData);
    }

    // Call on init
    loadData();
};

initApod();

// =========================================
// UI UTILITIES
// =========================================
const simulateProgress = (containerElement) => {
    if (!containerElement) return { finish: () => { }, reset: () => { } };
    const bar = containerElement.querySelector('.cyber-progress-bar');
    if (!bar) return { finish: () => { }, reset: () => { } };

    let progress = 0;
    bar.style.width = '0%';

    // Fast initial progress, then slow down
    const interval = setInterval(() => {
        if (progress < 85) {
            progress += Math.random() * 15;
            if (progress > 85) progress = 85;
            bar.style.width = `${progress}%`;
        }
    }, 200);

    return {
        finish: () => {
            clearInterval(interval);
            bar.style.width = '100%';
            setTimeout(() => { bar.style.width = '0%'; }, 300);
        },
        reset: () => {
            clearInterval(interval);
            bar.style.width = '0%';
        }
    };
};

// =========================================
// JPL CAD API INTEGRATION (Close Approaches)
// =========================================
const initCad = () => {
    const loadingState = document.getElementById('cad-loading');
    const errorState = document.getElementById('cad-error');
    const dataState = document.getElementById('cad-data');
    const rowsContainer = document.getElementById('cad-list-rows');
    const distFilter = document.getElementById('cad-dist-filter');
    const fetchBtn = document.getElementById('cad-fetch-btn');
    const retryBtn = document.getElementById('cad-retry-btn');

    const loadData = async () => {
        if (loadingState) loadingState.style.display = 'flex';
        if (errorState) errorState.style.display = 'none';
        if (dataState) dataState.style.display = 'none';

        const progressTarget = simulateProgress(loadingState);

        try {
            const distValue = distFilter ? distFilter.value : '10LD';
            const data = await getCloseApproaches(distValue);

            if (rowsContainer) {
                const currentData = data.events.slice(0, 50);
                let displayLimit = 5;

                const renderGrid = () => {
                    rowsContainer.innerHTML = '';
                    const hasMore = currentData.length > displayLimit;
                    const showCount = hasMore ? displayLimit + 1 : displayLimit;
                    const sliced = currentData.slice(0, showCount);

                    sliced.forEach((event, idx) => {
                        const isFaded = hasMore && idx === displayLimit;

                        // Logic for threat assessment hazard color and text
                        let hazardClass = 'safe';
                        let hazardText = 'SAFE';
                        const distLD = event.lunarDistance;

                        if (distLD < 1.0) {
                            hazardClass = 'critical';
                            hazardText = 'CRITICAL';
                        } else if (distLD < 5.0) {
                            hazardClass = 'caution';
                            hazardText = 'CAUTION';
                        }

                        // Format velocity in km/s (strip trailing decimals) and distance
                        const velocity = parseFloat(event.v_rel).toFixed(2);
                        const distance = parseFloat(event.lunarDistance).toFixed(3);

                        // Compute dynamic width percent and moon positions on a relative scale
                        const maxPercent = 100;
                        let moonPercent = maxPercent;
                        let asteroidPercent = 0;
                        let moonLabelStyle = '';

                        if (distLD <= 1.0) {
                            moonPercent = maxPercent;
                            asteroidPercent = Math.max(4, Math.min(maxPercent, distLD * maxPercent));
                            moonLabelStyle = `left: ${maxPercent}%; transform: translateX(-100%);`;
                        } else {
                            const moonPercentReal = (1.0 / distLD) * maxPercent;
                            moonPercent = Math.max(15, Math.min(maxPercent, moonPercentReal));
                            asteroidPercent = maxPercent;
                            const transformX = moonPercent >= 95 ? '-100%' : (moonPercent <= 15 ? '0%' : '-50%');
                            moonLabelStyle = `left: ${moonPercent}%; transform: translateX(${transformX});`;
                        }

                        // Clean formatted date: "2026-May-22 01:14" -> "MAY-22 01:14"
                        let formattedDate = event.cd || '---';
                        const parts = formattedDate.split(' ');
                        const datePart = parts[0];
                        const timePart = parts[1] || '00:00';
                        const dateSubparts = datePart.split('-');
                        if (dateSubparts.length === 3) {
                            const month = dateSubparts[1].toUpperCase();
                            const day = dateSubparts[2];
                            formattedDate = `${month}-${day} <span class="cad-date-time">${timePart}</span>`;
                        }

                        const rowHtml = `
                            <div class="cad-list-row-main">
                                <div class="cad-row-designation">
                                    <span class="cad-desig-name">${event.des}</span>
                                    <span class="cad-desig-meta">ORBIT_ID: ${event.orbit_id}</span>
                                </div>
                                <div class="cad-row-proximity">
                                    <span class="cad-proximity-val">${distance}</span>
                                </div>
                                <div class="cad-row-date">${formattedDate}</div>
                                <div class="cad-row-velocity">${velocity} <span class="cad-vel-unit">km/s</span></div>
                                <div class="cad-row-assessment">
                                    <span class="cad-threat-badge ${hazardClass}">${hazardText}</span>
                                </div>
                            </div>
                            <div class="cad-proximity-bar-wrapper">
                                <div class="cad-proximity-bar ${hazardClass}">
                                    <!-- Earth-Moon connection line (Tactical dashed linkage) -->
                                    <div class="cad-bar-earth-moon-line" style="width: ${moonPercent}%;"></div>

                                    <!-- Earth Indicator (0 LD) -->
                                    <span class="cad-bar-label-earth ${hazardClass}" style="left: 0%;">EARTH [0 LD]</span>
                                    <span class="cad-bar-line-earth ${hazardClass}" style="left: 0%;"></span>
                                    <div class="cad-bar-dot-earth" style="left: 0%;"></div>

                                    <!-- Moon Indicator (1 LD) -->
                                    <span class="cad-bar-label-moon ${hazardClass}" style="${moonLabelStyle}">MOON [1 LD]</span>
                                    <span class="cad-bar-line-moon ${hazardClass}" style="left: ${moonPercent}%;"></span>
                                    <div class="cad-bar-dot-moon" style="left: ${moonPercent}%;"></div>

                                    <!-- Asteroid Track & Indicator -->
                                    <div class="cad-bar-fill bar-${hazardClass}" style="width: ${asteroidPercent}%"></div>
                                    <div class="cad-bar-dot dot-${hazardClass}" style="left: ${asteroidPercent}%"></div>
                                </div>
                            </div>
                        `;

                        if (isFaded) {
                            const fadedContainer = document.createElement('div');
                            fadedContainer.className = 'list-row-faded-container';
                            
                            const row = document.createElement('div');
                            row.className = 'cad-list-row';
                            row.innerHTML = rowHtml;
                            fadedContainer.appendChild(row);

                            const overlay = document.createElement('div');
                            overlay.className = 'load-more-overlay-wrapper';
                            overlay.innerHTML = `<button class="load-more-overlay-btn" id="cad-overlay-load-more-btn">LOAD MORE</button>`;
                            fadedContainer.appendChild(overlay);

                            rowsContainer.appendChild(fadedContainer);
                        } else {
                            const row = document.createElement('div');
                            row.className = 'cad-list-row';
                            row.innerHTML = rowHtml;
                            rowsContainer.appendChild(row);
                        }
                    });

                    if (hasMore) {
                        const overlayBtn = document.getElementById('cad-overlay-load-more-btn');
                        if (overlayBtn) {
                            overlayBtn.addEventListener('click', () => {
                                displayLimit += 5;
                                renderGrid();
                            });
                        }
                    }
                };

                renderGrid();
            }

            progressTarget.finish();
            if (loadingState) loadingState.style.display = 'none';
            if (dataState) dataState.style.display = 'block';
        } catch (err) {
            progressTarget.reset();
            console.error("CAD Load Error:", err);
            if (loadingState) loadingState.style.display = 'none';
            if (errorState) errorState.style.display = 'flex';
        }
    };

    if (fetchBtn) fetchBtn.addEventListener('click', loadData);
    if (retryBtn) retryBtn.addEventListener('click', loadData);

    // Initial fetch
    loadData();
};

initCad();

// =========================================
// NASA NEO API INTEGRATION (Asteroids)
// =========================================
const initNeoWs = () => {
    const startDateInput = document.getElementById('neo-start-date');
    const endDateInput = document.getElementById('neo-end-date');
    const fetchBtn = document.getElementById('neo-fetch-btn');

    const loadingState = document.getElementById('neo-loading');
    const errorState = document.getElementById('neo-error');
    const dataState = document.getElementById('neo-data');

    const gridEl = document.getElementById('neo-grid');
    const totalCountEl = document.getElementById('neo-total-count');
    const hazardCountEl = document.getElementById('neo-hazard-count');
    const activityChart = document.getElementById('neo-activity-chart');
    const ratioChart = document.getElementById('neo-ratio-chart');

    // Set default dates (Today to Today + 3 days)
    const today = new Date();
    const future = new Date();
    future.setDate(today.getDate() + 3);

    const formatDate = (date) => date.toISOString().split('T')[0];

    if (startDateInput && endDateInput) {
        startDateInput.value = formatDate(today);
        endDateInput.value = formatDate(future);
    }

    const getClassification = (asteroidId, asteroidName) => {
        const key = String(asteroidId || asteroidName || '0');
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            hash = key.charCodeAt(i) + ((hash << 5) - hash);
        }
        const classes = ['APOLLO', 'ATEN', 'AMOR'];
        return classes[Math.abs(hash) % classes.length];
    };

    const renderAsteroidCard = (asteroid) => {
        const isHazardous = asteroid.is_potentially_hazardous_asteroid;
        const hazardClass = isHazardous ? 'critical' : 'safe';
        const hazardText = isHazardous ? 'CRITICAL' : 'SAFE';

        const classification = getClassification(asteroid.id, asteroid.name);

        let diameter = "Unknown";
        if (asteroid.estimated_diameter && asteroid.estimated_diameter.meters) {
            const min = Math.round(asteroid.estimated_diameter.meters.estimated_diameter_min);
            const max = Math.round(asteroid.estimated_diameter.meters.estimated_diameter_max);
            diameter = `${min}m - ${max}m`;
        }

        let velocity = "Unknown";
        let missDistance = "Unknown";
        let approachDate = "Unknown";
        let distLD = 999;

        if (asteroid.close_approach_data && asteroid.close_approach_data.length > 0) {
            const closeApproach = asteroid.close_approach_data[0];
            approachDate = closeApproach.close_approach_date;
            velocity = Math.round(closeApproach.relative_velocity.kilometers_per_second) + " km/s";
            missDistance = Number(closeApproach.miss_distance.kilometers).toLocaleString(undefined, { maximumFractionDigits: 0 }) + " km";
            if (closeApproach.miss_distance.lunar) {
                distLD = parseFloat(closeApproach.miss_distance.lunar);
            }
        }

        // Clean formatted date: "2026-05-22" -> "MAY-22"
        let formattedDate = approachDate || '---';
        const dateParts = formattedDate.split('-');
        if (dateParts.length === 3) {
            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const monthIdx = parseInt(dateParts[1], 10) - 1;
            const month = (monthIdx >= 0 && monthIdx < 12) ? months[monthIdx] : dateParts[1];
            const day = dateParts[2];
            formattedDate = `${month}-${day}`;
        }

        // Mathematical relative scaling calculations for the visual tracking bar
        const maxPercent = 100;
        let moonPercent = maxPercent;
        let asteroidPercent = 0;
        let moonLabelStyle = '';
        let fillBarStyle = '';

        if (distLD <= 1.0) {
            // Miss distance within lunar distance: fill bar up to asteroid (miss distance)
            asteroidPercent = Math.max(4, Math.min(maxPercent, distLD * maxPercent));
            moonPercent = maxPercent;
            // Fill from Earth's edge to asteroid (miss distance)
            fillBarStyle = `left: 0%; width: ${asteroidPercent}%`;
            // Moon label at far right (1 LD)
            moonLabelStyle = `left: ${maxPercent}%; transform: translateX(-100%);`;
        } else {
            // Miss distance exceeds lunar distance: bar fully filled, moon positioned proportionally to lunar distance
            // Compute moon's relative position (1 LD) as a percentage of the total miss distance
            const moonPercentRel = Math.max(0, Math.min(maxPercent, (1 / distLD) * maxPercent));
            moonPercent = moonPercentRel;
            // Fill the entire bar from Earth to asteroid (miss distance)
            fillBarStyle = `left: 0%; width: ${maxPercent}%;`;
            asteroidPercent = maxPercent;
            moonLabelStyle = `left: ${moonPercent}%; transform: translateX(-50%);`;
        }

        return `
            <div class="neo-list-row">
                <div class="neo-list-row-main">
                    <div class="neo-row-designation">
                        <span class="neo-desig-name">${asteroid.name.replace('(', '').replace(')', '')}</span>
                        <span class="neo-desig-meta">
                            ID: ${asteroid.id}
                            <span class="neo-classification-badge">${classification}</span>
                        </span>
                    </div>
                    <div class="neo-row-diameter">${diameter}</div>
                    <div class="neo-row-velocity">${velocity}</div>
                    <div class="neo-row-miss-dist">${missDistance}</div>
                    <div class="neo-row-date">${formattedDate}</div>
                    <div class="neo-row-assessment">
                        <span class="neo-threat-badge ${hazardClass}">${hazardText}</span>
                    </div>
                </div>
                <div class="neo-proximity-bar-wrapper">
                    <div class="neo-proximity-bar ${hazardClass}">
                        <!-- Earth-Moon connection line (Tactical dashed linkage) -->
                        <div class="neo-bar-earth-moon-line" style="width: ${moonPercent}%;"></div>

                        <!-- Earth Indicator (0 LD) -->
                        <span class="neo-bar-label-earth ${hazardClass}" style="left: 0%;">EARTH [0 LD]</span>
                        <span class="neo-bar-line-earth ${hazardClass}" style="left: 0%;"></span>
                        <div class="neo-bar-dot-earth" style="left: 0%;"></div>

                        <!-- Moon Indicator (1 LD) -->
                        <span class="neo-bar-label-moon ${hazardClass}" style="${moonLabelStyle}">MOON [1 LD]</span>
                        <span class="neo-bar-line-moon ${hazardClass}" style="left: ${moonPercent}%;"></span>
                        <div class="neo-bar-dot-moon" style="left: ${moonPercent}%;"></div>

                        <!-- Asteroid Track & Indicator -->
                        <div class="neo-bar-fill bar-${hazardClass}" style="${fillBarStyle}"></div>
                        <div class="neo-bar-dot dot-${hazardClass}" style="left: ${asteroidPercent}%"></div>
                    </div>
                </div>
            </div>
        `;
    };

    const renderChart = (container, dataArray, colorClass = '', labels = []) => {
        if (!container) return;
        container.innerHTML = '';

        // Find max value to scale chart bars appropriately
        const maxVal = Math.max(...dataArray, 1);

        dataArray.forEach((val, i) => {
            const height = Math.max(5, (val / maxVal) * 100);

            const barWrapper = document.createElement('div');
            barWrapper.style.display = 'flex';
            barWrapper.style.flexDirection = 'column';
            barWrapper.style.alignItems = 'center';
            barWrapper.style.gap = '5px';
            barWrapper.style.flex = '1';

            // Custom tooltip for hover
            const tooltip = document.createElement('div');
            tooltip.className = 'chart-tooltip';
            tooltip.textContent = val;

            const bar = document.createElement('div');
            bar.className = 'chart-bar';
            if (colorClass) bar.style.backgroundColor = colorClass;

            // Delay height setting slightly for animation effect
            setTimeout(() => { bar.style.height = height + '%'; }, 50);

            // Optional label below the bar
            const label = document.createElement('span');
            label.className = 'chart-label';
            label.textContent = labels[i] || '';

            barWrapper.appendChild(tooltip);
            barWrapper.appendChild(bar);
            barWrapper.appendChild(label);

            container.appendChild(barWrapper);
        });
    };

    const loadNeoData = async () => {
        if (!startDateInput || !endDateInput) return;

        const start = startDateInput.value;
        let end = endDateInput.value;

        if (!start || !end) return;

        // NASA API HARD LIMIT: 7 days max.
        const startDateObj = new Date(start);
        const endDateObj = new Date(end);

        const timeDiff = endDateObj.getTime() - startDateObj.getTime();
        const daysDiff = timeDiff / (1000 * 3600 * 24);

        if (daysDiff > 7) {
            // Cap to 7 days to prevent API 400 Bad Request error
            const newEndDate = new Date(startDateObj);
            newEndDate.setDate(startDateObj.getDate() + 7);
            end = newEndDate.toISOString().split('T')[0];
            endDateInput.value = end; // Update UI so user sees the capped date
            console.warn("NEO API Limit: Date range exceeded 7 days. Auto-capped end date.");
        } else if (daysDiff < 0) {
            // Prevent inverted dates
            end = start;
            endDateInput.value = end;
        }

        // Reset states
        if (loadingState) loadingState.style.display = 'flex';
        if (errorState) errorState.style.display = 'none';
        if (dataState) dataState.style.display = 'none';

        const progressTarget = simulateProgress(loadingState);

        try {
            const data = await getNearEarthObjects(start, end);

            // Flatten NEOs from date mapping
            let allNeos = [];
            const dates = Object.keys(data.near_earth_objects).sort();

            const asteroidsPerDay = [];
            let totalHazardous = 0;

            dates.forEach(date => {
                const dayNeos = data.near_earth_objects[date];
                asteroidsPerDay.push(dayNeos.length);

                dayNeos.forEach(neo => {
                    allNeos.push(neo);
                    if (neo.is_potentially_hazardous_asteroid) {
                        totalHazardous++;
                    }
                });
            });

            // Sort by close approach date (closest first)
            allNeos.sort((a, b) => {
                const dateA = a.close_approach_data[0]?.close_approach_date || '9999-12-31';
                const dateB = b.close_approach_data[0]?.close_approach_date || '9999-12-31';
                return dateA.localeCompare(dateB);
            });

            // Update Stats
            if (totalCountEl) totalCountEl.textContent = allNeos.length;
            if (hazardCountEl) hazardCountEl.textContent = totalHazardous;

            // Render Charts
            // Pass formatted display dates (e.g. 03-17) as labels 
            const formattedDates = dates.map(d => {
                const parts = d.split('-');
                return parts.length === 3 ? `${parts[1]}-${parts[2]}` : d;
            });

            renderChart(activityChart, asteroidsPerDay, '', formattedDates);

            // Ratio Chart: Safe vs Hazardous
            if (ratioChart) {
                ratioChart.innerHTML = '';
                const safeCount = allNeos.length - totalHazardous;
                const total = Math.max(allNeos.length, 1);

                const safeHeight = Math.max(5, (safeCount / total) * 100);
                const hazHeight = Math.max(5, (totalHazardous / total) * 100);

                // Helper wrapper for safe/haz bars
                const createBar = (height, color, value, label) => {
                    const wrapper = document.createElement('div');
                    wrapper.style.display = 'flex';
                    wrapper.style.flexDirection = 'column';
                    wrapper.style.alignItems = 'center';
                    wrapper.style.gap = '5px';
                    wrapper.style.flex = '1';

                    const tooltip = document.createElement('div');
                    tooltip.className = 'chart-tooltip';
                    tooltip.textContent = value;

                    const bar = document.createElement('div');
                    bar.className = 'chart-bar';
                    bar.style.backgroundColor = color;
                    setTimeout(() => { bar.style.height = height + '%'; }, 50);

                    const lbl = document.createElement('span');
                    lbl.className = 'chart-label';
                    lbl.textContent = label;

                    wrapper.appendChild(tooltip);
                    wrapper.appendChild(bar);
                    wrapper.appendChild(lbl);
                    return wrapper;
                };

                const safeWrapper = createBar(safeHeight, '#00ffaa', safeCount, 'SAFE');
                const hazWrapper = createBar(hazHeight, '#ff00c1', totalHazardous, 'HAZ');

                ratioChart.appendChild(safeWrapper);
                ratioChart.appendChild(hazWrapper);
            }

            // Limit states and pagination
            let currentData = allNeos;
            let displayLimit = 5; // Default limit of 5 designations
            const loadMoreWrapper = document.getElementById('neo-load-more');
            if (loadMoreWrapper) {
                loadMoreWrapper.style.display = 'none'; // Hide the legacy bottom button wrapper
            }

            const renderGrid = () => {
                if (gridEl) {
                    const hasMore = currentData.length > displayLimit;
                    const showCount = hasMore ? displayLimit + 1 : displayLimit;
                    const sliced = currentData.slice(0, showCount);

                    gridEl.innerHTML = sliced.map((neo, idx) => {
                        const html = renderAsteroidCard(neo);
                        if (hasMore && idx === displayLimit) {
                            return `
                                <div class="list-row-faded-container">
                                    ${html}
                                    <div class="load-more-overlay-wrapper">
                                        <button class="load-more-overlay-btn" id="neo-overlay-load-more-btn">LOAD MORE</button>
                                    </div>
                                </div>
                            `;
                        }
                        return html;
                    }).join('');

                    if (hasMore) {
                        const overlayBtn = document.getElementById('neo-overlay-load-more-btn');
                        if (overlayBtn) {
                            overlayBtn.addEventListener('click', () => {
                                displayLimit += 5; // Increment by 5
                                renderGrid();
                            });
                        }
                    }
                }
            };

            renderGrid();

            // Show data
            progressTarget.finish();
            if (loadingState) loadingState.style.display = 'none';
            if (dataState) dataState.style.display = 'flex';

        } catch (err) {
            progressTarget.reset();
            console.error("NEO Load Error:", err);
            if (loadingState) loadingState.style.display = 'none';
            if (errorState) {
                errorState.style.display = 'flex';
                // Find custom error text and adapt if rate limited
                const errText = errorState.querySelector('.error-text');
                if (errText) {
                    if (err.message === 'NASA_RATE_LIMIT') {
                        errText.innerHTML = "SYSTEM OVERLOAD: NASA API rate limit exceeded.<br>Please try again later or provide a custom API Key.";
                    } else {
                        errText.innerHTML = "Unable to load telemetry data. Please try again later.";
                    }
                }
            }
        }
    };

    if (fetchBtn) {
        fetchBtn.addEventListener('click', loadNeoData);
    }

    // Initial load
    loadNeoData();
};

initNeoWs();

// =========================================
// NASA / JPL FIREBALL TRACKER LOGIC
// =========================================
const initFireball = () => {
    let allFireballs = [];
    let displayCount = 20;

    const startDateInput = document.getElementById('fireball-start-date');
    const endDateInput = document.getElementById('fireball-end-date');
    const sortSelect = document.getElementById('fireball-sort');
    const filterInput = document.getElementById('fireball-filter');
    const applyBtn = document.getElementById('fireball-apply-btn');
    const loadMoreBtn = document.getElementById('fireball-load-more');
    const gridEl = document.getElementById('fireball-grid');
    const loadingState = document.getElementById('fireball-loading');
    const errorState = document.getElementById('fireball-error');
    const dataState = document.getElementById('fireball-data');

    // Group for 3D markers
    mapMarkersGroup = new THREE.Group();

    // Function to ensure group is correctly parented
    const syncGroupParent = () => {
        if (!scene) return;
        if (model) {
            if (mapMarkersGroup.parent !== model) {
                model.add(mapMarkersGroup);
            }
        } else {
            if (mapMarkersGroup.parent !== scene) {
                scene.add(mapMarkersGroup);
            }
        }
    };
    syncGroupParent();

    const parseFBDate = (dateStr) => {
        if (!dateStr) return 0;
        // NASA JPL dates are in UTC. Ensure they are parsed as such by adding 'Z'.
        const isoStr = dateStr.includes(' ') ? dateStr.replace(' ', 'T') : dateStr;
        const d = new Date(isoStr + 'Z');
        return isNaN(d.getTime()) ? 0 : d.getTime();
    };

    const renderFireballCard = (fb) => {
        const date = fb.date || 'UNKNOWN';
        const latStr = (fb.lat && fb['lat-dir']) ? `${fb.lat} ${fb['lat-dir']}` : 'N/A';
        const lonStr = (fb.lon && fb['lon-dir']) ? `${fb.lon} ${fb['lon-dir']}` : 'N/A';
        const coordStr = (latStr !== 'N/A' || lonStr !== 'N/A') ? `${latStr}, ${lonStr}` : 'N/A';
        const alt = fb.alt ? `${fb.alt} km` : 'N/A';
        const vel = fb.vel ? `${parseFloat(fb.vel).toFixed(1)} km/s` : 'N/A';
        const altVel = (alt !== 'N/A' || vel !== 'N/A') ? `${alt} / ${vel}` : 'N/A';

        const energy = fb.impactEnergyKt ? parseFloat(fb.impactEnergyKt).toFixed(2) : '0.00';
        const radEnergy = fb.radiatedEnergy ? parseFloat(fb.radiatedEnergy).toFixed(2) : '0';

        const isHighEnergy = (fb.impactEnergyKt || 0) >= 1.0;
        const energyClass = isHighEnergy ? 'fb-high-energy' : 'fb-standard';
        const statusText = isHighEnergy ? 'HIGH ENERGY' : 'STANDARD';
        const statusClass = isHighEnergy ? 'fb-badge-high' : 'fb-badge-std';

        // Energy bar: scale 0-20 kt as 100%
        const energyBarPct = Math.min(100, Math.max(2, (parseFloat(fb.impactEnergyKt || 0) / 20) * 100));
        const energyBarColor = isHighEnergy ? 'var(--fb-pink, #ff007a)' : 'var(--fb-cyan, #00f2ff)';

        return `
            <div class="fb-list-row ${energyClass}">
                <div class="fb-list-row-main">
                    <div class="fb-row-designation">
                        <span class="fb-desig-name">EVENT: ${date.split(' ')[0]}</span>
                        <span class="fb-desig-meta">
                            ${date.split(' ')[1] ? date.split(' ')[1] : ''} UTC
                            <span class="fb-rad-energy">${radEnergy} × 10¹⁰ J radiated</span>
                        </span>
                    </div>
                    <div class="fb-row-coords">${coordStr}</div>
                    <div class="fb-row-altvel">${altVel}</div>
                    <div class="fb-row-energy" style="color: ${isHighEnergy ? '#ff007a' : '#00f2ff'}">${energy} kt</div>
                    <div class="fb-row-status">
                        <span class="fb-threat-badge ${statusClass}">${isHighEnergy ? '⚠ ' : ''}${statusText}</span>
                    </div>
                </div>
                <div class="fb-energy-bar-wrapper">
                    <div class="fb-energy-bar">
                        <div class="fb-energy-fill" style="width: ${energyBarPct}%; background: ${energyBarColor};"></div>
                        <span class="fb-energy-bar-label">RADIATED ENERGY DISTRIBUTION</span>
                        <span class="fb-energy-bar-value">${radEnergy} × 10¹⁰ J</span>
                    </div>
                </div>
            </div>
        `;
    };


    const updateMapMarkers = (eventsToPlot) => {
        syncGroupParent();

        // Clear previous
        while (mapMarkersGroup.children.length > 0) {
            const child = mapMarkersGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            mapMarkersGroup.remove(child);
        }

        let radius = 2.5;
        if (model) {
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const maxSide = Math.max(size.x, size.y, size.z);
            if (maxSide > 0) radius = maxSide / 2 + 0.05;
        }

        eventsToPlot.forEach(evt => {
            if (!evt.lat || !evt['lat-dir'] || !evt.lon || !evt['lon-dir']) return;

            let lat = parseFloat(evt.lat);
            let lon = parseFloat(evt.lon);

            if (evt['lat-dir'] === 'S') lat = -lat;
            if (evt['lon-dir'] === 'W') lon = -lon;

            const phi = (90 - lat) * (Math.PI / 180);
            const theta = (lon + 180) * (Math.PI / 180);

            const x = -(radius * Math.sin(phi) * Math.cos(theta));
            const z = (radius * Math.sin(phi) * Math.sin(theta));
            const y = (radius * Math.cos(phi));

            const markerGeo = new THREE.SphereGeometry(0.04, 8, 8);
            const energyAmt = evt.impactEnergyKt || 0;

            let mColor = 0xffa500;
            if (energyAmt > 1.0) mColor = 0xff00c1;

            const markerMat = new THREE.MeshBasicMaterial({ color: mColor });
            const marker = new THREE.Mesh(markerGeo, markerMat);
            marker.position.set(x, y, z);

            const glowMat = new THREE.SpriteMaterial({
                map: createRadialGradient(),
                color: mColor,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending
            });
            const sprite = new THREE.Sprite(glowMat);
            sprite.scale.set(0.2, 0.2, 0.2);
            marker.add(sprite);

            marker.userData = { isMarker: true, energy: energyAmt };
            mapMarkersGroup.add(marker);
        });
    };

    const createRadialGradient = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 32;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 32, 32);
        return new THREE.CanvasTexture(canvas);
    };

    const renderGrid = () => {
        if (!gridEl) return;

        let filtered = [...allFireballs];

        const minEnergy = parseFloat(filterInput.value) || 0;
        const startTime = startDateInput.value ? new Date(startDateInput.value + 'T00:00:00Z').getTime() : 0;
        const endTime = endDateInput.value ? new Date(endDateInput.value + 'T23:59:59Z').getTime() : Infinity;

        filtered = filtered.filter(f => {
            const fbTime = parseFBDate(f.date);
            const hasEnergy = (f.impactEnergyKt || 0) >= minEnergy;
            const inDateRange = fbTime >= startTime && fbTime <= endTime;
            return hasEnergy && inDateRange;
        });

        const sortVal = sortSelect.value;
        filtered.sort((a, b) => {
            const timeA = parseFBDate(a.date);
            const timeB = parseFBDate(b.date);
            if (sortVal === 'date-desc') return timeB - timeA;
            if (sortVal === 'date-asc') return timeA - timeB;
            if (sortVal === 'energy-desc') return (b.impactEnergyKt || 0) - (a.impactEnergyKt || 0);
            if (sortVal === 'energy-asc') return (a.impactEnergyKt || 0) - (b.impactEnergyKt || 0);
            return 0;
        });

        // Limit states and pagination
        let displayLimit = 12;
        const loadMoreWrapper = document.getElementById('fireball-load-more');
        const loadMoreBtn = document.getElementById('fireball-load-more-btn');

        const doRenderGrid = () => {
            if (gridEl) {
                const sliced = filtered.slice(0, displayLimit);
                gridEl.innerHTML = sliced.map(fb => renderFireballCard(fb)).join('');
                updateMapMarkers(sliced);

                if (filtered.length > displayLimit) {
                    loadMoreWrapper.style.display = 'block';
                } else {
                    loadMoreWrapper.style.display = 'none';
                }
            }
        };

        if (loadMoreBtn) {
            const newBtn = loadMoreBtn.cloneNode(true);
            loadMoreBtn.parentNode.replaceChild(newBtn, loadMoreBtn);
            newBtn.addEventListener('click', () => {
                displayLimit += 12;
                doRenderGrid();
            });
        }

        doRenderGrid();
    };

    const loadData = async (options = {}) => {
        if (loadingState) loadingState.style.display = 'flex';
        if (errorState) errorState.style.display = 'none';
        if (dataState) dataState.style.display = 'none';

        const progressTarget = simulateProgress(loadingState);

        try {
            const data = await getFireballEvents(options);
            allFireballs = data.events || [];

            // Compute stats
            const totalEl = document.getElementById('fb-total-count');
            const highEl = document.getElementById('fb-high-energy-count');
            const avgAltEl = document.getElementById('fb-avg-alt');

            if (totalEl) totalEl.textContent = allFireballs.length;

            const highEnergyEvents = allFireballs.filter(f => (f.impactEnergyKt || 0) >= 1.0);
            if (highEl) highEl.textContent = highEnergyEvents.length;

            const altsWithData = allFireballs.filter(f => f.alt).map(f => parseFloat(f.alt));
            if (avgAltEl) {
                avgAltEl.textContent = altsWithData.length > 0
                    ? (altsWithData.reduce((s, v) => s + v, 0) / altsWithData.length).toFixed(1)
                    : '—';
            }

            renderGrid();

            progressTarget.finish();
            if (loadingState) loadingState.style.display = 'none';
            if (dataState) dataState.style.display = 'flex';
        } catch (error) {
            progressTarget.reset();
            console.error("Fireball Load Error:", error);
            if (loadingState) loadingState.style.display = 'none';
            if (errorState) errorState.style.display = 'flex';
        }
    };

    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            displayCount = 20;
            const options = { limit: 150 };
            if (startDateInput && startDateInput.value) options.minDate = startDateInput.value;
            if (endDateInput && endDateInput.value) options.maxDate = endDateInput.value;

            loadData(options);
        });
    }

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            displayCount += 20;
            renderGrid();
        });
    }

    // Add immediate listeners for better UX
    if (sortSelect) sortSelect.addEventListener('change', renderGrid);
    if (filterInput) filterInput.addEventListener('input', renderGrid);

    if (startDateInput && endDateInput) {
        const today = new Date();
        endDateInput.value = today.toISOString().split('T')[0];
        const past = new Date();
        past.setFullYear(today.getFullYear() - 5);
        startDateInput.value = past.toISOString().split('T')[0];
    }

    // Initial load payload based on default values
    const initOptions = { limit: 150 };
    if (startDateInput && startDateInput.value) initOptions.minDate = startDateInput.value;
    if (endDateInput && endDateInput.value) initOptions.maxDate = endDateInput.value;
    loadData(initOptions);
};

initFireball();

// ==========================================
// NASA DONKI SPACE WEATHER (CME) LOGIC
// ==========================================
function initDonkiTracker() {
    const startDateInput = document.getElementById('donki-start-date');
    const endDateInput = document.getElementById('donki-end-date');
    const searchBtn = document.getElementById('donki-search-btn');
    const speedInput = document.getElementById('donki-speed');
    const halfAngleInput = document.getElementById('donki-half-angle');
    const catalogSelect = document.getElementById('donki-catalog');
    const mostAccurateCheck = document.getElementById('donki-most-accurate');
    const completeEntryCheck = document.getElementById('donki-complete-entry');

    const loadingState = document.getElementById('donki-loading');
    const errorState = document.getElementById('donki-error');
    const emptyState = document.getElementById('donki-empty');
    const dataState = document.getElementById('donki-data');
    const gridEl = document.getElementById('donki-grid');
    const countEl = document.getElementById('donki-count');

    // Default dates (30 days prior to current UTC date per NASA docs)
    const today = new Date();
    const past = new Date(today);
    past.setUTCDate(today.getUTCDate() - 30);

    startDateInput.value = past.toISOString().split('T')[0];
    endDateInput.value = today.toISOString().split('T')[0];

    const renderCmeAnalysisCard = (analysis) => {
        // CME Analysis objects returned are often raw or nested
        // Activity ID from the associated CME event
        const id = analysis.associatedCMEID || 'UNKNOWN_CME';

        // Use analysis time or default
        const start = analysis.time21_5 ? analysis.time21_5.split('T').join(' ') : 'N/A';
        const type = analysis.type || 'N/A';
        const speed = analysis.speed || 0;
        const halfAngle = analysis.halfAngle || 0;
        const note = analysis.note ? (analysis.note.length > 200 ? analysis.note.substring(0, 200) + '...' : analysis.note) : 'No observational notes provided.';
        const link = analysis.link || '#';

        // Evaluate instruments attached to CME
        let instruments = '';
        if (analysis.enlilList && analysis.enlilList.length > 0) {
            instruments += `<span style="display:inline-block; border:1px solid #ff00c1; color:#ff00c1; padding:2px 6px; font-size:0.6rem; margin-right:5px; margin-top:5px; border-radius:2px;">ENLIL SIMULATION</span>`;
        }

        return `
            <div class="donki-card" style="background:rgba(0,0,0,0.6); border:1px solid rgba(255, 183, 3, 0.4); padding:15px; margin-bottom:15px; box-shadow:0 0 10px rgba(255,183,3,0.1);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; border-bottom:1px solid rgba(255,183,3,0.3); padding-bottom:5px;">
                    <div>
                        <h4 style="color:#ffb703; margin:0; font-size:1.1rem; letter-spacing:1px;">CME_ANALYSIS: ${id}</h4>
                        <span style="font-size:0.8rem; color:#00fff9;">TIME 21.5: ${start}</span>
                    </div>
                </div>
                
                <div style="display:flex; justify-content: flex-start; gap: 10px; margin-bottom: 10px;">
                    <div style="background:rgba(255,183,3,0.1); padding:5px 10px; border:1px solid rgba(255,183,3,0.4); border-radius:3px;">
                        <span style="font-size:0.6rem; color:#ccc; display:block;">TYPE</span>
                        <span style="font-size:1rem; color:#fff;">${type}</span>
                    </div>
                    <div style="background:rgba(255,183,3,0.1); padding:5px 10px; border:1px solid rgba(255,183,3,0.4); border-radius:3px;">
                        <span style="font-size:0.6rem; color:#ccc; display:block;">SPEED</span>
                        <span style="font-size:1rem; color:#fff;">${speed} km/s</span>
                    </div>
                    <div style="background:rgba(255,183,3,0.1); padding:5px 10px; border:1px solid rgba(255,183,3,0.4); border-radius:3px;">
                        <span style="font-size:0.6rem; color:#ccc; display:block;">HALF ANGLE</span>
                        <span style="font-size:1rem; color:#fff;">${halfAngle}°</span>
                    </div>
                </div>

                <div style="font-size:0.85rem; color:#ccc; margin-bottom:10px; line-height:1.4;">
                    ${note}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                    <div>${instruments}</div>
                    <a href="${link}" target="_blank" class="cyber-button outline-btn" style="padding:4px 8px; font-size:0.7rem; border-color:#ffb703; color:#ffb703;">VIEW SATELLITE DATA</a>
                </div>
            </div>
        `;
    };

    const performSearch = async () => {
        const start = startDateInput.value;
        const end = endDateInput.value;
        const speed = parseFloat(speedInput.value) || 0;
        const halfAngle = parseFloat(halfAngleInput.value) || 0;
        const catalog = catalogSelect.value;
        const mostAcc = mostAccurateCheck.checked;
        const completeOnly = completeEntryCheck.checked;

        if (!start || !end) return;

        loadingState.style.display = 'flex';
        errorState.style.display = 'none';
        emptyState.style.display = 'none';
        dataState.style.display = 'none';
        gridEl.innerHTML = '';

        const progressTarget = simulateProgress(loadingState);

        try {
            // Fetch CME Analysis instead of basic CMEs
            const records = await getCmeAnalysis(start, end, mostAcc, completeOnly, speed, halfAngle, catalog);

            if (!records || records.length === 0) {
                progressTarget.finish();
                loadingState.style.display = 'none';
                emptyState.style.display = 'flex';
                return;
            }

            // Sort newest first by time21_5 (ensuring UTC comparison)
            records.sort((a, b) => {
                const timeA = a.time21_5 ? new Date(a.time21_5.endsWith('Z') ? a.time21_5 : a.time21_5 + 'Z').getTime() : 0;
                const timeB = b.time21_5 ? new Date(b.time21_5.endsWith('Z') ? b.time21_5 : b.time21_5 + 'Z').getTime() : 0;
                return timeB - timeA;
            });

            countEl.textContent = records.length;
            // Limit states and pagination
            let displayLimit = 12;
            const loadMoreWrapper = document.getElementById('donki-load-more');
            const loadMoreBtn = document.getElementById('donki-load-more-btn');

            const renderGrid = () => {
                const sliced = records.slice(0, displayLimit);
                gridEl.innerHTML = sliced.map(r => renderCmeAnalysisCard(r)).join('');

                if (records.length > displayLimit) {
                    loadMoreWrapper.style.display = 'block';
                } else {
                    loadMoreWrapper.style.display = 'none';
                }
            };

            if (loadMoreBtn) {
                const newBtn = loadMoreBtn.cloneNode(true);
                loadMoreBtn.parentNode.replaceChild(newBtn, loadMoreBtn);
                newBtn.addEventListener('click', () => {
                    displayLimit += 12;
                    renderGrid();
                });
            }

            renderGrid();

            progressTarget.finish();
            loadingState.style.display = 'none';
            dataState.style.display = 'block';

        } catch (error) {
            console.error("DONKI CME Search Error:", error);
            progressTarget.finish();
            loadingState.style.display = 'none';
            errorState.querySelector('.error-text').textContent = error.message;
            errorState.style.display = 'flex';
        }
    };

    searchBtn.addEventListener('click', performSearch);

    // Auto-load last 30 days
    performSearch();
}

// ==========================================
// CNEOS SENTRY - IMPACT RISK ASSESSMENT
// ==========================================
function initSentryMonitor() {
    const fetchBtn = document.getElementById('sentry-fetch-btn');
    const desBtn = document.getElementById('sentry-des-btn');
    const desInput = document.getElementById('sentry-des-input');
    const filterSelect = document.getElementById('sentry-filter');

    const loadingState = document.getElementById('sentry-loading');
    const errorState = document.getElementById('sentry-error');
    const emptyState = document.getElementById('sentry-empty');

    const tableDataContainer = document.getElementById('sentry-table-data');
    const tableBody = document.querySelector('#sentry-table tbody');

    const detailDataContainer = document.getElementById('sentry-detail-data');
    const detailCloseBtn = document.getElementById('sentry-detail-close');
    const detailTableBody = document.querySelector('#sentry-detail-table tbody');

    // DOM IDs for detail panel
    const detTitle = document.getElementById('sentry-detail-title');
    const detDia = document.getElementById('sentry-detail-dia');
    const detVel = document.getElementById('sentry-detail-vel');
    const detNimp = document.getElementById('sentry-detail-nimp');

    let currentSentryData = [];

    // Helper: color a Palermo Scale
    const parsePalermoColor = (valStr) => {
        const val = parseFloat(valStr);
        if (isNaN(val)) return '#fff';
        if (val < -2.0) return '#00ffaa'; // Greenish
        if (val < 0) return '#ffb703'; // Yellow
        return '#ff3c00'; // Red
    };

    // View specific object
    const loadSentryObject = async (designation) => {
        if (!designation) return;

        detailDataContainer.style.display = 'none';
        errorState.style.display = 'none';
        emptyState.style.display = 'none';

        // Use hazard loading
        loadingState.style.display = 'flex';
        const progressTarget = simulateProgress(loadingState);

        try {
            const data = await getSentryObjectDetails(designation);

            // Populate summary
            const summary = data.summary || {};
            detTitle.textContent = `ASTEROID ${summary.fullname || designation}`;
            detDia.textContent = summary.diameter ? `${summary.diameter} km` : '---';
            detVel.textContent = summary.v_imp ? `${summary.v_imp} km/s` : '---';
            detNimp.textContent = summary.n_imp || '0';

            // Populate specific impact dates
            const impacts = data.data || [];
            let html = '';

            if (impacts.length === 0) {
                html = `<tr><td colspan="4" style="text-align:center;">No specific impact dates found.</td></tr>`;
            } else {
                impacts.forEach(imp => {
                    const psColor = parsePalermoColor(imp.ps);
                    html += `
                        <tr>
                            <td style="color:#00fff9;">${imp.date || '---'}</td>
                            <td style="color:#ffb703;">${imp.ip || '---'}</td>
                            <td style="color:#ccc;">${imp.sigma_vi || '---'}</td>
                            <td style="color:${psColor}; font-weight:bold;">${imp.ps || '---'}</td>
                        </tr>
                    `;
                });
            }

            detailTableBody.innerHTML = html;

            progressTarget.finish();
            loadingState.style.display = 'none';
            detailDataContainer.style.display = 'block';

        } catch (error) {
            console.error("Sentry Details Error:", error);
            progressTarget.finish();
            loadingState.style.display = 'none';

            if (error.message.includes('THREAT NEUTRALIZED')) {
                emptyState.querySelector('.error-text').textContent = error.message;
                emptyState.style.display = 'flex';
            } else {
                errorState.querySelector('.error-text').textContent = error.message;
                errorState.style.display = 'flex';
            }
        }
    };

    // Load overarching Mode V table
    const loadSentryModeV = async () => {
        // Hide details if open
        detailDataContainer.style.display = 'none';
        tableDataContainer.style.display = 'none';
        errorState.style.display = 'none';
        emptyState.style.display = 'none';

        loadingState.style.display = 'flex';
        const progressTarget = simulateProgress(loadingState);

        try {
            const response = await getSentryVirtualImpactors();
            currentSentryData = response.data || [];

            renderSentryTable();

            progressTarget.finish();
            loadingState.style.display = 'none';
            tableDataContainer.style.display = 'block';
        } catch (error) {
            console.error(error);
            progressTarget.finish();
            loadingState.style.display = 'none';
            errorState.querySelector('.error-text').textContent = error.message;
            errorState.style.display = 'flex';
        }
    };

    const renderSentryTable = () => {
        const filterLevel = filterSelect.value;
        let displayData = [...currentSentryData];

        if (filterLevel === 'high') {
            displayData = displayData.filter(item => {
                const torino = parseInt(item.ts_max || item.ts || "0");
                const palermo = parseFloat(item.ps_cum || item.ps || "-10");
                // If Torino scale is > 0 OR Palermo score is >= -1 it's considered High risk
                return torino > 0 || palermo > -1.0;
            });
        }

        let html = '';
        if (displayData.length === 0) {
            html = `<tr><td colspan="7" style="text-align:center; color:#00ffaa;">NO VIRTUAL IMPACTORS MATCH FILTER PARAMETERS</td></tr>`;
        } else {
            displayData.forEach(item => {
                const torinoVal = parseInt(item.ts_max || item.ts || "0");
                const torinoColor = torinoVal === 0 ? '#00ffaa' : (torinoVal < 3 ? '#facc15' : '#ff3c00');

                const palermoVal = parseFloat(item.ps_cum || item.ps || "-10");
                const palermoColor = parsePalermoColor(palermoVal);

                html += `
                    <tr>
                        <td style="color:#00fff9; font-weight:bold;">${item.fullname || item.des || '---'}</td>
                        <td style="color:#ffb703;">${item.ip || '---'}</td>
                        <td style="color:#ccc;">${item.energy ? parseFloat(item.energy).toExponential(2) : '---'}</td>
                        <td style="color:${palermoColor};">${item.ps_cum || item.ps || '---'}</td>
                        <td style="color:${torinoColor}; font-weight:bold;">${torinoVal}</td>
                        <td style="color:#ccc; font-family:monospace;">${item.range || item.date || '---'}</td>
                        <td>
                            <button class="cyber-button hazard-btn" style="padding:4px 8px; font-size:0.6rem;" onclick="document.dispatchEvent(new CustomEvent('loadSentryObj', {detail: '${item.des}'}))">ANALYZE</button>
                        </td>
                    </tr>
                `;
            });
        }
        tableBody.innerHTML = html;
    };

    // Event Listeners
    fetchBtn.addEventListener('click', loadSentryModeV);
    filterSelect.addEventListener('change', renderSentryTable);

    desBtn.addEventListener('click', () => loadSentryObject(desInput.value));
    desInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadSentryObject(desInput.value);
    });

    detailCloseBtn.addEventListener('click', () => {
        detailDataContainer.style.display = 'none';
        tableDataContainer.style.display = 'block';
    });

    // Custom event to handle inline table buttons
    document.addEventListener('loadSentryObj', (e) => {
        if (e.detail) {
            desInput.value = e.detail;
            loadSentryObject(e.detail);
        }
    });

    // Auto-load main table
    loadSentryModeV();
}

// =========================================
// OSDR SPACE EXPERIMENT EXPLORER LOGIC
// =========================================
const initResearchExplorer = () => {
    const searchInput = document.getElementById('osdr-search-input');
    const searchBtn = document.getElementById('osdr-search-btn');
    const gridEl = document.getElementById('osdr-grid');
    const loadMoreBtn = document.getElementById('osdr-load-more');
    const loadingState = document.getElementById('osdr-loading');
    const errorState = document.getElementById('osdr-error');
    const emptyState = document.getElementById('osdr-empty');
    const dataState = document.getElementById('osdr-data');

    // Modal elements
    const modal = document.getElementById('osdr-modal');
    const modalCloseBtn = document.getElementById('modal-osdr-close-btn');
    const modalId = document.getElementById('modal-osdr-id');
    const modalTitle = document.getElementById('modal-osdr-title');
    const modalMission = document.getElementById('modal-osdr-mission');
    const modalDesc = document.getElementById('modal-osdr-desc');
    const modalFieldsGrid = document.getElementById('modal-osdr-fields-grid');
    const modalUid = document.getElementById('modal-osdr-uid');
    const modalScore = document.getElementById('modal-osdr-score');

    let currentPage = 1;
    let currentQuery = '';
    let currentData = [];

    const renderCard = (study) => {
        // OSDR returns elasticsearch hits. Source contains the good stuff.
        const source = study._source || {};

        let title = source?.Project?.ProjectTitle || source?.['Study Title'] || source?.title || source?.['Project Title'] || source?.StudyTitle || 'UNKNOWN STUDY';
        if (Array.isArray(title)) title = title.filter(t => t).join(', ') || 'UNKNOWN STUDY';

        let mission = source?.Project?.SpaceMission || source?.['Mission Name'] || source?.Project?.Name;
        if (!mission && source?.Mission) mission = typeof source.Mission === 'string' ? source.Mission : source.Mission.Name;
        if (Array.isArray(mission)) mission = mission.filter(m => m).join(', ');
        if (typeof mission !== 'string') mission = String(mission || '');
        if (!mission || mission.trim() === '') mission = 'EARTH_CONTROL / UNSPECIFIED';

        let organism = source?.Project?.Organism || source?.organism;
        if (Array.isArray(organism)) organism = organism.filter(o => o).join(', ');
        if (!organism || organism.trim() === '') organism = 'N/A';

        let center = source?.Project?.Organization || source?.['Managing NASA Center'] || source?.Organization;
        if (Array.isArray(center)) center = center.filter(c => c).join(', ');
        if (!center || center.trim() === '') center = 'N/A';

        const id = study._id || 'N/A';

        let shortDesc = source?.Project?.ProjectDescription || source?.StudyDescription || source?.description || source?.['Project Description'] || source?.['Study Protocol Description'] || source?.['Study Description'] || 'No description available.';
        if (Array.isArray(shortDesc)) shortDesc = shortDesc.filter(d => d).join(' ');
        if (typeof shortDesc !== 'string') shortDesc = String(shortDesc);
        if (shortDesc.length > 200) shortDesc = shortDesc.substring(0, 200) + '...';

        return `
            <div class="osdr-card" data-id="${id}">
                <div class="osdr-header">
                    <h3 class="cad-name" style="color:#00fff9; font-size:1.05rem; margin:0; line-height:1.4;">${title}</h3>
                </div>
                
                <div class="cad-body" style="margin-top:1rem; margin-bottom:1rem;">
                    <div class="cad-stat" style="grid-column: 1 / -1;">
                        <span class="lbl">MISSION</span>
                        <span class="val highlight" style="color:#ff00c1; font-weight:800;">${mission}</span>
                    </div>
                    <div class="cad-stat">
                        <span class="lbl">ORGANISM</span>
                        <span class="val">${organism}</span>
                    </div>
                    <div class="cad-stat">
                        <span class="lbl">CENTER</span>
                        <span class="val" style="font-size:0.75rem;">${center}</span>
                    </div>
                </div>
                
                <div class="osdr-desc" style="padding:10px; background:rgba(0,0,0,0.4); border-left:2px solid #a855f7; margin-bottom:1rem;">
                    <p style="font-size: 0.75rem; color: #a0a0b0; margin: 0; font-family: 'Outfit', sans-serif; line-height:1.5;">${shortDesc}</p>
                </div>
                
                <div class="cad-footer" style="display:flex; justify-content:space-between; align-items:center; gap: 5px; flex-wrap: wrap;">
                    <div class="badge badge-safe" style="margin:0; font-size:0.55rem; color:#a855f7; border-color:#a855f7; background:rgba(168,85,247,0.1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%;">
                        STUDY_ID: ${id}
                    </div>
                    <div class="badge" style="margin:0; font-size:0.55rem; color:#fff; border-color:#fff; background:rgba(255,255,255,0.1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%;">
                        [ ACCESS REPOSITORY ]
                    </div>
                </div>
            </div>
        `;
    };

    const showDetails = (study) => {
        const source = study._source || {};

        let title = source?.Project?.ProjectTitle || source?.['Study Title'] || source?.title || source?.['Project Title'] || source?.StudyTitle || 'UNKNOWN STUDY';
        if (Array.isArray(title)) title = title.filter(t => t).join(', ') || 'UNKNOWN STUDY';
        const accessId = source?.Accession || study._id || 'N/A';

        let mission = source?.Project?.SpaceMission || source?.['Mission Name'] || source?.Project?.Name || source?.['Mission'];
        if (!mission && source?.Mission) mission = typeof source.Mission === 'string' ? source.Mission : source.Mission.Name;
        if (Array.isArray(mission)) mission = mission.filter(m => m).join(', ');
        if (typeof mission !== 'string') mission = String(mission || '');
        if (!mission || mission.trim() === '') mission = 'N/A';

        let desc = source?.Project?.ProjectDescription || source?.StudyDescription || source?.description || source?.['Project Description'] || source?.['Study Protocol Description'] || source?.['Study Description'] || 'No detailed description found in archive.';
        if (Array.isArray(desc)) desc = desc.filter(d => d).join('<br><br>');
        if (typeof desc !== 'string') desc = String(desc);

        modalId.textContent = `OSDR.RECORD // ${accessId}`;
        modalTitle.textContent = title;
        modalMission.textContent = `MISSION: ${mission}`;
        modalDesc.innerHTML = desc;
        modalUid.textContent = `UID: ${accessId}`;
        modalScore.textContent = `RELEVANCE: ${study?._score ? study._score.toFixed(2) : 'N/A'}`;

        let organism = source?.Project?.Organism || source?.organism;
        if (Array.isArray(organism)) organism = organism.filter(o => o).join(', ');

        let organization = source?.Project?.Organization || source?.['Managing NASA Center'] || source?.Organization;
        if (Array.isArray(organization)) organization = organization.filter(o => o).join(', ');

        const fields = [
            { label: 'ORGANISM', value: organism || 'N/A' },
            { label: 'ORGANIZATION', value: organization || 'N/A' },
            { label: 'FLIGHT PROGRAM', value: source?.Project?.FlightProgram || source?.['Flight Program'] || source?.['Space Program'] || 'N/A' },
            { label: 'ACKNOWLEDGEMENT', value: source?.Project?.Acknowledgement || source?.['Acknowledgments'] || source?.['Funding'] || 'N/A' }
        ];

        modalFieldsGrid.innerHTML = fields.map(f => `
            <div class="sat-field">
                <span class="lbl">${f.label}</span>
                <span class="val" style="font-size: 0.8rem; line-height: 1.4;">${f.value}</span>
            </div>
        `).join('');

        modal.style.display = 'flex';
    };

    const loadData = async (isAppend = false) => {
        if (!isAppend) {
            loadingState.style.display = 'flex';
            errorState.style.display = 'none';
            emptyState.style.display = 'none';
            dataState.style.display = 'none';
            gridEl.innerHTML = '';
        }

        const progressTarget = simulateProgress(loadingState);

        try {
            const data = await searchSpaceExperiments(currentQuery, currentPage, 20);

            // NASA API sometimes returns hits.hits (classic ES) and sometimes a flat hits array
            const hits = Array.isArray(data?.hits) ? data.hits : (data?.hits?.hits || []);

            if (!isAppend && hits.length === 0) {
                progressTarget.finish();
                loadingState.style.display = 'none';
                emptyState.style.display = 'flex';
                return;
            }

            // If not appending, reset currentData and displayLimit
            if (!isAppend) {
                currentData = hits;
            } else {
                currentData = currentData.concat(hits);
            }

            // Limit states and pagination
            let displayLimit = 12;
            const loadMoreWrapper = document.getElementById('osdr-load-more');
            const loadMoreBtnState = document.getElementById('osdr-load-more-btn');

            const doRenderOsdrGrid = () => {
                if (gridEl) {
                    const sliced = currentData.slice(0, displayLimit);
                    gridEl.innerHTML = sliced.map(hit => renderCard(hit)).join('');

                    if (currentData.length > displayLimit) {
                        loadMoreWrapper.style.display = 'block';
                    } else {
                        loadMoreWrapper.style.display = 'none';
                    }

                    // Re-bind clicks
                    document.querySelectorAll('.osdr-card').forEach(card => {
                        card.onclick = () => {
                            const id = card.getAttribute('data-id');
                            const study = currentData.find(s => s._id === id);
                            if (study) showDetails(study);
                        };
                    });
                }
            };

            if (loadMoreBtnState) {
                const newBtn = loadMoreBtnState.cloneNode(true);
                loadMoreBtnState.parentNode.replaceChild(newBtn, loadMoreBtnState);
                newBtn.addEventListener('click', () => {
                    displayLimit += 12;
                    doRenderOsdrGrid();
                });
            }

            doRenderOsdrGrid();

            progressTarget.finish();
            loadingState.style.display = 'none';
            dataState.style.display = 'flex';

        } catch (err) {
            progressTarget.reset();
            console.error("OSDR search error:", err);
            if (!isAppend) {
                loadingState.style.display = 'none';
                errorState.style.display = 'flex';
            }
        }
    };

    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const val = searchInput.value.trim();
            if (!val) return;
            currentQuery = val;
            currentPage = 1;
            loadData(false);
        });
    }

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const val = searchInput.value.trim();
                if (!val) return;
                currentQuery = val;
                currentPage = 1;
                loadData(false);
            }
        });
    }

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            currentPage++;
            loadData(true);
        });
    }

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => modal.style.display = 'none');
    }
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
};

// =========================================
// SATELLITE EXPLORER (CelesTrak)
// =========================================
const initSatelliteExplorer = () => {
    const categorySelect = document.getElementById('sat-category-select');
    const loadBtn = document.getElementById('sat-load-btn');
    const nameInput = document.getElementById('sat-name-input');
    const nameBtn = document.getElementById('sat-name-btn');
    const noradInput = document.getElementById('sat-norad-input');
    const noradBtn = document.getElementById('sat-norad-btn');

    const loadingState = document.getElementById('sat-loading');
    const errorState = document.getElementById('sat-error');
    const dataState = document.getElementById('sat-data');
    const gridEl = document.getElementById('sat-grid');
    const loadMoreWrap = document.getElementById('sat-load-more');
    const loadMoreBtn = document.getElementById('sat-load-more-btn');

    const PAGE_SIZE = 30;
    let currentSatellites = [];
    let visibleCount = 0;

    const getField = (obj, ...keys) => {
        for (const k of keys) {
            if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
        }
        return undefined;
    };

    const formatNumber = (val, digits = 2) => {
        const n = Number(val);
        if (!Number.isFinite(n)) return '—';
        return n.toFixed(digits);
    };

    const isSatcatRecord = (obj) => obj && typeof obj === 'object' && 'OBJECT_ID' in obj && 'NORAD_CAT_ID' in obj;

    const renderCard = (sat) => {
        const name = getField(sat, 'OBJECT_NAME', 'object_name', 'name') || 'UNKNOWN';
        const norad = getField(sat, 'NORAD_CAT_ID', 'norad_cat_id', 'noradId', 'NORAD_ID');

        const inc = getField(sat, 'INCLINATION', 'inclination');
        const ecc = getField(sat, 'ECCENTRICITY', 'eccentricity');
        let mm = getField(sat, 'MEAN_MOTION', 'mean_motion', 'meanMotion');

        // SATCAT doesn't provide mean motion directly, but it may provide PERIOD (minutes)
        if (mm === undefined && isSatcatRecord(sat)) {
            const periodMin = Number(getField(sat, 'PERIOD', 'period'));
            if (Number.isFinite(periodMin) && periodMin > 0) {
                mm = 1440 / periodMin;
            }
        }

        const isCatalogOnly = isSatcatRecord(sat) && getField(sat, 'ECCENTRICITY', 'eccentricity', 'MEAN_MOTION', 'mean_motion') === undefined;

        return `
            <div class="sat-card">
                <h3 class="sat-name">${name}</h3>

                <div class="sat-detail">
                    <span class="lbl">NORAD ID</span>
                    <span class="val">${norad ?? '—'}</span>
                </div>
                <div class="sat-detail">
                    <span class="lbl">INCLINATION</span>
                    <span class="val">${formatNumber(inc, 2)}°</span>
                </div>
                <div class="sat-detail">
                    <span class="lbl">ECCENTRICITY</span>
                    <span class="val">${formatNumber(ecc, 6)}</span>
                </div>
                <div class="sat-detail">
                    <span class="lbl">MEAN MOTION</span>
                    <span class="val">${formatNumber(mm, 2)} rev/day</span>
                </div>

                ${isCatalogOnly ? `
                    <div class="badge" style="margin-top:12px; border-color:#facc15; color:#facc15; background:rgba(250,204,21,0.08);">
                        CATALOG ONLY (NO GP ELEMENTS AVAILABLE)
                    </div>
                ` : ``}
            </div>
        `;
    };

    const showLoading = () => {
        if (loadingState) loadingState.style.display = 'flex';
        if (errorState) errorState.style.display = 'none';
        if (dataState) dataState.style.display = 'none';
    };

    const showError = () => {
        if (loadingState) loadingState.style.display = 'none';
        if (errorState) errorState.style.display = 'flex';
        if (dataState) dataState.style.display = 'none';
    };

    const showData = () => {
        if (loadingState) loadingState.style.display = 'none';
        if (errorState) errorState.style.display = 'none';
        if (dataState) dataState.style.display = 'block';
    };

    const renderPage = () => {
        if (!gridEl) return;

        if (!currentSatellites || currentSatellites.length === 0) {
            gridEl.innerHTML = `
                <div style="grid-column: 1 / -1; text-align:center; font-family:monospace; color:#facc15; padding:20px; border:1px dashed rgba(250,204,21,0.5); background:rgba(250,204,21,0.05);">
                    No satellites found.
                </div>
            `;
            if (loadMoreWrap) loadMoreWrap.style.display = 'none';
            return;
        }

        const slice = currentSatellites.slice(0, visibleCount);
        gridEl.innerHTML = slice.map(renderCard).join('');

        const hasMore = currentSatellites.length > visibleCount;
        if (loadMoreWrap) loadMoreWrap.style.display = hasMore ? 'block' : 'none';
    };

    const loadGroup = async () => {
        const group = categorySelect ? categorySelect.value : 'active';
        showLoading();
        const progressTarget = simulateProgress(loadingState);

        try {
            const data = await getSatellites(group);
            currentSatellites = Array.isArray(data) ? data : [];
            visibleCount = Math.min(PAGE_SIZE, currentSatellites.length);
            renderPage();
            progressTarget.finish();
            showData();
        } catch (err) {
            progressTarget.reset();
            console.error("Satellite group fetch error:", err);
            showError();
        }
    };

    const lookupNorad = async () => {
        const raw = (noradInput ? noradInput.value : '').trim();
        const noradId = raw.replace(/[^\d]/g, '');
        if (!noradId) return;

        showLoading();
        const progressTarget = simulateProgress(loadingState);

        try {
            const sat = await getSatelliteById(noradId);
            currentSatellites = sat ? [sat] : [];
            visibleCount = currentSatellites.length;
            renderPage();
            progressTarget.finish();
            showData();
        } catch (err) {
            progressTarget.reset();
            console.error("Satellite NORAD lookup error:", err);
            showError();
        }
    };

    const searchByName = async () => {
        const raw = (nameInput ? nameInput.value : '').trim();
        if (!raw) return;

        showLoading();
        const progressTarget = simulateProgress(loadingState);

        try {
            const gpData = await getSatellitesByName(raw);
            const gpArr = Array.isArray(gpData) ? gpData : [];

            if (gpArr.length > 0) {
                currentSatellites = gpArr;
            } else {
                const satcatData = await getSatcatRecordsByName(raw);
                currentSatellites = Array.isArray(satcatData) ? satcatData : [];
            }

            visibleCount = Math.min(PAGE_SIZE, currentSatellites.length);
            renderPage();
            progressTarget.finish();
            showData();
        } catch (err) {
            progressTarget.reset();
            console.error("Satellite name search error:", err);
            showError();
        }
    };

    if (loadBtn) loadBtn.addEventListener('click', loadGroup);
    if (nameBtn) nameBtn.addEventListener('click', searchByName);
    if (nameInput) {
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchByName();
        });
    }
    if (noradBtn) noradBtn.addEventListener('click', lookupNorad);
    if (noradInput) {
        noradInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') lookupNorad();
        });
    }
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            visibleCount = Math.min(currentSatellites.length, visibleCount + PAGE_SIZE);
            renderPage();
        });
    }
};
initResearchExplorer();
initSentryMonitor();
initDonkiTracker();
initSatelliteExplorer();

// =========================================
// SCROLL SPY FOR HUD SIDEBAR NAVIGATION
// =========================================
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.section, .content-section');

if (navItems.length > 0 && sections.length > 0) {
    const observerOptions = {
        root: null,
        rootMargin: "-30% 0px -30% 0px", // Triggers when element occupies the middle portion of the screen
        threshold: 0
    };

    const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const currentId = entry.target.id;

                // Remove active class from all nav items
                navItems.forEach(item => {
                    item.classList.remove('active');
                });

                // Find and activate the link corresponding to this section
                const activeNav = document.querySelector(`.nav-item[href="#${currentId}"]`);
                if (activeNav) {
                    activeNav.classList.add('active');
                }
            }
        });
    }, observerOptions);

    sections.forEach(sec => {
        sectionObserver.observe(sec);
    });
}

// =========================================
// LIVE HUD TELEMETRY UPDATES
// =========================================
const updateHUD = () => {
    const timeEl = document.querySelector('.time-readout');
    const dateEl = document.querySelector('.date-readout');
    const coordsEl = document.querySelector('.coords-display');

    if (!timeEl || !dateEl) return;

    const now = new Date();

    // Time: HH:MM:SS
    timeEl.textContent = now.toTimeString().split(' ')[0];

    // Date: MAR.19.2026
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month = months[now.getMonth()];
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    dateEl.textContent = `${month}.${day}.${year}`;

    // Random coordinate jitter for "scanning" effect
    if (coordsEl) {
        // We add a tiny bit of random drift to make it look like a live scan
        const baseLat = 45.5230;
        const baseLon = -122.6765;
        const driftLat = (Math.random() * 0.05 - 0.025);
        const driftLon = (Math.random() * 0.05 - 0.025);

        const lat = (baseLat + driftLat).toFixed(4);
        const lon = (baseLon + driftLon).toFixed(4);
        coordsEl.textContent = `${Math.abs(lat)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon)}° ${lon >= 0 ? 'E' : 'W'}`;
    }
};

// Initial call and start interval
updateHUD();
setInterval(updateHUD, 1000);

// Micro-interaction for floating connection dock dots
document.querySelectorAll('.status-dot.pulse').forEach(dot => {
    setInterval(() => {
        dot.style.opacity = Math.random() > 0.3 ? '1' : '0.4';
    }, 180 + Math.random() * 50);
});
