export type BracketType = 'song' | 'video' | 'image';

export interface Bracket {
  id: number;
  name: string;
  description: string | null;
  type: BracketType;
  category: string;
  createdAt: string;
  /** Set when a moderator hid it. Only its owner and admins are ever sent a hidden bracket. */
  hiddenAt?: string | null;
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

/** An entry's place in one run; tied entries share a range (5th to 8th). */
export interface Place {
  itemId: number;
  from: number;
  to: number;
}

/** A finished run. Only its submitter ever receives these (the save response, /me/results). */
export interface Result {
  id: number;
  bracketId: number;
  /** Derived by the server from the matches: champion first. */
  ranking: number[];
  /** Parallel to ranking. */
  places?: Place[];
  /** The run's real matches; null for runs saved before matches were recorded. */
  matches?: MatchOutcome[] | null;
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

/** Bracket-wide numbers the per-item rankings can't give. */
export interface BracketStats {
  /** Completed runs saved for the bracket, guests' included. */
  runCount: number;
}

export interface ItemRanking {
  item: Item;
  wins: number;
  totalMatches: number;
  /** Share of real head-to-head matches won, 0-100. */
  winPercentage: number;
  /** What the leaderboard shows and sorts by: the mean run score adjusted for sample size. */
  score: number;
  /** Raw mean run score, 0..1 (1 = champion every time). */
  averageScore: number;
  timesRanked: number;
}

/** A run the server started: its signed ticket and the entrants it picked, in seeding order. */
export interface RunTicket {
  ticket: string;
  entrantIds: number[];
  /** Bracket slots; size - entrantIds.length are byes. */
  size: number;
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

export type ReportTargetType = 'bracket' | 'comment';

/** A report in the moderation queue, with what it is about (null fields: the target is gone). */
export interface Report {
  id: number;
  targetType: ReportTargetType;
  /** The bracket id, or for a comment the id of the run it was left with (Comment.id). */
  targetId: number;
  reason: string;
  details: string | null;
  createdAt: string;
  resolvedAt: string | null;
  bracketId: number | null;
  bracketName: string | null;
  bracketHidden: boolean;
  comment: string | null;
  displayName: string | null;
}

export interface PlaylistTrack {
  title: string;
  mediaUrl: string;
}
