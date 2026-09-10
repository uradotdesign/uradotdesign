import type { APIRoute } from "astro";
import { getClientIp, rateLimit } from "../../lib/http.ts";
import { getWeather, WeatherLocationSchema, weatherCacheTTL } from "../../lib/weather.ts";

const WEATHER_RATE_LIMIT = 30;
const WEATHER_RATE_WINDOW_SECONDS = 60;

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
    const parsed = WeatherLocationSchema.safeParse(url.searchParams.get("location"));
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
    if (!weather) throw new Error("Weather is not configured");

    return new Response(JSON.stringify(weather), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${weatherCacheTTL()}`,
      },
    });
  } catch (error) {
    // Log detail server-side; return a generic message.
    console.error("Weather API error:", error);

    return new Response(
      JSON.stringify({ error: "Failed to fetch weather data" }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  }
};
