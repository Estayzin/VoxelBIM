import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import * as BUIC from "@thatopen/ui-obc";
import * as THREE from "three";
import Stats from "stats.js";

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
world.renderer.postproduction.enabled = true;

const grid = components.get(OBC.Grids).create(world);
grid.config.color.set(0x0a1e2a);
grid.config.primarySize = 1;
grid.config.secondarySize = 10;
grid.config.visible = false;

const githubUrl = "https://thatopen.github.io/engine_fragment/resources/worker.mjs";
const fetchedUrl = await fetch(githubUrl);
const workerBlob = await fetchedUrl.blob();
const workerFile = new File([workerBlob], "worker.mjs", { type: "text/javascript" });
const workerUrl = URL.createObjectURL(workerFile);
const fragments = components.get(OBC.FragmentsManager);
fragments.init(workerUrl);

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
await ifcLoader.setup({ autoSetWasm: false, wasm: { path: "/web-ifc/", absolute: true } });

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
  espSel.value = _espActual;
  renderReporte(est);
  reportePanel.classList.add('show');
  await ifcLoader.load(new Uint8Array(buffer), false, file.name, { processData: { progressCallback: setProgress } });
  if (world.camera.fitToItems) await world.camera.fitToItems();
};

const dropzone = document.getElementById("dropzone");
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
container.addEventListener("mousemove", async (e) => {
  const model = fragments.list.values().next().value;
  if (!model) return;
  const result = await caster.castRay();
  if (!result) { tooltip.style.display = "none"; return; }
  try {
    const [data] = await model.getItemsData([result.localId]);
    if (!data) { tooltip.style.display = "none"; return; }
    ttClass.textContent = data._category?.value ?? "Desconocido";
    ttName.textContent = data.Name?.value ?? "";
    tooltip.style.display = "block";
    tooltip.style.left = (e.clientX + 14) + "px";
    tooltip.style.top = (e.clientY - 10) + "px";
  } catch { tooltip.style.display = "none"; }
});
container.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });

const highlighter = components.get(OBF.Highlighter);
highlighter.setup({ world });
const propsPanel = document.getElementById("propsPanel");
const propsBody = document.getElementById("propsBody");
const propsEmpty = document.getElementById("propsEmpty");
document.getElementById("propsClose").addEventListener("click", () => {
  propsPanel.classList.remove("show");
  document.getElementById("btnProps").classList.remove("active");
});
const [propsTable, updateProps] = BUIC.tables.itemsData({ components, modelIdMap: {} });
propsTable.preserveStructureOnFilter = true;
propsBody.append(propsTable);
propsBody.style.display = 'none';
highlighter.events.select.onHighlight.add((modelIdMap) => {
  updateProps({ modelIdMap });
  if (propsEmpty) propsEmpty.style.display = 'none';
  propsBody.style.display = 'block';
});
highlighter.events.select.onClear.add(() => {
  updateProps({ modelIdMap: {} });
  if (propsEmpty) propsEmpty.style.display = 'block';
  propsBody.style.display = 'none';
});

const hider = components.get(OBC.Hider);
const isolatedCategories = new Set();

const _setOrbit = () => { world.camera.set("Orbit"); world.camera.projection.set("Perspective"); document.getElementById("btnOrbit").classList.add("active"); document.getElementById("btnPlan").classList.remove("active"); };
const _setPlan = () => { world.camera.set("Plan"); world.camera.projection.set("Orthographic"); document.getElementById("btnPlan").classList.add("active"); document.getElementById("btnOrbit").classList.remove("active"); };
document.getElementById("btnFit").addEventListener("click", () => world.camera.fitToItems());
document.getElementById("btnOrbit").addEventListener("click", _setOrbit);
document.getElementById("btnPlan").addEventListener("click", _setPlan);
document.getElementById("btnFitSb").addEventListener("click", () => world.camera.fitToItems());
document.getElementById("btnOrbitSb").addEventListener("click", _setOrbit);
document.getElementById("btnPlanSb").addEventListener("click", _setPlan);
document.getElementById("btnProps").addEventListener("click", () => {
  propsPanel.classList.toggle("show");
  document.getElementById("btnProps").classList.toggle("active", propsPanel.classList.contains("show"));
});
document.getElementById("btnClip").addEventListener("click", () => {});
document.getElementById("btnMeasure").addEventListener("click", () => {});

let lightMode = false;
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
    const item = document.createElement('div'); item.className = 'model-item';
    const name = document.createElement('span'); name.className = 'model-item-name'; name.textContent = id; name.title = id;
    const toggle = document.createElement('button'); toggle.className = 'model-item-toggle';
    const isVis = loadedModels.get(id)?.visible !== false;
    toggle.textContent = isVis ? '👁' : '🙈';
    toggle.addEventListener('click', async () => {
      const cur = loadedModels.get(id) || { visible: true }; cur.visible = !cur.visible; loadedModels.set(id, cur);
      await hider.set(cur.visible, { [id]: new Set(await getAllIds(model)) });
      toggle.textContent = cur.visible ? '👁' : '🙈';
    });
    item.append(name, toggle); modelsListEl.append(item);
  }
}
fragments.list.onItemSet.add(({ key }) => { loadedModels.set(key, { visible: true }); updateModelsList(); });
fragments.list.onItemDeleted.add(({ key }) => { loadedModels.delete(key); updateModelsList(); });

const stats = new Stats(); stats.showPanel(2); document.body.append(stats.dom);
stats.dom.style.left = "0px"; stats.dom.style.zIndex = "unset";
const sl = stats.dom.querySelector("div:last-child"); if (sl) sl.style.display = "none";
world.renderer.onBeforeUpdate.add(() => stats.begin());
world.renderer.onAfterUpdate.add(() => stats.end());

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
function verificarOrigen(est){const res=[];['IFCSITE','IFCBUILDING'].forEach(tipo=>{for(const id in est.instancias){if(est.instancias[id].cls===tipo){const attrs=splitAttrs(extraerRaw(est.texto,est.instancias[id].pos));const nombre=strVal(attrs[2])||strVal(attrs[1])||'(sin nombre)';let plRef=null;for(let i=3;i<=8&&i<attrs.length;i++){const rid=refId(attrs[i]);if(rid&&est.instancias[rid]&&est.instancias[rid].cls==='IFCLOCALPLACEMENT'){plRef=rid;break;}}let x=null,y=null,z=null;if(plRef){const off=getOffset(plRef,est.instancias,est.texto);if(off){x=off.x;y=off.y;z=off.z;}}res.push({tipo,nombre,x,y,z,ok:x===null||(Math.abs(x)<0.001&&Math.abs(y)<0.001&&Math.abs(z)<0.001)});break;}}});return res;}
function verificarNombres(est){const res=[];[{tipo:'IFCSITE',min:3},{tipo:'IFCBUILDING',min:2}].forEach(cfg=>{for(const id in est.instancias){if(est.instancias[id].cls===cfg.tipo){const attrs=splitAttrs(extraerRaw(est.texto,est.instancias[id].pos));const nombre=strVal(attrs[2])||strVal(attrs[1])||'';res.push({tipo:cfg.tipo,nombre,largo:nombre.length,ok:nombre.length>=cfg.min});break;}}});return res;}
function verificarNiveles(est){const niveles=[];for(const id in est.instancias){if(est.instancias[id].cls==='IFCBUILDINGSTOREY'){const attrs=splitAttrs(extraerRaw(est.texto,est.instancias[id].pos));const nombre=strVal(attrs[2])||strVal(attrs[1])||'';niveles.push({id:'#'+id,nombre,largo:nombre.length,ok:nombre.length>=5});}}return niveles;}
function rpSec(t,b,bc,inner,open){return`<div class="rp-sec"><div class="rp-sec-hdr" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'"><span class="rp-sec-title">${t}</span><span class="rp-badge ${bc}">${b}</span></div><div class="rp-content" style="display:${open?'block':'none'}">${inner}</div></div>`;}

function renderReporte(est) {
  _estActual = est; let html = ''; const conteo = est.conteo;

  // 0. Identificación del modelo
  const espKey0 = Object.keys(ESP).find(k=>ESP[k].cod===_espActual)||'Arquitectura';
  const optsEsp = Object.keys(ESP).map(k =>
    `<option value="${ESP[k].cod}"${ESP[k].cod===_espActual?' selected':''}>${k} (${ESP[k].cod})</option>`
  ).join('');
  html += `<div class="rp-sec">
    <div class="rp-sec-hdr" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
      <span class="rp-sec-title">0. Identificación</span>
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
  if (orig.length) { const ok=orig.every(r=>r.ok); const filas=orig.map(r=>{const c=r.x!==null?`(${[r.x,r.y,r.z].map(v=>(+v).toFixed(3)).join(', ')})`:'N/A';return`<tr><td class="td-name">${r.tipo.charAt(0)+r.tipo.slice(1).toLowerCase()}<div class="td-cls">${esc(r.nombre)}</div></td><td style="font:400 9px var(--mono);color:var(--muted)">${c}</td><td class="td-ok">${r.ok?'<span class="ic-ok">✓</span>':'<span class="ic-err">✗</span>'}</td></tr>`;}).join(''); html+=rpSec('1. Origen (0,0,0)',ok?'OK':'Error',ok?'rp-ok':'rp-err',`<table class="rp-table">${filas}</table>`,!ok); }
  const noms = verificarNombres(est);
  if (noms.length) { const ok=noms.every(r=>r.ok); const filas=noms.map(r=>`<tr><td class="td-name">${r.tipo.charAt(0)+r.tipo.slice(1).toLowerCase()}</td><td style="font:400 9px var(--mono)">"${esc(r.nombre)}" (${r.largo} car.)</td><td class="td-ok">${r.ok?'<span class="ic-ok">✓</span>':'<span class="ic-err">✗</span>'}</td></tr>`).join(''); html+=rpSec('2. Nombres Sitio/Edificio',ok?'OK':'Error',ok?'rp-ok':'rp-err',`<div class="rp-msg">Sitio: ≥3 car. · Edificio: ≥2 car.</div><table class="rp-table">${filas}</table>`,!ok); }
  const nivs = verificarNiveles(est);
  if (nivs.length) { const ok=nivs.every(r=>r.ok); const nOk=nivs.filter(r=>r.ok).length; const filas=nivs.map(r=>`<tr><td class="td-name">${esc(r.nombre||'(sin nombre)')}</td><td style="text-align:center;font:400 9px var(--mono);color:var(--muted)">${r.largo} car.</td><td class="td-ok">${r.ok?'<span class="ic-ok">✓</span>':'<span class="ic-err">✗</span>'}</td></tr>`).join(''); html+=rpSec(`3. Niveles (≥5 car.)`,`${nOk}/${nivs.length} OK`,ok?'rp-ok':nOk>0?'rp-warn':'rp-err',`<table class="rp-table">${filas}</table>`,!ok); }
  const espKey=Object.keys(ESP).find(k=>ESP[k].cod===_espActual)||'Arquitectura'; const espEnts=ESP[espKey].ents;
  let filasP='',filasA='',presentes=0;
  espEnts.forEach(([cls,nom])=>{
    const qty=conteo[cls]||0; if(qty>0)presentes++;
    const ico=IFC_ICO[cls]||''; const isProxy=cls==='IFCBUILDINGELEMENTPROXY';
    const fila=`<tr id="entrow_${cls}" class="ent-row${isProxy?' td-proxy':''}" onclick="window.onEntidadClick('${cls}')"><td class="td-name">${ico} ${nom}<div class="td-cls">${cls.charAt(0)+cls.slice(1).toLowerCase()}</div></td><td class="td-ok">${qty>0?(isProxy?'<span style="color:var(--warn)">⚠</span>':'<span class="ic-ok">✓</span>'):'<span class="ic-err">✗</span>'}</td><td class="td-qty${qty===0?' zero':''}" ${isProxy&&qty>0?'style="color:var(--warn)"':''}>${qty}</td></tr>`;
    if(qty>0)filasP+=fila; else filasA+=fila;
  });
  let filas='';
  if(filasP)filas+=`<tr><td colspan="4" style="padding:3px 10px;font:700 8px var(--mono);color:#00c853;text-transform:uppercase;background:rgba(0,200,83,.05)">✓ Presentes</td></tr>${filasP}`;
  if(filasA)filas+=`<tr><td colspan="4" style="padding:3px 10px;font:700 8px var(--mono);color:var(--muted);text-transform:uppercase;background:rgba(0,0,0,.15)">✗ Ausentes</td></tr>${filasA}`;
  const pct=espEnts.length?Math.round(presentes/espEnts.length*100):0;
  html+=rpSec(`4. Entidades IFC`,`${presentes}/${espEnts.length} presentes`,pct===100?'rp-ok':pct>50?'rp-warn':'rp-err',`<table class="rp-table">${filas}</table>`,true);
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
  const tituloSec = '5. Estructura y Denominación';

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
        inner += `<tr class="tipo-row" id="${rowId}" onclick="window.destacarTipo(${idx},this)" title="Clic para destacar en 3D">
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

window.onEntidadClick = async (cls) => {
  const rowEl = document.getElementById('entrow_' + cls);
  const estaAislada = isolatedCategories.has(cls);
  if (estaAislada) {
    isolatedCategories.delete(cls);
    await hider.set(true);
    if (isolatedCategories.size > 0) {
      const map = {};
      for (const [,model] of fragments.list) { const items=await model.getItemsOfCategories([...isolatedCategories].map(c=>new RegExp(`^${c}$`))); map[model.modelId]=new Set(Object.values(items).flat()); }
      await hider.isolate(map);
    }
    if (rowEl) rowEl.classList.remove('ent-active');
    actualizarSec5(isolatedCategories.size > 0 ? [...isolatedCategories][0] : null);
  } else {
    isolatedCategories.add(cls);
    const map = {};
    for (const [,model] of fragments.list) { const items=await model.getItemsOfCategories([...isolatedCategories].map(c=>new RegExp(`^${c}$`))); map[model.modelId]=new Set(Object.values(items).flat()); }
    await hider.isolate(map);
    if (rowEl) rowEl.classList.add('ent-active');
    actualizarSec5(cls);
  }
};

window.destacarTipo = async (idx, rowEl) => {
  document.querySelectorAll('.tipo-row.tipo-active').forEach(r => r.classList.remove('tipo-active'));
  if (rowEl._tipoActivo) { rowEl._tipoActivo=false; try{await highlighter.clear('select');}catch(e){} return; }
  document.querySelectorAll('.tipo-row').forEach(r => r._tipoActivo=false);
  rowEl._tipoActivo = true;
  rowEl.classList.add('tipo-active');
  const info = window._tiposIdx?.[idx];
  if (!info) return;
  const { cls, fam, tip } = info;
  const modelIdMap = {};
  for (const [,model] of fragments.list) {
    try {
      const items=await model.getItemsOfCategories([new RegExp(`^${cls}$`)]);
      const ids=Object.values(items).flat(); const matching=[];
      for (const localId of ids) {
        const [data]=await model.getItemsData([localId]); if(!data) continue;
        // Buscar elementos con Name = "Familia:Tipo:*" o exactamente "Familia:Tipo"
        const name = data.Name?.value || '';
        const prefijo = `${fam}:${tip}`;
        if (name === prefijo || name.startsWith(prefijo + ':')) matching.push(localId);
      }
      if (matching.length) modelIdMap[model.modelId]=new Set(matching);
    } catch(e){}
  }
  if (Object.keys(modelIdMap).length) try{await highlighter.highlightByID('select',modelIdMap,true,true);}catch(e){}
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
document.getElementById('reporteClose').addEventListener('click', ()=>{ reportePanel.classList.remove('show'); document.getElementById('btnReporte').classList.remove('active'); });
document.getElementById('btnReporte').addEventListener('click', ()=>{ reportePanel.classList.toggle('show'); document.getElementById('btnReporte').classList.toggle('active',reportePanel.classList.contains('show')); });
