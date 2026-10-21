import { Database } from '../apps/api/dist/db.js';
import { Catalog } from '../apps/api/dist/catalog/catalog.js';
import { searchApple, normalize } from '../apps/api/dist/catalog/providers.js';
if (process.env.CATALOG_MODE !== 'live')
  throw new Error('Set CATALOG_MODE=live before importing live provider metadata.');
const entries = [
  ['Bonobo Kerala', 'Bonobo', 'Kerala'],
  ['Bonobo Cirrus', 'Bonobo', 'Cirrus'],
  ['Bonobo Kiara', 'Bonobo', 'Kiara'],
  ['Bonobo Kong', 'Bonobo', 'Kong'],
  ['The Cinematic Orchestra To Build A Home', 'The Cinematic Orchestra', 'To Build a Home'],
  ['FKJ Ylang Ylang', 'FKJ', 'Ylang Ylang'],
  ['Tom Misch Movie', 'Tom Misch', 'Movie'],
  ['Nujabes Aruarian Dance', 'Nujabes', 'Aruarian Dance'],
  ['IU Good Day', 'IU', 'Good Day'],
  ['NewJeans Ditto', 'NewJeans', 'Ditto'],
  ['HYUKOH TOMBOY', 'HYUKOH', 'TOMBOY'],
  ['wave to earth seasons', 'wave to earth', 'seasons'],
  ['DEAN instagram', 'DEAN', 'instagram'],
  ['Men I Trust Show Me How', 'Men I Trust', 'Show Me How'],
];
const db = new Database();
let imported = 0,
  enriched = 0,
  missing = 0;
try {
  await db.$connect();
  const catalog = new Catalog(db);
  for (const [query, artist, title] of entries) {
    const matches = (await searchApple(query, 0)).filter(
      (t) =>
        normalize(t.artist) === normalize(artist) && normalize(t.title).includes(normalize(title)),
    );
    if (!matches.length) {
      missing++;
      continue;
    }
    const track = matches.find((t) => normalize(t.title) === normalize(title)) || matches[0];
    await catalog.saveExternal(track);
    imported++;
    const result = await catalog.enrich(track.id);
    if (result.track.genres.some((g) => g.scope === 'recording')) enriched++;
    console.log(
      `Imported ${track.artist} — ${track.title}; recording evidence: ${result.enrichment}`,
    );
  }
  console.log(
    JSON.stringify({ market: process.env.APPLE_COUNTRY || 'US', imported, enriched, missing }),
  );
} finally {
  await db.$disconnect();
}
