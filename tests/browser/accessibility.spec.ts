import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");

test.beforeEach(async ({ context }) => {
  // Defensive: these checks do not send mail or create content.
  await context.route("**/*", route => ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort());
});

for (const theme of ["light", "dark"] as const) for (const width of [1280, 640, 320]) {
  test(`${theme} ${width}px: names, semantics and reflow`, async ({ page, context }, info) => {
    test.skip(info.project.name === "webkit-mobile" && width === 1280, "Mobile WebKit uses narrow viewports.");
    await context.addInitScript(value => localStorage.setItem("theme", value), theme);
    await page.setViewportSize({ width, height: Math.round(1024 * width / 1280) });
    for (const path of ["/en", "/de", "/en/about", "/de/blog", "/en/works", "/en/work/reset-tech", "/en/forensic-audit", "/en/blog/against-user-error", "/de/qa-missing-page"]) {
      const response = await page.goto(path, { waitUntil: "networkidle" });
      expect(response?.status(), path).toBe(path.includes("qa-missing-page") ? 404 : 200);
      await page.addScriptTag({ path: axePath });
      const result = await page.evaluate(async () => {
        const audit = await (window as any).axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] },
        });
        return {
          violations: audit.violations.map((v: any) => ({ id: v.id, nodes: v.nodes.map((n: any) => ({ target: n.target, summary: n.failureSummary })) })),
          overflow: document.documentElement.scrollWidth - innerWidth,
        };
      });
      expect.soft(result.violations, `${path} automated accessibility`).toEqual([]);
      expect.soft(result.overflow, `${path} document overflow`).toBeLessThanOrEqual(1);
    }
  });
}

test("mobile menu, contact and profile preserve accessible state", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/en", { waitUntil: "networkidle" });
  await page.locator("#mobile-menu-toggle").click();
  await expect(page.locator("#mobile-menu-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#mobile-menu-overlay")).toHaveAttribute("aria-hidden", "false");
  await page.keyboard.press("Escape");
  await expect(page.locator("#mobile-menu-toggle")).toBeFocused();
  await expect(page.locator("#mobile-menu-overlay")).toHaveAttribute("aria-hidden", "true");
  await page.goto("/en#contact-modal", { waitUntil: "networkidle" });
  await expect(page.locator("#contact-modal")).toHaveAttribute("aria-hidden", "false");
  await page.addScriptTag({ path: axePath });
  const dialogIssues = await page.evaluate(async () => (await (window as any).axe.run("#contact-modal")).violations.map((v: any) => ({ id: v.id, nodes: v.nodes.map((n: any) => n.target) })));
  expect(dialogIssues).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.locator("#contact-modal")).toHaveAttribute("aria-hidden", "true");
  await page.goto("/en/about", { waitUntil: "networkidle" });
  const profile = page.locator(".card-front").first();
  await profile.click();
  await expect(page.locator(".team-card.active [role=dialog]")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator(".team-card.active .team-card-close")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(profile).toBeFocused();
});
