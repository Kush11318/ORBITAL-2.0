async function fetchCelestrakJson(url, errorMessage) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(errorMessage);
  }

  // CelesTrak sometimes returns plain-text (e.g. "No GP data found")
  const text = await response.text();
  const trimmed = text.trim();

  if (trimmed === "" || trimmed === "No GP data found") {
    return [];
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // If upstream returns HTML or other non-JSON, surface a clean error
    throw new Error(errorMessage);
  }
}

export async function getSatellites(group) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`;
  return await fetchCelestrakJson(url, "Failed to fetch satellites");
}

export async function getSatelliteById(noradId) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=json`;
  const data = await fetchCelestrakJson(url, "Failed to fetch satellite");
  return data[0];
}

export async function getSatellitesByName(name) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?NAME=${encodeURIComponent(name)}&FORMAT=json`;
  return await fetchCelestrakJson(url, "Failed to fetch satellites");
}

export async function getSatcatRecordsByName(name) {
  const url = `https://celestrak.org/satcat/records.php?NAME=${encodeURIComponent(name)}&FORMAT=json`;
  return await fetchCelestrakJson(url, "Failed to fetch satellites");
}

