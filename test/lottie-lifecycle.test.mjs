import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { escapeHtml } from "../src/scripts/escape-html.js";
const definitions = new Map();
let loads = [],
  destroyed = 0,
  unwatched = 0,
  observersDisconnected = 0,
  reduce = false;
let resolvePlayer;
let playerReady;
const player = {
  loadAnimation: (options) => {
    loads.push(options);
    return {
      destroy() {
        destroyed++;
      },
      pause() {},
      play() {},
      stop() {},
    };
  },
};
globalThis.HTMLElement = class {
  isConnected = true;
  children = [];
  attachShadow() {
    this.shadowRoot = {
      addEventListener() {},
      querySelector() {
        return null;
      },
    };
  }
};
globalThis.customElements = {
  get: (name) => definitions.get(name),
  define: (name, value) => definitions.set(name, value),
};
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {
    observersDisconnected++;
  }
};
mock.module("../src/scripts/loadLottie.js", {
  namedExports: { loadLottie: () => playerReady },
});
mock.module("../src/scripts/shadow-theme.js", {
  namedExports: {
    watchTheme: () => () => {
      unwatched++;
    },
  },
});
mock.module("../src/scripts/reduced-motion.js", {
  namedExports: {
    prefersReducedMotion: () => reduce,
    watchReducedMotion: () => () => {
      unwatched++;
    },
  },
});
await import("../src/scripts/LottiePlayerGrid.js");
await import("../src/scripts/InteractiveShowcase.js");
const Grid = definitions.get("lottie-player-grid");
const Showcase = definitions.get("interactive-showcase");
const pending = () => {
  loads = [];
  destroyed = 0;
  unwatched = 0;
  playerReady = new Promise((resolve) => {
    resolvePlayer = resolve;
  });
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const lottieElement = {
  getAttribute: (key) =>
    key === "data-lottie-path" ? "/animation.json" : null,
};

test("detaching before the lazy player resolves creates no orphan animation; reconnect creates one", async () => {
  pending();
  const grid = new Grid();
  grid.render = () => {};
  grid.querySelectorAll = () => [lottieElement];
  grid.connectedCallback();
  grid.isConnected = false;
  grid.disconnectedCallback();
  resolvePlayer(player);
  await flush();
  assert.equal(loads.length, 0);
  assert.equal(unwatched, 2);
  reduce = true;
  grid.isConnected = true;
  grid.connectedCallback();
  await flush();
  assert.equal(loads.length, 1);
  assert.equal(loads[0].autoplay, false);
  grid.isConnected = false;
  grid.disconnectedCallback();
  assert.equal(destroyed, 1);
  assert.equal(grid.lottieInstances.length, 0);
  grid.isConnected = true;
  grid.connectedCallback();
  await flush();
  grid.isConnected = false;
  grid.disconnectedCallback();
  assert.equal(loads.length, 2);
  assert.equal(destroyed, 2);
});

test("showcase rejects late loads for detached or inactive tabs and destroys live instances", async () => {
  pending();
  reduce = false;
  const showcase = new Showcase();
  showcase.render = () => {};
  const container = {
    getAttribute: () => "active-visual",
    querySelectorAll: () => [lottieElement],
  };
  showcase.connectedCallback();
  const loading = showcase.initLottiesInContainer(container);
  showcase.isConnected = false;
  showcase.disconnectedCallback();
  resolvePlayer(player);
  await loading;
  assert.equal(loads.length, 0);
  assert.ok(observersDisconnected > 0);
  showcase.isConnected = true;
  showcase.connectedCallback();
  await showcase.initLottiesInContainer({
    ...container,
    getAttribute: () => null,
  });
  assert.equal(loads.length, 0);
  await showcase.initLottiesInContainer(container);
  await showcase.initLottiesInContainer(container);
  assert.equal(loads.length, 1);
  showcase.isConnected = false;
  showcase.disconnectedCallback();
  assert.equal(destroyed, 1);
  assert.equal(showcase.lottieInstances.size, 0);
});

test("showcase restores authored child wrappers for reconnection and cancels pending tab work", async () => {
  pending();
  const showcase = new Showcase();
  showcase.render = () => {};
  showcase.connectedCallback();
  const restored = [];
  const wrapper = {
    appendChild: (child) => restored.push(child),
    removeAttribute: () => {},
  };
  const desc = { removeAttribute: () => {} },
    visual = { removeAttribute: () => {} };
  showcase.items = [{ wrapper, desc, visual }];
  let switched = false;
  showcase._tabTimer = setTimeout(() => {
    switched = true;
  }, 10);
  showcase.isConnected = false;
  showcase.disconnectedCallback();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(switched, false);
  assert.deepEqual(restored, [desc, visual]);
  assert.equal(showcase.items.length, 0);
});

test("CMS animation control labels cannot become markup or escape attributes", () => {
  assert.equal(
    escapeHtml('" onmouseover="alert(1) <img>&'),
    "&quot; onmouseover=&quot;alert(1) &lt;img&gt;&amp;"
  );
});
