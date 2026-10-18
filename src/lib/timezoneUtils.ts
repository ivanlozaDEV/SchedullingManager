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
