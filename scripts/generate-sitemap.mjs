import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const SITE_URL = process.env.SITE_URL || 'https://churohogar.com';

const parseEnv = () => {
    const envPath = resolve(root, '.env');
    const env = { ...process.env };
    if (existsSync(envPath)) {
        for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
            const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
            if (!match) continue;
            const key = match[1];
            let value = match[2].trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            if (!(key in process.env)) env[key] = value;
        }
    }
    return env;
};

const escapeXml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const urlEntry = (loc, lastmod, changefreq, priority) => `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;

const build = async () => {
    const env = parseEnv();
    const supabaseUrl = env.VITE_SUPABASE_URL;
    const anonKey = env.VITE_SUPABASE_ANON_KEY;

    const today = new Date().toISOString().slice(0, 10);
    const entries = [];

    entries.push(urlEntry(`${SITE_URL}/`, today, 'daily', '1.0'));
    entries.push(urlEntry(`${SITE_URL}/guia`, today, 'monthly', '0.8'));
    entries.push(urlEntry(`${SITE_URL}/contacto`, today, 'monthly', '0.8'));
    entries.push(urlEntry(`${SITE_URL}/quienes-somos`, today, 'monthly', '0.7'));

    if (supabaseUrl && anonKey) {
        try {
            const ahora = new Date().toISOString();
            const vencimiento = encodeURIComponent(`(expira_at.is.null,expira_at.gt.${ahora})`);
            const endpoint = `${supabaseUrl}/rest/v1/inmuebles?select=slug,id,publicado_at&estado=eq.Disponible&deleted_at=is.null&or=${vencimiento}&order=publicado_at.desc`;
            const res = await fetch(endpoint, {
                headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
            });
            if (res.ok) {
                const items = await res.json();
                for (const item of items) {
                    const slug = item.slug || item.id;
                    const lastmod = (item.publicado_at || '').slice(0, 10) || today;
                    entries.push(urlEntry(`${SITE_URL}/inmueble/${slug}`, lastmod, 'weekly', '0.6'));
                }
            } else {
                console.warn(`[sitemap] Supabase respondió ${res.status}; se genera solo con rutas estáticas.`);
            }
        } catch (error) {
            console.warn(`[sitemap] No se pudo consultar inmuebles: ${error.message}`);
        }
    } else {
        console.warn('[sitemap] Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY; solo rutas estáticas.');
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`;

    writeFileSync(resolve(root, 'public', 'sitemap.xml'), xml, 'utf8');
    console.log(`[sitemap] Generado con ${entries.length} URLs.`);
};

build();
