import type { APIRoute } from "astro";
import { z } from "zod";
import { getRedisClient } from "../../lib/redis";
import { getClientIp } from "../../lib/http";
import {
  directusUrl as DIRECTUS_URL,
  directusToken as DIRECTUS_TOKEN,
} from "../../lib/config";

// Fallback in-memory rate limiting (per IP), used only when Redis is unavailable.
const submissionTimestamps = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms
const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour in seconds
const MAX_SUBMISSIONS_PER_WINDOW = 3; // Max 3 submissions per hour per IP
const DIRECTUS_TIMEOUT_MS = 8000;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Bounds every field and strips unknown keys, so a client can never set
// server-controlled columns (status, ip_address) via the request body.
const ContactSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().trim().max(254).regex(EMAIL_REGEX),
  message: z.string().trim().min(1).max(5000),
  phone: z.string().trim().max(50).optional(),
  contact_preference: z.string().trim().max(50).optional(),
  language: z.string().trim().max(10).optional(),
  user_agent: z.string().max(1000).optional(),
  // Anti-spam fields
  website: z.string().max(200).optional(), // honeypot
  timestamp: z.number().optional(),
});

const jsonResponse = (
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {}
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });

// Returned for genuine success and for silently-dropped spam (to fool bots).
const successResponse = () =>
  jsonResponse(
    { success: true, message: "Your message has been sent successfully!" },
    200
  );

export const POST: APIRoute = async ({ request }) => {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonResponse(
        { success: false, error: "Invalid request body." },
        400
      );
    }

    const parsed = ContactSchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonResponse(
        {
          success: false,
          error: "Please check the form fields and try again.",
        },
        400
      );
    }
    const data = parsed.data;

    // SPAM PROTECTION 1: Honeypot field check.
    if (data.website && data.website.trim() !== "") {
      console.log("🚫 Spam blocked: Honeypot field filled");
      return successResponse();
    }

    // SPAM PROTECTION 2: Timestamp check (form filled too quickly).
    if (data.timestamp) {
      const timeTaken = Date.now() - data.timestamp;
      const MIN_TIME = 3000; // Must take at least 3 seconds to fill the form.
      if (timeTaken < MIN_TIME) {
        console.log(
          `🚫 Spam blocked: Form submitted too quickly (${timeTaken}ms)`
        );
        return successResponse();
      }
    }

    const clientIP = getClientIp(request);

    // SPAM PROTECTION 3: Rate limiting (Redis, with in-memory fallback).
    let rateLimited = false;
    try {
      const redis = getRedisClient();
      const key = `rate_limit:contact:${clientIP}`;
      const currentCount = await redis.incr(key);
      if (currentCount === 1) {
        await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
      }
      if (currentCount > MAX_SUBMISSIONS_PER_WINDOW) {
        rateLimited = true;
      }
    } catch (redisError) {
      console.warn(
        "Redis rate limit check failed, falling back to memory:",
        redisError
      );
      const now = Date.now();
      const ipSubmissions = submissionTimestamps.get(clientIP) || [];
      const recentSubmissions = ipSubmissions.filter(
        (timestamp) => now - timestamp < RATE_LIMIT_WINDOW
      );
      if (recentSubmissions.length >= MAX_SUBMISSIONS_PER_WINDOW) {
        rateLimited = true;
      } else {
        recentSubmissions.push(now);
        submissionTimestamps.set(clientIP, recentSubmissions);
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
      return jsonResponse(
        {
          success: false,
          error: "Too many submissions. Please try again later.",
        },
        429,
        { "Retry-After": "3600" }
      );
    }

    // SPAM PROTECTION 4: Content validation.
    const suspiciousPatterns = [
      /\b(viagra|cialis|casino|lottery|prize|winner)\b/i,
      /http[s]?:\/\/.*http[s]?:\/\//i, // Multiple URLs
      /<script|<iframe|javascript:/i, // XSS attempts
    ];
    const contentToCheck = `${data.message} ${data.first_name} ${data.last_name}`;
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(contentToCheck)) {
        console.log("🚫 Spam blocked: Suspicious content detected");
        return successResponse();
      }
    }

    // Build the submission with server-controlled fields (never from the body).
    const submissionData = {
      status: "new",
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone || null,
      contact_preference: data.contact_preference || "email",
      message: data.message,
      language: data.language || "en",
      user_agent: data.user_agent || null,
      ip_address: clientIP,
    };

    console.log("📤 Submitting contact form for:", submissionData.email);

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
        signal: AbortSignal.timeout(DIRECTUS_TIMEOUT_MS),
      }
    );

    console.log(
      "📥 Directus response:",
      directusResponse.status,
      directusResponse.statusText
    );

    if (!directusResponse.ok) {
      // Log the upstream detail server-side; return a generic message.
      let errorData: unknown;
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

      return jsonResponse(
        {
          success: false,
          error: "Failed to submit form. Please try again later.",
        },
        500
      );
    }

    // Public role can't read submissions back, so don't parse the response.
    return successResponse();
  } catch (error) {
    // Log full detail server-side; never leak internals (parse/DNS/timeout) out.
    console.error("Contact API error:", error);
    return jsonResponse(
      { success: false, error: "Something went wrong. Please try again later." },
      500
    );
  }
};
