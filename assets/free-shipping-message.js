class FreeShippingMeter extends HTMLElement {
    constructor() {
        super();
    }

    static freeShippingText = window.free_shipping_text?.free_shipping_message;
    static freeShippingText1 = window.free_shipping_text?.free_shipping_message_1;
    static freeShippingText2 = window.free_shipping_text?.free_shipping_message_2;
    static freeShippingText3 = window.free_shipping_text?.free_shipping_message_3;
    static freeShippingText4 = window.free_shipping_text?.free_shipping_message_4;
    static classLabel1 = 'progress-30';
    static classLabel2 = 'progress-60';
    static classLabel3 = 'progress-100';

    static getBaseThreshold() {
        return parseFloat(window.free_shipping_price) || 0;
    }

    static getBaseCurrency() {
        return window.free_shipping_base_currency || window.shop_currency;
    }

    static normalizeCurrencyCode(code) {
        if (!code || typeof code !== 'string') {
            return null;
        }

        return code.trim().toUpperCase();
    }

    static getCartCurrencyFromApi(cart) {
        if (!cart) {
            return null;
        }

        if (typeof cart.currency === 'string') {
            return FreeShippingMeter.normalizeCurrencyCode(cart.currency);
        }

        if (cart.currency?.iso_code) {
            return FreeShippingMeter.normalizeCurrencyCode(cart.currency.iso_code);
        }

        return null;
    }

    static getCartCurrencyFromDom() {
        const component = document.querySelector('free-shipping-component');

        return FreeShippingMeter.normalizeCurrencyCode(
            component?.dataset?.cartCurrency
            || window.cart_currency
        );
    }

    static getActiveSwitcherCurrency() {
        const active = document.querySelector('#currencies .active[data-currency]');

        if (active?.dataset?.currency) {
            return FreeShippingMeter.normalizeCurrencyCode(active.dataset.currency);
        }

        if (typeof Currency !== 'undefined' && Currency.currentCurrency) {
            return FreeShippingMeter.normalizeCurrencyCode(Currency.currentCurrency);
        }

        return null;
    }

  /**
   * Presentment currency — must match the unit of cart.total_price (checkout currency).
   */
    static getPresentmentCurrency(cart) {
        return FreeShippingMeter.getCartCurrencyFromApi(cart)
            || FreeShippingMeter.getCartCurrencyFromDom()
            || FreeShippingMeter.normalizeCurrencyCode(window.shop_currency);
    }

  /** Currency shown in the progress message. */
    static getDisplayCurrency(cart) {
        return FreeShippingMeter.getActiveSwitcherCurrency()
            || FreeShippingMeter.getPresentmentCurrency(cart);
    }

    static canConvertCurrency() {
        return typeof Currency !== 'undefined'
            && typeof Currency.convert === 'function'
            && Currency.rates
            && Object.keys(Currency.rates).length > 0;
    }

    static ensureCurrencyRates() {
        if (FreeShippingMeter.canConvertCurrency()) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const existing = document.querySelector('script[data-free-shipping-currency]');

            if (existing) {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', resolve, { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdn.shopify.com/s/javascripts/currencies.js';
            script.dataset.freeShippingCurrency = 'true';
            script.onload = resolve;
            script.onerror = resolve;
            document.head.appendChild(script);
        });
    }

    static convertAmount(amount, fromCurrency, toCurrency) {
        const from = FreeShippingMeter.normalizeCurrencyCode(fromCurrency);
        const to = FreeShippingMeter.normalizeCurrencyCode(toCurrency);

        if (!amount || !from || !to || from === to) {
            return amount;
        }

        if (!FreeShippingMeter.canConvertCurrency()) {
            return amount;
        }

        if (!Currency.rates[from] || !Currency.rates[to]) {
            return amount;
        }

        const cents = Math.round(amount * 100);
        const convertedCents = Currency.convert(cents, from, to);

        if (!Number.isFinite(convertedCents)) {
            return amount;
        }

        return Math.round(convertedCents) / 100;
    }

    static getThresholdInCurrency(targetCurrency) {
        const baseAmount = FreeShippingMeter.getBaseThreshold();
        const baseCurrency = FreeShippingMeter.getBaseCurrency();
        const target = FreeShippingMeter.normalizeCurrencyCode(targetCurrency);

        return FreeShippingMeter.convertAmount(baseAmount, baseCurrency, target);
    }

    formatMoneyForDisplay(amount, currencyCode, cart) {
        const currency = FreeShippingMeter.normalizeCurrencyCode(currencyCode);
        const presentment = FreeShippingMeter.getPresentmentCurrency(cart);
        const display = FreeShippingMeter.getDisplayCurrency(cart);
        const formatKey = window.currencyFormatStyle || 'money_format';
        const format = (FreeShippingMeter.canConvertCurrency()
            && currency
            && Currency.moneyFormats?.[currency]?.[formatKey])
            || window.money_format;
        const cents = Math.round(amount * 100);

        if (display && presentment && display !== presentment) {
            const shopCurrency = FreeShippingMeter.normalizeCurrencyCode(window.shop_currency);
            const amountInShop = FreeShippingMeter.convertAmount(amount, presentment, shopCurrency);
            const shopCents = Math.round(amountInShop * 100);

            return `<span class="money">${Shopify.formatMoney(shopCents, window.money_format)}</span>`;
        }

        return Shopify.formatMoney(cents, format);
    }

    static shouldConvertDisplayedMoney(cart) {
        const presentment = FreeShippingMeter.getPresentmentCurrency(cart);
        const display = FreeShippingMeter.getDisplayCurrency(cart);

        return Boolean(
            display
            && presentment
            && display !== presentment
            && (
                (window.show_multiple_currencies && typeof Currency !== 'undefined')
                || window.show_auto_currency
            )
        );
    }

    connectedCallback() {
        this.freeShippingEligible = 0;
        this.progressBar = this.querySelector('[data-shipping-progress]');
        this.messageElement = this.querySelector('[data-shipping-message]');
        this.textEnabled = this.progressBar?.dataset.textEnabled === 'true';
        this.shipVal = window.free_shipping_text?.free_shipping_2;
        this.progressMeter = this.querySelector('[ data-free-shipping-progress-meter]');

        this.onCartChange = this.onCartChange.bind(this);
        this.onCurrencyRefresh = this.onCurrencyRefresh.bind(this);

        this.addEventListener('change', this.onCartChange);

        if (typeof $ !== 'undefined') {
            $('body').on('refreshCurrency', this.onCurrencyRefresh);
            $(document).on('click', '#currencies .dropdown-item[data-currency]', this.onCurrencyRefresh);
        }

        this.initialize();
    }

    disconnectedCallback() {
        if (typeof $ !== 'undefined') {
            $('body').off('refreshCurrency', this.onCurrencyRefresh);
            $(document).off('click', '#currencies .dropdown-item[data-currency]', this.onCurrencyRefresh);
        }
    }

    async initialize() {
        await FreeShippingMeter.ensureCurrencyRates();

        Shopify.getCart((cart) => {
            this.cart = cart;
            this.calculateProgress(cart);
        });
    }

    onCartChange() {
        this.initialize();
    }

    onCurrencyRefresh() {
        setTimeout(() => {
            if (this.cart) {
                this.calculateProgress(this.cart);
            } else {
                this.initialize();
            }
        }, 300);
    }

    calculateProgress(cart) {
        let totalPrice = cart.total_price;

        if ($('body').hasClass('setup_shipping_delivery')) {
            const giftCardItems = $('.cart-item[data-price-gift-card], .previewCartItem[data-price-gift-card]');

            if (giftCardItems.length > 0) {
                giftCardItems.each(function () {
                    totalPrice -= parseFloat($(this).attr('data-price-gift-card'));
                });
            }
        }

        const presentmentCurrency = FreeShippingMeter.getPresentmentCurrency(cart);
        const displayCurrency = FreeShippingMeter.getDisplayCurrency(cart);
        const freeshipPrice = FreeShippingMeter.getThresholdInCurrency(presentmentCurrency);
        const cartTotalPrice = parseInt(totalPrice, 10) / 100;
        const cartTotalPriceRounded = parseFloat(cartTotalPrice.toFixed(2));

        let freeShipBar = freeshipPrice > 0
            ? Math.abs((cartTotalPriceRounded * 100) / freeshipPrice)
            : 100;

        if (freeShipBar >= 100) {
            freeShipBar = 100;
        }

        const text = this.getText(
            cartTotalPriceRounded,
            freeShipBar,
            freeshipPrice,
            displayCurrency || presentmentCurrency
        );
        const classLabel = this.getClassLabel(freeShipBar);

        this.setProgressWidthAndText(freeShipBar, text, classLabel, cart);
    }

    getText(cartTotalPrice, freeShipBar, freeshipPrice, displayCurrency) {
        let text;

        if (cartTotalPrice === 0) {
            this.progressBar.classList.add('progress-hidden');
            text = '<span>'
                + FreeShippingMeter.freeShippingText
                + ' '
                + this.formatMoneyForDisplay(freeshipPrice, displayCurrency, this.cart)
                + '!</span>';
        } else if (cartTotalPrice >= freeshipPrice) {
            this.progressBar.classList.remove('progress-hidden');
            this.freeShippingEligible = 1;
            text = FreeShippingMeter.freeShippingText1;
        } else {
            this.progressBar.classList.remove('progress-hidden');
            const remainingPrice = Math.abs(freeshipPrice - cartTotalPrice);

            text = '<span>'
                + FreeShippingMeter.freeShippingText2
                + ' </span>'
                + this.formatMoneyForDisplay(remainingPrice, displayCurrency, this.cart)
                + '<span> '
                + FreeShippingMeter.freeShippingText3
                + ' </span><span class="text">'
                + FreeShippingMeter.freeShippingText4
                + '</span>';
            this.shipVal = window.free_shipping_text?.free_shipping_2;
        }

        return text;
    }

    getClassLabel(freeShipBar) {
        if (freeShipBar === 0) {
            return 'none';
        }

        if (freeShipBar <= 30) {
            return FreeShippingMeter.classLabel1;
        }

        if (freeShipBar <= 60) {
            return FreeShippingMeter.classLabel2;
        }

        if (freeShipBar < 100) {
            return FreeShippingMeter.classLabel3;
        }

        return 'progress-free';
    }

    resetProgressClass(classLabel) {
        this.progressBar.classList.remove('progress-30', 'progress-60', 'progress-100', 'progress-free');
        this.progressBar.classList.add(classLabel);
    }

    setProgressWidthAndText(freeShipBar, text, classLabel, cart) {
        setTimeout(() => {
            this.resetProgressClass(classLabel);

            this.progressMeter.style.width = `${freeShipBar}%`;

            if (this.textEnabled) {
                this.progressMeter.querySelector('.text').innerHTML = `${freeShipBar.toFixed(2)}%`;
            }

            this.messageElement.innerHTML = text;

            if (FreeShippingMeter.shouldConvertDisplayedMoney(cart)) {
                Currency.convertAll(
                    window.shop_currency,
                    $('#currencies .active').attr('data-currency'),
                    '#halo-cart-sidebar span.money, free-shipping-component span.money',
                    window.currencyFormatStyle || 'money_format'
                );
            }
        }, 400);
    }
}

window.addEventListener('load', () => {
    if (!customElements.get('free-shipping-component')) {
        customElements.define('free-shipping-component', FreeShippingMeter);
    }
});
