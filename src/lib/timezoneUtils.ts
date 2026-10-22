/**
 * Timezone Detection & Conversion Utility
 * Handles Florida multi-timezone scheduling (Pensacola / Panhandle = CT, Miami / Rest of FL = ET)
 * and helps remote Virtual Assistants in Ecuador coordinate seamlessly without mental math.
 */

export type FloridaTimezone = 'CT' | 'ET';

// Central Time Florida ZIP prefixes (Escambia, Santa Rosa, Okaloosa, Walton, Bay, etc.)
const CT_ZIP_PREFIXES = ['324', '325'];

// Key cities and localities in Florida Central Time
const CT_KEYWORDS = [
  'pensacola',
  'panama city',
  'destin',
  'fort walton',
  'ft walton',
  'ft. walton',
  'crestview',
  'milton',
  'navarre',
  'pace',
  'gulf breeze',
  'niceville',
  'defuniak',
  'marianna',
  'bonifay',
  'chipley',
  'cantonment',
  'santa rosa beach',
  'miramar beach',
  'perdido',
  'escambia',
  'okaloosa',
  'walton county',
  'bay county',
  'lynn haven',
  'valparaiso',
  'mary esther',
  'century',
  'molino',
  'molina', // Typo alias for Molino, FL
  'mexico beach',
  'wewahitchka',
  'port st joe',
  'port st. joe'
];

/**
 * Detects whether a property address belongs to Central Time (CT) or Eastern Time (ET).
 * Can inspect raw full-line address, city name, zip code, or notes.
 */
export function detectPropertyTimezone(addressOrText?: string, manualOverride?: FloridaTimezone | null): FloridaTimezone {
  if (manualOverride === 'CT' || manualOverride === 'ET') {
    return manualOverride;
  }

  if (!addressOrText) return 'ET';

  // Check for explicit tag like [Timezone: CT] or [Timezone: ET]
  const tagMatch = addressOrText.match(/\[Timezone:\s*(CT|ET)\]/i);
  if (tagMatch) {
    return tagMatch[1].toUpperCase() as FloridaTimezone;
  }

  const text = addressOrText.toLowerCase();

  // 1. Check for 5-digit ZIP codes starting with 324 or 325 anywhere in text
  for (const prefix of CT_ZIP_PREFIXES) {
    const zipRegex = new RegExp(`\\b${prefix}\\d{2}\\b`);
    if (zipRegex.test(text)) {
      return 'CT';
    }
  }

  // 2. Check for city / locality keywords anywhere in text
  for (const kw of CT_KEYWORDS) {
    if (text.includes(kw)) {
      return 'CT';
    }
  }

  // Default to Eastern Time (Miami / Orlando / Tampa / Jacksonville / Rest of FL)
  return 'ET';
}

/**
 * Cleans an address string:
 * - Fixes common typos like "Molina" -> "Molino" for FL 32577
 * - Removes erroneous trailing ", Miami, FL" fallback attachments when the address is in another city
 * - Eliminates duplicate parts (e.g. "... Gulf Breeze, FL 32563, Gulf Breeze, FL 32563")
 */
export function cleanAddress(rawAddress?: string): string {
  if (!rawAddress) return '';
  let cleaned = rawAddress.trim();

  // 1. Correct typo "Molina" -> "Molino" for Florida Panhandle addresses
  cleaned = cleaned.replace(/\bMolina\b/gi, 'Molino');

  // 2. Remove duplicate trailing city/state/zip repeats:
  // e.g. "..., City, FL 32563, City, FL 32563"
  const dupRepeatRegex = /^(.*?)(?:,\s*([^,]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?))(?:,\s*\2)+$/i;
  const dupMatch = cleaned.match(dupRepeatRegex);
  if (dupMatch) {
    cleaned = `${dupMatch[1]}, ${dupMatch[2]}`.replace(/^,\s*/, '').trim();
  }

  // 3. Remove erroneous trailing ", Miami, FL" if the preceding text already mentions another city or non-Miami zip code
  if (cleaned.toLowerCase().endsWith(', miami, fl') && !cleaned.toLowerCase().startsWith('miami')) {
    const withoutMiami = cleaned.slice(0, -11).trim();
    if (
      /,\s*[A-Z]{2}\b/i.test(withoutMiami) ||
      /\b\d{5}\b/.test(withoutMiami) ||
      CT_KEYWORDS.some((kw) => withoutMiami.toLowerCase().includes(kw))
    ) {
      cleaned = withoutMiami;
    }
  }

  // 4. Remove duplicate city/state repeats like "... City, FL, City, FL"
  const parts = cleaned.split(',').map((s) => s.trim());
  if (parts.length >= 4) {
    const lastTwo = parts.slice(-2).join(', ').toLowerCase();
    const prevTwo = parts.slice(-4, -2).join(', ').toLowerCase();
    if (lastTwo === prevTwo) {
      cleaned = parts.slice(0, -2).join(', ');
    }
  }

  return cleaned.replace(/,\s*,/g, ',').trim();
}

/**
 * Combines street address, city, state, zip cleanly without duplicates.
 * If street already contains city, state or zip, avoids duplicating them.
 */
export function formatFullAddress(
  street?: string,
  city?: string,
  state: string = 'FL',
  zip?: string
): string {
  const cleanStreet = cleanAddress(street);
  if (!cleanStreet) {
    const parts = [city, state, zip].filter(Boolean);
    return parts.join(', ');
  }

  const lowerStreet = cleanStreet.toLowerCase();

  // If cleanStreet already has state and zip or already has the city, don't append
  const hasState = /\b(fl|florida)\b/i.test(lowerStreet);
  const hasZip = zip ? lowerStreet.includes(zip.toLowerCase()) : /\b\d{5}\b/.test(lowerStreet);
  const hasCity = city ? lowerStreet.includes(city.toLowerCase().trim()) : false;

  if (hasState && (hasZip || hasCity)) {
    return cleanStreet;
  }

  const extraParts: string[] = [];
  if (city && !hasCity && city.toLowerCase() !== 'miami') {
    extraParts.push(city.trim());
  }
  if (!hasState && state) {
    extraParts.push(state.trim());
  }
  let result = cleanStreet;
  if (extraParts.length > 0) {
    result += `, ${extraParts.join(', ')}`;
  }
  if (zip && !hasZip) {
    result += ` ${zip.trim()}`;
  }

  return cleanAddress(result);
}

/**
 * Converts a 24h time string (e.g. "09:00", "13:30") to standard 12h format ("9:00 AM", "1:30 PM")
 */
export function format12Hour(time24: string): string {
  if (!time24) return '';
  const clean = time24.slice(0, 5);
  const [hStr, mStr] = clean.split(':');
  const h = parseInt(hStr, 10);
  if (isNaN(h)) return time24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${mStr || '00'} ${ampm}`;
}

/**
 * Given a time in a source timezone, converts to target timezone.
 * Central Time (CT) is 1 hour behind Eastern Time (ET).
 * Miami is in Eastern Time (ET).
 */
export function convertTimeBetweenZones(time24: string, fromZone: FloridaTimezone, toZone: FloridaTimezone): string {
  if (!time24) return '';
  if (fromZone === toZone) return time24.slice(0, 5);

  const clean = time24.slice(0, 5);
  const [hStr, mStr] = clean.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';

  if (fromZone === 'CT' && toZone === 'ET') {
    // CT to ET: Add 1 hour
    h = (h + 1) % 24;
  } else if (fromZone === 'ET' && toZone === 'CT') {
    // ET to CT: Subtract 1 hour
    h = (h - 1 + 24) % 24;
  }

  return `${String(h).padStart(2, '0')}:${m}`;
}

/**
 * Returns formatted dual-timezone strings for displaying in UI cards and notifications.
 * Example for Pensacola (CT):
 * - propertyTime: "10:00 AM CT"
 * - miamiTime: "11:00 AM ET"
 * - displayLabel: "10:00 AM CT (11:00 AM Miami)"
 */
export function formatTimeWithDualTimezone(time24: string, propertyTimezone: FloridaTimezone) {
  const local12 = format12Hour(time24);
  if (!local12) return { propertyTime: '', miamiTime: '', displayLabel: '' };

  if (propertyTimezone === 'CT') {
    const miamiTime24 = convertTimeBetweenZones(time24, 'CT', 'ET');
    const miami12 = format12Hour(miamiTime24);
    return {
      propertyTime: `${local12} CT`,
      miamiTime: `${miami12} ET`,
      displayLabel: `${local12} CT (${miami12} Miami)`,
    };
  }

  return {
    propertyTime: `${local12} ET`,
    miamiTime: `${local12} ET`,
    displayLabel: `${local12} ET`,
  };
}

/**
 * Formats a time range (startTime to endTime) with dual timezone if property is in CT.
 * Example for Pensacola: "10:00 AM - 12:00 PM CT (11:00 AM - 1:00 PM Miami)"
 * Example for Miami: "10:00 AM - 12:00 PM ET"
 */
export function formatTimeRangeWithDualTimezone(
  startTime24: string,
  endTime24: string,
  propertyTimezone: FloridaTimezone
): {
  propertyRange: string;
  miamiRange: string;
  displayFull: string;
} {
  const startLocal = format12Hour(startTime24);
  const endLocal = format12Hour(endTime24);
  const propertyRange = `${startLocal} - ${endLocal} ${propertyTimezone}`;

  if (propertyTimezone === 'CT') {
    const startMiami = format12Hour(convertTimeBetweenZones(startTime24, 'CT', 'ET'));
    const endMiami = format12Hour(convertTimeBetweenZones(endTime24, 'CT', 'ET'));
    const miamiRange = `${startMiami} - ${endMiami} ET`;
    return {
      propertyRange,
      miamiRange,
      displayFull: `${propertyRange} (${miamiRange} Miami)`,
    };
  }

  return {
    propertyRange,
    miamiRange: propertyRange,
    displayFull: propertyRange,
  };
}

/**
 * Returns the IANA timezone identifier for iCalendar (.ics) exports
 */
export function getIcsTimezoneIdentifier(timezone: FloridaTimezone): string {
  return timezone === 'CT' ? 'America/Chicago' : 'America/New_York';
}

/**
 * Live Clocks for Coordinators:
 * Returns current formatted time in Ecuador, Miami (ET), and Pensacola (CT).
 */
export function getLiveOperatingTimes(): {
  ecuador: string;
  miami: string;
  pensacola: string;
  isPensacolaSameAsEcuador: boolean;
} {
  const now = new Date();

  const options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  const ecuador = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'America/Guayaquil' }).format(now);
  const miami = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'America/New_York' }).format(now);
  const pensacola = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'America/Chicago' }).format(now);

  return {
    ecuador,
    miami,
    pensacola,
    isPensacolaSameAsEcuador: ecuador === pensacola,
  };
}

const FLORIDA_CITIES = [
  // Central Time (CT)
  'pensacola', 'panama city', 'destin', 'fort walton beach', 'fort walton', 'ft walton',
  'crestview', 'milton', 'navarre', 'pace', 'gulf breeze', 'niceville', 'defuniak springs',
  'defuniak', 'marianna', 'bonifay', 'chipley', 'cantonment', 'santa rosa beach',
  'miramar beach', 'perdido', 'lynn haven', 'valparaiso', 'mary esther', 'century',
  'molino', 'mexico beach', 'wewahitchka', 'port st joe', 'port st. joe',
  // Eastern Time (ET)
  'miami beach', 'miami lakes', 'miami gardens', 'miami shores', 'north miami', 'south miami', 'miami',
  'fort lauderdale', 'ft lauderdale', 'pompano beach', 'hollywood', 'coral gables', 'doral', 'hialeah',
  'homestead', 'kendall', 'aventura', 'hallandale', 'davie', 'plantation', 'sunrise', 'coral springs',
  'pembroke pines', 'miramar', 'deerfield beach', 'west palm beach', 'boca raton', 'delray beach',
  'boynton beach', 'jupiter', 'wellington', 'lake worth', 'palm beach gardens', 'port st lucie',
  'port saint lucie', 'fort pierce', 'stuart', 'vero beach', 'sebastian', 'tampa', 'st petersburg',
  'st. petersburg', 'clearwater', 'largo', 'pinellas park', 'brandon', 'orlando', 'kissimmee',
  'sanford', 'altamonte springs', 'winter park', 'winter haven', 'jacksonville', 'st augustine',
  'st. augustine', 'orange park', 'tallahassee', 'gainesville', 'ocala', 'fort myers', 'ft myers',
  'cape coral', 'naples', 'marco island', 'bonita springs', 'estero', 'sarasota', 'bradenton',
  'venice', 'lakeland', 'daytona beach', 'ormond beach', 'deltona', 'port orange'
];

/**
 * Formats a city name into clean Title Case (e.g. "molino" -> "Molino", "fort lauderdale" -> "Fort Lauderdale")
 */
export function formatCityTitleCase(rawCity: string): string {
  if (!rawCity) return '';
  return rawCity
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      if (word === 'ft' || word === 'ft.') return 'Ft.';
      if (word === 'st' || word === 'st.') return 'St.';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Resolves the property city name dynamically from claim.city or address.
 * Prioritizes the real city of the property (e.g. Molino, Tampa, Miami Beach)
 * instead of hardcoding Pensacola or Miami.
 */
export function resolveCityName(
  city?: string | null,
  address?: string | null,
  timezone: FloridaTimezone = 'ET'
): string {
  // 1. If explicit city provided, ensure it's not a full street address
  if (city && city.trim()) {
    const c = city.trim();
    if (!/\d{3,}/.test(c) && !/,\s*fl\b/i.test(c)) {
      return formatCityTitleCase(c);
    }
  }

  // 2. Search in combined text (city + address) for known city keywords (longest first)
  const combined = `${city || ''} ${address || ''}`.trim();
  if (combined) {
    const lower = combined.toLowerCase();
    const sortedCities = [...FLORIDA_CITIES].sort((a, b) => b.length - a.length);
    for (const kw of sortedCities) {
      const regex = new RegExp(`\\b${kw.replace('.', '\\.')}\\b`, 'i');
      if (regex.test(lower)) {
        return formatCityTitleCase(kw);
      }
    }

    // 3. Fallback: match standard US address pattern: "..., <City>, FL <ZIP>"
    const addrMatch = combined.match(/,\s*([A-Za-z\s.]+?),\s*(?:FL|Florida)\b/i);
    if (addrMatch) {
      const candidate = addrMatch[1].trim();
      if (candidate.length > 2 && !/\d/.test(candidate)) {
        return formatCityTitleCase(candidate);
      }
    }
  }

  // 4. Default timezone fallback
  return timezone === 'CT' ? 'Pensacola' : 'Miami';
}

/**
 * Formats a time range with explicit city timezone for email subjects.
 * Takes the actual city from the address (e.g. "11:00 am to 1:00 pm Molino Time CT").
 */
export function formatTimeRangeForSubject(
  startTime24?: string,
  endTime24?: string,
  timezone: FloridaTimezone = 'ET',
  city?: string,
  address?: string
): string {
  if (!startTime24) return '';
  const cityName = resolveCityName(city, address, timezone);
  const tzCityLabel = `${cityName} Time ${timezone}`;
  const s12 = format12Hour(startTime24).toLowerCase();
  if (endTime24) {
    const e12 = format12Hour(endTime24).toLowerCase();
    return `${s12} to ${e12} ${tzCityLabel}`;
  }
  return `${s12} ${tzCityLabel}`;
}

export { formatUsDate } from './formatters';
