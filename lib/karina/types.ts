export type HistorySource = 'lastfm' | 'listenbrainz' | 'spotify-export';
export type ListenRecord = {
  id: string;
  source: HistorySource;
  playedAt: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number | null;
};
export type SignalOptions = {
  source: HistorySource;
  from?: string;
  to?: string;
  timezone: string;
};
export type RankedCount = { name: string; artist?: string; count: number };
export type ListeningSignals = {
  source: HistorySource;
  count: number;
  uniqueArtists: number;
  uniqueTracks: number;
  totalDurationMs: number | null;
  knownDurationRecords: number;
  daily: { date: string; count: number }[];
  hourly: number[];
  weekHours: { day: number; hour: number; count: number }[];
  topArtists: RankedCount[];
  topTracks: RankedCount[];
  topAlbums: RankedCount[];
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  entropyBits: number;
  effectiveArtists: number;
  repeatShare: number;
  coverage: { first: string | null; last: string | null };
};
