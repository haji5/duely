export type BracketType = 'song' | 'video' | 'image';

export interface Bracket {
  id: number;
  name: string;
  description: string | null;
  type: BracketType;
  category: string;
  createdAt: string;
}

export interface Item {
  id: number;
  bracketId: number;
  title: string;
  mediaUrl: string;
  mediaType: BracketType;
}

/** A real (non-bye) match played during a run. */
export interface MatchOutcome {
  winnerId: number;
  loserId: number;
}

/** A finished run. Only the signed-in owner ever receives these (from /me/results). */
export interface Result {
  id: number;
  bracketId: number;
  ranking: number[];
  createdAt: string;
  displayName?: string | null;
  comment?: string | null;
}

export interface Comment {
  id: number;
  displayName?: string | null;
  comment: string;
  createdAt: string;
  championItemId: number | null;
}

export interface ItemRanking {
  item: Item;
  wins: number;
  totalMatches: number;
  /** Share of real head-to-head matches won, 0-100. */
  winPercentage: number;
  /** Mean normalised finishing position, 0..1 (1 = champion every time). */
  averageScore: number;
  timesRanked: number;
}

/** A guest's run, kept in sessionStorage for the current tab. */
export interface SessionBattle {
  sessionId: string;
  bracketId: number;
  bracketName: string;
  ranking: number[];
  matches: MatchOutcome[];
  createdAt: string;
  displayName?: string;
  comment?: string;
}

export interface NewItem {
  title: string;
  mediaUrl: string;
}

export interface CreateBracketPayload {
  name: string;
  description?: string;
  type: BracketType;
  category: string;
  items: NewItem[];
}

export interface PlaylistTrack {
  title: string;
  mediaUrl: string;
}
