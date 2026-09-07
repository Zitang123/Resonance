export type Provider = 'Spotify' | 'Apple Music' | 'YouTube' | 'Bandcamp';
export type ProviderLink = { provider: Provider; url: string };
export type MusicItem = {
  id: string;
  title: string;
  artist: string;
  type: 'track' | 'album';
  links: ProviderLink[];
  savedAt: string;
  recommendedBy: string;
  note: string;
  tags: string[];
  status: 'saved' | 'tried' | 'keep' | 'archived';
  revisitDate?: string;
  triedAt?: string;
  metadata?: { source: 'manual' | 'musicbrainz'; id?: string };
};
export type Capsule = {
  id: string;
  title: string;
  description: string;
  theme: 'copper' | 'blue' | 'sage' | 'plum';
  itemIds: string[];
  createdAt: string;
  image?: string;
};
export type Moment = {
  id: string;
  itemId?: string;
  capsuleId?: string;
  date: string;
  note: string;
  kind: 'memory' | 'session' | 'revisit' | 'imported';
  source: 'manual' | 'listenbrainz';
  externalId?: string;
  title?: string;
  artist?: string;
};
export type HistoryCoverage = {
  source: 'listenbrainz';
  user: string;
  from: string;
  to: string;
  importedAt: string;
};
export type State = {
  version: 1;
  items: MusicItem[];
  capsules: Capsule[];
  moments: Moment[];
  preferences: { lowerEffects: boolean };
  historyCoverage?: HistoryCoverage;
};
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};
export type TonightOptions = {
  mode: 'mix' | 'familiar' | 'unexplored';
  tag?: string;
  date?: string;
  excludedIds?: string[];
  pinnedIds?: string[];
  limit?: number;
};
export type TonightPick = { item: MusicItem; reason: string };
