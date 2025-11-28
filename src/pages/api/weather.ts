import type { APIRoute } from "astro";
import { remember } from "../../lib/redis";

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
  const apiKey = import.meta.env.OPENWEATHER_API_KEY;

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

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${apiKey}&units=metric`;

  const response = await fetch(url);

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

export const GET: APIRoute = async ({ url }) => {
  try {
    // Get location from query parameter
    const location = url.searchParams.get("location");

    if (!location) {
      return new Response(
        JSON.stringify({
          error: "Location parameter is required",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const weather = await getWeather(location);

    return new Response(JSON.stringify(weather), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${parseInt(import.meta.env.WEATHER_CACHE_TTL || "900")}`,
      },
    });
  } catch (error) {
    console.error("Weather API error:", error);

    return new Response(
      JSON.stringify({
        error: "Failed to fetch weather data",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
};
