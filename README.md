# ORBITAL 2.0 — Space Telemetry Dashboard

ORBITAL is a comprehensive, interactive 3D space telemetry dashboard that integrates real-time scientific data with stunning visual effects. Serving as a unified central command station, it monitors space anomalies, satellite orbits, near-Earth hazards, solar activity, and biological space experiments. 

Designed with a premium retro-futuristic sci-fi aesthetic (complete with digital scanlines, custom cursors, and coordinate HUD readouts), ORBITAL runs entirely in the browser using Vanilla JavaScript and Three.js.

---

## 🚀 Key Features

*   **Interactive 3D Graphics:** Detailed, responsive models of the Earth and Moon rendered at 60 FPS using Three.js, GLTFLoader, and atmospheric radiance effects (via `EffectComposer` and `UnrealBloomPass` post-processing).
*   **Real-Time Data Pipelines:** Integrates 8 different scientific APIs from NASA, JPL, CelesTrak, and OSDR.
*   **Zen & Dream Modes:** Wellness-oriented interactive modes featuring floating stardust, continuous constellation splines, and slow-moving orbits paired with philosophical quotes to reduce user cognitive fatigue.
*   **Multi-layered Proxy Fallback Routing:** Automatic rotation between direct fetch and multiple CORS/rate-limiting proxies (AllOrigins, CORSProxy, CodeTabs) to guarantee reliable uptime.
*   **Client-Side Caching:** Utilizes local and session storage cache layers to minimize network overhead and respect API rate limits.

---

## 🔌 API Integrations (Deep Dive)

ORBITAL 2.0 connects directly to various aerospace and space telemetry streams. As you scroll down the command terminal, the following pipelines are initialized:

### 1. Daily View (Astronomy Picture of the Day)
*   **API:** NASA planetary **APOD** API
*   **Endpoint:** `https://api.nasa.gov/planetary/apod`
*   **Purpose:** Fetches the daily featured celestial image or video along with its metadata (title, copyright, date) and a detailed description written by a professional astronomer.
*   **UI Integration:** Acts as the welcome screen. The image/video is framed in a glowing viewport while the scientific explanation is displayed inside a terminal-styled scrolling text container.

### 2. Asteroids Panel (Close Approach Monitor)
*   **API:** JPL SSD's **CAD** (Close Approach Data) API
*   **Endpoint:** `https://ssd-api.jpl.nasa.gov/cad.api`
*   **Purpose:** Monitors asteroid and comet passes close to Earth. 
*   **UI Integration:** Translates raw astronomical distances (Astronomical Units) into **Lunar Distance (LD)**—the distance between the Earth and the Moon—rendering a real-time tracking list showing designating names, dates, relative velocities, and close-approach proximity.

### 3. NEO Monitor Panel (Near-Earth Object Feed)
*   **API:** NASA's **NeoWs** (Near-Earth Object Web Service) API
*   **Endpoint:** `https://api.nasa.gov/neo/rest/v1/feed`
*   **Purpose:** Feeds granular database search entries for asteroids within selected date ranges, tracking their estimated minimum/maximum diameters and identifying if they are classified as "Potentially Hazardous."
*   **UI Integration:** Provides an interactive calendar search tool. Renders real-time telemetry counters showing the **Total Detected** vs. **Potentially Hazardous** counts and details individual asteroid trajectories.

### 4. Meteor Event Tracker Panel (Fireball Telemetry)
*   **API:** JPL's **CNEOS Fireballs** API
*   **Endpoint:** `https://ssd-api.jpl.nasa.gov/fireball.api`
*   **Purpose:** Pulls data on recorded atmospheric fireball events (high-energy meteors disintegrating in Earth's atmosphere).
*   **UI Integration:** Filters and sorts events by date or energy. Displays meteor telemetry records containing coordinates, altitude, velocity, and impact energy measured in **kilotons of TNT (kt)**.

### 5. Satellite Explorer Panel
*   **API:** CelesTrak's **GP** (General Perturbations) API
*   **Endpoint:** `https://celestrak.org/NORAD/elements/gp.php`
*   **Purpose:** Obtains live orbital element parameters for active spacecraft orbiting Earth.
*   **UI Integration:** Allows users to query satellites by name, category (e.g. Starlink, active satellites, space stations, weather, GPS), or a specific 5-digit **NORAD ID** (e.g. ISS = 25544) to display technical orbital values (inclination, eccentricity, etc.).

### 6. Space Weather Monitor Panel (NASA DONKI Database)
*   **API:** NASA's **DONKI** (Space Weather Database of Notifications, Knowledge, Information) API
*   **Endpoints:** `https://api.nasa.gov/DONKI/CME` & `https://api.nasa.gov/DONKI/CMEAnalysis`
*   **Purpose:** Logs historical and active Coronal Mass Ejections (CMEs)—eruptions of solar gas and magnetic fields from the Sun.
*   **UI Integration:** Queries solar histories by speed, date, or catalog type, displaying solar storm trajectory, speed (km/s), half-angle width, and hemisphere coordinates.

### 7. Impact Risk Assessment Panel (JPL Sentry)
*   **API:** NASA JPL's **CNEOS Sentry** API
*   **Endpoint:** `https://ssd-api.jpl.nasa.gov/sentry.api`
*   **Purpose:** Monitors virtual impactors (asteroids that have a non-zero probability of impacting Earth).
*   **UI Integration:** Renders a high-threat "Defense Board" styled in red. Displays calculated impact probability, energy (Mt), Torino scale, Palermo scale, and next possible impact dates. Clicking "Analyze Orbit" triggers a detailed breakdown modal.

### 8. Space Experiment Explorer Panel (NASA OSDR Archive)
*   **API:** NASA's **OSDR** (Open Science Data Repository) API
*   **Endpoints:** `https://osdr.nasa.gov/osdr/data/search` & `https://osdr.nasa.gov/osdr/data/osd/files/`
*   **Purpose:** Searches database archives of biological and genomic spaceflight experiments conducted in microgravity (such as on the ISS or Space Shuttle missions).
*   **UI Integration:** Enables searching keywords like "mouse liver" or "radiation". Returns a grid of studies, where selecting a record opens a modal popup displaying abstract summaries, principal investigators, study organisms, and mission IDs.

---

## 🛠️ Technology Stack

ORBITAL 2.0 is designed to run purely client-side without heavy build scripts, Node dependencies, or database servers.

*   **Frontend Core:** HTML5, CSS3 (Vanilla CSS for retro-futuristic HUD, glowing borders, custom cursors, scanlines, and layout grids), Vanilla JavaScript (ES6+ Modules).
*   **3D Graphics & Post-Processing:**
    *   **Three.js (WebGL):** Renders the starfield, Earth, Moon, and debris rings.
    *   `GLTFLoader`: Dynamically loads realistic models (`EARTH.glb` & `MOON.glb`).
    *   `OrbitControls`: Governs responsive camera rotations and pan/zoom interactions.
    *   `EffectComposer`, `RenderPass`, and `UnrealBloomPass`: Renders post-processing effects, glowing atmospheric bloom, and space holograms.
*   **Buildless Architecture:**
    *   `es-module-shims`: Polyfill for full import map support.
    *   **Import Maps:** Loads Three.js and its addons directly from CDNs (unpkg) via ES Modules, eliminating the need for npm bundlers (Webpack, Vite).
*   **Resiliency Layer:**
    *   **Multi-layered Proxy Rotation:** Fetches route through AllOrigins, CORSProxy.io, and CodeTabs to bypass CORS rules and IP rate limiting.
    *   **Caching:** Saves data to `localStorage` (APOD, NeoWs) and `sessionStorage` (Fireballs, Satellites) to speed up loading and save API bandwidth.

---

## 💻 Local Setup & Development

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed.

### Installation
Clone the repository and install the development dependencies:
```bash
git clone https://github.com/Kush11318/ORBITAL-2.0.git
cd ORBITAL-2.0
npm install
```

### Running Locally
To launch the development server on port `8080`:
```bash
npm start
```
Then open [http://localhost:8080](http://localhost:8080) in your web browser.

---

## ☁️ Deployment on Render

ORBITAL 2.0 is a 100% static, client-side application. Set it up on Render as a **Static Site**:

*   **Service Type:** Static Site (Free tier)
*   **Build Command:** Leave this **blank** (no build system is used)
*   **Publish Directory:** `.` (representing the root directory)
*   **Environment Variables:** **None** (NASA/DONKI API keys are already configured in the `services/` folder directly)

---

## ⚠️ Troubleshooting Render: "Failed to fetch commit or branch"

If Render shows the error `"failed to fetch commit or branch from Github"`, it is usually caused by one of two issues:

1. **Incorrect Branch Name Configured in Render:**
   * This repository uses **`master`** as its default branch. 
   * By default, Render often searches for the **`main`** branch.
   * **Fix:** In the Render settings for your Static Site, find the **Branch** field and change it from `main` to `master`, then save and re-trigger deployment.

2. **Render GitHub App Permission Issues:**
   * Render may not have permission to access this newly created repository or its branches.
   * **Fix:** Go to your **GitHub Settings** > **Applications** > **Render**, click **Configure**, and make sure Render has permissions for "All repositories" or explicitly select **`Kush11318/ORBITAL-2.0`** under "Only select repositories". After saving, try redeploying on Render.
