// Traducción automática de la carta.
//
// Nadie va a escribir cuarenta platos cuatro veces. Esto rellena de una vez lo que
// falta y lo GUARDA: se traduce una sola vez, no en cada visita. El dueño puede
// corregir cualquier texto después, y lo corregido no se vuelve a tocar.
//
// Proveedor: DeepL (su plan gratuito da 500.000 caracteres al mes, de sobra para
// cartas). Sin clave configurada, la función lo dice claramente en vez de fallar.
import { all, get, update } from './db.js';
import { parseJson, IDIOMAS_CARTA } from './utils.js';

const DEEPL = {
  es: 'ES', ca: null, en: 'EN-GB', fr: 'FR', de: 'DE', it: 'IT',
};

export const hayTraductor = () => !!process.env.MAITRE_DEEPL_KEY;

/** Idiomas a los que sabemos traducir solos. DeepL no habla catalán. */
export function idiomasTraducibles(idiomas) {
  return idiomas.filter((l) => DEEPL[l] && IDIOMAS_CARTA.includes(l));
}

async function deepl(textos, destino, origen) {
  const key = process.env.MAITRE_DEEPL_KEY;
  const host = key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
  const res = await fetch(`https://${host}/v2/translate`, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: textos,
      target_lang: DEEPL[destino],
      source_lang: DEEPL[origen] || undefined,
      // Los nombres de plato no son frases: sin esto, DeepL les mete puntos finales.
      preserve_formatting: true,
    }),
  });
  if (!res.ok) throw new Error(`DeepL respondió ${res.status}: ${(await res.text()).slice(0, 180)}`);
  const data = await res.json();
  return (data.translations || []).map((t) => t.text);
}

/**
 * Rellena lo que falte de la carta de un local en todos sus idiomas.
 * Devuelve qué se tradujo, sin tocar lo que ya estaba escrito a mano.
 */
export async function traducirCarta(venue, { soloFaltantes = true } = {}) {
  if (!hayTraductor()) {
    const err = new Error('Falta la clave del traductor (MAITRE_DEEPL_KEY).');
    err.code = 'no_translator';
    throw err;
  }
  const origen = venue.locale || 'es';
  const idiomas = idiomasTraducibles(parseJson(venue.languages, ['es'])).filter((l) => l !== origen);
  if (!idiomas.length) return { translated: 0, languages: [], skipped: 'sin idiomas que traducir' };

  const filas = [
    ...all('SELECT id, name, description FROM categories WHERE venue_id = ?', venue.id).map((r) => ({ ...r, tabla: 'categories' })),
    ...all('SELECT id, name, description FROM items WHERE venue_id = ?', venue.id).map((r) => ({ ...r, tabla: 'items' })),
  ];

  let traducidos = 0;
  for (const lang of idiomas) {
    // Se junta todo lo que falta en una sola llamada por idioma: menos peticiones,
    // menos espera y menos riesgo de quedarse a medias.
    const pendientes = [];
    for (const fila of filas) {
      for (const campo of ['name', 'description']) {
        const valor = parseJson(fila[campo], {});
        const base = valor[origen];
        if (!base || !String(base).trim()) continue;
        if (soloFaltantes && valor[lang] && String(valor[lang]).trim()) continue;
        pendientes.push({ fila, campo, valor, base: String(base) });
      }
    }
    if (!pendientes.length) continue;

    const salida = await deepl(pendientes.map((p) => p.base), lang, origen);
    pendientes.forEach((p, i) => {
      const texto = salida[i];
      if (!texto) return;
      p.valor[lang] = texto;
      update(p.fila.tabla, p.fila.id, { [p.campo]: JSON.stringify(p.valor) });
      traducidos++;
    });
  }
  return { translated: traducidos, languages: idiomas };
}

/** Cuánto falta por traducir, por idioma. Para enseñarlo en el panel. */
export function cobertura(venue) {
  const origen = venue.locale || 'es';
  const idiomas = parseJson(venue.languages, ['es']).filter((l) => l !== origen);
  const filas = [
    ...all('SELECT name, description FROM categories WHERE venue_id = ?', venue.id),
    ...all('SELECT name, description FROM items WHERE venue_id = ?', venue.id),
  ];
  return idiomas.map((lang) => {
    let total = 0; let hechos = 0;
    for (const fila of filas) {
      for (const campo of ['name', 'description']) {
        const valor = parseJson(fila[campo], {});
        if (!valor[origen] || !String(valor[origen]).trim()) continue;
        total++;
        if (valor[lang] && String(valor[lang]).trim()) hechos++;
      }
    }
    return { lang, total, done: hechos, pct: total ? Math.round((hechos / total) * 100) : 100, auto: !!DEEPL[lang] };
  });
}
