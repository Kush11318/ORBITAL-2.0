const API_KEY = 'GnNwRwfwabcqFmJKXrFidijgNkA6cElBlsqqAT05'; // User's personal key
const CACHE_KEY = 'apod_data';
const CACHE_DATE_KEY = 'apod_date';

export async function fetchApod() {
    // Check local storage for today's cached data to prevent multiple API calls
    const now = Date.now();
    const cachedDate = localStorage.getItem(CACHE_DATE_KEY);
    
    // Cache for 4 hours (14400000 ms)
    if (cachedDate && now - parseInt(cachedDate) < 14400000) {
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
            try {
                return JSON.parse(cachedData);
            } catch (e) {
                console.error("Error parsing cached APOD data", e);
                // Fallback to fetch if parse fails
            }
        }
    }

    try {
        const response = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${API_KEY}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Cache the successful response
        localStorage.setItem(CACHE_DATE_KEY, Date.now().toString());
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        
        return data;
    } catch (error) {
        console.error("Failed to fetch APOD:", error);
        throw error;
    }
}

export async function getNearEarthObjects(startDate, endDate) {
    const CACHE_NEO_KEY = `neows_data_${startDate}_${endDate}`;
    
    // Check local storage for cached data for this specific date range
    const cachedData = localStorage.getItem(CACHE_NEO_KEY);
    if (cachedData) {
        try {
            return JSON.parse(cachedData);
        } catch (e) {
            console.error("Error parsing cached NeoWs data", e);
            // Fallback to fetch if parse fails
        }
    }

    const targetUrl = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${startDate}&end_date=${endDate}&api_key=${API_KEY}`;
    
    // Attempt direct fetch first, then fallback to proxies to bypass IP-based 429 rate limits
    const fetchMechanisms = [
        url => url, // Direct
        url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        url => `https://corsproxy.io/?${encodeURIComponent(url)}`
    ];

    let lastError = new Error("Failed to fetch NeoWs");

    for (const getProxyUrl of fetchMechanisms) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000); // Increased to 20s for slower proxies

            const response = await fetch(getProxyUrl(targetUrl), { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 429) {
                    console.warn(`NeoWs Rate Limit (429) hit on ${getProxyUrl('direct').substring(0, 20)}... Shifting proxy.`);
                    lastError = new Error("NASA_RATE_LIMIT");
                    continue; // Auto-rotate to next proxy
                }
                lastError = new Error(`HTTP error! status: ${response.status}`);
                continue;
            }
            
            const data = await response.json();
            
            // Proxies might return a 200 OK while the payload contains the NASA API error.
            if (data && data.error) {
                if (data.error.code === 'OVER_RATE_LIMIT') {
                    console.warn(`NeoWs Rate Limit hit inside proxy payload. Shifting proxy.`);
                    lastError = new Error("NASA_RATE_LIMIT");
                    continue;
                }
                lastError = new Error(`API Error: ${data.error.message || data.error.code}`);
                continue;
            }

            // Validate expected structure
            if (!data || !data.near_earth_objects) {
                lastError = new Error("Invalid payload structure received from proxy.");
                continue;
            }
            
            // Cache the successful response
            localStorage.setItem(CACHE_NEO_KEY, JSON.stringify(data));
            return data;
        } catch (error) {
            console.warn(`NeoWs Fetch Failed:`, error);
            lastError = error;
        }
    }

    throw lastError;
}

export async function getFireballEvents(options = {}) {
    const { limit = 150, minDate = '', maxDate = '' } = options;
    
    // We cache this per session to avoid excess hits
    const CACHE_FIREBALL_KEY = `fireball_data_${limit}_${minDate}_${maxDate}`;
    const cachedData = sessionStorage.getItem(CACHE_FIREBALL_KEY);
    if (cachedData) {
        try {
            return JSON.parse(cachedData);
        } catch (e) {
            console.error("Error parsing cached Fireball data", e);
        }
    }

    let targetUrl = `https://ssd-api.jpl.nasa.gov/fireball.api?`;
    if (limit) targetUrl += `limit=${limit}&`;
    if (minDate) targetUrl += `date-min=${minDate}&`;
    if (maxDate) targetUrl += `date-max=${maxDate}&`;
    targetUrl = targetUrl.replace(/&$/, ''); // clean trailing amper
    
    // Attempt direct fetch first, then fallback to proxies
    const proxies = [
        url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ];

    for (const getProxyUrl of proxies) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

            const response = await fetch(getProxyUrl(targetUrl), { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) continue;

            let data;
            try {
                const rawJson = await response.json();
                // allorigins /get wraps the real response in .contents
                if (getProxyUrl(targetUrl).includes('allorigins.win/get')) {
                    if (rawJson.contents) {
                        data = JSON.parse(rawJson.contents);
                    } else {
                        throw new Error("allorigins wrapped contents missing");
                    }
                } else {
                    data = rawJson;
                }
            } catch (e) {
                console.warn(`Fireball JSON Parse Failed on proxy: ${getProxyUrl(targetUrl)}`);
                continue; // Move to next proxy if it returned HTML 500 instead of JSON
            }
            
            // Normalize the JPL array-of-arrays response
            if (data.count === "0" || !data.data || data.data.length === 0) {
                const emptyResult = {
                    signature: data.signature,
                    count: 0,
                    events: []
                };
                sessionStorage.setItem(CACHE_FIREBALL_KEY, JSON.stringify(emptyResult));
                return emptyResult;
            }

            const fields = data.fields || [];
            const normalized = data.data.map(row => {
                let obj = {};
                fields.forEach((field, index) => {
                    obj[field] = row[index];
                });
                
                // Helpful derived field for UI: radiated energy is 'energy', impact energy is 'impact-e'
                obj.impactEnergyKt = parseFloat(obj['impact-e'] || 0);
                obj.radiatedEnergy = parseFloat(obj['energy'] || 0);
                
                return obj;
            });

            const result = {
                signature: data.signature,
                count: data.count,
                events: normalized
            };

            // Cache for session
            sessionStorage.setItem(CACHE_FIREBALL_KEY, JSON.stringify(result));
            
            return result;
        } catch (error) {
            const proxyName = ["CORSPROXY.IO", "ALLORIGINS", "CODETABS"][proxies.indexOf(getProxyUrl)];
            console.warn(`Fireball Relay [${proxyName}] failed:`, error.name || error.message);
            // Move to next proxy
        }
    }

    throw new Error("Unable to connect to Fireball Event telemetry. All downlink relays failed.");
}

// ==========================================
// CNEOS SENTRY API (IMPACT RISK ASSESSMENT)
// ==========================================
// Documentation: https://ssd-api.jpl.nasa.gov/doc/sentry.html

const SENTRY_BASE_URL = 'https://ssd-api.jpl.nasa.gov/sentry.api';

/**
 * Fetch Mode V: Virtual Impactors
 * Retrieves all available Virtual Impactors with an Impact Probability >= 1e-3
 */
export async function getSentryVirtualImpactors() {
    // all=1 requests complete VI dataset, ip-min=1e-3 filters to 1-in-1000 odds or higher
    const endpoint = `${SENTRY_BASE_URL}?all=1&ip-min=1e-3`;
    
    // Attempt direct fetch first. NASA often allows CORS, JPL often does not.
    const methods = [
        url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ];

    let lastError = null;

    for (let urlBuilder of methods) {
        const fetchUrl = urlBuilder(endpoint);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(fetchUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            // Sentry API intentionally returns HTTP 400 for "Not Found" or "Removed" payloads
            if (!response.ok && response.status !== 400) {
                console.warn(`Sentry Mode V Fetch Failed: ${fetchUrl} [Status: ${response.status}]`);
                continue;
            }

            let data;
            try {
                const rawJson = await response.json();
                if (fetchUrl.includes('allorigins.win/get')) {
                    if (rawJson.contents) {
                        data = JSON.parse(rawJson.contents);
                    } else {
                        throw new Error("allorigins wrapped contents missing");
                    }
                } else {
                    data = rawJson;
                }
            } catch (e) {
                console.warn(`Sentry Mode V JSON Parse Failed on proxy: ${fetchUrl}`);
                continue; // Skip proxy if it returns HTML error page
            }
            
            // Validate Sentry schema
            if (data && data.signature && data.signature.source.includes('Sentry')) {
                return data;
            }

        } catch (error) {
            console.warn("Sentry Mode V Attempt Failed:", fetchUrl, error.name);
            lastError = error;
        }
    }

    throw new Error('SENTRY_API_CONNECTION_FAILED: ' + (lastError ? lastError.message : 'Unknown error'));
}

/**
 * Fetch Mode O: Object Details
 * @param {string} designation - The asteroid designation (e.g. '99942', '2009 JF1')
 */
export async function getSentryObjectDetails(designation) {
    if (!designation || designation.trim() === '') {
        throw new Error("Asteroid designation is required.");
    }

    const endpoint = `${SENTRY_BASE_URL}?des=${encodeURIComponent(designation.trim())}`;
    
    const methods = [
        url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ];

    let lastError = null;

    for (let urlBuilder of methods) {
        const fetchUrl = urlBuilder(endpoint);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(fetchUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            // Sentry API intentionally returns HTTP 400 for "Not Found" or "Removed" payloads
            if (!response.ok && response.status !== 400) {
                console.warn(`Sentry Mode O Fetch Failed: ${fetchUrl} [Status: ${response.status}]`);
                continue;
            }

            let data;
            try {
                const rawJson = await response.json();
                if (fetchUrl.includes('allorigins.win/get')) {
                    if (rawJson.contents) {
                        data = JSON.parse(rawJson.contents);
                    } else {
                        throw new Error("allorigins wrapped contents missing");
                    }
                } else {
                    data = rawJson;
                }
            } catch(e) {
                 console.warn(`Sentry Mode O JSON Parse Failed on proxy: ${fetchUrl}`);
                 continue;
            }
            
            // Validate Sentry schema
            if (data && data.signature && data.signature.source.includes('Sentry')) {
                // Return valid payload
                return data;
            }
            
            // If NASA explicitly returns a 400, the asteroid was likely removed
            if (!response.ok && response.status === 400 && data) {
                const errMsg = data.message || data.error || data.message_text;
                if (errMsg && errMsg.toLowerCase().includes("removed")) {
                     throw new Error(`THREAT NEUTRALIZED: Object ${designation} was removed from the Sentry tracking list. No longer an impact risk.`);
                }
                if (errMsg) {
                     throw new Error(`SENTRY ERROR: ${errMsg}`);
                }
            }

        } catch (error) {
            // Unpack custom neutralized errors so they bubble up to the UI properly
            if (error.message && (error.message.includes('THREAT NEUTRALIZED') || error.message.includes('SENTRY ERROR'))) {
                throw error;
            }
            console.warn("Sentry Mode O Attempt Failed:", fetchUrl, error.name);
            lastError = error;
        }
    }

    throw new Error('SENTRY_API_CONNECTION_FAILED: ' + (lastError ? lastError.message : 'Unknown error'));
}
