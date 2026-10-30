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
  address: string;
  approximate: boolean;
  lat: number;
  lng: number;
  date: string | null; // AAAA-MM-JJ
  dayLabel: string;
  time: string;
  source: string;
  detailsUrl: string | null;
  hasOffer?: boolean; // un commerce partenaire propose une offre près du stade
}

export type LevelId = 'tous' | 'r1' | 'r2' | 'r3' | 'd1' | 'd2' | 'd3' | 'd4' | 'coupe' | 'autre';

export interface Club { name: string; count: number }

export interface Place { label: string; lat: number; lng: number }
