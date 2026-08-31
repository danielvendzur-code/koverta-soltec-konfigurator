/* ==========================================================================
   KOVERTA — doplnky ku konfigurátoru
   ==========================================================================
   Nadstavba nad `soltec-premium.js`. Nič v ňom neprepisuje ani nepatchuje —
   len pridáva ovládanie navrch a hovorí s konfigurátorom cez tie isté udalosti,
   aké posiela prehliadač pri ťahaní posuvníka. Keď sa runtime aktualizuje,
   tento súbor prežije.

   Čo pridáva:
   1) Rozmer sa dá napísať. Na presné číslo sa posuvníkom trafiť nedá.
   2) Fullscreen posunie pohľad rovno na konfigurátor, aby sa nemuselo scrollovať.
   ========================================================================== */
(function () {
  'use strict';

  var ROOT_SEL = '#SoltecPremium';

  /* --- pomôcky ---------------------------------------------------------- */

  // „2 500 mm" → 2500. Konfigurátor píše čísla s pevnou medzerou aj s jednotkou.
  function toNumber(text) {
    if (!text) return null;
    var digits = String(text).replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : null;
  }

  function formatMm(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' mm';
  }

  /* --- 1 · zadanie rozmeru číslom --------------------------------------- */

  // Posuvník je indexový (0..N) a k nemu patrí výpis hodnoty v mm plus
  // popisky minima a maxima. Z tých troch sa dá spočítať, ktorý index
  // zodpovedá napísanému rozmeru; hodnota sa zaokrúhli na najbližší
  // povolený krok, takže sa nedá zadať rozmer, ktorý sa nevyrába.
  function wireNumberInput(slider) {
    if (slider.dataset.kvNum === '1') return;
    var field = slider.closest('.sp-field');
    if (!field) return;

    var out = field.querySelector('[data-sp-w-out], [data-sp-l-out], [data-sp-h-out], .sp-field__value');
    var scale = field.querySelector('.sp-scale');
    if (!out || !scale) return;

    var minEl = scale.children[0];
    var maxEl = scale.children[scale.children.length - 1];
    if (!minEl || !maxEl) return;

    slider.dataset.kvNum = '1';

    var box = document.createElement('span');
    box.className = 'kv-num';

    var input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.className = 'kv-num__in';
    input.setAttribute('aria-label', 'Zadajte rozmer v milimetroch');

    var unit = document.createElement('span');
    unit.className = 'kv-num__unit';
    unit.textContent = 'mm';

    box.appendChild(input);
    box.appendChild(unit);

    // Pole ide VEDĽA výpisu, nie doň. Konfigurátor výpis prepisuje cez
    // textContent a čokoľvek vnútri by pri každej zmene zmizlo.
    out.classList.add('kv-num__src');
    if (out.parentNode) out.parentNode.insertBefore(box, out.nextSibling);

    var syncing = false;

    function readRange() {
      var sMin = parseFloat(slider.min);
      var sMax = parseFloat(slider.max);
      var tMin = toNumber(minEl.textContent);
      var tMax = toNumber(maxEl.textContent);
      // Keď rozsah posuvníka zodpovedá rozmerom v mm, píšeme doň priamo.
      var priame = isFinite(sMin) && isFinite(sMax) && tMin !== null && tMax !== null
        && Math.abs(sMin - tMin) < 2 && Math.abs(sMax - tMax) < 2;
      return { min: tMin, max: tMax, sMin: sMin, sMax: sMax, priame: priame };
    }

    // Z konfigurátora späť do poľa — po každej zmene posuvníka aj po
    // prepnutí modelu, keď sa zmení rozsah.
    function pull() {
      if (syncing) return;
      var val = toNumber(out.textContent);
      if (val !== null && document.activeElement !== input) input.value = val;
      // Keby prekreslenie odstránilo pole, vrátime ho späť.
      if (box.parentNode !== out.parentNode && out.parentNode) {
        out.parentNode.insertBefore(box, out.nextSibling);
      }
    }

    function push() {
      var wanted = toNumber(input.value);
      var r = readRange();
      if (wanted === null || r.min === null || r.max === null) return;
      if (!isFinite(r.sMin) || !isFinite(r.sMax)) return;

      var clamped = Math.min(r.max, Math.max(r.min, wanted));
      var target;
      if (r.priame) {
        target = clamped;
      } else {
        var ratio = r.max === r.min ? 0 : (clamped - r.min) / (r.max - r.min);
        target = Math.round(ratio * (r.sMax - r.sMin)) + r.sMin;
      }

      syncing = true;
      slider.value = String(target);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      syncing = false;

      // Konfigurátor zaokrúhli na najbližší vyrábaný rozmer — ukážeme,
      // čo naozaj nastavil, nie čo bolo napísané.
      window.setTimeout(function () {
        var real = toNumber(out.textContent);
        if (real !== null) {
          input.value = real;
          if (real !== wanted) {
            box.classList.add('is-snapped');
            window.setTimeout(function () { box.classList.remove('is-snapped'); }, 900);
          }
        }
      }, 40);
    }

    input.addEventListener('change', push);
    input.addEventListener('blur', push);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); push(); input.blur(); }
    });
    slider.addEventListener('input', pull);

    // Rozsah aj hodnota sa menia aj mimo našich udalostí (výber modelu),
    // preto sledujeme výpis hodnoty.
    if ('MutationObserver' in window) {
      new MutationObserver(pull).observe(out.parentNode || out, { childList: true, characterData: true, subtree: true });
    }

    pull();
  }

  function wireAll() {
    var root = document.querySelector(ROOT_SEL);
    if (!root) return;
    root.querySelectorAll('.sp-slider').forEach(wireNumberInput);
  }

  /* --- 2 · otvoriť / zatvoriť všetko naraz ------------------------------
     Pri bioklimatickej pergole má zmysel vidieť ju celú zatvorenú alebo celú
     otvorenú jedným klikom. Ovládanie ide cez tie isté prvky, ktoré má
     používateľ — vyberie stranu, nastaví posuvník pohybu, ide na ďalšiu —
     takže sa nedotýkame vnútorného stavu konfigurátora. */

  function sideButtons(root) {
    return [].slice.call(root.querySelectorAll('[data-sp-side]'));
  }

  function setRange(el, value) {
    if (!el || el.disabled) return false;
    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /* Strecha aj všetky pohyblivé strany sa majú rozbehnúť naraz a plynulo.
     Predtým to prepínalo stranu po strane a každej nastavilo koncovú hodnotu
     skokom — na obrazovke z toho bol len iný obrázok, hoci práve ten pohyb
     je na bioklimatickej pergole to, čo predáva. Beh si vypýtame od runtimu
     udalosťou; keď runtime hák nemá (staršia verzia), ide sa pôvodnou cestou. */
  function setAll(root, open) {
    var hook = root.querySelector('[data-sp-move-hook]');
    if (hook && typeof window.CustomEvent === 'function') {
      hook.dispatchEvent(new CustomEvent('sp:move', {
        bubbles: true,
        detail: { channel: 'all', to: open ? 1 : 0 }
      }));
      return;
    }

    var pct = open ? 100 : 0;
    var sides = sideButtons(root);
    // Tlačidlá strán sa označujú cez aria-expanded, nie aria-pressed —
    // s nesprávnym atribútom sa pôvodná strana nikdy nevrátila späť.
    var povodna = root.querySelector('[data-sp-side][aria-expanded="true"]');

    sides.forEach(function (btn) {
      if (btn.getAttribute('aria-expanded') !== 'true') btn.click();
      var host = root.querySelector('[data-sp-side-move]');
      if (host && host.hidden) return;          // strana sa nedá hýbať
      setRange(root.querySelector('[data-sp-side-range]'), pct);
    });

    // Vrátiť výber tam, kde bol; keď nebolo nič otvorené, zavrieť posledné.
    if (povodna) {
      if (povodna.getAttribute('aria-expanded') !== 'true') povodna.click();
    } else {
      var posledna = sides[sides.length - 1];
      if (posledna && posledna.getAttribute('aria-expanded') === 'true') posledna.click();
    }

    setRange(root.querySelector('[data-sp-louver-range]'), pct);
  }

  function wireAllToggle() {
    var root = document.querySelector(ROOT_SEL);
    if (!root) return;
    var bar = root.querySelector('.sp-stage__bar');
    // Tlačidlo dáva zmysel len tam, kde sú lamely alebo pohyblivé strany.
    var maLamely = !!root.querySelector('[data-sp-louver-range]');
    if (!bar || !maLamely) return;
    if (bar.querySelector('.kv-allmove')) return;

    var wrap = document.createElement('div');
    wrap.className = 'kv-allmove';

    var zavri = document.createElement('button');
    zavri.type = 'button';
    zavri.className = 'kv-allmove__btn';
    zavri.textContent = 'Zavrieť všetko';

    var otvor = document.createElement('button');
    otvor.type = 'button';
    otvor.className = 'kv-allmove__btn';
    otvor.textContent = 'Otvoriť všetko';

    zavri.addEventListener('click', function () { setAll(root, false); });
    otvor.addEventListener('click', function () { setAll(root, true); });

    wrap.appendChild(zavri);
    wrap.appendChild(otvor);
    bar.appendChild(wrap);
  }

  /* --- 2 · fullscreen bez scrollovania ---------------------------------- */

  function scrollToConfigurator() {
    var el = document.querySelector('[data-sp-cfg]') || document.querySelector(ROOT_SEL);
    if (!el) return;
    window.requestAnimationFrame(function () {
      el.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
  }

  document.addEventListener('fullscreenchange', function () {
    if (document.fullscreenElement) scrollToConfigurator();
  });

  /* --- štart ------------------------------------------------------------ */

  // Konfigurátor si obsah vykresľuje sám, preto čakáme, kým sa objaví,
  // a potom sledujeme ďalšie prekreslenia (prepnutie kroku, modelu, stránky).
  function boot() {
    wireAll();
    wireAllToggle();
    var root = document.getElementById('kv-root');
    if (root && 'MutationObserver' in window) {
      new MutationObserver(function () { wireAll(); wireAllToggle(); }).observe(root, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
