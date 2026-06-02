/**
 * Lazily loads `lottie-web` a single time and reuses the resolved player across
 * every caller. Multiple components (services grid, service steps, lottie grid,
 * interactive showcase) previously each ran their own `import('lottie-web')`;
 * sharing one cached promise avoids redundant module-init work and normalises
 * the default-vs-namespace export shape.
 *
 * @returns {Promise<any>} the lottie-web player (its default export).
 */
let lottiePromise = null;

export function loadLottie() {
  if (!lottiePromise) {
    lottiePromise = import("lottie-web").then((m) => m.default || m);
  }
  return lottiePromise;
}
