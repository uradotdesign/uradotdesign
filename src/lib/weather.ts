import { z } from "zod";
import { remember } from "./redis.ts";

export const WeatherLocationSchema = z.string().trim().min(1).max(64)
  .regex(/^[\p{L}\p{M}\s.,'-]+$/u);

const UpstreamWeatherSchema = z.object({
  name: z.string(),
  main: z.object({ temp: z.number(), humidity: z.number() }),
  weather: z.array(z.object({
    main: z.string(), icon: z.string().regex(/^\d{2}[dn]$/), description: z.string(),
  })).min(1),
  wind: z.object({ speed: z.number() }),
});

export function weatherCacheTTL() {
  const value = Number(process.env.WEATHER_CACHE_TTL ?? import.meta.env?.WEATHER_CACHE_TTL ?? 900);
  return Number.isSafeInteger(value) && value >= 60 && value <= 86400 ? value : 900;
}

async function fetchWeather(location: string, apiKey: string) {
  const url = new URL("https://api.openweathermap.org/data/2.5/weather");
  url.search = new URLSearchParams({ q: location, appid: apiKey, units: "metric" }).toString();
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch {
    // Fetch errors may contain the credential-bearing URL. Keep it out of logs.
    throw new Error("Weather provider unavailable");
  }
  if (!response.ok) throw new Error(`Weather provider returned ${response.status}`);
  const parsed = UpstreamWeatherSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Weather provider returned invalid data");
  const data = parsed.data;
  return {
    location: data.name,
    temperature: Math.round(data.main.temp * 10) / 10,
    condition: data.weather[0].main,
    icon: data.weather[0].icon,
    description: data.weather[0].description,
    humidity: data.main.humidity,
    windSpeed: data.wind.speed,
    timestamp: Date.now(),
  };
}

export async function getWeather(input: string) {
  const location = WeatherLocationSchema.parse(input);
  const apiKey = process.env.OPENWEATHER_API_KEY ?? import.meta.env?.OPENWEATHER_API_KEY;
  if (!apiKey || apiKey === "get_your_key_at_openweathermap.org") return null;
  // New namespace excludes old cache entries containing fabricated fallback data.
  return remember(location.toLowerCase(), () => fetchWeather(location, apiKey), {
    ttl: weatherCacheTTL(), namespace: "weather:v2",
  });
}
