export type Sport = 'football' | 'rugby' | 'handball' | 'basket';

export interface MatchEvent {
  id: string;
  sport: Sport;
  home: string;
  away: string;
  homeClub: string;
  awayClub: string;
  competition: string;
  level: LevelId;
  venue: string;
  approximate: boolean;
  lat: number;
  lng: number;
  date: string | null; // AAAA-MM-JJ
  dayLabel: string;
  time: string;
  partner: boolean;
  source: string;
  detailsUrl: string | null;
}

export type LevelId = 'tous' | 'r1' | 'r2' | 'r3' | 'coupe' | 'autre';

export interface Club { name: string; count: number }

export interface Place { label: string; lat: number; lng: number }
