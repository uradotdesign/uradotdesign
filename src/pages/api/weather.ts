import type { APIRoute } from "astro";
import { z } from "zod";
import { remember } from "../../lib/redis";
import { getClientIp, rateLimit } from "../../lib/http";

const WEATHER_FETCH_TIMEOUT_MS = 5000;
const WEATHER_RATE_LIMIT = 30; // requests
const WEATHER_RATE_WINDOW_SECONDS = 60; // per minute, per IP

// City names only: letters (incl. accents), spaces, and ,.'- separators.
const LocationSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[\p{L}\p{M}\s.,'-]+$/u);

interface WeatherData {
  location: string;
  temperature: number;
  condition: string;
  icon: string;
  description: string;
  humidity: number;
  windSpeed: number;
  timestamp: number;
}

async function fetchWeather(location: string): Promise<WeatherData> {
  // Use process.env for SSR runtime (import.meta.env doesn't work for non-PUBLIC_ vars in production)
  const apiKey =
    process.env.OPENWEATHER_API_KEY || import.meta.env.OPENWEATHER_API_KEY;

  // Development fallback data
  if (!apiKey || apiKey === "get_your_key_at_openweathermap.org") {
    console.warn("⚠️  Using mock weather data - API key not configured");
    return {
      location: location,
      temperature: 15.4,
      condition: "Clear",
      icon: "01d",
      description: "clear sky",
      humidity: 65,
      windSpeed: 3.5,
      timestamp: Date.now(),
    };
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(WEATHER_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    // If unauthorized, use mock data and warn
    if (response.status === 401) {
      console.warn(
        "⚠️  OpenWeatherMap API key not activated yet - using mock data"
      );
      console.warn("💡 New API keys can take up to 2 hours to activate");
      return {
        location: location,
        temperature: 15.4,
        condition: "Clear",
        icon: "01d",
        description: "clear sky",
        humidity: 65,
        windSpeed: 3.5,
        timestamp: Date.now(),
      };
    }
    throw new Error(`Weather API error: ${response.statusText}`);
  }

  const data = await response.json();

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

export async function getWeather(location: string) {
  const cacheKey = `weather:${location.toLowerCase()}`;
  const ttl = parseInt(import.meta.env.WEATHER_CACHE_TTL || "900"); // 15 minutes

  return remember(cacheKey, () => fetchWeather(location), {
    ttl,
    namespace: "weather",
  });
}

export const GET: APIRoute = async ({ url, request }) => {
  try {
    // Per-IP rate limit to bound upstream API cost and Redis key growth.
    const ip = getClientIp(request);
    const { limited } = await rateLimit(
      `rate_limit:weather:${ip}`,
      WEATHER_RATE_LIMIT,
      WEATHER_RATE_WINDOW_SECONDS
    );
    if (limited) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please slow down." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(WEATHER_RATE_WINDOW_SECONDS),
          },
        }
      );
    }

    // Validate the location: bounds length and restricts to city-name characters
    // so an attacker can't iterate unbounded distinct values.
    const parsed = LocationSchema.safeParse(url.searchParams.get("location"));
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "A valid location parameter is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const weather = await getWeather(parsed.data);

    return new Response(JSON.stringify(weather), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${parseInt(import.meta.env.WEATHER_CACHE_TTL || "900")}`,
      },
    });
  } catch (error) {
    // Log detail server-side; return a generic message.
    console.error("Weather API error:", error);

    return new Response(
      JSON.stringify({ error: "Failed to fetch weather data" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
};
