export interface Bracket {
  id: number;
  name: string;
  description: string;
  type: string;
  category: string;
  createdAt: string;
  createdBy?: string;
}

export interface Item {
  id: number;
  bracketId: number;
  title: string;
  mediaUrl: string;
  mediaType: string;
}

export interface Result {
  id: number;
  bracketId: number;
  userId?: string;
  ranking: number[];
  createdAt: string;
  displayName?: string;
  comment?: string;
}

export interface ItemRanking {
  item: Item;
  wins: number;
  totalMatches: number;
  winPercentage: number;
  averageScore: number;
  timesRanked: number;
}

export interface BracketMatch {
  itemA: Item;
  itemB: Item;
  round: number;
  matchNumber: number;
}

export interface Tournament {
  bracket: Bracket;
  items: Item[];
  matches: BracketMatch[];
  currentMatch: BracketMatch | null;
  winners: Item[];
  finalRanking: Item[];
  isComplete: boolean;
}
