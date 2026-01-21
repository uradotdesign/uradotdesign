class BeforeAfterToggle extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    const beforeSrc = this.getAttribute("before");
    const afterSrc = this.getAttribute("after");
    const beforeAlt = this.getAttribute("before-alt") || "Before";
    const afterAlt = this.getAttribute("after-alt") || "After";

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          max-width: 100%;
          margin: 2rem 0;
        }
        .toggle-input {
          display: none;
        }
        .container {
          position: relative;
          width: 100%;
          overflow: hidden;
          border-radius: 8px;
        }
        .image-before,
        .image-after {
          display: block;
          width: 100%;
          height: auto;
        }
        .image-before {
          transition: opacity 0.5s ease;
          opacity: 1;
        }
        .toggle-input:checked ~ .wrapper .image-before {
          opacity: 0;
        }
        .image-after {
          position: absolute;
          top: 0;
          left: 0;
          opacity: 0;
          transition: opacity 0.5s ease;
        }
        .toggle-input:checked ~ .wrapper .image-after {
          opacity: 1;
        }
        .controls {
          display: flex;
          justify-content: center;
          margin-top: 1.5rem;
        }
        .switcher {
          display: flex;
          position: relative;
          background: #f0f0f0;
          border-radius: 6px;
          padding: 4px;
          gap: 0;
        }
        :host-context(.dark) .switcher {
          background: #2a2a2a;
        }
        .switcher-indicator {
          position: absolute;
          top: 4px;
          left: 4px;
          width: calc(50% - 4px);
          height: calc(100% - 8px);
          background: #fff;
          border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 0;
        }
        :host-context(.dark) .switcher-indicator {
          background: #404040;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }
        .toggle-input:checked ~ .wrapper .switcher-indicator {
          transform: translateX(100%);
        }
        .switcher-label {
          position: relative;
          z-index: 1;
          padding: 8px 20px;
          font-size: 14px;
          font-weight: 500;
          color: #666;
          cursor: pointer;
          transition: color 0.3s ease;
          user-select: none;
          text-align: center;
          min-width: 80px;
        }
        :host-context(.dark) .switcher-label {
          color: #999;
        }
        .switcher-label.before {
          color: #000;
        }
        :host-context(.dark) .switcher-label.before {
          color: #fff;
        }
        .toggle-input:checked ~ .wrapper .switcher-label.before {
          color: #666;
        }
        :host-context(.dark) .toggle-input:checked ~ .wrapper .switcher-label.before {
          color: #999;
        }
        .toggle-input:checked ~ .wrapper .switcher-label.after {
          color: #000;
        }
        :host-context(.dark) .toggle-input:checked ~ .wrapper .switcher-label.after {
          color: #fff;
        }
        .switcher-label:hover {
          color: #333;
        }
        :host-context(.dark) .switcher-label:hover {
          color: #ccc;
        }
      </style>
      
      <input type="checkbox" id="toggle" class="toggle-input">
      
      <div class="wrapper">
        <div class="container">
          <img src="${beforeSrc}" alt="${beforeAlt}" class="image-before">
          <img src="${afterSrc}" alt="${afterAlt}" class="image-after">
        </div>
        <div class="controls">
          <div class="switcher">
            <div class="switcher-indicator"></div>
            <label for="toggle" class="switcher-label before">Before</label>
            <label for="toggle" class="switcher-label after">After</label>
          </div>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("before-after-toggle")) {
  customElements.define("before-after-toggle", BeforeAfterToggle);
}
