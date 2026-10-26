/**
 * Transit & Driving Travel Time Utilities
 * Uses OpenStreetMap Nominatim for geocoding and OSRM (Open Source Routing Machine)
 * for 100% free driving travel time and distance calculation with zero API keys.
 */

export interface GeoCoordinate {
  lat: number;
  lon: number;
  displayName?: string;
}

export interface TransitLegInfo {
  key: string;
  fromEventId: string;
  toEventId: string;
  fromLocation: string;
  toLocation: string;
  fromCity: string;
  toCity: string;
  durationMinutes: number;
  durationFormatted: string;
  distanceMiles: number;
  gapMinutes: number;
  bufferMinutes: number;
  status: 'ok' | 'tight' | 'conflict';
  googleMapsUrl: string;
}

export interface RouteTravelResult {
  originAddress: string;
  destinationAddress: string;
  distanceMiles: number;
  durationMinutes: number;
  durationFormatted: string;
  status: 'ok' | 'tight' | 'conflict' | 'unknown';
  statusMessage: string;
  googleMapsUrl: string;
}

export interface BidirectionalTransitAnalysis {
  previousAppointment?: {
    id: string;
    title: string;
    location: string;
    endTime: string;
  } | null;
  nextAppointment?: {
    id: string;
    title: string;
    location: string;
    startTime: string;
  } | null;
  legToNewEvent?: RouteTravelResult | null;
  legFromNewEvent?: RouteTravelResult | null;
  overallFeasibility: 'optimal' | 'warning' | 'conflict' | 'standalone';
  summaryMessage: string;
}

// In-memory cache to prevent duplicate HTTP requests
const geoCache = new Map<string, GeoCoordinate | null>();
const routeCache = new Map<string, { distanceMiles: number; durationMinutes: number }>();

// Fallback known coordinates for key Florida cities (fast instant lookup)
const FLORIDA_CITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  'pensacola': { lat: 30.4213, lon: -87.2169 },
  'molino': { lat: 30.7103, lon: -87.3223 },
  'jay': { lat: 30.9526, lon: -87.1510 },
  'cantonment': { lat: 30.6094, lon: -87.3378 },
  'milton': { lat: 30.6324, lon: -87.0397 },
  'pace': { lat: 30.5988, lon: -87.1594 },
  'gulf breeze': { lat: 30.3571, lon: -87.1639 },
  'navarre': { lat: 30.4021, lon: -86.8638 },
  'fort walton beach': { lat: 30.4201, lon: -86.6170 },
  'fort walton': { lat: 30.4201, lon: -86.6170 },
  'destin': { lat: 30.3935, lon: -86.4958 },
  'crestview': { lat: 30.7621, lon: -86.5705 },
  'niceville': { lat: 30.5169, lon: -86.4822 },
  'defuniak springs': { lat: 30.7207, lon: -86.1169 },
  'panama city': { lat: 30.1588, lon: -85.6602 },
  'panama city beach': { lat: 30.1766, lon: -85.8055 },
  'lynn haven': { lat: 30.2455, lon: -85.6483 },
  'century': { lat: 30.9738, lon: -87.2625 },
  'tallahassee': { lat: 30.4383, lon: -84.2807 },
  'miami': { lat: 25.7617, lon: -80.1918 },
  'fort lauderdale': { lat: 26.1224, lon: -80.1373 },
  'west palm beach': { lat: 26.7153, lon: -80.0534 },
  'boca raton': { lat: 26.3683, lon: -80.1289 },
  'hollywood': { lat: 26.0112, lon: -80.1495 },
  'pompano beach': { lat: 26.2379, lon: -80.1248 },
  'orlando': { lat: 28.5383, lon: -81.3792 },
  'tampa': { lat: 27.9506, lon: -82.4572 },
  'st petersburg': { lat: 27.7676, lon: -82.6403 },
  'clearwater': { lat: 27.9659, lon: -82.8001 },
  'jacksonville': { lat: 30.3322, lon: -81.6557 },
  'port st lucie': { lat: 27.2730, lon: -80.3582 },
  'cape coral': { lat: 26.5629, lon: -81.9495 },
  'fort myers': { lat: 26.6406, lon: -81.8723 },
  'naples': { lat: 26.1420, lon: -81.7948 }
};

/**
 * Extracts city name or key search terms from a raw property address string.
 */
export function extractCityFromAddress(address: string): string | null {
  const lower = address.toLowerCase();
  for (const city of Object.keys(FLORIDA_CITY_COORDINATES)) {
    if (lower.includes(city)) {
      return city;
    }
  }
  return null;
}

/**
 * Geocode an address to lat/lon using OpenStreetMap Nominatim with Florida fallback.
 */
export async function geocodeAddress(address?: string | null): Promise<GeoCoordinate | null> {
  if (!address || !address.trim()) return null;
  const clean = address.trim();

  if (geoCache.has(clean)) {
    return geoCache.get(clean) || null;
  }

  // 1. Try Nominatim with simplified address
  try {
    // Strip unit numbers or noisy suite details for better matching
    const query = clean.replace(/#\w+/g, '').replace(/apt\s*\w+/gi, '').trim();
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      }
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
        const result: GeoCoordinate = {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon),
          displayName: data[0].display_name
        };
        geoCache.set(clean, result);
        return result;
      }
    }
  } catch (err) {
    console.warn('Nominatim geocode warning:', err);
  }

  // 2. Fallback to matched Florida city
  const city = extractCityFromAddress(clean);
  if (city && FLORIDA_CITY_COORDINATES[city]) {
    const coords = FLORIDA_CITY_COORDINATES[city];
    const result: GeoCoordinate = {
      lat: coords.lat,
      lon: coords.lon,
      displayName: `${city}, FL`
    };
    geoCache.set(clean, result);
    return result;
  }

  geoCache.set(clean, null);
  return null;
}

/**
 * Calculate driving time and distance between two addresses using OSRM API.
 */
export async function calculateDrivingTravel(
  originAddress: string,
  destinationAddress: string
): Promise<{ distanceMiles: number; durationMinutes: number } | null> {
  if (!originAddress || !destinationAddress) return null;

  const cacheKey = `${originAddress.trim()}|${destinationAddress.trim()}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

  const [originGeo, destGeo] = await Promise.all([
    geocodeAddress(originAddress),
    geocodeAddress(destinationAddress)
  ]);

  if (!originGeo || !destGeo) {
    return null;
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originGeo.lon},${originGeo.lat};${destGeo.lon},${destGeo.lat}?overview=false`;
    const res = await fetch(url);

    if (res.ok) {
      const data = await res.json();
      if (data?.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distanceMeters = route.distance || 0;
        const durationSeconds = route.duration || 0;

        const distanceMiles = Math.round((distanceMeters / 1609.34) * 10) / 10;
        // Add a 10% safety cushion for standard traffic / parking
        const durationMinutes = Math.max(5, Math.round((durationSeconds / 60) * 1.1));

        const result = { distanceMiles, durationMinutes };
        routeCache.set(cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    console.warn('OSRM routing warning:', err);
  }

  // 3. Fallback Haversine calculation if network fails
  const haversineMiles = calculateHaversineDistance(originGeo.lat, originGeo.lon, destGeo.lat, destGeo.lon);
  const roadMiles = Math.round(haversineMiles * 1.3 * 10) / 10;
  // Estimate ~45 mph average driving speed in suburban Florida
  const durationMinutes = Math.max(10, Math.round((roadMiles / 45) * 60));

  const fallback = { distanceMiles: roadMiles, durationMinutes };
  routeCache.set(cacheKey, fallback);
  return fallback;
}

/**
 * Great-circle distance between two coordinates in miles.
 */
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Builds a direct Google Maps directions URL for 1-click verification by coordinator.
 */
export function buildGoogleMapsRouteUrl(origin: string, destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

/**
 * Performs full bidirectional transit analysis for scheduling an event on a given day/time.
 */
export async function analyzeBidirectionalTransit(params: {
  targetLocation: string;
  targetStartTime: string; // HH:mm or HH:mm:ss
  targetEndTime: string;   // HH:mm or HH:mm:ss
  dayAppointments: Array<{
    id: string;
    title: string;
    location: string;
    startTime: string;
    endTime: string;
    paId?: string;
  }>;
  selectedPaId?: string;
}): Promise<BidirectionalTransitAnalysis> {
  const { targetLocation, targetStartTime, targetEndTime, dayAppointments, selectedPaId } = params;

  // STRICT RULE: El cálculo de distancias y traslados SOLO aplica a la agenda de un PA específico.
  // Nunca se calculan distancias entre citas de diferentes PAs.
  if (!selectedPaId || selectedPaId === 'all' || selectedPaId === 'unassigned') {
    return {
      previousAppointment: null,
      nextAppointment: null,
      legToNewEvent: null,
      legFromNewEvent: null,
      overallFeasibility: 'standalone',
      summaryMessage: 'El cálculo de traslados solo aplica cuando se evalúa la agenda de un Public Adjuster específico.'
    };
  }

  // Filter appointments STRICTLY for this specific PA
  const paAppointments = dayAppointments.filter(a => a.paId === selectedPaId);

  // Convert target start and end to minutes
  const targetStartMin = timeToMinutes(targetStartTime);
  const targetEndMin = timeToMinutes(targetEndTime);

  // 1. Find previous appointment: latest one that ends at or before target start
  const previous = paAppointments
    .filter(a => timeToMinutes(a.startTime) < targetStartMin)
    .sort((a, b) => timeToMinutes(b.startTime) - timeToMinutes(a.startTime))[0] || null;

  // 2. Find next appointment: earliest one that starts at or after target end
  const next = paAppointments
    .filter(a => timeToMinutes(a.startTime) >= targetEndMin)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))[0] || null;

  let legToNewEvent: RouteTravelResult | null = null;
  let legFromNewEvent: RouteTravelResult | null = null;

  // Analyze Leg 1: Previous Appointment -> Target Location
  if (previous && previous.location && targetLocation) {
    const travel = await calculateDrivingTravel(previous.location, targetLocation);
    if (travel) {
      const prevEndMin = timeToMinutes(previous.endTime);
      const availableGapMin = targetStartMin - prevEndMin;
      const buffer = availableGapMin - travel.durationMinutes;

      let status: 'ok' | 'tight' | 'conflict' = 'ok';
      let statusMessage = `🟢 Margen óptimo: ${buffer} min libres`;

      if (buffer < 0) {
        status = 'conflict';
        statusMessage = `🔴 Conflicto: Faltan ${Math.abs(buffer)} min para llegar a tiempo`;
      } else if (buffer < 15) {
        status = 'tight';
        statusMessage = `🟡 Margen justo: Solo ${buffer} min de buffer`;
      }

      legToNewEvent = {
        originAddress: previous.location,
        destinationAddress: targetLocation,
        distanceMiles: travel.distanceMiles,
        durationMinutes: travel.durationMinutes,
        durationFormatted: `${travel.durationMinutes} min (${travel.distanceMiles} mi)`,
        status,
        statusMessage,
        googleMapsUrl: buildGoogleMapsRouteUrl(previous.location, targetLocation)
      };
    }
  }

  // Analyze Leg 2: Target Location -> Next Appointment
  if (next && next.location && targetLocation) {
    const travel = await calculateDrivingTravel(targetLocation, next.location);
    if (travel) {
      const nextStartMin = timeToMinutes(next.startTime);
      const availableGapMin = nextStartMin - targetEndMin;
      const buffer = availableGapMin - travel.durationMinutes;

      let status: 'ok' | 'tight' | 'conflict' = 'ok';
      let statusMessage = `🟢 Margen óptimo: ${buffer} min libres`;

      if (buffer < 0) {
        status = 'conflict';
        statusMessage = `🔴 Conflicto: Llegará con ${Math.abs(buffer)} min de retraso`;
      } else if (buffer < 15) {
        status = 'tight';
        statusMessage = `🟡 Margen justo: Solo ${buffer} min de buffer`;
      }

      legFromNewEvent = {
        originAddress: targetLocation,
        destinationAddress: next.location,
        distanceMiles: travel.distanceMiles,
        durationMinutes: travel.durationMinutes,
        durationFormatted: `${travel.durationMinutes} min (${travel.distanceMiles} mi)`,
        status,
        statusMessage,
        googleMapsUrl: buildGoogleMapsRouteUrl(targetLocation, next.location)
      };
    }
  }

  // Determine overall feasibility
  let overallFeasibility: 'optimal' | 'warning' | 'conflict' | 'standalone' = 'standalone';
  let summaryMessage = 'No hay citas previas ni posteriores ese día (Ruta libre).';

  if (legToNewEvent?.status === 'conflict' || legFromNewEvent?.status === 'conflict') {
    overallFeasibility = 'conflict';
    summaryMessage = '⚠️ Conflicto de transporte: El PA no tendrá tiempo suficiente para desplazarse.';
  } else if (legToNewEvent?.status === 'tight' || legFromNewEvent?.status === 'tight') {
    overallFeasibility = 'warning';
    summaryMessage = '⚠️ Margen de transporte ajustado (menos de 15 min de buffer).';
  } else if (legToNewEvent || legFromNewEvent) {
    overallFeasibility = 'optimal';
    summaryMessage = '✓ Los tiempos de traslado de ida y vuelta son viables con buen margen.';
  }

  return {
    previousAppointment: previous,
    nextAppointment: next,
    legToNewEvent,
    legFromNewEvent,
    overallFeasibility,
    summaryMessage
  };
}

function timeToMinutes(timeStr?: string | null): number {
  if (!timeStr) return 0;
  const parts = timeStr.slice(0, 5).split(':');
  if (parts.length < 2) return 0;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/**
 * Extracts a concise city name or neighborhood label from an address.
 */
export function getShortLocationLabel(address?: string | null): string {
  if (!address) return 'Sin dirección';
  const clean = address.replace(/\s+/g, ' ').trim();
  
  // Try matching City, FL
  const cityMatch = clean.match(/,\s*([A-Za-z\s]+),\s*(?:FL|Florida)/i);
  if (cityMatch && cityMatch[1]) {
    return cityMatch[1].trim();
  }

  // Fallback to known Florida city search
  const city = extractCityFromAddress(clean);
  if (city) {
    return city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // Fallback to first address fragment
  return clean.split(',')[0].slice(0, 20);
}

/**
 * Calculates transit leg information between two locations with buffer and feasibility.
 */
export async function calculateLegTransit(
  fromLocation: string,
  toLocation: string,
  gapMinutes: number,
  fromEventId = '',
  toEventId = ''
): Promise<TransitLegInfo | null> {
  if (!fromLocation || !toLocation) return null;
  const travel = await calculateDrivingTravel(fromLocation, toLocation);
  if (!travel) return null;

  const bufferMinutes = gapMinutes - travel.durationMinutes;
  let status: 'ok' | 'tight' | 'conflict' = 'ok';
  if (bufferMinutes < 0) {
    status = 'conflict';
  } else if (bufferMinutes <= 15) {
    status = 'tight';
  }

  return {
    key: `${fromEventId || fromLocation}->${toEventId || toLocation}`,
    fromEventId,
    toEventId,
    fromLocation,
    toLocation,
    fromCity: getShortLocationLabel(fromLocation),
    toCity: getShortLocationLabel(toLocation),
    durationMinutes: travel.durationMinutes,
    durationFormatted: `${travel.durationMinutes} min`,
    distanceMiles: travel.distanceMiles,
    gapMinutes,
    bufferMinutes,
    status,
    googleMapsUrl: buildGoogleMapsRouteUrl(fromLocation, toLocation)
  };
}

