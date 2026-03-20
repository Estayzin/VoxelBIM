import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import * as BUIC from "@thatopen/ui-obc";
import Stats from "stats.js";

BUI.Manager.init();

// Escena
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
components.get(OBC.Grids).create(world);

// FragmentsManager
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
});
fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
  if (!("isLodMaterial" in material && material.isLodMaterial)) {
    material.polygonOffset = true;
    material.polygonOffsetUnits = 1;
    material.polygonOffsetFactor = Math.random();
  }
});

// IfcLoader
const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup({ autoSetWasm: false, wasm: { path: "/web-ifc/", absolute: true } });

// UI elementos
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

const setProgress = (v) => {
  const pct = Math.round(v * 100);
  progressFill.style.width = pct + "%";
  progressLabel.textContent = `Convirtiendo IFC... ${pct}%`;
  if (pct >= 100) setTimeout(() => progressWrap.classList.remove("show"), 800);
};

// Cargar IFC
const loadIfc = async (file) => {
  overlay.classList.add("hidden");
  progressWrap.classList.add("show");
  modelName.textContent = file.name;
  modelMeta.textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB`;
  modelInfo.classList.add("show");
  const buffer = await file.arrayBuffer();
  await ifcLoader.load(new Uint8Array(buffer), false, file.name, {
    processData: { progressCallback: setProgress }
  });
  await world.camera.fitToItems ? world.camera.fitToItems() : null;
};

// Dropzone
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

// Raycaster — tooltip hover
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

// Highlighter + Propiedades
const highlighter = components.get(OBF.Highlighter);
highlighter.setup({ world });

const propsPanel = document.getElementById("propsPanel");
const propsBody = document.getElementById("propsBody");
document.getElementById("propsClose").addEventListener("click", () => propsPanel.classList.remove("show"));

const [propsTable, updateProps] = BUIC.tables.itemsData({ components, modelIdMap: {} });
propsTable.preserveStructureOnFilter = true;
propsBody.append(propsTable);

highlighter.events.select.onHighlight.add((modelIdMap) => updateProps({ modelIdMap }));
highlighter.events.select.onClear.add(() => updateProps({ modelIdMap: {} }));

// Hider
const hider = components.get(OBC.Hider);

// Botones de control
document.getElementById("btnFit").addEventListener("click", () => world.camera.fitToItems());
document.getElementById("btnOrbit").addEventListener("click", () => {
  world.camera.set("Orbit");
  document.getElementById("btnOrbit").classList.add("active");
  document.getElementById("btnPlan").classList.remove("active");
});
document.getElementById("btnPlan").addEventListener("click", () => {
  world.camera.set("Plan");
  world.camera.projection.set("Orthographic");
  document.getElementById("btnPlan").classList.add("active");
  document.getElementById("btnOrbit").classList.remove("active");
});
document.getElementById("btnProps").addEventListener("click", () => {
  propsPanel.classList.toggle("show");
});
document.getElementById("btnResetVis").addEventListener("click", async () => {
  await hider.set(true);
});

// Clipper
const clipper = components.get(OBC.Clipper);
let clipperActive = false;
document.getElementById("btnClip").addEventListener("click", () => {
  clipperActive = !clipperActive;
  clipper.enabled = clipperActive;
  document.getElementById("btnClip").classList.toggle("active", clipperActive);
  if (!clipperActive) clipper.deleteAll();
});
container.addEventListener("dblclick", () => {
  if (clipperActive) clipper.create(world);
});
window.addEventListener("keydown", (e) => {
  if ((e.code === "Delete" || e.code === "Backspace") && clipperActive) clipper.delete(world);
});

// Medición
const measurer = components.get(OBF.LengthMeasurement);
measurer.world = world;
let measureActive = false;
document.getElementById("btnMeasure").addEventListener("click", () => {
  measureActive = !measureActive;
  measurer.enabled = measureActive;
  document.getElementById("btnMeasure").classList.toggle("active", measureActive);
  if (!measureActive) measurer.list.clear();
});
container.addEventListener("click", () => { if (measureActive) measurer.create(); });

// Stats
const stats = new Stats();
stats.showPanel(2);
document.body.append(stats.dom);
stats.dom.style.left = "0px";
stats.dom.style.zIndex = "unset";
const sl = stats.dom.querySelector("div:last-child");
if (sl) sl.style.display = "none";
world.renderer.onBeforeUpdate.add(() => stats.begin());
world.renderer.onAfterUpdate.add(() => stats.end());

// ══════════════════════════════════════════
// SISTEMA DE REPORTE BIM (adaptado de explorer.html)
// ══════════════════════════════════════════

const ESP = {
  "Arquitectura":        {cod:"ARQ",ents:[["IFCGRID","Grilla"],["IFCWALL","Muro"],["IFCCURTAINWALL","Muro Cortina"],["IFCWINDOW","Ventana"],["IFCDOOR","Puerta"],["IFCROOF","Cubierta"],["IFCCOVERING","Cielo / Piso"],["IFCSANITARYTERMINAL","Aparato Sanitario"],["IFCRAILING","Baranda"],["IFCFURNITURE","Mobiliario"],["IFCSPACE","Espacio"],["IFCZONE","Zona"]]},
  "Estructural":         {cod:"EST",ents:[["IFCGRID","Grilla"],["IFCBEAM","Viga"],["IFCCOLUMN","Columna"],["IFCFOOTING","Fundacion"],["IFCSLAB","Losa"],["IFCWALL","Muro"]]},
  "Coordinacion":        {cod:"COO",ents:[["IFCGRID","Grilla"],["IFCSITE","Sitio"],["IFCBUILDING","Edificio"],["IFCBUILDINGSTOREY","Nivel"],["IFCSPACE","Espacio"],["IFCWALL","Muro"],["IFCWINDOW","Ventana"],["IFCDOOR","Puerta"],["IFCBEAM","Viga"],["IFCCOLUMN","Columna"],["IFCSLAB","Losa"]]},
  "Agua Potable":        {cod:"APO",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento Tuberia"],["IFCPIPEFITTING","Fitting Tuberia"],["IFCPUMP","Bomba"],["IFCTANK","Estanque"],["IFCVALVE","Valvula"]]},
  "Climatizacion":       {cod:"CLI",ents:[["IFCGRID","Grilla"],["IFCAIRTERMINAL","Terminal Aire"],["IFCDAMPER","Compuerta"],["IFCDUCTFITTING","Fitting Ducto"],["IFCDUCTSEGMENT","Segmento Ducto"],["IFCUNITARYEQUIPMENT","Equipo Unitario"],["IFCPUMP","Bomba"],["IFCCHILLER","Enfriador"],["IFCVALVE","Valvula"]]},
  "Electricidad":        {cod:"ELE",ents:[["IFCGRID","Grilla"],["IFCCABLECARRIERSEGMENT","Bandeja Cable"],["IFCELECTRICDISTRIBUTIONBOARD","Tablero Electrico"]]},
  "Iluminacion":         {cod:"ILU",ents:[["IFCGRID","Grilla"],["IFCLIGHTFIXTURE","Luminaria"],["IFCSWITCHINGDEVICE","Interruptor"]]},
  "Proteccion Incendios":{cod:"PCI",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento Tuberia"],["IFCSENSOR","Sensor"],["IFCPUMP","Bomba"],["IFCFIRESUPPRESSIONTERMINAL","Supresion Incendio"],["IFCALARM","Alarma"],["IFCVALVE","Valvula"]]},
  "Alcantarillado":      {cod:"ALC",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento Tuberia"],["IFCPIPEFITTING","Fitting Tuberia"],["IFCDISTRIBUTIONCHAMBERELEME","Camara Distribucion"]]},
  "Sitio":               {cod:"SIT",ents:[["IFCGRID","Grilla"],["IFCSITE","Sitio"],["IFCSLAB","Losa"],["IFCWALL","Muro"]]},
};

const IFC_ICO = {IFCWALL:"🧱",IFCCURTAINWALL:"🪟",IFCSLAB:"⬜",IFCROOF:"🏠",IFCCOLUMN:"🏛️",IFCBEAM:"📐",IFCFOOTING:"⚓",IFCDOOR:"🚪",IFCWINDOW:"🪟",IFCRAILING:"🔩",IFCSTAIR:"🪜",IFCCOVERING:"🪵",IFCFURNITURE:"🪑",IFCPIPESEGMENT:"💧",IFCPIPEFITTING:"🔧",IFCDUCTSEGMENT:"💨",IFCDUCTFITTING:"🔧",IFCPUMP:"⚙️",IFCTANK:"🛢️",IFCVALVE:"🔩",IFCLIGHTFIXTURE:"💡",IFCSWITCHINGDEVICE:"🔌",IFCELECTRICDISTRIBUTIONBOARD:"⚡",IFCSENSOR:"📡",IFCALARM:"🚨",IFCFIRESUPPRESSIONTERMINAL:"🔥",IFCSITE:"🌍",IFCBUILDING:"🏢",IFCBUILDINGSTOREY:"📊",IFCGRID:"#",IFCSPACE:"🔵"};

function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function extraerRaw(texto,pos){var depth=1,i=pos,out='';while(i<texto.length&&depth>0){var c=texto[i];if(c==='(')depth++;else if(c===')'){depth--;if(!depth)break;}out+=c;i++;}return out;}
function splitAttrs(raw){var attrs=[],depth=0,cur='';for(var i=0;i<raw.length;i++){var c=raw[i];if(c==='('||c==='['){depth++;cur+=c;}else if(c===')'||c===']'){depth--;cur+=c;}else if(c===','&&depth===0){attrs.push(cur.trim());cur='';}else cur+=c;}if(cur.trim())attrs.push(cur.trim());return attrs;}
function strVal(a){if(!a||a==='$'||a==='*')return null;var m=a.match(/^'(.*)'$/);return m?m[1]:a;}
function refId(a){if(!a)return null;var m=a.match(/^#(\d+)$/);return m?m[1]:null;}

function parsearIFC(texto) {
  var conteo={},instancias={},schema='IFC2X3',proy='—';
  var re=/#(\d+)\s*=\s*(IFC[A-Z0-9]+)\s*\(/g,m;
  while((m=re.exec(texto))!==null){
    var id=m[1],cls=m[2];
    instancias[id]={cls:cls,pos:m.index+m[0].length};
    conteo[cls]=(conteo[cls]||0)+1;
  }
  var ms=texto.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/);if(ms)schema=ms[1];
  var mp=texto.match(/IFCPROJECT\s*\([^,]*,[^,]*,\s*'([^']*)'/);if(mp)proy=mp[1];
  var tipos=[];
  var reTipo=/#(\d+)\s*=\s*(IFC[A-Z0-9]*TYPE[A-Z0-9]*)\s*\(/g,mt;
  while((mt=reTipo.exec(texto))!==null){
    var tpos=mt.index+mt[0].length,traw=extraerRaw(texto,tpos),tattrs=splitAttrs(traw);
    var nombre=strVal(tattrs[2])||strVal(tattrs[1])||'(sin nombre)';
    tipos.push({id:'#'+mt[1],cls:mt[2],nombre:nombre});
  }
  var elemsPorNivel={};
  var reRel=/#(\d+)\s*=\s*IFCRELCONTAINEDINSPATIALSTRUCTURE\s*\(/g,mr;
  while((mr=reRel.exec(texto))!==null){
    var rpos=mr.index+mr[0].length,rraw=extraerRaw(texto,rpos),rattrs=splitAttrs(rraw);
    var nivelRef=refId(rattrs[5]);
    if(!nivelRef)continue;
    var ids=(rattrs[4]||'').replace(/[\(\)]/g,'').split(',').map(function(s){return refId(s.trim());}).filter(Boolean);
    elemsPorNivel[nivelRef]=ids;
  }
  return{conteo,instancias,schema,proy,texto,tipos,elemsPorNivel};
}

function getPuntoCartesiano(ptRef,instancias,texto){
  if(!ptRef||!instancias[ptRef]||instancias[ptRef].cls!=='IFCCARTESIANPOINT')return null;
  var raw=extraerRaw(texto,instancias[ptRef].pos);
  var coords=raw.replace(/[\(\)]/g,'').split(',').map(function(v){return parseFloat(v)||0;});
  return{x:coords[0]||0,y:coords[1]||0,z:coords[2]||0};
}

function getPlacementOffset(plRef,instancias,texto){
  if(!plRef||!instancias[plRef])return null;
  var lpRaw=extraerRaw(texto,instancias[plRef].pos),lpAttrs=splitAttrs(lpRaw);
  var ap3d=null;
  for(var i=0;i<lpAttrs.length;i++){
    var rid=refId(lpAttrs[i]);
    if(rid&&instancias[rid]&&(instancias[rid].cls==='IFCAXIS2PLACEMENT3D'||instancias[rid].cls==='IFCAXIS2PLACEMENT2D')){ap3d=rid;break;}
  }
  if(!ap3d)return null;
  var apRaw=extraerRaw(texto,instancias[ap3d].pos),apAttrs=splitAttrs(apRaw);
  return getPuntoCartesiano(refId(apAttrs[0]),instancias,texto);
}

function verificarOrigen(est){
  var res=[];
  ['IFCSITE','IFCBUILDING'].forEach(function(tipo){
    for(var id in est.instancias){
      if(est.instancias[id].cls===tipo){
        var raw=extraerRaw(est.texto,est.instancias[id].pos),attrs=splitAttrs(raw);
        var nombre=strVal(attrs[2])||strVal(attrs[1])||'(sin nombre)';
        var plRef=null;
        for(var i=3;i<=8&&i<attrs.length;i++){var rid=refId(attrs[i]);if(rid&&est.instancias[rid]&&est.instancias[rid].cls==='IFCLOCALPLACEMENT'){plRef=rid;break;}}
        var x=null,y=null,z=null;
        if(plRef){
          var offset=getPlacementOffset(plRef,est.instancias,est.texto);
          if(offset){x=offset.x;y=offset.y;z=offset.z;}
        }
        var ok=x===null||(Math.abs(x)<0.001&&Math.abs(y)<0.001&&Math.abs(z)<0.001);
        res.push({tipo,nombre,x,y,z,ok});break;
      }
    }
  });
  return res;
}

function verificarNombres(est){
  var res=[];
  [{tipo:'IFCSITE',min:3},{tipo:'IFCBUILDING',min:2}].forEach(function(cfg){
    for(var id in est.instancias){
      if(est.instancias[id].cls===cfg.tipo){
        var raw=extraerRaw(est.texto,est.instancias[id].pos),attrs=splitAttrs(raw);
        var nombre=strVal(attrs[2])||strVal(attrs[1])||'';
        res.push({tipo:cfg.tipo,nombre,largo:nombre.length,ok:nombre.length>=cfg.min});break;
      }
    }
  });
  return res;
}

function verificarNiveles(est){
  var niveles=[];
  for(var id in est.instancias){
    if(est.instancias[id].cls==='IFCBUILDINGSTOREY'){
      var raw=extraerRaw(est.texto,est.instancias[id].pos),attrs=splitAttrs(raw);
      var nombre=strVal(attrs[2])||strVal(attrs[1])||'';
      niveles.push({id:'#'+id,nombre,largo:nombre.length,ok:nombre.length>=5});
    }
  }
  return niveles;
}

function rpSec(titulo, badge, badgeCls, innerHtml, openDefault) {
  const id = 'rps_' + Math.random().toString(36).slice(2);
  return `
    <div class="rp-sec">
      <div class="rp-sec-hdr" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
        <span class="rp-sec-title">${titulo}</span>
        <span class="rp-badge ${badgeCls}">${badge}</span>
      </div>
      <div class="rp-content" style="display:${openDefault?'block':'none'}">${innerHtml}</div>
    </div>`;
}
