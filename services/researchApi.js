// OSDR API endpoints
const OSDR_SEARCH_URL = 'https://osdr.nasa.gov/osdr/data/search';
const OSDR_FILE_URL = 'https://osdr.nasa.gov/osdr/data/osd/files/';

/**
 * Searches the NASA Open Science Data Repository (OSDR).
 * @param {string} query - The search term (e.g. 'space', 'mouse liver')
 * @param {number} page - Page number for pagination
 * @param {number} size - Number of results per page
 * @returns {Promise<Object>} The parsed JSON data containing the search results
 */
export async function searchSpaceExperiments(query = 'space', page = 1, size = 20) {
    const fromIndex = (page - 1) * size;
    // According to NASA OSDR docs, the search endpoint supports type=cgene,nih_geo_gse,ebi_pride,mg_rast
    // Limiting to 'cgene' to only get NASA Open Science Data Repository authoritative records
    let targetUrl = `${OSDR_SEARCH_URL}?term=${encodeURIComponent(query)}&size=${size}&from=${fromIndex}&type=cgene`;
    
    // NASA OSDR natively supports CORS in most endpoints. Try direct first.
    const fetchMethods = [
        () => targetUrl,
        () => `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        () => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
        () => `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
    ];

    let lastError = null;

    for (const getUrl of fetchMethods) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(getUrl(), { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`OSDR Fetch Failed (${response.status}): ${getUrl()}`);
                continue;
            }

            const data = await response.json();
            
            if (!data || !data.hits) {
               console.warn("OSDR Fetch: Invalid payload received.");
               continue;
            }
            return data;
        } catch (error) {
            console.warn("OSDR Fetch Error:", getUrl(), error.name);
            lastError = error;
        }
    }

    throw new Error('OSDR_CONNECTION_FAILED: ' + (lastError ? lastError.message : 'Unknown'));
}

/**
 * Retrieves file metadata for a specific OSDR study.
 * Note: the search API often returns most metadata in 'hits'. This function can be used 
 * if you need deeper file-level or dataset-level information from a specific OSD.
 * @param {string} studyId - The ID of the study (e.g. '87')
 */
export async function getExperimentDetails(studyId) {
    const targetUrl = `${OSDR_FILE_URL}${studyId}`;
    
    const fetchMethods = [
        () => targetUrl,
        () => `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        () => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
        () => `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
    ];
    
    let lastError = null;

    for (const getUrl of fetchMethods) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); 
            
            const response = await fetch(getUrl(), { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) continue;

            return await response.json();
        } catch (error) {
            lastError = error;
        }
    }
    
    throw new Error(`OSDR_DETAIL_FAILED for ID: ${studyId}`);
}
