/*
 * Escaparate IA · Ángel Muñiz Pedraza
 * Worker de Cloudflare que rehace fotos de ropa y accesorios.
 *
 * Motor principal: GPT Image 2.5 en xKiro (POST /v1/images/edits, trabajo asíncrono que este Worker espera).
 * Reserva automática: FLUX.2 en Cloudflare Workers AI si xKiro no tiene saldo, limita o falla.
 *
 * Variables del Worker:
 *   XKIRO_KEY        (secreto) clave de API de xKiro. NUNCA en el código ni en el repositorio.
 *   APP_KEY          (secreto) clave que pegas en la app
 *   ALLOWED_ORIGINS  orígenes permitidos, separados por comas. Ej: https://angelmunizpedraza.github.io
 * Binding: Workers AI con el nombre AI (reserva)
 */

const MODELS = {
  rapida: '@cf/black-forest-labs/flux-2-klein-4b',
  alta: '@cf/black-forest-labs/flux-2-klein-9b',
};
const SIZES = { wallapop: [1024, 1024], vinted: [768, 1024] };
const XKIRO = 'https://api.xkiro.com/v1';
const XKIRO_MODEL = 'openai/gpt-image-2.5'; // el único de xKiro que acepta foto de origen
const XKIRO_WAIT_MS = 170000;
const ALLOWED = {
  cat: ['top', 'bottom', 'dress', 'shoes', 'bag', 'acc'],
  show: ['producto', 'mujer', 'hombre'],
  body: ['delgado', 'normal', 'grande'],
  framing: ['sincara', 'entero'],
  scene: ['estudio', 'casa', 'exterior'],
  quality: ['rapida', 'alta'],
  aspect: ['wallapop', 'vinted'],
};
const DEFAULTS = { cat: 'top', show: 'producto', body: 'normal', framing: 'sincara', scene: 'casa', quality: 'rapida', aspect: 'wallapop' };

const ITEM = {
  top: 'top garment',
  bottom: 'trousers or skirt',
  dress: 'dress or jumpsuit',
  shoes: 'pair of shoes',
  bag: 'bag',
  acc: 'accessory',
};

const fidelity = (ref) =>
  `The item must stay exactly as it appears in ${ref}: identical shape, cut, length, color, fabric texture, pattern, print, logos, lettering, stitching, buttons, zippers and hardware, including any wear, marks or defects. Do not redesign, recolor, clean up or add anything to the item.`;

const FINISH =
  'Photographic, natural soft daylight, true-to-life colors, realistic fabric folds and shadows, sharp focus on the item. No text, no watermark, no added logos.';

const PRODUCT_POSE = {
  top: 'hanging neatly on a simple wooden hanger, front view, fabric smoothed',
  bottom: 'laid perfectly flat and smoothed, photographed from directly above',
  dress: 'hanging neatly on a simple wooden hanger, front view, full length visible',
  shoes: 'the pair placed side by side at a three-quarter angle, camera at ground level',
  bag: 'standing upright, three-quarter view, straps arranged neatly',
  acc: 'placed on a clean surface, close-up with shallow depth of field',
};
const PRODUCT_SCENE = {
  estudio: 'on a seamless warm light-grey paper backdrop',
  casa: 'in a bright minimalist room with soft window light, white wall and light wood floor, softly blurred background',
  exterior: 'outdoors on a sunlit terrace with soft natural light, softly blurred background',
};

const WEAR = {
  top: 'wearing the top garment from image 0, paired with plain neutral trousers',
  bottom: 'wearing the trousers or skirt from image 0, paired with a plain white t-shirt',
  dress: 'wearing the dress or jumpsuit from image 0',
  shoes: 'wearing the shoes from image 0, with plain neutral trousers',
  bag: 'carrying the bag from image 0 on the shoulder, dressed in a simple neutral outfit',
  acc: 'wearing the accessory from image 0 in its natural place (face, wrist, neck or head as appropriate), dressed in a simple neutral outfit',
};
const NO_FACE = {
  top: 'framed from the shoulders down to mid-thigh, the face is out of frame',
  bottom: 'framed from the waist down to the feet, the face is out of frame',
  dress: 'framed from the shoulders down to the knees, the face is out of frame',
  shoes: 'cropped from the knees down, showing legs and feet',
  bag: 'framed from the shoulders down to the knees, the face is out of frame',
  acc: 'close crop around the accessory, the face is out of frame or turned away',
};
const BODY = { delgado: 'slim build', normal: 'average build', grande: 'plus-size build' };
const PERSON = { mujer: 'an adult woman in her late twenties', hombre: 'an adult man in his late twenties' };
const MODEL_SCENE = {
  estudio: 'plain light-grey seamless studio backdrop',
  casa: 'bright minimalist apartment with a large window, white walls and light wood floor, softly blurred background',
  exterior: 'quiet sunlit street with warm stone buildings, softly blurred background',
};

function buildPrompt(o, ref) {
  const FIDELITY = fidelity(ref);
  if (o.show === 'producto') {
    return [
      `Professional second-hand listing photo of the exact same ${ITEM[o.cat]} shown in ${ref}, ${PRODUCT_POSE[o.cat]}, ${PRODUCT_SCENE[o.scene]}.`,
      FIDELITY,
      FINISH,
    ].join(' ');
  }
  const framing = o.framing === 'entero' ? 'full-body shot from head to toe, relaxed natural expression' : NO_FACE[o.cat];
  return [
    `Lifestyle fashion photo of ${PERSON[o.show]} with a ${BODY[o.body]}, ${WEAR[o.cat].replace('image 0', ref)}.`,
    `Natural relaxed pose, ${framing}. Setting: ${MODEL_SCENE[o.scene]}.`,
    FIDELITY,
    'The rest of the outfit is simple and neutral so the item stands out.',
    FINISH,
  ].join(' ');
}

function b64(buf) {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class Fallo extends Error { constructor(code, detail) { super(code); this.code = code; this.detail = detail; } }

async function xkiro(env, photo, o, w, hgt) {
  const auth = { Authorization: `Bearer ${env.XKIRO_KEY}` };
  const form = new FormData();
  form.append('image', photo, 'item.jpg');
  form.append('model', XKIRO_MODEL);
  form.append('prompt', buildPrompt(o, 'the provided photo'));
  form.append('size', `${w}x${hgt}`);
  form.append('n', '1');
  const r = await fetch(`${XKIRO}/images/edits`, { method: 'POST', headers: auth, body: form });
  const job = await r.json().catch(() => ({}));
  if (!r.ok || !job.id) {
    const detail = (job.error && (job.error.code || job.error.message)) || `HTTP ${r.status}`;
    if (r.status === 400) throw new Fallo('bloqueada', detail);
    if (r.status === 401 || r.status === 403) throw new Fallo('xkiro-clave', detail);
    throw new Fallo(r.status === 402 || r.status === 429 ? 'cupo' : 'modelo', detail);
  }
  const deadline = Date.now() + XKIRO_WAIT_MS;
  let wait = 3000;
  while (Date.now() < deadline) {
    await sleep(wait);
    wait = Math.min(wait * 1.4, 8000);
    const p = await fetch(`${XKIRO}/images/generations/${job.id}`, { headers: auth });
    if (p.status === 429 || p.status >= 500) continue;
    const j = await p.json().catch(() => ({}));
    if (j.status === 'succeeded' && j.data && j.data[0] && j.data[0].url) {
      const img = await fetch(j.data[0].url);
      if (!img.ok) throw new Fallo('modelo', `CDN ${img.status}`);
      return b64(await img.arrayBuffer());
    }
    if (j.status === 'blocked') throw new Fallo('bloqueada', 'blocked');
    if (j.status === 'failed') throw new Fallo('modelo', (j.error && j.error.message) || 'failed');
  }
  throw new Fallo('modelo', 'timeout');
}

async function flux(env, photo, o, w, hgt) {
  const form = new FormData();
  form.append('prompt', buildPrompt(o, 'image 0'));
  form.append('input_image_0', photo, 'item.jpg');
  form.append('width', String(w));
  form.append('height', String(hgt));
  form.append('seed', String(Math.floor(Math.random() * 2147483647)));
  const r = new Request('http://form', { method: 'POST', body: form });
  try {
    const out = await env.AI.run(MODELS[o.quality], {
      multipart: { body: r.body, contentType: r.headers.get('content-type') },
    });
    if (!out || !out.image) throw new Fallo('modelo', 'sin imagen');
    return out.image;
  } catch (e) {
    if (e instanceof Fallo) throw e;
    const msg = String((e && e.message) || e);
    throw new Fallo(/neuron|quota|limit|capacity|4006|429/i.test(msg) ? 'cupo' : 'modelo', msg.slice(0, 300));
  }
}

function headersFor(req, env) {
  const origin = req.headers.get('Origin') || '';
  const list = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = !list.length || list.includes(origin);
  return {
    ok,
    h: {
      'Access-Control-Allow-Origin': ok ? origin || '*' : 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Escaparate-Key',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  };
}
function json(body, status, h) {
  return new Response(JSON.stringify(body), { status, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8' } });
}

export default {
  async fetch(req, env) {
    const { ok, h } = headersFor(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (!ok) return json({ error: 'origen' }, 403, h);
    if (env.APP_KEY && req.headers.get('X-Escaparate-Key') !== env.APP_KEY) return json({ error: 'clave' }, 401, h);

    const path = new URL(req.url).pathname;
    if (req.method === 'GET' && path === '/estado') return json({ ok: true, xkiro: !!env.XKIRO_KEY, reserva: !!env.AI }, 200, h);
    if (req.method !== 'POST' || path !== '/rehacer') return json({ error: 'ruta' }, 404, h);

    let fd;
    try { fd = await req.formData(); } catch (e) { return json({ error: 'foto' }, 400, h); }
    const photo = fd.get('photo');
    if (!photo || typeof photo === 'string' || photo.size > 2_000_000) return json({ error: 'foto' }, 400, h);

    const o = {};
    for (const k of Object.keys(ALLOWED)) {
      const v = fd.get(k);
      o[k] = ALLOWED[k].includes(v) ? v : DEFAULTS[k];
    }
    const [w, hgt] = SIZES[o.aspect];

    const status = { cupo: 429, bloqueada: 400, 'xkiro-clave': 502, modelo: 502 };
    let primero = null;
    if (env.XKIRO_KEY) {
      try {
        return json({ image: await xkiro(env, photo, o, w, hgt), width: w, height: hgt, motor: 'xkiro' }, 200, h);
      } catch (e) {
        primero = e;
        // una foto bloqueada por contenido no se reintenta en otro motor: el problema es la foto o el prompt
        if (e.code === 'bloqueada' || !env.AI) return json({ error: e.code, detail: String(e.detail || '').slice(0, 300) }, status[e.code] || 502, h);
      }
    }
    try {
      return json({ image: await flux(env, photo, o, w, hgt), width: w, height: hgt, motor: 'cloudflare', aviso: primero ? primero.code : undefined }, 200, h);
    } catch (e) {
      const code = primero && primero.code === 'xkiro-clave' ? 'xkiro-clave' : e.code;
      return json({ error: code, detail: String(e.detail || '').slice(0, 300) }, status[code] || 502, h);
    }
  },
};
