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
