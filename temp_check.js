
/* â•â•â• ESTADO GLOBAL â•â•â• */
var FILES = [], sbFilter = 'all', currentFile = null;
var wireMode = false, ghostMode = false, reporteVisible = false;
var renderer3, scene, camera, controls, raycaster, mouse;
var meshes = [], selectedMesh = null;

/* â•â•â• UTILIDADES â•â•â• */
function ext(n){ return (n.split('.').pop()||'').toLowerCase(); }
function tipo(e){ return 'ifc'; }
function fmtSize(b){ return b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(1)+' MB'; }
function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function badgeCls(e){ return 'badge-ifc'; }
function icon(e){ return 'ðŸ“¦'; }

/* â•â•â• ARCHIVOS â•â•â• */
function agregarArchivos(list){
  Array.from(list).forEach(function(f){
    var e=ext(f.name);
    if(e !== 'ifc') return;
    var idx=FILES.findIndex(function(x){return x.name===f.name});
    if(idx>=0){URL.revokeObjectURL(FILES[idx].url);FILES.splice(idx,1);}
    FILES.push({id:Date.now()+Math.random(),name:f.name,ext:e,tipo:tipo(e),size:f.size,url:URL.createObjectURL(f),file:f});
  });
  renderSidebar();
}

/* â•â•â• SIDEBAR â•â•â• */
function renderSidebar(){
  var q=(document.getElementById('sbSearch').value||'').toLowerCase();
  var shown=FILES.filter(function(f){return (sbFilter==='all'||f.tipo===sbFilter)&&(!q||f.name.toLowerCase().includes(q));});
  var list=document.getElementById('sbList');
  if(!shown.length){list.innerHTML='<div class="sb-empty"><span class="sb-empty-icon">ðŸ“‚</span><div class="sb-empty-text">'+(q?'Sin resultados.':'Sin archivos.')+'</div></div>';return;}
  var grupos={};
  shown.forEach(function(f){var g='Modelos 3D';if(!grupos[g])grupos[g]=[];grupos[g].push(f);});
  var html='';
  Object.keys(grupos).forEach(function(g){
    html+='<div class="sb-section">'+g+'</div>';
    grupos[g].forEach(function(f){
      var active=currentFile&&currentFile.id===f.id?' active':'';
      html+='<div class="sb-item'+active+'" onclick="selectFile(\''+f.id+'\')">'+
        '<div class="sb-item-icon">'+icon(f.ext)+'</div>'+
        '<div class="sb-item-info"><div class="sb-item-name">'+esc(f.name)+'</div>'+
        '<div class="sb-item-meta">'+fmtSize(f.size)+' Â· '+f.ext.toUpperCase()+'</div></div>'+
        '<div class="sb-item-badge '+badgeCls(f.ext)+'">'+f.ext.toUpperCase()+'</div>'+
        '<button class="sb-item-del" onclick="eliminar(event,\''+f.id+'\')">âœ•</button></div>';
    });
  });
  list.innerHTML=html;
}
function sbTab(el,filter){document.querySelectorAll('.sb-tab').forEach(function(t){t.classList.remove('active')});el.classList.add('active');sbFilter=filter;renderSidebar();}
function eliminar(e,id){
  e.stopPropagation();
  var f=FILES.find(function(x){return String(x.id)===String(id)});if(!f)return;
  URL.revokeObjectURL(f.url);FILES=FILES.filter(function(x){return String(x.id)!==String(id)});
  if(currentFile&&currentFile.id===f.id){currentFile=null;limpiarVisor();}
  renderSidebar();
}
function selectFile(id){
  var f=FILES.find(function(x){return String(x.id)===String(id)});if(!f)return;
  viewTab('v3d');cargarIFC(f);
}

/* â•â•â• TABS â•â•â• */
function viewTab(id){
  document.querySelectorAll('.view-panel').forEach(function(p){p.classList.remove('active')});
  document.querySelectorAll('.view-tab').forEach(function(t){t.classList.remove('active')});
  document.getElementById(id).classList.add('active');
  document.getElementById('tab3d').classList.add('active');
}

/* â•â•â• THREE.JS â•â•â• */
function initViewer(){
  var canvas=document.getElementById('viewerCanvas');
  var area=document.getElementById('viewerArea');
  renderer3=new THREE.WebGLRenderer({canvas:canvas,antialias:true});
  renderer3.setPixelRatio(window.devicePixelRatio);
  renderer3.setClearColor(0x050b14,1);
  var w=area.clientWidth,h=area.clientHeight;
  renderer3.setSize(w,h);
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(45,w/h,0.01,10000);
  camera.position.set(20,15,20);
  controls=new THREE.OrbitControls(camera,renderer3.domElement);
  controls.enableDamping=true;controls.dampingFactor=0.07;controls.screenSpacePanning=true;
  scene.add(new THREE.AmbientLight(0xffffff,0.55));
  var dir=new THREE.DirectionalLight(0xffffff,0.9);dir.position.set(50,100,50);scene.add(dir);
  var dir2=new THREE.DirectionalLight(0x8080ff,0.25);dir2.position.set(-50,-30,-50);scene.add(dir2);
  scene.add(new THREE.GridHelper(200,100,0x1a2a40,0x1a2a40));
  raycaster=new THREE.Raycaster();mouse=new THREE.Vector2();
  canvas.addEventListener('click',onCanvasClick);
  window.addEventListener('resize',onResize);
  (function animate(){requestAnimationFrame(animate);controls.update();renderer3.render(scene,camera);})();
}
function onResize(){
  var area=document.getElementById('viewerArea');
  renderer3.setSize(area.clientWidth,area.clientHeight);
  camera.aspect=area.clientWidth/area.clientHeight;camera.updateProjectionMatrix();
}


/* â•â•â• PARSER IFC + VERIFICACIONES â•â•â• */
var CAT_COLORS={IFCWALL:[0.55,0.72,0.95],IFCWALLSTANDARDCASE:[0.55,0.72,0.95],IFCSLAB:[0.65,0.65,0.82],IFCCOLUMN:[1.0,0.82,0.35],IFCBEAM:[1.0,0.65,0.25],IFCDOOR:[0.3,0.95,0.65],IFCWINDOW:[0.3,0.92,1.0],IFCROOF:[0.82,0.45,0.45],IFCSPACE:[0.4,0.8,0.5],IFCSTAIR:[0.9,0.7,0.4],IFCFURNISHINGELEMENT:[0.8,0.6,0.95],DEFAULT:[0.5,0.62,0.72]};

/* â”€â”€ Especialidades (listado oficial) â”€â”€ */
var ESP={
  "Coordinacion"        :{cod:"COO",ents:[["IFCGRID","Grilla"],["IFCSITE","Sitio"],["IFCBUILDING","Edificio"],["IFCBUILDINGSTOREY","Nivel"],["IFCSPACE","Espacio"],["IFCZONE","Zona"],["IFCWALL","Muro"],["IFCCURTAINWALL","Muro Cortina"],["IFCWINDOW","Ventana"],["IFCDOOR","Puerta"],["IFCROOF","Cubierta"],["IFCCOVERING","Cielo Falso / Piso"],["IFCBEAM","Viga"],["IFCCOLUMN","Columna"],["IFCFOOTING","Fundacion"],["IFCSLAB","Losa"],["IFCSTAIR","Escalera"],["IFCRAMP","Rampa"],["IFCRAILING","Baranda"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCDUCTSEGMENT","Segmento de Ducto"],["IFCDUCTFITTING","Fitting de Ducto"],["IFCCABLECARRIERSEGMENT","Bandeja de Cable"],["IFCCABLECARRIERFITTING","Fitting Bandeja de Cable"],["IFCELECTRICDISTRIBUTIONBOARD","Tablero Electrico"],["IFCAIRTERMINAL","Terminal de Aire"],["IFCDAMPER","Compuerta"],["IFCPUMP","Bomba"],["IFCTANK","Estanque"],["IFCVALVE","Valvula"],["IFCLIGHTFIXTURE","Luminaria"],["IFCSENSOR","Sensor"],["IFCFIRESUPPRESSIONTERMINAL","Terminal Supresion Incendio"],["IFCALARM","Alarma"],["IFCMEDICALDEVICE","Dispositivo Medico"],["IFCFURNITURE","Mobiliario"],["IFCTRANSPORTELEMENT","Elemento de Transporte"],["IFCSANITARYTERMINAL","Aparato Sanitario"],["IFCWASTETERMINAL","Terminal de Residuos"],["IFCOUTLET","Salida Electrica"],["IFCSWITCHINGDEVICE","Interruptor"],["IFCUNITARYEQUIPMENT","Equipo Unitario"],["IFCCHILLER","Enfriador"],["IFCDISTRIBUTIONCHAMBERELEME","Camara de Distribucion"],["IFCDISTRIBUTIONELEMENT","Elemento de Distribucion"],["IFCAUDIOVISUALAPPLIANCE","Equipo Audiovisual"],["IFCCOMMUNICATIONSAPPLIANCE","Equipo de Comunicaciones"]]},
  "Sitio"               :{cod:"SIT",ents:[["IFCGRID","Grilla"],["IFCSITE","Sitio"],["IFCCIVILELEMENT","Elemento Civil"],["IFCGEOGRAPHICELEMENT","Elemento Geografico"],["IFCSLAB","Losa"],["IFCWALL","Muro"]]},
  "Arquitectura"        :{cod:"ARQ",ents:[["IFCGRID","Grilla"],["IFCWALL","Muro"],["IFCCURTAINWALL","Muro Cortina"],["IFCWINDOW","Ventana"],["IFCDOOR","Puerta"],["IFCROOF","Cubierta"],["IFCCOVERING","Cielo Falso / Piso"],["IFCSANITARYTERMINAL","Aparato Sanitario"],["IFCRAILING","Baranda"],["IFCFURNITURE","Mobiliario"],["IFCVALVE","Valvula"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCWASTETERMINAL","Terminal de Residuos"],["IFCTRANSPORTELEMENT","Elemento de Transporte"],["IFCSPACE","Espacio"],["IFCZONE","Zona"]]},
  "Volumetrico"         :{cod:"VOL",ents:[["IFCGRID","Grilla"],["IFCZONE","Zona"],["IFCSPACE","Espacio"]]},
  "Estructural"         :{cod:"EST",ents:[["IFCGRID","Grilla"],["IFCBEAM","Viga"],["IFCCOLUMN","Columna"],["IFCFOOTING","Fundacion"],["IFCSLAB","Losa"],["IFCWALL","Muro"]]},
  "Agua Potable"        :{cod:"APO",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCPUMP","Bomba"],["IFCTANK","Estanque"],["IFCVALVE","Valvula"]]},
  "Aguas Tratadas"      :{cod:"ATR",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCPUMP","Bomba"],["IFCTANK","Estanque"],["IFCVALVE","Valvula"]]},
  "Alcantarillado"      :{cod:"ALC",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCDISTRIBUTIONCHAMBERELEME","Camara de Distribucion"]]},
  "Corrientes Debiles"  :{cod:"CEC",ents:[["IFCGRID","Grilla"],["IFCCABLECARRIERSEGMENT","Bandeja de Cable"],["IFCCABLECARRIERFITTING","Fitting Bandeja de Cable"],["IFCDISTRIBUTIONCHAMBERELEME","Camara de Distribucion"],["IFCOUTLET","Salida Electrica"],["IFCSENSOR","Sensor"],["IFCAUDIOVISUALAPPLIANCE","Equipo Audiovisual"],["IFCCOMMUNICATIONSAPPLIANCE","Equipo de Comunicaciones"],["IFCELECTRICDISTRIBUTIONBOARD","Tablero Electrico"]]},
  "Climatizacion"       :{cod:"CLI",ents:[["IFCGRID","Grilla"],["IFCAIRTERMINAL","Terminal de Aire"],["IFCDAMPER","Compuerta"],["IFCDUCTFITTING","Fitting de Ducto"],["IFCDUCTSEGMENT","Segmento de Ducto"],["IFCUNITARYEQUIPMENT","Equipo Unitario"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCPUMP","Bomba"],["IFCSOLARDEVICE","Equipo Solar"],["IFCTANK","Estanque"],["IFCCHILLER","Enfriador"],["IFCVALVE","Valvula"]]},
  "Combustible"         :{cod:"COM",ents:[["IFCGRID","Grilla"],["IFCTANK","Estanque"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCVALVE","Valvula"]]},
  "Control Centralizado":{cod:"CCT",ents:[["IFCGRID","Grilla"],["IFCELECTRICDISTRIBUTIONBOARD","Tablero Electrico"],["IFCDISTRIBUTIONCONTROLELEMENT","Elemento de Control"]]},
  "Correo Neumatico"    :{cod:"COR",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCDISTRIBUTIONELEMENT","Elemento de Distribucion"]]},
  "Aguas Lluvias"       :{cod:"ALL",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCDISTRIBUTIONCHAMBERELEME","Camara de Distribucion"]]},
  "Gases Clinicos"      :{cod:"GCL",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCVALVE","Valvula"],["IFCUNITARYCONTROLELEMENT","Elemento de Control Unitario"],["IFCTANK","Estanque"],["IFCMEDICALDEVICE","Dispositivo Medico"]]},
  "Iluminacion"         :{cod:"ILU",ents:[["IFCGRID","Grilla"],["IFCLIGHTFIXTURE","Luminaria"],["IFCSWITCHINGDEVICE","Interruptor"]]},
  "Proteccion Incendios":{cod:"PCI",ents:[["IFCGRID","Grilla"],["IFCPIPESEGMENT","Segmento de Tuberia"],["IFCPIPEFITTING","Fitting de Tuberia"],["IFCSENSOR","Sensor"],["IFCTANK","Estanque"],["IFCPUMP","Bomba"],["IFCFIRESUPPRESSIONTERMINAL","Terminal Supresion Incendio"],["IFCALARM","Alarma"],["IFCVALVE","Valvula"]]},
  "Electricidad"        :{cod:"ELE",ents:[["IFCGRID","Grilla"],["IFCCABLECARRIERSEGMENT","Bandeja de Cable"],["IFCCABLECARRIERFITTING","Fitting Bandeja de Cable"],["IFCDISTRIBUTIONCHAMBERELEME","Camara de Distribucion"],["IFCELECTRICDISTRIBUTIONBOARD","Tablero Electrico"]]}
};

/* Adaptar ESP al formato ENTS_POR_ESP[cod] para compatibilidad */
var ENTS_POR_ESP={};
for(var k in ESP){ ENTS_POR_ESP[ESP[k].cod]=ESP[k].ents; }

var LABEL_ESP={};
for(var k in ESP){ LABEL_ESP[ESP[k].cod]=k; }
var _espActual='ARQ';
var _estActual=null;

var COD_PRIO={SIT:1,VOL:1};
function detectarEspecialidad(nombre){
  var upper=(nombre||'').toUpperCase();
  var partes=upper.split(/[_\-\s\.]+/);
  for(var i=0;i<partes.length;i++){
    for(var k in ESP){if(ESP[k].cod===partes[i])return ESP[k].cod;}
  }
  var prioCod=null;
  for(var k in ESP){
    var cod=ESP[k].cod;
    if(upper.indexOf(cod)!==-1){
      if(COD_PRIO[cod]){prioCod=cod;break;}
      if(!prioCod)prioCod=cod;
    }
  }
  return prioCod||'ARQ';
}

function cambiarEsp(val){
  _espActual=val;
  if(_estActual) renderReporte(_estActual);
}

function parsearIFC(texto){
  var conteo={},instancias={},schema='IFC2X3',proy='â€”';
  var re=/#(\d+)\s*=\s*(IFC[A-Z0-9]+)\s*\(/g,m;
  while((m=re.exec(texto))!==null){
    var id=m[1],cls=m[2];
    instancias[id]={cls:cls,pos:m.index+m[0].length};
    conteo[cls]=(conteo[cls]||0)+1;
  }
  var ms=texto.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/);if(ms)schema=ms[1];
  var mp=texto.match(/IFCPROJECT\s*\([^,]*,[^,]*,\s*'([^']*)'/);if(mp)proy=mp[1];

  /* Extraer familias/tipos: IFCTYPEPRODUCT y subtipos */
  var tipos=[];
  var reTipo=/#(\d+)\s*=\s*(IFC[A-Z0-9]*TYPE[A-Z0-9]*)\s*\(/g,mt;
  while((mt=reTipo.exec(texto))!==null){
    var tid=mt[1],tcls=mt[2];
    var tpos=mt.index+mt[0].length;
    var traw=extraerRaw(texto,tpos),tattrs=splitAttrs(traw);
    var nombre=strVal(tattrs[2])||strVal(tattrs[1])||'(sin nombre)';
    tipos.push({id:'#'+tid,cls:tcls,nombre:nombre});
  }

  /* IFCRELCONTAINEDINSPATIALSTRUCTURE â†’ elementos por nivel */
  var elemsPorNivel={};
  var reRel=/#(\d+)\s*=\s*IFCRELCONTAINEDINSPATIALSTRUCTURE\s*\(/g,mr;
  while((mr=reRel.exec(texto))!==null){
    var rpos=mr.index+mr[0].length;
    var rraw=extraerRaw(texto,rpos),rattrs=splitAttrs(rraw);
    /* attr[4]=lista de elementos, attr[5]=nivel */
    var listaRaw=rattrs[4]||'',nivelRef=refId(rattrs[5]);
    if(!nivelRef)continue;
    var ids=listaRaw.replace(/[\(\)]/g,'').split(',').map(function(s){return refId(s.trim());}).filter(Boolean);
    elemsPorNivel[nivelRef]=ids;
  }

  /* IFCRELDEFINESBYTYPE â†’ elementos por tipo */
  var elemsPorTipo={};
  var reRDT=/#(\d+)\s*=\s*IFCRELDEFINESBYTYPE\s*\(/g,mrt;
  while((mrt=reRDT.exec(texto))!==null){
    var rtpos=mrt.index+mrt[0].length;
    var rtraw=extraerRaw(texto,rtpos),rtattrs=splitAttrs(rtraw);
    var listaRawT=rtattrs[4]||'',tipoRef=refId(rtattrs[5]);
    if(!tipoRef)continue;
    var idsT=listaRawT.replace(/[\(\)]/g,'').split(',').map(function(s){return refId(s.trim());}).filter(Boolean);
    elemsPorTipo[tipoRef]=idsT;
  }

  return{conteo:conteo,instancias:instancias,schema:schema,proy:proy,texto:texto,tipos:tipos,elemsPorNivel:elemsPorNivel,elemsPorTipo:elemsPorTipo};
}

function extraerRaw(texto,pos){var depth=1,i=pos,out='';while(i<texto.length&&depth>0){var c=texto[i];if(c==='(')depth++;else if(c===')'){depth--;if(!depth)break;}out+=c;i++;}return out;}
function splitAttrs(raw){var attrs=[],depth=0,cur='';for(var i=0;i<raw.length;i++){var c=raw[i];if(c==='('||c==='['){depth++;cur+=c;}else if(c===')'||c===']'){depth--;cur+=c;}else if(c===','&&depth===0){attrs.push(cur.trim());cur='';}else cur+=c;}if(cur.trim())attrs.push(cur.trim());return attrs;}
function strVal(a){if(!a||a==='$'||a==='*')return null;var m=a.match(/^'(.*)'$/);return m?m[1]:a;}
function refId(a){if(!a)return null;var m=a.match(/^#(\d+)$/);return m?m[1]:null;}

function getCoordenadas(inst,instancias,texto){
  if(!inst)return null;
  var raw=extraerRaw(texto,inst.pos),attrs=splitAttrs(raw),plRef=null;
  for(var i=3;i<=6&&i<attrs.length;i++){var rid=refId(attrs[i]);if(rid&&instancias[rid]&&instancias[rid].cls==='IFCLOCALPLACEMENT'){plRef=rid;break;}}
  if(!plRef)return null;
  var lpRaw=extraerRaw(texto,instancias[plRef].pos),lpAttrs=splitAttrs(lpRaw),ap3d=null;
  for(var i=0;i<lpAttrs.length;i++){var rid=refId(lpAttrs[i]);if(rid&&instancias[rid]&&instancias[rid].cls==='IFCAXIS2PLACEMENT3D'){ap3d=rid;break;}}
  if(!ap3d)return null;
  var apRaw=extraerRaw(texto,instancias[ap3d].pos),apAttrs=splitAttrs(apRaw),ptRef=refId(apAttrs[0]);
  if(!ptRef||!instancias[ptRef]||instancias[ptRef].cls!=='IFCCARTESIANPOINT')return null;
  var ptRaw=extraerRaw(texto,instancias[ptRef].pos);
  var coords=ptRaw.replace(/[\(\)]/g,'').split(',').map(function(v){return parseFloat(v)||0;});
  return{x:coords[0]||0,y:coords[1]||0,z:coords[2]||0};
}

function verificarOrigen(est){
  var res=[];
  ['IFCSITE','IFCBUILDING'].forEach(function(tipo){
    for(var id in est.instancias){
      if(est.instancias[id].cls===tipo){
        var coords=getCoordenadas(est.instancias[id],est.instancias,est.texto);
        var raw=extraerRaw(est.texto,est.instancias[id].pos),attrs=splitAttrs(raw);
        var nombre=strVal(attrs[2])||strVal(attrs[1])||'(sin nombre)';
        var x=coords?coords.x:null,y=coords?coords.y:null,z=coords?coords.z:null;
        res.push({tipo:tipo,nombre:nombre,x:x,y:y,z:z,ok:x===0&&y===0&&z===0});break;
      }
    }
  });
  return res;
}

function verificarNombres(est){
  var res=[];
  [{t:'IFCSITE',n:3},{t:'IFCBUILDING',n:2}].forEach(function(r){
    for(var id in est.instancias){
      if(est.instancias[id].cls===r.t){
        var raw=extraerRaw(est.texto,est.instancias[id].pos),attrs=splitAttrs(raw);
        var nombre=strVal(attrs[2])||strVal(attrs[1])||'';
        res.push({tipo:r.t,nombre:nombre,largo:nombre.length,esperado:r.n,ok:nombre.length===r.n});break;
      }
    }
  });
  return res;
}

function verificarNiveles(est){
  var res=[];
  for(var id in est.instancias){
    if(est.instancias[id].cls==='IFCBUILDINGSTOREY'){
      var raw=extraerRaw(est.texto,est.instancias[id].pos),attrs=splitAttrs(raw);
      var nombre=strVal(attrs[2])||strVal(attrs[1])||'';
      res.push({id:'#'+id,nombre:nombre,largo:nombre.length,ok:nombre.length===5});
    }
  }
  return res;
}


/* â•â•â• RENDER REPORTE â•â•â• */
function rpSec(title,badge,badgeCls,bodyHtml,openDefault){
  var uid='rps'+Math.random().toString(36).substr(2,5);
  var arr=openDefault?'â–¾':'â–¸';
  var bodyStyle=openDefault?'':'display:none';
  return '<div class="rp-sec">'+
    '<div class="rp-sec-hdr" onclick="rpToggle(\''+uid+'\')">'+
    '<span class="rp-sec-title">'+title+'</span>'+
    '<span class="rp-badge '+badgeCls+'">'+badge+'</span>'+
    '&nbsp;<span class="rp-arr" id="arr_'+uid+'">'+arr+'</span>'+
    '</div>'+
    '<div class="rp-content" id="'+uid+'" style="'+bodyStyle+'">'+bodyHtml+'</div>'+
    '</div>';
}
function rpToggle(uid){
  var el=document.getElementById(uid),arr=document.getElementById('arr_'+uid);
  var open=el.style.display==='none';
  el.style.display=open?'':'none';
  arr.textContent=open?'â–¾':'â–¸';
}

/* â”€â”€ Destacar elementos en 3D â”€â”€ */
var _claseDestacada=null;

function destacar3D(clases){
  /* clases: array de strings IFC o null para resetear */
  if(!meshes.length)return;
  if(!clases||!clases.length){
    _claseDestacada=null;
    meshes.forEach(function(m){
      m.material.color.copy(m.userData.baseColor);
      m.material.opacity=1;m.material.transparent=false;
    });
    return;
  }
  _claseDestacada=clases;
  meshes.forEach(function(m){
    var activo=clases.indexOf(m.userData.cls)>=0;
    if(activo){
      m.material.color.copy(m.userData.baseColor);
      m.material.opacity=1;m.material.transparent=false;
    } else {
      m.material.color.set(0x1a2a40);
      m.material.opacity=0.18;m.material.transparent=true;
    }
  });
}

function rpSelRow(tr,clases){
  /* Marca fila activa y destaca en 3D; clic de nuevo resetea */
  var eraActiva=tr.classList.contains('rp-active');
  document.querySelectorAll('.rp-active').forEach(function(r){r.classList.remove('rp-active');});
  if(eraActiva){
    destacar3D(null);
  } else {
    tr.classList.add('rp-active');
    destacar3D(clases);
  }
}

function renderReporte(est){
  _estActual=est;
  var html='';
  var conteo=est.conteo;

  /* 1. Origen */
  var orig=verificarOrigen(est);
  if(orig.length){
    var origOk=orig.every(function(r){return r.ok;});
    var origFilas=orig.map(function(r){
      var coords=r.x!==null?'('+[r.x,r.y,r.z].map(function(v){return(+v).toFixed(3);}).join(', ')+'  )':'N/A';
      return '<tr>'+
        '<td class="td-name">'+r.tipo.charAt(0)+r.tipo.slice(1).toLowerCase()+'<div class="td-cls">'+esc(r.nombre)+'</div></td>'+
        '<td style="font:400 9px var(--mono);color:var(--muted)">'+coords+'</td>'+
        '<td class="td-ok">'+(r.ok?'<span class="ic-ok">âœ“</span>':'<span class="ic-err">âœ—</span>')+'</td>'+
        '</tr>';
    }).join('');
    html+=rpSec('1.Origen (0,0,0)',origOk?'OK':'Error',origOk?'rp-ok':'rp-err',
      '<table class="rp-table">'+origFilas+'</table>',!origOk);
  }

  /* 2. Nombres Sitio/Edificio */
  var noms=verificarNombres(est);
  if(noms.length){
    var nomsOk=noms.every(function(r){return r.ok;});
    var nomsFilas=noms.map(function(r){
      return '<tr>'+
        '<td class="td-name">'+r.tipo.charAt(0)+r.tipo.slice(1).toLowerCase()+'</td>'+
        '<td style="font:400 9px var(--mono)">"'+esc(r.nombre)+'" ('+r.largo+' car.)</td>'+
        '<td class="td-ok">'+(r.ok?'<span class="ic-ok">âœ“</span>':'<span class="ic-err">âœ—</span>')+'</td>'+
        '</tr>';
    }).join('');
    html+=rpSec('2.Nombres Sitio/Edificio',nomsOk?'OK':'Error',nomsOk?'rp-ok':'rp-err',
      '<div class="rp-msg" style="color:var(--muted);padding-bottom:0">Sitio: 3 car. Â· Edificio: 2 car.</div>'+
      '<table class="rp-table">'+nomsFilas+'</table>',!nomsOk);
  }

  /* 3. Niveles */
  var nivs=verificarNiveles(est);
  if(nivs.length){
    var nivsOk=nivs.every(function(r){return r.ok;});
    var nOk=nivs.filter(function(r){return r.ok;}).length;
    var nivsFilas=nivs.map(function(r){
      var ids=est.elemsPorNivel[r.id.replace('#','')]||[];
      /* obtener clases Ãºnicas de los elementos del nivel */
      var clases=ids.map(function(id){return est.instancias[id]?est.instancias[id].cls:null;}).filter(function(c,i,a){return c&&a.indexOf(c)===i;});
      var clasesJson=JSON.stringify(clases).replace(/"/g,"'").replace(/'/g,"\\'");
      return '<tr class="rp-row-sel" onclick="rpSelRow(this,'+JSON.stringify(clases)+')" title="Clic para destacar en 3D">'+
        '<td class="td-name">'+esc(r.nombre||'(sin nombre)')+'</td>'+
        '<td style="text-align:center;font:400 9px var(--mono);color:var(--muted)">'+r.largo+' car.</td>'+
        '<td class="td-ok">'+(r.ok?'<span class="ic-ok">âœ“</span>':'<span class="ic-err">âœ—</span>')+
        ' <span style="font:400 8px var(--mono);color:var(--muted)">'+ids.length+'&#9656;</span></td>'+
        '</tr>';
    }).join('');
    html+=rpSec('3.Niveles (5 car.)',nOk+'/'+nivs.length+' OK',nivsOk?'rp-ok':nOk>0?'rp-warn':'rp-err',
      '<table class="rp-table">'+nivsFilas+'</table>',!nivsOk);
  }

  /* 4. Entidades IFC */
  var espEnts=ENTS_POR_ESP[_espActual]||ENTS_POR_ESP.ARQ;
  var filas='',totalEnts=0,presentes=0;
  espEnts.forEach(function(e){
    var cls=e[0],nom=e[1],qty=conteo[cls]||0;
    if(qty>0)presentes++;
    totalEnts+=qty;
    filas+='<tr class="rp-row-sel" onclick="rpSelRow(this,'+JSON.stringify([cls])+')" title="Clic para destacar en 3D">'+
      '<td class="td-name">'+nom+'<div class="td-cls">'+cls.charAt(0)+cls.slice(1).toLowerCase()+'</div></td>'+
      '<td class="td-qty'+(qty===0?' zero':'')+'">'+qty+'</td>'+
      '<td class="td-ok">'+(qty>0?'<span class="ic-ok">âœ“</span>':'<span class="ic-err">âœ—</span>')+'</td>'+
      '</tr>';
  });
  var pctPres=espEnts.length?Math.round(presentes/espEnts.length*100):0;
  var bCls=pctPres===100?'rp-ok':pctPres>50?'rp-warn':'rp-err';
  html+=rpSec('4.Entidades IFC',presentes+'/'+espEnts.length+' presentes',bCls,
    '<table class="rp-table">'+filas+'</table>',true);

  /* 5. Familias y Tipos */
  var tipos=est.tipos||[];
  if(tipos.length){
    var grupos={};
    tipos.forEach(function(t){
      var g=t.cls.charAt(0)+t.cls.slice(1).toLowerCase();
      if(!grupos[g])grupos[g]=[];
      grupos[g].push(t);
    });
    var tiposFilas='';
    Object.keys(grupos).sort().forEach(function(g){
      grupos[g].forEach(function(t,i){
        var rawId=t.id.replace('#','');
        var ids=est.elemsPorTipo[rawId]||[];
        /* clase base: IFCWALLTYPE â†’ IFCWALL */
        var claseBase=t.cls.replace(/TYPE$/,'');
        tiposFilas+='<tr class="rp-row-sel" onclick="rpSelRow(this,'+JSON.stringify([claseBase])+')" title="Clic para destacar en 3D">'+
          '<td class="td-name" style="color:var(--accent);font-size:9px">'+(i===0?g:'')+'</td>'+
          '<td style="font:400 10px var(--mono);color:var(--text)">'+esc(t.nombre)+'</td>'+
          '<td class="td-qty" style="font-size:9px">'+ids.length+'</td>'+
          '</tr>';
      });
    });
    html+=rpSec('5.Familias y Tipos',tipos.length+' tipos','rp-info',
      '<table class="rp-table">'+tiposFilas+'</table>',false);
  } else {
    html+=rpSec('5.Familias y Tipos','Sin datos','rp-info',
      '<div class="rp-msg">No se encontraron tipos IFC en este archivo.</div>',false);
  }

  document.getElementById('rpBody').innerHTML=html;
}

/* â•â•â• CARGA IFC â•â•â• */
async function cargarIFC(f){
  if(currentFile&&currentFile.id===f.id)return;
  currentFile=f;
  renderSidebar();
  ovHide('ovWelcome');ovHide('ovError');ovShow('ovLoading');
  setLoadText('Leyendo archivo...');
  document.getElementById('vtLabel').textContent=f.name;
  document.getElementById('metaStrip').classList.remove('show');
  meshes.forEach(function(m){m.geometry.dispose();m.material.dispose();scene.remove(m)});
  meshes=[];selectedMesh=null;

  try{
    var texto=await new Promise(function(res,rej){
      var r=new FileReader();r.onload=function(e){res(e.target.result);};r.onerror=rej;r.readAsText(f.file,'utf-8');
    });
    setLoadText('Analizando IFC...');
    var est=parsearIFC(texto);

    /* Construir cajas 3D */
    setLoadText('Construyendo visualizaciÃ³n...');
    var categorias=Object.keys(est.conteo).filter(function(c){return c.indexOf('IFC')===0;});
    var totalElems=0,col_idx=0;
    categorias.forEach(function(cls){
      var qty=est.conteo[cls];if(!qty)return;
      totalElems+=qty;
      var col=CAT_COLORS[cls]||CAT_COLORS.DEFAULT;
      var cols_n=Math.ceil(Math.sqrt(Math.min(qty,200)));
      var positions=[],normals=[];
      for(var i=0;i<Math.min(qty,200);i++){
        var row=Math.floor(i/cols_n),c=i%cols_n;
        var geo=new THREE.BoxGeometry(3,0.3+Math.random()*2,3);
        geo.translate(col_idx*12+c*4,0,row*4);
        Array.from(geo.attributes.position.array).forEach(function(v){positions.push(v);});
        Array.from(geo.attributes.normal.array).forEach(function(v){normals.push(v);});
        geo.dispose();
      }
      if(!positions.length)return;
      var mg=new THREE.BufferGeometry();
      mg.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      mg.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
      var mat=new THREE.MeshLambertMaterial({color:new THREE.Color(col[0],col[1],col[2]),side:THREE.DoubleSide});
      var mesh=new THREE.Mesh(mg,mat);
      mesh.userData={cls:cls,qty:qty,baseColor:new THREE.Color(col[0],col[1],col[2])};
      scene.add(mesh);meshes.push(mesh);col_idx++;
    });

    /* Centrar cÃ¡mara */
    var bbox=new THREE.Box3();meshes.forEach(function(m){bbox.expandByObject(m);});
    if(!bbox.isEmpty()){
      var center=bbox.getCenter(new THREE.Vector3()),size=bbox.getSize(new THREE.Vector3()).length();
      controls.target.copy(center);
      camera.position.set(center.x+size*.7,center.y+size*.5,center.z+size*.7);
      controls.update();
    }

    document.getElementById('hudElems').textContent=meshes.length+' tipos';
    document.getElementById('hudTris').textContent=totalElems.toLocaleString()+' entidades';

    /* Metastrip */
    document.getElementById('metaProy').textContent=est.proy;
    document.getElementById('metaEsq').textContent=est.schema;
    var CAT_MAP={IFCWALL:'Muros',IFCWALLSTANDARDCASE:'Muros',IFCSLAB:'Losas',IFCCOLUMN:'Columnas',IFCBEAM:'Vigas',IFCDOOR:'Puertas',IFCWINDOW:'Ventanas',IFCROOF:'Techos',IFCSPACE:'Espacios',IFCSTAIR:'Escaleras'};
    var cats={};Object.keys(CAT_MAP).forEach(function(k){if(est.conteo[k])cats[CAT_MAP[k]]=(cats[CAT_MAP[k]]||0)+est.conteo[k];});
    var cg=document.getElementById('metaCatsGroup');
    if(Object.keys(cats).length){document.getElementById('metaCats').innerHTML=Object.entries(cats).map(function(kv){return '<div class="chip">'+kv[0]+' <b>'+kv[1]+'</b></div>';}).join('');cg.style.display='';}
    else cg.style.display='none';
    document.getElementById('metaStrip').classList.add('show');

    /* Detectar especialidad por nombre de archivo */
    _espActual=detectarEspecialidad(f.name);
    var sel=document.getElementById('espSelect');
    if(sel)sel.value=_espActual;

    /* Reporte */
    renderReporte(est);
    /* Abrir reporte automÃ¡ticamente al cargar */
    if(!reporteVisible) toggleReporte();

    ovHide('ovLoading');
  }catch(err){
    ovHide('ovLoading');
    mostrarError('Error al procesar IFC:\n'+(err.message||err));
    console.error(err);
  }
}

/* â•â•â• REPORTE TOGGLE â•â•â• */
function toggleReporte(){
  reporteVisible=!reporteVisible;
  var panel=document.getElementById('reportePanel');
  var btn=document.getElementById('btnReporte');
  panel.classList.toggle('show',reporteVisible);
  btn.classList.toggle('active',reporteVisible);
  /* Ajustar tamaÃ±o del canvas */
  setTimeout(onResize,50);
}


/* â•â•â• CONTROLES 3D â•â•â• */
function onCanvasClick(e){
  if(!meshes.length||!renderer3)return;
  var rect=renderer3.domElement.getBoundingClientRect();
  mouse.x=((e.clientX-rect.left)/rect.width)*2-1;
  mouse.y=-((e.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(mouse,camera);
  var hits=raycaster.intersectObjects(meshes);
  if(selectedMesh){selectedMesh.material.color.copy(selectedMesh.userData.baseColor);selectedMesh=null;}
  if(!hits.length)return;
  selectedMesh=hits[0].object;
  selectedMesh.material.color.set(0x00d4ff);
}
function camView(v){
  if(!meshes.length)return;
  var bbox=new THREE.Box3();meshes.forEach(function(m){bbox.expandByObject(m)});
  var c=bbox.getCenter(new THREE.Vector3()),s=bbox.getSize(new THREE.Vector3()).length(),d=s*1.4;
  controls.target.copy(c);
  if(v==='top')camera.position.set(c.x,c.y+d,c.z+0.001);
  else if(v==='front')camera.position.set(c.x,c.y,c.z+d);
  else camera.position.set(c.x+d*.6,c.y+d*.5,c.z+d*.6);
  controls.update();
}
function resetCam(){if(meshes.length)camView('iso');}
function toggleWire(){wireMode=!wireMode;document.getElementById('btnWire').classList.toggle('active',wireMode);meshes.forEach(function(m){m.material.wireframe=wireMode;});}
function toggleGhost(){ghostMode=!ghostMode;document.getElementById('btnGhost').classList.toggle('active',ghostMode);meshes.forEach(function(m){m.material.transparent=ghostMode;m.material.opacity=ghostMode?0.3:1;});}

/* â•â•â• OVERLAYS â•â•â• */
function ovShow(id){document.getElementById(id).classList.remove('hidden');}
function ovHide(id){document.getElementById(id).classList.add('hidden');}
function setLoadText(t){document.getElementById('ovLoadText').textContent=t;}
function mostrarError(msg){
  if(!document.getElementById('welcomeScreen').classList.contains('hidden')) return;
  document.getElementById('ovErrDesc').textContent=msg;ovShow('ovError');
}
function cerrarError(){ovHide('ovError');ovShow('ovWelcome');}
function limpiarVisor(){
  destacar3D(null);
  document.querySelectorAll('.rp-active').forEach(function(r){r.classList.remove('rp-active');});
  meshes.forEach(function(m){m.geometry.dispose();m.material.dispose();scene.remove(m)});
  meshes=[];selectedMesh=null;
  document.getElementById('vtLabel').textContent='Sin modelo';
  document.getElementById('hudElems').textContent='â€”';
  document.getElementById('hudTris').textContent='â€”';
  document.getElementById('metaStrip').classList.remove('show');
  document.getElementById('rpBody').innerHTML='<div class="rp-msg">Carga un archivo IFC para ver el reporte.</div>';
  ovHide('ovLoading');ovHide('ovError');ovShow('ovWelcome');
}

/* â•â•â• DRAG & DROP â•â•â• */
function onFilesInput(e){agregarArchivos(e.target.files);e.target.value='';}
function sbDragOver(e){e.preventDefault();document.getElementById('sbDropzone').classList.add('drag-over');}
function sbDragLeave(){document.getElementById('sbDropzone').classList.remove('drag-over');}
function sbDrop(e){e.preventDefault();document.getElementById('sbDropzone').classList.remove('drag-over');agregarArchivos(e.dataTransfer.files);}

/* â•â•â• BIENVENIDA â•â•â• */
function welcomeUpload(){
  document.getElementById('welcomeScreen').classList.add('hidden');
  document.getElementById('fileInput').click();
}
function welcomeDemo(){
  // Demo pendiente de implementar
  document.getElementById('welcomeScreen').classList.add('hidden');
}
function wcDrop(e){
  e.preventDefault();
  document.getElementById('welcomeScreen').classList.add('hidden');
  agregarArchivos(e.dataTransfer.files);
}
function vaDragOver(e){e.preventDefault();document.getElementById('viewerArea').style.outline='2px dashed #00d4ff';}
function vaDragLeave(){document.getElementById('viewerArea').style.outline='';}
function vaDrop(e){
  e.preventDefault();document.getElementById('viewerArea').style.outline='';
  var ifc=Array.from(e.dataTransfer.files).filter(function(f){return ext(f.name)==='ifc'});
  if(!ifc.length){mostrarError('Solo se admiten archivos .ifc aquÃ­.');return;}
  agregarArchivos(e.dataTransfer.files);
  var found=FILES.find(function(f){return f.name===ifc[0].name});
  if(found){viewTab('v3d');cargarIFC(found);}
}

/* â•â•â• INICIO â•â•â• */
window.addEventListener('DOMContentLoaded',function(){
  try { initViewer(); } catch(e) { console.warn('initViewer:', e); }
});

