import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { demoTracks } from '../src/catalog/demo.js';
const db = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });
async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Demo seeding is disabled in production');
  for (const t of demoTracks) {
    await db.$transaction(async (tx) => {
      const artistId = `10000000-0000-4000-8000-${String(demoTracks.findIndex((x) => x.artist === t.artist) + 1).padStart(12, '0')}`;
      await tx.artist.upsert({
        where: { id: artistId },
        create: { id: artistId, name: t.artist },
        update: {},
      });
      await tx.track.upsert({
        where: { id: t.id },
        create: {
          id: t.id,
          title: t.title,
          albumTitle: t.album,
          durationMs: t.durationMs,
          palette: t.palette,
          isDemo: true,
          artists: { create: { artistId } },
        },
        update: {},
      });
      for (const g of t.genres) {
        const genre = await tx.genre.upsert({
          where: { slug: g.slug },
          create: { slug: g.slug, nameKo: g.name, nameEn: g.name },
          update: {},
        });
        const key = {
          trackId: t.id,
          genreId: genre.id,
          provider: 'demo',
          sourceScope: 'curated',
          sourceEntityId: t.id,
        };
        await tx.trackGenre.upsert({
          where: { trackId_genreId_provider_sourceScope_sourceEntityId: key },
          create: { ...key, evidenceLevel: 'confirmed' },
          update: {},
        });
      }
      for (const m of t.moods) {
        const mood = await tx.mood.upsert({
          where: { slug: m.slug },
          create: { slug: m.slug, nameKo: m.name },
          update: {},
        });
        const key = {
          trackId: t.id,
          moodId: mood.id,
          provider: 'demo',
          sourceScope: 'curated',
          sourceEntityId: t.id,
        };
        await tx.trackMood.upsert({
          where: { trackId_moodId_provider_sourceScope_sourceEntityId: key },
          create: { ...key, evidenceLevel: 'confirmed' },
          update: {},
        });
      }
    });
  }
  console.log(
    `Seeded ${demoTracks.length} fictional demo tracks (idempotent; no users or playlists overwritten).`,
  );
}
main().finally(() => db.$disconnect());
