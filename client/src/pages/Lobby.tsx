import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../socket';

interface RoomData {
  id: string;
  players: { id: string; name: string; score: number; isGameMaster: boolean }[];
  gameMasterId: string | null;
  gameState: string;
  settings: { targetScore: number; timeLimit: number };
  roundNumber: number;
}

function Lobby() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomData | null>(null);
  const roomRef = useRef<RoomData | null>(null);
  const [targetScore, setTargetScore] = useState(5);
  const [timeLimit, setTimeLimit] = useState(90);

  useEffect(() => {
    if (!socket.connected) { navigate('/'); return; }

    const navigateToGame = (data: RoomData) => {
      if (data.gameMasterId === socket.id) {
        navigate(`/game/master/${roomId}`);
      } else {
        navigate(`/game/player/${roomId}`);
      }
    };

    const onRoomUpdated = (data: RoomData) => {
      setRoom(data);
      roomRef.current = data;
      setTargetScore(data.settings.targetScore);
      setTimeLimit(data.settings.timeLimit);
      // If game is already in progress, navigate immediately
      if (data.gameState === 'answering' || data.gameState === 'preparing') {
        navigateToGame(data);
      }
    };

    const onShowImage = () => {
      const cur = roomRef.current;
      if (cur) navigateToGame(cur);
    };

    socket.on('room:updated', onRoomUpdated);
    socket.on('game:show-image', onShowImage);

    socket.emit('room:get', (response: any) => {
      if (response.room) {
        setRoom(response.room);
        roomRef.current = response.room;
        setTargetScore(response.room.settings.targetScore);
        setTimeLimit(response.room.settings.timeLimit);
        // If game already started while we were loading
        if (response.room.gameState === 'answering' || response.room.gameState === 'preparing') {
          navigateToGame(response.room);
        }
      }
    });

    return () => {
      socket.off('room:updated', onRoomUpdated);
      socket.off('game:show-image', onShowImage);
    };
  }, [roomId, navigate]);

  const updateSettings = (newTarget: number, newTime: number) => {
    setTargetScore(newTarget);
    setTimeLimit(newTime);
    socket.emit('room:update-settings', { settings: { targetScore: newTarget, timeLimit: newTime } });
  };

  if (!room) {
    return (
      <div className="card loading">
        <div className="loading-spinner" />
        <p>ルーム情報を読み込み中...</p>
      </div>
    );
  }

  const isGameMaster = room.gameMasterId === socket.id;
  const playerCount = room.players.filter(p => !p.isGameMaster).length;

  return (
    <div>
      <div className="card">
        <p className="text-center" style={{ color: 'rgba(255,255,255,0.6)' }}>ルームID</p>
        <p className="room-id">{room.id}</p>
        <p className="text-center" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
          このIDを他のプレイヤーに共有してください
        </p>
      </div>

      <div className="card">
        <h3 className="mb-10">参加者 ({room.players.length}人)</h3>
        <ul className="player-list">
          {room.players.map(player => (
            <li key={player.id}>
              <span>{player.name}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {player.score > 0 && <span className="score-badge">{player.score}pt</span>}
                {player.isGameMaster && <span className="gm-badge">GM</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {isGameMaster && (
        <div className="card">
          <h3 className="mb-10">ゲーム設定</h3>

          <div className="form-group">
            <label>目標ポイント</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[3, 5, 7, 10].map(n => (
                <button
                  key={n}
                  className={`btn ${targetScore === n ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '10px' }}
                  onClick={() => updateSettings(n, timeLimit)}
                >
                  {n}pt
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>制限時間</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[30, 60, 90, 120].map(n => (
                <button
                  key={n}
                  className={`btn ${timeLimit === n ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '10px' }}
                  onClick={() => updateSettings(targetScore, n)}
                >
                  {n}秒
                </button>
              ))}
            </div>
          </div>

          <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 16, fontSize: '0.9rem', marginTop: 8 }}>
            {targetScore}ポイント先取 / 制限時間{timeLimit}秒
          </p>

          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={() => navigate(`/game/master/${roomId}`)}
            disabled={playerCount < 1}
          >
            {playerCount < 1 ? 'プレイヤーを待っています...' : 'プロンプト入力へ進む'}
          </button>
        </div>
      )}

      {!isGameMaster && (
        <div className="card text-center">
          <p>ゲームマスターの開始を待っています...</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8, fontSize: '0.85rem' }}>
            {room.settings.targetScore}ポイント先取 / 制限時間{room.settings.timeLimit}秒
          </p>
        </div>
      )}
    </div>
  );
}

export default Lobby;
