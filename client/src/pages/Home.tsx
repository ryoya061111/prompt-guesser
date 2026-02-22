import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';

function Home() {
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const ensureConnected = () => {
    if (!socket.connected) {
      socket.connect();
    }
  };

  const createRoom = () => {
    if (!playerName.trim()) {
      setError('名前を入力してください');
      return;
    }
    ensureConnected();

    socket.emit('room:create', { playerName: playerName.trim() }, (response: { roomId: string }) => {
      navigate(`/lobby/${response.roomId}`);
    });
  };

  const joinRoom = () => {
    if (!playerName.trim()) {
      setError('名前を入力してください');
      return;
    }
    if (!roomId.trim()) {
      setError('ルームIDを入力してください');
      return;
    }
    ensureConnected();

    socket.emit('room:join', { roomId: roomId.trim().toUpperCase(), playerName: playerName.trim() }, (response: { success: boolean; error?: string }) => {
      if (response.success) {
        navigate(`/lobby/${roomId.trim().toUpperCase()}`);
      } else {
        setError(response.error || 'ルームに参加できませんでした');
      }
    });
  };

  return (
    <div>
      <div className="card">
        <p style={{ textAlign: 'center', marginBottom: 20, color: 'rgba(255,255,255,0.6)' }}>
          AIが生成した画像からプロンプトを当てるゲーム
        </p>

        <div className="form-group">
          <label>プレイヤー名</label>
          <input
            className="input"
            type="text"
            placeholder="名前を入力"
            value={playerName}
            onChange={(e) => { setPlayerName(e.target.value); setError(''); }}
            maxLength={20}
          />
        </div>

        {error && <p style={{ color: '#ff6b6b', marginBottom: 16, fontSize: '0.9rem' }}>{error}</p>}

        <div className="mt-20">
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={createRoom}>
            ルームを作成（ゲームマスター）
          </button>
        </div>

        <div className="divider">または</div>

        <div className="form-group">
          <label>ルームID</label>
          <input
            className="input"
            type="text"
            placeholder="4文字のルームID"
            value={roomId}
            onChange={(e) => { setRoomId(e.target.value.toUpperCase()); setError(''); }}
            maxLength={4}
            style={{ textAlign: 'center', letterSpacing: '0.3em', fontSize: '1.2rem' }}
          />
        </div>

        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={joinRoom}>
          ルームに参加
        </button>
      </div>
    </div>
  );
}

export default Home;
