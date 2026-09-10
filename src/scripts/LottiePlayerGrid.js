import { escapeHtml } from "./escape-html.js";
import { watchTheme } from "./shadow-theme.js";
import { loadLottie } from "./loadLottie.js";
import { prefersReducedMotion, watchReducedMotion } from './reduced-motion.js';

class LottiePlayer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.lottieInstances = [];
  }

  connectedCallback() {
    this._generation = (this._generation || 0) + 1;
    this.render();
    this._unwatchTheme = watchTheme(this);
    this._unwatchMotion = watchReducedMotion(reduce => { if (reduce) this.pauseAll(); });
    this.initLottie();
  }

  disconnectedCallback() {
    this._generation++;
    this._unwatchTheme?.();
    this._unwatchMotion?.();
    this.lottieInstances.forEach(anim => anim.destroy());
    this.lottieInstances = [];
  }

  get controlsPosition() {
    return this.getAttribute("controls-position") || "bottom";
  }

  get labelPlay() {
    return this.getAttribute("label-play") || "Play all";
  }

  get labelPause() {
    return this.getAttribute("label-pause") || "Pause all";
  }

  get labelStop() {
    return this.getAttribute("label-stop") || "Stop all";
  }

  render() {
    const isVertical = this.controlsPosition === "right";

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          font-family: var(--font-sans, 'Instrument Sans', sans-serif);
        }

        .container {
          position: relative;
          max-width: 100%;
          padding: 40px;
          display: flex;
          align-items: center;
          gap: 32px;
        }

        /* Bottom layout (default) */
        .container.controls-bottom {
          flex-direction: column;
        }

        /* Right layout */
        .container.controls-right {
          flex-direction: row;
        }

        :host([data-theme="dark"]) .container {
          background: #141414;
          border-color: #333;
        }

        .visual-area {
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          gap: 24px;
        }

        .container.controls-right .visual-area {
          flex: 1;
        }

        ::slotted(div) {
          width: 100%;
          max-width: 1000px;
          display: flex;
          justify-content: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .controls {
          display: flex;
          align-items: center;
          gap: 32px;
          background: #141414;
          padding: 16px 32px;
          border-radius: 12px;
          width: max-content;
          box-shadow: 0 4px 24px rgba(0,0,0,0.25);
        }

        /* Vertical controls for right position */
        .container.controls-right .controls {
          flex-direction: column;
          padding: 24px 16px;
          gap: 24px;
        }

        :host([data-theme="dark"]) .controls {
          background: #222;
          border: 1px solid #333;
        }

        .controls button {
          background: none;
          border: none;
          color: #fff;
          font-family: var(--font-sans, sans-serif);
          font-size: 16px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          padding: 0;
          transition: opacity 0.2s;
        }

        .controls button:hover {
          opacity: 0.8;
        }

        .controls button svg {
          width: 24px;
          height: 24px;
          fill: #fff;
          display: block;
          flex-shrink: 0;
        }

        /* Hide text labels when controls are vertical */
        .container.controls-right .controls button span {
          display: none;
        }

        /* Mobile responsiveness */
        @media (max-width: 768px) {
          .container {
            flex-direction: row !important;
            align-items: center;
            padding: 20px;
            gap: 20px;
          }

          .visual-area {
            flex: 1;
          }

          .controls {
            flex-direction: column !important;
            position: static !important;
            transform: none !important;
            width: auto !important;
            padding: 12px !important;
            gap: 24px !important;
          }

          .controls button span {
            display: none;
          }
        }
      </style>

      <div class="container controls-${isVertical ? 'right' : 'bottom'}">
        <div class="visual-area">
          <slot></slot>
        </div>

        <div class="controls">
          <button class="btn-pause" title="${escapeHtml(this.labelPause)}">
            <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 14h2V4h-2v10ZM10.5 4v10h2V4h-2Z"/></svg>
            <span>${escapeHtml(this.labelPause)}</span>
          </button>
          <button class="btn-play" title="${escapeHtml(this.labelPlay)}">
            <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 4v10l8-5-8-5Z"/></svg>
            <span>${escapeHtml(this.labelPlay)}</span>
          </button>
          <button class="btn-stop" title="${escapeHtml(this.labelStop)}">
            <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 4h9v10h-9V4Z"/></svg>
            <span>${escapeHtml(this.labelStop)}</span>
          </button>
        </div>
      </div>
    `;

    this.shadowRoot
      .querySelector(".btn-play")
      .addEventListener("click", () => this.playAll());
    this.shadowRoot
      .querySelector(".btn-pause")
      .addEventListener("click", () => this.pauseAll());
    this.shadowRoot
      .querySelector(".btn-stop")
      .addEventListener("click", () => this.stopAll());
  }

  async initLottie() {
    const generation = this._generation;
    let lottie;
    try {
      lottie = await loadLottie();
    } catch (e) {
      console.error("Lottie not found", e);
      return;
    }

    if (!this.isConnected || generation !== this._generation) return;
    // Scan for Lottie elements in Light DOM
    const elements = this.querySelectorAll("[data-lottie-path]");

    elements.forEach((el) => {
      const path = el.getAttribute("data-lottie-path");
      const loop = el.getAttribute("data-loop") !== "false";
      const autoplay = el.getAttribute("data-autoplay") !== "false" && !prefersReducedMotion();

      const anim = lottie.loadAnimation({
        container: el,
        renderer: "svg",
        loop: loop,
        autoplay: autoplay,
        path: path,
      });

      this.lottieInstances.push(anim);
    });
  }

  playAll() {
    this.lottieInstances.forEach((anim) => anim.play());
  }

  pauseAll() {
    this.lottieInstances.forEach((anim) => anim.pause());
  }

  stopAll() {
    this.lottieInstances.forEach((anim) => anim.stop());
  }
}

if (!customElements.get("lottie-player-grid")) {
  customElements.define("lottie-player-grid", LottiePlayer);
}
