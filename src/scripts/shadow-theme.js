/**
 * Reflects the document's light/dark theme onto a shadow-DOM custom element as a
 * `data-theme` host attribute, so components can style with the cross-browser
 * `:host([data-theme="dark"])` selector instead of `:host-context()` (which is
 * unsupported in Firefox).
 *
 * @param {HTMLElement} host - the custom element to reflect the theme onto.
 * @returns {() => void} cleanup function to stop watching (call from disconnectedCallback).
 */
export function watchTheme(host) {
  const apply = (theme) => {
    const isDark =
      theme === "dark" ||
      (theme == null && document.documentElement.classList.contains("dark"));
    host.setAttribute("data-theme", isDark ? "dark" : "light");
  };
  apply();
  const onChange = (event) => apply(event?.detail?.theme);
  document.addEventListener("theme-changed", onChange);
  return () => document.removeEventListener("theme-changed", onChange);
}
