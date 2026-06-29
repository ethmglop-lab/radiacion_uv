/**
 * ════════════════════════════════════════════════════════════
 *  Dashboard UV – Índice de Radiación Solar – SENAMHI Perú
 *  app.js  |  Vanilla JS ES6
 *
 *  Enfoque: plantilla JPG a pantalla completa + overlays HTML
 *  posicionados en % sobre las coordenadas reales de la imagen.
 * ════════════════════════════════════════════════════════════
 */

/* ─────────────────────────────────────────────────────────────
   CONFIGURACIÓN GLOBAL
   Modifica solo esta sección.
───────────────────────────────────────────────────────────── */

/** Endpoint oficial SENAMHI – CORS abierto, no requiere proxy */
const SENAMHI_URL = 'https://www.senamhi.gob.pe/usr/dms/modelo/iuv/prono_ruv.json';

/** Intervalo de auto-actualización: 30 minutos */
const INTERVALO_ACTUALIZACION = 1800000;

/** Clave LocalStorage */
const CACHE_KEY = 'uv_senamhi_cache_v2';

/* ─────────────────────────────────────────────────────────────
   POSICIONES DE LAS CIUDADES SOBRE LA PLANTILLA
   ─────────────────────────────────────────────────────────────
   Cada entrada define dónde se dibuja el círculo UV + nombre
   de esa ciudad sobre la imagen JPG.

   · x  →  distancia desde el borde izquierdo de la imagen  (% del ancho)
   · y  →  distancia desde el borde superior de la imagen   (% del alto)

   El punto (x, y) apunta al CENTRO del círculo.
   El nombre se pinta a la derecha del círculo automáticamente.

   ⚠ Si los círculos no coinciden con el área en blanco de la
     plantilla, ajusta los valores x e y de cada ciudad aquí.
───────────────────────────────────────────────────────────── */
const CIUDADES = [
    //  id            nombre        codZona  x(%)   y(%)   notaZona (opcional)
    { id:'paita',      nombre:'Paita',      codZona:'2005', x: 6.4,  y:22.0 },
    { id:'huarmey',    nombre:'Huarmey',    codZona:'0211', x:30.4,  y:22.0 },
    { id:'pisco',      nombre:'Pisco',      codZona:'1105', x:54.4,  y:22.0 },
    { id:'quellaveco', nombre:'Quellaveco', codZona:'1801', x:78.4,  y:22.0, notaZona:'Moquegua (región Quellaveco)' },

    { id:'salaverry',  nombre:'Salaverry',  codZona:'1301', x: 6.4,  y:26.0, notaZona:'Trujillo (puerto Salaverry)' },
    { id:'lima',       nombre:'Lima',       codZona:'1501', x:30.4,  y:26.0 },
    { id:'matarani',   nombre:'Matarani',   codZona:'0407', x:54.4,  y:26.0, notaZona:'Mollendo (puerto cercano)' },
    { id:'pucallpa',   nombre:'Pucallpa',   codZona:'2501', x:78.4,  y:26.0 },

    { id:'chimbote',   nombre:'Chimbote',   codZona:'0218', x: 6.4,  y:30.0 },
    { id:'callao',     nombre:'Callao',     codZona:'0701', x:30.4,  y:30.0 },
    { id:'ilo',        nombre:'Ilo',        codZona:'1803', x:54.4,  y:30.0 },
    { id:'iquitos',    nombre:'Iquitos',    codZona:'1601', x:78.4,  y:30.0 },
];

/* ─────────────────────────────────────────────────────────────
   ESTADO INTERNO
───────────────────────────────────────────────────────────── */
let datosActuales = [];
let temporizador  = null;

/* ═════════════════════════════════════════════════════════════
   calcularNivel(uv) / calcularColor(uv)
═════════════════════════════════════════════════════════════ */
function calcularNivel(uv) {
    if (uv <= 2)  return 'bajo';
    if (uv <= 5)  return 'moderado';
    if (uv <= 7)  return 'alto';
    if (uv <= 10) return 'muy_alto';
    return 'extrem_alto';
}

const COLORES_UV = {
    verde:    '#3dba4e',
    amarillo: '#f5c800',
    naranja:  '#f27800',
    rojo:     '#e52020',
    morado:   '#8b22b5',
};

function calcularColor(uv) {
    if (uv <= 2)  return 'verde';
    if (uv <= 5)  return 'amarillo';
    if (uv <= 7)  return 'naranja';
    if (uv <= 10) return 'rojo';
    return 'morado';
}

/* ═════════════════════════════════════════════════════════════
   guardarCache / leerCache
═════════════════════════════════════════════════════════════ */
function guardarCache(datos) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: new Date().toISOString(), datos }));
    } catch (e) { console.warn('[Cache] No se pudo guardar:', e.message); }
}

function leerCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

/* ═════════════════════════════════════════════════════════════
   consultarSENAMHI()
   ─── ADAPTADOR DE DATOS ────────────────────────────────────
   Consume el endpoint:
     GET https://www.senamhi.gob.pe/usr/dms/modelo/iuv/prono_ruv.json

   Para reemplazar por otra fuente en el futuro:
     1. Modifica SOLO esta función.
     2. Retorna Array de { id, uv }.
     3. El resto del código no cambia.
═════════════════════════════════════════════════════════════ */
async function consultarSENAMHI() {
    const res = await fetch(SENAMHI_URL, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const zonas = await res.json();
    const hoy   = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    return CIUDADES.map(ciudad => {
        const zona = zonas.find(z => z.c_cod_zona === ciudad.codZona);
        if (!zona?.pronostico?.length) {
            console.warn(`[SENAMHI] Sin datos para ${ciudad.nombre} (${ciudad.codZona})`);
            return { id: ciudad.id, uv: 0 };
        }

        const forecast = zona.pronostico.find(p => p.d_fec_diapron === hoy)
                      ?? zona.pronostico[0];

        const uv = Math.round(parseFloat(forecast.n_indice) || 0);
        if (ciudad.notaZona) console.info(`[SENAMHI] ${ciudad.nombre} → ${ciudad.notaZona}: UV ${uv}`);
        return { id: ciudad.id, uv };
    });
}

/* ═════════════════════════════════════════════════════════════
   obtenerDatos()
   1. Intenta API SENAMHI
   2. Falla → usa caché LocalStorage
   3. Sin caché → ceros
═════════════════════════════════════════════════════════════ */
async function obtenerDatos() {
    try {
        const resultados = await consultarSENAMHI();
        datosActuales = CIUDADES.map(c => ({
            ...c,
            uv: resultados.find(r => r.id === c.id)?.uv ?? 0,
        }));
        guardarCache(datosActuales);
        console.info('[Datos] Actualizados desde SENAMHI.');
    } catch (err) {
        console.warn('[Datos] Error SENAMHI:', err.message);
        const cache = leerCache();
        if (cache) {
            datosActuales = cache.datos;
            console.info('[Datos] Usando caché del', new Date(cache.ts).toLocaleString('es-PE'));
        } else {
            datosActuales = CIUDADES.map(c => ({ ...c, uv: 0 }));
            console.warn('[Datos] Sin caché. Mostrando ceros.');
        }
    }
}

/* ═════════════════════════════════════════════════════════════
   ajustarTamano()
   ─── PANTALLA COMPLETA ──────────────────────────────────────
   Calcula el tamaño exacto (en px) que debe tener .dashboard
   para llenar la ventana manteniendo la proporción real de la
   imagen (equivalente a object-fit: contain), tanto en modo
   normal como en pantalla completa (F11).
═════════════════════════════════════════════════════════════ */
function ajustarTamano() {
    const img   = document.getElementById('plantilla');
    const dash  = document.getElementById('dashboard');
    if (!img || !dash || !img.naturalWidth) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const ratio = img.naturalWidth / img.naturalHeight;

    let w = vw;
    let h = w / ratio;
    if (h > vh) {
        h = vh;
        w = h * ratio;
    }

    dash.style.width  = `${Math.round(w)}px`;
    dash.style.height = `${Math.round(h)}px`;

    renderCiudades();
}

/* ═════════════════════════════════════════════════════════════
   renderCiudades()
   ─── NÚCLEO DEL OVERLAY ────────────────────────────────────
   Genera un .ciudad-item por cada ciudad y lo posiciona sobre
   la plantilla usando left/top en % (valores de CIUDADES[].x/y).

   El tamaño del círculo y la fuente se calculan en px a partir
   del ancho real de la imagen en pantalla, para que escalen
   exactamente igual que la imagen en cualquier resolución.
═════════════════════════════════════════════════════════════ */
function renderCiudades() {
    const contenedor = document.getElementById('overlay-ciudades');
    const img        = document.getElementById('plantilla');
    if (!contenedor || !img) return;

    const anchoImagen = img.offsetWidth || 520;

    // Tamaños en px derivados del ancho real de la imagen en pantalla
    const circuloPx    = anchoImagen * 0.045;  // ≈ 4.5% del ancho
    const uvFontPx     = anchoImagen * 0.020;  // número UV
    const nombreFontPx = anchoImagen * 0.017;  // nombre ciudad
    const gapPx        = anchoImagen * 0.009;  // separación círculo–nombre

    contenedor.innerHTML = '';

    datosActuales.forEach(ciudad => {
        const nivelColor = calcularColor(ciudad.uv);
        const numero     = ciudad.uv > 0 ? String(ciudad.uv).padStart(2, '0') : '--';

        const item = document.createElement('div');
        item.className = 'ciudad-item';
        item.style.left = `${ciudad.x}%`;
        item.style.top  = `${ciudad.y}%`;
        item.style.gap  = `${gapPx}px`;
        item.setAttribute('title',
            `${ciudad.nombre}: UV ${ciudad.uv} (${calcularNivel(ciudad.uv).replace(/_/g,' ')})`);

        const circulo = document.createElement('div');
        circulo.className = `ciudad-circulo uv-${nivelColor}`;
        circulo.id = `circulo-${ciudad.id}`;
        circulo.textContent = numero;
        circulo.style.width    = `${circuloPx}px`;
        circulo.style.height   = `${circuloPx}px`;
        circulo.style.fontSize = `${uvFontPx}px`;

        const nombre = document.createElement('span');
        nombre.className = 'ciudad-nombre';
        nombre.textContent = ciudad.nombre;
        nombre.style.fontSize = `${nombreFontPx}px`;
        // Compensación óptica: alinea visualmente el nombre con el centro del círculo
        nombre.style.transform = 'translateY(0.05em)';

        item.appendChild(circulo);
        item.appendChild(nombre);
        contenedor.appendChild(item);
    });
}

/* ═════════════════════════════════════════════════════════════
   iniciarActualizacionAutomatica()
═════════════════════════════════════════════════════════════ */
function iniciarActualizacionAutomatica() {
    if (temporizador) clearInterval(temporizador);
    temporizador = setInterval(async () => {
        console.info('[Auto] Actualizando datos UV…');
        await obtenerDatos();
        renderCiudades();
    }, INTERVALO_ACTUALIZACION);
}

/* ═════════════════════════════════════════════════════════════
   exportarPNG()
   ─── EXPORTACIÓN A IMAGEN ───────────────────────────────────
   Dibuja la plantilla + círculos + nombres en un <canvas> a
   resolución nativa (x2 para nitidez) y descarga el resultado
   como archivo PNG. No depende de librerías externas.
═════════════════════════════════════════════════════════════ */
async function exportarPNG() {
    const btn = document.getElementById('btn-exportar');
    const img = document.getElementById('plantilla');
    if (!img || !img.naturalWidth) return;

    btn?.classList.add('exportando');

    try {
        if (document.fonts?.ready) await document.fonts.ready;

        const ESCALA = 2; // súper-muestreo para nitidez al exportar
        const W = img.naturalWidth  * ESCALA;
        const H = img.naturalHeight * ESCALA;

        const canvas = document.createElement('canvas');
        canvas.width  = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, 0, 0, W, H);

        const circuloR    = (W * 0.045) / 2;
        const uvFontPx    = W * 0.020;
        const nombreFontPx= W * 0.017;
        const gapPx       = W * 0.009;

        datosActuales.forEach(ciudad => {
            const cx = (ciudad.x / 100) * W;
            const cy = (ciudad.y / 100) * H;
            const nivelColor = calcularColor(ciudad.uv);
            const numero     = ciudad.uv > 0 ? String(ciudad.uv).padStart(2, '0') : '--';

            // Sombra del círculo
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.28)';
            ctx.shadowBlur  = 6 * ESCALA;
            ctx.shadowOffsetY = 2 * ESCALA;

            // Círculo
            ctx.beginPath();
            ctx.arc(cx, cy, circuloR, 0, Math.PI * 2);
            ctx.fillStyle = COLORES_UV[nivelColor];
            ctx.fill();
            ctx.restore();

            // Número UV
            ctx.font = `900 ${uvFontPx}px Nunito, Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = nivelColor === 'amarillo' ? '#3a2800' : '#ffffff';
            ctx.fillText(numero, cx, cy + uvFontPx * 0.04);

            // Nombre de la ciudad
            ctx.font = `800 ${nombreFontPx}px Nunito, Arial, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#1a3a7a';
            ctx.fillText(ciudad.nombre, cx + circuloR + gapPx, cy + nombreFontPx * 0.05);
        });

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('No se pudo generar el PNG.');

        const ahora = new Date();
        const stamp = ahora.toISOString().slice(0,10) + '_' +
                      String(ahora.getHours()).padStart(2,'0') +
                      String(ahora.getMinutes()).padStart(2,'0');

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `radiacion-uv-${stamp}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        console.info('[Export] PNG generado correctamente.');
    } catch (err) {
        console.error('[Export] Error al exportar PNG:', err);
        alert('No se pudo exportar la imagen. Revisa la consola para más detalles.');
    } finally {
        btn?.classList.remove('exportando');
    }
}

/* ═════════════════════════════════════════════════════════════
   INICIALIZACIÓN
═════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
    const img = document.getElementById('plantilla');
    const btnExportar = document.getElementById('btn-exportar');

    const arrancar = async () => {
        ajustarTamano();
        await obtenerDatos();
        renderCiudades();
        iniciarActualizacionAutomatica();
        console.info('[Init] Dashboard UV listo.');
    };

    if (img.complete && img.naturalWidth) {
        arrancar();
    } else {
        img.addEventListener('load', arrancar);
        img.addEventListener('error', () => {
            console.error('[Init] No se pudo cargar la plantilla JPG.');
        });
    }

    btnExportar?.addEventListener('click', exportarPNG);

    // Re-ajustar tamaño al cambiar la ventana o entrar/salir de pantalla completa (F11)
    const reajustar = debounce(ajustarTamano, 120);
    window.addEventListener('resize', reajustar);
    document.addEventListener('fullscreenchange', () => setTimeout(ajustarTamano, 80));
});

/* Utilidad: evita re-renders excesivos al redimensionar */
function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}
