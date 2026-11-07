/**
 * Unit conversions for the address bar: "10 km in miles", "72 f to c", "5 lb to kg".
 * One number and two units of the same kind. Returns "10 km = 6.214 mi", or null.
 */
type Unit = { dim: string; factor: number; names: string[]; label: string }

const U: Unit[] = [
  // length (metres)
  { dim: 'len', factor: 0.001, names: ['mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres'], label: 'mm' },
  { dim: 'len', factor: 0.01, names: ['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'], label: 'cm' },
  { dim: 'len', factor: 1, names: ['m', 'meter', 'meters', 'metre', 'metres'], label: 'm' },
  { dim: 'len', factor: 1000, names: ['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres'], label: 'km' },
  { dim: 'len', factor: 0.0254, names: ['in', 'inch', 'inches'], label: 'in' },
  { dim: 'len', factor: 0.3048, names: ['ft', 'foot', 'feet'], label: 'ft' },
  { dim: 'len', factor: 0.9144, names: ['yd', 'yard', 'yards'], label: 'yd' },
  { dim: 'len', factor: 1609.344, names: ['mi', 'mile', 'miles'], label: 'mi' },
  // mass (grams)
  { dim: 'mass', factor: 1, names: ['g', 'gram', 'grams'], label: 'g' },
  { dim: 'mass', factor: 1000, names: ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'], label: 'kg' },
  { dim: 'mass', factor: 28.349523125, names: ['oz', 'ounce', 'ounces'], label: 'oz' },
  { dim: 'mass', factor: 453.59237, names: ['lb', 'lbs', 'pound', 'pounds'], label: 'lb' },
  { dim: 'mass', factor: 6350.29318, names: ['st', 'stone', 'stones'], label: 'st' },
  // volume (litres)
  { dim: 'vol', factor: 0.001, names: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'], label: 'ml' },
  { dim: 'vol', factor: 1, names: ['l', 'liter', 'liters', 'litre', 'litres'], label: 'L' },
  { dim: 'vol', factor: 3.785411784, names: ['gal', 'gallon', 'gallons'], label: 'gal (US)' },
  { dim: 'vol', factor: 0.0295735295625, names: ['floz', 'fl oz', 'fluid ounce', 'fluid ounces'], label: 'fl oz' },
  { dim: 'vol', factor: 0.2365882365, names: ['cup', 'cups'], label: 'cups' },
  // speed (metres per second)
  { dim: 'speed', factor: 1, names: ['m/s', 'mps'], label: 'm/s' },
  { dim: 'speed', factor: 1 / 3.6, names: ['km/h', 'kmh', 'kph'], label: 'km/h' },
  { dim: 'speed', factor: 0.44704, names: ['mph'], label: 'mph' },
  // data (bytes)
  { dim: 'data', factor: 1e3, names: ['kb', 'kilobyte', 'kilobytes'], label: 'KB' },
  { dim: 'data', factor: 1e6, names: ['mb', 'megabyte', 'megabytes'], label: 'MB' },
  { dim: 'data', factor: 1e9, names: ['gb', 'gigabyte', 'gigabytes'], label: 'GB' },
  { dim: 'data', factor: 1e12, names: ['tb', 'terabyte', 'terabytes'], label: 'TB' }
]

const TEMP: Record<'c' | 'f' | 'k', string[]> = {
  c: ['c', '°c', 'celsius', 'centigrade'],
  f: ['f', '°f', 'fahrenheit'],
  k: ['k', 'kelvin']
}

const find = (name: string): Unit | undefined => U.find((u) => u.names.includes(name))
const tempOf = (name: string): 'c' | 'f' | 'k' | undefined => (Object.keys(TEMP) as ('c' | 'f' | 'k')[]).find((k) => TEMP[k].includes(name))
const fmt = (v: number): string => String(Math.round(v * 1000) / 1000)

export function convertUnits(input: string): string | null {
  const m = input
    .trim()
    .toLowerCase()
    .match(/^(-?[\d.,]+)\s*([a-z°/ ]+?)\s+(?:to|in|as|into|=)\s+([a-z°/ ]+?)\s*$/)
  if (!m) return null
  const value = parseFloat(m[1].replace(/,/g, ''))
  if (!Number.isFinite(value)) return null
  const a = m[2].trim()
  const b = m[3].trim()
  const ta = tempOf(a)
  const tb = tempOf(b)
  if (ta && tb) {
    const c = ta === 'c' ? value : ta === 'f' ? ((value - 32) * 5) / 9 : value - 273.15
    const out = tb === 'c' ? c : tb === 'f' ? (c * 9) / 5 + 32 : c + 273.15
    return `${fmt(value)} °${ta.toUpperCase()} = ${fmt(out)} °${tb.toUpperCase()}`
  }
  const ua = find(a)
  const ub = find(b)
  if (!ua || !ub || ua.dim !== ub.dim) return null
  return `${fmt(value)} ${ua.label} = ${fmt((value * ua.factor) / ub.factor)} ${ub.label}`
}
