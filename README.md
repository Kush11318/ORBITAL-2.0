# ORBITAL 2.0 — Space Telemetry Dashboard

ORBITAL is a comprehensive, interactive 3D space telemetry dashboard that integrates real-time scientific data with stunning visual effects. Serving as a unified central command station, it monitors space anomalies, satellite orbits, near-Earth hazards, solar activity, and biological space experiments. 

Designed with a premium retro-futuristic sci-fi aesthetic (complete with digital scanlines, custom cursors, and coordinate HUD readouts), ORBITAL runs entirely in the browser using Vanilla JavaScript and Three.js.

---

## 🚀 Key Features

*   **Interactive 3D Graphics:** Detailed, responsive models of the Earth and Moon rendered at 60 FPS using Three.js, GLTFLoader, and atmospheric radiance effects (via `EffectComposer` and `UnrealBloomPass` post-processing).
*   **Real-Time NASA & JPL Pipelines:** Integration with NASA and JPL APIs for APOD (Astronomy Picture of the Day), NeoWs (Near-Earth Object Web Service), JPL Fireballs, and DONKI (Space Weather Database).
*   **JPL Sentry Impact Risk Assessment:** Displays active collision hazards, Palermo/Torino threat scales, and orbital telemetry for virtual impactors.
*   **CelesTrak Satellite Catalog:** Search and catalog of thousands of active satellites by name, category (GPS, Starlink, etc.), or NORAD ID.
*   **NASA OSDR Search:** Enables query search and detail modal popups for historical space biology records from the NASA Open Science Data Repository.
*   **Zen & Dream Modes:** Wellness-oriented interactive modes featuring floating stardust, continuous constellation splines, and slow-moving orbits paired with philosophical quotes to reduce user cognitive fatigue.
*   **Multi-layered Proxy Fallback Routing:** Automatic rotation between direct fetch and multiple CORS/rate-limiting proxies (AllOrigins, CORSProxy, CodeTabs) to guarantee reliable uptime.

---

## 🛠️ Technology Stack

*   **Core:** HTML5, CSS3, Vanilla JavaScript (ES6 Modules)
*   **3D Render Engine:** Three.js, OrbitControls, UnrealBloomPass post-processing
*   **Dev Server:** `http-server` (Node.js utility)
*   **APIs:** NASA API, JPL SSD API, CelesTrak GP API, NASA OSDR Search API

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
