-- Reviewed MySQL 8.4 initial schema. Applied by scripts/migrate.mjs with checksums.
CREATE TABLE `User` (
 `id` CHAR(36) NOT NULL, `email` VARCHAR(254) NOT NULL, `passwordHash` VARCHAR(255) NOT NULL,
 `displayName` VARCHAR(40) NOT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), UNIQUE KEY `User_email_key` (`email`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `AuthSession` (
 `id` CHAR(36) NOT NULL, `userId` CHAR(36) NOT NULL, `refreshTokenHash` VARCHAR(64) NOT NULL,
 `clientType` VARCHAR(16) NOT NULL DEFAULT 'web', `expiresAt` DATETIME(3) NOT NULL, `revokedAt` DATETIME(3) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), UNIQUE KEY `AuthSession_hash_key` (`refreshTokenHash`),
 KEY `AuthSession_userId_expiresAt_idx` (`userId`,`expiresAt`), FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `Track` (
 `id` CHAR(36) NOT NULL, `title` VARCHAR(255) NOT NULL, `albumTitle` VARCHAR(255) NOT NULL, `durationMs` INT NOT NULL,
 `isrc` VARCHAR(16) NULL, `artworkUrl` VARCHAR(2048) NULL, `artworkSourceUrl` VARCHAR(2048) NULL, `externalUrl` VARCHAR(2048) NULL,
 `palette` INT NOT NULL DEFAULT 0, `isDemo` BOOLEAN NOT NULL DEFAULT false, `metadataExpiresAt` DATETIME(3) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), KEY `Track_isrc_idx` (`isrc`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `Artist` (
 `id` CHAR(36) NOT NULL, `name` VARCHAR(255) NOT NULL, `musicbrainzId` CHAR(36) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), UNIQUE KEY `Artist_musicbrainzId_key` (`musicbrainzId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `TrackArtist` (
 `trackId` CHAR(36) NOT NULL, `artistId` CHAR(36) NOT NULL, `creditOrder` INT NOT NULL DEFAULT 0, `role` VARCHAR(32) NOT NULL DEFAULT 'primary',
 PRIMARY KEY (`trackId`,`artistId`), FOREIGN KEY (`trackId`) REFERENCES `Track`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY (`artistId`) REFERENCES `Artist`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `TrackSource` (
 `id` CHAR(36) NOT NULL, `trackId` CHAR(36) NOT NULL, `provider` VARCHAR(32) NOT NULL, `externalTrackId` VARCHAR(100) NOT NULL,
 `countryCode` VARCHAR(8) NOT NULL DEFAULT 'global', `sourceUrl` VARCHAR(2048) NULL,
 `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `expiresAt` DATETIME(3) NULL,
 PRIMARY KEY (`id`), UNIQUE KEY `TrackSource_identity_key` (`provider`,`externalTrackId`,`countryCode`),
 FOREIGN KEY (`trackId`) REFERENCES `Track`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `Genre` (
 `id` CHAR(36) NOT NULL, `slug` VARCHAR(80) NOT NULL, `nameKo` VARCHAR(80) NOT NULL, `nameEn` VARCHAR(80) NOT NULL, `description` TEXT NULL,
 PRIMARY KEY (`id`), UNIQUE KEY `Genre_slug_key` (`slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `Mood` (
 `id` CHAR(36) NOT NULL, `slug` VARCHAR(80) NOT NULL, `nameKo` VARCHAR(80) NOT NULL,
 PRIMARY KEY (`id`), UNIQUE KEY `Mood_slug_key` (`slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `TrackGenre` (
 `id` CHAR(36) NOT NULL, `trackId` CHAR(36) NOT NULL, `genreId` CHAR(36) NOT NULL, `provider` VARCHAR(32) NOT NULL,
 `sourceScope` VARCHAR(16) NOT NULL, `sourceEntityId` VARCHAR(100) NOT NULL, `sourceUrl` VARCHAR(2048) NULL,
 `evidenceLevel` VARCHAR(16) NOT NULL, `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `expiresAt` DATETIME(3) NULL,
 PRIMARY KEY (`id`), UNIQUE KEY `TrackGenre_evidence_key` (`trackId`,`genreId`,`provider`,`sourceScope`,`sourceEntityId`), KEY `TrackGenre_genre_track_idx` (`genreId`,`trackId`),
 FOREIGN KEY (`trackId`) REFERENCES `Track`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY (`genreId`) REFERENCES `Genre`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `TrackMood` (
 `id` CHAR(36) NOT NULL, `trackId` CHAR(36) NOT NULL, `moodId` CHAR(36) NOT NULL, `provider` VARCHAR(32) NOT NULL,
 `sourceScope` VARCHAR(16) NOT NULL, `sourceEntityId` VARCHAR(100) NOT NULL, `sourceUrl` VARCHAR(2048) NULL,
 `evidenceLevel` VARCHAR(16) NOT NULL, `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `expiresAt` DATETIME(3) NULL,
 PRIMARY KEY (`id`), UNIQUE KEY `TrackMood_evidence_key` (`trackId`,`moodId`,`provider`,`sourceScope`,`sourceEntityId`), KEY `TrackMood_mood_track_idx` (`moodId`,`trackId`),
 FOREIGN KEY (`trackId`) REFERENCES `Track`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY (`moodId`) REFERENCES `Mood`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `Playlist` (
 `id` CHAR(36) NOT NULL, `userId` CHAR(36) NOT NULL, `name` VARCHAR(80) NOT NULL, `description` VARCHAR(500) NOT NULL DEFAULT '',
 `version` INT NOT NULL DEFAULT 0, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), KEY `Playlist_user_updated_idx` (`userId`,`updatedAt`), FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `PlaylistTrack` (
 `playlistId` CHAR(36) NOT NULL, `trackId` CHAR(36) NOT NULL, `position` INT NOT NULL, `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`playlistId`,`trackId`), UNIQUE KEY `PlaylistTrack_position_key` (`playlistId`,`position`),
 CONSTRAINT `PlaylistTrack_position_nonnegative` CHECK (`position` >= 0),
 FOREIGN KEY (`playlistId`) REFERENCES `Playlist`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY (`trackId`) REFERENCES `Track`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
