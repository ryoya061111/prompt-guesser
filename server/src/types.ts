export interface Player {
  id: string;
  name: string;
  score: number;
  isGameMaster: boolean;
}

export interface Room {
  id: string;
  players: Map<string, Player>;
  gameMasterId: string | null;
  gameState: GameState;
  settings: GameSettings;
  game: GameData | null;
  roundNumber: number;
}

export interface GameSettings {
  targetScore: number;
  timeLimit: number; // seconds
}

export interface GameData {
  prompts: string[];
  combinedPrompt: string;
  imageData: string | null;
  // Which prompts have been claimed: prompt -> { playerId, playerName }
  claimedPrompts: Map<string, { playerId: string; playerName: string }>;
}

export type GameState = 'waiting' | 'preparing' | 'answering' | 'result' | 'finished';

// Socket.IO events
export interface ServerToClientEvents {
  'room:updated': (data: RoomData) => void;
  'game:show-image': (data: { imageData: string; promptCount: number; timeLimit: number; roundNumber: number }) => void;
  'game:time-update': (data: { remaining: number }) => void;
  // Real-time: someone got a correct answer
  'game:answer-correct': (data: { playerName: string; claimedCount: number; totalCount: number }) => void;
  // Individual feedback for the answering player
  'game:answer-feedback': (data: { correct: boolean; alreadyClaimed: boolean; message: string }) => void;
  'game:round-result': (data: RoundResult) => void;
  'game:finished': (data: { winner: PlayerData; scores: PlayerData[] }) => void;
  'game:next-round': () => void;
  'game:time-up': () => void;
  'game:hint': (data: { text: string }) => void;
  'error': (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'room:create': (data: { playerName: string }, callback: (response: { roomId: string }) => void) => void;
  'room:join': (data: { roomId: string; playerName: string }, callback: (response: { success: boolean; error?: string }) => void) => void;
  'room:get': (callback: (response: {
    room: RoomData | null;
    gameImage: { imageData: string; promptCount: number; timeLimit: number; roundNumber: number } | null;
    claimedCount: number;
  }) => void) => void;
  'room:update-settings': (data: { settings: GameSettings }) => void;
  'game:set-prompts': (data: { prompts: string[] }) => void;
  'game:submit-answer': (data: { answer: string }) => void;
  'game:send-hint': (data: { text: string }) => void;
  'game:next-round': () => void;
  'game:reset': () => void;
}

export interface RoomData {
  id: string;
  players: PlayerData[];
  gameMasterId: string | null;
  gameState: GameState;
  settings: GameSettings;
  roundNumber: number;
}

export interface PlayerData {
  id: string;
  name: string;
  score: number;
  isGameMaster: boolean;
}

export interface RoundResult {
  prompts: string[];
  claimedBy: { prompt: string; playerName: string | null }[];
  scores: PlayerData[];
  isGameOver: boolean;
  winner: PlayerData | null;
}
