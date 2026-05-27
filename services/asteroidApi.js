/**
 * Service for fetching Asteroid Close Approach Data (CAD) from JPL SSD API
 */

const CAD_API_URL = 'https://ssd-api.jpl.nasa.gov/cad.api';

/**
 * Fetch asteroids and comets passing near Earth with Proxy Fallback support
 */
export async function getCloseApproaches(distMax = '10LD') {
    const CACHE_KEY = `cad_data_v3_${distMax}`;
    const cachedData = sessionStorage.getItem(CACHE_KEY);
    
    if (cachedData) {
        try {
            return JSON.parse(cachedData);
        } catch (e) {
            console.error("Error parsing cached CAD data", e);
        }
    }

    const targetUrl = `${CAD_API_URL}?dist-max=${distMax}&sort=date`;
    
    // Attempt multiple proxies for high reliability
    const proxies = [
        url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        url => `https://corsproxy.io/?${encodeURIComponent(url)}`
    ];

    for (const getProxyUrl of proxies) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const response = await fetch(getProxyUrl(targetUrl), { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) continue;

            const data = await response.json();
            
            // Normalize the JPL array-of-arrays response
            const fields = data.fields;
            if (!data.data) throw new Error("No data in response");

            const normalized = data.data.map(row => {
                let obj = {};
                fields.forEach((field, index) => {
                    obj[field] = row[index];
                });
                
                obj.lunarDistance = parseFloat(obj.dist) * 389.172; // Convert AU to Lunar Distance (LD)
                obj.velocityKms = parseFloat(obj.v_rel);
                obj.formattedDate = obj.cd;
                
                return obj;
            });

            const result = {
                count: data.count,
                events: normalized
            };

            sessionStorage.setItem(CACHE_KEY, JSON.stringify(result));
            return result;
        } catch (error) {
            console.warn(`Proxy failed: ${getProxyUrl(targetUrl)}`, error);
            // Move to next proxy
        }
    }

    throw new Error("All CAD telemetry proxies failed. Interstellar interference detected.");
}
