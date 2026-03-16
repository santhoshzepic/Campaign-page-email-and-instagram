"use strict";

/**
 * FlipWord — letter-by-letter stagger-in, blur-scale-out word swap.
 * Mirrors the behaviour of Aceternity UI's <FlipWords> component.
 */
class FlipWord {
  constructor(el, duration = 3000) {
    this.el = el;
    this.words = el.dataset.words.split(",");
    this.idx = 0;
    this._init(duration);
  }

  /** Build a word element made of individual letter spans. */
  _makeWord(word, animate) {
    const wrap = document.createElement("span");
    wrap.className = "fw-word fw-current" + (animate ? " fw-enter" : "");
    word.split("").forEach((ch, i) => {
      const letter = document.createElement("span");
      letter.className = "fw-letter";
      letter.textContent = ch;
      if (animate) {
        // Stagger each letter by 50ms; first word takes longest
        letter.style.animationDelay = `${i * 0.05}s`;
      }
      wrap.appendChild(letter);
    });
    return wrap;
  }

  /** Measure the pixel width of every word to lock container min-width. */
  _measureMaxWidth() {
    const probe = document.createElement("span");
    probe.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;" +
      "white-space:nowrap;font:inherit;";
    this.el.appendChild(probe);
    let max = 0;
    for (const w of this.words) {
      probe.textContent = w;
      max = Math.max(max, probe.offsetWidth);
    }
    probe.remove();
    return max;
  }

  _setMinWidth() {
    const px = this._measureMaxWidth();
    // Store as em so it scales with CSS font-size at every breakpoint
    const em = px / parseFloat(getComputedStyle(this.el).fontSize);
    this.el.style.minWidth = em + "em";
  }

  _init(duration) {
    // Render first word without entrance animation
    this.current = this._makeWord(this.words[0], false);
    this.el.appendChild(this.current);

    // After first paint: lock width in em and start the cycle
    requestAnimationFrame(() => {
      this._setMinWidth();
      this._schedule(duration);
    });

    // Re-measure if viewport resize changes the font size
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => this._setMinWidth(), 120);
    });
  }

  _schedule(duration) {
    this._timer = setTimeout(() => this._swap(duration), duration);
  }

  _swap(duration) {
    const oldWord = this.current;

    // Advance index
    this.idx = (this.idx + 1) % this.words.length;
    const newWord = this._makeWord(this.words[this.idx], true);

    // --- Atomic DOM update (before next paint) ---
    // 1. Pull old word OUT of flow and start exit animation
    oldWord.classList.remove("fw-current");
    oldWord.classList.add("fw-exit");
    // 2. Insert new word into flow
    this.el.appendChild(newWord);
    this.current = newWord;

    // Remove exited word from DOM once its animation ends
    oldWord.addEventListener("animationend", () => oldWord.remove(), {
      once: true,
    });

    this._schedule(duration);
  }
}

// Bootstrap all flip-word elements on the page
document.querySelectorAll(".flip-word[data-words]").forEach(
  (el) => new FlipWord(el, 3000)
);

// Section reveal: fade sections up once as they enter the viewport.
(() => {
  const sections = [...document.querySelectorAll("main section")];
  if (!sections.length) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  sections.forEach((section, index) => {
    section.classList.add("scroll-reveal");
    section.style.setProperty("--reveal-delay", `${Math.min(index * 45, 180)}ms`);
  });

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    sections.forEach((section) => section.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.12,
      rootMargin: "0px 0px -12% 0px",
    }
  );

  sections.forEach((section) => observer.observe(section));
})();

// CTA buttons: scroll to the lead form and focus the email field.
(() => {
  const scrollTriggers = document.querySelectorAll("[data-scroll-target='cta-email']");
  const emailField = document.getElementById("cta-email");
  const header = document.querySelector(".site-header");
  if (!scrollTriggers.length || !emailField) return;

  const handleClick = () => {
    const headerOffset = header ? header.offsetHeight + 24 : 24;
    const targetTop = emailField.getBoundingClientRect().top + window.scrollY - headerOffset;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.scrollTo({
      top: Math.max(targetTop, 0),
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });

    window.setTimeout(
      () => {
        emailField.focus({ preventScroll: true });
      },
      prefersReducedMotion ? 0 : 450
    );
  };

  scrollTriggers.forEach((trigger) => trigger.addEventListener("click", handleClick));
})();

// Sticky header: hide on scroll down, reveal on scroll up
(() => {
  const header = document.querySelector(".site-header");
  if (!header) return;

  let lastY = window.scrollY;
  let ticking = false;
  const delta = 6;

  const updateHeader = () => {
    const y = window.scrollY;

    // Add subtle header elevation once user leaves top
    if (y > 4) {
      header.classList.add("is-scrolled");
    } else {
      header.classList.remove("is-scrolled");
      header.classList.remove("is-hidden");
    }

    // Hide only after passing hero offset a bit
    if (y > header.offsetHeight + 24) {
      if (y > lastY + delta) {
        header.classList.add("is-hidden");
      } else if (y < lastY - delta) {
        header.classList.remove("is-hidden");
      }
    }

    lastY = y;
    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        window.requestAnimationFrame(updateHeader);
        ticking = true;
      }
    },
    { passive: true }
  );
})();

// Zepic form integration: validate, submit via API, and show user feedback.
(() => {
  const form = document.querySelector(".cta-form-panel");
  if (!form) return;
  form.setAttribute("novalidate", "novalidate");

  const emailInput = form.querySelector("#email, #cta-email, input[name='email']");
  const mobileInput = form.querySelector("#mobile, input[name='mobile'], input[name='phone']");
  const countrySelect = form.querySelector("select[name='country']");
  const phonePrefix = form.querySelector(".cta-phone-prefix");
  const consentInput = form.querySelector("input[name='consent']");
  const submitButton = form.querySelector("button[type='submit']");
  const submitButtonLabel = submitButton ? submitButton.querySelector(".btn-label") : null;

  if (!emailInput || !mobileInput || !submitButton) return;

  const API_URL = "https://zforms.zepic.cloud/forms";
  const FORM_ID = 200;
  const RECAPTCHA_ACTION = "reserve_your_account";
  const REQUEST_TIMEOUT_MS = 15000;
  const PHONE_LIB_URL = "https://cdn.jsdelivr.net/npm/libphonenumber-js@1.11.13/bundle/libphonenumber-max.js";
  const COUNTRIES_API_URL = "https://restcountries.com/v3.1/all?fields=name,cca2,idd";
  const GEO_API_URL = "https://ipapi.co/json/";
  const GEO_FALLBACK_API_URL = "https://ipwho.is/";
  const COUNTRY_CACHE_KEY = "zepic-country-iso2";
  const buttonLabel = submitButtonLabel ? submitButtonLabel.textContent : submitButton.textContent;

  const feedback = document.createElement("p");
  feedback.className = "cta-form-feedback";
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  form.appendChild(feedback);

  const emailField = emailInput.closest(".cta-field");
  const mobileField = mobileInput.closest(".cta-field");

  const emailError = document.createElement("p");
  emailError.className = "cta-field-error";
  emailError.setAttribute("aria-live", "polite");
  emailError.id = "cta-email-error";
  emailField?.appendChild(emailError);

  const mobileError = document.createElement("p");
  mobileError.className = "cta-field-error";
  mobileError.setAttribute("aria-live", "polite");
  mobileError.id = "cta-mobile-error";
  mobileField?.appendChild(mobileError);

  emailInput.setAttribute("aria-describedby", emailError.id);
  mobileInput.setAttribute("aria-describedby", mobileError.id);

  if (consentInput) {
    consentInput.required = true;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const mobileDigitsMin = 8;
  const mobileDigitsMax = 15;
  const fallbackCountry = {
    name: "India",
    iso2: "IN",
    dialCode: "+91",
  };

  let countries = [fallbackCountry];
  let activeCountry = fallbackCountry;
  let parsePhoneNumber = null;

  const loadRecaptchaScript = (siteKey) =>
    new Promise((resolve, reject) => {
      if (window.grecaptcha) {
        resolve(window.grecaptcha);
        return;
      }

      const existingScript = document.querySelector("script[data-zepic-recaptcha='true']");
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.grecaptcha), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Failed to load reCAPTCHA script.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
      script.async = true;
      script.defer = true;
      script.dataset.zepicRecaptcha = "true";
      script.onload = () => resolve(window.grecaptcha);
      script.onerror = () => reject(new Error("Failed to load reCAPTCHA script."));
      document.head.appendChild(script);
    });

  const setFeedback = (message, type) => {
    feedback.classList.remove("is-error", "is-success");
    if (message) {
      feedback.classList.add(type === "success" ? "is-success" : "is-error");
    }
    feedback.textContent = message;
  };

  const clearFeedback = () => {
    feedback.classList.remove("is-error", "is-success");
    feedback.textContent = "";
  };

  const getDigitsOnly = (value) => (value || "").replace(/\D/g, "");

  const getLocaleCountry = () => {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || "";
    const localeCountry = locale.split("-").pop();
    if (localeCountry && localeCountry.length === 2) {
      return localeCountry.toUpperCase();
    }
    return "";
  };

  const fetchWithTimeout = async (url, timeoutMs) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const loadPhoneNumberLibrary = async () => {
    if (window.libphonenumber?.parsePhoneNumberFromString) {
      parsePhoneNumber = window.libphonenumber.parsePhoneNumberFromString;
      return;
    }

    await new Promise((resolve, reject) => {
      const existingScript = document.querySelector("script[data-zepic-phone-lib='true']");
      if (existingScript) {
        existingScript.addEventListener("load", resolve, { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Failed to load phone validation library.")), {
          once: true,
        });
        return;
      }

      const script = document.createElement("script");
      script.src = PHONE_LIB_URL;
      script.async = true;
      script.defer = true;
      script.dataset.zepicPhoneLib = "true";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Failed to load phone validation library."));
      document.head.appendChild(script);
    });

    if (window.libphonenumber?.parsePhoneNumberFromString) {
      parsePhoneNumber = window.libphonenumber.parsePhoneNumberFromString;
    }
  };

  const mapCountryRecord = (record) => {
    const root = record?.idd?.root || "";
    const suffix = Array.isArray(record?.idd?.suffixes) ? record.idd.suffixes[0] : "";
    const dialCode = root && suffix ? `${root}${suffix}` : "";
    const name = record?.name?.common || "";
    const iso2 = String(record?.cca2 || "").toUpperCase();

    if (!dialCode || !name || iso2.length !== 2) {
      return null;
    }

    return {
      name,
      iso2,
      dialCode,
    };
  };

  const populateCountryDropdown = (countryList) => {
    if (!countrySelect) return;

    countrySelect.innerHTML = "";
    countryList.forEach((country) => {
      const option = document.createElement("option");
      option.value = country.iso2;
      option.textContent = `${country.name} (${country.dialCode})`;
      option.dataset.dialCode = country.dialCode;
      countrySelect.appendChild(option);
    });
  };

  const findCountryByIso = (iso2) => {
    const countryIso = String(iso2 || "").toUpperCase();
    return countries.find((country) => country.iso2 === countryIso) || null;
  };

  const getCachedCountry = () => {
    try {
      return String(window.localStorage.getItem(COUNTRY_CACHE_KEY) || "").toUpperCase();
    } catch (_error) {
      return "";
    }
  };

  const setActiveCountry = (country) => {
    activeCountry = country || fallbackCountry;

    if (countrySelect) {
      countrySelect.value = activeCountry.iso2;
    }

    if (phonePrefix) {
      phonePrefix.textContent = activeCountry.dialCode;
    }

    try {
      window.localStorage.setItem(COUNTRY_CACHE_KEY, activeCountry.iso2);
    } catch (_error) {
      // Ignore storage failures in restricted browser contexts.
    }
  };

  const detectCountryByIp = async () => {
    const geoEndpoints = [
      {
        url: GEO_API_URL,
        getIso2: (data) => data?.country_code,
      },
      {
        url: GEO_FALLBACK_API_URL,
        getIso2: (data) => data?.country_code,
      },
    ];

    for (const endpoint of geoEndpoints) {
      try {
        const response = await fetchWithTimeout(endpoint.url, 5000);
        if (!response.ok) continue;

        const data = await response.json();
        const iso2 = String(endpoint.getIso2(data) || "").toUpperCase();
        if (iso2.length === 2) {
          return iso2;
        }
      } catch (_error) {
        // Try the next provider.
      }
    }

    return getCachedCountry();
  };

  const loadCountries = async () => {
    if (!countrySelect) {
      return;
    }

    try {
      const response = await fetchWithTimeout(COUNTRIES_API_URL, 8000);
      if (!response.ok) {
        throw new Error("Unable to fetch country list");
      }

      const data = await response.json();
      const mapped = data
        .map(mapCountryRecord)
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));

      if (mapped.length) {
        countries = mapped;
        populateCountryDropdown(countries);
      }
    } catch (_error) {
      countries = [fallbackCountry];
      populateCountryDropdown(countries);
    }

    setActiveCountry(fallbackCountry);

    const ipCountry = await detectCountryByIp();
    const cachedCountry = getCachedCountry();
    const localeCountry = getLocaleCountry();
    const defaultCountry = findCountryByIso(ipCountry) || findCountryByIso(cachedCountry) || findCountryByIso(localeCountry) || fallbackCountry;
    setActiveCountry(defaultCountry);
  };

  const setFieldError = (input, errorEl, message) => {
    if (!input || !errorEl) return;

    const field = input.closest(".cta-field");
    const hasError = Boolean(message);
    input.setAttribute("aria-invalid", hasError ? "true" : "false");
    field?.classList.toggle("is-invalid", hasError);
    errorEl.textContent = message || "";
  };

  const sanitizeMobileInput = () => {
    const digits = getDigitsOnly(mobileInput.value).slice(0, mobileDigitsMax);
    if (mobileInput.value !== digits) {
      mobileInput.value = digits;
    }
  };

  const validateMobileByCountry = (mobileDigits) => {
    if (!parsePhoneNumber || !activeCountry?.dialCode) {
      if (mobileDigits.length < 8) {
        return {
          valid: false,
          message: "Enter at least 8 digits.",
        };
      }
      return { valid: true, message: "" };
    }

    const fullNumber = `${activeCountry.dialCode}${mobileDigits}`;
    const parsed = parsePhoneNumber(fullNumber, activeCountry.iso2);

    if (!parsed) {
      return {
        valid: false,
        message: `Enter a valid ${activeCountry.name} phone number.`,
      };
    }

    if (!parsed.isPossible() || !parsed.isValid()) {
      return {
        valid: false,
        message: `Enter a valid ${activeCountry.name} phone number.`,
      };
    }

    const lineType = typeof parsed.getType === "function" ? parsed.getType() : "";
    if (lineType && lineType !== "MOBILE" && lineType !== "FIXED_LINE_OR_MOBILE") {
      return {
        valid: false,
        message: "Please enter a mobile phone number.",
      };
    }

    return { valid: true, message: "" };
  };

  const validateEmailField = () => {
    const email = emailInput.value.trim();
    if (!email) {
      setFieldError(emailInput, emailError, "Work email is required.");
      return false;
    }

    if (!emailPattern.test(email)) {
      setFieldError(emailInput, emailError, "Please enter a valid work email address.");
      return false;
    }

    setFieldError(emailInput, emailError, "");
    return true;
  };

  const validateMobileField = () => {
    const mobileDigits = getDigitsOnly(mobileInput.value);
    if (!mobileDigits) {
      setFieldError(mobileInput, mobileError, "Mobile number is required.");
      return false;
    }

    if (mobileDigits.length < mobileDigitsMin) {
      setFieldError(mobileInput, mobileError, `Enter at least ${mobileDigitsMin} digits.`);
      return false;
    }

    const mobileCheck = validateMobileByCountry(mobileDigits);
    if (!mobileCheck.valid) {
      setFieldError(mobileInput, mobileError, mobileCheck.message);
      return false;
    }

    setFieldError(mobileInput, mobileError, "");
    return true;
  };

  const getRecaptchaToken = async () => {
    const siteKey = window.ZEPIC_RECAPTCHA_SITE_KEY || "";

    if (!siteKey) {
      throw new Error("reCAPTCHA is not configured. Set window.ZEPIC_RECAPTCHA_SITE_KEY and load the reCAPTCHA script.");
    }

    const recaptcha = window.grecaptcha || (await loadRecaptchaScript(siteKey));
    if (!recaptcha) {
      throw new Error("reCAPTCHA failed to initialize. Please refresh and try again.");
    }

    if (typeof recaptcha.ready === "function") {
      await new Promise((resolve) => recaptcha.ready(resolve));
    }

    let token = "";

    if (recaptcha.enterprise && typeof recaptcha.enterprise.execute === "function") {
      token = await recaptcha.enterprise.execute(siteKey, { action: RECAPTCHA_ACTION });
    } else if (typeof recaptcha.execute === "function") {
      token = await recaptcha.execute(siteKey, { action: RECAPTCHA_ACTION });
    }

    if (!token) {
      throw new Error("Unable to verify reCAPTCHA. Please refresh and try again.");
    }

    return token;
  };

  const validateForm = () => {
    const emailOk = validateEmailField();
    const mobileOk = validateMobileField();

    if (consentInput && !consentInput.checked) {
      setFeedback("Please agree to the Terms of services and Privacy Policy.", "error");
      return null;
    }

    if (!emailOk || !mobileOk) {
      if (!emailOk) {
        emailInput.focus();
      } else if (!mobileOk) {
        mobileInput.focus();
      }
      return null;
    }

    return {
      email: emailInput.value.trim(),
      mobileDigits: getDigitsOnly(mobileInput.value),
      fullMobile: `${activeCountry.dialCode}${getDigitsOnly(mobileInput.value)}`,
    };
  };

  const setSubmitting = (isSubmitting) => {
    submitButton.disabled = isSubmitting;
    submitButton.setAttribute("aria-busy", isSubmitting ? "true" : "false");
    if (submitButtonLabel) {
      submitButtonLabel.textContent = isSubmitting ? "Submitting..." : buttonLabel;
    } else {
      submitButton.textContent = isSubmitting ? "Submitting..." : buttonLabel;
    }
  };

  emailInput.addEventListener("blur", validateEmailField);
  emailInput.addEventListener("input", () => {
    if (!emailError.textContent) return;
    validateEmailField();
  });

  mobileInput.addEventListener("input", () => {
    sanitizeMobileInput();
    if (!mobileError.textContent) return;
    validateMobileField();
  });
  mobileInput.addEventListener("blur", () => {
    sanitizeMobileInput();
    validateMobileField();
  });

  countrySelect?.addEventListener("change", () => {
    const selected = findCountryByIso(countrySelect.value) || fallbackCountry;
    setActiveCountry(selected);
    if (mobileInput.value) {
      validateMobileField();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFeedback();

    const validated = validateForm();
    if (!validated) return;

    setSubmitting(true);

    try {
      const recaptchaToken = await getRecaptchaToken();
      const payload = {
        form_id: FORM_ID,
        context: {
          url: window.location.href,
        },
        data: {
          email: validated.email,
          mobile: validated.fullMobile,
        },
        security: {
          recaptcha_token: recaptchaToken,
          recaptcha_action: RECAPTCHA_ACTION,
        },
        misc: {
          country: activeCountry.name,
          country_iso2: activeCountry.iso2,
          country_code: activeCountry.dialCode,
        },
      };

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      window.clearTimeout(timeoutId);

      const contentType = response.headers.get("content-type") || "";
      let responseBody = null;
      if (contentType.includes("application/json")) {
        responseBody = await response.json();
      } else {
        const textBody = (await response.text()).trim();
        responseBody = textBody || null;
      }

      if (!response.ok) {
        let message = `Submission failed (${response.status}). Please try again.`;
        if (responseBody && typeof responseBody === "object") {
          message = responseBody?.message || responseBody?.error || message;
        } else if (typeof responseBody === "string") {
          message = responseBody;
        }
        throw new Error(message);
      }

      if (responseBody && typeof responseBody === "object") {
        const status = String(responseBody.status || "").toLowerCase();
        const explicitFailure =
          responseBody.success === false ||
          status === "error" ||
          status === "failed";

        if (explicitFailure) {
          const apiMessage = responseBody?.message || responseBody?.error || "The form API returned a failure response.";
          throw new Error(apiMessage);
        }
      }

      form.reset();
        setFieldError(emailInput, emailError, "");
        setFieldError(mobileInput, mobileError, "");
        setActiveCountry(findCountryByIso(countrySelect?.value) || activeCountry);
      setFeedback("Thanks. Your details were submitted successfully.", "success");
    } catch (error) {
      const isAbortError = error?.name === "AbortError";
      const isNetworkIssue = error instanceof TypeError && /fetch/i.test(error.message || "");
      const message = isAbortError
        ? "Request timed out. Please check your connection and try again."
        : isNetworkIssue
        ? "Unable to reach the forms API. This is usually a network or CORS restriction for your current domain."
        : error?.message || "Unable to submit right now. Please try again shortly.";
      setFeedback(message, "error");
    } finally {
      setSubmitting(false);
    }
  });

  loadCountries();
  loadPhoneNumberLibrary().catch(() => {
    // Fallback to generic digit-length checks if library is unavailable.
  });
})();
