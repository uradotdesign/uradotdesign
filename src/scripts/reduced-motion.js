export const prefersReducedMotion = () =>
  document.documentElement.dataset.reduceMotion === 'true' || matchMedia('(prefers-reduced-motion: reduce)').matches;

export function watchReducedMotion(onChange) {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const change = () => onChange(prefersReducedMotion());
  media.addEventListener('change', change);
  const observer = new MutationObserver(change);
  observer.observe(document.documentElement, {attributes:true, attributeFilter:['data-reduce-motion']});
  return () => { media.removeEventListener('change', change); observer.disconnect(); };
}
