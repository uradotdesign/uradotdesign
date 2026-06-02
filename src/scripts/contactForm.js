/**
 * Shared client logic for the contact form, used by both the inline section
 * form (`ContactForm.astro`) and the modal form (`ContactModal.astro`). Both
 * previously carried a near-identical copy of field validation, honeypot-safe
 * submission to `/api/contact`, the submit-button spotlight effect, and the
 * avatar tooltip behaviour; this module is the single source of truth.
 */

const DEFAULT_MESSAGES = {
  sending: "Sending...",
  success: "Thank you! We'll get back to you soon.",
  error: "Something went wrong. Please try again.",
  requiredField: "This field is required",
  invalidEmail: "Please enter a valid email address",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseMessages(form) {
  let msg = { ...DEFAULT_MESSAGES };
  try {
    const attr = form.getAttribute("data-messages");
    if (attr) msg = { ...msg, ...JSON.parse(attr) };
  } catch (e) {
    console.warn("Could not parse form messages", e);
  }
  return msg;
}

function getErrorEl(input) {
  return input.parentElement?.querySelector(".error-message");
}

function clearError(input) {
  const el = getErrorEl(input);
  if (el) {
    el.innerHTML = "&nbsp;";
    el.classList.add("invisible");
  }
  input.setAttribute("aria-invalid", "false");
  input.classList.remove("border-red-500");
}

function showError(input, message) {
  const el = getErrorEl(input);
  if (el) {
    el.textContent = message;
    el.classList.remove("invisible");
  }
  input.setAttribute("aria-invalid", "true");
  input.classList.add("border-red-500");
}

function validateField(input, msg) {
  clearError(input);
  if (input.hasAttribute("required") && !input.value.trim()) {
    showError(input, msg.requiredField);
    return false;
  }
  if (input.type === "email" && input.value.trim() && !EMAIL_RE.test(input.value)) {
    showError(input, msg.invalidEmail);
    return false;
  }
  return true;
}

/**
 * Wires validation and submission for a contact form. Idempotent: re-invoking
 * for the same form element is a no-op so it can be called on every
 * `astro:page-load` without stacking listeners.
 *
 * @param {HTMLFormElement} form - the form element.
 * @param {object} opts - configuration.
 * @param {HTMLElement} opts.statusDiv - element that displays the result banner.
 * @param {HTMLButtonElement} opts.submitButton - the submit button.
 * @param {HTMLElement} opts.buttonText - element whose text shows the button label.
 * @param {string} opts.successClass - full className applied to the status banner on success.
 * @param {string} opts.errorClass - full className applied to the status banner on error.
 * @param {boolean} [opts.scrollToStatus=false] - scroll the status banner into view on success.
 */
export function initContactFormLogic(form, opts) {
  if (!form || !opts || !opts.statusDiv || !opts.submitButton || !opts.buttonText) {
    return;
  }
  if (form.__contactFormInit) return;
  form.__contactFormInit = true;

  const { statusDiv, submitButton, buttonText, successClass, errorClass } = opts;
  const scrollToStatus = Boolean(opts.scrollToStatus);
  const language = form.getAttribute("data-language") || "en";
  const msg = parseMessages(form);

  let formInteractionStart = null;
  const trackFirstInteraction = () => {
    if (!formInteractionStart) formInteractionStart = Date.now();
  };
  form.querySelectorAll("input, textarea").forEach((input) => {
    input.addEventListener("focus", trackFirstInteraction, { once: true });
    input.addEventListener("input", trackFirstInteraction, { once: true });
  });

  const inputs = form.querySelectorAll("input[required], textarea[required]");
  inputs.forEach((input) => {
    input.addEventListener("blur", () => validateField(input, msg));
    input.addEventListener("input", () => {
      if (input.classList.contains("border-red-500")) validateField(input, msg);
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    let isValid = true;
    inputs.forEach((input) => {
      if (!validateField(input, msg)) isValid = false;
    });
    if (!isValid) {
      const firstInvalid = form.querySelector('[aria-invalid="true"]');
      if (firstInvalid && typeof firstInvalid.focus === "function") firstInvalid.focus();
      return;
    }

    submitButton.disabled = true;
    const originalText = buttonText.textContent;
    buttonText.textContent = msg.sending;
    statusDiv.classList.add("hidden");

    const formData = new FormData(form);
    const contactPreferences = Array.from(
      form.querySelectorAll('input[name="contact_preference"]:checked'),
    ).map((cb) => cb.value);

    const data = {
      first_name: formData.get("first_name"),
      last_name: formData.get("last_name"),
      email: formData.get("email"),
      phone: formData.get("phone") || undefined,
      company: formData.get("company") || undefined,
      website: formData.get("website") || undefined,
      contact_preference: contactPreferences[0] || "email",
      message: formData.get("message"),
      url: formData.get("url"),
      language,
      user_agent: navigator.userAgent,
      timestamp: formInteractionStart,
    };

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();

      if (response.ok && result.success) {
        statusDiv.textContent = msg.success;
        statusDiv.className = successClass;
        statusDiv.classList.remove("hidden");
        form.reset();
        if (scrollToStatus) {
          statusDiv.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      } else {
        throw new Error(result.error || "Submission failed");
      }
    } catch (error) {
      console.error("Contact form error:", error);
      statusDiv.textContent = msg.error;
      statusDiv.className = errorClass;
      statusDiv.classList.remove("hidden");
    } finally {
      submitButton.disabled = false;
      buttonText.textContent = originalText;
    }
  });
}

/**
 * Adds the cursor-tracking spotlight effect to every button matching `selector`.
 * Per-element guard makes repeated calls safe across view transitions.
 *
 * @param {string} selector - CSS selector for the spotlight buttons.
 */
export function initSpotlightButtons(selector) {
  document.querySelectorAll(selector).forEach((button) => {
    if (button.__spotlightInit) return;
    button.__spotlightInit = true;
    button.addEventListener("mousemove", (e) => {
      const rect = button.getBoundingClientRect();
      button.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
      button.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
    });
  });
}

const outsideClickWired = new Set();

/**
 * Enables touch/click/keyboard activation of avatar tooltips for every element
 * matching `selector`, plus a single outside-click handler per selector that
 * dismisses active tooltips. Idempotent per element and per selector.
 *
 * @param {string} selector - CSS selector for tooltip target wrappers.
 */
export function initAvatarTooltips(selector) {
  const avatars = document.querySelectorAll(selector);
  avatars.forEach((avatar) => {
    if (avatar.__tooltipInit) return;
    avatar.__tooltipInit = true;

    const activate = () => {
      document
        .querySelectorAll(selector)
        .forEach((a) => a.classList.remove("tooltip-active"));
      avatar.classList.add("tooltip-active");
      setTimeout(() => avatar.classList.remove("tooltip-active"), 2500);
    };

    avatar.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        activate();
      },
      { passive: false },
    );
    avatar.addEventListener("click", activate);
    avatar.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });

  if (!outsideClickWired.has(selector)) {
    outsideClickWired.add(selector);
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.closest && !target.closest(selector)) {
        document
          .querySelectorAll(selector)
          .forEach((a) => a.classList.remove("tooltip-active"));
      }
    });
  }
}
