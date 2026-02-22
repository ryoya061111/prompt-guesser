import { Server, Socket } from 'socket.io';
import { Room, RoundResult, PlayerData, ClientToServerEvents, ServerToClientEvents } from '../types.js';
import { generateImage } from '../services/imageGenerator.js';
import { getRoom } from './roomHandler.js';

export function registerGameHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>
) {
  // GM submits prompts for this round
  socket.on('game:set-prompts', async ({ prompts }) => {
    const roomId = socket.data.roomId as string;
    const room = getRoom(roomId);
    if (!room || room.gameMasterId !== socket.id) return;

    const validPrompts = prompts.filter(p => p.trim()).map(p => p.trim());
    if (validPrompts.length === 0) return;

    room.gameState = 'preparing';
    room.roundNumber++;
    io.to(roomId).emit('room:updated', toRoomData(room));

    const combinedPrompt = validPrompts.join(', ');

    try {
      const imageData = await generateImage(combinedPrompt);

      room.game = {
        prompts: validPrompts,
        combinedPrompt,
        imageData,
        claimedPrompts: new Map(),
      };

      room.gameState = 'answering';
      io.to(roomId).emit('game:show-image', {
        imageData,
        promptCount: validPrompts.length,
        timeLimit: room.settings.timeLimit,
        roundNumber: room.roundNumber,
      });

      let remaining = room.settings.timeLimit;
      const timer = setInterval(() => {
        remaining--;
        io.to(roomId).emit('game:time-update', { remaining });
        if (remaining <= 0) {
          clearInterval(timer);
          endRound(io, room);
        }
      }, 1000);
      (room as any)._timer = timer;

      io.to(roomId).emit('room:updated', toRoomData(room));
    } catch (err) {
      console.error('Image generation failed:', err);
      socket.emit('error', { message: '画像生成に失敗しました' });
      room.gameState = 'waiting';
      room.roundNumber--;
      io.to(roomId).emit('room:updated', toRoomData(room));
    }
  });

  // Player submits a single answer
  socket.on('game:submit-answer', ({ answer }) => {
    const roomId = socket.data.roomId as string;
    const room = getRoom(roomId);
    if (!room || !room.game || room.gameState !== 'answering') return;
    if (socket.id === room.gameMasterId) return;

    const game = room.game;
    const normalizedAnswer = answer.toLowerCase().trim();
    if (!normalizedAnswer) return;

    const player = room.players.get(socket.id!);
    if (!player) return;

    // Check if answer matches any unclaimed prompt
    let matchedPrompt: string | null = null;
    for (const prompt of game.prompts) {
      const np = prompt.toLowerCase().trim();
      if (normalizedAnswer === np) {
        // Check if already claimed
        if (game.claimedPrompts.has(prompt)) {
          // Already claimed by someone
          socket.emit('game:answer-feedback', {
            correct: true,
            alreadyClaimed: true,
            message: 'そのキーワードは既に他のプレイヤーが回答済みです',
          });
          return;
        }
        matchedPrompt = prompt;
        break;
      }
    }

    if (matchedPrompt) {
      // Correct! Claim it
      game.claimedPrompts.set(matchedPrompt, { playerId: socket.id!, playerName: player.name });
      player.score += 1;

      socket.emit('game:answer-feedback', {
        correct: true,
        alreadyClaimed: false,
        message: '正解！',
      });

      // Broadcast to all
      io.to(roomId).emit('game:answer-correct', {
        playerName: player.name,
        claimedCount: game.claimedPrompts.size,
        totalCount: game.prompts.length,
      });

      io.to(roomId).emit('room:updated', toRoomData(room));

      // All prompts claimed? End round
      if (game.claimedPrompts.size >= game.prompts.length) {
        endRound(io, room);
      }
    } else {
      // Wrong
      socket.emit('game:answer-feedback', {
        correct: false,
        alreadyClaimed: false,
        message: '不正解...',
      });
    }
  });

  // GM proceeds to next round
  socket.on('game:next-round', () => {
    const roomId = socket.data.roomId as string;
    const room = getRoom(roomId);
    if (!room || room.gameMasterId !== socket.id) return;
    if (room.gameState !== 'result') return;

    room.game = null;
    room.gameState = 'waiting';
    io.to(roomId).emit('game:next-round');
    io.to(roomId).emit('room:updated', toRoomData(room));
  });

  // Full reset
  socket.on('game:reset', () => {
    const roomId = socket.data.roomId as string;
    const room = getRoom(roomId);
    if (!room || room.gameMasterId !== socket.id) return;

    for (const player of room.players.values()) player.score = 0;
    room.game = null;
    room.gameState = 'waiting';
    room.roundNumber = 0;
    io.to(roomId).emit('room:updated', toRoomData(room));
  });
}

function endRound(io: Server<ClientToServerEvents, ServerToClientEvents>, room: Room) {
  if ((room as any)._timer) {
    clearInterval((room as any)._timer);
    (room as any)._timer = null;
  }
  if (!room.game) return;

  room.gameState = 'result';
  const game = room.game;

  const claimedBy = game.prompts.map(prompt => {
    const claim = game.claimedPrompts.get(prompt);
    return { prompt, playerName: claim?.playerName ?? null };
  });

  const scores: PlayerData[] = Array.from(room.players.values())
    .filter(p => !p.isGameMaster)
    .map(p => ({ id: p.id, name: p.name, score: p.score, isGameMaster: false }))
    .sort((a, b) => b.score - a.score);

  const winner = scores.find(s => s.score >= room.settings.targetScore) ?? null;
  const isGameOver = winner !== null;

  if (isGameOver) room.gameState = 'finished';

  io.to(room.id).emit('game:round-result', {
    prompts: game.prompts,
    claimedBy,
    scores,
    isGameOver,
    winner,
  });

  if (isGameOver && winner) {
    io.to(room.id).emit('game:finished', { winner, scores });
  }

  io.to(room.id).emit('room:updated', toRoomData(room));
}

function toRoomData(room: Room) {
  return {
    id: room.id,
    players: Array.from(room.players.values()).map(p => ({
      id: p.id, name: p.name, score: p.score, isGameMaster: p.isGameMaster,
    })),
    gameMasterId: room.gameMasterId,
    gameState: room.gameState,
    settings: room.settings,
    roundNumber: room.roundNumber,
  };
}
