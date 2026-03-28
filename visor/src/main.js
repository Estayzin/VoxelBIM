import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import * as BUIC from "@thatopen/ui-obc";
import * as THREE from "three";

const _base = window.location.origin;

BUI.Manager.init();

const components = new OBC.Components();
const worlds = components.get(OBC.Worlds);
const world = worlds.create();
world.name = "main";
world.scene = new OBC.SimpleScene(components);
world.scene.setup();
world.scene.three.background = null;

const container = document.getElementById("container");
world.renderer = new OBF.PostproductionRenderer(components, container);
world.camera = new OBC.OrthoPerspectiveCamera(components);
await world.camera.controls.setLookAt(50, 30, 50, 0, 0, 0);
components.init();

// Ajuste de clipping planes para modelos grandes
world.camera.three.near = 0.1;
world.camera.three.far = 100000;
world.camera.three.updateProjectionMatrix();
if (world.camera.threeOrtho) {
  world.camera.threeOrtho.near = 0.1;
  world.camera.threeOrtho.far = 100000;
  world.camera.threeOrtho.updateProjectionMatrix();
}
// Permitir acercarse mucho más
world.camera.controls.minDistance = 0.1;
world.camera.controls.maxDistance = 50000;
world.renderer.postproduction.enabled = true;

const grid = components.get(OBC.Grids).create(world);
grid.config.color.set(0x0a1e2a);
grid.config.primarySize = 1;
grid.config.secondarySize = 10;
grid.config.visible = false;

// Cargar worker: usar URL relativa que funcione en desarrollo y Cloudflare Pages
const getWorkerUrl = () => {
  // En desarrollo local (vite dev)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return '/visor/dist/worker.mjs';
  }
  
  // En Cloudflare Pages: el worker está servido desde la raíz
  // Siempre usar ruta absoluta desde la raíz del dominio
  return '/worker.mjs';
};

const workerUrl = getWorkerUrl();
console.log('[VoxelBIM] Initializing worker from:', workerUrl);

const fragments = components.get(OBC.FragmentsManager);
try {
  fragments.init(workerUrl, { classicWorker: false });
  console.log('[VoxelBIM] Worker initialized successfully');
} catch (e) {
  console.error('[VoxelBIM] Failed to initialize worker:', e);
  // Fallback: intentar con ruta absoluta
  try {
    console.log('[VoxelBIM] Attempting fallback worker URL');
    fragments.init('/worker.mjs', { classicWorker: false });
  } catch (e2) {
    console.error('[VoxelBIM] Fallback also failed:', e2);
    throw new Error('Could not initialize Web Worker. Check that worker.mjs is accessible at: ' + workerUrl);
  }
}

world.camera.controls.addEventListener("update", () => fragments.core.update());
world.onCameraChanged.add((camera) => {
  for (const [, model] of fragments.list) { model.useCamera(camera.three); }
  fragments.core.update(true);
});
fragments.list.onItemSet.add(({ value: model }) => {
  model.useCamera(world.camera.three);
  world.scene.three.add(model.object);
  fragments.core.update(true);
  try {
    const bbox = new THREE.Box3().setFromObject(model.object);
    if (isFinite(bbox.min.y)) grid.three.position.y = bbox.min.y;
  } catch(e) {}
});
fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
  if (!("isLodMaterial" in material && material.isLodMaterial)) {
    material.polygonOffset = true;
    material.polygonOffsetUnits = 1;
    material.polygonOffsetFactor = Math.random();
  }
});

const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup({ autoSetWasm: false, wasm: { path: _base + "/web-ifc/", absolute: true } });

const overlay = document.getElementById("overlay");
const progressWrap = document.getElementById("progressWrap");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const modelInfo = document.getElementById("modelInfo");
const modelName = document.getElementById("modelName");
const modelMeta = document.getElementById("modelMeta");
const tooltip = document.getElementById("tooltip");
const ttClass = document.getElementById("tt-class");
const ttName = document.getElementById("tt-name");
let _tiposCache = null;
let _clsFiltroActiva = null;
let _espActual = 'ARQ';
let _estActual = null;
let _nombreArchivoActual = '';
let _planMode = false;
let _cfgX = 0, _cfgY = 0, _cfgZ = 0;
let _cfgSite = 3, _cfgBuilding = 2, _cfgStorey = 5;

const setProgress = (v) => {
  const pct = Math.round(v * 100);
  progressFill.style.width = pct + "%";
  progressLabel.textContent = `Convirtiendo IFC... ${pct}%`;
  if (pct >= 100) setTimeout(() => progressWrap.classList.remove("show"), 800);
};

const loadIfc = async (file) => {
  overlay.classList.add("hidden");
  progressWrap.classList.add("show");
  modelName.textContent = file.name;
  modelMeta.textContent = `${(file.size/1024/1024).toFixed(1)} MB`;
  modelInfo.classList.add("show");
  const buffer = await file.arrayBuffer();
  const texto = new TextDecoder('utf-8').decode(buffer);
  const est = parsearIFC(texto);
  _tiposCache = null;
  _clsFiltroActiva = null;
  _nombreArchivoActual = file.name;
  _espActual = detectarEspecialidad(file.name);
  _estActual = est;
  try {
    await ifcLoader.load(new Uint8Array(buffer), true, file.name, { processData: { progressCallback: setProgress } });
    setProgress(1);
    await renderNavegador(est);
    if (world.camera.fitToItems) await world.camera.fitToItems();
  } catch(err) {
    console.error('[VoxelBIM] Error cargando IFC:', err);
    progressLabel.textContent = `Error: ${err?.message || err}`;
    progressFill.style.background = '#ff3d57';
  }
};

const dropzone = document.getElementById("dropzoneCentral");
const fileInput = document.getElementById("fileInput");
dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => { if (fileInput.files[0]) loadIfc(fileInput.files[0]); });
dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("over"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("over"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault(); dropzone.classList.remove("over");
  if (e.dataTransfer.files[0]) loadIfc(e.dataTransfer.files[0]);
});

const casters = components.get(OBC.Raycasters);
const caster = casters.get(world);
const ttIcon = document.getElementById("tt-icon");
const ttId   = document.getElementById("tt-id");

container.addEventListener("mousemove", async (e) => {
  const model = fragments.list.values().next().value;
  if (!model) return;
  const result = await caster.castRay();
  if (!result) { tooltip.style.display = "none"; return; }
  try {
    const [data] = await model.getItemsData([result.localId]);
    if (!data) { tooltip.style.display = "none"; return; }
    const cls = data._category?.value ?? "Desconocido";
    const nom = data.Name?.value ?? "";
    ttIcon.textContent  = IFC_ICO[cls] || '▪';
    ttClass.textContent = cls.charAt(0) + cls.slice(1).toLowerCase();
    ttName.textContent  = nom;
    ttId.textContent    = `#${result.localId}`;
    tooltip.style.display = "block";
    tooltip.style.left = (e.clientX + 16) + "px";
    tooltip.style.top  = (e.clientY - 10) + "px";
  } catch { tooltip.style.display = "none"; }
});
container.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });

const highlighter = components.get(OBF.Highlighter);
highlighter.setup({ world });

const propsPanel = document.getElementById("propsPanel");
const propsBody  = document.getElementById("propsBody");
const propsEmpty = document.getElementById("propsEmpty");

function getNivelDeElemento(localId) {
  if (!_estActual) return null;
  const sid = String(localId);
  for (const nivelId in _estActual.elemsPorNivel) {
    const elems = _estActual.elemsPorNivel[nivelId];
    if (elems.includes(sid)) {
      const inst = _estActual.instancias[nivelId];
      if (!inst) continue;
      const attrs = splitAttrs(extraerRaw(_estActual.texto, inst.pos));
      return strVal(attrs[2]) || strVal(attrs[1]) || `#${nivelId}`;
    }
  }
  return null;
}

function renderProps(data, localId, bb = null) {
  if (!data) { propsEmpty.style.display = 'block'; propsBody.style.display = 'none'; return; }
  const cls  = data._category?.value ?? 'Desconocido';
  const ico  = IFC_ICO[cls] || '▪';
  const clsL = cls.charAt(0) + cls.slice(1).toLowerCase();
  const nom  = data.Name?.value ?? '—';
  const tag  = data.Tag?.value ?? '—';
  const nivel = getNivelDeElemento(localId) ?? '—';

  const filas = [
    ['Nombre',    nom],
    ['Tag',       tag],
    ['Clase IFC', clsL],
    ['Nivel',     nivel],
  ].map(([k,v]) => `<div class="props-row">
    <span class="props-key">${k}</span>
    <span class="props-val">${esc(String(v))}</span>
  </div>`).join('');

  // Bounding Box
  const bbHtml = bb ? `
    <div class="props-sec">
      <div class="props-sec-hdr">
        <span class="props-sec-title">Dimensiones (Bounding Box)</span>
      </div>
      <div class="props-sec-body">
        <div class="props-row"><span class="props-key">Largo (X)</span><span class="props-val">${bb.x} m</span></div>
        <div class="props-row"><span class="props-key">Ancho (Z)</span><span class="props-val">${bb.z} m</span></div>
        <div class="props-row"><span class="props-key">Alto (Y)</span><span class="props-val">${bb.y} m</span></div>
      </div>
    </div>` : '';

  propsEmpty.style.display = 'none';
  propsBody.innerHTML = `
    <div class="props-elem-hdr">
      <div class="props-elem-icon">${ico}</div>
      <div class="props-elem-cls">${esc(clsL)}</div>
      <div class="props-elem-name">${esc(nom)}</div>
      <div class="props-elem-id">ID: ${data.expressID ?? '—'}</div>
    </div>
    <div class="props-sec">
      <div class="props-sec-hdr">
        <span class="props-sec-title">Información del elemento</span>
      </div>
      <div class="props-sec-body">${filas}</div>
    </div>
    ${bbHtml}`;
  propsBody.style.display = 'block';
}

highlighter.events.select.onHighlight.add(async (modelIdMap) => {
  try {
    // Contar total de elementos seleccionados
    let total = 0;
    for (const ids of Object.values(modelIdMap)) total += ids.size;

    if (total === 1) {
      // Un solo elemento → mostrar sus propiedades
      const [modelId, ids] = Object.entries(modelIdMap)[0];
      const model = fragments.list.get(modelId);
      if (!model) return;
      const localId = [...ids][0];
      const [data] = await model.getItemsData([localId]);
      // Calcular bbox del elemento seleccionado usando getMergedBox
      let bb = null;
      try {
        const itemsBox = await model.getMergedBox([localId]);
        if (itemsBox && !itemsBox.isEmpty() && isFinite(itemsBox.min.x)) {
          const s = new THREE.Vector3();
          itemsBox.getSize(s);
          bb = { x: s.x.toFixed(2), y: s.y.toFixed(2), z: s.z.toFixed(2) };
        }
      } catch(e) {}
      renderProps(data, localId, bb);
    } else {
      // Múltiples elementos → recoger valores y mostrar <Múltiples> si difieren
      const vals = { nom: new Set(), tag: new Set(), cls: new Set(), nivel: new Set() };
      for (const [modelId, ids] of Object.entries(modelIdMap)) {
        const model = fragments.list.get(modelId);
        if (!model) continue;
        for (const localId of ids) {
          try {
            const [data] = await model.getItemsData([localId]);
            vals.nom.add(data?.Name?.value ?? '—');
            vals.tag.add(data?.Tag?.value ?? '—');
            vals.cls.add(data?._category?.value ?? 'Desconocido');
            vals.nivel.add(getNivelDeElemento(localId) ?? '—');
          } catch {}
        }
      }
      const r = (set) => set.size === 1 ? [...set][0] : '<Múltiples>';
      const cls = r(vals.cls);
      const ico = vals.cls.size === 1 ? (IFC_ICO[cls] || '▪') : '📦';
      const clsL = vals.cls.size === 1 ? cls.charAt(0) + cls.slice(1).toLowerCase() : cls;
      renderPropsMulti(total, r(vals.nom), r(vals.tag), clsL, r(vals.nivel), ico);
    }
  } catch { renderProps(null); }
});
function renderPropsMulti(total, nom, tag, cls, nivel, ico) {
  const filas = [
    ['Nombre',    nom],
    ['Tag',       tag],
    ['Clase IFC', cls],
    ['Nivel',     nivel],
  ].map(([k,v]) => {
    const esMultiple = v === '<Múltiples>';
    return `<div class="props-row">
      <span class="props-key">${k}</span>
      <span class="props-val" style="${esMultiple ? 'color:var(--muted);font-style:italic' : ''}">${esc(v)}</span>
    </div>`;
  }).join('');

  propsEmpty.style.display = 'none';
  propsBody.innerHTML = `
    <div class="props-elem-hdr">
      <div class="props-elem-icon">${ico}</div>
      <div class="props-elem-cls">Selección múltiple</div>
      <div class="props-elem-name">${total} elementos seleccionados</div>
    </div>
    <div class="props-sec">
      <div class="props-sec-hdr">
        <span class="props-sec-title">Información del elemento</span>
      </div>
      <div class="props-sec-body">${filas}</div>
    </div>`;
  propsBody.style.display = 'block';
}

highlighter.events.select.onClear.add(() => renderProps(null, null));

// ══ OCULTAR ELEMENTO SELECCIONADO ══
// Mantiene un registro de los elementos ocultos manualmente
const hiddenElements = new Map(); // modelId → Set<localId>

async function ocultarSeleccion() {
  const selection = highlighter.selection['select'];
  if (!selection || Object.keys(selection).length === 0) return;
  for (const [modelId, ids] of Object.entries(selection)) {
    if (!ids || ids.size === 0) continue;
    if (!hiddenElements.has(modelId)) hiddenElements.set(modelId, new Set());
    for (const id of ids) hiddenElements.get(modelId).add(id);
    await hider.set(false, { [modelId]: new Set(ids) });
  }
  try { await highlighter.clear('select'); } catch(e) {}
  renderProps(null, null);
}

// ── Menú contextual con botón derecho ──
const ctxMenu = document.createElement('div');
ctxMenu.id = 'ctxMenu';
ctxMenu.style.cssText = `
  display:none; position:fixed; z-index:99999;
  background:var(--navy); border:1px solid var(--border);
  border-radius:6px; padding:4px 0; min-width:170px;
  box-shadow:0 4px 20px rgba(0,0,0,.4);
`;
ctxMenu.innerHTML = `
  <div id="ctxHide" style="padding:8px 14px;cursor:pointer;font:600 10px var(--mono);color:var(--text);
    text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;gap:8px;transition:background .12s;">
    <span>🙈</span> Ocultar elemento
    <span style="margin-left:auto;font:400 9px var(--mono);color:var(--muted);">Space</span>
  </div>
  <div style="height:1px;background:var(--border);margin:2px 0;"></div>
  <div id="ctxShowAll" style="padding:8px 14px;cursor:pointer;font:600 10px var(--mono);color:var(--muted);
    text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;gap:8px;transition:background .12s;">
    <span>👁️</span> Mostrar todo
  </div>
`;
document.body.appendChild(ctxMenu);

ctxMenu.querySelectorAll('div[id]').forEach(item => {
  item.addEventListener('mouseenter', () => item.style.background = 'rgba(0,212,255,.08)');
  item.addEventListener('mouseleave', () => item.style.background = '');
});

document.getElementById('ctxHide').addEventListener('click', async () => {
  ctxMenu.style.display = 'none';
  await ocultarSeleccion();
});

document.getElementById('ctxShowAll').addEventListener('click', async () => {
  ctxMenu.style.display = 'none';
  hiddenElements.clear();
  await hider.set(true);
  isolatedCategories.clear();
  _clsFiltroActiva = null;
  document.querySelectorAll('.ent-row.ent-active').forEach(r => r.classList.remove('ent-active'));
  document.querySelectorAll('.tipo-row.tipo-active').forEach(r => { r.classList.remove('tipo-active'); r._tipoActivo = false; });
  actualizarSec5(null);
});

// Mostrar menú en clic derecho sobre el visor (solo si hay selección activa)
container.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const selection = highlighter.selection['select'];
  const hasSelection = selection && Object.values(selection).some(ids => ids?.size > 0);
  if (!hasSelection) return;
  ctxMenu.style.left = e.clientX + 'px';
  ctxMenu.style.top  = e.clientY + 'px';
  ctxMenu.style.display = 'block';
});

// Cerrar menú al hacer clic en cualquier otro lugar
document.addEventListener('click', () => { ctxMenu.style.display = 'none'; });

// Barra espaciadora — toggle ocultar/desocultar selección, o desocultar todo si no hay selección
document.addEventListener('keydown', async (e) => {
  if (e.code === 'Space' || e.key === ' ') {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    const selection = highlighter.selection['select'];
    const hasSelection = selection && Object.values(selection).some(ids => ids?.size > 0);
    if (hasSelection) {
      // Verificar si alguno de los elementos seleccionados está oculto
      let algunoOculto = false;
      for (const [modelId, ids] of Object.entries(selection)) {
        const ocultosPorModelo = hiddenElements.get(modelId);
        if (ocultosPorModelo) {
          for (const id of ids) {
            if (ocultosPorModelo.has(id)) { algunoOculto = true; break; }
          }
        }
        if (algunoOculto) break;
      }
      if (algunoOculto) {
        // Hay elementos ocultos en la selección → desocultar solo esos
        for (const [modelId, ids] of Object.entries(selection)) {
          const ocultosPorModelo = hiddenElements.get(modelId);
          if (!ocultosPorModelo) continue;
          const aDesocultar = {};
          const idsADesocultar = new Set();
          for (const id of ids) {
            if (ocultosPorModelo.has(id)) { ocultosPorModelo.delete(id); idsADesocultar.add(id); }
          }
          if (ocultosPorModelo.size === 0) hiddenElements.delete(modelId);
          if (idsADesocultar.size > 0) await hider.set(true, { [modelId]: idsADesocultar });
        }
      } else {
        // Todos visibles → ocultar la selección
        await ocultarSeleccion();
      }
    } else if (hiddenElements.size > 0) {
      // Sin selección pero hay ocultos → desocultar todos
      hiddenElements.clear();
      await hider.set(true);
    }
  }
});

const hider = components.get(OBC.Hider);
const isolatedCategories = new Set();

document.getElementById("btnFit").addEventListener("click", () => world.camera.fitToItems());
document.getElementById("btn3D").addEventListener("click", () => {
  world.camera.set("Orbit");
  world.camera.projection.set("Perspective");
  _planMode = false;
  const btnPlan = document.getElementById("btnPlan");
  btnPlan.classList.remove("active");
  btnPlan.querySelector(".hb-icon").textContent = "📐";
  document.getElementById("btn3D").classList.add("active");
  setTimeout(() => document.getElementById("btn3D").classList.remove("active"), 300);
});
document.getElementById("btnFitSb")?.addEventListener("click", () => world.camera.fitToItems());
document.getElementById("btnOrbitSb")?.addEventListener("click", () => { world.camera.set("Orbit"); world.camera.projection.set("Perspective"); _planMode = false; document.getElementById("btnPlan").classList.remove("active"); });
document.getElementById("btnPlanSb")?.addEventListener("click", () => { world.camera.set("Plan"); world.camera.projection.set("Orthographic"); _planMode = true; document.getElementById("btnPlan").classList.add("active"); });

// Zoom Selección — fit solo a los elementos seleccionados
document.getElementById("btnFitSel").addEventListener("click", async () => {
  const selection = highlighter.selection['select'];
  if (selection && Object.keys(selection).length > 0) {
    await world.camera.fitToItems(selection);
  } else {
    await world.camera.fitToItems();
  }
});

// Vista en planta — toggle entre Planta (ortogonal top) y 3D (perspectiva)
document.getElementById("btnPlan").addEventListener("click", async () => {
  _planMode = !_planMode;
  const btn = document.getElementById("btnPlan");
  if (_planMode) {
    world.camera.set("Plan");
    world.camera.projection.set("Orthographic");
    await world.camera.controls.setLookAt(0, 200, 0, 0, 0, 0, true);
    if (world.camera.fitToItems) await world.camera.fitToItems();
    btn.classList.add("active");
    btn.querySelector(".hb-icon").textContent = "🔲";
  } else {
    world.camera.set("Orbit");
    world.camera.projection.set("Perspective");
    await world.camera.controls.setLookAt(50, 30, 50, 0, 0, 0, true);
    btn.classList.remove("active");
    btn.querySelector(".hb-icon").textContent = "📐";
  }
});
document.getElementById("btnProps").addEventListener("click", () => {
  const visible = document.getElementById("rightPanels").style.display !== 'none';
  document.getElementById("rightPanels").style.display = visible ? 'none' : '';
  document.getElementById("btnProps").classList.toggle("active", !visible);
});
document.getElementById("propsClose").addEventListener("click", () => {
  propsPanel.classList.remove("show");
  document.getElementById("btnProps").classList.remove("active");
});
document.getElementById("btnClip").addEventListener("click", () => {});

// ══ HERRAMIENTA DE MEDICIÓN (implementación propia) ══
// Usa el vertexPicker de la librería para snap, pero captura puntos y dibuja líneas manualmente.

const measurer = components.get(OBF.LengthMeasurement);
measurer.world = world;
measurer.enabled = false;
measurer.snapDistance = 0.4;
measurer.pickerSize = 14;

let _measureMode    = false;
let _measuringActive = false;   // esperando el 2° punto
let _pt1            = null;     // THREE.Vector3 del 1er punto
let _previewLine    = null;     // línea de preview mientras se elige el 2° punto
let _hoveredMeasure = null;     // {group, data} de la medición bajo el cursor

// Almacén propio de mediciones: [{pt1, pt2, group (THREE.Group)}]
const _measures = [];

// ── Tooltip de snap ──
const snapTooltip = document.createElement('div');
snapTooltip.id = 'snapTooltip';
snapTooltip.style.cssText = `
  display:none; position:fixed; pointer-events:none; z-index:99998;
  background:var(--navy); border:1px solid var(--border); border-radius:4px;
  padding:4px 10px; font:600 9px var(--mono); color:var(--text);
  text-transform:uppercase; letter-spacing:.1em; white-space:nowrap;
  box-shadow:0 2px 10px rgba(0,0,0,.4);
`;
document.body.appendChild(snapTooltip);

const SNAP_LABELS = {
  vertex: { text: '⬡ Vértice', color: '#00d4ff' },
  edge:   { text: '— Arista',  color: '#69db7c'  },
  face:   { text: '▣ Cara',    color: '#ffd43b'  },
};

// ── Menú contextual de medición ──
const measureCtxMenu = document.createElement('div');
measureCtxMenu.id = 'measureCtxMenu';
measureCtxMenu.style.cssText = `
  display:none; position:fixed; z-index:99999;
  background:var(--navy); border:1px solid var(--border);
  border-radius:6px; padding:4px 0; min-width:190px;
  box-shadow:0 4px 20px rgba(0,0,0,.4);
`;
measureCtxMenu.innerHTML = `
  <div id="mctxCancel" style="padding:8px 14px;cursor:pointer;font:600 10px var(--mono);color:var(--muted);
    text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;gap:8px;">
    <span>✕</span> Cancelar medición
  </div>
  <div style="height:1px;background:var(--border);margin:2px 0;"></div>
  <div id="mctxDelete" style="padding:8px 14px;cursor:pointer;font:600 10px var(--mono);color:var(--text);
    text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;gap:8px;">
    <span>🗑</span> Eliminar seleccionada
    <span style="margin-left:auto;font:400 9px var(--mono);color:var(--muted);">Del</span>
  </div>
  <div id="mctxDeleteAll" style="padding:8px 14px;cursor:pointer;font:600 10px var(--mono);color:var(--muted);
    text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;gap:8px;">
    <span>🗑</span> Eliminar todas
  </div>
`;
document.body.appendChild(measureCtxMenu);

measureCtxMenu.querySelectorAll('div[id]').forEach(item => {
  item.addEventListener('mouseenter', () => item.style.background = 'rgba(0,212,255,.08)');
  item.addEventListener('mouseleave', () => item.style.background = '');
});

function closeMeasureCtx() { measureCtxMenu.style.display = 'none'; }
document.addEventListener('click', (e) => { if (!measureCtxMenu.contains(e.target)) closeMeasureCtx(); });

document.getElementById('mctxCancel').addEventListener('click', () => {
  closeMeasureCtx(); cancelarMedicionActual();
});
document.getElementById('mctxDelete').addEventListener('click', () => {
  closeMeasureCtx(); eliminarMedicionSeleccionada();
});
document.getElementById('mctxDeleteAll').addEventListener('click', () => {
  closeMeasureCtx(); eliminarTodasMediciones();
});

// ── Helpers de geometría ──
function crearLineaMaterial(color = 0x00d4ff, opacity = 1) {
  return new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false });
}

function crearLineaThree(p1, p2, color = 0x00d4ff, opacity = 1) {
  const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
  return new THREE.Line(geo, crearLineaMaterial(color, opacity));
}

function crearEsfera(pos, color = 0x00d4ff, r = 0.05) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(r, 8, 8),
    new THREE.MeshBasicMaterial({ color, depthTest: false })
  );
  mesh.position.copy(pos);
  return mesh;
}

// ── Dibujar medición completa ──
function dibujarMedicion(pt1, pt2) {
  const group = new THREE.Group();
  group.renderOrder = 999;

  // Línea principal
  group.add(crearLineaThree(pt1, pt2, 0x00d4ff));

  // Líneas de proyección X Y Z (punteadas via segmentos cortos)
  const mid = new THREE.Vector3().addVectors(pt1, pt2).multiplyScalar(0.5);
  const px = new THREE.Vector3(pt2.x, pt1.y, pt1.z);
  const pz = new THREE.Vector3(pt2.x, pt1.y, pt2.z);

  group.add(crearLineaThree(pt1, px,  0xff6b6b, 0.6));  // Δ X  rojo
  group.add(crearLineaThree(px,  pz,  0x74c0fc, 0.6));  // Δ Z  azul
  group.add(crearLineaThree(pz,  pt2, 0x69db7c, 0.6));  // Δ Y  verde

  // Esferas en extremos
  group.add(crearEsfera(pt1, 0xffffff, 0.04));
  group.add(crearEsfera(pt2, 0xffffff, 0.04));

  world.scene.three.add(group);

  const dx = Math.abs(pt2.x - pt1.x);
  const dy = Math.abs(pt2.y - pt1.y);
  const dz = Math.abs(pt2.z - pt1.z);
  const total = Math.sqrt(dx*dx + dy*dy + dz*dz);

  const data = { pt1: pt1.clone(), pt2: pt2.clone(), dx, dy, dz, total };
  _measures.push({ group, data });
  actualizarMeasurePanel(data);
  return { group, data };
}

function cancelarMedicionActual() {
  if (_previewLine) { world.scene.three.remove(_previewLine); _previewLine.geometry.dispose(); _previewLine = null; }
  _pt1 = null;
  _measuringActive = false;
}

function eliminarMedicionSeleccionada() {
  const target = _hoveredMeasure ?? _measures.at(-1);
  if (!target) return;
  world.scene.three.remove(target.group);
  const idx = _measures.indexOf(target);
  if (idx !== -1) _measures.splice(idx, 1);
  if (target === _hoveredMeasure) _hoveredMeasure = null;
  if (_measures.length > 0) actualizarMeasurePanel(_measures.at(-1).data);
  else measurePanel.style.display = 'none';
}

function eliminarTodasMediciones() {
  cancelarMedicionActual();
  _measures.forEach(m => world.scene.three.remove(m.group));
  _measures.length = 0;
  _hoveredMeasure = null;
  measurePanel.style.display = 'none';
}

// ── Activar / desactivar ──
function activarMedicion() {
  _measureMode = true;
  measurer.enabled = true;   // activa el snap visual del cursor
  highlighter.enabled = false;
  _measuringActive = false;
  _pt1 = null;
  const btn = document.getElementById("btnMeasure");
  btn.classList.add("active");
  btn.querySelector(".hb-icon").textContent = "✂";
  container.addEventListener("click",       onMeasureClick);
  container.addEventListener("dblclick",    onMeasureDblClick);
  container.addEventListener("contextmenu", onMeasureCtxClick);
  container.addEventListener("pointermove", onMeasurePointerMove);
  if (_measures.length > 0) actualizarMeasurePanel(_measures.at(-1).data);
}

function desactivarMedicion() {
  cancelarMedicionActual();
  _measureMode = false;
  measurer.enabled = false;
  highlighter.enabled = true;
  const btn = document.getElementById("btnMeasure");
  btn.classList.remove("active");
  btn.querySelector(".hb-icon").textContent = "📏";
  container.removeEventListener("click",       onMeasureClick);
  container.removeEventListener("dblclick",    onMeasureDblClick);
  container.removeEventListener("contextmenu", onMeasureCtxClick);
  container.removeEventListener("pointermove", onMeasurePointerMove);
  snapTooltip.style.display = 'none';
  measurePanel.style.display = 'none';
  closeMeasureCtx();
}

document.getElementById("btnMeasure").addEventListener("click", () => {
  if (_measureMode) desactivarMedicion(); else activarMedicion();
});

// ── Captura de puntos ──
async function getSnapPoint() {
  // Usa el vertexPicker interno de la librería para obtener el punto snapeado
  try {
    const vp = measurer._vertexPicker ?? measurer.__vertexPicker;
    if (vp) {
      const res = await vp.get({ snappingClasses: measurer.snappings });
      if (res?.point) return res.point.clone();
    }
  } catch(e) {}
  // Fallback: raycaster directo
  const hit = await caster.castRay();
  return hit ? hit.point.clone() : null;
}

async function onMeasureClick(e) {
  if (!_measureMode || e.button !== 0) return;
  if (e.shiftKey) { eliminarTodasMediciones(); return; }

  const pt = await getSnapPoint();
  if (!pt) return;

  if (!_measuringActive) {
    // Primer punto
    _pt1 = pt;
    _measuringActive = true;
    // Crear línea de preview
    _previewLine = crearLineaThree(_pt1, _pt1.clone(), 0xffffff, 0.5);
    world.scene.three.add(_previewLine);
  } else {
    // Segundo punto → completar medición
    cancelarMedicionActual();   // quita preview
    dibujarMedicion(_pt1, pt);
  }
}

function onMeasureDblClick(e) {
  if (!_measureMode) return;
  cancelarMedicionActual();
}

function onMeasureCtxClick(e) {
  if (!_measureMode) return;
  e.preventDefault(); e.stopPropagation();
  const hasLines = _measures.length > 0;
  document.getElementById('mctxDelete').style.opacity    = hasLines ? '1' : '0.4';
  document.getElementById('mctxDelete').style.pointerEvents = hasLines ? '' : 'none';
  document.getElementById('mctxDeleteAll').style.opacity = hasLines ? '1' : '0.4';
  document.getElementById('mctxDeleteAll').style.pointerEvents = hasLines ? '' : 'none';
  document.getElementById('mctxCancel').style.opacity    = _measuringActive ? '1' : '0.4';
  document.getElementById('mctxCancel').style.pointerEvents = _measuringActive ? '' : 'none';
  measureCtxMenu.style.left = e.clientX + 'px';
  measureCtxMenu.style.top  = e.clientY + 'px';
  measureCtxMenu.style.display = 'block';
}

async function onMeasurePointerMove(e) {
  // Actualizar línea de preview
  if (_measuringActive && _pt1 && _previewLine) {
    const pt = await getSnapPoint();
    if (pt) {
      const pos = _previewLine.geometry.attributes.position;
      pos.setXYZ(1, pt.x, pt.y, pt.z);
      pos.needsUpdate = true;
    }
  }

  // Tooltip de snap
  try {
    const result = await caster.castRay();
    if (result?.face) {
      const pos = result.object?.geometry?.attributes?.position?.array;
      const mw  = result.object?.matrixWorld;
      let snapType = 'face';
      if (pos && mw) {
        const { a, b, c } = result.face;
        const verts = [a, b, c].map(i => new THREE.Vector3(pos[i*3], pos[i*3+1], pos[i*3+2]).applyMatrix4(mw));
        const minVertDist = Math.min(...verts.map(v => v.distanceTo(result.point)));
        if (minVertDist < measurer.snapDistance) {
          snapType = 'vertex';
        } else {
          const edges = [[verts[0],verts[1]],[verts[1],verts[2]],[verts[2],verts[0]]];
          const minEdgeDist = Math.min(...edges.map(([a,b]) => {
            const ab = new THREE.Vector3().subVectors(b, a);
            const t  = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(result.point, a).dot(ab) / ab.lengthSq()));
            return result.point.distanceTo(new THREE.Vector3().copy(a).addScaledVector(ab, t));
          }));
          if (minEdgeDist < measurer.snapDistance * 1.5) snapType = 'edge';
        }
      }
      const lbl = SNAP_LABELS[snapType];
      snapTooltip.textContent   = lbl.text;
      snapTooltip.style.color   = lbl.color;
      snapTooltip.style.borderColor = lbl.color + '55';
      snapTooltip.style.left    = (e.clientX + 20) + 'px';
      snapTooltip.style.top     = (e.clientY - 30) + 'px';
      snapTooltip.style.display = 'block';
    } else {
      snapTooltip.style.display = 'none';
    }
  } catch(err) { snapTooltip.style.display = 'none'; }

  // Hover sobre mediciones existentes
  _hoveredMeasure = null;
  for (const m of _measures) {
    const objs = [];
    m.group.traverse(o => { if (o.isMesh) objs.push(o); });
  }
  // Detección simplificada: comparar distancia del cursor a cada línea en espacio pantalla
  const rect = container.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width)  *  2 - 1,
    ((e.clientY - rect.top)  / rect.height) * -2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(mouse, world.camera.three);
  ray.params.Line = { threshold: 0.15 };

  let closest = null, closestDist = Infinity;
  for (const m of _measures) {
    const lines = [];
    m.group.traverse(o => { if (o.isLine) lines.push(o); });
    const hits = ray.intersectObjects(lines, false);
    if (hits.length > 0 && hits[0].distance < closestDist) {
      closestDist = hits[0].distance;
      closest = m;
    }
  }

  // Resetear highlight anterior
  _measures.forEach(m => {
    m.group.traverse(o => {
      if (o.isLine && o.material) o.material.color.set(
        o === m.group.children[0] ? 0x00d4ff :
        o === m.group.children[1] ? 0xff6b6b :
        o === m.group.children[2] ? 0x74c0fc : 0x69db7c
      );
    });
  });

  if (closest) {
    _hoveredMeasure = closest;
    closest.group.traverse(o => { if (o.isLine && o.material) o.material.color.set(0xffffff); });
    actualizarMeasurePanel(closest.data);
  }
}
// ══ PANEL DE DESGLOSE X/Y/Z DE MEDICIONES ══
const measurePanel = document.createElement('div');
measurePanel.id = 'measurePanel';
measurePanel.style.cssText = `
  display:none; position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
  z-index:9998; background:var(--navy); border:1px solid var(--accent);
  border-radius:8px; padding:10px 14px; min-width:320px;
  box-shadow:0 4px 24px rgba(0,212,255,.2); font-family:'JetBrains Mono',monospace;
  pointer-events:none;
`;
measurePanel.innerHTML = `
  <div style="font:700 8px var(--mono);color:var(--accent);text-transform:uppercase;letter-spacing:.18em;margin-bottom:8px;">📏 Desglose de medición</div>
  <div style="display:flex;gap:10px;align-items:flex-end;">
    <div style="flex:1;text-align:center;">
      <div style="font:400 8px var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-bottom:3px;">Δ X</div>
      <div id="mpX" style="font:700 14px var(--mono);color:#ff6b6b;">—</div>
    </div>
    <div style="flex:1;text-align:center;">
      <div style="font:400 8px var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-bottom:3px;">Δ Y</div>
      <div id="mpY" style="font:700 14px var(--mono);color:#69db7c;">—</div>
    </div>
    <div style="flex:1;text-align:center;">
      <div style="font:400 8px var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-bottom:3px;">Δ Z</div>
      <div id="mpZ" style="font:700 14px var(--mono);color:#74c0fc;">—</div>
    </div>
    <div style="width:1px;height:36px;background:var(--border);flex-shrink:0;"></div>
    <div style="flex:1.2;text-align:center;">
      <div style="font:400 8px var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin-bottom:3px;">Total</div>
      <div id="mpTotal" style="font:700 16px var(--mono);color:var(--accent);">—</div>
    </div>
  </div>
`;
document.body.appendChild(measurePanel);

function actualizarMeasurePanel(data) {
  if (!data) return;
  const fmt = (v) => v.toFixed(3) + ' m';
  document.getElementById('mpX').textContent     = fmt(data.dx);
  document.getElementById('mpY').textContent     = fmt(data.dy);
  document.getElementById('mpZ').textContent     = fmt(data.dz);
  document.getElementById('mpTotal').textContent = fmt(data.total);
  measurePanel.style.display = 'block';
}

// Escape / Delete en modo medir
document.addEventListener("keydown", (e) => {
  if (!_measureMode) return;
  if (e.key === "Escape") {
    if (_measuringActive) cancelarMedicionActual();
    else desactivarMedicion();
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (_measuringActive) { cancelarMedicionActual(); return; }
    eliminarMedicionSeleccionada();
  }
});


document.getElementById("btnLightMode").addEventListener("click", () => {
  lightMode = !lightMode;
  document.body.classList.toggle("light-mode", lightMode);
  document.getElementById("btnLightMode").classList.toggle("active", lightMode);
  document.getElementById("btnLightMode").querySelector(".hb-icon").textContent = lightMode ? "🌕" : "🌓";
  world.scene.three.background = lightMode ? new THREE.Color(0xc8d8e8) : null;
  grid.config.color.set(lightMode ? 0x8aaabb : 0x0a1e2a);
});

let gridVisible = false;
document.getElementById("btnToggleGrid").addEventListener("click", () => {
  gridVisible = !gridVisible;
  grid.config.visible = gridVisible;
  document.getElementById("btnToggleGrid").classList.toggle("active", gridVisible);
  document.getElementById("btnToggleGrid").querySelector(".hb-icon").textContent = gridVisible ? "⊞" : "⊟";
});

document.getElementById("btnResetVis").addEventListener("click", async () => {
  await hider.set(true);
  isolatedCategories.clear();
  _clsFiltroActiva = null;
  document.querySelectorAll('.ent-row.ent-active').forEach(r => r.classList.remove('ent-active'));
  document.querySelectorAll('.tipo-row.tipo-active').forEach(r => { r.classList.remove('tipo-active'); r._tipoActivo = false; });
  actualizarSec5(null);
});

const modelsListEl = document.getElementById("modelsList");
const modelsEmptyEl = document.getElementById("modelsEmpty");
const loadedModels = new Map();
async function getAllIds(model) {
  const cats = await model.getItemsWithGeometryCategories();
  const all = await model.getItemsOfCategories(cats.filter(Boolean).map(c => new RegExp(`^${c}$`)));
  return Object.values(all).flat();
}
function updateModelsList() {
  modelsListEl.innerHTML = '';
  if (fragments.list.size === 0) { modelsListEl.append(modelsEmptyEl); return; }
  modelsEmptyEl.style.display = 'none';
  for (const [id, model] of fragments.list) {
    const item = document.createElement('div');
    item.className = 'model-item';

    // Nombre del modelo
    const name = document.createElement('span');
    name.className = 'model-item-name';
    name.textContent = id;
    name.title = id;

    // Botón ocultar/mostrar
    const isVis = loadedModels.get(id)?.visible !== false;
    const btnVis = document.createElement('button');
    btnVis.className = 'model-item-btn' + (isVis ? '' : ' hidden');
    btnVis.title = isVis ? 'Ocultar modelo' : 'Mostrar modelo';
    btnVis.textContent = isVis ? '👁' : '🙈';
    btnVis.addEventListener('click', async () => {
      const cur = loadedModels.get(id) || { visible: true };
      cur.visible = !cur.visible;
      loadedModels.set(id, cur);
      await hider.set(cur.visible, { [id]: new Set(await getAllIds(model)) });
      btnVis.textContent = cur.visible ? '👁' : '🙈';
      btnVis.title = cur.visible ? 'Ocultar modelo' : 'Mostrar modelo';
      btnVis.classList.toggle('hidden', !cur.visible);
      item.classList.toggle('model-item-hidden', !cur.visible);
    });

    // Botón eliminar
    const btnDel = document.createElement('button');
    btnDel.className = 'model-item-btn model-item-del';
    btnDel.title = 'Eliminar modelo';
    btnDel.textContent = '🗑';
    btnDel.addEventListener('click', async () => {
      // Confirmación rápida inline: cambiar a ✓ / ✗
      if (btnDel._confirming) return;
      btnDel._confirming = true;
      const prev = btnDel.textContent;
      btnDel.textContent = '✓';
      btnDel.title = 'Confirmar eliminación';
      btnDel.style.color = 'var(--red)';
      btnDel.style.borderColor = 'var(--red)';

      const cancelTimeout = setTimeout(() => {
        btnDel._confirming = false;
        btnDel.textContent = prev;
        btnDel.title = 'Eliminar modelo';
        btnDel.style.color = '';
        btnDel.style.borderColor = '';
      }, 2500);

      btnDel.addEventListener('click', async function confirmDelete() {
        clearTimeout(cancelTimeout);
        btnDel.removeEventListener('click', confirmDelete);
        btnDel._confirming = false;
        try {
          world.scene.three.remove(model.object);
          fragments.list.delete(id);
          loadedModels.delete(id);
          updateModelsList();
          renderProps(null, null);
        } catch(e) { console.error('Error al eliminar modelo:', e); }
      }, { once: true });
    });

    item.append(name, btnVis, btnDel);
    if (!isVis) item.classList.add('model-item-hidden');
    modelsListEl.append(item);
  }
}
fragments.list.onItemSet.add(({ key }) => { loadedModels.set(key, { visible: true }); updateModelsList(); });
fragments.list.onItemDeleted.add(({ key }) => { loadedModels.delete(key); updateModelsList(); });


const gizmoCanvas = document.getElementById("gizmo");
const gizmoCtx = gizmoCanvas.getContext("2d");
const gizmoSize = 26, gizmoCX = 35, gizmoCY = 35;
function drawGizmo() {
  if (!gizmoCtx) return;
  gizmoCtx.clearRect(0, 0, 70, 70);
  const m = world.camera.three.matrixWorldInverse.elements;
  const axes = [{d:[1,0,0],label:'X',color:'#ff4444'},{d:[0,1,0],label:'Y',color:'#44cc44'},{d:[0,0,1],label:'Z',color:'#4488ff'}];
  const proj = axes.map(a => ({...a, px:(a.d[0]*m[0]+a.d[1]*m[4]+a.d[2]*m[8])*gizmoSize, py:-(a.d[0]*m[1]+a.d[1]*m[5]+a.d[2]*m[9])*gizmoSize}));
  proj.sort((a,b)=>(a.px*a.px+a.py*a.py)-(b.px*b.px+b.py*b.py));
  proj.forEach(ax => {
    gizmoCtx.beginPath(); gizmoCtx.moveTo(gizmoCX,gizmoCY); gizmoCtx.lineTo(gizmoCX+ax.px,gizmoCY+ax.py);
    gizmoCtx.strokeStyle=ax.color; gizmoCtx.lineWidth=2; gizmoCtx.stroke();
    gizmoCtx.fillStyle=ax.color; gizmoCtx.font='bold 9px monospace';
    gizmoCtx.fillText(ax.label,gizmoCX+ax.px*1.3-4,gizmoCY+ax.py*1.3+4);
  });
  gizmoCtx.beginPath(); gizmoCtx.arc(gizmoCX,gizmoCY,3,0,Math.PI*2); gizmoCtx.fillStyle='rgba(255,255,255,0.7)'; gizmoCtx.fill();
}
world.renderer.onAfterUpdate.add(drawGizmo);

// ══ NAVEGADOR DEL MODELO ══
window.navToggle = (id) => {
  const body = document.getElementById('ng_' + id);
  const arrow = document.getElementById('nga_' + id);
  if (!body) return;
  body.classList.toggle('open');
  if (arrow) arrow.classList.toggle('open');
};

async function renderNavegador(est) {
  const navBody = document.getElementById('navBody');
  if (!navBody) return;
  const inst = est.instancias;
  const conteo = est.conteo;
  let html = '';

  // ── Sección Estructura ──
  let estructuraHtml = '';
  for (const id in inst) {
    if (inst[id].cls !== 'IFCSITE') continue;
    const attrs = splitAttrs(extraerRaw(est.texto, inst[id].pos));
    const nombre = strVal(attrs[2]) || strVal(attrs[1]) || '(sin nombre)';
    estructuraHtml += `<div class="nav-item" onclick="window.navSeleccionar('site','${id}',event)"><span class="nav-item-icon">🌍</span><span class="nav-item-name">${esc(nombre)}</span><span class="nav-item-badge">Sitio</span></div>`;

    for (const bid in inst) {
      if (inst[bid].cls !== 'IFCBUILDING') continue;
      const battrs = splitAttrs(extraerRaw(est.texto, inst[bid].pos));
      const bnombre = strVal(battrs[2]) || strVal(battrs[1]) || '(sin nombre)';
      estructuraHtml += `<div class="nav-item nav-indent-1" onclick="window.navSeleccionar('building','${bid}',event)"><span class="nav-item-icon">🏢</span><span class="nav-item-name">${esc(bnombre)}</span><span class="nav-item-badge">Edificio</span></div>`;
      for (const nid in inst) {
        if (inst[nid].cls !== 'IFCBUILDINGSTOREY') continue;
        const nattrs = splitAttrs(extraerRaw(est.texto, inst[nid].pos));
        const nnombre = strVal(nattrs[2]) || strVal(nattrs[1]) || '(sin nombre)';
        const qty = (est.elemsPorNivel[nid] || []).length;
        estructuraHtml += `<div class="nav-item nav-indent-2" onclick="window.navSeleccionar('storey','${nid}',event)"><span class="nav-item-icon">📊</span><span class="nav-item-name">${esc(nnombre)}</span>${qty>0?`<span class="nav-item-badge">${qty}</span>`:''}</div>`;
      }
      break;
    }
    break;
  }

  if (estructuraHtml) {
    const nNiveles = Object.keys(est.elemsPorNivel).length;
    html += `<div class="nav-group"><div class="nav-group-hdr" onclick="window.navToggle('est')"><span class="nav-group-arrow open" id="nga_est">▶</span><span class="nav-group-title">Estructura</span><span class="nav-group-badge">${nNiveles} niveles</span></div><div class="nav-group-body open" id="ng_est">${estructuraHtml}</div></div>`;
  }

  // ── Sección Entidades — solo las que tienen geometría ──
  const clsConGeom = new Set();
  for (const [, model] of fragments.list) {
    try {
      const cats = await model.getItemsWithGeometryCategories();
      cats.forEach(c => { if (c) clsConGeom.add(c); });
    } catch(e) {}
  }
  const entsCls = Object.keys(conteo).filter(cls =>
    clsConGeom.has(cls) && conteo[cls] > 0
  ).sort((a, b) => conteo[b] - conteo[a]);

  let entHtml = '', totalEnts = 0;
  entsCls.forEach(cls => {
    const qty = conteo[cls] || 0; if (!qty) return;
    totalEnts += qty;
    const ico = IFC_ICO[cls] || '▪';
    const nom = cls.charAt(0) + cls.slice(1).toLowerCase();
    entHtml += `<div class="nav-item nav-indent-1" onclick="window.navSeleccionar('entity','${cls}',event)"><span class="nav-item-icon">${ico}</span><span class="nav-item-name">${nom}</span><span class="nav-item-badge">${qty}</span></div>`;
  });

  if (entHtml) {
    html += `<div class="nav-sep"></div><div class="nav-group"><div class="nav-group-hdr" onclick="window.navToggle('ent')"><span class="nav-group-arrow open" id="nga_ent">▶</span><span class="nav-group-title">Entidades</span><span class="nav-group-badge">${totalEnts}</span></div><div class="nav-group-body open" id="ng_ent">${entHtml}</div></div>`;
  }

  navBody.innerHTML = html || '<div class="nav-empty">Carga un modelo IFC<br>para navegar su estructura</div>';
}

window.navSeleccionar = async (tipo, id, e) => {
  const ctrlPressed = e?.ctrlKey || e?.metaKey || false;

  // Limpiar selección visual anterior si no es Ctrl
  if (!ctrlPressed) {
    document.querySelectorAll('.nav-item.nav-active').forEach(r => r.classList.remove('nav-active'));
  }

  // Marcar el ítem activo
  const el = document.querySelector(`[onclick*="navSeleccionar('${tipo}','${id}'"]`);
  if (el) {
    if (ctrlPressed && el.classList.contains('nav-active')) {
      el.classList.remove('nav-active');
    } else {
      el.classList.add('nav-active');
    }
  }

  const map = {};

  if (tipo === 'entity') {
    // Igual que onEntidadClick — aislar categoría
    if (!ctrlPressed) {
      isolatedCategories.clear();
      document.querySelectorAll('.ent-row.ent-active').forEach(r => r.classList.remove('ent-active'));
      await hider.set(true);
    }
    isolatedCategories.add(id);
    for (const [,model] of fragments.list) {
      const items = await model.getItemsOfCategories([new RegExp(`^${id}$`)]);
      map[model.modelId] = new Set(Object.values(items).flat());
    }
    await hider.isolate(map);

  } else if (tipo === 'storey') {
    if (!_estActual) return;
    const elemIds = (_estActual.elemsPorNivel[id] || []).map(Number);
    if (!elemIds.length) return;
    if (!ctrlPressed) await hider.set(true);
    for (const [,model] of fragments.list) {
      map[model.modelId] = new Set(elemIds);
    }
    await hider.isolate(map);

  } else if (tipo === 'building' || tipo === 'site') {
    if (!_estActual) return;
    const allIds = [];
    for (const nid in _estActual.elemsPorNivel) {
      allIds.push(..._estActual.elemsPorNivel[nid].map(Number));
    }
    if (!allIds.length) return;
    if (!ctrlPressed) await hider.set(true);
    for (const [,model] of fragments.list) {
      map[model.modelId] = new Set(allIds);
    }
    await hider.isolate(map);
  }

  if (Object.keys(map).length) {
    try { await highlighter.highlightByID('select', map, true, true); } catch(e) {}
  }
};

// ══ REPORTE BIM ══
const ESP = {
  "Coordinacion":         {cod:"COO",ents:[["IFCGRID","Grilla"],["IFCSITE","Sitio"],["IFCBUILDING","Edificio"],["IFCBUILDINGSTOREY","Nivel"],["IFCSPACE","Espacio"],["IFCZONE","Zona"],["IFCWALL","Muro"],["IFCCURTAINWALL","Muro Cortina"],["IFCWINDOW","Ventana"],["IFCDOOR","Puerta"],["IFCROOF","Cubierta"],["IFCCOVERING","Cielo Falso / Piso"],["IFCBEAM","Viga"],["IFCCOLUMN","Columna"],["IFCFOOTING","Fundacion"],["IFCSLAB","Losa"],["IFCSTAIR","Escalera"],["IFCRAMP","Rampa"],["IFCRAILING","Baranda"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCDUCTSEGMENT","Segmento de Ducto"],["IFCDUCTFITTING","Fitting de Ducto"],["IFCCABLECARRIERSEGMENT","Bandeja de Cable"],["IFCCABLECARRIERFITTING","Fitting Bandeja de Cable"],["IFCELECTRICDISTRIBUTIONBOARD","Tablero Electrico"],["IFCAIRTERMINAL","Terminal de Aire"],["IFCDAMPER","Compuerta"],["IFCPUMP","Bomba"],["IFCTANK","Estanque"],["IFCVALVE","Valvula"],["IFCLIGHTFIXTURE","Luminaria"],["IFCSENSOR","Sensor"],["IFCFIRESUPPRESSIONTERMINAL","Terminal Supresion Incendio"],["IFCALARM","Alarma"],["IFCMEDICALDEVICE","Dispositivo Medico"],["IFCFURNITURE","Mobiliario"],["IFCTRANSPORTELEMENT","Elemento de Transporte"],["IFCSANITARYTERMINAL","Aparato Sanitario"],["IFCWASTETERMINAL","Terminal de Residuos"],["IFCOUTLET","Salida Electrica"],["IFCSWITCHINGDEVICE","Interruptor"],["IFCUNITARYEQUIPMENT","Equipo Unitario"],["IFCCHILLER","Enfriador"],["IFCDISTRIBUTIONCHAMBERELEME","Camara de Distribucion"],["IFCDISTRIBUTIONELEMENT","Elemento de Distribucion"],["IFCAUDIOVISUALAPPLIANCE","Equipo Audiovisual"],["IFCCOMMUNICATIONSAPPLIANCE","Equipo de Comunicaciones"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Sitio":                {cod:"SIT",ents:[["IFCGRID","Grilla"],["IFCSITE","Sitio"],["IFCCIVILELEMENT","Elemento Civil"],["IFCGEOGRAPHICELEMENT","Elemento Geografico"],["IFCSLAB","Losa"],["IFCWALL","Muro"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Arquitectura":         {cod:"ARQ",ents:[["IFCGRID","Grilla"],["IFCWALL","Muro"],["IFCCURTAINWALL","Muro Cortina"],["IFCWINDOW","Ventana"],["IFCDOOR","Puerta"],["IFCROOF","Cubierta"],["IFCCOVERING","Cielo Falso / Piso"],["IFCSANITARYTERMINAL","Aparato Sanitario"],["IFCRAILING","Baranda"],["IFCFURNITURE","Mobiliario"],["IFCVALVE","Valvula"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCWASTETERMINAL","Terminal de Residuos"],["IFCTRANSPORTELEMENT","Elemento de Transporte"],["IFCSPACE","Espacio"],["IFCZONE","Zona"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Volumetrico":          {cod:"VOL",ents:[["IFCGRID","Grilla"],["IFCZONE","Zona"],["IFCSPACE","Espacio"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Estructural":          {cod:"EST",ents:[["IFCGRID","Grilla"],["IFCBEAM","Viga"],["IFCCOLUMN","Columna"],["IFCFOOTING","Fundacion"],["IFCSLAB","Losa"],["IFCWALL","Muro"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Agua Potable":         {cod:"APO",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCPUMP","Bomba"],["IFCTANK","Estanque"],["IFCVALVE","Valvula"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Aguas Tratadas":       {cod:"ATR",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCPUMP","Bomba"],["IFCTANK","Estanque"],["IFCVALVE","Valvula"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Alcantarillado":       {cod:"ALC",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCDISTRIBUTIONCHAMBERELEME","Camara de Distribucion"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Corrientes Debiles":   {cod:"CEC",ents:[["IFCGRID","Grilla"],["IFCCABLECARRIERSEGMENT","Bandeja de Cable"],["IFCCABLECARRIERFITTING","Fitting Bandeja de Cable"],["IFCDISTRIBUTIONCHAMBERELEME","Camara de Distribucion"],["IFCOUTLET","Salida Electrica"],["IFCSENSOR","Sensor"],["IFCAUDIOVISUALAPPLIANCE","Equipo Audiovisual"],["IFCCOMMUNICATIONSAPPLIANCE","Equipo de Comunicaciones"],["IFCELECTRICDISTRIBUTIONBOARD","Tablero Electrico"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Climatizacion":        {cod:"CLI",ents:[["IFCGRID","Grilla"],["IFCAIRTERMINAL","Terminal de Aire"],["IFCDAMPER","Compuerta"],["IFCDUCTFITTING","Fitting de Ducto"],["IFCDUCTSEGMENT","Segmento de Ducto"],["IFCUNITARYEQUIPMENT","Equipo Unitario"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCPUMP","Bomba"],["IFCTANK","Estanque"],["IFCCHILLER","Enfriador"],["IFCVALVE","Valvula"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Combustible":          {cod:"COM",ents:[["IFCGRID","Grilla"],["IFCTANK","Estanque"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCVALVE","Valvula"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Control Centralizado": {cod:"CCT",ents:[["IFCGRID","Grilla"],["IFCELECTRICDISTRIBUTIONBOARD","Tablero Electrico"],["IFCDISTRIBUTIONCONTROLELEMENT","Elemento de Control"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Correo Neumatico":     {cod:"COR",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCDISTRIBUTIONELEMENT","Elemento de Distribucion"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Aguas Lluvias":        {cod:"ALL",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCDISTRIBUTIONCHAMBERELEME","Camara de Distribucion"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Gases Clinicos":       {cod:"GCL",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCVALVE","Valvula"],["IFCTANK","Estanque"],["IFCMEDICALDEVICE","Dispositivo Medico"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Iluminacion":          {cod:"ILU",ents:[["IFCGRID","Grilla"],["IFCLIGHTFIXTURE","Luminaria"],["IFCSWITCHINGDEVICE","Interruptor"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Proteccion Incendios": {cod:"PCI",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCSENSOR","Sensor"],["IFCTANK","Estanque"],["IFCPUMP","Bomba"],["IFCFIRESUPPRESSIONTERMINAL","Terminal Supresion Incendio"],["IFCALARM","Alarma"],["IFCVALVE","Valvula"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
  "Electricidad":         {cod:"ELE",ents:[["IFCGRID","Grilla"],["IFCCABLECARRIERSEGMENT","Bandeja de Cable"],["IFCCABLECARRIERFITTING","Fitting Bandeja de Cable"],["IFCDISTRIBUTIONCHAMBERELEME","Camara de Distribucion"],["IFCELECTRICDISTRIBUTIONBOARD","Tablero Electrico"],["IFCBUILDINGELEMENTPROXY","Sin clasificar"]]},
};
const IFC_ICO = {IFCWALL:"🧱",IFCCURTAINWALL:"🪟",IFCSLAB:"⬜",IFCROOF:"🏠",IFCCOLUMN:"🏛️",IFCBEAM:"📐",IFCFOOTING:"⚓",IFCDOOR:"🚪",IFCWINDOW:"🪟",IFCRAILING:"🔩",IFCSTAIR:"🪜",IFCRAMP:"♿",IFCCOVERING:"🪵",IFCFURNITURE:"🪑",IFCPIPESEGMENT:"💧",IFCPIPEFITTING:"🔧",IFCDUCTSEGMENT:"💨",IFCDUCTFITTING:"🔧",IFCPUMP:"⚙️",IFCTANK:"🛢️",IFCVALVE:"🔩",IFCLIGHTFIXTURE:"💡",IFCSWITCHINGDEVICE:"🔌",IFCOUTLET:"🔌",IFCELECTRICDISTRIBUTIONBOARD:"⚡",IFCSENSOR:"📡",IFCALARM:"🚨",IFCFIRESUPPRESSIONTERMINAL:"🔥",IFCSITE:"🌍",IFCBUILDING:"🏢",IFCBUILDINGSTOREY:"📊",IFCGRID:"#",IFCSPACE:"🔵",IFCZONE:"🔷",IFCBUILDINGELEMENTPROXY:"⚠️",IFCCABLECARRIERSEGMENT:"📦",IFCCABLECARRIERFITTING:"🔧",IFCAIRTERMINAL:"💨",IFCDAMPER:"🔒",IFCUNITARYEQUIPMENT:"🏭",IFCCHILLER:"❄️",IFCMEDICALDEVICE:"🏥",IFCTRANSPORTELEMENT:"🚡",IFCSANITARYTERMINAL:"🚿",IFCWASTETERMINAL:"🗑️",IFCFURNITURESTANDARD:"🪑",IFCCIVILELEMENT:"🏗️",IFCGEOGRAPHICELEMENT:"🗺️",IFCDISTRIBUTIONCHAMBERELEME:"🔲",IFCDISTRIBUTIONELEMENT:"🔲",IFCDISTRIBUTIONCONTROLELEMENT:"🎛️",IFCAUDIOVISUALAPPLIANCE:"📺",IFCCOMMUNICATIONSAPPLIANCE:"📡"};

function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function extraerRaw(t,p){let d=1,i=p,o='';while(i<t.length&&d>0){const c=t[i];if(c==='(')d++;else if(c===')'){d--;if(!d)break;}o+=c;i++;}return o;}
function splitAttrs(r){let a=[],d=0,c='';for(let i=0;i<r.length;i++){const ch=r[i];if(ch==='('||ch==='['){d++;c+=ch;}else if(ch===')'||ch===']'){d--;c+=ch;}else if(ch===','&&d===0){a.push(c.trim());c='';}else c+=ch;}if(c.trim())a.push(c.trim());return a;}
function strVal(a){if(!a||a==='$'||a==='*')return null;const m=a.match(/^'(.*)'$/);return m?m[1]:a;}
function refId(a){if(!a)return null;const m=a.match(/^#(\d+)$/);return m?m[1]:null;}

function parsearIFC(texto) {
  let conteo={},instancias={},schema='IFC2X3',proy='—';
  const re=/#(\d+)\s*=\s*(IFC[A-Z0-9]+)\s*\(/g; let m;
  while((m=re.exec(texto))!==null){ instancias[m[1]]={cls:m[2],pos:m.index+m[0].length}; conteo[m[2]]=(conteo[m[2]]||0)+1; }
  const ms=texto.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/); if(ms)schema=ms[1];
  const mp=texto.match(/IFCPROJECT\s*\([^,]*,[^,]*,\s*'([^']*)'/); if(mp)proy=mp[1];
  let tipos=[]; const reTipo=/#(\d+)\s*=\s*(IFC[A-Z0-9]*TYPE[A-Z0-9]*)\s*\(/g; let mt;
  while((mt=reTipo.exec(texto))!==null){const traw=extraerRaw(texto,mt.index+mt[0].length),tattrs=splitAttrs(traw);tipos.push({id:'#'+mt[1],cls:mt[2],nombre:strVal(tattrs[2])||strVal(tattrs[1])||'(sin nombre)'});}
  let elemsPorNivel={}; const reRel=/#(\d+)\s*=\s*IFCRELCONTAINEDINSPATIALSTRUCTURE\s*\(/g; let mr;
  while((mr=reRel.exec(texto))!==null){const rattrs=splitAttrs(extraerRaw(texto,mr.index+mr[0].length));const nivelRef=refId(rattrs[5]);if(!nivelRef)continue;elemsPorNivel[nivelRef]=(rattrs[4]||'').replace(/[\(\)]/g,'').split(',').map(s=>refId(s.trim())).filter(Boolean);}
  return {conteo,instancias,schema,proy,texto,tipos,elemsPorNivel};
}
function getPunto(r,inst,t){if(!r||!inst[r]||inst[r].cls!=='IFCCARTESIANPOINT')return null;const c=extraerRaw(t,inst[r].pos).replace(/[\(\)]/g,'').split(',').map(v=>parseFloat(v)||0);return{x:c[0]||0,y:c[1]||0,z:c[2]||0};}
function getOffset(plRef,inst,t){if(!plRef||!inst[plRef])return null;const lp=splitAttrs(extraerRaw(t,inst[plRef].pos));let ap=null;for(let i=0;i<lp.length;i++){const r=refId(lp[i]);if(r&&inst[r]&&(inst[r].cls==='IFCAXIS2PLACEMENT3D'||inst[r].cls==='IFCAXIS2PLACEMENT2D')){ap=r;break;}}if(!ap)return null;return getPunto(refId(splitAttrs(extraerRaw(t,inst[ap].pos))[0]),inst,t);}
function verificarOrigen(est){const res=[];['IFCSITE','IFCBUILDING'].forEach(tipo=>{for(const id in est.instancias){if(est.instancias[id].cls===tipo){const attrs=splitAttrs(extraerRaw(est.texto,est.instancias[id].pos));const nombre=strVal(attrs[2])||strVal(attrs[1])||'(sin nombre)';let plRef=null;for(let i=3;i<=8&&i<attrs.length;i++){const rid=refId(attrs[i]);if(rid&&est.instancias[rid]&&est.instancias[rid].cls==='IFCLOCALPLACEMENT'){plRef=rid;break;}}let x=null,y=null,z=null;if(plRef){const off=getOffset(plRef,est.instancias,est.texto);if(off){x=off.x;y=off.y;z=off.z;}}res.push({tipo,nombre,x,y,z,ok:x===null||(Math.abs(x-_cfgX)<0.001&&Math.abs(y-_cfgY)<0.001&&Math.abs(z-_cfgZ)<0.001)});break;}}});return res;}
function verificarNombres(est){const res=[];[{tipo:'IFCSITE',min:_cfgSite},{tipo:'IFCBUILDING',min:_cfgBuilding}].forEach(cfg=>{for(const id in est.instancias){if(est.instancias[id].cls===cfg.tipo){const attrs=splitAttrs(extraerRaw(est.texto,est.instancias[id].pos));const nombre=strVal(attrs[2])||strVal(attrs[1])||'';res.push({tipo:cfg.tipo,nombre,largo:nombre.length,ok:nombre.length>=cfg.min});break;}}});return res;}
function verificarNiveles(est){const niveles=[];for(const id in est.instancias){if(est.instancias[id].cls==='IFCBUILDINGSTOREY'){const attrs=splitAttrs(extraerRaw(est.texto,est.instancias[id].pos));const nombre=strVal(attrs[2])||strVal(attrs[1])||'';niveles.push({id:'#'+id,nombre,largo:nombre.length,ok:nombre.length>=_cfgStorey});}}return niveles;}
function rpSec(t,b,bc,inner,open){return`<div class="rp-sec"><div class="rp-sec-hdr" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'"><span class="rp-sec-title">${t}</span><span class="rp-badge ${bc}">${b}</span></div><div class="rp-content" style="display:${open?'block':'none'}">${inner}</div></div>`;}

function renderReporte(est) {
  _estActual = est; let html = ''; const conteo = est.conteo;

  // Banner MEI
  html += `<div style="margin:0 8px 8px 8px;padding:10px 12px;background:rgba(0,212,255,.05);border:1px solid rgba(0,212,255,.15);border-left:3px solid var(--accent);border-radius:5px;">
    <div style="font:700 9px var(--mono);color:var(--accent);text-transform:uppercase;letter-spacing:.15em;margin-bottom:4px;">✅ Reporte MEI</div>
    <div style="font:400 9px var(--mono);color:var(--muted);line-height:1.7;">Verifica el cumplimiento del modelo IFC según el estándar PlanBIM Chile — secciones 3.1 a 3.5.</div>
  </div>`;

  // 3.1 Identificación del modelo
  const espKey0 = Object.keys(ESP).find(k=>ESP[k].cod===_espActual)||'Arquitectura';
  const optsEsp = Object.keys(ESP).map(k =>
    `<option value="${ESP[k].cod}"${ESP[k].cod===_espActual?' selected':''}>${k} (${ESP[k].cod})</option>`
  ).join('');
  html += `<div class="rp-sec">
    <div class="rp-sec-hdr" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
      <span class="rp-sec-title">3.1 Nombre del Contenedor de la información</span>
      <span class="rp-badge rp-info">${espKey0}</span>
    </div>
    <div class="rp-content" style="display:block">
      <table class="rp-table">
        <tr>
          <td style="font:400 9px var(--mono);color:var(--muted);padding:5px 10px 2px;white-space:nowrap">Archivo</td>
          <td style="font:600 10px var(--mono);color:var(--accent);padding:5px 10px 2px;word-break:break-all">${esc(_nombreArchivoActual||'—')}</td>
        </tr>
        <tr>
          <td style="font:400 9px var(--mono);color:var(--muted);padding:2px 10px 5px;white-space:nowrap">Especialidad</td>
          <td style="padding:2px 10px 5px">
            <select onchange="window._cambiarEsp(this.value)" style="background:var(--navy);color:var(--text);border:1px solid var(--border);border-radius:4px;font:500 9px var(--mono);padding:3px 6px;width:100%;cursor:pointer;outline:none">
              ${optsEsp}
            </select>
          </td>
        </tr>
      </table>
    </div>
  </div>`;

  // 1. Origen
  const orig = verificarOrigen(est);
  if (orig.length) { const ok=orig.every(r=>r.ok); const filas=orig.map(r=>{const c=r.x!==null?`(${[r.x,r.y,r.z].map(v=>(+v).toFixed(3)).join(', ')})`:'N/A';return`<tr><td class="td-name">${r.tipo.charAt(0)+r.tipo.slice(1).toLowerCase()}<div class="td-cls">${esc(r.nombre)}</div></td><td style="font:400 9px var(--mono);color:var(--muted)">${c}</td><td class="td-ok">${r.ok?'<span class="ic-ok">✓</span>':'<span class="ic-err">✗</span>'}</td></tr>`;}).join(''); html+=rpSec('3.2 Posición Local',ok?'OK':'Error',ok?'rp-ok':'rp-err',`<table class="rp-table">${filas}</table>`,!ok); }
  const noms = verificarNombres(est);
  if (noms.length) { const ok=noms.every(r=>r.ok); const filas=noms.map(r=>`<tr><td class="td-name">${r.tipo.charAt(0)+r.tipo.slice(1).toLowerCase()}</td><td style="font:400 9px var(--mono)">"${esc(r.nombre)}" (${r.largo} car.)</td><td class="td-ok">${r.ok?'<span class="ic-ok">✓</span>':'<span class="ic-err">✗</span>'}</td></tr>`).join(''); html+=rpSec('3.3.a Nombre del sitio y del edificio',ok?'OK':'Error',ok?'rp-ok':'rp-err',`<div class="rp-msg">Sitio: ≥3 car. · Edificio: ≥2 car.</div><table class="rp-table">${filas}</table>`,!ok); }
  const nivs = verificarNiveles(est);
  if (nivs.length) { const ok=nivs.every(r=>r.ok); const nOk=nivs.filter(r=>r.ok).length; const filas=nivs.map(r=>`<tr><td class="td-name">${esc(r.nombre||'(sin nombre)')}</td><td style="text-align:center;font:400 9px var(--mono);color:var(--muted)">${r.largo} car.</td><td class="td-ok">${r.ok?'<span class="ic-ok">✓</span>':'<span class="ic-err">✗</span>'}</td></tr>`).join(''); html+=rpSec(`3.3.b Denominación de los niveles del edificio`,`${nOk}/${nivs.length} OK`,ok?'rp-ok':nOk>0?'rp-warn':'rp-err',`<table class="rp-table">${filas}</table>`,!ok); }
  const espKey=Object.keys(ESP).find(k=>ESP[k].cod===_espActual)||'Arquitectura'; const espEnts=ESP[espKey].ents;
  let filasP='',filasA='',presentes=0;
  espEnts.forEach(([cls,nom])=>{
    const qty=conteo[cls]||0; if(qty>0)presentes++;
    const ico=IFC_ICO[cls]||''; const isProxy=cls==='IFCBUILDINGELEMENTPROXY';
    const fila=`<tr id="entrow_${cls}" class="ent-row${isProxy?' td-proxy':''}" onclick="window.onEntidadClick('${cls}',event)"><td class="td-name">${ico} ${nom}<div class="td-cls">${cls.charAt(0)+cls.slice(1).toLowerCase()}</div></td><td class="td-ok">${qty>0?(isProxy?'<span style="color:var(--warn)">⚠</span>':'<span class="ic-ok">✓</span>'):'<span class="ic-err">✗</span>'}</td><td class="td-qty${qty===0?' zero':''}" ${isProxy&&qty>0?'style="color:var(--warn)"':''}>${qty}</td></tr>`;
    if(qty>0)filasP+=fila; else filasA+=fila;
  });
  let filas='';
  if(filasP)filas+=`<tr><td colspan="4" style="padding:3px 10px;font:700 8px var(--mono);color:#00c853;text-transform:uppercase;background:rgba(0,200,83,.05)">✓ Presentes</td></tr>${filasP}`;
  if(filasA)filas+=`<tr><td colspan="4" style="padding:3px 10px;font:700 8px var(--mono);color:var(--muted);text-transform:uppercase;background:rgba(0,0,0,.15)">✗ Ausentes</td></tr>${filasA}`;
  const pct=espEnts.length?Math.round(presentes/espEnts.length*100):0;
  html+=rpSec(`3.4 Uso Correcto de las entidades`,`${presentes}/${espEnts.length} presentes`,pct===100?'rp-ok':pct>50?'rp-warn':'rp-err',`<table class="rp-table">${filas}</table>`,true);
  html+=renderSecTipos(est,null);
  document.getElementById('rpBody').innerHTML=html;
}

function extraerTiposDelIFC(est) {
  const por = {};

  // Fuente principal: instancias reales — agrupar por cls → Name (Familia:Tipo)
  // Contar cuántas instancias hay de cada Name
  const conteoNombres = {}; // "cls||Familia:Tipo" → count
  for (const id in est.instancias) {
    const inst = est.instancias[id];
    if (inst.cls.endsWith('TYPE') || inst.cls.startsWith('IFCREL') ||
        inst.cls === 'IFCPROPERTYSET' || inst.cls === 'IFCPROPERTYSINGLEVALUE') continue;
    const attrs = splitAttrs(extraerRaw(est.texto, inst.pos));
    const nombre = strVal(attrs[2]) || strVal(attrs[1]) || '';
    if (!nombre || !nombre.includes(':')) continue;

    const partes = nombre.split(':');
    // Revit: "Familia:Tipo:IDinstancia" — agrupar por Familia+Tipo, ignorar ID
    const familia = partes[0];
    const tipo    = partes.length >= 3 ? partes.slice(1, -1).join(':') : partes[1];

    const key = inst.cls + '||' + familia + '||' + tipo;
    conteoNombres[key] = (conteoNombres[key] || 0) + 1;
  }

  // Construir estructura por entidad
  for (const key in conteoNombres) {
    const parts = key.split('||');
    const cls = parts[0], fam = parts[1], tip = parts[2];
    if (!por[cls]) por[cls] = new Map();
    if (!por[cls].has(fam)) por[cls].set(fam, new Map());
    const prev = por[cls].get(fam).get(tip) || 0;
    por[cls].get(fam).set(tip, prev + conteoNombres[key]);
  }

  return por;
}

function renderSecTipos(est, filtrarCls) {
  _tiposCache = _tiposCache || extraerTiposDelIFC(est);
  const espKey = Object.keys(ESP).find(k=>ESP[k].cod===_espActual)||'Arquitectura';
  const espEnts = ESP[espKey].ents.map(([cls])=>cls);
  let relevantes = Object.entries(_tiposCache).filter(([cls])=>espEnts.includes(cls));
  if (filtrarCls) relevantes = relevantes.filter(([cls])=>cls===filtrarCls);
  const tituloFiltro = filtrarCls ? ` — ${IFC_ICO[filtrarCls]||''} ${filtrarCls.charAt(0)+filtrarCls.slice(1).toLowerCase()}` : '';
  const tituloSec = '3.5 Estructura y denominación';

  if (!relevantes.length) return `<div class="rp-sec" id="sec5wrap">
    <div class="rp-sec-hdr" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
      <span class="rp-sec-title">${tituloSec}${tituloFiltro}</span><span class="rp-badge rp-info">Sin datos</span>
    </div>
    <div class="rp-content" style="display:none"><div class="rp-msg">No se encontraron tipos.</div></div>
  </div>`;

  // Construir índice de lookup: idx → {cls, fam, tip, nombre completo}
  // Se usa para evitar problemas con caracteres especiales en onclick
  if (!window._tiposIdx) window._tiposIdx = [];
  window._tiposIdx = [];

  let totalTipos=0, inner='';
  relevantes.forEach(([cls, familias]) => {
    const ico=IFC_ICO[cls]||''; const clsL=cls.charAt(0)+cls.slice(1).toLowerCase();
    if (!filtrarCls) inner+=`<tr style="background:rgba(0,212,255,.05)"><td colspan="2" style="padding:4px 10px;font:700 9px var(--mono);color:var(--accent)">${ico} ${clsL}</td></tr>`;
    familias.forEach((tipos, fam) => {
      tipos.forEach((qty, tip) => {
        totalTipos++;
        const idx = window._tiposIdx.length;
        window._tiposIdx.push({ cls, fam, tip, nombre: `${fam}:${tip}` });
        const rowId = 'tr_' + idx;
        inner += `<tr class="tipo-row" id="${rowId}" onclick="window.destacarTipo(${idx},this,event)" title="Clic para destacar en 3D">
          <td class="td-name" style="padding-left:${filtrarCls?'10':'20'}px">
            <span style="font:400 9px var(--mono);color:var(--muted);display:block;margin-bottom:1px">${esc(fam)}</span>
            <span style="font:600 10px var(--mono);color:var(--text)">${esc(tip)}</span>
          </td>
          <td class="td-qty" style="text-align:right;width:32px;min-width:32px;vertical-align:middle;font:700 10px var(--mono);color:var(--accent)">${qty}</td>
        </tr>`;
      });
    });
  });

  return `<div class="rp-sec" id="sec5wrap">
    <div class="rp-sec-hdr" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
      <span class="rp-sec-title">${tituloSec}${tituloFiltro}</span>
      <span class="rp-badge rp-info">${totalTipos} tipos</span>
    </div>
    <div class="rp-content" style="display:${filtrarCls?'block':'none'}">
      <table class="rp-table">
        <tr style="background:rgba(0,0,0,.2)">
          <td style="font:700 8px var(--mono);color:var(--muted);padding:3px 10px">ESTRUCTURA / DENOMINACIÓN</td>
          <td style="font:700 8px var(--mono);color:var(--muted);padding:3px 10px;text-align:right;white-space:nowrap">N°</td>
        </tr>
        ${inner}
      </table>
    </div>
  </div>`;
}
function actualizarSec5(filtrarCls) {
  _clsFiltroActiva = filtrarCls;
  if (!_estActual) return;
  const sec5 = document.getElementById('sec5wrap');
  if (!sec5) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = renderSecTipos(_estActual, filtrarCls);
  sec5.replaceWith(tmp.firstElementChild);
}
window.resetFiltroTipos = () => actualizarSec5(null);

// Rastrear la fila del reporte y el evento de click con Ctrl
const rpt_onclick = (cls, e) => window.onEntidadClick(cls, e);

window.onEntidadClick = async (cls, e) => {
  const ctrlPressed = e?.ctrlKey || e?.metaKey || false;
  const rowEl = document.getElementById('entrow_' + cls);

  if (!ctrlPressed) {
    // Sin Ctrl: deseleccionar todo y seleccionar solo esta categoría
    isolatedCategories.clear();
    document.querySelectorAll('.ent-row.ent-active').forEach(r => r.classList.remove('ent-active'));
    await hider.set(true);
    isolatedCategories.add(cls);
    if (rowEl) rowEl.classList.add('ent-active');
  } else {
    // Con Ctrl: toggle de esta categoría en la selección actual
    if (isolatedCategories.has(cls)) {
      isolatedCategories.delete(cls);
      if (rowEl) rowEl.classList.remove('ent-active');
    } else {
      isolatedCategories.add(cls);
      if (rowEl) rowEl.classList.add('ent-active');
    }
  }

  if (isolatedCategories.size === 0) {
    await hider.set(true);
    actualizarSec5(null);
    renderProps(null, null);
    return;
  }

  // Aislar elementos en el visor y seleccionarlos con el highlighter
  const map = {};
  for (const [,model] of fragments.list) {
    const items = await model.getItemsOfCategories([...isolatedCategories].map(c => new RegExp(`^${c}$`)));
    map[model.modelId] = new Set(Object.values(items).flat());
  }
  await hider.isolate(map);
  try { await highlighter.highlightByID('select', map, true, true); } catch(e) {}
  actualizarSec5(isolatedCategories.size === 1 ? [...isolatedCategories][0] : null);
};

// Mapa de tipos activos: idx → Set de localIds
const _tiposActivos = new Map();

window.destacarTipo = async (idx, rowEl, e) => {
  const ctrlPressed = e?.ctrlKey || e?.metaKey || false;
  const info = window._tiposIdx?.[idx];
  if (!info) return;
  const { cls, fam, tip } = info;

  // Recoger los localIds que coinciden con este tipo
  const matchingIds = {};
  for (const [,model] of fragments.list) {
    try {
      const items = await model.getItemsOfCategories([new RegExp(`^${cls}$`)]);
      const ids = Object.values(items).flat();
      const matching = [];
      for (const localId of ids) {
        const [data] = await model.getItemsData([localId]); if (!data) continue;
        const name = data.Name?.value || '';
        const prefijo = `${fam}:${tip}`;
        if (name === prefijo || name.startsWith(prefijo + ':')) matching.push(localId);
      }
      if (matching.length) matchingIds[model.modelId] = new Set(matching);
    } catch(e) {}
  }

  if (!ctrlPressed) {
    // Sin Ctrl: deseleccionar todo, seleccionar solo este tipo
    document.querySelectorAll('.tipo-row.tipo-active').forEach(r => { r.classList.remove('tipo-active'); r._tipoActivo = false; });
    _tiposActivos.clear();
    if (rowEl._tipoActivo) {
      // Era el único activo → deseleccionar
      rowEl._tipoActivo = false;
      try { await highlighter.clear('select'); } catch(e) {}
      return;
    }
  } else {
    // Con Ctrl: toggle este tipo
    if (rowEl._tipoActivo) {
      rowEl._tipoActivo = false;
      rowEl.classList.remove('tipo-active');
      _tiposActivos.delete(idx);
    } else {
      rowEl._tipoActivo = true;
      rowEl.classList.add('tipo-active');
      _tiposActivos.set(idx, matchingIds);
    }
    // Reconstruir selección combinada
    const combined = {};
    for (const [, mids] of _tiposActivos) {
      for (const [modelId, ids] of Object.entries(mids)) {
        if (!combined[modelId]) combined[modelId] = new Set();
        for (const id of ids) combined[modelId].add(id);
      }
    }
    if (_tiposActivos.size === 0) { try { await highlighter.clear('select'); } catch(e) {} return; }
    try { await highlighter.highlightByID('select', combined, true, true); } catch(e) {}
    return;
  }

  // Selección nueva (sin Ctrl)
  rowEl._tipoActivo = true;
  rowEl.classList.add('tipo-active');
  _tiposActivos.set(idx, matchingIds);
  if (Object.keys(matchingIds).length) {
    try { await highlighter.highlightByID('select', matchingIds, true, true); } catch(e) {}
  }
};

const espSel = document.getElementById('espSel');
Object.keys(ESP).forEach(k=>{ const opt=document.createElement('option'); opt.value=ESP[k].cod; opt.textContent=k; if(ESP[k].cod==='ARQ')opt.selected=true; espSel.append(opt); });
espSel.addEventListener('change', () => { _espActual=espSel.value; _tiposCache=null; _clsFiltroActiva=null; if(_estActual)renderReporte(_estActual); });

// Cambiar especialidad desde sección 0
window._cambiarEsp = (cod) => {
  _espActual = cod;
  espSel.value = cod;
  _tiposCache = null;
  _clsFiltroActiva = null;
  if (_estActual) renderReporte(_estActual);
};

function detectarEspecialidad(nombre) {
  const upper = (nombre||'').toUpperCase();
  const partes = upper.split(/[_\-\s\.]+/);
  // Primero buscar coincidencia exacta por segmento
  for (const p of partes) {
    for (const k in ESP) { if (ESP[k].cod === p) return ESP[k].cod; }
  }
  // Luego buscar por substring (prioridad: SIT y VOL primero si están)
  const prio = ['SIT','VOL'];
  for (const cod of prio) {
    if (upper.indexOf(cod) !== -1) return cod;
  }
  for (const k in ESP) {
    if (upper.indexOf(ESP[k].cod) !== -1) return ESP[k].cod;
  }
  return 'ARQ';
}

const reportePanel = document.getElementById('reportePanel');
const modalCfg = document.getElementById('modalCfg');

// Poblar select de especialidades en el modal
const mcfgEsp = document.getElementById('mcfgEsp');
Object.keys(ESP).forEach(k => {
  const opt = document.createElement('option');
  opt.value = ESP[k].cod;
  opt.textContent = `${k} (${ESP[k].cod})`;
  mcfgEsp.append(opt);
});

// Abrir modal al hacer clic en Reporte (solo si hay modelo cargado)
document.getElementById('btnReporte').addEventListener('click', () => {
  if (reportePanel.classList.contains('show')) {
    reportePanel.classList.remove('show');
    document.getElementById('btnReporte').classList.remove('active');
    return;
  }
  if (!_estActual) {
    reportePanel.classList.add('show');
    document.getElementById('btnReporte').classList.add('active');
    return;
  }
  // Precargar valores detectados
  mcfgEsp.value = _espActual;
  document.getElementById('mcfgX').value = 0;
  document.getElementById('mcfgY').value = 0;
  document.getElementById('mcfgZ').value = 0;
  document.getElementById('mcfgSite').value = 3;
  document.getElementById('mcfgBuilding').value = 2;
  document.getElementById('mcfgStorey').value = 5;
  modalCfg.style.display = 'flex';
});

// Cancelar
document.getElementById('mcfgCancel').addEventListener('click', () => {
  modalCfg.style.display = 'none';
});

// Confirmar → aplicar config y generar reporte
document.getElementById('mcfgOk').addEventListener('click', () => {
  _espActual = mcfgEsp.value;
  _cfgX = parseFloat(document.getElementById('mcfgX').value) || 0;
  _cfgY = parseFloat(document.getElementById('mcfgY').value) || 0;
  _cfgZ = parseFloat(document.getElementById('mcfgZ').value) || 0;
  _cfgSite = parseInt(document.getElementById('mcfgSite').value) || 3;
  _cfgBuilding = parseInt(document.getElementById('mcfgBuilding').value) || 2;
  _cfgStorey = parseInt(document.getElementById('mcfgStorey').value) || 5;
  espSel.value = _espActual;
  _tiposCache = null;
  _clsFiltroActiva = null;
  modalCfg.style.display = 'none';
  renderReporte(_estActual);
  reportePanel.classList.add('show');
  document.getElementById('btnReporte').classList.add('active');
});

document.getElementById('reporteClose').addEventListener('click', () => {
  reportePanel.classList.remove('show');
  document.getElementById('btnReporte').classList.remove('active');
});

// ══════════════════════════════════════════════════════════════════
// 📋 LOG DE MEJORAS FUTURAS
// ══════════════════════════════════════════════════════════════════
//
// [ ] VISTA EN PLANTA CON CORTE POR NIVEL
//     - Botón Planta abre selector de niveles (IFCBUILDINGSTOREY)
//     - Leer elevación real desde atributo Elevation del IFC
//     - Activar clipping plane horizontal a elevación + offset (1.2m)
//     - Cámara ortogonal desde arriba con fit automático
//     - Botón "Salir" elimina el clipping plane y vuelve a 3D
//
// [ ] VISUALIZACIÓN DE EJES DE GRILLA (IFCGRID)
//     - Parsear IFCGRIDAXIS (ejes U y V) desde el IFC
//     - Dibujar líneas en Three.js con etiquetas (A, B, 1, 2...)
//     - Toggle de visibilidad desde el navegador del modelo
//
// [ ] DIMENSIONES DE ELEMENTOS (BOUNDING BOX)
//     - Mostrar Largo, Ancho, Alto en panel de propiedades ✅ implementado para selección individual
//     - Para selección múltiple: mostrar conteo por categoría (no sumar dimensiones)
//     - Evaluar en el futuro si tiene sentido mostrar bbox combinado o área total
//
// [ ] DIMENSIONES DE ELEMENTOS (QUANTITYSETS)
//     - Leer Qto_WallBaseQuantities, Qto_SlabBaseQuantities, etc.
//     - Mostrar como datos primarios si existen en el modelo
//
// [ ] CORTE DE SECCIÓN (CLIPPING PLANE LIBRE)
//     - Botón ✂️ Corte ya existe en la UI (disabled)
//     - Permitir definir plano de corte en cualquier dirección
//
// [ ] HERRAMIENTA DE MEDICIÓN
//     - Botón 📏 Medir ya existe en la UI (disabled)
//     - Medir distancias entre puntos en el modelo 3D
//
// ══════════════════════════════════════════════════════════════════
