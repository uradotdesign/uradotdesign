/** Actual tab stops, including details summaries but excluding closed content. */
export function visibleTabStops(root) {
  return [...root.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]')].filter(el =>
    el.tabIndex >= 0 && !el.disabled && !el.closest('[inert]') &&
    el.checkVisibility({checkOpacity:true, checkVisibilityCSS:true}) &&
    ![...el.parentElement.closest('details:not([open])')?.children || []].some(child => child.tagName !== 'SUMMARY' && child.contains(el))
  );
}
