// services/donkiApi.js

const API_KEY = 'GnNwRwfwabcqFmJKXrFidijgNkA6cElBlsqqAT05'; // User's personal key
const DONKI_CME_URL = 'https://api.nasa.gov/DONKI/CME';

/**
 * Fetch Coronal Mass Ejections (Space Weather) from NASA DONKI
 * @param {string} startDate - format YYYY-MM-DD
 * @param {string} endDate - format YYYY-MM-DD
 */
export async function getCoronalMassEjections(startDate, endDate) {
    const endpoint = `${DONKI_CME_URL}?startDate=${startDate}&endDate=${endDate}&api_key=${API_KEY}`;
    
    // Direct attempt first, NASA api.nasa.gov has good CORS support
    const methods = [
        url => url
    ];

    let lastError = null;

    for (let urlBuilder of methods) {
        const fetchUrl = urlBuilder(endpoint);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(fetchUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`DONKI Proxy Failed: ${fetchUrl} [Status: ${response.status}]`);
                continue;
            }

            const data = await response.json();
            return data; // Array of CMEs

        } catch (error) {
            console.warn("DONKI Fetch Failed:", fetchUrl, error.name);
            lastError = error;
        }
    }

    throw new Error('DONKI_API_CONNECTION_FAILED: ' + (lastError ? lastError.message : 'Unknown error'));
}

/**
 * Fetch Coronal Mass Ejections Analysis (Space Weather) from NASA DONKI
 * @param {string} startDate - format YYYY-MM-DD
 * @param {string} endDate - format YYYY-MM-DD
 * @param {boolean} mostAccurateOnly - default true
 * @param {boolean} completeEntryOnly - default true
 * @param {number} speed - lower limit, default 0
 * @param {number} halfAngle - lower limit, default 0
 * @param {string} catalog - ALL, SWRC_CATALOG, JANG_ET_AL_CATALOG
 * @param {string} keyword - default NONE
 */
export async function getCmeAnalysis(
    startDate, 
    endDate, 
    mostAccurateOnly = true, 
    completeEntryOnly = true, 
    speed = 0, 
    halfAngle = 0, 
    catalog = 'ALL', 
    keyword = 'NONE'
) {
    const DONKI_CME_ANALYSIS_URL = 'https://api.nasa.gov/DONKI/CMEAnalysis';
    const params = new URLSearchParams({
        startDate,
        endDate,
        mostAccurateOnly: mostAccurateOnly.toString(),
        completeEntryOnly: completeEntryOnly.toString(),
        speed: speed.toString(),
        halfAngle: halfAngle.toString(),
        api_key: API_KEY
    });
    
    if (catalog !== 'ALL') {
        params.append('catalog', catalog);
    }
    if (keyword !== 'NONE') {
        params.append('keyword', keyword);
    }

    const endpoint = `${DONKI_CME_ANALYSIS_URL}?${params.toString()}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);

        const response = await fetch(endpoint, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`NASA API Failed: ${endpoint} [Status: ${response.status}]`);
        }

        const data = await response.json();
        return data; // Array of CME Analyses
    } catch (error) {
        console.warn("DONKI CME Analysis Fetch Failed:", endpoint, error.name);
        throw new Error('DONKI_ANALYSIS_API_CONNECTION_FAILED: ' + error.message);
    }
}
