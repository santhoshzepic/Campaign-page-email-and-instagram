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
