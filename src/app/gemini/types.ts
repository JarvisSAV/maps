export interface Coordinate {
  lat: number;
  lng: number;
}

export interface User {
  id: string;
  name: string;
  color: string; // Hex code or Tailwind class mapping
  fillColor: string;
  score: number; // Area in square meters or km
}

export interface Territory {
  id: string;
  ownerId: string;
  coordinates: Coordinate[][]; // Array of rings. [0] is outer, [1..n] are holes
  timestamp: number;
}

export interface GameState {
  territories: Territory[];
  currentUser: User;
  users: Record<string, User>;
  activePath: Coordinate[];
  mapCenter: Coordinate;
  zoom: number;
}

export interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
  maps?: {
    uri?: string;
    title?: string;
    placeAnswerSources?: {
        reviewSnippets?: {
            snippet?: string;
        }[]
    }[]
  };
}

export interface GeminiLocationResult {
  text: string;
  chunks: GroundingChunk[];
}
