(() => {
      const root = document.getElementById('SoltecPremium');
      if (!root || root.dataset.spReady === 'true') return;
      root.dataset.spReady = 'true';
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      root.classList.add('sp-motion-ready');
      const header = document.querySelector('.section-header');
      // The Koverta header hides on scroll down and returns on scroll up. Recomputing the
      // local nav offset on every scroll frame made it jitter, so we only switch between
      // two discrete positions and let CSS animate between them.
      let headerHeight = 0;
      let headerShown = null;
      const measureHeader = () => {
        if (!header) return;
        const rect = header.getBoundingClientRect();
        const h = Math.round(rect.height);
        if (h > 0) headerHeight = h;
      };
      const setStickyTop = () => {
        if (!header) { root.style.setProperty('--sp-sticky-top', '0px'); return; }
        const rect = header.getBoundingClientRect();
        // visible when its bottom edge sits at least half its height into the viewport
        const shown = rect.bottom > headerHeight * 0.5;
        if (shown === headerShown) return;
        headerShown = shown;
        root.style.setProperty('--sp-sticky-top', shown ? `${headerHeight}px` : '0px');
      };
      measureHeader();
      setStickyTop();

      const revealItems = [...root.querySelectorAll('[data-sp-reveal]')];
      if (!('IntersectionObserver' in window) || reducedMotion) {
        revealItems.forEach((item) => item.classList.add('is-visible'));
      } else {
        const revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }), { threshold: 0, rootMargin: '0px 0px -6% 0px' });
        // Stagger siblings inside the same grid so rows arrive one after another.
        const groups = new Map();
        revealItems.forEach((item) => {
          const parent = item.parentElement;
          if (!groups.has(parent)) groups.set(parent, 0);
          const index = groups.get(parent);
          if (index > 0) item.style.setProperty('--sp-delay', `${Math.min(index, 4) * 90}ms`);
          groups.set(parent, index + 1);
        });
        revealItems.forEach((item) => revealObserver.observe(item));
        // Safety net: rescue only what the visitor could already have seen. Revealing
        // everything would silently switch the whole page on 2.5s after load, so
        // nothing further down would ever animate as it scrolls into view.
        window.setTimeout(() => revealItems.forEach((item) => {
          if (item.getBoundingClientRect().top < window.innerHeight) item.classList.add('is-visible');
        }), 2500);
      }

      const navLinks = [...root.querySelectorAll('[data-sp-nav]')];
      const sections = navLinks.map((link) => root.querySelector(`#${link.dataset.spNav}`)).filter(Boolean);
      const localNav = root.querySelector('[data-sp-local-nav]');
      const isCarport = root.dataset.spPage === 'carport';
      let activeNavIndex = -1;
      let lastNavScrollY = window.scrollY;
      let navLockUntil = 0;
      let navHidden = false;
      let navIdleTimer = 0;
      let navInteracting = false;

      const setNavHidden = (hidden) => {
        if (!isCarport || !localNav || hidden === navHidden) return;
        navHidden = hidden;
        localNav.classList.toggle('is-auto-hidden', hidden);
        const navHeight = Math.max(3, Math.round(localNav.getBoundingClientRect().height));
        root.style.setProperty('--sp-local-nav-space', hidden ? '0px' : `${navHeight}px`);
      };

      const clearNavIdleTimer = () => {
        if (!navIdleTimer) return;
        window.clearTimeout(navIdleTimer);
        navIdleTimer = 0;
      };

      const canAutoHideNav = () => {
        if (!isCarport || !localNav) return false;
        const stickyTop = parseFloat(getComputedStyle(root).getPropertyValue('--sp-sticky-top')) || 0;
        const hero = root.querySelector('#sp-prehlad');
        const heroBottom = hero ? hero.getBoundingClientRect().bottom + window.scrollY : 0;
        return window.scrollY > heroBottom - stickyTop - 8;
      };

      const scheduleNavHide = (delay = 1450) => {
        if (!canAutoHideNav() || navInteracting) return;
        clearNavIdleTimer();
        navIdleTimer = window.setTimeout(() => {
          if (Date.now() > navLockUntil && !navInteracting) setNavHidden(true);
        }, delay);
      };

      const updateCarportNav = () => {
        if (!isCarport || !localNav || !sections.length) return;
        const scrollY = window.scrollY;
        const delta = scrollY - lastNavScrollY;
        const stickyTop = parseFloat(getComputedStyle(root).getPropertyValue('--sp-sticky-top')) || 0;
        const navHeight = localNav.offsetHeight || 52;
        const hero = root.querySelector('#sp-prehlad');
        const heroBottom = hero ? hero.getBoundingClientRect().bottom + scrollY : 0;
        const beyondHero = scrollY > heroBottom - stickyTop - 8;

        if (beyondHero) {
          if (Math.abs(delta) > 1) {
            setNavHidden(false);
            scheduleNavHide();
          } else if (Date.now() > navLockUntil) {
            scheduleNavHide(1200);
          }
        } else {
          clearNavIdleTimer();
          setNavHidden(false);
        }
        lastNavScrollY = scrollY;
        root.style.setProperty('--sp-local-nav-space', navHidden ? '0px' : `${navHeight}px`);

        const marker = scrollY + stickyTop + (navHidden ? 12 : navHeight + 12);
        const starts = sections.map((sectionItem) => sectionItem.getBoundingClientRect().top + scrollY);
        const ends = sections.map((sectionItem, index) => index < sections.length - 1 ? starts[index + 1] : sectionItem.getBoundingClientRect().bottom + scrollY);
        let index = 0;
        for (let i = 0; i < starts.length; i += 1) {
          if (marker >= starts[i]) index = i;
        }
        index = Math.max(0, Math.min(index, sections.length - 1));
        const span = Math.max(1, ends[index] - starts[index]);
        const segmentProgress = Math.max(0, Math.min(1, (marker - starts[index]) / span));

        navLinks.forEach((link, linkIndex) => {
          const active = linkIndex === index;
          link.classList.toggle('is-active', active);
          link.classList.toggle('is-complete', linkIndex < index);
          link.style.setProperty('--sp-segment', linkIndex < index ? '1' : active ? String(segmentProgress) : '0');
          if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
        });

        if (activeNavIndex !== index) {
          activeNavIndex = index;
          const active = navLinks[index];
          if (active && active.parentElement) {
            const rail = active.parentElement;
            const desiredLeft = active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2;
            rail.scrollTo({ left: Math.max(0, desiredLeft), behavior: reducedMotion ? 'auto' : 'smooth' });
          }
        }
      };

      if (!isCarport && 'IntersectionObserver' in window) {
        const sectionObserver = new IntersectionObserver((entries) => {
          const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (!visible) return;
          navLinks.forEach((link) => link.classList.toggle('is-active', link.dataset.spNav === visible.target.id));
          const active = navLinks.find((link) => link.dataset.spNav === visible.target.id);
          if (active && active.parentElement) {
            const rail = active.parentElement;
            const desiredLeft = active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2;
            rail.scrollTo({ left: Math.max(0, desiredLeft), behavior: reducedMotion ? 'auto' : 'smooth' });
          }
        }, { threshold: [0, .2, .5], rootMargin: '-30% 0px -55% 0px' });
        sections.forEach((sectionItem) => sectionObserver.observe(sectionItem));
      }

      const scrollToSection = (target) => {
        if (!target) return;
        if (!isCarport || !localNav) { target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' }); return; }
        setNavHidden(false);
        clearNavIdleTimer();
        navLockUntil = Date.now() + 1250;
        measureHeader();
        setStickyTop();
        const getTargetY = () => {
          const stickyTop = parseFloat(getComputedStyle(root).getPropertyValue('--sp-sticky-top')) || 0;
          const offset = stickyTop + localNav.offsetHeight + 10;
          return Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset);
        };
        window.scrollTo({ top: getTargetY(), behavior: reducedMotion ? 'auto' : 'smooth' });
        if (!reducedMotion) {
          window.setTimeout(() => {
            measureHeader();
            setStickyTop();
            const corrected = getTargetY();
            if (Math.abs(window.scrollY - corrected) > 3) window.scrollTo({ top: corrected, behavior: 'auto' });
          }, 680);
          window.setTimeout(() => scheduleNavHide(1600), 760);
        } else {
          scheduleNavHide(1600);
        }
      };

      if (isCarport && localNav) {
        localNav.addEventListener('pointerenter', () => {
          navInteracting = true;
          clearNavIdleTimer();
          setNavHidden(false);
        });
        localNav.addEventListener('pointerleave', () => {
          navInteracting = false;
          scheduleNavHide(1300);
        });
        localNav.addEventListener('focusin', () => {
          navInteracting = true;
          clearNavIdleTimer();
          setNavHidden(false);
        });
        localNav.addEventListener('focusout', (event) => {
          if (localNav.contains(event.relatedTarget)) return;
          navInteracting = false;
          scheduleNavHide(1300);
        });
      }

      root.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener('click', (event) => {
        const target = root.querySelector(link.getAttribute('href'));
        if (!target) return;
        event.preventDefault();
        scrollToSection(target);
      }));

      const explorer = root.querySelector('[data-sp-explorer]');
      if (explorer) {
        const tabs = [...explorer.querySelectorAll('[data-sp-model]')];
        const panels = [...explorer.querySelectorAll('[data-sp-panel]')];
        const labels = [...explorer.querySelectorAll('[data-sp-selected-label]')];
        const descs = [...explorer.querySelectorAll('[data-sp-selected-desc]')];
        const counts = [...explorer.querySelectorAll('[data-sp-selected-count]')];
        let activeIndex = 0;
        const activate = (index, focus = false) => {
          activeIndex = (index + panels.length) % panels.length;
          tabs.forEach((tab, tabIndex) => {
            const active = tabIndex === activeIndex;
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
            if (active && focus) tab.focus({ preventScroll: true });
          });
          panels.forEach((panel, panelIndex) => {
            const active = panelIndex === activeIndex;
            panel.hidden = !active;
            panel.classList.remove('is-entering');
            if (active && !reducedMotion) requestAnimationFrame(() => panel.classList.add('is-entering'));
          });
          const activePanel = panels[activeIndex];
          labels.forEach((label) => { label.textContent = activePanel.dataset.spLabel || ''; });
          descs.forEach((desc) => { desc.textContent = activePanel.dataset.spDesc || ''; });
          counts.forEach((count) => { count.textContent = `${activeIndex + 1} / ${panels.length}`; });

        };
        tabs.forEach((tab, index) => {
          tab.addEventListener('click', () => activate(index));
          tab.addEventListener('keydown', (event) => {
            if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1);
            activate(nextIndex, true);
          });
        });
        explorer.querySelectorAll('[data-sp-prev]').forEach((button) => button.addEventListener('click', () => activate(activeIndex - 1)));
        explorer.querySelectorAll('[data-sp-next]').forEach((button) => button.addEventListener('click', () => activate(activeIndex + 1)));
        explorer.querySelectorAll('[data-sp-diagram-toggle]').forEach((button) => button.addEventListener('click', () => {
          const figure = button.closest('.sp-model-figure');
          const diagram = figure && figure.querySelector('[data-sp-diagram]');
          if (!diagram) return;
          const open = diagram.classList.toggle('is-open');
          button.setAttribute('aria-expanded', String(open));
          const symbol = button.querySelector('span');
          if (symbol) symbol.textContent = open ? '−' : '+';
        }));
        activate(0);
      }

      /* ------------------------------------------------- price configurator */
      const calc = root.querySelector('[data-sp-calc]');
      const priceNode = root.querySelector('[data-sp-price-data]');
      let priceData = null;
      if (calc && priceNode) {
        try { priceData = JSON.parse(priceNode.textContent); } catch (error) { priceData = null; }
      }
      if (calc && priceData) {
        const money = new Intl.NumberFormat('sk-SK', { maximumFractionDigits: 0 });
        const areaFormat = new Intl.NumberFormat('sk-SK', { maximumFractionDigits: 1 });
        const mm = (value) => `${money.format(value)} mm`;
        const out = (name) => calc.querySelector(`[data-sp-out-${name}]`);
        const modelButtons = [...calc.querySelectorAll('[data-sp-model-key]')];
        const loadButtons = [...calc.querySelectorAll('[data-sp-load-key]')];
        const widthSlider = calc.querySelector('[data-sp-width]');
        const lengthSlider = calc.querySelector('[data-sp-length]');
        const widthWrap = calc.querySelector('[data-sp-width-slider]');
        const widthFixed = calc.querySelector('[data-sp-width-fixed]');
        const widthFixedVal = calc.querySelector('[data-sp-width-fixed-val]');
        const loadField = calc.querySelector('[data-sp-load-field]');
        const boxEnabled = calc.querySelector('[data-sp-box-enabled]');
        const boxConfig = calc.querySelector('[data-sp-box-config]');
        const boxAvailability = calc.querySelector('[data-sp-box-availability]');
        const boxMaterial = calc.querySelector('[data-sp-box-material]');
        const boxWidth = calc.querySelector('[data-sp-box-width]');
        const boxDepth = calc.querySelector('[data-sp-box-depth]');
        const boxPriceOut = calc.querySelector('[data-sp-box-price]');
        const ceiling = calc.querySelector('[data-sp-ceiling]');
        const ledType = calc.querySelector('[data-sp-led-type]');
        const ledLength = calc.querySelector('[data-sp-led-length]');
        const ledQty = calc.querySelector('[data-sp-led-qty]');
        const sensorInputs = [...calc.querySelectorAll('[data-sp-sensor]')];
        const state = { key: priceData.order[0], w: 0, l: 0, load: 0, wValue: null, lValue: null };

        const priceBandIndex = (values, value) => {
          if (!Array.isArray(values) || !values.length) return 0;
          const target = Number(value);
          let index = 0;
          for (let i = 1; i < values.length; i += 1) {
            if (target < values[i]) break;
            index = i;
          }
          return index;
        };
        const syncPriceBands = (currentModel) => {
          if (currentModel.type === 'grid') state.w = priceBandIndex(currentModel.widths, state.wValue);
          state.l = priceBandIndex(currentModel.lengths, state.lValue);
        };

        const paintTrack = (slider) => {
          const min = Number(slider.min) || 0;
          const max = Number(slider.max) || 1;
          const value = Number(slider.value);
          slider.style.setProperty('--sp-fill', `${((value - min) / (max - min || 1)) * 100}%`);
        };

        const setScale = (prefix, values) => {
          const min = calc.querySelector(`[data-sp-${prefix}-min]`);
          const max = calc.querySelector(`[data-sp-${prefix}-max]`);
          if (min) min.textContent = mm(values[0]);
          if (max) max.textContent = mm(values[values.length - 1]);
        };

        const getBoxTable = () => {
          const box = priceData.addons?.box;
          const family = box?.modelFamily?.[state.key];
          return family ? box?.tables?.[family] : null;
        };

        const syncBoxDimensions = (carportWidth, carportLength) => {
          const table = getBoxTable();
          if (!boxWidth || !boxDepth || !table) return;
          const syncSelect = (select, values, emptyLabel) => {
            const current = Number(select.value) || 0;
            select.innerHTML = '';
            values.forEach((value) => {
              const option = document.createElement('option');
              option.value = String(value);
              option.textContent = mm(value);
              select.appendChild(option);
            });
            if (values.length) {
              const selected = values.includes(current) ? current : values.reduce((best, value) => Math.abs(value - current) < Math.abs(best - current) ? value : best, values[0]);
              select.value = String(selected);
            } else {
              const option = document.createElement('option');
              option.value = '';
              option.textContent = emptyLabel;
              select.appendChild(option);
            }
            return values.length > 0;
          };
          const widths = table.constrainWidth ? table.widths.filter((value) => value <= carportWidth) : table.widths;
          const depths = table.depths.filter((value) => value <= carportLength);
          const hasWidth = syncSelect(boxWidth, widths, 'rozmer nie je dostupný');
          const hasDepth = syncSelect(boxDepth, depths, 'rozmer nie je dostupný');
          if (boxEnabled) {
            boxEnabled.disabled = !(hasWidth && hasDepth);
            if (boxEnabled.disabled) boxEnabled.checked = false;
          }
          if (boxAvailability) boxAvailability.hidden = Boolean(hasWidth && hasDepth);
          if (boxConfig) boxConfig.hidden = !(boxEnabled && boxEnabled.checked);
        };

        const getAddonTotal = (area, carportWidth, carportLength) => {
          const details = [];
          let total = 0;
          syncBoxDimensions(carportWidth, carportLength);

          if (boxEnabled?.checked && boxWidth?.value && boxDepth?.value) {
            const table = getBoxTable();
            const material = boxMaterial?.value || 'iso';
            const depth = String(boxDepth.value);
            const width = String(boxWidth.value);
            const boxPrice = table?.prices?.[material]?.[depth]?.[width] || 0;
            total += boxPrice;
            details.push(`box ${material === 'wood' ? 'drevo' : 'ISO'} ${money.format(Number(width))} × ${money.format(Number(depth))} mm: ${money.format(boxPrice)} €`);
            if (boxPriceOut) boxPriceOut.textContent = `${money.format(boxPrice)} €`;
          } else if (boxPriceOut) {
            boxPriceOut.textContent = '—';
          }

          const ceilingType = ceiling?.value || 'none';
          if (ceilingType !== 'none') {
            const rate = priceData.addons?.ceiling?.[ceilingType] || 0;
            const ceilingPrice = Math.round(area * rate);
            total += ceilingPrice;
            details.push(`${ceilingType === 'wood' ? 'drevený' : 'ALU'} strop: cca ${money.format(ceilingPrice)} €`);
          }

          const lightType = ledType?.value || 'none';
          if (lightType !== 'none') {
            const length = String(ledLength?.value || 500);
            const qty = Math.max(1, Math.min(12, Number(ledQty?.value) || 1));
            if (ledQty) ledQty.value = String(qty);
            const unit = priceData.addons?.led?.[lightType]?.[length] || 0;
            const ledPrice = unit * qty;
            total += ledPrice;
            details.push(`LED ${Number(length) / 1000} m × ${qty}: ${money.format(ledPrice)} €`);
          }

          sensorInputs.forEach((input) => {
            if (!input.checked) return;
            const key = input.dataset.spSensor;
            const value = priceData.addons?.sensors?.[key] || 0;
            const names = { wind: 'veterný senzor', rain: 'dažďový senzor', temp: 'teplotný senzor' };
            total += value;
            details.push(`${names[key] || key}: ${money.format(value)} €`);
          });

          return { total, details };
        };

        const render = () => {
          const model = priceData.models[state.key];
          const isGrid = model.type === 'grid';
          syncPriceBands(model);
          const width = isGrid ? Number(state.wValue) : model.width;
          const length = Number(state.lValue);
          const basePrice = isGrid
            ? model.prices[state.l][state.w]
            : model.prices[String(model.loads[state.load])][state.l];
          const loadLabel = isGrid ? model.loadNote : `${model.loads[state.load]} kg/m²`;
          const area = (width * length) / 1000000;
          const addons = getAddonTotal(area, width, length);
          const totalPrice = basePrice + addons.total;

          const widthOut = calc.querySelector('[data-sp-width-out]');
          const lengthOut = calc.querySelector('[data-sp-length-out]');
          if (widthOut) widthOut.textContent = mm(width);
          if (lengthOut) lengthOut.textContent = mm(length);

          if (out('model')) out('model').textContent = model.name;
          if (out('price')) out('price').textContent = `${money.format(totalPrice)} €`;
          if (out('base-price')) out('base-price').textContent = `${money.format(basePrice)} €`;
          if (out('addons-price')) out('addons-price').textContent = `${money.format(addons.total)} €`;
          if (out('addons-desc')) out('addons-desc').textContent = addons.details.length ? addons.details.join(' · ') : 'Bez doplnkov z kalkulačky.';
          if (out('size')) out('size').textContent = `${money.format(width)} × ${money.format(length)} mm`;
          if (out('area')) out('area').textContent = `${areaFormat.format(area)} m²`;
          if (out('cars')) out('cars').textContent = model.cars;
          if (out('load')) out('load').textContent = loadLabel;
          if (out('roof')) out('roof').textContent = model.roof;

          const addonPanels = [...calc.querySelectorAll('[data-sp-addon-panel]')];
          const anySensor = sensorInputs.some((input) => input.checked);
          addonPanels.forEach((panel) => {
            const key = panel.dataset.spAddonPanel;
            const selected = key === 'box' ? Boolean(boxEnabled?.checked) : key === 'ceiling' ? (ceiling?.value || 'none') !== 'none' : key === 'led' ? (ledType?.value || 'none') !== 'none' : key === 'sensors' ? anySensor : false;
            panel.classList.toggle('is-selected', selected);
          });
          const boxSummary = calc.querySelector('[data-sp-addon-summary="box"]');
          if (boxSummary) boxSummary.textContent = boxEnabled?.checked && boxPriceOut?.textContent && boxPriceOut.textContent !== '—' ? boxPriceOut.textContent : 'od 3 681 €';

          if (widthSlider) paintTrack(widthSlider);
          if (lengthSlider) paintTrack(lengthSlider);
        };

        const setModel = (key) => {
          const model = priceData.models[key];
          if (!model) return;
          state.key = key;
          modelButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.spModelKey === key)));

          const isGrid = model.type === 'grid';
          if (widthWrap) widthWrap.hidden = !isGrid;
          if (widthFixed) widthFixed.hidden = isGrid;
          if (loadField) loadField.hidden = isGrid;

          if (isGrid && widthSlider) {
            const preferred = Number.isFinite(Number(model.defW)) ? Number(model.defW) : Math.round((model.widths.length - 1) / 2);
            state.w = Math.max(0, Math.min(preferred, model.widths.length - 1));
            state.wValue = model.widths[state.w];
            widthSlider.min = String(model.widths[0]);
            widthSlider.max = String(model.widths[model.widths.length - 1]);
            widthSlider.step = '1';
            widthSlider.value = String(state.wValue);
            setScale('width', model.widths);
          } else {
            state.w = 0;
            state.wValue = model.width;
            if (widthFixedVal) widthFixedVal.textContent = mm(model.width);
          }

          if (!isGrid) {
            state.load = model.defLoad || 0;
            loadButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === state.load)));
          }

          if (lengthSlider) {
            const preferred = Number.isFinite(Number(model.defL)) ? Number(model.defL) : Math.round((model.lengths.length - 1) / 2);
            state.l = Math.max(0, Math.min(preferred, model.lengths.length - 1));
            state.lValue = model.lengths[state.l];
            lengthSlider.min = String(model.lengths[0]);
            lengthSlider.max = String(model.lengths[model.lengths.length - 1]);
            lengthSlider.step = '1';
            lengthSlider.value = String(state.lValue);
            setScale('length', model.lengths);
          }
          render();
        };

        modelButtons.forEach((button) => button.addEventListener('click', () => setModel(button.dataset.spModelKey)));
        loadButtons.forEach((button, index) => button.addEventListener('click', () => {
          state.load = index;
          loadButtons.forEach((other, otherIndex) => other.setAttribute('aria-pressed', String(otherIndex === index)));
          render();
        }));
        if (widthSlider) widthSlider.addEventListener('input', () => {
          const model = priceData.models[state.key];
          state.wValue = Number(widthSlider.value);
          state.w = priceBandIndex(model.widths, state.wValue);
          render();
        });
        if (lengthSlider) lengthSlider.addEventListener('input', () => {
          const model = priceData.models[state.key];
          state.lValue = Number(lengthSlider.value);
          state.l = priceBandIndex(model.lengths, state.lValue);
          render();
        });
        if (boxEnabled) boxEnabled.addEventListener('change', () => { if (boxConfig) boxConfig.hidden = !boxEnabled.checked; render(); });
        [boxMaterial, boxWidth, boxDepth, ceiling, ledType, ledLength].forEach((control) => { if (control) control.addEventListener('change', render); });
        if (ledQty) ledQty.addEventListener('input', render);
        sensorInputs.forEach((input) => input.addEventListener('change', render));
        const addonPanels = [...calc.querySelectorAll('[data-sp-addon-panel]')];
        addonPanels.forEach((panel) => panel.addEventListener('toggle', () => {
          if (!panel.open) return;
          addonPanels.forEach((other) => { if (other !== panel) other.open = false; });
        }));

        const quoteButton = calc.querySelector('[data-sp-quote]');
        if (quoteButton) quoteButton.addEventListener('click', () => {
          const message = root.querySelector('textarea[name="contact[body]"]');
          if (message) {
            const addonText = out('addons-desc')?.textContent || 'Bez doplnkov z kalkulačky.';
            const summary = `Mám záujem o ${out('model').textContent} — rozmer ${out('size').textContent}, krytá plocha ${out('area').textContent}, zaťaženie ${out('load').textContent}. Konštrukcia: ${out('base-price').textContent}. Doplnky: ${addonText}. Cena zostavy vrátane montáže: ${out('price').textContent}.`;
            message.value = message.value.trim() ? `${message.value.trim()}\n\n${summary}` : `${summary}\n\nObec realizácie: `;
            message.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const target = root.querySelector('#sp-dopyt');
          if (target) scrollToSection(target);
          window.setTimeout(() => { if (message) message.focus({ preventScroll: true }); }, reducedMotion ? 0 : 700);
        });

        setModel(state.key);
      }

      /* -------------------------------------------- carport realization photo swap */
      const galleryRotator = root.querySelector('[data-sp-gallery-rotator]');
      if (isCarport && galleryRotator && !reducedMotion) {
        const image = galleryRotator.querySelector('[data-sp-gallery-swap]');
        const data = galleryRotator.querySelector('[data-sp-gallery-images]');
        let images = [];
        try { images = JSON.parse(data?.textContent || '[]'); } catch (error) { images = []; }
        let galleryIndex = 0;
        let galleryTimer = null;
        let galleryPaused = false;
        const preload = (src) => { if (!src) return; const img = new Image(); img.src = src; };
        const showGalleryImage = (nextIndex) => {
          if (!image || images.length < 2) return;
          galleryIndex = (nextIndex + images.length) % images.length;
          preload(images[(galleryIndex + 1) % images.length]);
          image.classList.add('is-switching');
          window.setTimeout(() => {
            image.src = images[galleryIndex];
            image.classList.remove('is-switching');
          }, 180);
        };
        const startGallery = () => {
          window.clearInterval(galleryTimer);
          galleryTimer = window.setInterval(() => { if (!galleryPaused && !document.hidden) showGalleryImage(galleryIndex + 1); }, 6500);
        };
        galleryRotator.addEventListener('mouseenter', () => { galleryPaused = true; });
        galleryRotator.addEventListener('mouseleave', () => { galleryPaused = false; });
        galleryRotator.addEventListener('focusin', () => { galleryPaused = true; });
        galleryRotator.addEventListener('focusout', () => { galleryPaused = false; });
        preload(images[1]);
        startGallery();
      }

      /* ------------------------------------------------ accessories carousel */
      const acc = root.querySelector('[data-sp-acc]');
      if (acc) {
        const slides = [...acc.querySelectorAll('[data-sp-acc-slide]')];
        const dotsWrap = root.querySelector('[data-sp-acc-dots]');
        let accIndex = 0;
        const showAcc = (index) => {
          accIndex = (index + slides.length) % slides.length;
          slides.forEach((slide, slideIndex) => { slide.hidden = slideIndex !== accIndex; });
          dots.forEach((dot, dotIndex) => dot.setAttribute('aria-current', String(dotIndex === accIndex)));

        };
        const dots = slides.map((slide, index) => {
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.setAttribute('role', 'tab');
          dot.setAttribute('aria-label', slide.dataset.spAccTitle || `Doplnok ${index + 1}`);
          dot.addEventListener('click', () => showAcc(index));
          if (dotsWrap) dotsWrap.appendChild(dot);
          return dot;
        });
        const prev = root.querySelector('[data-sp-acc-prev]');
        const next = root.querySelector('[data-sp-acc-next]');
        if (prev) prev.addEventListener('click', () => showAcc(accIndex - 1));
        if (next) next.addEventListener('click', () => showAcc(accIndex + 1));
        if (dotsWrap) dotsWrap.addEventListener('keydown', (event) => {
          if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
          event.preventDefault();
          const nextIndex = accIndex + (event.key === 'ArrowRight' ? 1 : -1);
          showAcc(nextIndex);
          dots[(nextIndex + slides.length) % slides.length].focus({ preventScroll: true });
        });
        showAcc(0);
      }

      const parallaxItems = isCarport ? [...root.querySelectorAll('[data-sp-parallax]')] : null;
      /* ------------------------------------------- pergola configurator (bio) */
      // The detailed price list sits behind a switch. This must respond even before
      // the configurator has lazily booted, so it is wired here rather than inside it.
      const cfgSectionEl = root.querySelector('.sp-cfg');
      if (cfgSectionEl) {
        cfgSectionEl.addEventListener('click', (event) => {
          const tab = event.target.closest('[data-sp-cfg-tab]');
          if (!tab) return;
          cfgSectionEl.querySelectorAll('[data-sp-cfg-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === tab)));
          const go = root.querySelector(tab.dataset.spCfgTab === 'quote' ? '[data-sp-goto="5"]' : '[data-sp-goto="1"]');
          if (go) go.click();
        });
      }

      const calcSwitch = root.querySelector('[data-sp-show-calc]');
      const pricingSection = root.querySelector('[data-sp-pricing]');
      if (calcSwitch && pricingSection) {
        calcSwitch.addEventListener('click', () => {
          const open = pricingSection.hidden;
          pricingSection.hidden = !open;
          calcSwitch.setAttribute('aria-expanded', String(open));
          calcSwitch.textContent = open ? 'Skryť podrobný cenník' : 'Zobraziť podrobný cenník';
          if (open) pricingSection.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
        });
      }

      const cfgRoot = root.querySelector('[data-sp-cfg]');
      const cfgDataNode = root.querySelector('[data-sp-bio-data]');
      // Nothing here runs on page load. The payload is only parsed and the SVG only
      // built once the configurator is close to the viewport, so it costs the rest
      // of the page nothing in main-thread time or Largest Contentful Paint.
      const bootConfigurator = () => {
      let BIO = null;
      if (cfgRoot && cfgDataNode) { try { BIO = JSON.parse(cfgDataNode.textContent); } catch (error) { BIO = null; } }
      let REF = null;
      let refIdx = 0;
      const refNode = root.querySelector('[data-sp-ref-photos]');
      if (refNode) { try { REF = JSON.parse(refNode.textContent); } catch (error) { REF = null; } }

      if (cfgRoot && BIO) {
        /* Standalone GitHub Pages builds made before the guided-flow redesign
           still contain the original seven small steps. Upgrade that markup in
           place so the same production script can serve Shopify and the public
           customer link without maintaining two configurators. */
        const normalizeLegacySteps = () => {
          const rail = cfgRoot.querySelector('.sp-rail');
          if (!rail || rail.querySelectorAll('[data-sp-goto]').length === 6) return;
          rail.innerHTML = [
            ['1', 'Riešenie', 'Riešenie'],
            ['2', 'Rozmer', 'Rozmer'],
            ['3', 'Strecha a farby', 'Strecha'],
            ['4', 'Boky', 'Boky'],
            ['5', 'Doplnky', 'Doplnky'],
            ['6', 'Súhrn', 'Súhrn']
          ].map(([n, title, label], i) => `<button type="button" data-sp-goto="${n}" aria-current="${i === 0}" title="${title}"><i>${n}</i><span>${label}</span></button>`).join('');
          /* Doplnky mali vlastný panel (6), ale delili krok s výberom bokov —
             boli až pod celým zoznamom výplní. Dostávajú vlastný krok. */
          const stepMap = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 3, 6: 5, 7: 6 };
          cfgRoot.querySelectorAll('.sp-step[data-sp-stepno]').forEach((panel) => {
            const oldStep = Number(panel.dataset.spStepno);
            const nextStep = stepMap[oldStep];
            if (!nextStep) return;
            panel.dataset.spStepno = String(nextStep);
            const badge = panel.querySelector('.sp-step__n');
            if (badge && oldStep === 2) badge.remove();
            else if (badge) badge.textContent = String(nextStep);
          });
          const cap = cfgRoot.querySelector('[data-sp-stepcap]');
          const name = cfgRoot.querySelector('[data-sp-stepname]');
          if (cap) cap.textContent = 'Krok 1 z 5';
          if (name) name.textContent = 'Riešenie';
        };
        normalizeLegacySteps();

        const NS = 'http://www.w3.org/2000/svg';
        const money = new Intl.NumberFormat('sk-SK', { maximumFractionDigits: 0 });
        const area1 = new Intl.NumberFormat('sk-SK', { maximumFractionDigits: 1 });
        const mm = (v) => `${money.format(v)} mm`;
        const svgEl = (name, attrs) => {
          const node = document.createElementNS(NS, name);
          for (const key in attrs) node.setAttribute(key, attrs[key]);
          return node;
        };
        // Shade a hex colour towards white (amt > 0) or black (amt < 0).
        /* a fixed hash, so a board keeps its tone from one render to the next */
        const grain = (i) => { const s = Math.sin(i * 12.9898 + 4.137) * 43758.5453; return s - Math.floor(s); };
        const LARCH = '#b0824e';
        const COURSE = 74;     // "wood rhomb 70x24" plus the shadow gap
        /* Jedna stena rombového smrekovca má 33 radov a šesť plôch na rad —
           tieň, dva skosy, líce a dve kresby dreva — a stojí za to. Šestnásť
           posuvných krídel cez deväť metrov je päťsto radov a tri tisíc plôch;
           maliarske triedenie je na nich kvadratické a jeden ťah posuvníkom
           trval sekundy. Preto dosky s pribúdajúcim počtom rednú: plný profil,
           kým je rozpočet, potom len tieň a líce, a nakoniec jedna plocha na
           rad. Pri deviatich metroch sú od seba na obrazovke dva pixely. */
        /* Úroveň musí byť pre celú stenu jedna. Miešať profilované a ploché
           dosky vedľa seba vyzerá presne ako chyba výroby, čomu sa vyhýbame,
           takže sa rozhoduje dopredu z počtu radov, ktoré celá zostava bude
           potrebovať — nie priebežne, ako sa míňa rozpočet. */
        let cladLevel = 2;         // 2 plný profil, 1 tieň a líce, 0 jedna plocha
        let cladStride = 1;
        const ALU_COURSE = 54; // "alu slat 10/50 mm"
        /* the tone of the board at a given height, the same on every face */
        const boardTone = (k, hex) => {
          /* Larch varies board to board, but not as much as a random spread
             suggests - a wide swing reads as noise rather than timber. */
          const g = (grain(k) + grain(k + 97)) / 2;
          return shade(hex || LARCH, (g - 0.5) * 0.22);
        };

        const shade = (hex, amt) => {
          const source = String(hex || '#000000');
          const n = source.charAt(0) === '#' ? parseInt(source.slice(1), 16) : 0;
          const rgb = source.charAt(0) === '#' ? [(n >> 16) & 255, (n >> 8) & 255, n & 255]
            : (source.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
          const mix = (c) => Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt));
          const r = mix(rgb[0] || 0), g = mix(rgb[1] || 0), b = mix(rgb[2] || 0);
          return `rgb(${r},${g},${b})`;
        };

        const SIDE_OPTS = [
          { id: 'open',  label: 'Otvorená',                     note: '—' },
          { id: 'zip',   label: 'ZIP roleta K130',              note: 'podľa šírky' },
          { id: 'g1',    label: 'Sklenené posuvné panely G1',   note: 'podľa rozmeru' },
          { id: 'g2',    label: 'Sklenené skladacie panely G2', note: 'podľa rozmeru' },
          { id: 'h50l',  label: 'Posuvné panely H50 — drevo',   note: 'podľa rozmeru' },
          { id: 'h50a',  label: 'Posuvné panely H50 — hliník',  note: 'podľa rozmeru' },
          { id: 'fi30',  label: 'Stena ISO 3 — izolačný panel 30 mm', note: 'podľa výšky' },
          { id: 'fw25',  label: 'Stena WOOD — sibírsky smrekovec',  note: 'podľa výšky' },
          { id: 'l44es', label: 'Stena L44-ES — ťahokov',            note: 'podľa výšky' },
          { id: 'l44alu', label: 'Stena L44-ALU 20/20 — hliník',     note: 'podľa výšky' },
          { id: 'e300',  label: 'Brisoleje E300',                    note: 'na nacenenie' }
        ];
        const SIDE_LABEL = { front: 'Predná', rear: 'Zadná', left: 'Ľavá', right: 'Pravá' };
        const SIDE_LOCATIVE = { front: 'prednej', rear: 'zadnej', left: 'ľavej', right: 'pravej' };
        /* the ones with a motor or a track; the rest are fixed walls */
        const SIDE_MOVES = { zip: 'roleta', g1: 'panely', g2: 'panely', h50l: 'panely', h50a: 'panely' };
        /* Five factory duotone ISO-panel combinations listed on page 41 of the
           2026 Soltec price book. Top and soffit are one catalogue option, not
           two independent pickers: keeping them paired prevents configurations
           the manufacturer does not offer. These are panel factory colours,
           not powder-coated structural colours. */
        const ROOF_FINISHES = [
          { top: 'RAL 9002', bottom: 'RAL 9002', topHex: '#d7d5c8', bottomHex: '#d7d5c8' },
          { top: 'RAL 9006', bottom: 'RAL 9002', topHex: '#a7aaa8', bottomHex: '#d7d5c8' },
          { top: 'RAL 7016', bottom: 'RAL 9002', topHex: '#383e42', bottomHex: '#d7d5c8' },
          { top: 'RAL 9002', bottom: 'RAL 9006', topHex: '#d7d5c8', bottomHex: '#a7aaa8' },
          { top: 'RAL 9002', bottom: 'RAL 7016', topHex: '#d7d5c8', bottomHex: '#383e42' }
        ];
        /* The blade cannot swing past the point where its tips break out
           through the section: arcsin(170/200) for a 200 blade in a 170
           profile. Everything between shut and there is one continuous run. */
        const LOUVER_MAX = (beam, bw) => Math.asin(Math.min(1, (beam * 0.94) / (bw || 200)));
        /* Zatvorené lamely majú tvoriť jednu rovnú plochu — zhora aj zdola.
           Predtým si každá nechávala pár stupňov, aby sa v jednej rovine
           neprekrývali: prekryté vodorovné plochy maliarske triedenie nevie
           zoradiť, delilo ich na kusy a ich počet sa medzi snímkami hádzal zo
           100 na 160, čo na obrazovke vyzeralo ako poskakovanie. Tie stupne
           však bolo vidieť — zatvorená strecha bola pílovitá. Rieši sa to
           opačne, nižšie pri kreslení: pri dosadnutí sa prekrytie stiahne na
           nulu a lamely sa poskladajú vedľa seba. Niet čo triediť, a plocha
           je rovná. */
        const LOUVER_MIN_T = 0;
        const louverAngle = (beam, bw, t) => LOUVER_MAX(beam, bw) * (LOUVER_MIN_T + (1 - LOUVER_MIN_T) * t);
        const LOUVER_STOPS = [
          { t: 0, label: 'Zatvorené' },
          { t: 0.84, label: 'Polotieň' },
          { t: 1, label: 'Otvorené' }
        ];

        const state = {
          model: BIO.order[0],
          placement: 'tip1',
          width: 0, length: 0, widthValue: null, lengthValue: null, height: 2500,
          louverT: 0.84,          // 0 shut, 1 as far open as the section allows
          frameColor: BIO.colors[0],
          louverColor: BIO.colors[0],
          roofFinish: 0,
          sides: { front: 'open', rear: 'open', left: 'open', right: 'open' },
          sideColor: null,
          activeSide: 'front',
          sideOpen: { front: 0, rear: 0, left: 0, right: 0 },   // 0 shut, 1 run back
          car: null,              // which car stands under it, or none
          extras: {},                                          // id -> quantity
          extrasOpen: {},                                       // which lists are unfolded
          led: 0,
          anchor: 'none',
          box: { on: false, w: 0, d: 0, fin: 'iso' },
          boxColor: null,          // null = the box follows the frame
          ceiling: 'none',
          ledSet: { on: false, type: 'warm', len: 1, qty: 2 },
          sensors: { wind: false, rain: false, temp: false, snow: false, presence: false }
        };

        const model = () => BIO.models[state.model];
        /* The blade the model is actually built from. Five of the six are
           "200 x NN mm" and the 240/60 is "270 x 60 mm", and the length lists
           agree: they step by 183 on a 200 blade and by 253 on a 270, which is
           the same 17 mm lap the blades close on either way. Drawing every one
           of them 200 wide left the 240/60 with a 53 mm gap between blades
           that could never shut, and let it swing a full 90 degrees because
           the swing was measured against a 200 blade too. */
        const louverSize = () => {
          const m = model();
          const nums = String(m.louver || '').match(/\d+/g) || [];
          const pitch = (m.lengths && m.lengths.length > 1) ? m.lengths[1] - m.lengths[0] : 0;
          const w = nums.length > 1 ? Number(nums[0]) : (pitch ? pitch + 17 : 200);
          const t = nums.length ? Number(nums[nums.length - 1]) : 24;
          return { w: w || 200, t: t || 24 };
        };
        const isLoad = () => model().type === 'load';
        const dimensionBandIndex = (values, value) => {
          if (!Array.isArray(values) || !values.length) return 0;
          const target = Number(value);
          let index = 0;
          for (let i = 1; i < values.length; i += 1) {
            if (target < values[i]) break;
            index = i;
          }
          return index;
        };
        const widthMM = () => isLoad()
          ? model().width
          : (Number.isFinite(state.widthValue) ? state.widthValue : model().widths[state.width]);
        const lengthMM = () => Number.isFinite(state.lengthValue)
          ? state.lengthValue
          : model().lengths[state.length];
        /* SL is priced by load alone and G by load and size together, so the
           list of loads is not the same thing as the fixed-width SL layout. */
        /* Cars, to give the span a size the eye can read. The sections are
           real vehicle data - half-width, roof line and sill at each station
           along the length, with the wheel arches showing as a sill that rises.
           They arrived as a Three.js builder, which is no use here: this stage
           is a hand-written SVG projection with no scene, no meshes and nothing
           to dispose. The tables were the valuable half and they check out to
           the millimetre against each car's own overall dimensions. */
        const CARS = {"octavia":{"name":"Škoda Octavia Combi IV","length":4689,"width":1829,"height":1468,"wheel":660,"fa":900,"ra":3586,"hex":"#3d4750","s":[[0,670,610,200,0],[0.035,770,710,180,0],[0.08,830,780,160,0],[0.14,880,840,150,0],[0.192,915,890,280,0],[0.27,905,960,150,0],[0.34,840,1210,150,1],[0.41,770,1440,150,1],[0.5,760,1468,150,1],[0.62,760,1460,150,1],[0.72,770,1445,150,1],[0.765,915,1435,280,1],[0.84,860,1410,150,1],[0.9,840,1220,170,1],[0.95,870,990,220,0],[0.985,810,840,290,0],[1,690,720,340,0]]},"mustang":{"name":"Ford Mustang Shelby GT500","length":4780,"width":1950,"height":1380,"wheel":680,"fa":950,"ra":3670,"hex":"#6e2229","s":[[0,740,540,130,0],[0.04,840,660,120,0],[0.09,910,750,115,0],[0.16,950,820,115,0],[0.199,975,860,280,0],[0.31,940,930,120,0],[0.37,880,1120,120,1],[0.44,790,1360,120,1],[0.52,770,1380,120,1],[0.62,780,1330,120,1],[0.72,830,1180,120,1],[0.768,975,1060,280,0],[0.85,950,1020,130,0],[0.92,920,1090,200,0],[0.965,890,920,260,0],[1,780,760,310,0]]},"caddy":{"name":"Volkswagen Caddy 5","length":4500,"width":1855,"height":1798,"wheel":650,"fa":870,"ra":3625,"hex":"#b0b7bd","s":[[0,700,670,220,0],[0.045,810,790,190,0],[0.09,870,870,170,0],[0.15,910,980,160,0],[0.193,928,1040,290,0],[0.245,910,1110,160,0],[0.31,870,1450,160,1],[0.38,830,1760,160,1],[0.48,820,1798,160,1],[0.6,820,1795,160,1],[0.72,820,1790,160,1],[0.806,928,1785,290,1],[0.89,840,1775,160,1],[0.945,850,1480,210,1],[0.98,840,1020,280,0],[1,760,790,350,0]]}};
        const CAR_ORDER = ['octavia', 'mustang', 'caddy'];
        /* A bay is 2,5 m; the count follows the width, up to three abreast. */
        const carCount = () => Math.max(1, Math.min(3, Math.floor(widthMM() / 2500)));
        /* The shortest F is 3 m long - an entrance canopy, not a car shelter -
           and no car is shorter than 4,5 m. Offering one there would draw a
           car sticking half out of the roof, so the choice only appears where
           the structure can actually take one. */
        /* Zadný box zaberá koniec prístrešku, takže auto má na státie len to,
           čo zostane za ním. Bez tohto sa 4,7 m dlhé auto vykreslilo do
           prístrešku s 2,7 m boxom a prešlo cez jeho stenu. */
        const boxDepthMM = () => {
          if (!state.box || !state.box.on) return 0;
          const bp = boxPrice();
          return bp ? Math.min(bp.d, lengthMM()) : 0;
        };
        const clearLengthMM = () => lengthMM() - boxDepthMM();
        const carFits = (key) => {
          const c = CARS[key];
          return Boolean(c) && clearLengthMM() >= c.length + 240 && widthMM() >= 2300;
        };
        const anyCarFits = () => CAR_ORDER.some(carFits);
        const loadList = () => model().loads || model().gridLoads || null;
        const hasLoads = () => Boolean(loadList());
        const loadKg = () => (hasLoads() ? loadList()[state.load] : 100);
        const postSize = () => (String(state.model).indexOf('240') > -1 ? 150 : 120);
        const postLayout = () => {
          const L = lengthMM();
          const m = model();
          const four = m.post4 || 6000;
          let n = L <= four ? 2 : 3;
          /* "240 kg/m2: smax = 0,3 m, post distance max. 3 m" - the load picks
             the post count as much as the length does, and nothing here read
             it, so a 6 m SL at 240 stood on its four corners alone. */
          const gap = m.postGap240;
          if (gap && loadKg() >= 240) n = Math.max(n, Math.ceil(L / gap) + 1);
          return { n, oh: 0 };
        };
        const FALLBACK_PLACEMENTS = [
          { id: 'tip1', label: 'Samostatne stojaca', walls: [] },
          { id: 'tip2', label: 'Pri stene, kolmo', walls: ['rear'] },
          { id: 'tip4', label: 'Pri stene, pozdĺž', walls: ['left'] },
          { id: 'tip7', label: 'V rohu', walls: ['rear', 'left'] },
          { id: 'tip0', label: 'Bez stĺpov — medzi stenami', walls: ['rear'], noPosts: true },
          { id: 'tip6', label: 'Voľné stĺpy', walls: [], freePosts: true }
        ];
        const PLACEMENTS = (Array.isArray(BIO.placements) && BIO.placements.length) ? BIO.placements : FALLBACK_PLACEMENTS;
        const placement = (id) => PLACEMENTS.find((pp) => pp.id === (id || state.placement)) || PLACEMENTS[0];
        const placementWalls = () => placement().walls || [];
        if (!PLACEMENTS.some((pp) => pp.id === state.placement)) state.placement = PLACEMENTS[0].id;
        const postCount = () => {
          const lay = postLayout(), pl = placement();
          if (pl.noPosts) return 0;
          const w = pl.walls || [];
          let n = 0;
          for (let xi = 0; xi < lay.n; xi++) {
            for (const py of [0, 1]) {
              if (w.indexOf('rear') > -1 && py === 0) continue;
              if (w.indexOf('front') > -1 && py === 1) continue;
              if (w.indexOf('left') > -1 && xi === 0) continue;
              if (w.indexOf('right') > -1 && xi === lay.n - 1) continue;
              if (pl.freePosts && xi !== 0 && xi !== lay.n - 1) continue;
              n++;
            }
          }
          return n;
        };
        /* left edges, so the end posts finish flush with the ends of the roof */
        const postXs = () => {
          const L = lengthMM(), lay = postLayout(), ps = postSize(), span = L - ps;
          if (lay.n <= 2) return [0, span];
          /* Both "+ lopa" drawings stand the middle pair at the box's inner
             wall - P5 and P6 are the box's inner corners - so the store closes
             against a post instead of one landing in the middle of a clad face. */
          const bp = state.box && state.box.on ? boxPrice() : null;
          if (bp) {
            const at = Math.min(bp.d, L) - ps;
            if (at > ps && at < span - ps) return [0, Math.round(at), span];
          }
          if (lay.n === 3) {
            /* The books draw the middle pair at a distance, not at a fraction:
               "Mozna pozicija stebra P5 - Dolzina P1-P5 = 2306 mm" on a 17
               profile, 3416 on a 24, whatever the overall length. A third of
               the span drifted with it - 2 959 mm on an 8,7 m carport - so the
               bay a car parks in grew with the roof. A pergola's book gives no
               position, so that one still stands at mid-span. */
            const p5 = model().p5;
            if (p5) return [0, Math.round(Math.min(p5, span / 2)), span];
            const t = model().roof === 'panel' ? 0.34 : 0.5;   // access bay, or mid-span
            return [0, Math.round(span * t), span];
          }
          /* Four or more a side is the load's doing, not the length's, and the
             rule that put them there is a spacing - so they go up evenly and
             every bay comes out under it. */
          const out = [];
          for (let i = 0; i < lay.n; i++) out.push(Math.round((span * i) / (lay.n - 1)));
          return out;
        };
        const sideSpan = (side) => (side === 'front' || side === 'rear' ? lengthMM() : widthMM());
        /* How many leaves a side is made of. The price worked this out and the
           drawing assumed two, so a five-leaf H50 was quoted and drawn as a
           pair. One answer, so what a customer sees is what is on the quote.
           G2 folds rather than slides and the book caps a folding leaf at
           650 mm, which is what sets its count. */
        const G2_LEAF_MAX = 650;
        const sideLeaves = (kind, span) => {
          if (kind === 'h50l' || kind === 'h50a') {
            const ws = BIO.slideW || [];
            const widest = ws[ws.length - 1] || 1200;
            return Math.max(2, Math.ceil(span / widest));
          }
          if (kind === 'g1') {
            const g = BIO.glassPanel;
            if (g) {
              const sys = ['2', '3', '4', '5'].find((k) => g[k] && span <= g[k].len[g[k].len.length - 1] && span >= g[k].len[0]);
              if (sys) return Number(sys);
            }
            return 2;
          }
          if (kind === 'g2') return Math.max(2, Math.ceil(span / G2_LEAF_MAX));
          return 0;
        };

        /* The roof is a run of ISO panels, not a run of secondary-beam bays: the
           two spacings are different things and only the panels show as seams.
           The module falls out of the model's own length list, because the
           standard lengths on the "Konfiguracije strehe" pages step by exactly
           one panel - 1080 mm on a 170 profile, 1110 on a 240, over an end
           allowance of 63 resp. 93 mm. A length that is not on the list is made
           up with a REZAN PANEL: one in a four-post roof, one at each end in a
           six-post one, which is what those pages draw. Systems whose lengths run
           free rather than by the module - SL and the glazed G - have no such
           table and keep the plain division. */
        const PANEL_MIN = 900, PANEL_MAX = 1300;
        const roofModule = () => {
          const m = model();
          if (m.glazed === true || m.roof !== 'panel') return null;
          const ls = m.lengths || [];
          if (ls.length < 3) return null;
          const counts = {};
          for (let i = 1; i < ls.length; i++) {
            const d = ls[i] - ls[i - 1];
            counts[d] = (counts[d] || 0) + 1;
          }
          let p = 0, best = 0;
          for (const k in counts) if (counts[k] > best) { best = counts[k]; p = Number(k); }
          if (best < 2 || p < PANEL_MIN || p > PANEL_MAX) return null;
          // the allowance comes off a length that is itself on the module
          const std = ls.find((L) => ls.indexOf(L + p) > -1);
          if (std == null) return null;
          return { p: p, e: ((std % p) + p) % p };
        };
        /* left-to-right panel widths across the length, cut panels included */
        const roofPanels = () => {
          const mod = roofModule();
          if (!mod) return null;
          const L = lengthMM();
          const usable = L - mod.e;
          let full = Math.floor(usable / mod.p);
          let rem = usable - full * mod.p;
          if (full < 1) return null;
          /* Zvyšok pod touto hranicou nie je panel, ale škára. Priečny profil
             stojí na každom rozhraní modulov a je 50 až 80 mm široký, takže do
             modulu užšieho než dva profily sa paluba nezmestí: susedné profily
             sa prekryli a medzi nimi ostala diera bez panela — presne to bolo
             vidieť pri pravom kraji strechy. Taký zvyšok sa preto rozpustí do
             všetkých plných modulov a švy ostanú rovnomerné. */
          const MIN_MODUL = 300;
          if (rem < MIN_MODUL) return new Array(full).fill(mod.p + rem / full);
          const six = postLayout().n > 2;
          if (six && rem >= 2 * MIN_MODUL) {
            const half = rem / 2;
            return [half].concat(new Array(full).fill(mod.p)).concat([half]);
          }
          return [rem].concat(new Array(full).fill(mod.p));
        };

        /* --------------------------------------------------------- addons */
        const boxTable = () => {
          const box = BIO.addons && BIO.addons.box;
          if (!box) return null;
          const family = box.modelFamily[state.model];
          return family ? box.tables[family] : null;
        };
        /* Every size the price list carries, each carrying whether it still fits
           the structure as it is set right now. The box stands under the roof at
           one end, so its width cannot pass the width and its depth cannot pass
           the length. Sizes out of reach are kept on screen and disabled with the
           reason; dropping them left the customer with a single dead chip, or
           with the whole box gone and nothing saying why. */
        const boxWidths = () => {
          const t = boxTable();
          if (!t) return [];
          const W = widthMM();
          return t.widths.map((v) => ({ v: v, ok: !t.constrainWidth || v <= W }));
        };
        /* The store is the end bay, and the list gives that bay its own limit:
           "Dolžina lope* (P1-P5) od 1676 mm do 4276 mm" on F170, 1930 to 4526 on
           F240 - shorter than the structure it stands in. The panel table's own
           4 600 is a panel maximum, not a bay, so it sits outside both. */
        const boxBayMax = () => {
          const box = BIO.addons && BIO.addons.box;
          const cap = box && box.bayDepth && box.bayDepth[state.model];
          return cap || Infinity;
        };
        const boxDepths = () => {
          const t = boxTable();
          if (!t) return [];
          const L = lengthMM(), cap = boxBayMax();
          return t.depths.map((v) => ({ v: v, ok: v <= L && v <= cap, overBay: v > cap }));
        };
        /* what is selected if it still fits, otherwise the largest one that does */
        const boxFitIdx = (opts, want) => {
          if (opts[want] && opts[want].ok) return want;
          let best = -1;
          for (let k = 0; k < opts.length; k++) if (opts[k].ok) best = k;
          return best;
        };
        const boxPrice = () => {
          const t = boxTable();
          if (!t) return null;
          const ws = boxWidths(), ds = boxDepths();
          const wi = boxFitIdx(ws, state.box.w), di = boxFitIdx(ds, state.box.d);
          if (wi < 0 || di < 0) return null;
          const w = ws[wi].v, d = ds[di].v;
          const table = t.prices[state.box.fin];
          const row = table && table[String(d)];
          const v = row && row[String(w)];
          return typeof v === "number" ? { v: v, w: w, d: d, wi: wi, di: di } : null;
        };

        const boxFinishLabel = (key = state.box.fin) => ({
          iso: 'ISO panel', wood: 'Drevený obklad', l44es: 'Ťahokov L44-ES', l44alu: 'Lamely L44-ALU20/20'
        }[key] || 'Výplň boxu');
        const boxFinishOptions = () => {
          const t = boxTable();
          const has = (t && t.prices) || {};
          return ['iso', 'wood', 'l44es', 'l44alu']
            .filter((k) => has[k])
            .map((k) => ({ key: k, label: boxFinishLabel(k) }));
        };

        /* Decorative soffit, priced by the square metre off the same list. The
           carport page keeps this control in its own price calculator, so the
           configurator does not repeat it there. */
        const ceilingOptions = () => {
          if (BIO.page === 'carport') return [];
          const c = (BIO.addons && BIO.addons.ceiling) || {};
          return [{ key: 'alu', label: 'ALU lamely' }, { key: 'wood', label: 'Drevené lamely' }]
            .filter((o) => c[o.key] != null);
        };
        const ceilingArea = () => (widthMM() * lengthMM()) / 1e6;
        const ceilingPrice = () => {
          const c = (BIO.addons && BIO.addons.ceiling) || {};
          const rate = c[state.ceiling];
          return rate ? Math.round(rate * ceilingArea()) : null;
        };

        /* ------------------------------------------------------------ price */
        const zipPrice = (span) => {
          const table = BIO.zip;
          let best = table[0];
          for (const row of table) { if (row[0] <= span) best = row; }
          if (span > table[table.length - 1][0]) return null;
          return best[1];
        };
        const clampIdx = () => {
          const m = model();
          if (m.widths && m.widths.length) {
            const oldIndex = Math.max(0, Math.min(Number(state.width) || 0, m.widths.length - 1));
            const rawWidth = Number.isFinite(state.widthValue) ? state.widthValue : m.widths[oldIndex];
            state.widthValue = Math.round(Math.max(m.widths[0], Math.min(rawWidth, m.widths[m.widths.length - 1])));
            state.width = dimensionBandIndex(m.widths, state.widthValue);
          } else {
            state.width = 0;
            state.widthValue = m.width;
          }
          const oldLengthIndex = Math.max(0, Math.min(Number(state.length) || 0, m.lengths.length - 1));
          const rawLength = Number.isFinite(state.lengthValue) ? state.lengthValue : m.lengths[oldLengthIndex];
          state.lengthValue = Math.round(Math.max(m.lengths[0], Math.min(rawLength, m.lengths[m.lengths.length - 1])));
          state.length = dimensionBandIndex(m.lengths, state.lengthValue);
          const ll = m.loads || m.gridLoads;
          state.load = ll ? Math.max(0, Math.min(state.load, ll.length - 1)) : 0;
        };

        const priceLines = () => {
          clampIdx();
          const m = model();
          const lines = [];
          const base = isLoad()
            ? m.prices[String(m.loads[state.load])][state.length]
            : (m.gridLoads
                ? m.prices[String(m.gridLoads[state.load])][state.length][state.width]
                : m.prices[state.length][state.width]);
          lines.push({ k: `${m.label} · ${money.format(widthMM())} × ${money.format(lengthMM())} mm` + (hasLoads() ? ` · ${loadKg()} kg/m²` : ''), v: base, sum: base });
          let open = false;
          for (const side of ['front', 'rear', 'left', 'right']) {
            const kind = state.sides[side];
            if (kind === 'open') continue;
            const opt = SIDE_OPTS.find((o) => o.id === kind);
            const span = sideSpan(side);
            /* Catalogue points are price-band boundaries. The configured
               geometry remains exact, while the active price changes only
               when the next published boundary is reached. */
            const runRate = (code) => {
              const t = BIO.wallRun && BIO.wallRun[code];
              if (!t) return null;
              const bands = Object.keys(t).map(Number).sort((a, b) => a - b);
              return t[bands[dimensionBandIndex(bands, state.height)]];
            };
            const WALL_CODE = { fi30: 'iso', fw25: 'wood', l44es: 'l44es', l44alu: 'l44alu' };

            /* Published numeric keys are lower bounds of discrete price bands. */
            const bandKey = (obj, want) => {
              const keys = Object.keys(obj).map(Number).sort((a, b) => a - b);
              return keys[dimensionBandIndex(keys, want)];
            };
            const slidePrice = (mat) => {
              const t = BIO.slide && BIO.slide[mat];
              if (!t || !BIO.slideW) return null;
              const leaves = sideLeaves(kind, span);
              const each = span / leaves;
              if (each < BIO.slideW[0] * 0.75) return null;   // narrower than the book goes
              const band = t[bandKey(t, state.height)];
              const wi = dimensionBandIndex(BIO.slideW, each);
              return { v: band[wi] * leaves, n: leaves };
            };
            const glassPrice = () => {
              const g = BIO.glassPanel;
              if (!g) return null;
              const sys = ['2', '3', '4'].find((k) => span <= g[k].len[g[k].len.length - 1] && span >= g[k].len[0]);
              if (!sys) return null;
              const t = g[sys], band = t.h[bandKey(t.h, state.height)];
              const li = dimensionBandIndex(t.len, span);
              return { v: band[li], n: Number(sys) };
            };
            let value = null, note = '';
            if (kind === 'zip') value = span <= 6500 && state.height <= 2800 ? zipPrice(span) : null;
            else if (WALL_CODE[kind]) {
              const rate = runRate(WALL_CODE[kind]);
              value = rate ? Math.round(rate * (span / 1000)) : null;
            } else if (kind === 'h50l' || kind === 'h50a') {
              const r = slidePrice(kind === 'h50l' ? 'wood' : 'alu');
              if (r) { value = r.v; note = `${r.n} ${r.n === 1 ? 'krídlo' : r.n < 5 ? 'krídla' : 'krídel'}, 2 vodiace lišty`; }
            } else if (kind === 'g1') {
              const r = glassPrice();
              if (r) { value = r.v; note = `${r.n} vodiace lišty`; }   // 2, 3 or 4 - always the plural that takes 'vodiace'
            } else if (kind === 'g2') {
              /* "glass folding panels ... CENA SE DOLOCI POSAMEZNO ZA VSAK
                 PROJEKT" - the folding system has no table in the book, and
                 pricing it off the sliding one invented a figure. */
              value = null;
              note = `${sideLeaves('g2', span)} krídel po max. ${G2_LEAF_MAX} mm`;
            }
            if (value === null) open = true;
            lines.push({ k: `${SIDE_LABEL[side]} — ${opt.label}${note ? ' · ' + note : ''}`, v: value, sum: value || 0 });
          }
          const bp = state.box.on ? boxPrice() : null;
          if (bp) {
            lines.push({
              k: `Zadný box ${mm(bp.w)} × ${mm(bp.d)} · ${boxFinishLabel()}`,
              v: bp.v, sum: bp.v
            });
          }
          if (state.ceiling !== 'none' && ceilingOptions().length) {
            const cv = ceilingPrice();
            lines.push({
              k: `Dekoratívny strop — ${state.ceiling === 'wood' ? 'drevené lamely' : 'ALU lamely'} · ${area1.format(ceilingArea())} m²`,
              v: cv, sum: cv || 0
            });
            if (cv === null) open = true;
          }
          if (state.ledSet.on && BIO.addons && BIO.addons.led) {
            const qty = Math.max(1, state.ledSet.qty || 1);
            const lens = ['500', '1000', '1500'];
            const set = BIO.addons.led[state.ledSet.type];
            const v = set ? set[lens[state.ledSet.len]] : null;
            const label = { warm: 'teplá biela', neutral: 'neutrálna', rgb: 'RGBW' }[state.ledSet.type];
            lines.push({
              k: `LED ${mm(Number(lens[state.ledSet.len]))} · ${label} × ${qty}`,
              v: v ? v * qty : null, sum: v ? v * qty : 0
            });
            if (!v) open = true;
          }
          const priceExtra = (it) => {
            const q = state.extras[it.id] || 0;
            if (!q) return;
            const v = it.price == null ? null : it.price * q;
            if (v === null) open = true;
            lines.push({ k: it.label + (q > 1 ? ' × ' + q : ''), v: v, sum: v || 0 });
          };
          (BIO.extras || []).forEach((g) => g.items.forEach(priceExtra));
          (BIO.roofOpt || []).forEach(priceExtra);
          if (BIO.addons && BIO.addons.sensors) {
            const names = { wind: 'Snímač vetra', rain: 'Snímač dažďa', temp: 'Snímač teploty', snow: 'Snímač snehu', presence: 'Snímač prítomnosti' };
            Object.keys(names).forEach((k) => {
              if (!state.sensors[k]) return;
              const v = BIO.addons.sensors[k];
              lines.push({ k: names[k], v: v || null, sum: v || 0 });
              if (!v) open = true;
            });
          }
          if (state.anchor !== 'none') {
            const each = BIO.anchors ? BIO.anchors[state.anchor] : null;
            const total = each ? each * postCount() : null;
            if (total === null) open = true;
            lines.push({ k: `Vonkajšie kotvenie × ${postCount()}`, v: total, sum: total || 0 });
          }
          if (!state.frameColor.std) lines.push({ k: 'Príplatok za farbu konštrukcie', v: BIO.surcharge.frame, sum: BIO.surcharge.frame });
          if (!state.louverColor.std) lines.push({ k: 'Príplatok za farbu lamiel', v: BIO.surcharge.louver, sum: BIO.surcharge.louver });
          return { lines, total: lines.reduce((a, l) => a + l.sum, 0), open };
        };

        /* --------------------------------------------------------- stage svg */
        const canvas = cfgRoot.querySelector('[data-sp-canvas]');

        /* ---------------------------------------------------------------- camera
           A yaw/pitch camera with an orthographic projection. Every part is built
           as 3D quads, then painted far-to-near, so the model stays correct from
           any angle - including from underneath, where the roof soffit shows. */
        /* Otváracia výška oka nie je jedna pre všetko. Plná strecha vyzerá
           lepšie z výšky očí — stĺpy zostanú vysoké a stavba vyzerá ako stavba,
           nie ako stolík. Lamelová strecha z tej istej výšky splynie do jednej
           čiernej plochy, lebo lamely sa prekryjú, takže tá potrebuje vyššie oko. */
        const FRONT_EL = () => (model().roof === 'panel' ? 0.26 : 0.42);
        let viewTouched = false;
        let lastRoofKind = null;
        const view = { az: -0.62, el: 0.42 };
        const VIEWS = {
          front:  { az: -0.62, el: 0.42 },   // the opening three-quarter view
          side:   { az: -0.05, el: 0.10 },   // straight along the long side
          corner: { az: 0.72,  el: 0.30 },   // from the other corner
          top:    { az: -0.62, el: 1.12 },
          under:  { az: -0.62, el: -0.16 }
        };
        /* How far the orbit may drop. Enough to look up into the soffit,
             not so far that the model turns inside out. */
        const EL_FLOOR = () => -0.2;

        const drawStage = () => {
          const L = lengthMM(), W = widthMM(), H = state.height;
          const frame = state.frameColor.hex, louv = state.louverColor.hex;
          const sideHex = (state.sideColor && state.sideColor.hex) || frame;
          const post = state.model.indexOf('240') === 0 || String(state.model).indexOf('240') > -1 ? 150 : 120;
          const beam = String(state.model).indexOf('240') > -1 ? 240 : 170;
          const walls = placementWalls();
          const panelRoof = model().roof === 'panel';
          /* Koľko radov dosiek celá zostava vyžiada. Jedna stena smrekovca je
             tridsať radov a plný profil za to stojí. Šestnásť posuvných krídel
             cez deväť metrov je päťsto radov, tri tisíce plôch a maliarske
             triedenie na nich ide kvadraticky — jeden ťah posuvníkom trval
             sekundy. Vtedy dosky prídu o profil, ale celá stena naraz. */
          (() => {
            const rows = Math.max(1, Math.round(state.height / COURSE));
            const priecne = Math.max(1, postXs().length - 1);
            let radov = 0;
            ['rear', 'front', 'left', 'right'].forEach((side) => {
              const kind = state.sides[side];
              if (kind !== 'h50l' && kind !== 'fw25') return;
              const poli = (side === 'rear' || side === 'front') ? priecne : 1;
              radov += rows * poli * (kind === 'h50l' ? sideLeaves(kind, sideSpan(side)) : 1);
            });
            cladLevel = radov <= 110 ? 2 : radov <= 300 ? 1 : 0;
            cladStride = radov > 700 ? 2 : 1;
          })();
          /* Kým divák sám neotočil model, drž otváraciu výšku podľa strechy —
             aj keď sa typ strechy zmení výberom iného modelu. */
          const roofKind = panelRoof ? 'panel' : 'louver';
          if (!viewTouched && roofKind !== lastRoofKind) view.el = FRONT_EL();
          lastRoofKind = roofKind;
          const meshPatternId = `sp-mesh-${String(state.model).replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;
          /* The catalogue prices the box panels in the same palette as the
             frame but as a separate item, so the store can be picked out or
             matched. null keeps it following the frame. */
          const boxFillColor = () => ({ hex: (state.boxColor || state.frameColor).hex });
          /* The fall each model is built to. F170 and F240 are both specified at
             2 % in the current 2026 canopy material. Their P1/P5/P3 water exits
             sit along one long side, so the integrated F plane drains across the
             width. SL keeps its established, visibly sloping long-axis logic. */
          const fallPct = Number(model().fallPct) || 2;
          const integratedFall = panelRoof && /^F(?:170|240)$/i.test(String(state.model));
          const fall = Math.round((integratedFall ? W : L) * (fallPct / 100));
          /* F keeps one horizontal frame/post datum. SL has a visibly sloping
             structural line and retains the existing different-height posts. */
          const fallShown = /priznan/i.test(model().roofNote || '');

          const ca = Math.cos(view.az), sa = Math.sin(view.az);
          const ce = Math.cos(view.el), se = Math.sin(view.el);

          /* Perspective: near faces grow a little, far ones shrink. Without it
             the structure reads as a technical drawing rather than a product. */
          /* A 5.2 lens is so long the projection is all but isometric, and
             that is what made the stage read as a drawing rather than a
             photograph: parallel posts, a ground plane that never recedes. At
             2.9 the verticals converge and the paving runs away under the
             structure, without the bowing a genuinely wide lens would give. */
          const DIST = Math.max(L, W, H) * 2.9;
          const cam = (x, y, z) => {
            const cx = x - L / 2, cy = y - W / 2, cz = z - H / 2;
            const rx = cx * ca + cy * sa;
            const ry = -cx * sa + cy * ca;
            const up = cz * ce - ry * se;
            const depth = cz * se + ry * ce;
            const k = DIST / Math.max(DIST * 0.45, DIST - depth);
            return { x: rx * k, y: -up * k, d: depth };
          };

          /* Lighting rig, fixed in world space so it behaves like daylight
             while the camera orbits. Key from above and in front, fill from the
             right, and a bounce off the ground that keeps the white soffit
             bright when the model is viewed from underneath. */
          const unit = (v) => { const m = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / m, v[1] / m, v[2] / m]; };
          const KEY = unit([-0.25, 0.62, 0.74]);
          const FILL = unit([0.86, -0.10, 0.50]);
          /* Ambient at half strength lit every face to nearly the same tone,
             so the aluminium read as a flat silhouette. Taking some of it back
             and putting it into the key opens the gap between a face turned to
             the sun and one turned away, which is what makes the section look
             like metal with a form rather than a cut-out. */
          const AMB = 0.42, KEY_I = 0.54, FILL_I = 0.20, BOUNCE_I = 0.46, SKY_I = 0.13;
          const toRGB = (c) => {
            if (c.charAt(0) === '#') { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, null]; }
            const m = c.match(/[\d.]+/g) || [];
            return [+m[0] || 0, +m[1] || 0, +m[2] || 0, m.length > 3 ? +m[3] : null];
          };
          const darken = (c, k) => {
            const v = toRGB(c);
            const s = v.slice(0, 3).map((x) => Math.round(x * k)).join(',');
            return v[3] == null ? 'rgb(' + s + ')' : 'rgba(' + s + ',' + v[3] + ')';
          };
          /* Powder-coated aluminium is not chalk: the faces that happen to sit
             near the mirror angle throw a sheen, and that highlight travelling
             across the section as the model turns is most of what tells the eye
             it is looking at metal rather than at a drawing. Half-vector
             between the key and the camera, raised to a wide-ish power so the
             catch is broad and soft rather than a hot spot, and added rather
             than multiplied so it lifts a dark colour as much as a light one. */
          let HALF = KEY;                       // set once the camera is known, just below
          /* Broad and gentle. A tight, strong highlight banded badly across a
             lofted body, where dozens of small facets step through the mirror
             angle one after another and each one flashed. */
          const SPEC_I = 0.16, SPEC_P = 7;
          const litFill = (c, n) => {
            const base = toRGB(c);
            const kd = Math.max(0, n[0] * KEY[0] + n[1] * KEY[1] + n[2] * KEY[2]);
            const fd = Math.max(0, n[0] * FILL[0] + n[1] * FILL[1] + n[2] * FILL[2]);
            const l = AMB + KEY_I * kd + FILL_I * fd + BOUNCE_I * Math.max(0, -n[2]) + SKY_I * Math.max(0, n[2]);
            const hn = Math.max(0, n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2]);
            const spec = kd > 0 ? SPEC_I * Math.pow(hn, SPEC_P) * 255 : 0;
            const v = base.slice(0, 3).map((x) => Math.max(0, Math.min(255, Math.round(x * l + spec))));
            return base[3] == null
              ? 'rgb(' + v[0] + ',' + v[1] + ',' + v[2] + ')'
              : 'rgba(' + v[0] + ',' + v[1] + ',' + v[2] + ',' + base[3] + ')';
          };
          const faceNormal = (q) => unit([
            (q[1][1] - q[0][1]) * (q[2][2] - q[0][2]) - (q[1][2] - q[0][2]) * (q[2][1] - q[0][1]),
            (q[1][2] - q[0][2]) * (q[2][0] - q[0][0]) - (q[1][0] - q[0][0]) * (q[2][2] - q[0][2]),
            (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0])
          ]);

          // direction toward the camera, in world space
          const VIEWDIR = [-sa * ce, ca * ce, se];
          HALF = unit([KEY[0] + VIEWDIR[0], KEY[1] + VIEWDIR[1], KEY[2] + VIEWDIR[2]]);
          const facing = (n) => n[0] * VIEWDIR[0] + n[1] * VIEWDIR[1] + n[2] * VIEWDIR[2];
          /* The camera orbits the middle of the structure, so being above that
             is not the same as being above the roof - which sits (H + beam) / 2
             higher. Compare against the roof plane itself. */
          const fromAbove = se * DIST > (H + beam) / 2;

          // Parts still set a semantic layer while they are generated, but
          // visibility is resolved from the real polygon planes below. Layer
          // and legacy bias values never participate in depth ordering.
          let layer = 0;
          const ROOF_LAYER = 1e7;
          const UNDER_SIDE = 1e5;   // frame and beams, in front of the skin from below
          const ON_SKIN = 5e4;      // joints and ribbing, just on top of the skin

          const faces = [];
          /* Vzdušná perspektíva. Dva rovnaké stĺpy, jeden o päť metrov ďalej,
             vychádzali presne rovnakým tónom — a práve to robí z vykreslenia
             výkres. Skutočný vzduch dá medzi oko a všetko vzdialenejšie kúsok
             pozadia. Držané nízko: je to hĺbka, nie hmla. */
          const HAZE_R = Math.max(L, W, H) * 0.62;
          const HAZE_I = 0.11;
          const HAZE_TO = [246, 245, 243];
          const haze = (c, d) => {
            const t = Math.max(0, Math.min(1, -d / HAZE_R)) * HAZE_I;
            if (t < 0.002) return c;
            const v = toRGB(c);
            const s = v.slice(0, 3).map((x, i) => Math.round(x + (HAZE_TO[i] - x) * t)).join(',');
            return v[3] == null ? 'rgb(' + s + ')' : 'rgba(' + s + ',' + v[3] + ')';
          };
          const quad = (pts, fill, opts) => {
            const o = opts || {};
            const normal = o.normal || faceNormal(pts);
            if (o.cull && facing(normal) <= 0) return;
            const pp = pts.map((v) => cam(v[0], v[1], v[2]));
            const depths = pp.map((point) => point.d);
            const depthAvg = depths.reduce((sum, value) => sum + value, 0) / depths.length;
            const lit = o.raw ? fill : haze(litFill(fill, normal), depthAvg);
            faces.push({
              w: pts.map((point) => point.slice()),
              p: pp,
              fill: lit,
              edge: o.edge !== false,
              /* arris:false keeps the stroke but paints it in the face's own
                 colour, so members merge into one surface without a gap */
              edgeCol: o.edge === false ? null : (o.edgeHex || (o.arris === false ? lit : darken(lit, 0.72))),
              fit: o.fit !== false,
              /* Priesvitná plocha sa nesmie obťahovať: keď ju maliarske
                 triedenie rozdelí, obrysy susedných kusov sa na spoji sčítajú
                 a z hairline sa stane tmavá čiara. Namiesto obrysu jej
                 vypneme vyhladzovanie, takže kusy na seba sadnú presne. */
              seamless: o.seamless === true,
              depthAvg,
              order: faces.length
            });
          };

          /* A scalar centroid (or a hand-authored bias) cannot order two large
             polygons whose projected areas overlap. It is also the reason a
             rear H50 wall could suddenly cover a nearer post after a half turn.
             Build a small BSP from the actual world-space planes instead. Any
             face crossing a separator is split, then the tree is traversed from
             the camera's far side to its near side. This is view-independent
             painter logic: the same rule works above, below and through 360°.
          */
          const BSP_EPS = Math.max(L, W, H) * 1e-6;
          const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
          const planeFor = (face) => {
            const n = faceNormal(face.w);
            if (Math.hypot(n[0], n[1], n[2]) < 0.5) return null;
            return { n, d: dot3(n, face.w[0]) };
          };
          const sideOf = (point, plane) => dot3(point, plane.n) - plane.d;
          const faceSides = (face, plane) => {
            let front = false, back = false;
            for (const point of face.w) {
              const side = sideOf(point, plane);
              if (side > BSP_EPS) front = true;
              else if (side < -BSP_EPS) back = true;
              if (front && back) break;
            }
            return front && back ? 2 : front ? 1 : back ? -1 : 0;
          };
          const compactPolygon = (points) => {
            const out = [];
            points.forEach((point) => {
              const prev = out[out.length - 1];
              if (!prev || Math.hypot(point[0] - prev[0], point[1] - prev[1], point[2] - prev[2]) > BSP_EPS) out.push(point);
            });
            if (out.length > 2) {
              const a = out[0], b = out[out.length - 1];
              if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= BSP_EPS) out.pop();
            }
            return out;
          };
          const faceFragment = (face, world, fragmentOrder) => {
            const w = compactPolygon(world);
            if (w.length < 3) return null;
            const p = w.map((point) => cam(point[0], point[1], point[2]));
            const depths = p.map((point) => point.d);
            return Object.assign({}, face, {
              w,
              p,
              depthAvg: depths.reduce((sum, value) => sum + value, 0) / depths.length,
              order: face.order + fragmentOrder * 1e-5,
              // A split edge is artificial. Painting it in the face colour
              // prevents the BSP cut from becoming a visible seam.
              edgeCol: face.edge ? face.fill : null
            });
          };
          const splitFace = (face, plane) => {
            const front = [], back = [];
            const points = face.w;
            for (let i = 0; i < points.length; i += 1) {
              const a = points[i], b = points[(i + 1) % points.length];
              const da = sideOf(a, plane), db = sideOf(b, plane);
              if (da >= -BSP_EPS) front.push(a.slice());
              if (da <= BSP_EPS) back.push(a.slice());
              if ((da > BSP_EPS && db < -BSP_EPS) || (da < -BSP_EPS && db > BSP_EPS)) {
                const t = da / (da - db);
                const hit = [
                  a[0] + (b[0] - a[0]) * t,
                  a[1] + (b[1] - a[1]) * t,
                  a[2] + (b[2] - a[2]) * t
                ];
                front.push(hit.slice());
                back.push(hit.slice());
              }
            }
            return [faceFragment(face, front, 1), faceFragment(face, back, 2)];
          };
          const chooseSplitter = (list) => {
            if (list.length < 8) return 0;
            const picks = [0, Math.floor(list.length * 0.25), Math.floor(list.length * 0.5), Math.floor(list.length * 0.75), list.length - 1]
              .filter((value, index, values) => values.indexOf(value) === index);
            const stride = Math.max(1, Math.floor(list.length / 48));
            let best = picks[0], bestScore = Infinity;
            picks.forEach((candidate) => {
              const plane = planeFor(list[candidate]);
              if (!plane) return;
              let front = 0, back = 0, split = 0;
              for (let i = 0; i < list.length; i += stride) {
                const side = faceSides(list[i], plane);
                if (side === 2) split += 1;
                else if (side === 1) front += 1;
                else if (side === -1) back += 1;
              }
              const score = split * 12 + Math.abs(front - back);
              if (score < bestScore) { bestScore = score; best = candidate; }
            });
            return best;
          };
          const buildBsp = (list, depth) => {
            if (!list.length) return null;
            if (depth > 96) return { leaf: list.slice().sort((a, b) => a.depthAvg - b.depthAvg || a.order - b.order) };
            const splitterIndex = chooseSplitter(list);
            const plane = planeFor(list[splitterIndex]);
            if (!plane) return { leaf: list.slice().sort((a, b) => a.depthAvg - b.depthAvg || a.order - b.order) };
            const coplanar = [], front = [], back = [];
            list.forEach((face) => {
              const side = faceSides(face, plane);
              if (side === 0) coplanar.push(face);
              else if (side === 1) front.push(face);
              else if (side === -1) back.push(face);
              else {
                const parts = splitFace(face, plane);
                if (parts[0]) front.push(parts[0]);
                if (parts[1]) back.push(parts[1]);
              }
            });
            coplanar.sort((a, b) => a.order - b.order);
            return { plane, coplanar, front: buildBsp(front, depth + 1), back: buildBsp(back, depth + 1) };
          };
          const cameraWorld = [L / 2 + VIEWDIR[0] * DIST, W / 2 + VIEWDIR[1] * DIST, H / 2 + VIEWDIR[2] * DIST];
          const bspPaintOrder = (list) => {
            const out = [];
            const visit = (node) => {
              if (!node) return;
              if (node.leaf) { out.push(...node.leaf); return; }
              const cameraFront = sideOf(cameraWorld, node.plane) >= 0;
              visit(cameraFront ? node.back : node.front);
              out.push(...node.coplanar);
              visit(cameraFront ? node.front : node.back);
            };
            visit(buildBsp(list, 0));
            return out;
          };
          /* the four upright faces of a post or a rail, which have to run
             into their neighbours without a line showing */
          const SHAFT = ['-y', '+y', '-x', '+x'];
          /* skip: face keys the caller knows are hidden by something else,
             e.g. the frame rail whose inside the roof deck sits against. */
          /* Like boxFaces, but the top runs from zA at ay to zB at by, so a
             member can follow the roof fall instead of stepping. */
          /* Like prism, but the fall runs along x - the direction a carport
             roof actually drops, towards the water exits. */
          const prismX = (ax, bx, ay, by, zA, zB, dz, hex, skip, flat) => {
            const s = skip || [], fl = flat || [];
            const T = [[ax,ay,zA],[bx,ay,zB],[bx,by,zB],[ax,by,zA]];
            const B = T.map((q) => [q[0], q[1], q[2] - dz]);
            const put = (key, pts, n) => { if (s.indexOf(key) < 0) quad(pts, hex, { normal: n, cull: true, arris: fl.indexOf(key) < 0 }); };
            put('+z', T, faceNormal(T));
            put('-z', [B[3],B[2],B[1],B[0]], faceNormal([B[3],B[2],B[1],B[0]]));
            put('-y', [B[0],B[1],T[1],T[0]], [0,-1,0]);
            put('+y', [T[3],T[2],B[2],B[3]], [0,1,0]);
            put('-x', [B[0],T[0],T[3],B[3]], [-1,0,0]);
            put('+x', [B[1],B[2],T[2],T[1]], [1,0,0]);
          };

          const prism = (ax, bx, ay, by, zA, zB, dz, hex, skip) => {
            const s = skip || [];
            const T = [[ax,ay,zA],[bx,ay,zA],[bx,by,zB],[ax,by,zB]];
            const B = T.map((q) => [q[0], q[1], q[2] - dz]);
            const put = (key, pts, n) => { if (s.indexOf(key) < 0) quad(pts, hex, { normal: n, cull: true }); };
            put('+z', T, faceNormal(T));
            put('-z', [B[3],B[2],B[1],B[0]], faceNormal([B[3],B[2],B[1],B[0]]));
            put('-y', [B[0],B[1],T[1],T[0]], [0,-1,0]);
            put('+y', [T[3],T[2],B[2],B[3]], [0,1,0]);
            put('-x', [B[0],T[0],T[3],B[3]], [-1,0,0]);
            put('+x', [B[1],B[2],T[2],T[1]], [1,0,0]);
          };

          /* A strip lamp: a dark channel, a near-white core, and spill that
             fades outward across the soffit. Widened only across the narrow
             axis, so a two-metre strip does not bloom into a two-metre pool. */
          const LED_TINT = {
            warm:    { core: 'rgba(255,247,229,.98)', spill: '255,206,138' },
            neutral: { core: 'rgba(250,252,255,.98)', spill: '221,234,255' },
            rgb:     { core: 'rgba(240,246,255,.98)', spill: '146,182,255' }
          };
          const ledRect = (x0, x1, y0, y1, z, tint) => {
            const c = LED_TINT[tint] || LED_TINT.warm;
            const alongX = x1 - x0 >= y1 - y0;
            const put = (m, fill, bias) => quad(
              [[x0 - (alongX ? 0 : m), y0 - (alongX ? m : 0), z],
               [x1 + (alongX ? 0 : m), y0 - (alongX ? m : 0), z],
               [x1 + (alongX ? 0 : m), y1 + (alongX ? m : 0), z],
               [x0 - (alongX ? 0 : m), y1 + (alongX ? m : 0), z]],
              fill, { normal: [0,0,-1], cull: true, edge: false, raw: true, bias: bias });
            const n = Math.min(x1 - x0, y1 - y0);
            for (let i = 4; i >= 1; i--) put(n * i * 2.6, 'rgba(' + c.spill + ',' + (0.055 * (5 - i)).toFixed(3) + ')', 380 + (4 - i));
            put(n * 0.55, 'rgba(20,19,16,.5)', 396);
            put(0, c.core, 400);
          };

          /* bias: a member laid on a face that is drawn as one long quad sorts
             against that quad's centroid, so a short member near the far end of
             it loses and gets painted over. Passing a bias settles it. */
          const boxFaces = (x, y, z, dx, dy, dz, hex, skip, flat, bias) => {
            const X = x + dx, Y = y + dy, Z = z + dz;
            const s = skip || [], fl = flat || [];
            const put = (key, pts, n) => { if (s.indexOf(key) < 0) quad(pts, hex, { normal: n, cull: true, arris: fl.indexOf(key) < 0, bias: bias || 0 }); };
            put('+z', [[x,y,Z],[X,y,Z],[X,Y,Z],[x,Y,Z]], [0,0,1]);
            put('-z', [[x,y,z],[X,y,z],[X,Y,z],[x,Y,z]], [0,0,-1]);
            put('-y', [[x,y,z],[X,y,z],[X,y,Z],[x,y,Z]], [0,-1,0]);
            put('+y', [[x,Y,z],[X,Y,z],[X,Y,Z],[x,Y,Z]], [0,1,0]);
            put('-x', [[x,y,z],[x,Y,z],[x,Y,Z],[x,y,Z]], [-1,0,0]);
            put('+x', [[X,y,z],[X,Y,z],[X,Y,Z],[X,y,Z]], [1,0,0]);
          };

          /* Cast shadow: the roof footprint dropped to the ground and pushed
             along the light. The throw is compressed so it grounds the model
             without pulling the framing off the structure. */
          const shX = 0.22 * H * (-KEY[0] / KEY[2]), shY = 0.22 * H * (-KEY[1] / KEY[2]);

          layer = -3 * ROOF_LAYER;
          if (se > 0.01) {
            const reach = Math.max(L, W) * 2.4;
            const fx0 = L / 2 - reach, fx1 = L / 2 + reach;
            const fy0 = W / 2 - reach, fy1 = W / 2 + reach;
            const ground = { normal: [0,0,1], raw: true, edge: false, fit: false };
            quad([[fx0,fy0,0],[fx1,fy0,0],[fx1,fy1,0],[fx0,fy1,0]], 'rgb(226,225,221)', ground);
            /* the paving, laid out from the structure so the joints stay put
               as the model is resized rather than crawling under it */
            const bay = 900;
            const joint = 'rgba(180,179,174,.55)';
            for (let x = Math.ceil(fx0 / bay) * bay; x < fx1; x += bay)
              quad([[x - 6,fy0,0],[x + 6,fy0,0],[x + 6,fy1,0],[x - 6,fy1,0]], joint, { normal: [0,0,1], raw: true, edge: false, fit: false, bias: 1 });
            for (let y = Math.ceil(fy0 / bay) * bay; y < fy1; y += bay)
              quad([[fx0,y - 6,0],[fx1,y - 6,0],[fx1,y + 6,0],[fx0,y + 6,0]], joint, { normal: [0,0,1], raw: true, edge: false, fit: false, bias: 1 });
            /* and a band of the page colour round the outside, so the paving
               has no visible edge of its own */
            const fade = reach * 0.42;
            const veil = (a, b, c, d, al) => quad([a, b, c, d], 'rgba(246,245,243,' + al + ')', { normal: [0,0,1], raw: true, edge: false, fit: false, bias: 2 });
            for (let i = 0; i < 7; i++) {
              const t = i / 7, al = (0.10 + t * 0.20).toFixed(2);
              const gx0 = fx0 + fade * t, gx1 = fx1 - fade * t, gy0 = fy0 + fade * t, gy1 = fy1 - fade * t;
              veil([fx0,fy0,0],[fx1,fy0,0],[fx1,gy0,0],[fx0,gy0,0], al);
              veil([fx0,gy1,0],[fx1,gy1,0],[fx1,fy1,0],[fx0,fy1,0], al);
              veil([fx0,gy0,0],[gx0,gy0,0],[gx0,gy1,0],[fx0,gy1,0], al);
              veil([gx1,gy0,0],[fx1,gy0,0],[fx1,gy1,0],[gx1,gy1,0], al);
            }
          }

          layer = -2 * ROOF_LAYER;
          const shadow = (grow, alpha) => quad([
            [-grow + shX, -grow + shY, 0], [L + grow + shX, -grow + shY, 0],
            [L + grow + shX, W + grow + shY, 0], [-grow + shX, W + grow + shY, 0]
          ], 'rgba(20,22,24,' + alpha + ')', { raw: true, edge: false, fit: false });
          /* A penumbra is dense at the core and thins quickly at the edge.
             An even alpha across every ring gave a linear ramp, which reads as
             a grey rectangle with soft corners rather than a shadow. */
          for (let i = 10; i >= 0; i--) {
            const t = 1 - i / 10;
            shadow(40 + i * 26, +(0.012 + 0.030 * t * t).toFixed(4));
          }

          /* Sun through open blades. Dropping the gaps between them onto the
             ground along the same light is what shows, at a glance, that the
             roof is open - from a low viewpoint the blades themselves still
             overlap into what looks like a closed surface. */
          if (model().roof !== 'panel' && state.louverT > 0.02) {
            const li0 = post, li1 = L - post;
            const nb = (model().lamellas || [])[state.length] || Math.max(4, Math.round((li1 - li0) / 183));
            const lpitch = (li1 - li0) / nb;
            const lang = louverAngle(beam, louverSize().w, state.louverT);
            // widen what counts as covered so the blade shadows between the
            // stripes stay legible instead of closing into one bright patch
            const cover = lpitch * (0.94 * Math.cos(lang) + 0.16);
            if (lpitch - cover > 14) {
              for (let i = 0; i < nb; i++) {
                const c = li0 + lpitch * (i + 0.5);
                const a = c + cover / 2, b = c + lpitch - cover / 2;
                if (b > li1) break;
                quad([
                  [a + shX, post + shY, 0], [b + shX, post + shY, 0],
                  [b + shX, W - post + shY, 0], [a + shX, W - post + shY, 0]
                ], 'rgba(255,247,228,.34)', { raw: true, edge: false, fit: false, bias: 1000 });
              }
            }
          }
          layer = 0;

          /* House walls face into the carport, so they take the light on that
             side. They live behind everything, and disappear once the camera
             passes behind them. */
          if (walls.length) {
            layer = -2 * ROOF_LAYER + 1;
            const wallHex = shade('#efece6', 0);
            const over = Math.round(Math.min(1400, Math.max(L, W) * 0.14));
            const wallTop = H + beam + Math.round(H * 0.30);
            /* One wall, one function, so the corner placement gets the same
               wall twice instead of two that drifted apart. */
            const houseWall = (axis, v, nrm, u0, u1) => {
              const P = (u, z, off) => (axis === 'x'
                ? [u, v + (off || 0) * nrm[1], z]
                : [v + (off || 0) * nrm[0], u, z]);
              const band = (zA, zB, hex, off, extra) => quad(
                [P(u0, zA, off), P(u1, zA, off), P(u1, zB, off), P(u0, zB, off)],
                hex, Object.assign({ normal: nrm, cull: true, edge: false, fit: false }, extra || {}));
              band(0, wallTop, wallHex);
              // the shadow the roof throws on the wall it is fixed to
              band(H - 40, H + beam, 'rgba(24,26,28,.13)', 1.0, { raw: true, bias: 200 });
            };

            if (walls.indexOf('rear') > -1) houseWall('x', 0, [0, 1, 0], -over, L + over);
            if (walls.indexOf('left') > -1) houseWall('y', 0, [1, 0, 0], -over, W + over);
            layer = 0;
          }

          /* A car, to give the thing a size the eye can read. Built from the
             same quads as everything else rather than dropped in as a picture:
             the stage is a real projection, so a flat sprite would be right
             from one viewpoint and wrong from the other four and from every
             angle in between. Rough saloon proportions - 4 400 long, 1 810
             wide, 1 440 tall on a 2 640 wheelbase. */
          /* The cars, lofted from those section tables: each station is an
             outline - how wide the body is there, where its roof and its sill
             sit - and the skin is the quads between one station and the next.
             The sill rising at the axles is the wheel arch, and it comes out
             of the data rather than being drawn on afterwards. */
          const drawCars = () => {
            if (!state.car || !CARS[state.car] || !carFits(state.car)) return;
            const car = CARS[state.car];
            const n = carCount();
            const paint = car.hex;
            const glassHex = 'rgb(38,45,54)';
            const tyre = 'rgb(26,27,29)';
            const rimHex = 'rgb(178,182,186)';
            const belt = car.height * 0.62;

            const ring = (sec, cy) => {
              const hw = sec[1], zt = sec[2], zb = sec[3];
              const h = Math.max(1, zt - zb);
              const ez = Math.min(150, h * 0.30);
              const ey = Math.min(hw * 0.34, 190);
              const zbelt = Math.max(zb + ez + 1, Math.min(belt, zt - ez - 1));
              return [
                [cy - hw * 0.80, zb], [cy - hw, zb + ez], [cy - hw, zbelt], [cy - hw, zt - ez],
                [cy - hw + ey, zt], [cy, zt], [cy + hw - ey, zt],
                [cy + hw, zt - ez], [cy + hw, zbelt], [cy + hw, zb + ez], [cy + hw * 0.80, zb],
                [cy - hw * 0.80, zb]          // closed, so there is a floor under it
              ];
            };
            /* Jedenásť rovných úsekov robilo z karosérie skladaný papier —
               rameno medzi strechou a bokom bol ostrý zlom, ktorý chytal
               svetlo ako plochý fasetový trojuholník. Jeden Chaikinov prechod
               zaobli každý roh a zdvojnásobí počet úsekov; až tým sa z tvaru
               stane karoséria. */
            const RING_N = 11;
            const smoothRing = (P) => {
              const out = [];
              for (let i = 0; i < RING_N; i++) {
                const a = P[i], b = P[i + 1];
                out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
                out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
              }
              out.push(out[0].slice());
              return out;
            };

            const bay = W / n;
            for (let i = 0; i < n; i++) {
              const cy = bay * (i + 0.5);
              // stred voľnej časti, teda za boxom, nie stred celej dĺžky
              const bdCar = boxDepthMM();
              const cx = bdCar + (L - bdCar) / 2;
              const x0 = cx - car.length / 2;
              const X = (t) => x0 + car.length * t;
              const S = car.s;
              const rings = S.map((sec) => smoothRing(ring(sec, cy)));

              for (let k = 0; k < S.length - 1; k++) {
                const a = S[k], b = S[k + 1];
                const ra = rings[k], rb = rings[k + 1];
                const xa = X(a[0]), xb = X(b[0]);
                const rake = Math.abs(b[2] - a[2]) > 120;
                /* Sklo sedelo na pevných číslach úsekov. Po zaoblení sedí
                   párny úsek na pôvodnom a nepárny je zrezaný roh medzi
                   dvoma — ten je sklom len vtedy, keď sú sklom obidva,
                   takže sklo nepretečie do laku. */
                const isGlass = (j) => (a[4] && b[4] && (j === 2 || j === 7))
                  || ((a[4] || b[4]) && rake && j >= 3 && j <= 6);
                for (let j = 0; j < ra.length - 1; j++) {
                  const glazed = j % 2 === 0
                    ? isGlass(j / 2)
                    : isGlass((j - 1) / 2) && isGlass((((j - 1) / 2) + 1) % RING_N);
                  quad([
                    [xa, ra[j][0], ra[j][1]], [xb, rb[j][0], rb[j][1]],
                    [xb, rb[j + 1][0], rb[j + 1][1]], [xa, ra[j + 1][0], ra[j + 1][1]]
                  ], glazed ? glassHex : paint, { cull: true, arris: false });
                }
              }
              const cap = (idx, xAt) => quad(rings[idx].map((q) => [xAt, q[0], q[1]]),
                shade(paint, -0.10), { cull: true, arris: false });
              cap(0, X(0));
              cap(S.length - 1, X(1));

              const R = car.wheel / 2;
              const disc = (axX, atY, nrm, hex, r, seg) => {
                const pts = [];
                for (let k = 0; k < seg; k++) {
                  const ang = (Math.PI * 2 * k) / seg + Math.PI / seg;
                  pts.push([axX + Math.cos(ang) * r, atY, R + Math.sin(ang) * r]);
                }
                quad(pts, hex, { normal: nrm, cull: true, edge: false, raw: true });
              };
              const hwOut = car.width / 2;
              [x0 + car.fa, x0 + car.ra].forEach((axX) => {
                [[cy - hwOut + 70, [0, -1, 0]], [cy + hwOut - 70, [0, 1, 0]]].forEach((w) => {
                  disc(axX, w[0], w[1], tyre, R, 14);
                  disc(axX, w[0] + w[1][1] * 6, w[1], rimHex, R * 0.52, 12);
                  disc(axX, w[0] + w[1][1] * 8, w[1], shade(paint, -0.42), R * 0.20, 10);
                });
              });

              const lamp = (t, nrm, hex, zA, zB, inset) => {
                const xAt = X(t) + inset, hwL = hwOut * 0.84;
                [[cy - hwL, cy - hwL * 0.42], [cy + hwL * 0.42, cy + hwL]].forEach((seg) => {
                  quad([[xAt, seg[0], zA], [xAt, seg[1], zA], [xAt, seg[1], zB], [xAt, seg[0], zB]],
                       hex, { normal: nrm, cull: true, edge: false, raw: true, bias: 300 });
                });
              };
              lamp(0.030, [-1, 0, 0], 'rgba(240,240,232,.92)', car.height * 0.40, car.height * 0.52, -4);
              lamp(0.970, [1, 0, 0], 'rgba(168,48,44,.92)', car.height * 0.44, car.height * 0.56, 4);

              /* it stands on the paving, not over it */
              quad([[X(0.05), cy - car.width * 0.44, 4], [X(0.95), cy - car.width * 0.44, 4],
                    [X(0.95), cy + car.width * 0.44, 4], [X(0.05), cy + car.width * 0.44, 4]],
                   'rgba(24,24,24,.18)', { normal: [0, 0, 1], raw: true, edge: false, fit: false });
            }
          };
          drawCars();

          // posts, on the layout the catalogue prescribes
          const xs = postXs();
          const plc = placement();
          if (!plc.noPosts) {
            const ys = [0, W - post];
            xs.forEach((px, xi) => ys.forEach((py) => {
              if (walls.indexOf('rear') > -1 && py === 0) return;
              if (walls.indexOf('front') > -1 && py === 1) return;
              if (walls.indexOf('left') > -1 && xi === 0) return;
              if (walls.indexOf('right') > -1 && xi === xs.length - 1) return;
              if (plc.freePosts && xi !== 0 && xi !== xs.length - 1) return;
              // the head of a post is always under the roof, never in view
              // where the post meets the ground, tight and dark
              const g0 = Math.round(post * 0.16);
              const savedLayer = layer;
              layer = -2 * ROOF_LAYER + 2;
              for (let s = 7; s >= 1; s--) {
                const grow = g0 * s;
                // same falloff as the cast shadow: dense at the foot, thin at the edge
                const t = 1 - (s - 1) / 6;
                quad([[px - grow, py - grow, 0], [px + post + grow, py - grow, 0],
                      [px + post + grow, py + post + grow, 0], [px - grow, py + post + grow, 0]],
                     'rgba(18,20,22,' + (0.018 + 0.052 * t * t).toFixed(4) + ')',
                     { raw: true, edge: false, fit: false, normal: [0,0,1] });
              }
              layer = savedLayer;
              /* The water exits are at one end, so the posts there stand
                 lower - "resulting in poles of different heights". */
              const lift = fallShown && panelRoof ? Math.round(fall * (1 - (px + post / 2) / L)) : 0;
              boxFaces(px, py, 0, post, post, H + lift, frame, ['+z', '-z'], SHAFT);
            }));
          }

          // side infills
          const infill = (side) => {
            const kind = state.sides[side];
            if (kind === 'open') return;
            const z1 = H;
            const gw = Math.round(post * 0.42);          // guide and head rail
            const back = Math.round(gw * 0.62);          // the face of the infill
            const open = Math.max(0, Math.min(1, (state.sideOpen || {})[side] || 0));

            let a, b, axis, out;
            if (side === 'rear')  { a = [post, 0, 0]; b = [L - post, 0, 0]; axis = 'x'; out = -1; }
            if (side === 'front') { a = [post, W, 0]; b = [L - post, W, 0]; axis = 'x'; out = 1; }
            if (side === 'left')  { a = [0, post, 0]; b = [0, W - post, 0]; axis = 'y'; out = -1; }
            if (side === 'right') { a = [L, post, 0]; b = [L, W - post, 0]; axis = 'y'; out = 1; }

            const vFace = axis === 'x' ? a[1] : a[0];    // the outer face of the wall
            const runFrom = axis === 'x' ? a[0] : a[1];
            const runTo = axis === 'x' ? b[0] : b[1];

            /* the posts standing inside this run divide it into bays */
            const cuts = [];
            if (axis === 'x') postXs().forEach((px) => {
              if (px > runFrom - 1 && px + post < runTo + 1) cuts.push([px, px + post]);
            });
            const bays = [];
            let cursor = runFrom;
            cuts.sort((m, n) => m[0] - n[0]).forEach((c) => {
              if (c[0] - cursor > 200) bays.push([cursor, c[0]]);
              cursor = c[1];
            });
            if (runTo - cursor > 200) bays.push([cursor, runTo]);
            if (!bays.length) bays.push([runFrom, runTo]);

            const outward = axis === 'x' ? [0, out, 0] : [out, 0, 0];
            const norm = facing(outward) > 0 ? outward : outward.map((v) => -v);
            const wallBase = layer;
            // Keep infills near their physical plane. Giant forced layers made
            // rear panels punch through nearer posts, or hid whole posts.
            layer = wallBase + (facing(outward) > 0 ? 1200 : -1200);
            const vSpan = (p, q) => (out < 0 ? [vFace + p, vFace + q] : [vFace - q, vFace - p]);
            const railHex = shade(sideHex, -0.06);
            const endsX = axis === 'x' ? ['-x', '+x'] : ['-y', '+y'];

            bays.forEach((bay, bayI) => {
              const u0 = bay[0], uLen = bay[1] - bay[0];
              if (uLen < 120) return;

              const memb = (t0, t1, zA, zB, p, q, hex, skip, flat) => {
                const uA = u0 + uLen * t0, uB = u0 + uLen * t1;
                const v = vSpan(p, q);
                if (uB - uA <= 0.2 || zB - zA <= 0.2) return;
                if (axis === 'x') boxFaces(uA, v[0], zA, uB - uA, v[1] - v[0], zB - zA, hex, skip, flat);
                else boxFaces(v[0], uA, zA, v[1] - v[0], uB - uA, zB - zA, hex, skip, flat);
              };
              /* Like pane, but its two ends sit at different depths - a leaf
                 caught mid-fold is not parallel to the opening. */
              const foldPane = (t0, t1, zA, zB, pA, pB, hex, extra) => {
                const uA = u0 + uLen * t0, uB = u0 + uLen * t1;
                if (zB - zA <= 0.2) return;
                const vA = vSpan(pA, pA)[0], vB = vSpan(pB, pB)[0];
                const P = (u, v, z) => (axis === 'x' ? [u, v, z] : [v, u, z]);
                quad([P(uA, vA, zA), P(uB, vB, zA), P(uB, vB, zB), P(uA, vA, zB)], hex,
                     Object.assign({ normal: norm, edge: false }, extra || {}));
              };
              const pane = (t0, t1, zA, zB, p, hex, extra) => {
                const uA = u0 + uLen * t0, uB = u0 + uLen * t1;
                if (uB - uA <= 0.2 || zB - zA <= 0.2) return;
                const v = vSpan(p, p)[0];
                const P = (u, z) => (axis === 'x' ? [u, v, z] : [v, u, z]);
                quad([P(uA, zA), P(uB, zA), P(uB, zB), P(uA, zB)], hex,
                     Object.assign({ normal: norm, edge: false }, extra || {}));
              };
              /* Courses are set out from the ground, so a board keeps its
                 height and its tone across every panel it runs behind. */
              const clad = (t0, t1, zA, zB, depth, pitch, hex, timber) => {
                const k0 = Math.floor(zA / pitch), k1 = Math.ceil(zB / pitch);
                if (k1 - k0 > 60) return;                   // absurd height, draw nothing
                const stride = timber ? cladStride : 1;
                for (let k = k0; k < k1; k += stride) {
                  const a = Math.max(zA, k * pitch), b = Math.min(zB, (k + stride) * pitch);
                  if (b - a < 2) continue;
                  const tone = timber ? boardTone(k, hex) : (hex || shade(sideHex, 0.12));
                  if (!timber) {
                    pane(t0, t1, a, b, depth, tone,
                         { raw: true, edgeHex: shade(sideHex, -0.22) });
                    continue;
                  }
                  const uroven = cladLevel;
                  if (uroven === 0) {
                    pane(t0, t1, a, b, depth, tone,
                         { raw: true, edgeHex: shade(tone, -0.42) });
                    continue;
                  }
                  /* Rhombus larch is not a flat striped wallpaper. A recessed
                     shadow, darker lower bevel and fine lengthwise grain give
                     every 70/24 board its own section while retaining one calm
                     timber tone across adjacent panels. */
                  const span = b - a;
                  const gap = Math.min(9, Math.max(3, span * 0.13));
                  const faceA = a + gap;
                  const faceB = b - Math.min(3, gap * 0.28);
                  pane(t0, t1, a, b, depth, shade(tone, -0.50),
                       { raw: true, edgeHex: shade(LARCH, -0.48) });
                  if (uroven === 1) {
                    pane(t0, t1, a + gap, faceB, depth, tone,
                         { raw: true, edgeHex: shade(tone, -0.22), bias: ON_SKIN });
                    continue;
                  }
                  pane(t0, t1, a + gap * 0.34, faceA, depth, shade(tone, -0.18),
                       { raw: true, edge: false, bias: ON_SKIN });
                  pane(t0, t1, faceA, faceB, depth, tone,
                       { raw: true, edgeHex: shade(tone, -0.22), bias: ON_SKIN * 2 });
                  pane(t0, t1, faceB, b, depth, shade(tone, 0.10),
                       { raw: true, edge: false, bias: ON_SKIN * 3 });
                  const grainA = faceA + (faceB - faceA) * (0.28 + grain(k + 31) * 0.18);
                  const grainB = faceA + (faceB - faceA) * (0.66 + grain(k + 73) * 0.13);
                  [grainA, grainB].forEach((z, gi) => pane(t0, t1, z, z + (gi ? 1.5 : 1), depth,
                    gi ? 'rgba(255,244,220,.12)' : 'rgba(67,38,16,.13)',
                    { raw: true, edge: false, bias: ON_SKIN * 4 + gi }));
                }
              };
              const boards = (t0, t1, zA, zB, depth) => clad(t0, t1, zA, zB, depth, COURSE, LARCH, true);

              const headTop = kind === 'zip' ? Math.round(gw * 1.55) : gw;
              const gt = gw / Math.max(1, uLen);
              const startEnd = axis === 'x' ? ['-x', '+z'] : ['-y', '+z'];
              const finishEnd = axis === 'x' ? ['+x', '+z'] : ['+y', '+z'];

              // guides down both sides of the bay and the head over the top
              memb(0, gt, 0, z1, 0, gw, railHex, bayI === 0 ? startEnd : ['+z'], SHAFT);
              memb(1 - gt, 1, 0, z1, 0, gw, railHex, bayI === bays.length - 1 ? finishEnd : ['+z'], SHAFT);
              memb(0, 1, z1 - headTop, z1, 0, kind === 'zip' ? Math.round(gw * 1.15) : gw, railHex, endsX, SHAFT);

              const zTop = z1 - headTop;
              /* A door runs to the floor - it is the way out. Only the fixed
                 walls stand off it, which is where that reveal belongs. */
              const onFloor = kind === 'zip' || kind === 'g1' || kind === 'g2'
                           || kind === 'h50l' || kind === 'h50a';
              const zBase = onFloor ? 0 : Math.round(gw * 0.55);
              if (kind !== 'zip') memb(gt, 1 - gt, 0, zBase, 0, gw, shade(sideHex, -0.14), endsX, SHAFT);

              const leaves = sideLeaves(kind, sideSpan(side));

              if (kind === 'zip') {
                /* the screen rolls into its own cassette: the fabric shortens
                   from the bottom and the weighted bar rides up with it */
                const barH = Math.round(gw * 0.42);
                const travel = zTop - barH;
                const barZ = travel * open;
                if (barZ < travel - 1) {
                  /* ZIP je jedna súvislá tkanina napnutá v bočných lištách.
                     Vodorovné pásy každých ~95 mm tu nemajú čo hľadať — na
                     bočnej stene sa v axonometrii premietali ako šikmé linky
                     a pôsobili ako vzor na látke. Ostáva rovná priesvitná
                     plocha, cez ktorú presvitá konštrukcia za ňou. */
                  pane(gt, 1 - gt, barZ + barH, zTop, back, 'rgba(58,62,66,.78)', { raw: true, seamless: true });
                }
                memb(gt, 1 - gt, barZ, barZ + barH, back - 14, back + 16, shade(sideHex, -0.42), endsX, SHAFT);
              } else if (leaves) {
                const glazed = kind === 'g1' || kind === 'g2';
                const fr = Math.max(0.006, gt * 0.55);
                const frD = Math.round(gw * 0.34);
                const track = Math.round(gw * 0.30);
                memb(gt, 1 - gt, zBase, zBase + track, back - frD, back + frD, shade(sideHex, -0.18), endsX, SHAFT);
                const zA = zBase + track, zB = zTop;
                const w = (1 - 2 * gt) / leaves;
                if (kind === 'g2') {
                  /* G2 is the folding system, not the sliding one: the leaves
                     are hinged in a run and concertina toward one stile, so
                     alternate hinges stand proud of the opening while the
                     leaves between them lie at an angle. Folded flat the book
                     allows "min. 32 mm x stevilo panelov", so the pack keeps
                     that thickness rather than collapsing into the stile. */
                  const wReal = w * uLen;
                  const ang = open * (Math.PI / 2);
                  const cw = Math.max(32 / Math.max(1, uLen), w * Math.cos(ang));
                  const amp = wReal * Math.sin(ang);
                  const start = gt + (1 - 2 * gt) - leaves * cw;
                  const dAt = (j) => back + (j % 2 ? amp : 0);
                  const tAt = (j) => start + cw * j;
                  for (let i = 0; i < leaves; i++) {
                    const pA = dAt(i), pB = dAt(i + 1);
                    foldPane(tAt(i), tAt(i + 1), zA + fr, zB - fr, pA, pB,
                             'rgba(181,205,214,.42)', { raw: true, seamless: true });
                  }
                  // the hinge stiles, each square to the opening at its own depth
                  for (let j = 0; j <= leaves; j++) {
                    const d = dAt(j), t = tAt(j);
                    memb(Math.max(0, t - fr / 2), t + fr / 2, zA, zB, d - frD, d + frD,
                         shade(sideHex, 0.04), [], SHAFT);
                  }
                  return;
                }
                /* Shut, the leaves fill the bay. Run back, they all travel to
                   the same slot against the far stile and stack there, each on
                   its own track, so the opening grows from the near end.
                   The far leaf is already in that slot and does not move.

                   This used to park leaf i at `gt + (1 - 2*gt) - w*(leaves - i)`,
                   which with w = (1 - 2*gt)/leaves reduces to `gt + w*i` - the
                   leaf's own shut position. Every leaf was therefore pinned where
                   it started and only the depth offset below moved, which is why
                   the panels appeared to shuffle in place and never opened. */
                const parked = gt + (1 - 2 * gt) - w;
                /* Odsunuté krídla parkovali presne na sebe, takže osem krídel
                   splynulo do jedného panela — na obrazovke to vyzeralo, že
                   sedem z nich zmizlo, a pri veľkých rozmeroch to pôsobilo ako
                   chyba výroby. Skutočný odsuvný systém ich odstaví jedno za
                   druhým s presahom, takže z čela vidno hrebeň zvislíc a dá sa
                   spočítať, koľko ich je. Presah držíme tak, aby sa celý balík
                   zmestil do poľa aj pri dvoch krídlach aj pri desiatich. */
                const fanRoom = Math.max(0, (1 - 2 * gt) - w) / Math.max(1, leaves - 1);
                const fan = Math.min(fr * 1.8, fanRoom * 0.42);
                /* Odsunuté krídla stoja na sebe. Kreslíme ich od najvzdialenejšieho
                   k najbližšiemu, aby predné krídlo zakrylo tie za sebou — inak
                   bolo vidno hranu panela, ktorý má byť schovaný. Poloha krídla
                   sa nemení, mení sa len poradie kreslenia. */
                for (let i = leaves - 1; i >= 0; i--) {
                  const home = gt + w * i;
                  /* Krídlo, ktoré ide najďalej, končí navrchu balíka; posledné
                     stojí na svojom mieste a nehýbe sa. */
                  const rest = parked - (leaves - 1 - i) * fan;
                  const t0 = home + (rest - home) * open, t1 = t0 + w;
                  /* Each leaf has its own track, but shut they close into one
                     plane - stepping them in depth at rest doubled every stile
                     against its neighbour, so the wall read as a run of bars of
                     uneven thickness. The tracks separate as the leaves run. */
                  /* Skutočné kovanie ukladá krídla tesne za seba. 0,85 × hĺbka
                     rámu ich rozťahovala do vejára a hrany trčali. */
                  const dOff = Math.round(i * frD * 0.5 * open);
                  const p0 = back - frD + dOff, p1 = back + frD + dOff;
                  memb(t0, t0 + fr, zA, zB, p0, p1, shade(sideHex, 0.04), [], SHAFT);
                  /* Zatvorené krídla sa dotýkajú, takže pravá zvislica jedného
                     stojí tesne vedľa ľavej zvislice suseda a spolu vyzerajú ako
                     jeden hrubý stĺpik. Kým sú zatvorené, kreslíme pravú zvislicu
                     len na poslednom krídle; keď sa krídla rozídu, má ju každé. */
                  if (open > 0.02 || i === leaves - 1) {
                    memb(t1 - fr, t1, zA, zB, p0, p1, shade(sideHex, 0.04), [], SHAFT);
                  }
                  memb(t0, t1, zA, zA + fr * 0.9, p0, p1, shade(sideHex, 0.04), endsX, SHAFT);
                  memb(t0, t1, zB - fr * 0.9, zB, p0, p1, shade(sideHex, 0.04), endsX, SHAFT);
                  const mid = (p0 + p1) / 2;
                  if (glazed) {
                    pane(t0 + fr, t1 - fr, zA + fr, zB - fr, mid, 'rgba(181,205,214,.42)', { raw: true, seamless: true });
                  } else if (kind === 'h50l') {
                    boards(t0 + fr, t1 - fr, zA + fr, zB - fr, mid);
                  } else {
                    // "alu slat 10/50 mm": narrower course, and barely any variation
                    clad(t0 + fr, t1 - fr, zA + fr, zB - fr, mid, ALU_COURSE, shade(sideHex, 0.12));
                  }
                  // the handle, on the stile that meets its neighbour
                  const hz = zA + (zB - zA) * 0.46;
                  memb(t1 - fr * 1.6, t1 - fr * 0.6, hz, hz + 190, p1, p1 + 16, shade(sideHex, -0.3), [], SHAFT);
                }
              } else if (kind === 'e300') {
                const nb = Math.max(3, Math.round(uLen / 300));
                const bw = ((1 - 2 * gt) / nb) * 0.66;
                const bd = Math.round(gw * 0.62);
                for (let i = 0; i < nb; i++) {
                  const t0 = gt + ((1 - 2 * gt) * i) / nb;
                  memb(t0, t0 + bw, zBase, zTop, back - bd / 2, back + bd / 2, shade(sideHex, 0.08), ['+z', '-z'], SHAFT);
                }
              } else if (kind === 'l44es') {
                pane(gt, 1 - gt, zBase, zTop, back, shade(sideHex, -0.34), { raw: true });
                pane(gt, 1 - gt, zBase, zTop, back - 1, 'url(#' + meshPatternId + ')', { raw: true, bias: ON_SKIN });
              } else if (kind === 'l44alu') {
                clad(gt, 1 - gt, zBase, zTop, back, ALU_COURSE, shade(sideHex, 0.12));
              } else if (kind === 'fw25') {
                boards(gt, 1 - gt, zBase, zTop, back);
              } else {
                pane(gt, 1 - gt, zBase, zTop, back, shade(sideHex, 0.10));
                for (let i = 1; i < 11; i++) {
                  const z = zBase + ((zTop - zBase) * i) / 11;
                  pane(gt, 1 - gt, z, z + 7, back - 1, 'rgba(16,16,16,.10)', { raw: true, bias: ON_SKIN });
                }
              }
            });
            layer = wallBase;
          };
          ['rear', 'left', 'right', 'front'].forEach(infill);

          /* Rear storage box: catalogue-like 80 × 50 perimeter members, broad
             infill modules and a real framed door opening. The box closes to the
             underside of the roof instead of reading as a solid cube. */
          if (panelRoof && state.box && state.box.on) {
            const bp = boxPrice();
            if (bp) {
              const bw = Math.min(bp.w, W), bd = Math.min(bp.d, L);
              /* The roof deck hangs a clearance below the top of the rim, so a box
                 that stops at H leaves a slot between its head and the underside
                 of the roof - daylight along the whole top of the store. It closes
                 to the deck instead. Where the fall is shown the deck slopes, so
                 the head is taken to the high end and the few centimetres of
                 overshoot at the low end disappear inside the roof. */
              const bodyTop = H + Math.round(beam * 0.20) + (fallShown ? fall : 0);
              const frameX = Math.min(80, Math.round(post * 0.58));
              const frameY = Math.min(50, Math.round(post * 0.42));
              const inset = Math.round(frameY * 0.42);
              const skin = boxFillColor().hex;
              const wood = state.box.fin === 'wood';
              const jointHex = shade(frame, -0.16);
              const panelHex = wood ? LARCH : shade(skin, 0.34);
              const panelCount = 3;
              /* Sendvičový panel sa vyrába v module 1 000 mm; po tom sa plášť delí. */
              const PANEL_MODULE = 1000;

              const fitX = (x, dx) => Math.min(Math.max(x - dx / 2, 0), Math.max(0, bd - dx));
              const fitY = (y, dy) => Math.min(Math.max(y - dy / 2, 0), Math.max(0, bw - dy));
              /* A member lying on one of the box walls has to sort with that
                 wall, not against the whole box: the walls are single long quads
                 and their centroids sit far from the member, so without this a
                 rail on the far wall punches through the near one. */
              const faceBias = (n) => (facing(n) > 0 ? 900 : -900);
              const boxPost = (x, y, jamb = false, bias) => {
                const dx = jamb ? frameY : frameX;
                const dy = jamb ? frameX : frameY;
                boxFaces(fitX(x, dx), fitY(y, dy), 0, dx, dy, bodyTop, frame, ['+z', '-z'], SHAFT, bias || 0);
              };
              const fillFace = (pts, normal, kind = state.box.fin) => {
                if (kind === 'l44es') {
                  quad(pts, shade(skin, -0.34), { normal, cull: true, raw: true, edge: false });
                  quad(pts, `url(#${meshPatternId})`, { normal, cull: true, raw: true, edge: false, bias: 60 });
                  return;
                }
                if (kind === 'l44alu') {
                  const z0 = Math.min(...pts.map((p)=>p[2])), z1 = Math.max(...pts.map((p)=>p[2]));
                  quad(pts, shade(skin, -0.40), { normal, cull: true, raw: true, edge: false });
                  const steps = Math.max(8, Math.round((z1-z0)/115));
                  for (let i=0;i<steps;i++) {
                    const za=z0+(z1-z0)*i/steps, zb=Math.min(z1,za+46);
                    const q=pts.map((p)=>[p[0],p[1],p[2]===z0?za:zb]);
                    quad(q, shade(skin, 0.24), { normal, cull:true, edge:false, bias: 60 });
                  }
                  return;
                }
                if (kind === 'wood') {
                  /* "Wood rhomb 70/24" is an angled batten, so a course is not a
                     flat band with a line ruled across it: it is a lit face, the
                     part of the batten falling away below it, and the shadow of
                     the gap onto the one underneath. Courses are still set out
                     from the ground, so they run through across every face.
                     Lighting is left to the face normal - drawing them raw made
                     all four sides of the box the same brightness, which is what
                     read as flat. */
                  const z0 = Math.min(...pts.map((q) => q[2])), z1 = Math.max(...pts.map((q) => q[2]));
                  const at = (z) => pts.map((q) => [q[0], q[1], z]);
                  const k0 = Math.floor(z0 / COURSE), k1 = Math.ceil(z1 / COURSE);
                  const REVEAL = 0.16, CHAMFER = 0.34;
                  const band = (p, q, hex) => {
                    const a = Math.max(z0, p), b = Math.min(z1, q);
                    if (b - a < 0.5) return;
                    const lo = at(a), hi = at(b);
                    quad([lo[0], lo[1], hi[1], hi[0]], hex, { normal, cull: true, edgeHex: hex });
                  };
                  for (let k = k0; k < k1; k++) {
                    const za = Math.max(z0, k * COURSE), zb = Math.min(z1, (k + 1) * COURSE);
                    if (zb - za < 2) continue;
                    const tone = boardTone(k);
                    const gap = za + (zb - za) * REVEAL;
                    const mid = gap + (zb - gap) * CHAMFER;
                    band(za, gap, shade(tone, -0.52));
                    band(gap, mid, shade(tone, -0.16));
                    band(mid, zb, tone);
                  }
                  return;
                }
                /* ISO panel. The sandwich panels come in a fixed module and
                   meet in a tongue-and-groove joint, so a face is a run of
                   panels with a fine shadow line between them. Drawn as one
                   blank quad it read as a slab of sheet metal with nothing on
                   it, which is not what the box is made of. The joints run the
                   way the panel does - vertically on a wall - and no rail is
                   added, because a panel joint is not a rail and the catalogue
                   drawings show none. */
                const runLen = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
                const modules = Math.max(1, Math.round(runLen / PANEL_MODULE));
                if (modules === 1) {
                  quad(pts, panelHex, { normal, cull: true, edge: true });
                  return;
                }
                const at = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
                for (let i = 0; i < modules; i++) {
                  const t0 = i / modules, t1 = (i + 1) / modules;
                  quad([at(pts[0], pts[1], t0), at(pts[0], pts[1], t1),
                        at(pts[3], pts[2], t1), at(pts[3], pts[2], t0)],
                       panelHex, { normal, cull: true, edge: true });
                }
              };

              // Four primary corners and continuous top rails.
              boxPost(0,0); boxPost(0,bw); boxPost(bd,0); boxPost(bd,bw);
              boxFaces(0, 0, bodyTop - frameY, bd, frameY, frameY, frame, [], SHAFT);
              boxFaces(0, bw - frameY, bodyTop - frameY, bd, frameY, frameY, frame, [], SHAFT);
              boxFaces(0, 0, bodyTop - frameY, frameY, bw, frameY, frame, [], SHAFT);
              boxFaces(bd - frameY, 0, bodyTop - frameY, frameY, bw, frameY, frame, [], SHAFT);

              // Rear wall: exactly three broad infill panels with visible module rails.
              const rearRail = bw / panelCount;
              for (let i=0;i<panelCount;i++) {
                const y0=i*rearRail+frameY/2, y1=(i+1)*rearRail-frameY/2;
                fillFace([[inset,y0,inset],[inset,y1,inset],[inset,y1,bodyTop-frameY],[inset,y0,bodyTop-frameY]], [-1,0,0]);
                if (i>0) boxPost(0,i*rearRail,false,faceBias([-1,0,0]));
              }

              /* Both flanks and the wall towards the covered bay are one
                 continuous clad field between the corner posts. The catalogue
                 drawings show no intermediate rail on a flank - the only line
                 across it is the door - and the middle pair of carport posts
                 stands at the far end of the box, which is what P5 is. */
              fillFace([[frameX/2,inset,0],[bd-frameX/2,inset,0],[bd-frameX/2,inset,bodyTop-frameY],[frameX/2,inset,bodyTop-frameY]], [0,-1,0]);
              fillFace([[bd-frameX/2,bw-inset,0],[frameX/2,bw-inset,0],[frameX/2,bw-inset,bodyTop-frameY],[bd-frameX/2,bw-inset,bodyTop-frameY]], [0,1,0]);
              fillFace([[bd-inset,frameY/2,0],[bd-inset,bw-frameY/2,0],[bd-inset,bw-frameY/2,bodyTop-frameY],[bd-inset,frameY/2,bodyTop-frameY]], [1,0,0]);

              /* "Integrirana ena vrata" - one door, and both + lopa drawings put
                 it in the outward flank, not in the wall facing the covered bay.
                 The cladding runs on across the leaf, so the opening reads the
                 way it does on the drawing: two jambs, a head and a handle.
                 Where the box runs the full width both flanks are outward, so
                 the door takes the one the views actually look at; where the box
                 is narrower than the structure, the outward flank is the one
                 flush with the edge. A wall on that flank moves it to the other.
                 'rear' is the y = 0 flank, 'front' the y = bw one. */
              const walled = placementWalls();
              /* It goes in the longest outward face. On a deep box that is a
                 flank, which is where the F + lopa drawings show it; on a shallow
                 full-width one it is the end wall, which is where the SL side-box
                 sheet shows it. */
              const inFlank = bd >= bw;
              const doorRun = inFlank ? bd : bw;
              const doorWidth = Math.min(1000, Math.max(820, doorRun * 0.26));
              const d0 = Math.max(frameX, doorRun / 2 - doorWidth / 2);
              const d1 = Math.min(doorRun - frameX, d0 + doorWidth);
              const doorH = Math.min(bodyTop - frameY * 2, 2150);
              /* The frame stands on the cladding rather than in it: a member that
                 straddles the boarded plane gets half of itself painted over,
                 which left one jamb showing only its lower stub. faceBias settles
                 it against the long quads the cladding is drawn as, and turns
                 negative on a wall the camera is behind so the frame stays inside
                 the box instead of punching out through the near wall. */
              const doorHead = bodyTop * 0.40;
              if (inFlank) {
                let far = bw >= W - 1;
                if (far && walled.indexOf('front') > -1) far = false;
                else if (!far && walled.indexOf('rear') > -1) far = true;
                const y0 = far ? bw - inset : 0;
                const B = faceBias(far ? [0,1,0] : [0,-1,0]);
                const jamb = (x) => boxFaces(fitX(x, frameX), y0, 0, frameX, inset, bodyTop - frameY, frame, ['+z','-z'], SHAFT, B);
                jamb(d0); jamb(d1);
                boxFaces(d0, y0, doorH - frameY, d1 - d0, inset, frameY, frame, [], SHAFT, B);
                const hx = d1 - Math.min(190, (d1 - d0) * 0.2);
                boxFaces(hx - 13, far ? bw - inset : -26, doorHead, 26, 26, 190, jointHex, [], SHAFT, B + Math.sign(B) * 120);
              } else {
                const B = faceBias([-1,0,0]);
                const jamb = (y) => boxFaces(0, fitY(y, frameX), 0, inset, frameX, bodyTop - frameY, frame, ['+z','-z'], SHAFT, B);
                jamb(d0); jamb(d1);
                boxFaces(0, d0, doorH - frameY, inset, d1 - d0, frameY, frame, [], SHAFT, B);
                const hy = d1 - Math.min(190, (d1 - d0) * 0.2);
                boxFaces(-26, hy - 13, doorHead, 26, 26, 190, jointHex, [], SHAFT, B + Math.sign(B) * 120);
              }
            }
          }
          // roof
          const bz = H;
          layer = fromAbove ? ROOF_LAYER : -ROOF_LAYER;
          const roofBase = layer;
          const nearSide = (n) => { layer = roofBase + (facing(n) > 0 ? UNDER_SIDE : -UNDER_SIDE); };

          /* Obvodové profily sú v skutočnosti rezané na pokos, nie na zraz.
             Dva zrazené hranoly sa v rohu prekrývajú po celej dĺžke styku a ich
             koplanárne horné plochy sa musia navzájom zoradiť — a práve tam
             presvital vlas pozadia, takže to vyzeralo, že profil zmizol. Štyri
             lichobežníky vyplnia prstenec presne: niet čo zoraďovať a niet kade
             presvitať, a horná hrana ide jedným ťahom od rohu k rohu. */
          const mitreRing = (x0, y0, x1, y1, z, t, d, hex, zAt) => {
            const ix0 = x0 + t, iy0 = y0 + t, ix1 = x1 - t, iy1 = y1 - t;
            if (ix1 <= ix0 || iy1 <= iy0) {          // profil vypĺňa celú plochu
              boxFaces(x0, y0, z, x1 - x0, y1 - y0, d, hex, [], SHAFT);
              return;
            }
            /* Modely s priznaným spádom majú hornú rovinu šikmú, takže výška
               nie je číslo, ale funkcia polohy pozdĺž dĺžky. */
            const T = zAt || (() => z + d);
            const B = (x) => T(x) - d;
            const cap = (pts, n) => quad(pts, hex, { normal: n, cull: true });
            const web = (pts, n) => quad(pts, hex, { normal: n, cull: true, arris: false });
            // predný profil, y od y0 po iy0
            nearSide([0, -1, 0]);
            cap([[x0,y0,T(x0)],[x1,y0,T(x1)],[ix1,iy0,T(ix1)],[ix0,iy0,T(ix0)]], [0,0,1]);
            cap([[x0,y0,B(x0)],[ix0,iy0,B(ix0)],[ix1,iy0,B(ix1)],[x1,y0,B(x1)]], [0,0,-1]);
            web([[x0,y0,B(x0)],[x1,y0,B(x1)],[x1,y0,T(x1)],[x0,y0,T(x0)]], [0,-1,0]);
            web([[ix0,iy0,B(ix0)],[ix0,iy0,T(ix0)],[ix1,iy0,T(ix1)],[ix1,iy0,B(ix1)]], [0,1,0]);
            // zadný profil, y od iy1 po y1
            nearSide([0, 1, 0]);
            cap([[x0,y1,T(x0)],[ix0,iy1,T(ix0)],[ix1,iy1,T(ix1)],[x1,y1,T(x1)]], [0,0,1]);
            cap([[x0,y1,B(x0)],[x1,y1,B(x1)],[ix1,iy1,B(ix1)],[ix0,iy1,B(ix0)]], [0,0,-1]);
            web([[x0,y1,B(x0)],[x0,y1,T(x0)],[x1,y1,T(x1)],[x1,y1,B(x1)]], [0,1,0]);
            web([[ix0,iy1,B(ix0)],[ix1,iy1,B(ix1)],[ix1,iy1,T(ix1)],[ix0,iy1,T(ix0)]], [0,-1,0]);
            // ľavý profil, x od x0 po ix0
            nearSide([-1, 0, 0]);
            cap([[x0,y0,T(x0)],[ix0,iy0,T(ix0)],[ix0,iy1,T(ix0)],[x0,y1,T(x0)]], [0,0,1]);
            cap([[x0,y0,B(x0)],[x0,y1,B(x0)],[ix0,iy1,B(ix0)],[ix0,iy0,B(ix0)]], [0,0,-1]);
            web([[x0,y0,B(x0)],[x0,y0,T(x0)],[x0,y1,T(x0)],[x0,y1,B(x0)]], [-1,0,0]);
            web([[ix0,iy0,B(ix0)],[ix0,iy1,B(ix0)],[ix0,iy1,T(ix0)],[ix0,iy0,T(ix0)]], [1,0,0]);
            // pravý profil, x od ix1 po x1
            nearSide([1, 0, 0]);
            cap([[x1,y0,T(x1)],[x1,y1,T(x1)],[ix1,iy1,T(ix1)],[ix1,iy0,T(ix1)]], [0,0,1]);
            cap([[x1,y0,B(x1)],[ix1,iy0,B(ix1)],[ix1,iy1,B(ix1)],[x1,y1,B(x1)]], [0,0,-1]);
            web([[x1,y0,B(x1)],[x1,y1,B(x1)],[x1,y1,T(x1)],[x1,y0,T(x1)]], [1,0,0]);
            web([[ix1,iy0,B(ix1)],[ix1,iy0,T(ix1)],[ix1,iy1,T(ix1)],[ix1,iy1,B(ix1)]], [-1,0,0]);
          };
          if (panelRoof) {
            const x0 = 0, x1 = L, y0 = 0, y1 = W;
            const fw = post;                           // frame 170/120 on a 120 post: flush
            const inX0 = x0 + fw, inX1 = x1 - fw, inY0 = y0 + fw, inY1 = y1 - fw;

            /* F carries a real cross-width roof plane inside a level frame. SL
               keeps its separate, visible long-axis slope. The current technical
               sheets specify F170 as 170/120 + R150 150/50 and F240 as 240/150 +
               R160 160/80; depth is always the first secondary-profile number. */
            const sec = model().secBeam || [80, 50];
            const PANEL = 30;                  // every carport and canopy model says "ISO panel 30 mm"
            const rw = sec[1];
            const rd = integratedFall
              ? sec[0]
              : Math.min(sec[0], Math.max(24, beam - Math.round(beam * 0.15) - PANEL));
            const rimHigh = bz + beam + (fallShown ? fall : 0);
            const rimLow = bz + beam;
            const zRim = (x) => rimHigh + ((rimLow - rimHigh) * (x - x0)) / (x1 - x0);
            /* both gaps are read off the frame depth, so a 240 section simply
               gets a deeper reveal at the top and more air underneath */
            /* Air under the beams and the reveal under the rim are drawing
               choices, not catalogue dimensions - so where the fall has to be
               hidden they give way to it first, and the profiles sit up close
               under the rim. Where it is shown they keep the air, because an
               SL has nothing to hide. */
            const clear = Math.round(beam * (fallShown ? 0.20 : 0.05));
            const reveal = Math.max(8, Math.round(beam * (fallShown ? 0.15 : 0.06)));
            /* Non-F panel systems retain their previous packing calculation. */
            const room = Math.max(0, beam - clear - rd - PANEL - reveal);
            const hide = fallShown ? 0 : Math.min(fall, room);
            const drop = (x) => hide * ((x - inX0) / Math.max(1, inX1 - inX0));
            const secTop = (x) => (fallShown ? zRim(x) : rimLow) - beam + clear + rd;
            const integratedSpan = Math.max(1, inY1 - inY0);
            const integratedDrop = integratedSpan * (fallPct / 100);
            /* Canonical panel top-plane function. For F, y0 is the high side and
               y1 is the P1/P5/P3 water-exit side. The complete official 2 % fall
               is kept inside the horizontal perimeter envelope. */
            const roofZ = (x, y) => integratedFall
              ? bz + beam - reveal - integratedDrop * ((y - inY0) / integratedSpan)
              : secTop(x) + (fallShown ? 0 : hide - drop(x)) + PANEL;
            const panelTopZ = (x, y) => roofZ(x, y);
            const panelBottomZ = (x, y) => roofZ(x, y) - PANEL;
            const integratedSecTop = bz + Math.round((beam - rd) / 2) + rd;

            if (integratedFall) {
              /* All four F rails share the same top and bottom datum. */
              mitreRing(x0, y0, x1, y1, bz, fw, beam, frame);
            } else {
              /* Priznaný spád: horná rovina rámu klesá pozdĺž dĺžky, ale rohy
                 sú rezané na pokos rovnako ako na vodorovnom ráme. */
              mitreRing(x0, y0, x1, y1, zRim(x1) - beam, fw, beam, frame, zRim);
            }
            layer = roofBase;

            /* Secondary members are true catalogue rectangles. Integrated F
               members stay horizontal while the panel plane changes height
               across their span; SL keeps the established stepped geometry. */
            const glass = model().glazed === true;
            const roofFinish = ROOF_FINISHES[state.roofFinish] || ROOF_FINISHES[0];
            const sMax = loadKg() >= 240 ? 300 : (loadKg() >= 160 ? 600 : 1200);
            const bays = Math.max(3, Math.min(28, Math.ceil((inX1 - inX0) / sMax)));
            const step = (inX1 - inX0) / bays;
            const skinTop = glass ? 'rgba(203,222,231,.46)' : roofFinish.topHex;
            const skinLow = glass ? 'rgba(219,233,239,.34)' : roofFinish.bottomHex;
            const seamTop = glass ? shade(frame, 0.12) : shade(roofFinish.topHex, -0.24);
            const seamLow = glass ? shade(frame, 0.24) : shade(roofFinish.bottomHex, -0.18);
            /* seams follow the panels where the model is built from them, and
               fall back to the bay division where it is not */
            const widths = roofPanels();
            const cuts = [];
            if (widths) {
              const run = widths.reduce((a, v) => a + v, 0);
              const k = (inX1 - inX0) / run;          // the deck is the length less the frame
              let at = inX0;
              widths.forEach((v) => { cuts.push([at, at + v * k]); at += v * k; });
            } else {
              for (let i = 0; i < bays; i++) cuts.push([inX0 + step * i, inX0 + step * (i + 1)]);
            }
            /* The F beams sit on the official panel-module boundaries. Their
               footprints are removed from the panel mesh, so painter sorting is
               never asked to hide intersecting solids. */
            const beamCenters = integratedFall
              ? [inX0].concat(cuts.slice(0, -1).map((c) => c[1]), [inX1])
              : Array.from({ length: bays + 1 }, (_, i) => inX0 + step * i);
            /* Profil pri kraji sa zarovnáva dovnútra rámu, takže sa vie posunúť
               zo svojho rozhrania. Keď tým dosadne na suseda, ostane medzi nimi
               pás užší než osem milimetrov, ten vypadne z výberu palúb a v
               streche je diera. Každý beh sa preto posúva až za koniec toho
               predchádzajúceho a ktorý by sa už nezmestil, sa nekreslí. */
            const beamRuns = [];
            beamCenters.forEach((center) => {
              let a = Math.min(inX1 - rw, Math.max(inX0, center - rw / 2));
              const pred = beamRuns[beamRuns.length - 1];
              if (pred && a < pred.b + 10) a = pred.b + 10;
              if (a + rw > inX1 + 0.5) return;
              beamRuns.push({ a: a, b: a + rw, center: a + rw / 2 });
            });
            if (beamRuns.length) {
              const koniec = beamRuns[beamRuns.length - 1];
              if (koniec.b < inX1 - 10) { koniec.a = inX1 - rw; koniec.b = inX1; koniec.center = inX1 - rw / 2; }
            }

            if (integratedFall || !fromAbove || glass) {
              const lit = !fromAbove && state.ledSet && state.ledSet.on;
              beamRuns.forEach((run) => {
                const z = integratedFall ? integratedSecTop : secTop(run.center);
                boxFaces(run.a, inY0, z - rd, run.b - run.a, inY1 - inY0, rd, frame, ['-y', '+y']);
                if (lit) ledRect(run.a + rw * 0.32, run.a + rw * 0.68, inY0 + 40, inY1 - 40, z - rd, (state.ledSet || {}).type);
              });
            }

            const panelCuts = integratedFall
              ? beamRuns.slice(0, -1).map((run, i) => [run.b + 2, beamRuns[i + 1].a - 2]).filter((c) => c[1] - c[0] > 8)
              : cuts;
            const edgeHex = glass ? shade(frame, 0.10) : shade(roofFinish.bottomHex, -0.16);
            panelCuts.forEach((c) => {
              const a = c[0], b = c[1];
              const pane = glass ? { raw: true, bias: ON_SKIN } : { bias: integratedFall ? -20 : -600 };
              quad([[a, inY0, panelTopZ(a, inY0)], [b, inY0, panelTopZ(b, inY0)],
                    [b, inY1, panelTopZ(b, inY1)], [a, inY1, panelTopZ(a, inY1)]], skinTop,
                   Object.assign({ cull: true, edgeHex: seamTop }, pane));
              quad([[a, inY1, panelBottomZ(a, inY1)], [b, inY1, panelBottomZ(b, inY1)],
                    [b, inY0, panelBottomZ(b, inY0)], [a, inY0, panelBottomZ(a, inY0)]], skinLow,
                   Object.assign({ cull: true, edgeHex: seamLow }, pane));
              /* Odlesk oblohy. Skutočná panelová ani sklenená strecha nie je
                 jeden plochý tón — zbiera oblohu, najsvetlejšia je pri hrane
                 otočenej k slnku a smerom k divákovi zoslabne. Bez toho vyzerá
                 paluba ako papier. Pruhy, lebo vykresľovač maľuje plné plochy;
                 krok priehľadnosti je taký malý, že sa pásy nedajú rozoznať. */
              if (fromAbove) {
                const savedSheen = layer;
                layer = roofBase + ON_SKIN;
                const BANDS = 12;
                for (let i = 0; i < BANDS; i++) {
                  const ya = inY0 + ((inY1 - inY0) * i) / BANDS;
                  const yb = inY0 + ((inY1 - inY0) * (i + 1)) / BANDS;
                  const t = (i + 0.5) / BANDS;
                  const al = (0.012 + 0.062 * t * t).toFixed(4);
                  quad([[a, ya, panelTopZ(a, ya)], [b, ya, panelTopZ(b, ya)],
                        [b, yb, panelTopZ(b, yb)], [a, yb, panelTopZ(a, yb)]],
                       'rgba(255,255,255,' + al + ')',
                       { normal: [0, 0, 1], raw: true, edge: false, fit: false });
                }
                layer = savedSheen;
              }
              if (integratedFall) {
                const edge = { cull: true, edge: false, bias: -20 };
                quad([[a,inY0,panelTopZ(a,inY0)],[b,inY0,panelTopZ(b,inY0)],
                      [b,inY0,panelBottomZ(b,inY0)],[a,inY0,panelBottomZ(a,inY0)]], edgeHex, Object.assign({ normal:[0,-1,0] }, edge));
                quad([[a,inY1,panelBottomZ(a,inY1)],[b,inY1,panelBottomZ(b,inY1)],
                      [b,inY1,panelTopZ(b,inY1)],[a,inY1,panelTopZ(a,inY1)]], edgeHex, Object.assign({ normal:[0,1,0] }, edge));
                quad([[a,inY0,panelBottomZ(a,inY0)],[a,inY1,panelBottomZ(a,inY1)],
                      [a,inY1,panelTopZ(a,inY1)],[a,inY0,panelTopZ(a,inY0)]], edgeHex, Object.assign({ normal:[-1,0,0] }, edge));
                quad([[b,inY0,panelTopZ(b,inY0)],[b,inY1,panelTopZ(b,inY1)],
                      [b,inY1,panelBottomZ(b,inY1)],[b,inY0,panelBottomZ(b,inY0)]], edgeHex, Object.assign({ normal:[1,0,0] }, edge));
              }
            });
            /* The deck sits down inside the frame, and a rail standing that
               proud of it throws a line of shade along its own foot. Without
               it the deck reads as painted onto the opening rather than set
               into it - a flat fill meeting a flat fill at a hard edge, which
               is exactly what makes a render look drawn. Four soft bands, one
               per rail, stacked so they fade away from the metal. */
            if (!integratedFall && fromAbove && !glass) {
              const ao = Math.min(340, Math.max(120, beam * 1.1));
              const savedAO = layer;
              layer = roofBase + ON_SKIN;
              for (let i = 5; i >= 1; i--) {
                const g = (ao * i) / 5;
                const al = (0.030 * (1 - (i - 1) / 5)).toFixed(4);
                const band = (pts) => quad(pts, 'rgba(24,27,24,' + al + ')',
                  { normal: [0, 0, 1], raw: true, edge: false, fit: false });
                band([[inX0, inY0, panelTopZ(inX0,inY0)], [inX1, inY0, panelTopZ(inX1,inY0)],
                      [inX1, inY0 + g, panelTopZ(inX1,inY0+g)], [inX0, inY0 + g, panelTopZ(inX0,inY0+g)]]);
                band([[inX0, inY1 - g, panelTopZ(inX0,inY1-g)], [inX1, inY1 - g, panelTopZ(inX1,inY1-g)],
                      [inX1, inY1, panelTopZ(inX1,inY1)], [inX0, inY1, panelTopZ(inX0,inY1)]]);
                band([[inX0, inY0, panelTopZ(inX0,inY0)], [inX0 + g, inY0, panelTopZ(inX0+g,inY0)],
                      [inX0 + g, inY1, panelTopZ(inX0+g,inY1)], [inX0, inY1, panelTopZ(inX0,inY1)]]);
                band([[inX1 - g, inY0, panelTopZ(inX1-g,inY0)], [inX1, inY0, panelTopZ(inX1,inY0)],
                      [inX1, inY1, panelTopZ(inX1,inY1)], [inX1 - g, inY1, panelTopZ(inX1-g,inY1)]]);
              }
              layer = savedAO;
            }

            /* the four edges of the slab, so it is a solid and not two sheets */
            if (!integratedFall) {
              quad([[inX0,inY0,panelTopZ(inX0,inY0)],[inX1,inY0,panelTopZ(inX1,inY0)],[inX1,inY0,panelBottomZ(inX1,inY0)],[inX0,inY0,panelBottomZ(inX0,inY0)]], edgeHex, { normal:[0,-1,0], cull:true, edge:false, bias:-600 });
              quad([[inX0,inY1,panelBottomZ(inX0,inY1)],[inX1,inY1,panelBottomZ(inX1,inY1)],[inX1,inY1,panelTopZ(inX1,inY1)],[inX0,inY1,panelTopZ(inX0,inY1)]], edgeHex, { normal:[0,1,0], cull:true, edge:false, bias:-600 });
              quad([[inX0,inY0,panelBottomZ(inX0,inY0)],[inX0,inY1,panelBottomZ(inX0,inY1)],[inX0,inY1,panelTopZ(inX0,inY1)],[inX0,inY0,panelTopZ(inX0,inY0)]], edgeHex, { normal:[-1,0,0], cull:true, edge:false, bias:-600 });
              quad([[inX1,inY0,panelTopZ(inX1,inY0)],[inX1,inY1,panelTopZ(inX1,inY1)],[inX1,inY1,panelBottomZ(inX1,inY1)],[inX1,inY0,panelBottomZ(inX1,inY0)]], edgeHex, { normal:[1,0,0], cull:true, edge:false, bias:-600 });
            }

            if (!fromAbove) {
              const rib = 'rgba(120,126,118,.30)';
              /* Rebrá podhľadu bežia po celej doske v stálom rastri. Kreslili
                 sa po poliach a rozdelené na rovnaké diely, takže rozostup
                 vnútri poľa bol iný ako cez spoj a na dvoch miestach zrazu
                 vznikla širšia medzera — vyzeralo to ako chyba, nie ako profil.
                 Teraz je raster jeden na celú dosku a rebro, ktoré by padlo na
                 nosník, sa jednoducho vynechá. */
              const RIB_BUDGET = 110;
              const run = inX1 - inX0;
              const pitchRib = Math.max(run / RIB_BUDGET, 250);
              for (let x = inX0 + pitchRib * 0.5; x < inX1 - 20; x += pitchRib) {
                if (beamRuns.some((r) => x > r.a - rw * 0.6 && x < r.b + rw * 0.6)) continue;
                quad([[x - 4,inY1 - 45,panelBottomZ(x - 4,inY1 - 45)], [x + 4,inY1 - 45,panelBottomZ(x + 4,inY1 - 45)],
                      [x + 4,inY0 + 45,panelBottomZ(x + 4,inY0 + 45)], [x - 4,inY0 + 45,panelBottomZ(x - 4,inY0 + 45)]], rib,
                     { bias: ON_SKIN, edge: false, raw: true });
              }
            }
          } else {
            mitreRing(0, 0, L, W, bz, post, beam, frame);
            layer = roofBase;

            /* LED recessed in the frame, seen when you look up at the pergola */


            const n = (model().lamellas || [])[state.length] || Math.max(4, Math.round((L - 2 * post) / 183));
            const i0 = post, i1 = L - post;
            const pitch = (i1 - i0) / n;
            const blade = louverSize();
            const bladeW = blade.w;                      // "lamela 200" or "lamela 270"
            const ang = louverAngle(beam, bladeW, state.louverT);
            const y0 = post, y1 = W - post;
            const lap = 30;   // blades tuck under the rails rather than butting them
            /* Šírka, ktorou sa lamela naozaj kreslí. Jediné, čo maliarske
               triedenie nevie rozhodnúť, sú dve plochy, ktoré sa prekrývajú a
               ležia takmer v jednej rovine — vtedy sa medzi snímkami prehadzuje
               ich poradie a lamely preblikávajú. Preto sa lamela kreslí vždy
               nanajvýš tak široko, aby jej priemet do roviny strechy práve
               vyplnil rozteč: pri dosadnutí je z lamiel súvislá rovná plocha,
               pri otvorení plná lamela s medzerami, a medzi tým sa nikdy
               neprekryjú. Prechod je spojitý, takže sa všetky lamely hýbu
               rovnakou rýchlosťou a nič sa cestou nemení skokom.

               Prekrytie, ktoré tu ubudne, je ten lap, ktorým lamela zapadá pod
               susednú — ten aj v skutočnosti nie je vidieť. */
            const najviac = (pitch / 2) / Math.max(0.2, Math.cos(ang));
            const half = Math.min(bladeW / 2, najviac);
            const otvorenie = Math.min(1, ang / Math.max(1e-6, LOUVER_MAX(beam, bladeW) * 0.2));
            const dx = half * Math.cos(ang), dz = half * Math.sin(ang);
            /* The roof plane finishes level with the top of the frame at every
               position - that edge is the line the eye reads as the roof. Shut,
               the blades lie flat and overlap by the 17 mm the pitch leaves
               over, which is the seal; there is no separate closed state to
               jump to, it is simply this one at nought degrees. */
            const mid = bz + beam - dz;
            const t = blade.t;                     // blade thickness, along its own normal
            const ox = t * dz / half, oz = -t * dx / half;
            /* Which blades carry a strip, and how long each one is. The strip is
               recessed into the underside of the blade, so it is only ever seen
               from below - the same rule the panel roof uses. Without it the
               glow was drawn over the top of the blades as well. */
            const ledOn = !fromAbove && state.ledSet && state.ledSet.on;
            const ledQty = Math.min(n, Math.max(1, (state.ledSet || {}).qty || 1));
            const ledLen = [500, 1000, 1500][(state.ledSet || {}).len || 1] || 1000;
            const ledLit = new Set();
            if (ledOn) for (let q = 0; q < ledQty; q++) ledLit.add(Math.round(((n - 1) * (q + 0.5)) / ledQty));
            const ledCol = LED_TINT[(state.ledSet || {}).type] || LED_TINT.warm;

            for (let i = 0; i < n; i++) {
              const x = i0 + pitch * (i + 0.5);
              const aX = x - dx, aZ = mid - dz, bX = x + dx, bZ = mid + dz;
              /* Shut, the blades overlap and lie in one plane, so a centroid
                 cannot order them. Stepping the bias along the run makes each
                 blade lap the one before it, the way they actually close. */
              const lay = { bias: i * 0.02 };
              /* Zospodu je vidieť len rub lamiel a ich čelnú hranu. Rub mal
                 -0.20 a hrana -0.30, čo je na antracite rozdiel, ktorý oko
                 nerozozná: strecha zdola vyzerala ako jedna hladká doska a
                 lamely z nej zmizli. Na bielej farbe bolo pritom všetko
                 vidieť, takže nešlo o poradie kreslenia, ale o tón. Hrana je
                 preto výrazne tmavšia a každá lamela dostane vlastný obrys —
                 tak sa rad číta na každej farbe aj z každého uhla. */
              /* Obrys lamely sa nesmie kresliť inou farbou než jej plocha.
                 Maliarske triedenie delí plochy rovinami ostatných dielov a
                 rozdelený kúsok dostáva obrys vo farbe výplne, aby cez neho
                 nebolo vidieť rez. Nerozdelený kúsok mal ale obrys tmavý —
                 a keďže sa počas pohybu delí zakaždým niečo iné, obrysy
                 lamiel medzi snímkami blikali. Teraz je obrys vždy vo farbe
                 vlastnej plochy: rozdelený aj nerozdelený kus vyzerá rovnako,
                 vlasové škáry medzi plochami sa aj tak zatvoria a kontrast
                 nesie geometria — dva pásy na rube a tmavšia čelná hrana. */
              const obrys = { arris: false };
              const layO = Object.assign({}, lay, obrys);
              quad([[aX,y0-lap,aZ],[bX,y0-lap,bZ],[bX,y1+lap,bZ],[aX,y1+lap,aZ]], shade(louv, 0.16), layO);
              /* Rub lamely nie je jeden tón. Horná hrana je zastrčená pod
                 susednou lamelou, takže tá polovica je v jej tieni; spodná
                 hrana je otvorená k oblohe a je svetlejšia. Rub sa preto
                 kreslí ako dva pásy. Je to skutočný jav a zároveň jediné,
                 čo dá radu lamiel kontrast aj na antracite — na bielej bolo
                 všetko vidieť, na tmavej sa strecha zdola zlievala do dosky. */
              const sX = (aX + bX) / 2 + ox, sZ = (aZ + bZ) / 2 + oz;
              quad([[aX+ox,y1+lap,aZ+oz],[sX,y1+lap,sZ],[sX,y0-lap,sZ],[aX+ox,y0-lap,aZ+oz]], shade(louv, -0.04), layO);
              quad([[sX,y1+lap,sZ],[bX+ox,y1+lap,bZ+oz],[bX+ox,y0-lap,bZ+oz],[sX,y0-lap,sZ]], shade(louv, -0.40), layO);
              quad([[bX,y0-lap,bZ],[bX,y1+lap,bZ],[bX+ox,y1+lap,bZ+oz],[bX+ox,y0-lap,bZ+oz]], shade(louv, -0.48), layO);
              /* Tesniaca hrana, ktorou lamely dosadajú jedna na druhú. Pri
                 dosadnutí by ležala v rovine hornej plochy a prekrývala ju,
                 tak sa spolu s prekrytím stiahne na nulu a nekreslí sa. */
              const lipX = dx * 0.16 * otvorenie, lipZ = dz * 0.16 * otvorenie;
              if (otvorenie > 0.02)
                quad([[aX,y0-lap,aZ],[aX+lipX,y0-lap,aZ+lipZ],[aX+lipX,y1+lap,aZ+lipZ],[aX,y1+lap,aZ]], shade(louv, -0.40), layO);

              /* the strip lies in the underside of this blade, along it, so it
                 tilts with the blade instead of floating at a fixed height */
              if (ledLit.has(i)) {
                const cx = (aX + bX) / 2 + ox, cz = (aZ + bZ) / 2 + oz;
                const ux = dx / half, uz = dz / half;
                const yc = (y0 + y1) / 2, hy = Math.min((y1 - y0) / 2 - 30, ledLen / 2);
                const strip = (w, fill, bias) => quad([
                  [cx - ux * w, yc - hy, cz - uz * w], [cx + ux * w, yc - hy, cz + uz * w],
                  [cx + ux * w, yc + hy, cz + uz * w], [cx - ux * w, yc + hy, cz - uz * w]
                ], fill, { normal: [0, 0, -1], cull: true, edge: false, raw: true, bias: bias });
                for (let k = 3; k >= 1; k--) strip(9 + k * 22, 'rgba(' + ledCol.spill + ',' + (0.06 * (4 - k)).toFixed(3) + ')', 380 + (3 - k));
                strip(13, 'rgba(20,19,16,.5)', 396);
                strip(8, ledCol.core, 400);
              }
            }

          }

          layer = 0;

          // fit and paint
          const boxW = canvas.clientWidth || 900;
          const boxH = canvas.clientHeight || 675;
          const VW = 1000;
          const VH = Math.max(420, Math.round(VW * (boxH / Math.max(1, boxW))));
          canvas.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
          const pad = Math.round(Math.min(VW, VH) * 0.08);
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          faces.forEach((f) => { if (!f.fit) return; f.p.forEach((q) => {
            if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x;
            if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y;
          }); });
          const scale = Math.min((VW - pad * 2) / Math.max(1, maxX - minX), (VH - pad * 2) / Math.max(1, maxY - minY));
          const ox = pad - minX * scale + ((VW - pad * 2) - (maxX - minX) * scale) / 2;
          const oy = pad - minY * scale + ((VH - pad * 2) - (maxY - minY) * scale) / 2;

          const g = svgEl('g', { 'shape-rendering': 'geometricPrecision' });
          bspPaintOrder(faces).forEach((f) => {
            const pts = f.p.map((q) => (q.x * scale + ox).toFixed(1) + ',' + (q.y * scale + oy).toFixed(1)).join(' ');
            const a = { points: pts, fill: f.fill };
            /* Two anti-aliased faces sharing an edge leave a hairline of
               background between them. Stroking each face in its own colour
               closes it; the corner still reads, because the two sides are
               genuinely lit differently. */
            if (f.edge) { a.stroke = f.edgeCol; a['stroke-width'] = '1'; a['stroke-linejoin'] = 'round'; }
            if (f.seamless) a['shape-rendering'] = 'crispEdges';
            g.appendChild(svgEl('polygon', a));
          });
          /* A screen reader gets the configuration, not just "a visualisation". */
          const above = view.el >= 0.9 ? 'zhora' : (view.el < 0 ? 'zdola' : 'zboku');
          canvas.setAttribute('aria-label',
            `${model().label || state.model}, ${money.format(widthMM())} krát ${money.format(lengthMM())} milimetrov, ` +
            `${state.frameColor.name}, pohľad ${above}`);
          canvas.textContent = '';
          if (faces.some((f) => String(f.fill).indexOf(`url(#${meshPatternId})`) === 0)) {
            const defs = svgEl('defs', {});
            const pattern = svgEl('pattern', { id: meshPatternId, patternUnits: 'userSpaceOnUse', width: '14', height: '8' });
            const meshColor = shade(boxFillColor().hex, 0.30);
            pattern.appendChild(svgEl('rect', { width: '14', height: '8', fill: shade(boxFillColor().hex, -0.40) }));
            pattern.appendChild(svgEl('path', {
              d: 'M-7 4L0 0L7 4L0 8ZM7 4L14 0L21 4L14 8Z',
              fill: 'none', stroke: meshColor, 'stroke-width': '1.35', 'stroke-linejoin': 'round'
            }));
            defs.appendChild(pattern);
            canvas.appendChild(defs);
          }
          canvas.appendChild(g);
        };

        /* ------------------------------------------------------------ panel */
        const q = (sel) => cfgRoot.querySelector(sel);
        const buildModels = () => {
          const host = q('[data-sp-models]');
          host.textContent = '';
          BIO.order.forEach((key) => {
            const m = BIO.models[key];
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.spModel = key;
            b.setAttribute('aria-pressed', String(key === state.model));
            b.innerHTML = `<strong>${m.label}</strong><small>${m.blurb}</small>`;
            host.appendChild(b);
          });
        };
        let placesBuilt = false;
        const buildPlaces = () => {
          const host = cfgRoot.querySelector('[data-sp-places]');
          if (!host) return;
          const ISO = (u, v, h) => [
            +(55 + u * 53.7 - v * 37.6).toFixed(1),
            +(44 + u * 31 + v * 21.7 - h).toFixed(1)
          ];
          const pts = (list) => list.map((q) => q.join(',')).join(' ');
          const ROOF = 28.5, WALL_TOP = 44.6, OVER_U = 0.08, OVER_V = 0.114;
          const wallFace = (side) => {
            if (side === 'rear' || side === 'front') {
              const v = side === 'rear' ? 0 : 1;
              return [ISO(-OVER_U, v, 0), ISO(1 + OVER_U, v, 0), ISO(1 + OVER_U, v, WALL_TOP), ISO(-OVER_U, v, WALL_TOP)];
            }
            const u = side === 'left' ? 0 : 1;
            return [ISO(u, -OVER_V, 0), ISO(u, 1 + OVER_V, 0), ISO(u, 1 + OVER_V, WALL_TOP), ISO(u, -OVER_V, WALL_TOP)];
          };
          const wallPoly = (q, light) => '<polygon points="' + pts(q) + '" fill="rgba(69,90,100,' + (light ? '.09' : '.13') + ')" stroke="#607d8b" stroke-width="1.2"/>';

          const sig = (q) => (q.walls || []).slice().sort().join('+') + (q.noPosts ? '|0' : '') + (q.freePosts ? '|f' : '');
          const drawn = {};
          FALLBACK_PLACEMENTS.forEach((q) => {
            const had = host.querySelector('[data-sp-place="' + q.id + '"] svg');
            if (had) drawn[sig(q)] = had.innerHTML;
          });

          const label = (pl) => '<span><b>' + (pl.tip == null ? 'Možnosť ' + (PLACEMENTS.indexOf(pl) + 1) : 'TYP ' + pl.tip) + '</b><br>' + pl.label + '</span>';
          host.textContent = '';
          PLACEMENTS.forEach((pl) => {
            const walls = pl.walls || [];
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'sp-tile';
            b.dataset.spPlace = pl.id;
            b.setAttribute('aria-pressed', String(pl.id === state.placement));
            const ready = drawn[sig(pl)];
            if (ready) { b.innerHTML = '<svg viewBox="0 0 110 76" aria-hidden="true">' + ready + '</svg>' + label(pl); host.appendChild(b); return; }
            const svg = [];
            walls.forEach((side) => svg.push(wallPoly(wallFace(side), side === 'left' || side === 'right')));
            svg.push('<polygon points="' + pts([ISO(0,0,0), ISO(1,0,0), ISO(1,1,0), ISO(0,1,0)]) + '" fill="rgba(18,18,18,.05)"/>');
            if (!pl.noPosts) {
              (pl.freePosts ? [[0,0],[1,1]] : [[0,0],[1,0],[1,1],[0,1]]).forEach((c) => {
                if (walls.indexOf('rear') > -1 && c[1] === 0) return;
                if (walls.indexOf('front') > -1 && c[1] === 1) return;
                if (walls.indexOf('left') > -1 && c[0] === 0) return;
                if (walls.indexOf('right') > -1 && c[0] === 1) return;
                const q0 = ISO(c[0], c[1], 0), q1 = ISO(c[0], c[1], ROOF);
                svg.push('<line x1="' + q0[0] + '" y1="' + q0[1] + '" x2="' + q1[0] + '" y2="' + q1[1] + '" class="sp-tile__ink" stroke-width="2.6"/>');
              });
            }
            svg.push('<polygon points="' + pts([ISO(0,0,ROOF), ISO(1,0,ROOF), ISO(1,1,ROOF), ISO(0,1,ROOF)]) + '" fill="#fff" class="sp-tile__ink" stroke-width="2"/>');
            for (let i = 1; i < 8; i++) {
              const t = i / 8, q0 = ISO(t, 0, ROOF), q1 = ISO(t, 1, ROOF);
              svg.push('<line x1="' + q0[0] + '" y1="' + q0[1] + '" x2="' + q1[0] + '" y2="' + q1[1] + '" class="sp-tile__ink" stroke-width="1.1"/>');
            }
            b.innerHTML = '<svg viewBox="0 0 110 76" aria-hidden="true">' + svg.join('') + '</svg>' + label(pl);
            host.appendChild(b);
          });
        };

        const buildColors = (host, current, attr) => {
          if (!host) return;
          host.textContent = '';
          BIO.colors.forEach((c, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'sp-colorchip';
            b.dataset[attr] = String(i);
            b.setAttribute('aria-pressed', String(c.ral === current.ral));
            b.setAttribute('title', `${c.name} ${c.ral}`);
            b.innerHTML = `<span style="--sp-swatch:${c.hex}"></span><small>${c.ral.replace('RAL ', '')}</small>`;
            host.appendChild(b);
          });
        };
        const buildRoofFinishes = () => {
          let wrap = cfgRoot.querySelector('[data-sp-roof-colors-wrap]');
          let host = cfgRoot.querySelector('[data-sp-roof-colors]');
          /* Add the selector to older standalone markup. The options remain
             hidden for louvered or glazed roofs, exactly like in Shopify. */
          if (!wrap || !host) {
            const frameColors = cfgRoot.querySelector('[data-sp-frame-colors]');
            if (frameColors) {
              wrap = document.createElement('div');
              wrap.className = 'sp-roof-finish';
              wrap.dataset.spRoofColorsWrap = '';
              wrap.hidden = true;
              wrap.innerHTML = '<div class="sp-step__label"><b>Strešný ISO panel</b><span class="sp-step__val" data-sp-roof-val></span></div>'
                + '<p class="sp-roof-finish__legend"><span>vrch</span><span>spodná strana</span></p>'
                + '<div class="sp-roofcolors" role="group" aria-label="Kombinácia farby vrchnej a spodnej strany strešného panela" data-sp-roof-colors></div>'
                + '<p class="sp-side-note">Všetkých päť kombinácií je v cene. Ide o výrobný odtieň panela, preto sa môže mierne líšiť od práškovo lakovanej konštrukcie.</p>';
              const paletteNote = frameColors.nextElementSibling;
              if (paletteNote) paletteNote.before(wrap); else frameColors.after(wrap);
              host = wrap.querySelector('[data-sp-roof-colors]');
            }
          }
          if (!wrap || !host) return;
          const available = model().roof === 'panel' && model().glazed !== true;
          wrap.hidden = !available;
          if (!available) { host.textContent = ''; return; }
          const chosen = ROOF_FINISHES[state.roofFinish] || ROOF_FINISHES[0];
          const value = wrap.querySelector('[data-sp-roof-val]');
          if (value) value.textContent = `${chosen.top} / ${chosen.bottom}`;
          host.textContent = '';
          ROOF_FINISHES.forEach((finish, i) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'sp-roofchip';
            button.dataset.spRoofFinish = String(i);
            button.setAttribute('aria-pressed', String(i === state.roofFinish));
            button.setAttribute('aria-label', `Strešný panel: vrch ${finish.top}, spodná strana ${finish.bottom}`);
            button.innerHTML = `<span class="sp-roofchip__sample" aria-hidden="true"><i style="--sp-roof-top:${finish.topHex}"></i><i style="--sp-roof-bottom:${finish.bottomHex}"></i></span>`
              + `<span><strong>${finish.top.replace('RAL ', '')}</strong><small>spodok ${finish.bottom.replace('RAL ', '')}</small></span>`;
            host.appendChild(button);
          });
        };

        /* The movement control belongs to the side currently being edited.
           It used to be rebuilt inside priceLines() for all four sides, so the
           last side in that loop silently won. Keeping the renderer here also
           makes the price calculation pure and movement independent of totals. */
        const renderSideMover = () => {
          const host = cfgRoot.querySelector('[data-sp-side-move]');
          if (!host) return;
          const side = state.activeSide;
          const movable = SIDE_MOVES[state.sides[side]];
          const where = SIDE_LOCATIVE[side];
          host.hidden = !movable;
          if (!movable) { host.textContent = ''; return; }
          host.innerHTML = `<div class="sp-side-move__head"><b>Pohyb: ${SIDE_LABEL[side].toLowerCase()} strana</b><span>potiahnite alebo podržte</span></div>`
            + `<div class="sp-louver-run">`
            + `<button type="button" class="sp-louver-btn" data-sp-louver-hold="-1" data-sp-hold-ch="side" aria-label="Zatvárať ${movable} na ${where} strane — podržte"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9l-6 6-6-6"/></svg></button>`
            + `<input class="sp-louver-range" type="range" min="0" max="100" step="1" data-sp-side-range aria-label="Odsunutie ${where} strany, 0 zatvorené až 100 odsunuté">`
            + `<button type="button" class="sp-louver-btn" data-sp-louver-hold="1" data-sp-hold-ch="side" aria-label="Odsúvať ${movable} na ${where} strane — podržte"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button>`
            + `</div><span class="sp-louver-pct" data-sp-side-pct aria-live="polite"></span>`;
          syncSideMove();
        };
        const buildLoads = () => {
          const host = cfgRoot.querySelector('[data-sp-loads]');
          if (!host) return;
          if (!hasLoads()) { host.textContent = ''; return; }   // don't leave the last model's chips behind
          const hint = { 60: 'nížiny', 100: 'nížiny', 120: 'podhorie', 160: 'podhorie', 240: 'hory' };
          host.textContent = '';
          loadList().forEach((load, index) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'sp-chip';
            b.dataset.spLoadIdx = String(index);
            b.setAttribute('aria-pressed', String(index === state.load));
            b.innerHTML = '<strong>' + load + ' kg/m²</strong><span>' + (hint[load] || '') + '</span>';
            host.appendChild(b);
          });
        };

        const buildSideOpts = () => {
          const host = q('[data-sp-side-opts]');
          const side = state.activeSide;
          host.textContent = '';
          let lastGroup = '';
          SIDE_OPTS.forEach((o) => {
            const group = o.id === 'open' ? 'Bez výplne'
              : SIDE_MOVES[o.id] ? 'Pohyblivé tienenie a panely' : 'Pevné výplne';
            if (group !== lastGroup) {
              const heading = document.createElement('p');
              heading.className = 'sp-side-opts__group';
              heading.textContent = group;
              host.appendChild(heading);
              lastGroup = group;
            }
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'sp-sideopt';
            b.dataset.spSideOpt = o.id;
            b.setAttribute('aria-pressed', String(state.sides[side] === o.id));
            b.innerHTML = `<span class="sp-sideopt__copy"><strong>${o.label}</strong><em>${o.note}</em></span>`
              + `<i class="sp-sideopt__check" aria-hidden="true"></i>`;
            host.appendChild(b);
          });
          cfgRoot.querySelectorAll('[data-sp-side]').forEach((btn) => {
            btn.setAttribute('aria-expanded', String(btn.dataset.spSide === side));
            btn.classList.toggle('is-set', state.sides[btn.dataset.spSide] !== 'open');
          });
          const span = sideSpan(side);
          let note = `${SIDE_LABEL[side]} strana meria ${mm(span)}.`;
          if (state.sides[side] === 'zip' && (span > 6500 || state.height > 2800)) {
            note += ' ZIP roleta K130 zvláda šírku do 6 500 mm a výšku do 2 800 mm — pri týchto rozmeroch ju rozdelíme na dve polia a nacenime individuálne.';
          }
          q('[data-sp-side-note]').textContent = note;
          renderSideMover();
        };
        const syncSliders = () => {
          const m = model();
          const w = q('[data-sp-w]'), l = q('[data-sp-l]'), h = q('[data-sp-h]');
          const wrap = cfgRoot.querySelector('[data-sp-width-slider]');
          const loadField = cfgRoot.querySelector('[data-sp-load-field]');
          if (wrap) wrap.hidden = isLoad();
          if (loadField) loadField.hidden = !hasLoads() || loadList().length < 2;
          if (!isLoad()) {
            w.min = String(m.widths[0]);
            w.max = String(m.widths[m.widths.length - 1]);
            w.step = '1';
            w.value = String(widthMM());
          }
          l.min = String(m.lengths[0]);
          l.max = String(m.lengths[m.lengths.length - 1]);
          l.step = '1';
          l.value = String(lengthMM());
          /* The height had the only slider whose end the model did not set, so
             it kept the markup's 3 000 while every carport and canopy model
             carries maxHeight 2800 - the configurator would draw, and price, a
             structure taller than the model is made in. */
          const hMax = Number(m.maxHeight) || Number(h.max) || 3000;
          h.max = String(hMax);
          h.step = '1';
          if (state.height > hMax) state.height = hMax;
          h.value = String(state.height);
          [w, l, h].forEach((s) => {
            const min = Number(s.min || 0), max = Number(s.max) || 1;
            s.style.setProperty('--sp-fill', `${((Number(s.value) - min) / (max - min || 1)) * 100}%`);
          });
          q('[data-sp-w-out]').textContent = mm(widthMM());
          q('[data-sp-l-out]').textContent = mm(lengthMM());
          q('[data-sp-h-out]').textContent = mm(state.height);
          if (!isLoad()) {
            q('[data-sp-w-min]').textContent = mm(m.widths[0]);
            q('[data-sp-w-max]').textContent = mm(m.widths[m.widths.length - 1]);
          }
          q('[data-sp-l-min]').textContent = mm(m.lengths[0]);
          q('[data-sp-l-max]').textContent = mm(m.lengths[m.lengths.length - 1]);
          q('[data-sp-h-min]').textContent = mm(Number(h.min) || 2000);
          q('[data-sp-h-max]').textContent = mm(hMax);
        };
        // Render synchronously: a dropped animation frame used to leave sliders
        // looking broken, and the redraw is cheap.
        let renderPending = false;
        let renderTimer = 0;
        const scheduleRender = () => {
          if (renderPending) return;
          renderPending = true;
          const run = () => { if (!renderPending) return; renderPending = false; window.clearTimeout(renderTimer); renderAll(); };
          window.requestAnimationFrame(run);
          renderTimer = window.setTimeout(run, 60);
        };
        const addChips = (label, items, active, key) => {
          const row = [`<div class="sp-add__lab">${label}</div>`, '<div class="sp-add__row">'];
          items.forEach((it, i) => {
            row.push(`<button type="button" class="sp-chip" data-sp-add-opt="${key}" data-sp-add-i="${i}" aria-pressed="${String(i === active)}"${it.off ? ' disabled' : ''}><strong>${it.t}</strong>${it.s ? `<span>${it.s}</span>` : ''}</button>`);
          });
          row.push('</div>');
          return row.join('');
        };

        const buildAddons = () => {
          const host = q('[data-sp-addons]');
          if (!host) return;
          const add = BIO.addons || {};
          const html = [];
          let count = 0;

          /* Odznak hovorí, koľko doplnkov je vybratých. Skupina z cenníka sa
             zapne už tým, že sa rozbalí, takže počítanie zapnutých spravilo
             z prázdnej rozbalenej skupiny vybratý doplnok. Skupiny preto
             posielajú v `picked`, čo naozaj prispieva. */
          const row = (key, on, title, note, body, off, picked) => {
            if (picked === undefined ? on : picked) count++;
            html.push(`<div class="sp-add${off ? ' is-off' : ''}"><div class="sp-add__head"><div class="sp-add__t">${title}<small>${note}</small></div>`
              + `<label class="sp-switch"><input type="checkbox" data-sp-add-on="${key}"${on ? ' checked' : ''}${off ? ' disabled' : ''}><span></span></label></div>`
              + `<div class="sp-add__body"${on ? '' : ' hidden'}>${on ? body() : ''}</div></div>`);
          };

          // rear box: on screen whenever the model has one in the price list, so
          // both the sizes and the reason a size is out of reach stay visible
          const ws = boxWidths(), ds = boxDepths();
          if (boxTable() && ws.length && ds.length) {
            const bp = boxPrice();
            const fits = Boolean(bp);
            const minW = Math.min.apply(null, ws.map((o) => o.v));
            const minD = Math.min.apply(null, ds.map((o) => o.v));
            row('box', state.box.on && fits, 'Zadný box',
                fits
                ? `Uzamykateľný sklad na konci prístrešku. Od ${money.format(bp.v)} €.`
                : `Najmenší box z cenníka je ${mm(minW)} × ${mm(minD)} — zväčšite rozmer v kroku 2.`,
              () => [
                addChips('Šírka boxu', ws.map((o) => ({ t: mm(o.v), s: o.ok ? '' : 'širší ako prístrešok', off: !o.ok })), bp.wi, 'boxw'),
                addChips('Hĺbka boxu', ds.map((o) => ({ t: mm(o.v), s: o.ok ? '' : (o.overBay ? 'nad pole P1–P5' : 'dlhší ako prístrešok'), off: !o.ok })), bp.di, 'boxd'),
                addChips('Výplň', boxFinishOptions().map((o) => ({ t: o.label })), Math.max(0, boxFinishOptions().findIndex((o) => o.key === state.box.fin)), 'boxf'),
                `<div class="sp-add__lab">Farba boxu</div><div class="sp-colorrow sp-colorrow--sm" data-sp-box-colors></div>`,
                `<p class="sp-add__note">Box stojí pod strechou na jednom konci, takže sa zmestí do ${mm(widthMM())} šírky prístrešku${boxBayMax() < Infinity ? `, a jeho hĺbku cenník obmedzuje na ${mm(boxBayMax())} (pole P1–P5)` : ` a ${mm(lengthMM())} dĺžky`}. Väčší box otvoríte zväčšením prístrešku v kroku 2.</p>`
              ].join(''), !fits);
          } else if (add.box) {
            // the model itself has no box in the price list - say which ones do
            const labels = Object.keys(add.box.modelFamily || {})
              .filter((k) => BIO.models[k]).map((k) => BIO.models[k].label);
            row('box', false, 'Zadný box',
              labels.length ? `Cenník uvádza box pri modeloch ${labels.join(' a ')} — model prepnete v kroku 1.`
                            : 'Pri tomto modeli cenník box neuvádza.',
              () => '', true);
          }

          // decorative soffit, by the square metre
          if (ceilingOptions().length) {
            const co = ceilingOptions();
            const ci = co.findIndex((o) => o.key === state.ceiling);
            row('ceiling', state.ceiling !== 'none', 'Dekoratívny strop',
              `Lamelový podhľad pod celou strechou, ${area1.format(ceilingArea())} m².`,
              () => addChips('Vyhotovenie',
                co.map((o) => ({ t: o.label, s: `${money.format(Math.round(BIO.addons.ceiling[o.key] * ceilingArea()))} €` })),
                ci < 0 ? 0 : ci, 'ceil'));
          }

          // lighting: a table of types and lengths where there is one, otherwise
          // the flat per-metre price the pergola list uses
          if (add.led) {
            const types = [['warm', 'Teplá biela'], ['neutral', 'Neutrálna'], ['rgb', 'RGB']];
            const lens = ['500', '1000', '1500'];
            const ti = Math.max(0, types.findIndex((t) => t[0] === state.ledSet.type));
            const price = add.led[state.ledSet.type] && add.led[state.ledSet.type][lens[state.ledSet.len]];
            const inBlade = model().roof !== 'panel';
            const qty = Math.max(1, state.ledSet.qty || 1);
            row('led', state.ledSet.on, 'LED osvetlenie',
              (inBlade ? 'Pás zapustený priamo v lamele. ' : 'Pás zapustený v priečnom profile. ')
                + (price ? `${money.format(price)} € / ks.` : ''),
              () => [
                addChips('Farba svetla', types.map((t) => ({ t: t[1] })), ti, 'ledt'),
                addChips('Dĺžka pásu', lens.map((v) => ({ t: mm(Number(v)) })), state.ledSet.len, 'ledl'),
                `<div class="sp-add__lab">Počet pásov</div><div class="sp-stepper">`
                  + `<button type="button" data-sp-led="-1" aria-label="Menej pásov">−</button>`
                  + `<output data-sp-led-out>${qty}</output>`
                  + `<button type="button" data-sp-led="1" aria-label="Viac pásov">+</button></div>`
              ].join(''));
          }

          // roof profiles, glass and sheet, by the metre or the square metre
          if (BIO.roofOpt) {
            const chosen = BIO.roofOpt.filter((it) => state.extras[it.id]);
            const total = chosen.reduce((a, it) => a + it.price * state.extras[it.id], 0);
            row('x-roof', !!state.extrasOpen.roof || chosen.length > 0, 'Strešné profily a výplne',
              chosen.length ? `${chosen.length} z ${BIO.roofOpt.length} · ${money.format(total)} €`
                            : `${BIO.roofOpt.length} možností z cenníka`,
              () => '<div class="sp-xlist">' + BIO.roofOpt.map((it) => {
                const q = state.extras[it.id] || 0;
                return `<div class="sp-xrow${q ? ' is-on' : ''}"><div class="sp-xrow__t"><b>${it.label}</b>`
                  + `<small>${money.format(it.price)} € / ${it.unit === 'm2' ? 'm²' : 'm'}</small></div>`
                  + `<div class="sp-stepper sp-stepper--sm">`
                  + `<button type="button" data-sp-x="${it.id}" data-sp-xd="-1" aria-label="Menej: ${it.label}">−</button>`
                  + `<output>${q}</output>`
                  + `<button type="button" data-sp-x="${it.id}" data-sp-xd="1" aria-label="Viac: ${it.label}">+</button>`
                  + '</div></div>';
              }).join('') + '</div>', false, chosen.length > 0);
          }

          // everything else the catalogue prices, straight from the payload
          (BIO.extras || []).forEach((g) => {
            const chosen = g.items.filter((it) => state.extras[it.id]);
            /* An item the catalogues do not price carries null, and the summary
               already calls that "na nacenenie". Multiplying it out gave 0, so
               the list offered the Solar Pack at 0 € and the group total quietly
               left it out - two places saying different things about one item. */
            const priced = chosen.filter((it) => it.price != null);
            const total = priced.reduce((a, it) => a + it.price * state.extras[it.id], 0);
            const toAsk = chosen.length - priced.length;
            const sum = toAsk
              ? (priced.length ? `${money.format(total)} € + ${toAsk} na nacenenie` : 'na nacenenie')
              : `${money.format(total)} €`;
            const anyPriced = g.items.some((it) => it.price != null);
            row('x-' + g.id, !!state.extrasOpen[g.id] || chosen.length > 0, g.label,
              chosen.length ? `${chosen.length} ${chosen.length === 1 ? 'položka' : chosen.length < 5 ? 'položky' : 'položiek'} · ${sum}`
                            : `${g.items.length} ${g.items.length < 5 ? 'možnosti' : 'možností'}${anyPriced ? ' z cenníka' : ' na nacenenie'}`,
              () => '<div class="sp-xlist">' + g.items.map((it) => {
                const q = state.extras[it.id] || 0;
                return `<div class="sp-xrow${q ? ' is-on' : ''}">`
                  + `<div class="sp-xrow__t"><b>${it.label}</b><small>${it.price == null ? 'na nacenenie' : `${money.format(it.price)} € / ks`}</small></div>`
                  + `<div class="sp-stepper sp-stepper--sm">`
                  + `<button type="button" data-sp-x="${it.id}" data-sp-xd="-1" aria-label="Menej: ${it.label}">−</button>`
                  + `<output>${q}</output>`
                  + `<button type="button" data-sp-x="${it.id}" data-sp-xd="1" aria-label="Viac: ${it.label}">+</button>`
                  + '</div></div>';
              }).join('') + '</div>', false, chosen.length > 0);
          });

          // anchoring
          if (BIO.anchors) {
            const opts = [['galv', 'Galvanizované'], ['coated', 'Galv. + náter'], ['inox', 'Nerez']];
            const ai = opts.findIndex((o) => o[0] === state.anchor);
            row('anchor', state.anchor !== 'none', 'Vonkajšie kotvenie',
              'Odporúčame pri vetre nad 80 km/h.',
              () => addChips('Prevedenie', opts.map((o) => ({ t: o[1], s: money.format(BIO.anchors[o[0]]) + ' € / ks' })), ai < 0 ? 0 : ai, 'anch'));
          }

          // sensors
          if (add.sensors) {
            const priced = (BIO.addons && BIO.addons.sensors) || {};
            const list = Object.keys({ wind: 'Snímač vetra', rain: 'Snímač dažďa', temp: 'Snímač teploty', snow: 'Snímač snehu', presence: 'Snímač prítomnosti' })
              .filter((k) => priced[k] != null)
              .map((k) => [k, { wind: 'Snímač vetra', rain: 'Snímač dažďa', temp: 'Snímač teploty', snow: 'Snímač snehu', presence: 'Snímač prítomnosti' }[k]]);
            const anyOn = list.some((s) => state.sensors[s[0]]);
            row('sensors', anyOn, 'Senzory',
              'Automatické zatvorenie podľa počasia.',
              () => `<div class="sp-add__row">` + list.map((s) =>
                `<button type="button" class="sp-chip" data-sp-add-sensor="${s[0]}" aria-pressed="${String(!!state.sensors[s[0]])}"><strong>${s[1]}</strong><span>${money.format(add.sensors[s[0]])} €</span></button>`
              ).join('') + '</div>');
          }

          host.innerHTML = html.join('');
          const boxColorHost = host.querySelector('[data-sp-box-colors]');
          if (boxColorHost) buildColors(boxColorHost, state.boxColor || state.frameColor, 'spBoxColor');
          const badge = q('[data-sp-add-count]');
          if (badge) badge.textContent = count ? `${count} vybraté` : 'žiadne';
        };

        /* Run the roof to a position rather than snapping to it. The travel
           is paced like the real thing - a couple of seconds end to end - and a
           part run takes proportionally less. Only the drawing is refreshed
           each frame; nothing about the price depends on where the blades are. */
        const MOVER = {
          louver: { get: () => state.louverT, set: (v) => { state.louverT = v; } },
          side: {
            get: () => (state.sideOpen[state.activeSide] || 0),
            set: (v) => { state.sideOpen[state.activeSide] = v; }
          },
          /* „Zavrieť všetko" a „Otvoriť všetko" majú byť vidieť. Skok na
             koncovú polohu je z pohľadu zákazníka len iný obrázok — a práve
             to plynulé prebehnutie je na bioklimatickej pergole to, čo
             predáva. Jeden kanál hýbe strechou aj všetkými pohyblivými
             stranami naraz, takže je to jeden pohyb konštrukcie, nie štyri
             skoky za sebou. */
          all: {
            /* Pozor na to, čo tu vracia `get`. Kým to bol priemer strechy a
               bokov, `runMover` z neho vypočítal štart pohybu — a keďže
               `set` priradí rovnakú hodnotu všetkému, strecha v prvom snímku
               skočila na ten priemer a až odtiaľ sa rozbehla. Presne to bol
               ten divný poskok pri „Zavrieť všetko" a dôvod, prečo bol pohyb
               hotový skôr, než ho stihol niekto vidieť.

               Teraz vracia hodnotu strechy, takže trvanie aj štart sedia s
               tým, čo je najviac vidieť, a každá strana si dobehne po svojej
               vlastnej dráhe z miesta, kde práve bola. */
            zaciatky: null,
            zapamataj: () => {
              const z = { strecha: state.louverT, boky: {} };
              Object.keys(state.sides).forEach((k) => {
                if (SIDE_MOVES[state.sides[k]]) z.boky[k] = state.sideOpen[k] || 0;
              });
              MOVER.all.zaciatky = z;
            },
            get: () => state.louverT,
            set: (v) => {
              const z = MOVER.all.zaciatky;
              state.louverT = v;
              if (!z) {
                Object.keys(state.sides).forEach((k) => {
                  if (SIDE_MOVES[state.sides[k]]) state.sideOpen[k] = v;
                });
                return;
              }
              /* Podiel prejdenej dráhy strechy prenesieme na každý bok zvlášť. */
              const rozsah = MOVER.all.ciel - z.strecha;
              const podiel = Math.abs(rozsah) < 1e-4 ? 1 : (v - z.strecha) / rozsah;
              Object.keys(z.boky).forEach((k) => {
                state.sideOpen[k] = z.boky[k] + (MOVER.all.ciel - z.boky[k]) * podiel;
              });
            },
            ciel: 0
          }
        };

        const syncLouverReadout = () => {
          cfgRoot.querySelectorAll('[data-sp-louver]').forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.spLouver) - state.louverT) < 0.02)));
          const r = cfgRoot.querySelector('[data-sp-louver-range]');
          if (r && document.activeElement !== r) r.value = String(Math.round(state.louverT * 100));
          const pct = cfgRoot.querySelector('[data-sp-louver-pct]');
          if (pct) pct.textContent = state.louverT < 0.02 ? 'zatvorené'
            : state.louverT > 0.98 ? 'otvorené' : Math.round(state.louverT * 100) + ' %';
        };
        const syncLouver = () => { syncLouverReadout(); syncSideMove(); };

        /* the same three readouts for whichever side is being worked on */
        const syncSideMove = () => {
          const host = cfgRoot.querySelector('[data-sp-side-move]');
          if (!host) return;
          const v = MOVER.side.get();
          const r = host.querySelector('[data-sp-side-range]');
          if (r && document.activeElement !== r) r.value = String(Math.round(v * 100));
          const pct = host.querySelector('[data-sp-side-pct]');
          if (pct) pct.textContent = v < 0.02 ? 'zatvorené' : v > 0.98 ? 'odsunuté' : Math.round(v * 100) + ' %';
        };

        /* Ťahanie posuvníka volalo `renderAll()`, čo znovu poskladá celý
           bočný panel — dlaždice, farby, doplnky, ceny — a až potom kresbu.
           Pri veľkej pergole to na jeden ťah prstom neprejde v jednom snímku
           a posuvník sekal, alebo sa zdalo, že vôbec nereaguje. Od polohy
           krídel ani lamiel nezávisí žiadna cena, takže počas ťahania stačí
           prekresliť scénu a dopísať percentá. */
        /* Snímok nemusí prísť — v skrytej karte prehliadač rAF nespustí vôbec.
           Bez záložného časovača by posuvník aj beh ticho nič neurobili, presne
           ako to už rieši  o kus vyššie. */
        let stagePending = 0, stageTimer = 0;
        const scheduleStage = () => {
          if (stagePending) return;
          stagePending = 1;
          const run = () => {
            if (!stagePending) return;
            stagePending = 0;
            window.clearTimeout(stageTimer);
            drawStage();
            syncSideMove();
            syncLouverReadout();
          };
          window.requestAnimationFrame(run);
          stageTimer = window.setTimeout(run, 60);
        };

        let louverRun = 0, moverTimer = 0;
        const runMover = (ch, target, immediate) => {
          const M = MOVER[ch];
          const to = Math.max(0, Math.min(1, target));
          if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }
          if (moverTimer) { window.clearTimeout(moverTimer); moverTimer = 0; }
          if (ch === 'all') { MOVER.all.ciel = to; MOVER.all.zapamataj(); }
          const from = M.get();
          if (immediate || reducedMotion || Math.abs(to - from) < 0.005) {
            M.set(to);
            drawStage();
            syncSideMove();
            syncLouverReadout();
            return;
          }
          const ms = 380 + Math.abs(to - from) * 1750;
          const t0 = (window.performance || Date).now();
          const step = (now) => {
            const k = Math.min(1, ((now || (window.performance || Date).now()) - t0) / ms);
            /* quick start and a calm settle, without the mechanical-looking
               midpoint acceleration or bounce */
            const e = 1 - Math.pow(1 - k, 3);
            M.set(from + (to - from) * e);
            drawStage();
            /* Počas behu má posuvník aj percentá bežať s ním, inak to vyzerá,
               že sa ovládanie prebralo až na konci. */
            syncSideMove();
            syncLouverReadout();
            if (k < 1) {
              louverRun = requestAnimationFrame(step);
              window.clearTimeout(moverTimer);
              moverTimer = window.setTimeout(step, 90);
              return;
            }
            louverRun = 0;
            window.clearTimeout(moverTimer);
            moverTimer = 0;
            M.set(to);
            /* Beh končil prestavbou celého panela. Tá prejde aj cez ,
               takže posledný snímok behu a to, čo ostane na obrazovke, nie je tá istá
               geometria — lamely na konci každého zatvorenia poskočili. Od polohy
               lamiel ani krídel nezávisí nič v paneli okrem čísel, ktoré dopíšeme sami. */
            drawStage();
            syncSideMove();
            syncLouverReadout();
          };
          louverRun = requestAnimationFrame(step);
          moverTimer = window.setTimeout(step, 90);
        };

        /* Vonkajšia nadstavba (tlačidlá „Zavrieť všetko" / „Otvoriť všetko")
           nemá na `runMover` dosah, tak si ho vypýta udalosťou. */
        cfgRoot.setAttribute('data-sp-move-hook', '1');
        cfgRoot.addEventListener('sp:move', (e) => {
          const d = e.detail || {};
          if (!MOVER[d.channel]) return;
          runMover(d.channel, Number(d.to));
        });

        /* Holding turns the blades at the pace of the real thing until the
           button comes up or the roof reaches its stop. */
        const TRAVEL_MS = 2100;
        let hold = 0, holdDir = 0, holdLast = 0, holdFrom = 0, holdCh = 'louver';
        const clockNow = () => ((window.performance && window.performance.now) ? window.performance.now() : Date.now());
        const holdStep = (now) => {
          const t = now || clockNow();
          const dt = Math.min(64, t - holdLast);
          holdLast = t;
          const M = MOVER[holdCh];
          const v = Math.max(0, Math.min(1, M.get() + (holdDir * dt) / TRAVEL_MS));
          M.set(v);
          drawStage();
          syncLouver();
          if ((holdDir > 0 && v >= 1) || (holdDir < 0 && v <= 0)) { stopHold(); return; }
          hold = requestAnimationFrame(holdStep);
        };
        const stopHold = () => {
          if (!hold) return;
          cancelAnimationFrame(hold);
          hold = 0;
          if (clockNow() - holdFrom < 200) { runMover(holdCh, MOVER[holdCh].get() + holdDir * 0.14); return; }
          holdDir = 0;
          renderAll();
        };
        const startHold = (dir, ch) => {
          if (hold) return;
          if (louverRun) { cancelAnimationFrame(louverRun); louverRun = 0; }
          holdCh = ch || 'louver';
          holdDir = dir;
          holdFrom = holdLast = clockNow();
          hold = requestAnimationFrame(holdStep);
        };

        const renderAll = () => {
          clampIdx();
          const m = model();
          cfgRoot.querySelectorAll('[data-sp-model]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.spModel === state.model)));
          cfgRoot.querySelectorAll('[data-sp-place]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.spPlace === state.placement)));
          syncLouver();
          q('[data-sp-model-val]').textContent = m.label;
          q('[data-sp-model-note]').textContent = m.louver
            ? `Profil ${m.profile}, lamela ${m.louver}, stĺpy ${m.post}. Najväčší rozmer ${area1.format(m.maxW / 1000)} × ${area1.format(m.maxL / 1000)} m.`
            : `Profil ${m.profile}, stĺpy ${m.post}. Najväčší rozmer ${area1.format(m.maxW / 1000)} × ${area1.format(m.maxL / 1000)} m.`;
          syncSliders();
          const hint = q('[data-sp-posts-hint]');
          const lay = postLayout();
          if (lay.n > 2) {
            hint.hidden = false;
            hint.textContent = `Táto dĺžka potrebuje ${lay.n} stĺpy na každej strane, spolu ${postCount()}. Krajné stoja v rohoch.`;
          } else hint.hidden = true;
          q('[data-sp-frame-val]').textContent = state.frameColor.name;
          const lvEl = q('[data-sp-louver-val]');
          if (lvEl) lvEl.textContent = state.louverColor.name;
          if (!placesBuilt) { buildPlaces(); placesBuilt = true; }
          buildColors(q('[data-sp-frame-colors]'), state.frameColor, 'spFrameColor');
          const louverHost = q('[data-sp-louver-colors]');
          if (louverHost) buildColors(louverHost, state.louverColor, 'spLouverColor');
          buildRoofFinishes();
          buildLoads();
          syncCarPick();
          buildSideOpts();
          buildAddons();
          const areaM2 = (widthMM() / 1000) * (lengthMM() / 1000);
          q('[data-sp-dims]').innerHTML = `<b>${m.label}</b> · ${mm(widthMM())} × ${mm(lengthMM())} · výška ${mm(state.height)} · ${area1.format(areaM2)} m² · ${postCount()} ${postCount() === 1 ? 'stĺp' : postCount() > 1 && postCount() < 5 ? 'stĺpy' : 'stĺpov'}` + (m.lamellas ? ` · ${m.lamellas[state.length]} lamiel` : '');
          const { lines, total, open } = priceLines();
          q('[data-sp-total]').textContent = open ? `od ${money.format(total)} €` : `${money.format(total)} €`;
          const mini = q('[data-sp-mini-total]');
          if (mini) mini.textContent = (open ? 'od ' : '') + money.format(total) + ' €';
          const host = q('[data-sp-lines]');
          host.textContent = '';
          lines.forEach((ln) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${ln.k}</span><b>${ln.v === null ? 'na nacenenie' : money.format(ln.v) + ' €'}</b>`;
            host.appendChild(li);
          });
          if (REF) {
            /* Model-specific shot first where the source confirms the model,
               then the installation photographs for this page. */
            const own = REF[state.model];
            const shots = (own ? [own] : []).concat(REF._shots || [])
              .filter((s, i, all) => s && all.findIndex((o) => o.src === s.src) === i);
            const fig = q('[data-sp-ref]');
            const img = q('[data-sp-ref-img]'), cap = q('[data-sp-ref-cap]'), num = q('[data-sp-ref-count]');
            if (fig && shots.length) {
              if (refIdx >= shots.length) refIdx = 0;
              const shot = shots[refIdx];
              fig.hidden = false;
              if (img.getAttribute('src') !== shot.src) { img.src = shot.src; }
              img.alt = shot.cap;
              // only claim the model where the source folder confirmed it
              cap.textContent = shot.cap;
              if (num) num.textContent = (refIdx + 1) + '/' + shots.length;
              const nav = fig.querySelector('.sp-ref__nav');
              if (nav) nav.hidden = shots.length < 2;
            } else if (fig) fig.hidden = true;
          }
          const chartMarker = root.querySelector('[data-sp-chart-marker]');
          if (chartMarker) {
            const CX0 = 72, CX1 = 830, CY0 = 30, CY1 = 504, CML = 9.6, CMW = 6.6;
            const cx = CX0 + (lengthMM() / 1000 / CML) * (CX1 - CX0);
            const cy = CY1 - (widthMM() / 1000 / CMW) * (CY1 - CY0);
            chartMarker.style.display = '';
            chartMarker.querySelector('[data-sp-mx]').setAttribute('x1', cx);
            chartMarker.querySelector('[data-sp-mx]').setAttribute('x2', cx);
            chartMarker.querySelector('[data-sp-my]').setAttribute('y1', cy);
            chartMarker.querySelector('[data-sp-my]').setAttribute('y2', cy);
            chartMarker.querySelector('[data-sp-mc]').setAttribute('cx', cx);
            chartMarker.querySelector('[data-sp-mc]').setAttribute('cy', cy);
          }
          drawStage();
        };

        /* ---------------------------------------------------------- events */
        const clampToModel = () => {
          const m = model();
          clampIdx();
          if (state.model === '240/60' && widthMM() > 5000 && lengthMM() > m.post4) {
            // Catalogue rule: above 6 m length the 240/60 tops out at 5 m width.
            state.widthValue = 5000;
          }
          if (m.maxArea && m.widths && widthMM() * lengthMM() > m.maxArea * 1000000) {
            const maxWidthByArea = Math.floor((m.maxArea * 1000000) / lengthMM());
            state.widthValue = Math.max(m.widths[0], Math.min(state.widthValue, maxWidthByArea));
          }
          clampIdx();
        };
        cfgRoot.addEventListener('change', (event) => {
          const el = event.target.closest('[data-sp-add-on]');
          if (!el) return;
          const key = el.dataset.spAddOn;
          const on = el.checked;
          if (key === 'box') state.box.on = on;
          else if (key === 'ceiling') state.ceiling = on ? (state.ceiling === 'none' ? (ceilingOptions()[0] || { key: 'alu' }).key : state.ceiling) : 'none';
          else if (key === 'led') state.ledSet.on = on;
          else if (key.indexOf('x-') === 0) {
            if (key === 'x-roof') {
              state.extrasOpen.roof = on;
              if (!on) (BIO.roofOpt || []).forEach((it) => { delete state.extras[it.id]; });
              scheduleRender();
              return;
            }
            const g = (BIO.extras || []).find((x) => 'x-' + x.id === key);
            if (!g) return;
            state.extrasOpen[g.id] = on;
            if (!on) g.items.forEach((it) => { delete state.extras[it.id]; });
          }
          else if (key === 'anchor') state.anchor = on ? (state.anchor === 'none' ? 'galv' : state.anchor) : 'none';
          else if (key === 'sensors') { if (!on) state.sensors = { wind: false, rain: false, temp: false, snow: false, presence: false }; else state.sensors.wind = true; }
          scheduleRender();
        });

        cfgRoot.addEventListener('pointerdown', (event) => {
          const b = event.target.closest('[data-sp-louver-hold]');
          if (!b) return;
          event.preventDefault();
          startHold(Number(b.dataset.spLouverHold), b.dataset.spHoldCh);
        });
        cfgRoot.addEventListener('keydown', (event) => {
          if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return;
          const b = event.target.closest && event.target.closest('[data-sp-louver-hold]');
          if (!b) return;
          event.preventDefault();
          startHold(Number(b.dataset.spLouverHold), b.dataset.spHoldCh);
        });
        cfgRoot.addEventListener('keyup', (event) => {
          if (event.target.closest && event.target.closest('[data-sp-louver-hold]')) stopHold();
        });
        document.addEventListener('visibilitychange', () => { if (document.hidden) stopHold(); });
        window.addEventListener('pointerup', stopHold);
        window.addEventListener('pointercancel', stopHold);
        window.addEventListener('blur', stopHold);

        cfgRoot.addEventListener('click', (event) => {
          const t = event.target.closest('button, [data-sp-side]');
          if (t && t.dataset.spLouverHold) return;   // the hold handled it
          if (!t || !cfgRoot.contains(t)) return;
          if (t.dataset.spModel) {
            state.model = t.dataset.spModel;
            refIdx = 0;
            openingSize();
            clampToModel();
            const allowedBoxFinishes = boxFinishOptions();
            if (!allowedBoxFinishes.some((item) => item.key === state.box.fin)) {
              state.box.fin = (allowedBoxFinishes[0] || { key: 'iso' }).key;
            }
          } else if (t.dataset.spPlace) {
            state.placement = t.dataset.spPlace;
          } else if (t.dataset.spLouver) {
            runMover('louver', Number(t.dataset.spLouver));
            return;
          } else if (t.dataset.spSide) {
            state.activeSide = t.dataset.spSide;
          } else if (t.dataset.spSideOpt) {
            state.sides[state.activeSide] = t.dataset.spSideOpt;
            state.sideOpen[state.activeSide] = 0;
          } else if (t.dataset.spFrameColor) {
            state.frameColor = BIO.colors[Number(t.dataset.spFrameColor)];
          } else if (t.dataset.spRoofFinish) {
            state.roofFinish = Math.max(0, Math.min(ROOF_FINISHES.length - 1, Number(t.dataset.spRoofFinish)));
          } else if (t.dataset.spBoxColor) {
            state.boxColor = BIO.colors[Number(t.dataset.spBoxColor)];
          } else if (t.dataset.spLouverColor) {
            state.louverColor = BIO.colors[Number(t.dataset.spLouverColor)];
          } else if (t.dataset.spRefStep) {
            const shots = ((REF && REF[state.model]) ? 1 : 0) + ((REF && REF._shots) ? REF._shots.length : 0);
            refIdx = (refIdx + Number(t.dataset.spRefStep) + shots) % Math.max(1, shots);
          } else if (t.dataset.spAddOpt) {
            const i = Number(t.dataset.spAddI);
            const opt = t.dataset.spAddOpt;
            if (opt === 'boxw') { const o = boxWidths()[i]; if (!o || !o.ok) return; state.box.w = i; }
            else if (opt === 'boxd') { const o = boxDepths()[i]; if (!o || !o.ok) return; state.box.d = i; }
            else if (opt === 'boxf') state.box.fin = (boxFinishOptions()[i] || boxFinishOptions()[0]).key;
            else if (opt === 'ceil') state.ceiling = (ceilingOptions()[i] || ceilingOptions()[0]).key;
            else if (opt === 'ledt') state.ledSet.type = ['warm', 'neutral', 'rgb'][i];
            else if (opt === 'ledl') state.ledSet.len = i;
            else if (opt === 'anch') state.anchor = ['galv', 'coated', 'inox'][i];
          } else if (t.dataset.spAddSensor) {
            const k = t.dataset.spAddSensor;
            state.sensors[k] = !state.sensors[k];
          } else if (t.dataset.spX) {
            const id = t.dataset.spX;
            let cap = 9;
            (BIO.extras || []).forEach((g) => g.items.forEach((it) => { if (it.id === id) cap = it.max || 9; }));
            (BIO.roofOpt || []).forEach((it) => { if (it.id === id) cap = 40; });
            const q = Math.max(0, Math.min(cap, (state.extras[id] || 0) + Number(t.dataset.spXd)));
            if (q) state.extras[id] = q; else delete state.extras[id];
          } else if (t.dataset.spLed) {
            state.ledSet.qty = Math.max(1, Math.min(12, (state.ledSet.qty || 1) + Number(t.dataset.spLed)));
            state.ledSet.on = true;
          } else if (t.hasAttribute('data-sp-cfg-quote')) {
            const message = root.querySelector('textarea[name="contact[body]"]');
            const { total, open } = priceLines();
            const chosen = ['front', 'rear', 'left', 'right']
              .filter((s) => state.sides[s] !== 'open')
              .map((s) => `${SIDE_LABEL[s]}: ${SIDE_OPTS.find((o) => o.id === state.sides[s]).label}`);
            const product = BIO.page === 'carport' ? 'prístrešok pre auto Soltec'
              : BIO.page === 'canopy' ? 'prístrešok Soltec'
              : 'bioklimatickú pergolu Soltec';
            const picked = [];
            (BIO.extras || []).concat([{ items: BIO.roofOpt || [] }]).forEach((g) => (g.items || []).forEach((it) => {
              const n = state.extras[it.id];
              if (n) picked.push(it.label + (n > 1 ? ` × ${n}` : ''));
            }));
            const sensorLabel = { wind: 'vietor', rain: 'dážď', temp: 'teplota', snow: 'sneh', presence: 'prítomnosť' };
            const sensorsOn = Object.keys(state.sensors).filter((k) => state.sensors[k]);
            const anchorLabel = { galv: 'galvanizované', coated: 'galvanizované + náter', inox: 'nerez' };
            const summary = [
              `Mám záujem o ${product} ${model().label}.`,
              `Rozmer ${mm(widthMM())} × ${mm(lengthMM())}, výška ${mm(state.height)}.`,
              model().roof === 'panel'
                ? `Konštrukcia ${state.frameColor.name} (${state.frameColor.ral}).`
                : `Konštrukcia ${state.frameColor.name} (${state.frameColor.ral}), lamely ${state.louverColor.name} (${state.louverColor.ral}).`,
              model().roof === 'panel' && model().glazed !== true
                ? `Strešný ISO panel: vrch ${ROOF_FINISHES[state.roofFinish].top}, spodná strana ${ROOF_FINISHES[state.roofFinish].bottom}.` : '',
              `Umiestnenie: ${placement().tip == null ? '' : 'TYP ' + placement().tip + ' — '}${placement().label}.`,
              chosen.length ? `Strany — ${chosen.join('; ')}.` : 'Všetky strany otvorené.',
              state.box.on && boxPrice() ? `Zadný box: ${mm(boxPrice().w)} × ${mm(boxPrice().d)}, ${boxFinishLabel()}, ${(state.boxColor || state.frameColor).name} (${(state.boxColor || state.frameColor).ral}).` : '',
              state.ceiling !== 'none' && ceilingOptions().length
                ? `Dekoratívny strop: ${state.ceiling === 'wood' ? 'drevené lamely' : 'ALU lamely'}, ${area1.format(ceilingArea())} m².` : '',
              state.ledSet.on
                ? `LED osvetlenie: ${state.ledSet.qty} ks, ${{ warm: 'teplá biela', neutral: 'neutrálna', rgb: 'RGBW' }[state.ledSet.type]}, ${mm(Number(['500', '1000', '1500'][state.ledSet.len]))}.` : '',
              sensorsOn.length ? `Senzory: ${sensorsOn.map((k) => sensorLabel[k] || k).join(', ')}.` : '',
              state.anchor !== 'none' ? `Vonkajšie kotvenie: ${anchorLabel[state.anchor] || state.anchor}.` : '',
              picked.length ? `Ďalšie doplnky: ${picked.join('; ')}.` : '',
              `Orientačná cena z konfigurátora: ${open ? 'od ' : ''}${money.format(total)} € bez DPH.`
            ].filter(Boolean).join('\n');
            if (message) {
              message.value = message.value.trim() ? `${message.value.trim()}\n\n${summary}` : `${summary}\n\nObec realizácie: `;
              message.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
              const body = `${summary}\n\nMeno:\nTelefón:\nObec realizácie:`;
              const mailto = `mailto:obchod@koverta.sk?subject=${encodeURIComponent(`Konfigurácia Soltec ${model().label}`)}&body=${encodeURIComponent(body)}`;
              cfgRoot.dataset.spQuoteHref = mailto;
              if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(body).catch(() => {});
              window.location.href = mailto;
              return;
            }
            const target = root.querySelector('#sp-dopyt');
            if (target) target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
            return;
          } else if (t.dataset.spLoadIdx) {
            state.load = Number(t.dataset.spLoadIdx);
          } else if (t.dataset.spGoto) {
            showStep(Number(t.dataset.spGoto));
            return;
          } else if (t.hasAttribute('data-sp-back') || t.hasAttribute('data-sp-next')) {
            if (t.hasAttribute('data-sp-next') && t.dataset.spFinal === '1') {
              const q = cfgRoot.querySelector('[data-sp-cfg-quote]');
              if (q) q.click();
              return;
            }
            showStep(step + (t.hasAttribute('data-sp-next') ? 1 : -1));
            return;
          } else if (t.hasAttribute('data-sp-cfg-open') || t.hasAttribute('data-sp-cfg-close')) {
            setFull(t.hasAttribute('data-sp-cfg-open'));
            return;
          } else if (t.dataset.spCfgTab) {
            const wantQuote = t.dataset.spCfgTab === 'quote';
            cfgRoot.querySelectorAll('[data-sp-cfg-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === t)));
            if (wantQuote) {
              // jump straight to the summary step rather than a separate screen
              showStep(STEPS);
            } else {
              showStep(1, true);
            }
            return;
          } else return;
          renderAll();
        });
        cfgRoot.addEventListener('input', (event) => {
          const t = event.target;
          if (t.hasAttribute('data-sp-louver-range')) { MOVER.louver.set(Number(t.value) / 100); scheduleStage(); return; }
          if (t.hasAttribute('data-sp-side-range')) { MOVER.side.set(Number(t.value) / 100); scheduleStage(); return; }
          if (t.hasAttribute('data-sp-w')) state.widthValue = Number(t.value);
          else if (t.hasAttribute('data-sp-l')) state.lengthValue = Number(t.value);
          else if (t.hasAttribute('data-sp-h')) state.height = Number(t.value);
          else if (t.hasAttribute('data-sp-anchor')) state.anchor = t.value;
          else return;
          clampToModel();
          scheduleRender();
        });

        const STEPS = 6;
        let step = 1;
        const STEP_NAMES = ['Riešenie', 'Rozmer', 'Strecha a farby', 'Boky', 'Doplnky', 'Súhrn'];
        const showStep = (n, silent) => {
          step = Math.max(1, Math.min(STEPS, n));
          cfgRoot.querySelectorAll('[data-sp-stepno]').forEach((el) => { el.hidden = Number(el.dataset.spStepno) !== step; });
          cfgRoot.querySelectorAll('[data-sp-goto]').forEach((b) => {
            const i = Number(b.dataset.spGoto);
            b.setAttribute('aria-current', String(i === step));
            b.classList.toggle('is-done', i < step);
          });
          const cap = cfgRoot.querySelector('[data-sp-stepcap]');
          const nm = cfgRoot.querySelector('[data-sp-stepname]');
          if (cap) cap.textContent = 'Krok ' + step + ' zo ' + STEPS;
          if (nm) nm.textContent = STEP_NAMES[step - 1] || '';
          const back = cfgRoot.querySelector('[data-sp-back]');
          const next = cfgRoot.querySelector('[data-sp-next]');
          if (back) back.disabled = step === 1;
          if (next) { next.textContent = step === STEPS ? 'Chcem ponuku' : 'Ďalej'; next.dataset.spFinal = step === STEPS ? '1' : ''; }
          const steps = cfgRoot.querySelector('.sp-steps');
          if (steps) steps.scrollTop = 0;
          // the visitor must see the step change even if the page scrolled away
          // Only correct the scroll position when the workspace is actually out of
          // view. Pulling the page on every step change felt like being grabbed.
          const stacked = window.matchMedia('(max-width: 989px)').matches;
          const target = stacked ? (cfgRoot.querySelector('.sp-panel') || cfgRoot) : cfgRoot;
          const box = target.getBoundingClientRect();
          const fullyHidden = box.bottom <= 0 || box.top >= window.innerHeight;
          if (fullyHidden && !silent) {
            target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: stacked ? 'start' : 'nearest' });
          }
        };

        const cfgSection = cfgRoot.closest('.sp-cfg');
        const spacer = root.querySelector('[data-sp-cfg-spacer]');
        let lastFocus = null;
        const setFull = (on) => {
          if (!cfgSection) return;
          if (on) lastFocus = document.activeElement;
          // hold the page height so leaving full screen does not jump the scroll position
          if (spacer) spacer.style.height = on ? cfgRoot.getBoundingClientRect().height + 'px' : '';
          cfgSection.classList.toggle('is-full', on);
          document.documentElement.style.overflow = on ? 'hidden' : '';
          cfgRoot.setAttribute('role', on ? 'dialog' : 'group');
          if (on) cfgRoot.setAttribute('aria-modal', 'true'); else cfgRoot.removeAttribute('aria-modal');
          drawStage();
          const focusTarget = on ? cfgRoot.querySelector('[data-sp-cfg-close]') : lastFocus;
          if (focusTarget && focusTarget.focus) focusTarget.focus({ preventScroll: true });
        };
        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape' && cfgSection && cfgSection.classList.contains('is-full')) setFull(false);
        });

        // sensible opening configuration: mid width, terrace-sized length
        /* Open on a size someone would actually build. Landing on the smallest
           entry in the price list makes the product look like a bike shelter. */
        const openingSize = () => {
          const m = model();
          if (m.widths) {
            const wanted = m.widths.findIndex((v) => v >= 2500);
            state.width = wanted < 0 ? m.widths.length - 1 : wanted;
            state.widthValue = m.widths[state.width];
          } else {
            state.width = 0;
            state.widthValue = m.width;
          }
          let li = m.lengths.findIndex((l) => l >= 5000);
          if (li < 0) li = Math.round((m.lengths.length - 1) * 0.6);
          state.length = li;
          state.lengthValue = m.lengths[li];
          clampToModel();
        };
        openingSize();
        // drag to orbit; the model can be inspected from above and from below
        let dragging = false, lastX = 0, lastY = 0;
        const stageEl = cfgRoot.querySelector('.sp-stage');
        if (stageEl) {
          /* Turning the model is part of the product, so it cannot be mouse-only.
             Arrow keys orbit, Home returns to the opening view. */
          const hint = document.createElement('p');
          hint.className = 'sp-stage__hint';
          hint.setAttribute('aria-hidden', 'true');
          hint.textContent = 'Ťahaním alebo šípkami otočíte model';
          stageEl.appendChild(hint);
          stageEl.addEventListener('keydown', (e) => {
            const step = e.shiftKey ? 0.28 : 0.11;
            let used = true;
            viewTouched = true;
            if (e.key === 'ArrowLeft') view.az -= step;
            else if (e.key === 'ArrowRight') view.az += step;
            else if (e.key === 'ArrowUp') view.el = Math.min(1.45, view.el + step * 0.7);
            else if (e.key === 'ArrowDown') view.el = Math.max(EL_FLOOR(), view.el - step * 0.7);
            else if (e.key === 'Home') { view.az = VIEWS.front.az; view.el = FRONT_EL(); }
            else used = false;
            if (!used) return;
            e.preventDefault();
            drawStage();
          });
        }
        if (stageEl) {
          stageEl.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button, input, select, textarea, label, [role="group"]')) return;
            dragging = true; lastX = e.clientX; lastY = e.clientY;
            stageEl.setPointerCapture(e.pointerId);
          });
          stageEl.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            // Drag right, model turns right: the point under the cursor has to
            // follow the cursor, and increasing az moves it right on screen.
            viewTouched = true;
            view.az += (e.clientX - lastX) * 0.006;
            view.el = Math.max(EL_FLOOR(), Math.min(1.45, view.el + (e.clientY - lastY) * 0.005));
            lastX = e.clientX; lastY = e.clientY;
            scheduleRender();
          });
          const stop = (e) => { if (!dragging) return; dragging = false; try { stageEl.releasePointerCapture(e.pointerId); } catch (err) {} };
          stageEl.addEventListener('pointerup', stop);
          stageEl.addEventListener('pointercancel', stop);
        }
        cfgRoot.addEventListener('click', (e) => {
          const v = e.target.closest('[data-sp-view]');
          if (!v) return;
          const preset = VIEWS[v.dataset.spView];
          if (!preset) return;
          viewTouched = true;
          view.az = preset.az;
          view.el = Math.max(EL_FLOOR(), v.dataset.spView === 'front' ? FRONT_EL() : preset.el);
          cfgRoot.querySelectorAll('[data-sp-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === v)));
          drawStage();
        });

        /* Which car stands under it. How many is not a choice - it follows the
           width, one to a 2,5 m bay, so a single carport gets one and the
           widest gets three without anyone having to ask for them. */
        const carPick = cfgRoot.querySelector('[data-sp-carpick]');
        const syncCarPick = () => {
          if (!carPick) return;
          carPick.hidden = !anyCarFits();
          if (state.car && !carFits(state.car)) state.car = null;
          carPick.querySelectorAll('[data-sp-car]').forEach((b) => {
            const key = b.dataset.spCar || null;
            b.disabled = Boolean(key) && !carFits(key);
            b.setAttribute('aria-pressed', String(key === state.car));
          });
        };
        if (carPick) carPick.addEventListener('click', (e) => {
          const b = e.target.closest('[data-sp-car]');
          if (!b) return;
          state.car = b.dataset.spCar || null;
          syncCarPick();
          drawStage();
        });

        buildModels();
        renderAll();
        showStep(1, true);
        root.classList.add('sp-cfg-active');
        let resizeTick = false;
        window.addEventListener('resize', () => {
          if (resizeTick) return;
          resizeTick = true;
          requestAnimationFrame(() => { resizeTick = false; drawStage(); });
        }, { passive: true });
      }
      };
      if (cfgRoot) {
        let booted = false;
        const bootOnce = () => {
          if (booted) return;
          booted = true;
          bootConfigurator();
        };
        if ('IntersectionObserver' in window) {
          const cfgObserver = new IntersectionObserver((entries) => {
            if (!entries.some((e) => e.isIntersecting)) return;
            cfgObserver.disconnect();
            bootOnce();
          }, { rootMargin: '600px 0px' });
          cfgObserver.observe(cfgRoot);
        }
        // Fallbacks: the observer is the cheap path, but the configurator must never
        // be left dead if it never fires. Any touch of the block boots it at once,
        // and a scroll check catches the case where it is already on screen.
        ['pointerdown', 'focusin', 'touchstart'].forEach((ev) => {
          cfgRoot.addEventListener(ev, bootOnce, { once: true, passive: true });
        });
        const nearViewport = () => {
          const r = cfgRoot.getBoundingClientRect();
          return r.top < window.innerHeight * 1.5 && r.bottom > -window.innerHeight * 0.5;
        };
        const scrollCheck = () => {
          if (booted) { window.removeEventListener('scroll', scrollCheck); return; }
          if (nearViewport()) { window.removeEventListener('scroll', scrollCheck); bootOnce(); }
        };
        window.addEventListener('scroll', scrollCheck, { passive: true });
        window.setTimeout(scrollCheck, 800);
      }

      let ticking = false;
      const updateScroll = () => {
        ticking = false;
        setStickyTop();
        // Redundant reveal trigger: if IntersectionObserver never delivers, scrolling
        // still brings each block in at the right moment instead of leaving it blank.
        revealItems.forEach((item) => {
          if (item.classList.contains('is-visible')) return;
          if (item.getBoundingClientRect().top < window.innerHeight * .94) item.classList.add('is-visible');
        });
        if (isCarport) updateCarportNav();
        // Segmented progress: each rail item fills across its own width while its
        // section is being read, then hands over to the next one.
        if (navLinks && navLinks.length) {
          const line = (headerHeight || 0) + 90;
          navLinks.forEach((link) => {
            const target = document.getElementById(link.dataset.spNav);
            if (!target) { link.style.setProperty('--sp-seg', '0%'); return; }
            const box = target.getBoundingClientRect();
            const passed = line - box.top;
            const ratio = Math.max(0, Math.min(1, passed / Math.max(1, box.height)));
            link.style.setProperty('--sp-seg', (ratio * 100).toFixed(1) + '%');
          });
        }
        if (!reducedMotion) (parallaxItems || root.querySelectorAll('[data-sp-parallax]')).forEach((item) => {
          const itemRect = item.getBoundingClientRect();
          const centerOffset = (itemRect.top + itemRect.height / 2 - window.innerHeight / 2) / window.innerHeight;
          item.style.setProperty('--sp-parallax', `${Math.max(-16, Math.min(16, centerOffset * -16))}px`);
        });
      };
      const requestUpdate = () => { if (ticking) return; ticking = true; requestAnimationFrame(updateScroll); };
      window.addEventListener('scroll', requestUpdate, { passive: true });
      window.addEventListener('resize', () => { measureHeader(); headerShown = null; requestUpdate(); }, { passive: true });
      updateScroll();
    })();
