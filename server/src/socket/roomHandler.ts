import { Server, Socket } from 'socket.io';
import { Room, Player, RoomData, PlayerData, ClientToServerEvents, ServerToClientEvents } from '../types.js';

const rooms = new Map<string, Room>();

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function toRoomData(room: Room): RoomData {
  return {
    id: room.id,
    players: Array.from(room.players.values()).map(toPlayerData),
    gameMasterId: room.gameMasterId,
    gameState: room.gameState,
    settings: room.settings,
    roundNumber: room.roundNumber,
  };
}

function toPlayerData(player: Player): PlayerData {
  return { id: player.id, name: player.name, score: player.score, isGameMaster: player.isGameMaster };
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function registerRoomHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>
) {
  socket.on('room:create', ({ playerName }, callback) => {
    let roomId: string;
    do { roomId = generateRoomId(); } while (rooms.has(roomId));

    const player: Player = { id: socket.id!, name: playerName, score: 0, isGameMaster: true };

    const room: Room = {
      id: roomId,
      players: new Map([[socket.id!, player]]),
      gameMasterId: socket.id!,
      gameState: 'waiting',
      settings: { targetScore: 5, timeLimit: 90 },
      game: null,
      roundNumber: 0,
    };

    rooms.set(roomId, room);
    socket.join(roomId);
    socket.data.roomId = roomId;

    callback({ roomId });
    io.to(roomId).emit('room:updated', toRoomData(room));
  });

  socket.on('room:join', ({ roomId, playerName }, callback) => {
    const room = rooms.get(roomId.toUpperCase());
    if (!room) { callback({ success: false, error: 'ルームが見つかりません' }); return; }
    if (room.gameState !== 'waiting') { callback({ success: false, error: 'ゲームは既に開始されています' }); return; }

    const player: Player = { id: socket.id!, name: playerName, score: 0, isGameMaster: false };
    room.players.set(socket.id!, player);
    socket.join(roomId.toUpperCase());
    socket.data.roomId = roomId.toUpperCase();

    callback({ success: true });
    io.to(room.id).emit('room:updated', toRoomData(room));
  });

  socket.on('room:update-settings', ({ settings }) => {
    const roomId = socket.data.roomId as string | undefined;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.gameMasterId !== socket.id) return;

    room.settings = settings;
    io.to(roomId).emit('room:updated', toRoomData(room));
  });

  socket.on('room:get', (callback) => {
    const roomId = socket.data.roomId as string | undefined;
    if (!roomId) { callback({ room: null, gameImage: null, claimedCount: 0 }); return; }
    const room = rooms.get(roomId);
    if (!room) { callback({ room: null, gameImage: null, claimedCount: 0 }); return; }

    let gameImage = null;
    let claimedCount = 0;
    if (room.game?.imageData) {
      gameImage = {
        imageData: room.game.imageData,
        promptCount: room.game.prompts.length,
        timeLimit: room.settings.timeLimit,
        roundNumber: room.roundNumber,
      };
      claimedCount = room.game.claimedPrompts.size;
    }
    callback({ room: toRoomData(room), gameImage, claimedCount });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId as string | undefined;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    room.players.delete(socket.id!);
    if (room.players.size === 0) { rooms.delete(roomId); return; }

    if (room.gameMasterId === socket.id) {
      const firstPlayer = room.players.values().next().value!;
      firstPlayer.isGameMaster = true;
      room.gameMasterId = firstPlayer.id;
    }
    io.to(roomId).emit('room:updated', toRoomData(room));
  });
}
