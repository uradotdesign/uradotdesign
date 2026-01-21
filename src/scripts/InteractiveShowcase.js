class InteractiveShowcase extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.lottieInstances = new Map(); // Map<Element, AnimationItem>
    this.items = []; // Store references to the tab items
  }

  get controlsPosition() {
    return this.getAttribute("controls-position") || "bottom";
  }

  connectedCallback() {
    this.render();

    // Wait for children to be available
    if (this.children.length > 0) {
      this.initTabs();
      this.setupLottieControls();
    } else {
      // Use MutationObserver to wait for children
      const observer = new MutationObserver((mutations) => {
        if (this.children.length > 0) {
          this.initTabs();
          this.setupLottieControls();
          observer.disconnect();
        }
      });
      observer.observe(this, { childList: true });
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          font-family: var(--font-sans, 'Instrument Sans', sans-serif);
          margin: 2rem 0;
        }

        .macos-window-container {
          width: 100%;
          max-width: 100%;
          background: #F3F4F6;
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          overflow: hidden;
          border: 1px solid #e5e7eb;
          display: flex;
          flex-direction: column;
        }

        .macos-title-bar {
          background: #ffffff;
          padding: 12px 16px;
          display: flex;
          gap: 8px;
          border-bottom: 1px solid #e5e7eb;
        }

        .window-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .dot-red { background-color: #FF5F56; }
        .dot-yellow { background-color: #FFBD2E; }
        .dot-green { background-color: #27C93F; }

        .macos-content {
          display: flex;
          flex-direction: column;
          min-height: 740px;
        }

        @media (max-width: 767px) {
          .macos-content {
            height: auto;
            min-height: 700px;
          }
          /* On mobile, controls always go to bottom center */
          .controls {
            bottom: 20px !important;
            top: auto !important;
            right: auto !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            flex-direction: row !important;
            padding: 12px 24px !important;
            gap: 24px !important;
          }
          .controls button span {
            display: none !important;
          }
        }

        @media (min-width: 768px) {
          .macos-content {
            flex-direction: row;
          }
        }

        .macos-sidebar {
          max-width: 100%;
          background: #141414;
          padding: 40px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 40px;
        }

        @media (min-width: 768px) {
          .macos-sidebar {
            width: 40%;
            min-width: 300px;
            border-right: 1px solid #e5e7eb;
          }
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .nav-item {
          background: none;
          border: none;
          padding: 0;
          text-align: left;
          font-family: var(--font-mono);
          font-size: 1rem;
          font-weight: 600;
          text-transform: uppercase;
          cursor: pointer;
          color: #fff;
          opacity: 0.8;
          transition: opacity 0.2s;
          width: fit-content;
        }

        .nav-item:hover {
          opacity: 1;
        }

        .nav-item.active {
          opacity: 1;
          color: #FD5825;
          position: relative;
        }

        .nav-item.active::after {
          content: "";
          position: absolute;
          left: 0;
          bottom: -3px;
          width: 24px;
          height: 3px;
          background-color: #FD5825;
        }

        .sidebar-description {
          font-size: 16px;
          line-height: 1.6;
          color: #fff;
          transition: opacity 0.3s ease;
        }

        ::slotted([slot="active-desc"]) {
          color: #fff !important;
        }
        
        ::slotted([slot="active-desc"] p), 
        ::slotted([slot="active-desc"] h1),
        ::slotted([slot="active-desc"] h2),
        ::slotted([slot="active-desc"] h3),
        ::slotted([slot="active-desc"] span) {
          color: #fff !important;
        }

        .macos-main {
          width: 100%;
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        @media (min-width: 768px) {
          .macos-main {
            width: 60%;
          }
        }

        ::slotted(img), ::slotted(.main-image) {
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
          object-fit: contain;
        }

        .visual-wrapper {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.3s ease, transform 0.3s ease;
          opacity: 1;
          transform: scale(1);
          position: relative;
        }
        
        .visual-wrapper.fading {
          opacity: 0;
          transform: scale(0.98);
        }
        
        .description-wrapper {
          transition: opacity 0.3s ease;
        }
        
        .description-wrapper.fading {
            opacity: 0;
        }

        /* Controls - base styles */
        .controls {
            position: absolute;
            z-index: 50;
            display: flex;
            align-items: center;
            gap: 32px;
            background: #141414 !important;
            padding: 16px 32px;
            border-radius: 12px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.25);
            pointer-events: auto;
            isolation: isolate;
        }

        /* Horizontal controls (bottom) */
        .controls.controls-bottom {
            bottom: 40px;
            left: 50%;
            transform: translateX(-50%);
            width: max-content;
            opacity: 0;
            animation: fadeInBottom 0.5s ease forwards;
        }

        /* Vertical controls (right) */
        .controls.controls-right {
            right: 24px;
            top: 50%;
            transform: translateY(-50%);
            flex-direction: column;
            padding: 24px 16px;
            gap: 24px;
            opacity: 0;
            animation: fadeInRight 0.5s ease forwards;
        }

        .controls.controls-right button span {
            display: none;
        }

        @keyframes fadeInBottom {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        @keyframes fadeInRight {
          from { opacity: 0; transform: translateY(-50%) translateX(10px); }
          to { opacity: 1; transform: translateY(-50%) translateX(0); }
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
            white-space: nowrap;
        }
        
        .controls button:hover {
            opacity: 0.8;
        }

        .controls button svg {
            width: 18px;
            height: 18px;
            min-width: 18px;
            min-height: 18px;
            fill: #fff;
            color: #fff;
            display: block;
            flex-shrink: 0;
        }
        
        .controls button svg path {
            fill: #fff;
        }

        .lottie-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
        }

        ::slotted(.lottie-caption) {
            font-family: var(--font-mono);
            font-weight: 500;
            text-transform: uppercase;
            font-size: 14px;
            color: #333;
            margin-top: 8px;
        }


      </style>

      <div class="macos-window-container">
        <!-- Title Bar -->
        <div class="macos-title-bar">
          <div class="window-dot dot-red"></div>
          <div class="window-dot dot-yellow"></div>
          <div class="window-dot dot-green"></div>
        </div>

        <!-- Content Body -->
        <div class="macos-content">
          <!-- Left Column -->
          <div class="macos-sidebar">
            <div class="sidebar-nav" role="tablist">
              <!-- Navigation items will be inserted here by JS -->
            </div>
            
            <div class="sidebar-description description-wrapper">
               <slot name="active-desc"></slot>
            </div>
          </div>

          <!-- Right Column -->
          <div class="macos-main">
            <div class="visual-wrapper">
               <slot name="active-visual"></slot>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  initTabs() {
    // Find all direct children that look like wrappers (e.g. div data-label="...")
    const wrappers = Array.from(this.children).filter(
      (el) =>
        el.hasAttribute("data-label") && !el.hasAttribute("data-processed")
    );

    const navArea = this.shadowRoot.querySelector(".sidebar-nav");

    if (wrappers.length === 0 && this.items.length === 0) return;

    wrappers.forEach((wrapper, index) => {
      wrapper.setAttribute("data-processed", "true");
      // We hide the wrapper because we are going to extract its contents
      wrapper.style.display = "none";

      const label = wrapper.getAttribute("data-label");

      // Find content inside the wrapper
      let desc = wrapper.querySelector(".description");
      let visual = wrapper.querySelector(".visual");

      // Fallback if .description class not found
      if (!desc) {
        const candidates = Array.from(wrapper.children);
        desc = candidates.find((el) => !el.classList.contains("visual"));
      }

      // MOVE the elements to be direct children of <interactive-showcase>
      if (desc) {
        this.appendChild(desc);
        desc.style.display = "none"; // Hide initially
      }
      if (visual) {
        this.appendChild(visual);
        visual.style.display = "none"; // Hide initially

        // Enhance Lottie elements with captions if they have a title attribute
        this.enhanceLottieElements(visual);
      }

      // Store reference
      this.items.push({
        label,
        desc,
        visual,
        index: this.items.length, // use accumulated length
      });

      // Create Nav Button
      const btn = document.createElement("button");
      btn.className = "nav-item";
      btn.textContent = label;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", "false");
      const currentIndex = this.items.length - 1;
      btn.setAttribute("aria-controls", `panel-${currentIndex}`);
      btn.dataset.index = currentIndex;

      btn.addEventListener("click", () => this.activateTab(currentIndex, true));
      navArea.appendChild(btn);
    });

    // Activate first tab by default if not already active
    if (this.items.length > 0) {
      // Check if any tab is active, if not activate first
      const activeBtn = navArea.querySelector(".nav-item.active");
      if (!activeBtn) {
        setTimeout(() => this.activateTab(0, false), 0);
      }
    }
  }

  enhanceLottieElements(visualContainer) {
    const lottieEls = visualContainer.querySelectorAll("[data-lottie-path]");
    lottieEls.forEach((el) => {
      const title = el.getAttribute("title");
      if (title && !el.parentElement.classList.contains("lottie-item")) {
        // Wrap it to add caption
        const wrapper = document.createElement("div");
        wrapper.className = "lottie-item";
        el.parentNode.insertBefore(wrapper, el);
        wrapper.appendChild(el);

        const caption = document.createElement("span");
        caption.className = "lottie-caption";
        caption.textContent = title;
        wrapper.appendChild(caption);
      }
    });
  }

  activateTab(index, animate = true) {
    const navButtons = this.shadowRoot.querySelectorAll(".nav-item");
    const descWrapper = this.shadowRoot.querySelector(".description-wrapper");
    const visualWrapper = this.shadowRoot.querySelector(".visual-wrapper");

    // Update Nav State
    navButtons.forEach((btn, idx) => {
      const isActive = idx === index;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive);
    });

    if (animate) {
      // Fade out
      descWrapper.classList.add("fading");
      visualWrapper.classList.add("fading");

      setTimeout(() => {
        this.switchContent(index);
        // Fade in
        descWrapper.classList.remove("fading");

        // Check for images to load before fading in visual
        const activeItem = this.items[index];
        const img =
          activeItem && activeItem.visual
            ? activeItem.visual.querySelector("img")
            : null;

        if (img && !img.complete) {
          img.onload = () => visualWrapper.classList.remove("fading");
        } else {
          visualWrapper.classList.remove("fading");
        }
      }, 250);
    } else {
      this.switchContent(index);
    }
  }

  switchContent(index) {
    this.items.forEach((item, idx) => {
      const isActive = idx === index;

      if (isActive) {
        if (item.desc) {
          item.desc.style.display = ""; // Show
          item.desc.setAttribute("slot", "active-desc");
        }
        if (item.visual) {
          item.visual.style.display = ""; // Show
          item.visual.setAttribute("slot", "active-visual");
          this.initLottiesInContainer(item.visual);
        }
      } else {
        if (item.desc) {
          item.desc.removeAttribute("slot");
          item.desc.style.display = "none"; // Hide
        }
        if (item.visual) {
          item.visual.removeAttribute("slot");
          item.visual.style.display = "none"; // Hide
        }
        if (item.visual) {
          this.stopLottiesInContainer(item.visual);
        }
      }
    });

    // Update Controls Visibility
    this.updateControls(index);
  }

  updateControls(index) {
    const activeItem = this.items[index];
    const shadowVisualWrapper =
      this.shadowRoot.querySelector(".visual-wrapper");
    const existingControls = shadowVisualWrapper.querySelector(".controls");

    // Check if activeItem needs controls by looking for the placeholder
    const placeholder = activeItem?.visual?.querySelector(".controls");

    if (placeholder) {
      // Active item NEEDS controls
      // If they don't exist in Shadow DOM, generate them.
      if (!existingControls) {
        this.generateControls(placeholder);
      }
    } else {
      // Active item does NOT need controls
      if (existingControls) {
        existingControls.remove();
      }
    }
  }

  async initLottiesInContainer(container) {
    const lottieElements = container.querySelectorAll("[data-lottie-path]");
    if (lottieElements.length === 0) return;

    // Note: Controls generation is now handled in updateControls called by switchContent
    // We no longer call generateControls here to avoid conflicts.

    // Dynamic import of lottie-web
    let lottie;
    try {
      const module = await import("lottie-web");
      lottie = module.default || module;
    } catch (e) {
      console.error("Lottie not found", e);
      return;
    }

    if (!lottie) return;

    lottieElements.forEach((el) => {
      if (this.lottieInstances.has(el)) return; // Already initialized

      const path = el.getAttribute("data-lottie-path");
      const loop =
        el.hasAttribute("data-loop") !== null &&
        el.getAttribute("data-loop") !== "false";
      const autoplay =
        el.hasAttribute("data-autoplay") !== null &&
        el.getAttribute("data-autoplay") !== "false";

      const anim = lottie.loadAnimation({
        container: el,
        renderer: "svg",
        loop: loop,
        autoplay: autoplay,
        path: path,
      });

      this.lottieInstances.set(el, anim);
    });
  }

  generateControls(container) {
    container.setAttribute("data-generated", "true");
    container.innerHTML = ""; // Clear any existing content

    const shadowVisualWrapper =
      this.shadowRoot.querySelector(".visual-wrapper");

    // Remove any existing controls first to prevent duplicates
    const existingControls = shadowVisualWrapper.querySelector(".controls");
    if (existingControls) {
      existingControls.remove();
    }

    const isVertical = this.controlsPosition === "right";
    let shadowControls = document.createElement("div");
    shadowControls.className = `controls controls-${isVertical ? 'right' : 'bottom'}`;
    shadowVisualWrapper.appendChild(shadowControls);

    // Create buttons with span for text (allows hiding text in vertical mode)
    shadowControls.innerHTML = `
        <button data-lottie-action="pause-all" title="Pause all">
          <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 14h2V4h-2v10ZM10.5 4v10h2V4h-2Z"/></svg>
          <span>Pause all</span>
        </button>
        <button data-lottie-action="play-all" title="Play all">
          <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 4v10l8-5-8-5Z"/></svg>
          <span>Play all</span>
        </button>
        <button data-lottie-action="stop-all" title="Stop all">
           <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 4h9v10h-9V4Z"/></svg>
           <span>Stop all</span>
        </button>
      `;

    // Hide the placeholder in Light DOM
    container.style.display = "none";
  }

  stopLottiesInContainer(container) {
    // Find instances associated with elements in this container
    const elements = container.querySelectorAll("[data-lottie-path]");
    elements.forEach((el) => {
      const anim = this.lottieInstances.get(el);
      if (anim) {
        anim.stop();
      }
    });
  }

  setupLottieControls() {
    // Listen for clicks on the Shadow Root to capture events from auto-generated controls
    this.shadowRoot.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const action = btn.getAttribute("data-lottie-action");
      if (!action) return;

      // Find the active visual container
      const activeVisualSlot = this.shadowRoot.querySelector(
        'slot[name="active-visual"]'
      );
      if (!activeVisualSlot) return;

      const assignedNodes = activeVisualSlot.assignedNodes();
      if (assignedNodes.length === 0) return;

      const activeContainer = assignedNodes[0]; // Should be the .visual div

      const instances = [];
      activeContainer.querySelectorAll("[data-lottie-path]").forEach((el) => {
        const anim = this.lottieInstances.get(el);
        if (anim) instances.push(anim);
      });

      if (action === "play-all") {
        instances.forEach((anim) => anim.play());
      } else if (action === "pause-all") {
        instances.forEach((anim) => anim.pause());
      } else if (action === "stop-all") {
        instances.forEach((anim) => anim.stop());
      }
    });
  }
}

if (!customElements.get("interactive-showcase")) {
  customElements.define("interactive-showcase", InteractiveShowcase);
}
