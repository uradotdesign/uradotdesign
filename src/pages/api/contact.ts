import type { APIRoute } from "astro";
import { getRedisClient } from "../../lib/redis";

const DIRECTUS_URL =
  import.meta.env.DIRECTUS_URL ||
  import.meta.env.PUBLIC_DIRECTUS_URL ||
  "http://localhost:8055";
const DIRECTUS_TOKEN =
  import.meta.env.DIRECTUS_TOKEN || import.meta.env.DIRECTUS_API_TOKEN || "";

// Fallback in-memory rate limiting (per IP)
const submissionTimestamps = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms
const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour in seconds
const MAX_SUBMISSIONS_PER_WINDOW = 3; // Max 3 submissions per hour per IP

export const POST: APIRoute = async ({ request }) => {
  try {
    // Parse request body
    const body = await request.json();

    // Validate required fields
    if (!body.first_name || !body.last_name || !body.email || !body.message) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid email format",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // SPAM PROTECTION 1: Honeypot field check
    // If the "website" field is filled, it's likely a bot
    if (body.website && body.website.trim() !== "") {
      console.log("🚫 Spam blocked: Honeypot field filled");
      // Return success to fool bots
      return new Response(
        JSON.stringify({
          success: true,
          message: "Your message has been sent successfully!",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // SPAM PROTECTION 2: Timestamp check (form filled too quickly)
    if (body.timestamp) {
      const timeTaken = Date.now() - body.timestamp;
      const MIN_TIME = 3000; // Must take at least 3 seconds to fill form
      if (timeTaken < MIN_TIME) {
        console.log(
          `🚫 Spam blocked: Form submitted too quickly (${timeTaken}ms)`
        );
        return new Response(
          JSON.stringify({
            success: true,
            message: "Your message has been sent successfully!",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }
    }

    // Get client IP (for spam detection)
    const clientIP =
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // SPAM PROTECTION 3: Rate limiting
    let rateLimited = false;
    
    try {
      // Try Redis first
      const redis = getRedisClient();
      const key = `rate_limit:contact:${clientIP}`;
      
      // Increment count
      const currentCount = await redis.incr(key);
      
      // Set expiry on first request
      if (currentCount === 1) {
        await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
      }
      
      if (currentCount > MAX_SUBMISSIONS_PER_WINDOW) {
        rateLimited = true;
      }
    } catch (redisError) {
      // Fallback to in-memory if Redis fails
      console.warn("Redis rate limit check failed, falling back to memory:", redisError);
      
    const now = Date.now();
    const ipSubmissions = submissionTimestamps.get(clientIP) || [];

    // Remove old submissions outside the window
    const recentSubmissions = ipSubmissions.filter(
      (timestamp) => now - timestamp < RATE_LIMIT_WINDOW
    );

    if (recentSubmissions.length >= MAX_SUBMISSIONS_PER_WINDOW) {
        rateLimited = true;
      } else {
        // Add current submission timestamp
        recentSubmissions.push(now);
        submissionTimestamps.set(clientIP, recentSubmissions);
        
        // Clean up old entries periodically
        if (submissionTimestamps.size > 100) {
          for (const [ip, timestamps] of submissionTimestamps.entries()) {
            const validTimestamps = timestamps.filter(
              (t) => now - t < RATE_LIMIT_WINDOW
            );
            if (validTimestamps.length === 0) {
              submissionTimestamps.delete(ip);
            } else {
              submissionTimestamps.set(ip, validTimestamps);
            }
          }
        }
      }
    }

    if (rateLimited) {
      console.log(`🚫 Rate limit exceeded for IP: ${clientIP}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Too many submissions. Please try again later.",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "3600", // 1 hour
          },
        }
      );
    }

    // SPAM PROTECTION 4: Content validation
    const suspiciousPatterns = [
      /\b(viagra|cialis|casino|lottery|prize|winner)\b/i,
      /http[s]?:\/\/.*http[s]?:\/\//i, // Multiple URLs
      /<script|<iframe|javascript:/i, // XSS attempts
    ];

    const contentToCheck = `${body.message} ${body.first_name} ${body.last_name}`;
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(contentToCheck)) {
        console.log(`🚫 Spam blocked: Suspicious content detected`);
        // Return success to fool spammers
        return new Response(
          JSON.stringify({
            success: true,
            message: "Your message has been sent successfully!",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }
    }

    // Prepare submission data
    const submissionData = {
      status: "new",
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email,
      phone: body.phone || null,
      contact_preference: body.contact_preference || "email",
      message: body.message,
      language: body.language || "en",
      user_agent: body.user_agent || null,
      ip_address: clientIP,
    };

    console.log("📤 Submitting to Directus:", submissionData);

    // Submit to Directus
    const directusResponse = await fetch(
      `${DIRECTUS_URL}/items/contact_submissions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(DIRECTUS_TOKEN
            ? { Authorization: `Bearer ${DIRECTUS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(submissionData),
      }
    );

    console.log(
      "📥 Directus response:",
      directusResponse.status,
      directusResponse.statusText
    );

    if (!directusResponse.ok) {
      // Try to get error details, but handle empty responses
      let errorData;
      const contentType = directusResponse.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        errorData = await directusResponse.json().catch(() => ({}));
      } else {
        errorData = {
          status: directusResponse.status,
          statusText: directusResponse.statusText,
        };
      }
      console.error("Directus submission error:", errorData);

      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to submit form",
          details: errorData,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Success - don't try to read the response as public role can't read back submissions
    return new Response(
      JSON.stringify({
        success: true,
        message: "Your message has been sent successfully!",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Contact API error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
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
