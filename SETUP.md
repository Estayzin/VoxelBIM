# 🔷 Configuración de VoxelBIM — Autodesk & Claude

El error 401 que viste ocurre porque **el token demo no es válido para Autodesk**. Para que funcione completamente, necesitas registrar credenciales reales.

## 🚀 Inicio Rápido (Desarrollador)

### 1. **Sin configurar credenciales (DEMO MODE)**
El servidor devuelve tokens dummy para ambas APIs. Funcional para pruebas básicas:

```bash
npm run dev          # Terminal 1: Vite (http://localhost:5173)
node server.js       # Terminal 2: Backend (http://localhost:3000)
```

**Limitación:** El login con Autodesk mostrará error 401 porque los tokens demo no son válidos.

---

## 🔑 Configuración Real

### A) Autodesk Platform Services (APS) — OAuth2

#### 1. Registra una aplicación en Autodesk:
1. Ve a https://developer.autodesk.com/apps
2. Haz clic en "Create App"
3. Completa los datos:
   - **Nombre:** VoxelBIM (o tu nombre de app)
   - **Tipo:** Desktop Application / Web Application
   - **Callback URL:** `http://localhost:3000/app/autodesk.html`

#### 2. Obtén credenciales:
- **Client ID:** `YOUR_CLIENT_ID_HERE`
- **Client Secret:** `YOUR_CLIENT_SECRET_HERE`

#### 3. Crea archivo `.env` en la raíz del proyecto:
```env
# Autodesk APS
APS_CLIENT_ID=YOUR_CLIENT_ID_HERE
APS_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
APS_CALLBACK_URL=http://localhost:3000/app/autodesk.html

# Claude API
CLAUDE_API_KEY=sk-ant-YOUR_KEY_HERE

# Environment
NODE_ENV=development
PORT=3000
```

#### 4. Reinicia el servidor:
```bash
node server.js
```

---

### B) Claude API (Anthropic)

#### 1. Obtén API Key:
1. Ve a https://console.anthropic.com/
2. Inicia sesión o crea cuenta
3. Ve a **API Keys**
4. Crea una nueva key

#### 2. Agrega al archivo `.env`:
```env
CLAUDE_API_KEY=sk-ant-YOUR_KEY_HERE
```

---

## 📡 Flujo OAuth de Autodesk

```
┌─────────────┐
│   Usuario   │
└──────┬──────┘
       │ 1. Click "Conectar con Autodesk"
       ▼
┌──────────────────────────┐
│ https://developer.api... │ ← Autodesk OAuth Server
└──────┬───────────────────┘
       │ 2. Redirecciona con ?code=...
       ▼
┌──────────────────┐
│ tu-app.html      │
└──────┬───────────┘
       │ 3. POST /aps/token {code}
       ▼
┌──────────────────────────────┐
│ localhost:3000/aps/token     │ ← Tu servidor
└──────┬───────────────────────┘
       │ 4. Intercambia con Autodesk
       │    grant_type=authorization_code
       ▼
┌──────────────────────────────────┐
│ Autodesk OAuth Server            │ ← Valida el code
└──────┬───────────────────────────┘
       │ 5. Retorna access_token real
       ▼
┌──────────────────┐
│ Cliente (CLI)    │ ← Recibe token válido
└──────────────────┘
```

---

## ✅ Verificar Configuración

### Test del servidor:
```powershell
# Autodesk APS
curl -X POST http://localhost:3000/aps/token `
  -H "Content-Type: application/json" `
  -d '{"code":"test"}'

# Claude
curl -X POST http://localhost:3000/claude/chat `
  -H "Content-Type: application/json" `
  -d '{"messages":[{"role":"user","content":"Hola"}]}'
```

### Esperado:
- **Sin `.env`**: Devuelve tokens/respuestas DEMO
- **Con `.env` válido**: Devuelve respuestas reales de Autodesk/Anthropic
- **Con `.env` inválido**: Error 401/403 de las APIs reales

---

## 🛠️ Troubleshooting

### Error: "Token inválido o expirado"
→ El token demo no es válido. **Necesitas credenciales reales.**

### Error: 401 en Autodesk
→ Client ID o Secret incorrectos. Verifica en https://developer.autodesk.com/apps

### Error: "Failed to load resource: 404"
→ El servidor no está corriendo. Usa `node server.js` en la terminal.

### Error: EADDRINUSE 3000
→ Otro proceso está usando puerto 3000. Mata todos los node:
```powershell
Get-Process node | Stop-Process -Force
```

---

## 📦 Estructura de variables de entorno

```env
# Modo (development = permite tokens demo)
NODE_ENV=development|production

# Autodesk
APS_CLIENT_ID=<obligatorio para OAuth real>
APS_CLIENT_SECRET=<obligatorio para OAuth real>
APS_CALLBACK_URL=http://localhost:3000/app/autodesk.html

# Claude AI
CLAUDE_API_KEY=sk-ant-<obligatorio para Claude real>

# Puerto
PORT=3000
```

---

## 🔄 Próximos Pasos

1. ✅ Registra una app en Autodesk Developer
2. ✅ Configura `.env` con credenciales
3. ✅ Reinicia `node server.js`
4. ✅ Intenta conectar en `/app/autodesk.html`
5. ✅ Usa Claude AI desde el panel derecho

¡Listo! 🚀
