/** Weather from Open-Meteo, called from the browser so the location never reaches Drape's server. */
export interface Weather { temp_c: number; label: string; fetched_at: number }
const KEY = 'drape.weather'

const CODES: [number[], string][] = [
  [[0], 'clear'], [[1, 2], 'partly cloudy'], [[3], 'cloudy'], [[45, 48], 'foggy'],
  [[51, 53, 55, 56, 57], 'drizzle'], [[61, 63, 65, 66, 67, 80, 81, 82], 'rain'], [[71, 73, 75, 77, 85, 86], 'snow'], [[95, 96, 99], 'storms'],
]

export function cachedWeather(): Weather | null {
  try {
    const w = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Weather | null
    return w && Date.now() - w.fetched_at < 3 * 3600_000 ? w : null
  } catch {
    return null
  }
}

export function clearWeather() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function fetchWeather(): Promise<Weather> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser cannot share a location. Suggestions work without weather.'))
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude.toFixed(2)
          const lon = pos.coords.longitude.toFixed(2)
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`)
          if (!res.ok) throw new Error()
          const data = await res.json()
          const code = Number(data.current?.weather_code ?? 0)
          const w: Weather = {
            temp_c: Number(data.current?.temperature_2m),
            label: CODES.find(([codes]) => codes.includes(code))?.[1] ?? 'mixed',
            fetched_at: Date.now(),
          }
          try {
            sessionStorage.setItem(KEY, JSON.stringify(w))
          } catch {
            /* ignore */
          }
          resolve(w)
        } catch {
          reject(new Error('The weather service did not answer. Suggestions work without weather.'))
        }
      },
      () => reject(new Error('Location was not shared, so weather is off. You can turn it on in your browser settings.')),
      { timeout: 10000, maximumAge: 1800000 },
    )
  })
}
