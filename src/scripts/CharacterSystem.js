import { watchTheme } from "./shadow-theme.js";

class CharacterPicker extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.isOpen = false;
    this.selectedItem = null;
  }

  connectedCallback() {
    this.render();
    this.setupItemRoles();
    this.setupListeners();
    this._unwatchTheme = watchTheme(this);

    // Initial selection broadcast after a tick to ensure listener is ready
    setTimeout(() => {
      const initial =
        this.querySelector('[data-selected="true"]') ||
        this.querySelector(".item");
      if (initial) {
        this.selectItem(initial, false);
      }
    }, 50);
  }

  disconnectedCallback() {
    this._unwatchTheme?.();
    if (this._onDocClick) {
      document.removeEventListener("click", this._onDocClick);
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: var(--font-mono, monospace);
        }

        .picker-container {
          position: relative;
          width: fit-content;
        }

        .trigger {
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          padding: 8px 0;
          user-select: none;
          background: none;
          border: none;
          font: inherit;
          color: inherit;
          width: fit-content;
        }

        .trigger:focus-visible {
          outline: 2px solid currentColor;
          outline-offset: 4px;
          border-radius: 4px;
        }

        .trigger-text {
          font-size: 14px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #141414;
        }
        
        :host([data-theme="dark"]) .trigger-text {
            color: #ffffff;
        }

        .chevron {
          width: 12px;
          height: 12px;
          transition: transform 0.2s ease;
        }

        .chevron path {
           fill: currentColor;
        }
        
        :host([data-theme="dark"]) .chevron path {
            fill: #ffffff;
        }

        .picker-container.open .chevron {
          transform: rotate(180deg);
        }

        .dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          min-width: 200px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          padding: 8px;
          display: none;
          flex-direction: column;
          gap: 4px;
          z-index: 100;
          margin-top: 8px;
        }
        
        :host([data-theme="dark"]) .dropdown {
            background: #1a1a1a;
            border-color: #333;
        }

        .picker-container.open .dropdown {
          display: flex;
          animation: fadeIn 0.2s ease;
        }

        ::slotted(.item) {
          padding: 8px 12px;
          font-size: 14px;
          cursor: pointer;
          border-radius: 4px;
          transition: background 0.1s;
          color: #333;
        }

        ::slotted(.item:focus-visible) {
          outline: 2px solid #141414;
          outline-offset: -2px;
        }

        :host([data-theme="dark"]) ::slotted(.item:focus-visible) {
          outline-color: #ffffff;
        }
        
        :host([data-theme="dark"]) ::slotted(.item) {
            color: #eee;
        }

        ::slotted(.item:hover) {
          background: #f3f4f6;
        }
        
        :host([data-theme="dark"]) ::slotted(.item:hover) {
            background: #333;
        }

        ::slotted(.item.active) {
          background: #f3f4f6;
          font-weight: 600;
        }
        
        :host([data-theme="dark"]) ::slotted(.item.active) {
            background: #333;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-5px); }
            to { opacity: 1; transform: translateY(0); }
        }
      </style>

      <div class="picker-container">
        <button class="trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
          <span class="trigger-text">
            <slot name="title">PICK YOUR CHARACTER</slot>
          </span>
          <svg class="chevron" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="dropdown" role="listbox">
          <slot></slot>
        </div>
      </div>
    `;
  }

  setupItemRoles() {
    this.querySelectorAll(".item").forEach((item) => {
      item.setAttribute("role", "option");
      item.setAttribute("tabindex", "-1");
      item.setAttribute(
        "aria-selected",
        item.classList.contains("active") ? "true" : "false"
      );
    });
  }

  setupListeners() {
    const trigger = this.shadowRoot.querySelector(".trigger");

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    trigger.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "Down") {
        e.preventDefault();
        this.openDropdown();
        this.focusItem(0);
      }
    });

    // Close when clicking outside
    this._onDocClick = () => {
      if (this.isOpen) this.closeDropdown();
    };
    document.addEventListener("click", this._onDocClick);

    // Handle item selection + keyboard navigation from the slotted list
    this.addEventListener("click", (e) => {
      const item = e.target.closest(".item");
      if (item) {
        e.stopPropagation();
        this.selectItem(item);
        this.closeDropdown();
        trigger.focus();
      }
    });

    this.addEventListener("keydown", (e) => {
      const items = Array.from(this.querySelectorAll(".item"));
      const current = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown" || e.key === "Down") {
        e.preventDefault();
        this.focusItem(Math.min(current + 1, items.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "Up") {
        e.preventDefault();
        this.focusItem(Math.max(current - 1, 0));
      } else if (e.key === "Enter" || e.key === " ") {
        if (current > -1) {
          e.preventDefault();
          this.selectItem(items[current]);
          this.closeDropdown();
          trigger.focus();
        }
      } else if (e.key === "Escape") {
        this.closeDropdown();
        trigger.focus();
      }
    });
  }

  focusItem(index) {
    const items = this.querySelectorAll(".item");
    const item = items[index];
    if (item) item.focus();
  }

  openDropdown() {
    this.isOpen = true;
    this.shadowRoot.querySelector(".picker-container").classList.add("open");
    this.shadowRoot
      .querySelector(".trigger")
      ?.setAttribute("aria-expanded", "true");
  }

  toggleDropdown() {
    if (this.isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  closeDropdown() {
    this.isOpen = false;
    this.shadowRoot.querySelector(".picker-container").classList.remove("open");
    this.shadowRoot
      .querySelector(".trigger")
      ?.setAttribute("aria-expanded", "false");
  }

  selectItem(item, dispatch = true) {
    const items = this.querySelectorAll(".item");
    items.forEach((i) => {
      i.classList.remove("active");
      i.setAttribute("aria-selected", "false");
    });
    item.classList.add("active");
    item.setAttribute("aria-selected", "true");
    this.selectedItem = item;

    const value = item.getAttribute("data-value");
    const groupId = this.getAttribute("group-id");

    if (dispatch) {
      window.dispatchEvent(
        new CustomEvent("character-change", {
          detail: {
            groupId,
            value,
          },
        })
      );
    }
  }
}

class CharacterDisplay extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
    this.groupId = this.getAttribute("group-id");

    this._onCharacterChange = this.handleChange.bind(this);
    window.addEventListener("character-change", this._onCharacterChange);

    // Show first image by default if none visible
    setTimeout(() => {
      const active = this.querySelector(".active");
      if (!active) {
        const first = this.querySelector("img");
        if (first) {
          first.classList.add("active");
          first.style.display = "block";
        }
      }
    }, 50);
  }

  disconnectedCallback() {
    window.removeEventListener("character-change", this._onCharacterChange);
  }

  handleChange(e) {
    if (e.detail.groupId === this.groupId) {
      this.updateVisual(e.detail.value);
    }
  }

  updateVisual(value) {
    const images = this.querySelectorAll("img");
    images.forEach((img) => {
      if (img.getAttribute("data-value") === value) {
        img.classList.add("active");
        img.style.display = "block"; // Ensure display block
        img.style.animation = "fadeIn 0.5s ease forwards";
      } else {
        img.classList.remove("active");
        img.style.display = "none"; // Explicitly hide others
      }
    });
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
        }

        .container {
          width: 100%;
          height: 100%;
          position: relative;
          min-height: 300px; /* Minimum height to prevent collapse */
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Ensure only active images are shown */
        ::slotted(img) {
          max-width: 100%;
          height: auto;
          display: none !important;
          object-fit: contain;
        }

        ::slotted(img.active) {
          display: block !important;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.98); }
            to { opacity: 1; transform: scale(1); }
        }
      </style>
      <div class="container">
        <slot></slot>
      </div>
    `;
  }
}

if (!customElements.get("character-picker")) {
  customElements.define("character-picker", CharacterPicker);
}

if (!customElements.get("character-display")) {
  customElements.define("character-display", CharacterDisplay);
}
