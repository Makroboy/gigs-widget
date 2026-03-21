const ASSET_VERSION = "20260321-6";
const CITY_COORDINATES_URL = `./data/city-coordinates.json?v=${ASSET_VERSION}`;
const GEO_CACHE_KEY = "kemopetrol-gigs-city-cache-v1";
const MAP_SOURCE_ID = "gigs";
const UI_LANG_KEY = "kemopetrol-ui-lang";
const GIG_LIST_URL = "../";

const BASEMAPS = {
  night: {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO',
    background: "#0f0f12",
    tiles: ["https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"],
  },
};

const STRINGS = {
  en: {
    documentTitle: "Kemopetrol Gig Map",
    headlineTitle: "Past Gigs Map",
    gigListLink: "Gig List",
    filtersAria: "Map filters",
    searchPlaceholder: "Search gigs, cities, or countries...",
    allYears: "All years",
    allCities: "All cities",
    allCountries: "All countries",
    portraitHint: "Tip: landscape mode gives the map more room on phones.",
    summaryPrefix: "Showing",
    summarySuffix: "gigs",
    loadingArchive: "Loading archive.",
    archiveSummaryAria: "Archive summary",
    mapAria: "Map of past Kemopetrol gigs",
    statsCities: "Cities",
    statsCountries: "Countries",
    statsTimespan: "Timespan",
    noResults: "Change the search or filters to see gigs.",
    summaryMeta: (cities, countries, rangeText) => `${cities} cities, ${countries} countries, ${rangeText}`,
    popupGigCount: (count) => `${count} gigs with the current filters`,
    popupScrollHint: "Scroll to see more gigs",
    locationPrecisionCity: "Map shows the city area, not the exact venue",
    locationPrecisionExact: "Map shows a more precise location",
  },
  fi: {
    documentTitle: "Kemopetrol-keikat kartalla",
    headlineTitle: "Menneet keikat kartalla",
    gigListLink: "Keikkalista",
    filtersAria: "Karttasuodattimet",
    searchPlaceholder: "Hae keikkaa, kaupunkia tai maata...",
    allYears: "Kaikki vuodet",
    allCities: "Kaikki kaupungit",
    allCountries: "Kaikki maat",
    portraitHint: "Vinkki: puhelimella maisema-asento antaa kartalle enemmän tilaa.",
    summaryPrefix: "Näytetään",
    summarySuffix: "keikkaa",
    loadingArchive: "Ladataan arkistoa.",
    archiveSummaryAria: "Arkiston yhteenveto",
    mapAria: "Kartta menneistä Kemopetrol-keikoista",
    statsCities: "Kaupungit",
    statsCountries: "Maat",
    statsTimespan: "Aikaväli",
    noResults: "Vaihda hakua tai suodattimia nähdäksesi keikkoja.",
    summaryMeta: (cities, countries, rangeText) => `${cities} kaupunkia, ${countries} maata, ${rangeText}`,
    popupGigCount: (count) => `${count} keikkaa nykyisillä suodattimilla`,
    popupScrollHint: "Vieritä nähdäksesi lisää keikkoja",
    locationPrecisionCity: "Kartta näyttää kaupungin alueen, ei tarkkaa keikkapaikkaa",
    locationPrecisionExact: "Kartta näyttää tarkemman sijainnin",
  },
};

const statsElement = document.getElementById("stats");
const resultCountElement = document.getElementById("resultCount");
const resultMetaElement = document.getElementById("resultMeta");
const summaryPrefixElement = document.getElementById("summaryPrefix");
const summarySuffixElement = document.getElementById("summarySuffix");
const searchInputElement = document.getElementById("searchInput");
const headlineTitleElement = document.getElementById("headlineTitle");
const yearFilterElement = document.getElementById("yearFilter");
const countryFilterElement = document.getElementById("countryFilter");
const cityFilterElement = document.getElementById("cityFilter");
const mapContainerElement = document.getElementById("mapContainer");
const filtersBarElement = document.getElementById("filtersBar");
const portraitHintElement = document.querySelector(".portrait-hint");
const mapElement = document.getElementById("map");
const langFiButton = document.getElementById("langFi");
const langEnButton = document.getElementById("langEn");
const gigListLinkElement = document.getElementById("gigListLink");

const popup = new maplibregl.Popup({
  closeButton: true,
  closeOnClick: true,
  maxWidth: "360px",
});

const map = new maplibregl.Map({
  container: "map",
  style: createRasterStyle(BASEMAPS.night),
  center: [18, 58],
  zoom: 3.2,
  minZoom: 2,
  attributionControl: true,
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");

let mapLoadedResolve;
const mapLoaded = new Promise((resolve) => {
  mapLoadedResolve = resolve;
});

map.on("load", async () => {
  addGigLayers();
  wireMapInteractions();
  wireAttributionReveal();
  mapLoadedResolve();
});

let allGigs = [];
let enrichedGigs = [];
let liveCoordinateMap = {};
let currentVisibleGigs = [];
let currentLanguage = loadLanguage();

init().catch((error) => {
  console.error(error);
});

async function init() {
  const [coordinatesByCity] = await Promise.all([
    fetchJson(CITY_COORDINATES_URL),
  ]);

  const gigs = Array.isArray(window.gigs) ? window.gigs : [];

  if (!gigs.length) {
    throw new Error("gigs.js did not load or contained no gigs");
  }

  liveCoordinateMap = buildSeedCoordinateMap(coordinatesByCity, true);
  allGigs = gigs
    .map(normalizeGig)
    .sort((left, right) => right.sortDate.localeCompare(left.sortDate));
  enrichedGigs = attachCoordinates(allGigs, liveCoordinateMap);

  applyLanguage();
  renderHeroStats(allGigs);
  populateFilters(allGigs);
  wireControls();

  await mapLoaded;
  render();

  hydrateMissingCoordinates(allGigs).catch((error) => {
    console.error(error);
  });
}

function createRasterStyle(config) {
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: config.tiles,
        tileSize: 256,
        attribution: config.attribution,
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color": config.background,
        },
      },
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
      },
    ],
  };
}

function addGigLayers() {
  if (!map.getSource(MAP_SOURCE_ID)) {
    map.addSource(MAP_SOURCE_ID, {
      type: "geojson",
      data: emptyFeatureCollection(),
    });
  }

  map.addLayer({
    id: "point-halo",
    type: "circle",
    source: MAP_SOURCE_ID,
    paint: {
      "circle-color": "rgba(255, 143, 90, 0.16)",
      "circle-radius": [
        "step",
        ["get", "gig_count"],
        13,
        2, 16,
        5, 20,
        10, 24,
      ],
      "circle-opacity": 1,
    },
  });

  map.addLayer({
    id: "points",
    type: "circle",
    source: MAP_SOURCE_ID,
    paint: {
      "circle-color": "#ff8f5a",
      "circle-radius": [
        "case",
        ["boolean", ["feature-state", "active"], false],
        [
          "step",
          ["get", "gig_count"],
          9,
          2, 11,
          5, 13,
          10, 16,
        ],
        [
          "step",
          ["get", "gig_count"],
          7,
          2, 8,
          5, 10,
          10, 12,
        ],
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff5ee",
      "circle-opacity": 0.95,
    },
  });
}

function wireMapInteractions() {
  let activeFeatureId = null;

  map.on("click", "points", (event) => {
    const feature = event.features?.[0];
    if (!feature) {
      return;
    }

    if (activeFeatureId !== null) {
      map.setFeatureState({ source: MAP_SOURCE_ID, id: activeFeatureId }, { active: false });
    }

    activeFeatureId = feature.id;
    map.setFeatureState({ source: MAP_SOURCE_ID, id: activeFeatureId }, { active: true });

    const properties = feature.properties || {};
    const coordinates = feature.geometry.coordinates.slice();

    popup
      .setLngLat(coordinates)
      .setHTML(`
        <div>
          <h3 class="popup-title">${escapeHtml(properties.location_label || "")}</h3>
          <p class="popup-date">${escapeHtml(t().popupGigCount(properties.gig_count || "0"))}</p>
          ${properties.has_scroll_hint === "true" ? `<div class="popup-scroll-hint">${escapeHtml(t().popupScrollHint)}</div>` : ""}
          <div class="popup-list">${properties.gigs_html || ""}</div>
          <span class="popup-badge">${escapeHtml(properties.location_precision || "")}</span>
        </div>
      `)
      .addTo(map);
  });

  popup.on("close", () => {
    if (activeFeatureId !== null && map.getSource(MAP_SOURCE_ID)) {
      map.setFeatureState({ source: MAP_SOURCE_ID, id: activeFeatureId }, { active: false });
    }
    activeFeatureId = null;
  });

  for (const layerId of ["points", "point-halo"]) {
    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
    });
  }
}

function wireAttributionReveal() {
  if (!mapContainerElement) {
    return;
  }

  const revealAttribution = () => {
    mapContainerElement.classList.remove("map-idle");
  };

  map.on("mousedown", revealAttribution);
  map.on("dragstart", revealAttribution);
  map.on("wheel", revealAttribution);
  map.on("touchstart", revealAttribution);
  map.on("zoomstart", revealAttribution);

  mapContainerElement.addEventListener("keydown", revealAttribution, { once: true });
}

function wireControls() {
  searchInputElement.addEventListener("input", render);
  yearFilterElement.addEventListener("change", render);
  countryFilterElement.addEventListener("change", () => {
    refreshCityOptions();
    render();
  });
  cityFilterElement.addEventListener("change", render);
  langFiButton.addEventListener("click", () => setLanguage("fi"));
  langEnButton.addEventListener("click", () => setLanguage("en"));
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Loading ${url} failed with status ${response.status}`);
  }

  return response.json();
}

function normalizeGig(gig) {
  const country = gig.country || "Finland";
  const venueParts = splitVenue(gig.venue || "");

  return {
    ...gig,
    country,
    sortDate: toSortableDate(gig.date),
    venuePlain: venueParts.join(" / "),
    coordinateKey: createCoordinateKey(gig.city, country),
  };
}

function splitVenue(value) {
  return value
    .split(/<br\s*\/?>/gi)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function renderHeroStats(gigs) {
  const cities = new Set(gigs.map((gig) => `${gig.city}||${gig.country}`));
  const countries = new Set(gigs.map((gig) => gig.country));
  const firstYear = gigs[gigs.length - 1]?.sortDate.slice(0, 4) || "";
  const latestYear = gigs[0]?.sortDate.slice(0, 4) || "";

  const stats = [
    [t().statsCities, cities.size],
    [t().statsCountries, countries.size],
    [t().statsTimespan, `${firstYear} - ${latestYear}`],
  ];

  statsElement.innerHTML = stats.map(([label, value]) => `
    <article class="stat-card">
      <span class="stat-label">${escapeHtml(label)}</span>
      <span class="stat-value">${escapeHtml(String(value))}</span>
    </article>
  `).join("");
}

function populateFilters(gigs) {
  const previousYear = yearFilterElement.value || "__all__";
  const previousCountry = countryFilterElement.value || "__all__";

  setSelectDefaultOption(yearFilterElement, t().allYears);
  appendOptions(yearFilterElement, uniqueSorted(gigs.map((gig) => gig.sortDate.slice(0, 4)), true));
  yearFilterElement.value = optionValues(yearFilterElement).includes(previousYear) ? previousYear : "__all__";

  setSelectDefaultOption(countryFilterElement, t().allCountries);
  appendOptions(countryFilterElement, uniqueSorted(gigs.map((gig) => gig.country)));
  countryFilterElement.value = optionValues(countryFilterElement).includes(previousCountry) ? previousCountry : "__all__";

  refreshCityOptions();
}

function setSelectDefaultOption(selectElement, label) {
  selectElement.innerHTML = "";
  const option = document.createElement("option");
  option.value = "__all__";
  option.textContent = label;
  selectElement.append(option);
}

function appendOptions(selectElement, values) {
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectElement.append(option);
  }
}

function optionValues(selectElement) {
  return [...selectElement.options].map((option) => option.value);
}

function refreshCityOptions() {
  const selectedCountry = countryFilterElement.value;
  const previousValue = cityFilterElement.value;
  const matchingGigs = selectedCountry === "__all__"
    ? allGigs
    : allGigs.filter((gig) => gig.country === selectedCountry);

  setSelectDefaultOption(cityFilterElement, t().allCities);
  appendOptions(cityFilterElement, uniqueSorted(matchingGigs.map((gig) => gig.city)));
  cityFilterElement.value = optionValues(cityFilterElement).includes(previousValue) ? previousValue : "__all__";
}

function uniqueSorted(values, descending = false) {
  const uniqueValues = [...new Set(values)];
  uniqueValues.sort((left, right) => left.localeCompare(right, "fi", { numeric: true }));

  if (descending) {
    uniqueValues.reverse();
  }

  return uniqueValues;
}

function render() {
  currentVisibleGigs = applyFilters(enrichedGigs);
  renderResultsSummary(currentVisibleGigs);
  updateMapSource(currentVisibleGigs);
  fitToVisibleGigs();
}

function applyFilters(gigs) {
  const searchValue = searchInputElement.value.trim().toLowerCase();
  const selectedYear = yearFilterElement.value;
  const selectedCountry = countryFilterElement.value;
  const selectedCity = cityFilterElement.value;

  return gigs.filter((gig) => {
    const matchesSearch = !searchValue || [
      gig.venuePlain,
      gig.city,
      gig.country,
      gig.date,
      formatDateValue(gig.date),
    ].some((field) => String(field || "").toLowerCase().includes(searchValue));

    return matchesSearch &&
      (selectedYear === "__all__" || gig.sortDate.startsWith(selectedYear)) &&
      (selectedCountry === "__all__" || gig.country === selectedCountry) &&
      (selectedCity === "__all__" || gig.city === selectedCity);
  });
}

function renderResultsSummary(gigs) {
  const cities = new Set(gigs.map((gig) => `${gig.city}||${gig.country}`));
  const countries = new Set(gigs.map((gig) => gig.country));
  const years = gigs.map((gig) => gig.sortDate.slice(0, 4));
  const newest = years[0];
  const oldest = years[years.length - 1];
  const rangeText = gigs.length ? `${oldest} - ${newest}` : "-";

  resultCountElement.textContent = String(gigs.length);
  resultMetaElement.textContent = gigs.length
    ? t().summaryMeta(cities.size, countries.size, rangeText)
    : t().noResults;
}

function updateMapSource(gigs) {
  const source = map.getSource(MAP_SOURCE_ID);
  if (!source) {
    return;
  }

  source.setData(toFeatureCollection(gigs.filter((gig) => gig.hasCoordinates)));
}

function fitToVisibleGigs() {
  const features = buildCityFeatures(currentVisibleGigs.filter((gig) => gig.hasCoordinates));

  if (!features.length) {
    map.easeTo({ center: [18, 58], zoom: 3.2, duration: 500 });
    return;
  }

  if (features.length === 1) {
    map.easeTo({
      center: [features[0].longitude, features[0].latitude],
      zoom: 7,
      duration: 500,
    });
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  for (const gig of features) {
    bounds.extend([gig.longitude, gig.latitude]);
  }

  map.fitBounds(bounds, {
    padding: { top: 80, right: 70, bottom: 120, left: 70 },
    duration: 650,
    maxZoom: 7,
  });
}

function toFeatureCollection(gigs) {
  return {
    type: "FeatureCollection",
    features: buildCityFeatures(gigs).map((cityFeature) => ({
      type: "Feature",
      id: cityFeature.id,
      geometry: {
        type: "Point",
        coordinates: [cityFeature.longitude, cityFeature.latitude],
      },
      properties: {
        id: cityFeature.id,
        gig_count: cityFeature.gigCount,
        location_label: cityFeature.locationLabel,
        gigs_html: cityFeature.gigsHtml,
        location_precision: cityFeature.locationPrecision,
        has_scroll_hint: String(cityFeature.showScrollHint),
      },
    })),
  };
}

function emptyFeatureCollection() {
  return { type: "FeatureCollection", features: [] };
}

function attachCoordinates(gigs, coordinatesByCity) {
  return gigs.map((gig) => {
    const coordinateEntry = coordinatesByCity[gig.coordinateKey];

    if (!coordinateEntry) {
      return {
        ...gig,
        hasCoordinates: false,
        locationPrecision: "missing",
      };
    }

    return {
      ...gig,
      latitude: coordinateEntry.lat,
      longitude: coordinateEntry.lng,
      hasCoordinates: true,
      locationPrecision: coordinateEntry.precision || "city",
    };
  });
}

function groupBy(items, getKey) {
  const grouped = new Map();

  for (const item of items) {
    const key = getKey(item);
    const bucket = grouped.get(key) || [];
    bucket.push(item);
    grouped.set(key, bucket);
  }

  return grouped;
}

function buildSeedCoordinateMap(rawCoordinates, includeCache) {
  const seedMap = {};

  for (const [key, value] of Object.entries(rawCoordinates)) {
    if (key.includes("||")) {
      seedMap[key] = value;
    } else {
      seedMap[createCoordinateKey(key, "Finland")] = value;
    }
  }

  if (!includeCache) {
    return seedMap;
  }

  try {
    const cachedMap = JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || "{}");
    return { ...seedMap, ...cachedMap };
  } catch (error) {
    console.warn("Coordinate cache parsing failed", error);
    return seedMap;
  }
}

async function hydrateMissingCoordinates(gigs) {
  const uniqueMissingKeys = [...new Set(
    gigs
      .filter((gig) => !liveCoordinateMap[gig.coordinateKey])
      .map((gig) => gig.coordinateKey),
  )];

  if (!uniqueMissingKeys.length) {
    return;
  }

  for (const key of uniqueMissingKeys) {
    const [city, country] = key.split("||");
    const geocoded = await geocodeCity(city, country);

    if (geocoded) {
      liveCoordinateMap[key] = {
        ...geocoded,
        precision: "city",
      };
      persistCoordinateCache(liveCoordinateMap);
      enrichedGigs = attachCoordinates(allGigs, liveCoordinateMap);
      render();
    }
  }
}

async function geocodeCity(city, country) {
  const query = `${city}, ${country}`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;

  await sleep(900);

  try {
    const response = await fetch(url, {
      headers: {
        "Accept-Language": "en",
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const bestHit = Array.isArray(payload) ? payload[0] : null;

    if (!bestHit) {
      return null;
    }

    return {
      lat: Number(bestHit.lat),
      lng: Number(bestHit.lon),
    };
  } catch (error) {
    console.warn(`Geocoding failed for ${query}`, error);
    return null;
  }
}

function persistCoordinateCache(coordinateMap) {
  try {
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(coordinateMap));
  } catch (error) {
    console.warn("Coordinate cache write failed", error);
  }
}

function createCoordinateKey(city, country) {
  return `${city}||${country || "Finland"}`;
}

function buildCityFeatures(gigs) {
  const grouped = groupBy(gigs, (gig) => createRenderedLocationKey(gig));

  return [...grouped.entries()].map(([renderedLocationKey, cityGigs]) => {
    const firstGig = cityGigs[0];
    const uniqueCities = [...new Set(cityGigs.map((gig) => gig.city).filter(Boolean))];
    const uniqueCountries = [...new Set(cityGigs.map((gig) => gig.country).filter(Boolean))];
    const showGigCity = uniqueCities.length > 1;
    const locationLabel = buildLocationLabel(uniqueCities, uniqueCountries);
    const gigsHtml = cityGigs
      .sort((left, right) => right.sortDate.localeCompare(left.sortDate))
      .map((gig) => `
        <article class="popup-gig">
          <p class="popup-gig-date">${escapeHtml(formatDateValue(gig.date))}</p>
          ${showGigCity ? `<p class="popup-gig-city">${escapeHtml(gig.city)}</p>` : ""}
          <p class="popup-gig-venue">${escapeHtml(gig.venuePlain)}</p>
          ${gig.notes ? `<p class="popup-note">${escapeHtml(gig.notes)}</p>` : ""}
        </article>
      `)
      .join("");

    return {
      id: renderedLocationKey,
      coordinateKey: renderedLocationKey,
      latitude: firstGig.latitude,
      longitude: firstGig.longitude,
      gigCount: cityGigs.length,
      locationLabel,
      gigsHtml,
      locationPrecision: describePrecision(firstGig.locationPrecision),
      showScrollHint: cityGigs.length > 4,
    };
  });
}

function createRenderedLocationKey(gig) {
  return `${gig.longitude.toFixed(6)}||${gig.latitude.toFixed(6)}`;
}

function buildLocationLabel(cities, countries) {
  if (cities.length === 1) {
    return [cities[0], countries[0]].filter(Boolean).join(", ");
  }

  if (cities.length <= 3) {
    return `${cities.join(" / ")}${countries.length === 1 ? `, ${countries[0]}` : ""}`;
  }

  return currentLanguage === "fi"
    ? "Useita keikkoja samassa sijainnissa"
    : "Multiple gigs at the same location";
}

function describePrecision(precision) {
  if (precision === "city") {
    return t().locationPrecisionCity;
  }

  if (precision === "approximate") {
    return currentLanguage === "fi"
      ? "Kartta näyttää likimääräisen sijainnin"
      : "Map shows an approximate location";
  }

  return t().locationPrecisionExact;
}

function setLanguage(language) {
  if (!STRINGS[language] || language === currentLanguage) {
    return;
  }

  currentLanguage = language;
  localStorage.setItem(UI_LANG_KEY, currentLanguage);
  popup.remove();
  applyLanguage();
  renderHeroStats(allGigs);
  populateFilters(allGigs);
  render();
}

function applyLanguage() {
  const strings = t();
  document.documentElement.lang = currentLanguage;
  document.title = strings.documentTitle;
  filtersBarElement.setAttribute("aria-label", strings.filtersAria);
  headlineTitleElement.textContent = strings.headlineTitle;
  searchInputElement.placeholder = strings.searchPlaceholder;
  portraitHintElement.textContent = strings.portraitHint;
  summaryPrefixElement.textContent = strings.summaryPrefix;
  summarySuffixElement.textContent = strings.summarySuffix;
  resultMetaElement.textContent = strings.loadingArchive;
  statsElement.setAttribute("aria-label", strings.archiveSummaryAria);
  mapElement.setAttribute("aria-label", strings.mapAria);
  gigListLinkElement.href = GIG_LIST_URL;
  gigListLinkElement.textContent = strings.gigListLink;
  langFiButton.classList.toggle("is-active", currentLanguage === "fi");
  langEnButton.classList.toggle("is-active", currentLanguage === "en");
  langFiButton.setAttribute("aria-pressed", String(currentLanguage === "fi"));
  langEnButton.setAttribute("aria-pressed", String(currentLanguage === "en"));
}

function loadLanguage() {
  const stored = localStorage.getItem(UI_LANG_KEY);
  return stored && STRINGS[stored] ? stored : "en";
}

function t() {
  return STRINGS[currentLanguage];
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function toSortableDate(dateValue) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return dateValue;
  }

  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dateValue);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }

  return dateValue;
}

function formatDateValue(dateValue) {
  const sortableDate = toSortableDate(dateValue);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(sortableDate)) {
    return dateValue;
  }

  return new Intl.DateTimeFormat(currentLanguage === "fi" ? "fi-FI" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${sortableDate}T00:00:00`));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
