/** Run inside the Directus container: node --input-type=module - < this-file. */
const base = "http://127.0.0.1:8055";

async function main() {
  const login = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!login.ok)
    throw new Error(`CMS admin verification failed: HTTP ${login.status}`);
  const token = (await login.json()).data.access_token;
  const headers = { Authorization: `Bearer ${token}` };
  const response = await fetch(base + "/license", {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`Licence check failed: HTTP ${response.status}`);
  const licence = (await response.json()).data;
  if (
    licence.status !== "active" ||
    !licence.entitlements?.custom_permission_rules_enabled?.default
  ) {
    throw new Error(
      "An active licence with custom permission rules is required."
    );
  }
  if (process.argv.includes("--clear-cache")) {
    const cleared = await fetch(base + "/utils/cache/clear?system=true", {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!cleared.ok)
      throw new Error(`CMS cache purge failed: HTTP ${cleared.status}`);
  }
  // Do not print tokens, keys, user profiles, or raw error responses.
  console.log(
    `Directus licence active (${licence.name}); custom permissions enabled.`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
