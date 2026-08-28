from pathlib import Path


def replace_once_or_done(text: str, old: str, new: str, done_marker: str, label: str) -> str:
    count = text.count(old)
    if count == 1:
        return text.replace(old, new, 1)
    if count == 0 and done_marker in text:
        return text
    raise RuntimeError(f"{label}: expected one old block or an already-patched marker, found {count} old blocks")


# ---------------------------------------------------------------------------
# Standalone page: remove the stale inline runtime. It currently boots first,
# sets data-sp-ready and prevents the maintained external runtime from running.
# ---------------------------------------------------------------------------
index_path = Path("index.html")
html = index_path.read_text(encoding="utf-8")
old_script_tag = '<script charset="utf-8" src="./soltec-premium.js?v=20260828-2"></script>'
new_script_tag = '<script charset="utf-8" src="./soltec-premium.js?v=20260828-3"></script>'
external_pos = html.rfind(old_script_tag)
if external_pos < 0:
    external_pos = html.rfind(new_script_tag)
if external_pos < 0:
    raise RuntimeError("index.html: external Soltec runtime script tag was not found")

runtime_marker = "const root = document.getElementById('SoltecPremium');"
runtime_pos = html.rfind(runtime_marker, 0, external_pos)
if runtime_pos >= 0:
    script_start = html.rfind("<script", 0, runtime_pos)
    script_end = html.find("</script>", runtime_pos)
    if script_start < 0 or script_end < 0:
        raise RuntimeError("index.html: duplicate inline runtime boundaries were not found")
    script_end += len("</script>")
    duplicate = html[script_start:script_end]
    if "root.dataset.spReady" not in duplicate or "updateScroll();" not in duplicate:
        raise RuntimeError("index.html: candidate inline script is not the expected duplicate runtime")
    html = html[:script_start] + "\n<!-- Soltec runtime: single authoritative external build. -->\n" + html[script_end:]

html = html.replace(old_script_tag, new_script_tag)
html = html.replace("./soltec-premium.css?v=20260828-2", "./soltec-premium.css?v=20260828-3")
if runtime_marker in html:
    raise RuntimeError("index.html: stale inline Soltec runtime is still present")
if new_script_tag not in html:
    raise RuntimeError("index.html: updated external Soltec runtime tag is missing")
index_path.write_text(html, encoding="utf-8")


# ---------------------------------------------------------------------------
# Range controls: keep the pointer gesture on the native range input so every
# slider can be dragged with a mouse or pointer instead of only clicked.
# ---------------------------------------------------------------------------
css_path = Path("soltec-premium.css")
css = css_path.read_text(encoding="utf-8")
css_marker = "/* 2026-08-28 continuous draggable range controls */"
if css_marker not in css:
    css += r'''

/* 2026-08-28 continuous draggable range controls */
#SoltecPremium input[type="range"].sp-slider,
#SoltecPremium input[type="range"].sp-louver-range {
  position: relative;
  z-index: 4;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  cursor: ew-resize;
}
#SoltecPremium input[type="range"].sp-slider::-webkit-slider-thumb,
#SoltecPremium input[type="range"].sp-louver-range::-webkit-slider-thumb {
  cursor: grab;
}
#SoltecPremium input[type="range"].sp-slider:active::-webkit-slider-thumb,
#SoltecPremium input[type="range"].sp-louver-range:active::-webkit-slider-thumb {
  cursor: grabbing;
}
#SoltecPremium input[type="range"].sp-slider::-moz-range-thumb,
#SoltecPremium input[type="range"].sp-louver-range::-moz-range-thumb {
  cursor: grab;
}
'''
css_path.write_text(css, encoding="utf-8")


# ---------------------------------------------------------------------------
# JavaScript: separate continuously rendered dimensions from catalog price
# bands. The actual dimension moves by 1 mm; the price changes only when the
# next catalog dimension is reached.
# ---------------------------------------------------------------------------
js_path = Path("soltec-premium.js")
js = js_path.read_text(encoding="utf-8")

js = replace_once_or_done(
    js,
    "        const state = { key: priceData.order[0], w: 0, l: 0, load: 0 };\n\n        const paintTrack = (slider) => {\n          const max = Number(slider.max) || 1;\n          slider.style.setProperty('--sp-fill', `${(Number(slider.value) / max) * 100}%`);\n        };",
    "        const state = { key: priceData.order[0], w: 0, l: 0, load: 0, wValue: null, lValue: null };\n\n        const priceBandIndex = (values, value) => {\n          if (!Array.isArray(values) || !values.length) return 0;\n          const target = Number(value);\n          let index = 0;\n          for (let i = 1; i < values.length; i += 1) {\n            if (target < values[i]) break;\n            index = i;\n          }\n          return index;\n        };\n        const syncPriceBands = (currentModel) => {\n          if (currentModel.type === 'grid') state.w = priceBandIndex(currentModel.widths, state.wValue);\n          state.l = priceBandIndex(currentModel.lengths, state.lValue);\n        };\n\n        const paintTrack = (slider) => {\n          const min = Number(slider.min) || 0;\n          const max = Number(slider.max) || 1;\n          const value = Number(slider.value);\n          slider.style.setProperty('--sp-fill', `${((value - min) / (max - min || 1)) * 100}%`);\n        };",
    "const priceBandIndex = (values, value)",
    "compact calculator state",
)

js = replace_once_or_done(
    js,
    "          const model = priceData.models[state.key];\n          const isGrid = model.type === 'grid';\n          const width = isGrid ? model.widths[state.w] : model.width;\n          const length = model.lengths[state.l];\n          const basePrice = isGrid\n            ? model.prices[state.l][state.w]\n            : model.prices[String(model.loads[state.load])][state.l];",
    "          const model = priceData.models[state.key];\n          const isGrid = model.type === 'grid';\n          syncPriceBands(model);\n          const width = isGrid ? Number(state.wValue) : model.width;\n          const length = Number(state.lValue);\n          const basePrice = isGrid\n            ? model.prices[state.l][state.w]\n            : model.prices[String(model.loads[state.load])][state.l];",
    "syncPriceBands(model);",
    "compact calculator render",
)

js = replace_once_or_done(
    js,
    "          if (isGrid && widthSlider) {\n            state.w = Math.min(model.defW, model.widths.length - 1);\n            widthSlider.max = String(model.widths.length - 1);\n            widthSlider.value = String(state.w);\n            setScale('width', model.widths);\n          } else if (widthFixedVal) {\n            widthFixedVal.textContent = mm(model.width);\n          }\n\n          if (!isGrid) {\n            state.load = model.defLoad || 0;\n            loadButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === state.load)));\n          }\n\n          if (lengthSlider) {\n            state.l = Math.min(model.defL, model.lengths.length - 1);\n            lengthSlider.max = String(model.lengths.length - 1);\n            lengthSlider.value = String(state.l);\n            setScale('length', model.lengths);\n          }",
    "          if (isGrid && widthSlider) {\n            const preferred = Number.isFinite(Number(model.defW)) ? Number(model.defW) : Math.round((model.widths.length - 1) / 2);\n            state.w = Math.max(0, Math.min(preferred, model.widths.length - 1));\n            state.wValue = model.widths[state.w];\n            widthSlider.min = String(model.widths[0]);\n            widthSlider.max = String(model.widths[model.widths.length - 1]);\n            widthSlider.step = '1';\n            widthSlider.value = String(state.wValue);\n            setScale('width', model.widths);\n          } else {\n            state.w = 0;\n            state.wValue = model.width;\n            if (widthFixedVal) widthFixedVal.textContent = mm(model.width);\n          }\n\n          if (!isGrid) {\n            state.load = model.defLoad || 0;\n            loadButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === state.load)));\n          }\n\n          if (lengthSlider) {\n            const preferred = Number.isFinite(Number(model.defL)) ? Number(model.defL) : Math.round((model.lengths.length - 1) / 2);\n            state.l = Math.max(0, Math.min(preferred, model.lengths.length - 1));\n            state.lValue = model.lengths[state.l];\n            lengthSlider.min = String(model.lengths[0]);\n            lengthSlider.max = String(model.lengths[model.lengths.length - 1]);\n            lengthSlider.step = '1';\n            lengthSlider.value = String(state.lValue);\n            setScale('length', model.lengths);\n          }",
    "widthSlider.step = '1';",
    "compact calculator slider setup",
)

js = replace_once_or_done(
    js,
    "        if (widthSlider) widthSlider.addEventListener('input', () => { state.w = Number(widthSlider.value); render(); });\n        if (lengthSlider) lengthSlider.addEventListener('input', () => { state.l = Number(lengthSlider.value); render(); });",
    "        if (widthSlider) widthSlider.addEventListener('input', () => {\n          const model = priceData.models[state.key];\n          state.wValue = Number(widthSlider.value);\n          state.w = priceBandIndex(model.widths, state.wValue);\n          render();\n        });\n        if (lengthSlider) lengthSlider.addEventListener('input', () => {\n          const model = priceData.models[state.key];\n          state.lValue = Number(lengthSlider.value);\n          state.l = priceBandIndex(model.lengths, state.lValue);\n          render();\n        });",
    "state.wValue = Number(widthSlider.value);",
    "compact calculator slider events",
)

# Full 3D configurator.
js = replace_once_or_done(
    js,
    "          width: 0, length: 0, height: 2500,",
    "          width: 0, length: 0, widthValue: null, lengthValue: null, height: 2500,",
    "widthValue: null, lengthValue: null",
    "full configurator state",
)

js = replace_once_or_done(
    js,
    "        const isLoad = () => model().type === 'load';\n        const widthMM = () => (isLoad() ? model().width : model().widths[state.width]);\n        const lengthMM = () => model().lengths[state.length];",
    "        const isLoad = () => model().type === 'load';\n        const dimensionBandIndex = (values, value) => {\n          if (!Array.isArray(values) || !values.length) return 0;\n          const target = Number(value);\n          let index = 0;\n          for (let i = 1; i < values.length; i += 1) {\n            if (target < values[i]) break;\n            index = i;\n          }\n          return index;\n        };\n        const widthMM = () => isLoad()\n          ? model().width\n          : (Number.isFinite(state.widthValue) ? state.widthValue : model().widths[state.width]);\n        const lengthMM = () => Number.isFinite(state.lengthValue)\n          ? state.lengthValue\n          : model().lengths[state.length];",
    "const dimensionBandIndex = (values, value)",
    "full configurator dimensions",
)

js = replace_once_or_done(
    js,
    "        const clampIdx = () => {\n          const m = model();\n          state.width = m.widths ? Math.max(0, Math.min(state.width, m.widths.length - 1)) : 0;\n          state.length = Math.max(0, Math.min(state.length, m.lengths.length - 1));\n          const ll = m.loads || m.gridLoads;\n          state.load = ll ? Math.max(0, Math.min(state.load, ll.length - 1)) : 0;\n        };",
    "        const clampIdx = () => {\n          const m = model();\n          if (m.widths && m.widths.length) {\n            const oldIndex = Math.max(0, Math.min(Number(state.width) || 0, m.widths.length - 1));\n            const rawWidth = Number.isFinite(state.widthValue) ? state.widthValue : m.widths[oldIndex];\n            state.widthValue = Math.round(Math.max(m.widths[0], Math.min(rawWidth, m.widths[m.widths.length - 1])));\n            state.width = dimensionBandIndex(m.widths, state.widthValue);\n          } else {\n            state.width = 0;\n            state.widthValue = m.width;\n          }\n          const oldLengthIndex = Math.max(0, Math.min(Number(state.length) || 0, m.lengths.length - 1));\n          const rawLength = Number.isFinite(state.lengthValue) ? state.lengthValue : m.lengths[oldLengthIndex];\n          state.lengthValue = Math.round(Math.max(m.lengths[0], Math.min(rawLength, m.lengths[m.lengths.length - 1])));\n          state.length = dimensionBandIndex(m.lengths, state.lengthValue);\n          const ll = m.loads || m.gridLoads;\n          state.load = ll ? Math.max(0, Math.min(state.load, ll.length - 1)) : 0;\n        };",
    "const rawWidth = Number.isFinite(state.widthValue)",
    "full configurator catalog band clamp",
)

js = replace_once_or_done(
    js,
    "          if (!isLoad()) { w.max = String(m.widths.length - 1); w.value = String(state.width); }\n          l.max = String(m.lengths.length - 1); l.value = String(state.length);",
    "          if (!isLoad()) {\n            w.min = String(m.widths[0]);\n            w.max = String(m.widths[m.widths.length - 1]);\n            w.step = '1';\n            w.value = String(widthMM());\n          }\n          l.min = String(m.lengths[0]);\n          l.max = String(m.lengths[m.lengths.length - 1]);\n          l.step = '1';\n          l.value = String(lengthMM());",
    "w.value = String(widthMM());",
    "full configurator slider setup",
)

js = replace_once_or_done(
    js,
    "        const clampToModel = () => {\n          const m = model();\n          if (m.widths) state.width = Math.min(state.width, m.widths.length - 1);\n          state.length = Math.min(state.length, m.lengths.length - 1);\n          if (state.model === '240/60' && widthMM() > 5000 && lengthMM() > m.post4) {\n            // catalogue: above 6 m length the 240/60 tops out at 5 m width\n            while (state.width > 0 && widthMM() > 5000) state.width -= 1;\n          }\n        };",
    "        const clampToModel = () => {\n          const m = model();\n          clampIdx();\n          if (state.model === '240/60' && widthMM() > 5000 && lengthMM() > m.post4) {\n            // Catalogue rule: above 6 m length the 240/60 tops out at 5 m width.\n            state.widthValue = 5000;\n          }\n          if (m.maxArea && m.widths && widthMM() * lengthMM() > m.maxArea * 1000000) {\n            const maxWidthByArea = Math.floor((m.maxArea * 1000000) / lengthMM());\n            state.widthValue = Math.max(m.widths[0], Math.min(state.widthValue, maxWidthByArea));\n          }\n          clampIdx();\n        };",
    "const maxWidthByArea = Math.floor",
    "full configurator model constraints",
)

js = replace_once_or_done(
    js,
    "          if (t.hasAttribute('data-sp-w')) state.width = Number(t.value);\n          else if (t.hasAttribute('data-sp-l')) state.length = Number(t.value);",
    "          if (t.hasAttribute('data-sp-w')) state.widthValue = Number(t.value);\n          else if (t.hasAttribute('data-sp-l')) state.lengthValue = Number(t.value);",
    "state.widthValue = Number(t.value);",
    "full configurator slider events",
)

js = replace_once_or_done(
    js,
    "        const openingSize = () => {\n          const m = model();\n          if (m.widths) {\n            const wanted = m.widths.findIndex((v) => v >= 2500);\n            state.width = wanted < 0 ? m.widths.length - 1 : wanted;\n          } else state.width = 0;\n          let li = m.lengths.findIndex((l) => l >= 5000);\n          if (li < 0) li = Math.round((m.lengths.length - 1) * 0.6);\n          state.length = li;\n        };",
    "        const openingSize = () => {\n          const m = model();\n          if (m.widths) {\n            const wanted = m.widths.findIndex((v) => v >= 2500);\n            state.width = wanted < 0 ? m.widths.length - 1 : wanted;\n            state.widthValue = m.widths[state.width];\n          } else {\n            state.width = 0;\n            state.widthValue = m.width;\n          }\n          let li = m.lengths.findIndex((l) => l >= 5000);\n          if (li < 0) li = Math.round((m.lengths.length - 1) * 0.6);\n          state.length = li;\n          state.lengthValue = m.lengths[li];\n          clampToModel();\n        };",
    "state.lengthValue = m.lengths[li];",
    "full configurator opening size",
)

# The model-switch path used to re-clamp catalog indices after openingSize().
# With continuous dimensions openingSize() already sets both values and indices.
js = js.replace(
    "            if (model().widths) state.width = Math.min(state.width, model().widths.length - 1);\n            state.length = Math.min(state.length, model().lengths.length - 1);\n            clampToModel();",
    "            clampToModel();",
    1,
)

# ---------------------------------------------------------------------------
# SVG painter-order hardening. Long polygons sorted only by their centroid can
# cover nearer posts. Weight their farthest depth and remove huge forced side
# layer offsets that overrode real camera depth.
# ---------------------------------------------------------------------------
js = replace_once_or_done(
    js,
    "            const pp = pts.map((v) => cam(v[0], v[1], v[2]));\n            const lit = o.raw ? fill : litFill(fill, o.normal || faceNormal(pts));\n            faces.push({\n              p: pp,",
    "            const pp = pts.map((v) => cam(v[0], v[1], v[2]));\n            const lit = o.raw ? fill : litFill(fill, o.normal || faceNormal(pts));\n            const depths = pp.map((point) => point.d);\n            const depthAvg = depths.reduce((sum, value) => sum + value, 0) / depths.length;\n            const depthFar = Math.min(...depths);\n            faces.push({\n              p: pp,",
    "const depthFar = Math.min(...depths);",
    "renderer depth metrics",
)

js = replace_once_or_done(
    js,
    "              d: pp.reduce((a, v) => a + v.d, 0) / pp.length + (o.bias || 0) + layer",
    "              d: depthAvg * 0.38 + depthFar * 0.62 + (o.bias || 0) + layer",
    "depthAvg * 0.38 + depthFar * 0.62",
    "renderer depth sort",
)

js = replace_once_or_done(
    js,
    "            const wallBase = layer;\n            layer = wallBase + (facing(outward) > 0 ? UNDER_SIDE\n                                : (fromAbove ? -UNDER_SIDE : -ROOF_LAYER - UNDER_SIDE));",
    "            const wallBase = layer;\n            // Keep infills near their physical plane. Giant forced layers made\n            // rear panels punch through nearer posts, or hid whole posts.\n            layer = wallBase + (facing(outward) > 0 ? 1200 : -1200);",
    "facing(outward) > 0 ? 1200 : -1200",
    "side infill painter layer",
)

required_markers = [
    "widthValue: null, lengthValue: null",
    "const dimensionBandIndex = (values, value)",
    "w.step = '1'",
    "l.step = '1'",
    "depthAvg * 0.38 + depthFar * 0.62",
    "facing(outward) > 0 ? 1200 : -1200",
]
for marker in required_markers:
    if marker not in js:
        raise RuntimeError(f"soltec-premium.js: expected marker missing: {marker}")

js_path.write_text(js, encoding="utf-8")
print("Soltec configurator patch applied successfully")
