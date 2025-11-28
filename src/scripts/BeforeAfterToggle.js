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
        /* Checkbox Hack for Toggle State */
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
        /* When checked, hide before image */
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
        /* When checked, show after image */
        .toggle-input:checked ~ .wrapper .image-after {
          opacity: 1;
        }
        .controls {
          display: flex;
          justify-content: center;
          margin-top: 1.5rem;
        }
        .toggle-btn {
          width: 3rem;
          height: 3rem;
          border-radius: 50%;
          border: 1px solid rgba(0,0,0,0.1);
          background: linear-gradient(144.49deg, #E5E5E5 5.79%, #A6A6A6 108.23%);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s, background 0.2s;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          padding: 0;
        }
        /* When checked, update button style */
        .toggle-input:checked ~ .wrapper .toggle-btn {
          background: linear-gradient(144.49deg, #B7E5FF 5.79%, #04A7FA 108.23%);
        }
        .toggle-btn:hover {
          transform: scale(1.05);
        }
        .toggle-btn:active {
          transform: scale(0.95);
        }
        .icon {
          width: 1.5rem;
          height: 1.5rem;
          color: black;
        }
        :host-context(.dark) .icon {
          color: black;
        }
      </style>
      
      <input type="checkbox" id="toggle" class="toggle-input">
      
      <div class="wrapper">
        <div class="container">
          <img src="${beforeSrc}" alt="${beforeAlt}" class="image-before">
          <img src="${afterSrc}" alt="${afterAlt}" class="image-after">
        </div>
        <div class="controls">
          <label for="toggle" class="toggle-btn" aria-label="Toggle Before/After">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor" class="icon">
              <path d="M295.4 37L310.2 73.8L347 88.6C350 89.8 352 92.8 352 96C352 99.2 350 102.2 347 103.4L310.2 118.2L295.4 155C294.2 158 291.2 160 288 160C284.8 160 281.8 158 280.6 155L265.8 118.2L229 103.4C226 102.2 224 99.2 224 96C224 92.8 226 89.8 229 88.6L265.8 73.8L280.6 37C281.8 34 284.8 32 288 32C291.2 32 294.2 34 295.4 37zM142.7 105.7L164.2 155.8L214.3 177.3C220.2 179.8 224 185.6 224 192C224 198.4 220.2 204.2 214.3 206.7L164.2 228.2L142.7 278.3C140.2 284.2 134.4 288 128 288C121.6 288 115.8 284.2 113.3 278.3L91.8 228.2L41.7 206.7C35.8 204.2 32 198.4 32 192C32 185.6 35.8 179.8 41.7 177.3L91.8 155.8L113.3 105.7C115.8 99.8 121.6 96 128 96C134.4 96 140.2 99.8 142.7 105.7zM496 368C502.4 368 508.2 371.8 510.7 377.7L532.2 427.8L582.3 449.3C588.2 451.8 592 457.6 592 464C592 470.4 588.2 476.2 582.3 478.7L532.2 500.2L510.7 550.3C508.2 556.2 502.4 560 496 560C489.6 560 483.8 556.2 481.3 550.3L459.8 500.2L409.7 478.7C403.8 476.2 400 470.4 400 464C400 457.6 403.8 451.8 409.7 449.3L459.8 427.8L481.3 377.7C483.8 371.8 489.6 368 496 368zM492 64C503 64 513.6 68.4 521.5 76.2L563.8 118.5C571.6 126.4 576 137 576 148C576 159 571.6 169.6 563.8 177.5L475.6 265.7L374.3 164.4L462.5 76.2C470.4 68.4 481 64 492 64zM76.2 462.5L340.4 198.3L441.7 299.6L177.5 563.8C169.6 571.6 159 576 148 576C137 576 126.4 571.6 118.5 563.8L76.2 521.5C68.4 513.6 64 503 64 492C64 481 68.4 470.4 76.2 462.5z"/>
            </svg>
          </label>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("before-after-toggle")) {
  customElements.define("before-after-toggle", BeforeAfterToggle);
}
