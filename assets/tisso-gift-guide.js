/**
 * TISSO VISON Gift Guide — popup, variants, cart (vanilla JS, no jQuery).
 * Soft Winter Jacket auto-add when selected variant includes Black + Medium.
 */
(() => {
  'use strict';

  const SELECTORS = {
    banner: '[data-tisso-banner]',
    menuToggle: '[data-tisso-menu-toggle]',
    mobilePanel: '[data-tisso-mobile-panel]',
    grid: '[data-tisso-grid]',
    hotspot: '[data-tisso-hotspot]',
    productJson: '[data-tisso-product-json]',
    popup: '[data-tisso-popup]',
    popupClose: '[data-tisso-popup-close]',
    popupImage: '[data-tisso-popup-image]',
    popupTitle: '[data-tisso-popup-title]',
    popupPrice: '[data-tisso-popup-price]',
    popupDesc: '[data-tisso-popup-desc]',
    popupOptions: '[data-tisso-popup-options]',
    popupStatus: '[data-tisso-popup-status]',
    addToCart: '[data-tisso-add-to-cart]',
    atcLabel: '[data-tisso-atc-label]',
  };

  const BLACK_VALUE = 'black';
  const MEDIUM_VALUE = 'medium';
  const FETCH_TIMEOUT_MS = 15000;

  /**
   * Initialize mobile menu toggle on the banner.
   * @param {HTMLElement} banner
   */
  const initBannerMenu = (banner) => {
    const toggle = banner.querySelector(SELECTORS.menuToggle);
    const panel = banner.querySelector(SELECTORS.mobilePanel);
    if (!toggle || !panel) return;

    toggle.addEventListener('click', () => {
      const isOpen = !panel.hasAttribute('hidden');
      if (isOpen) {
        panel.setAttribute('hidden', '');
        toggle.setAttribute('aria-expanded', 'false');
      } else {
        panel.removeAttribute('hidden');
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
  };

  /**
   * Normalize option names for Color vs Size UI treatment.
   * @param {string} name
   * @returns {'color'|'size'|'other'}
   */
  const classifyOption = (name) => {
    const lower = String(name || '').toLowerCase();
    if (lower.includes('color') || lower.includes('colour')) return 'color';
    if (lower.includes('size')) return 'size';
    return 'other';
  };

  /**
   * Find a matching variant for the current option selections.
   * @param {object} product
   * @param {string[]} selectedOptions
   * @returns {object|null}
   */
  const findVariant = (product, selectedOptions) => {
    if (!product?.variants?.length) return null;
    return (
      product.variants.find((variant) => {
        const options = variant.options || [variant.option1, variant.option2, variant.option3].filter(Boolean);
        return options.every((value, index) => value === selectedOptions[index]);
      }) || null
    );
  };

  /**
   * Check whether variant options include both Black and Medium.
   * @param {object} variant
   * @returns {boolean}
   */
  const hasBlackAndMedium = (variant) => {
    if (!variant) return false;
    const values = (variant.options || [variant.option1, variant.option2, variant.option3])
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());
    return values.includes(BLACK_VALUE) && values.includes(MEDIUM_VALUE);
  };

  /**
   * Fetch with timeout for cart API calls.
   * @param {string} url
   * @param {RequestInit} options
   * @returns {Promise<Response>}
   */
  const fetchWithTimeout = async (url, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timer);
    }
  };

  /**
   * Grid + popup controller.
   */
  class TissoGiftGuide {
    /**
     * @param {HTMLElement} root
     */
    constructor(root) {
      this.root = root;
      this.popup = root.querySelector(SELECTORS.popup);
      this.optionsEl = root.querySelector(SELECTORS.popupOptions);
      this.statusEl = root.querySelector(SELECTORS.popupStatus);
      this.atcBtn = root.querySelector(SELECTORS.addToCart);
      this.atcLabel = root.querySelector(SELECTORS.atcLabel);
      this.cartAddUrl = root.dataset.cartAddUrl || '/cart/add.js';
      this.autoAddVariantId = root.dataset.autoAddVariantId
        ? Number(root.dataset.autoAddVariantId)
        : null;

      this.product = null;
      this.selectedOptions = [];
      this.selectedVariant = null;
      this.lastFocused = null;

      this.bindEvents();
    }

    bindEvents() {
      this.root.querySelectorAll(SELECTORS.hotspot).forEach((button) => {
        button.addEventListener('click', () => {
          const tile = button.closest('[data-tisso-tile]');
          const jsonEl = tile?.querySelector(SELECTORS.productJson);
          if (!jsonEl) {
            console.warn('[tisso-gift-guide] Missing product JSON for hotspot');
            return;
          }

          try {
            const product = JSON.parse(jsonEl.textContent || '{}');
            this.openPopup(product, button);
          } catch (error) {
            console.error('[tisso-gift-guide] Failed to parse product JSON', error);
          }
        });
      });

      this.popup?.querySelectorAll(SELECTORS.popupClose).forEach((el) => {
        el.addEventListener('click', () => this.closePopup());
      });

      this.atcBtn?.addEventListener('click', () => this.addToCart());

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.popup && !this.popup.hasAttribute('hidden')) {
          this.closePopup();
        }
      });
    }

    /**
     * @param {object} product
     * @param {HTMLElement} trigger
     */
    openPopup(product, trigger) {
      if (!this.popup || !product) return;

      this.product = product;
      this.lastFocused = trigger || document.activeElement;
      this.clearStatus();

      // Pre-select non-size options; leave size empty to match Figma "Choose your size"
      this.selectedOptions = (product.options || []).map((option) => {
        const kind = classifyOption(option.name);
        if (kind === 'size') return '';
        return option.values?.[0] || '';
      });

      this.renderPopupContent();
      this.popup.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';
      this.popup.querySelector(SELECTORS.popupClose)?.focus();
    }

    closePopup() {
      if (!this.popup) return;
      this.popup.setAttribute('hidden', '');
      document.body.style.overflow = '';
      this.product = null;
      this.selectedVariant = null;
      this.clearStatus();
      if (this.lastFocused && typeof this.lastFocused.focus === 'function') {
        this.lastFocused.focus();
      }
    }

    renderPopupContent() {
      if (!this.product || !this.popup) return;

      const titleEl = this.popup.querySelector(SELECTORS.popupTitle);
      const descEl = this.popup.querySelector(SELECTORS.popupDesc);
      const imageEl = this.popup.querySelector(SELECTORS.popupImage);

      if (titleEl) titleEl.textContent = this.product.title || '';
      if (descEl) descEl.textContent = this.product.description || '';

      this.renderOptions();
      this.syncVariant();

      const imageSrc =
        this.selectedVariant?.featured_image || this.product.featured_image || '';
      if (imageEl) {
        imageEl.src = imageSrc;
        imageEl.alt = this.product.title || '';
      }
    }

    renderOptions() {
      if (!this.optionsEl || !this.product) return;
      this.optionsEl.innerHTML = '';

      const options = this.product.options || [];
      options.forEach((option, optionIndex) => {
        const kind = classifyOption(option.name);
        const wrapper = document.createElement('div');
        wrapper.className = 'tisso-popup__option';

        const label = document.createElement('p');
        label.className = 'tisso-popup__option-label';
        label.textContent = option.name;
        wrapper.appendChild(label);

        if (kind === 'size' || (kind === 'other' && option.values?.length > 4)) {
          wrapper.appendChild(this.createSelect(option, optionIndex));
        } else {
          wrapper.appendChild(this.createSegments(option, optionIndex));
        }

        this.optionsEl.appendChild(wrapper);
      });
    }

    /**
     * @param {object} option
     * @param {number} optionIndex
     * @returns {HTMLElement}
     */
    createSegments(option, optionIndex) {
      const group = document.createElement('div');
      group.className = 'tisso-popup__segments';
      group.style.gridTemplateColumns = `repeat(${option.values.length}, minmax(0, 1fr))`;
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', option.name);

      option.values.forEach((value) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tisso-popup__segment';
        button.textContent = value;
        if (this.selectedOptions[optionIndex] === value) {
          button.classList.add('is-selected');
        }
        button.addEventListener('click', () => {
          this.selectedOptions[optionIndex] = value;
          this.renderOptions();
          this.syncVariant();
        });
        group.appendChild(button);
      });

      return group;
    }

    /**
     * @param {object} option
     * @param {number} optionIndex
     * @returns {HTMLElement}
     */
    createSelect(option, optionIndex) {
      const wrap = document.createElement('div');
      wrap.className = 'tisso-popup__select-wrap';

      const select = document.createElement('select');
      select.className = 'tisso-popup__select';
      select.setAttribute('aria-label', option.name);

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent =
        classifyOption(option.name) === 'size'
          ? 'Choose your size'
          : `Choose your ${String(option.name).toLowerCase()}`;
      placeholder.disabled = true;
      if (!this.selectedOptions[optionIndex]) {
        placeholder.selected = true;
      }
      select.appendChild(placeholder);

      option.values.forEach((value) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        if (this.selectedOptions[optionIndex] === value) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });

      select.addEventListener('change', () => {
        this.selectedOptions[optionIndex] = select.value;
        this.syncVariant();
      });

      wrap.appendChild(select);
      return wrap;
    }

    syncVariant() {
      this.selectedVariant = findVariant(this.product, this.selectedOptions);
      const priceEl = this.popup?.querySelector(SELECTORS.popupPrice);
      const imageEl = this.popup?.querySelector(SELECTORS.popupImage);

      if (priceEl) {
        priceEl.textContent = this.selectedVariant?.price_formatted || '';
      }

      if (imageEl) {
        const imageSrc =
          this.selectedVariant?.featured_image || this.product?.featured_image || imageEl.src;
        if (imageSrc) imageEl.src = imageSrc;
      }

      if (this.atcBtn) {
        const available = Boolean(this.selectedVariant?.available);
        const incomplete = !this.selectedVariant;
        this.atcBtn.disabled = incomplete || !available;
        if (this.atcLabel) {
          if (incomplete) {
            this.atcLabel.textContent = 'Add to cart';
          } else if (!available) {
            this.atcLabel.textContent = 'Sold out';
          } else {
            this.atcLabel.textContent = 'Add to cart';
          }
        }
      }
    }

    clearStatus() {
      if (!this.statusEl) return;
      this.statusEl.textContent = '';
      this.statusEl.classList.remove('is-error', 'is-success');
    }

    /**
     * @param {string} message
     * @param {'error'|'success'} type
     */
    setStatus(message, type) {
      if (!this.statusEl) return;
      this.statusEl.textContent = message;
      this.statusEl.classList.remove('is-error', 'is-success');
      this.statusEl.classList.add(type === 'error' ? 'is-error' : 'is-success');
    }

    async addToCart() {
      if (!this.selectedVariant?.id || !this.atcBtn) return;

      const items = [{ id: this.selectedVariant.id, quantity: 1 }];

      // Soft Winter Jacket auto-add when Black + Medium are selected
      if (hasBlackAndMedium(this.selectedVariant) && this.autoAddVariantId) {
        if (this.autoAddVariantId !== this.selectedVariant.id) {
          items.push({ id: this.autoAddVariantId, quantity: 1 });
        }
      } else if (hasBlackAndMedium(this.selectedVariant) && !this.autoAddVariantId) {
        console.warn(
          '[tisso-gift-guide] Black + Medium selected but Soft Winter Jacket is not set in the customizer'
        );
      }

      const previousLabel = this.atcLabel?.textContent || 'Add to cart';
      this.atcBtn.disabled = true;
      if (this.atcLabel) this.atcLabel.textContent = 'Adding…';
      this.clearStatus();

      try {
        console.info('[tisso-gift-guide] Adding to cart', { items });
        const response = await fetchWithTimeout(this.cartAddUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ items }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message = payload?.description || payload?.message || 'Could not add to cart';
          console.error('[tisso-gift-guide] Cart add failed', { status: response.status, payload });
          this.setStatus(message, 'error');
          this.atcBtn.disabled = false;
          if (this.atcLabel) this.atcLabel.textContent = previousLabel;
          return;
        }

        console.info('[tisso-gift-guide] Cart add success', payload);
        this.setStatus('Added to cart', 'success');
        if (this.atcLabel) this.atcLabel.textContent = 'Added';

        // Notify theme cart UI if present (without importing theme components)
        try {
          document.dispatchEvent(
            new CustomEvent('cart:updated', { detail: { source: 'tisso-gift-guide', payload } })
          );
          if (window.Theme?.routes?.cart_url || window.Shopify) {
            document.dispatchEvent(new CustomEvent('cart:refresh'));
          }
        } catch (eventError) {
          console.warn('[tisso-gift-guide] Cart event dispatch skipped', eventError);
        }

        window.setTimeout(() => this.closePopup(), 700);
      } catch (error) {
        console.error('[tisso-gift-guide] Cart add network error', error);
        this.setStatus('Network error. Please try again.', 'error');
        this.atcBtn.disabled = false;
        if (this.atcLabel) this.atcLabel.textContent = previousLabel;
      }
    }
  }

  const init = () => {
    document.querySelectorAll(SELECTORS.banner).forEach((banner) => initBannerMenu(banner));
    document.querySelectorAll(SELECTORS.grid).forEach((grid) => {
      // Avoid double-init in theme editor section reloads
      if (grid.dataset.tissoInitialized === 'true') return;
      grid.dataset.tissoInitialized = 'true';
      new TissoGiftGuide(grid);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('shopify:section:load', init);
})();
