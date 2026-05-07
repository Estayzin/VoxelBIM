/**
 * Tutorial — onboarding overlay reutilizable para VoxelBIM.
 *
 * Uso:
 *   const t = new Tutorial({ key: 'vbim_mi_herramienta_v1', steps: [...] });
 *   t.start();          // muestra solo si no fue visto antes
 *   t.reset();          // borra el flag (para desarrollo / botón "ver tutorial")
 *
 * Cada step:
 *   { target: '#css-selector', title: '', body: '', position: 'top|bottom|left|right' }
 *   target: null  →  modal centrado (bienvenida, cierre)
 */
class Tutorial {
  constructor({ key, steps }) {
    this.key   = key;
    this.steps = steps;
    this._els  = [];
  }

  start() {
    if (localStorage.getItem(this.key)) return;
    this._show(0);
  }

  reset() {
    localStorage.removeItem(this.key);
  }

  // ── Render de un paso ──────────────────────────────────────────────────────

  _show(i) {
    this._clear();

    const step    = this.steps[i];
    const isFirst = i === 0;
    const isLast  = i === this.steps.length - 1;
    const target  = step.target ? document.querySelector(step.target) : null;
    const rect    = target ? target.getBoundingClientRect() : null;
    const vw = window.innerWidth, vh = window.innerHeight, P = 8;

    // — Telón oscuro (4 rectángulos que rodean el elemento, o pantalla completa) —
    if (rect) {
      [
        [0,              0,          vw,                  rect.top    - P],
        [rect.bottom + P, 0,         vw,                  vh - rect.bottom - P],
        [rect.top - P,   0,          rect.left - P,       rect.height + P * 2],
        [rect.top - P,   rect.right + P, vw - rect.right - P, rect.height + P * 2],
      ].forEach(([top, left, width, height]) => {
        if (width <= 0 || height <= 0) return;
        this._el('div', {
          position: 'fixed', zIndex: '9000', background: 'rgba(0,0,0,.78)',
          top: top + 'px', left: left + 'px', width: width + 'px', height: height + 'px',
          pointerEvents: 'all',
        });
      });

      // Anillo de foco alrededor del elemento
      this._el('div', {
        position: 'fixed', zIndex: '9001', pointerEvents: 'none',
        border: '2px solid rgba(0,212,255,.55)', borderRadius: '10px',
        boxShadow: '0 0 0 4px rgba(0,212,255,.08), 0 0 28px rgba(0,212,255,.2)',
        transition: 'all .25s ease',
        top:    (rect.top    - P) + 'px',
        left:   (rect.left   - P) + 'px',
        width:  (rect.width  + P * 2) + 'px',
        height: (rect.height + P * 2) + 'px',
      });
    } else {
      this._el('div', {
        position: 'fixed', inset: '0', zIndex: '9000',
        background: 'rgba(0,0,0,.78)', pointerEvents: 'all',
      });
    }

    // — Indicadores de paso (dots) —
    const dots = this.steps.map((_, n) =>
      `<span style="display:inline-block;width:5px;height:5px;border-radius:50%;margin:0 2px;
        background:${n === i ? '#00d4ff' : '#1a2a40'};transition:background .2s;"></span>`
    ).join('');

    // — Tooltip —
    const tip = this._el('div', {
      position: 'fixed', zIndex: '9002', width: '300px',
      opacity: '0', transition: 'opacity .2s ease',
      background: '#0d1526', border: '1px solid rgba(0,212,255,.28)',
      borderRadius: '10px', padding: '20px 22px',
      boxShadow: '0 20px 70px rgba(0,0,0,.9), 0 0 0 1px rgba(0,212,255,.05)',
      fontFamily: '"Inter", sans-serif',
    });

    tip.innerHTML = `
      <div style="font:600 9px 'JetBrains Mono',monospace;color:rgba(0,212,255,.55);
                  text-transform:uppercase;letter-spacing:.15em;margin-bottom:8px;">
        Paso ${i + 1} de ${this.steps.length}
      </div>
      <div style="font:700 15px 'Inter',sans-serif;color:#e8f4ff;margin-bottom:8px;">
        ${step.title}
      </div>
      <div style="font:400 12px 'Inter',sans-serif;color:#4a6080;line-height:1.65;margin-bottom:18px;">
        ${step.body}
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        ${!isFirst ? `<button id="tut-prev"
          style="padding:7px 13px;background:transparent;color:#4a6080;border:1px solid #1a2a40;
                 border-radius:5px;font:600 10px 'JetBrains Mono',monospace;cursor:pointer;
                 text-transform:uppercase;letter-spacing:.1em;">← Atrás</button>` : ''}
        <button id="tut-next"
          style="flex:1;padding:7px 13px;background:linear-gradient(135deg,#00d4ff,#7c4dff);
                 color:#000;border:none;border-radius:5px;font:700 10px 'JetBrains Mono',monospace;
                 cursor:pointer;text-transform:uppercase;letter-spacing:.1em;">
          ${isLast ? 'Finalizar ✓' : 'Siguiente →'}
        </button>
        <div>${dots}</div>
      </div>
      <div style="text-align:center;margin-top:10px;">
        <button id="tut-skip"
          style="background:none;border:none;color:rgba(200,216,240,.4);font:400 10px 'JetBrains Mono',monospace;
                 cursor:pointer;letter-spacing:.08em;text-transform:uppercase;">
          Saltar tutorial
        </button>
      </div>
    `;

    // Eventos de navegación
    document.getElementById('tut-next').onclick  = () => isLast ? this._done() : this._show(i + 1);
    document.getElementById('tut-skip').onclick  = () => this._done();
    if (!isFirst) document.getElementById('tut-prev').onclick = () => this._show(i - 1);

    // Posicionar tooltip tras el render (necesitamos offsetHeight real)
    requestAnimationFrame(() => {
      const tw = 300, th = tip.offsetHeight, M = 12;
      let top, left;

      if (!rect) {
        top  = (vh - th) / 2;
        left = (vw - tw) / 2;
      } else {
        switch (step.position || 'bottom') {
          case 'top':
            top  = rect.top - th - 14;
            left = rect.left + rect.width / 2 - tw / 2;
            break;
          case 'right':
            top  = rect.top + rect.height / 2 - th / 2;
            left = rect.right + 14;
            break;
          case 'left':
            top  = rect.top + rect.height / 2 - th / 2;
            left = rect.left - tw - 14;
            break;
          default: // bottom
            top  = rect.bottom + 14;
            left = rect.left + rect.width / 2 - tw / 2;
        }
        left = Math.max(M, Math.min(left, vw - tw - M));
        top  = Math.max(M, Math.min(top,  vh - th - M));
      }

      tip.style.top  = top  + 'px';
      tip.style.left = left + 'px';
      requestAnimationFrame(() => { tip.style.opacity = '1'; });
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _el(tag, styles) {
    const el = document.createElement(tag);
    Object.assign(el.style, styles);
    document.body.appendChild(el);
    this._els.push(el);
    return el;
  }

  _clear() {
    this._els.forEach(e => e.remove());
    this._els = [];
  }

  _done() {
    localStorage.setItem(this.key, '1');
    this._clear();
  }
}
