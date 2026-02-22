import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import ScoreBoard from '../components/ScoreBoard';

interface RoundResult {
  prompts: string[];
  claimedBy: { prompt: string; playerName: string | null }[];
  scores: { id: string; name: string; score: number }[];
  isGameOver: boolean;
  winner: { id: string; name: string; score: number } | null;
}

function GameMaster() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [prompts, setPrompts] = useState<string[]>(['', '', '']);
  const [phase, setPhase] = useState<'input' | 'generating' | 'playing' | 'result' | 'finished'>('input');
  const [currentImage, setCurrentImage] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [timeLimit, setTimeLimit] = useState(60);
  const [promptCount, setPromptCount] = useState(0);
  const [roundNumber, setRoundNumber] = useState(0);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [hintText, setHintText] = useState('');
  const [timeUpKey, setTimeUpKey] = useState<number | null>(null);

  useEffect(() => {
    if (!socket.connected) { navigate('/'); return; }

    socket.on('game:show-image', (data: any) => {
      setPhase('playing');
      setCurrentImage(data.imageData);
      setPromptCount(data.promptCount);
      setRemaining(data.timeLimit);
      setTimeLimit(data.timeLimit);
      setRoundNumber(data.roundNumber);
      setTimeUpKey(null);
    });

    socket.on('game:time-update', (data: any) => setRemaining(data.remaining));

    socket.on('game:time-up', () => {
      setTimeUpKey(Date.now());
    });

    socket.on('game:round-result', (data: RoundResult) => {
      setTimeUpKey(null);
      setPhase(data.isGameOver ? 'finished' : 'result');
      setResult(data);
    });

    socket.on('error', (data: any) => {
      console.error('Server error:', data.message);
      setPhase('input');
    });

    socket.emit('room:get', (response: any) => {
      if (response.room?.gameState === 'answering' && response.gameImage) {
        setPhase('playing');
        setCurrentImage(response.gameImage.imageData);
        setPromptCount(response.gameImage.promptCount);
        setRemaining(response.gameImage.timeLimit);
        setTimeLimit(response.gameImage.timeLimit);
        setRoundNumber(response.gameImage.roundNumber);
      }
    });

    return () => {
      socket.off('game:show-image');
      socket.off('game:time-update');
      socket.off('game:time-up');
      socket.off('game:round-result');
      socket.off('error');
    };
  }, [navigate]);

  const updatePrompt = (index: number, value: string) => {
    const np = [...prompts]; np[index] = value; setPrompts(np);
  };
  const addPrompt = () => setPrompts([...prompts, '']);
  const removePrompt = (index: number) => {
    if (prompts.length <= 1) return;
    setPrompts(prompts.filter((_, i) => i !== index));
  };

  const startRound = () => {
    const valid = prompts.filter(p => p.trim());
    if (valid.length === 0) return;
    setPhase('generating');
    socket.emit('game:set-prompts', { prompts: valid });
  };

  const nextRound = () => {
    socket.emit('game:next-round');
    setPhase('input');
    setPrompts(['', '', '']);
    setResult(null);
    setHintText('');
    setTimeUpKey(null);
  };

  const sendHint = () => {
    const trimmed = hintText.trim();
    if (!trimmed) return;
    socket.emit('game:send-hint', { text: trimmed });
    setHintText('');
  };

  const resetGame = () => {
    socket.emit('game:reset');
    navigate(`/lobby/${roomId}`);
  };

  // Prompt input phase
  if (phase === 'input') {
    return (
      <div>
        <div className="card">
          <h3 className="mb-10">ラウンド {roundNumber + 1} — プロンプト入力</h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 16, fontSize: '0.9rem' }}>
            画像に含めたいキーワードを入力してください。<br />
            全てのキーワードが1枚の画像として生成されます。
          </p>
          <div className="prompt-input-list">
            {prompts.map((prompt, i) => (
              <div key={i} className="prompt-input-row">
                <span>#{i + 1}</span>
                <input className="input" type="text" placeholder={`キーワード${i + 1}`}
                  value={prompt} onChange={(e) => updatePrompt(i, e.target.value)} />
                {prompts.length > 1 && (
                  <button className="btn btn-secondary" style={{ padding: '8px 12px' }} onClick={() => removePrompt(i)}>✕</button>
                )}
              </div>
            ))}
          </div>
          <div className="gap-10 mt-20">
            <button className="btn btn-secondary" onClick={addPrompt}>+ 追加</button>
            <button className="btn btn-primary" onClick={startRound}
              disabled={prompts.every(p => !p.trim())} style={{ flex: 1 }}>
              画像を生成
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'generating') {
    return (
      <div className="card loading">
        <div className="loading-spinner" />
        <p>画像を生成中...</p>
        <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8, fontSize: '0.9rem' }}>
          {prompts.filter(p => p.trim()).length}個のキーワードから1枚の画像を生成しています
        </p>
      </div>
    );
  }

  // Result / Finished phase
  if ((phase === 'result' || phase === 'finished') && result) {
    return (
      <div>
        <div className="card">
          <h3 className="mb-10">ラウンド {roundNumber} — 正解</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {result.prompts.map((p, i) => (
              <span key={i} style={{
                background: 'var(--teal-glow)', color: 'var(--teal)',
                padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: '0.95rem',
              }}>{p}</span>
            ))}
          </div>
          {currentImage && <img src={currentImage} alt="AI generated" className="game-image" />}
        </div>

        <div className="card">
          <h3 className="mb-10">回答結果</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {result.claimedBy.map((c, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 14px', borderRadius: 8,
                background: c.playerName ? 'rgba(78,205,196,0.1)' : 'rgba(255,100,100,0.1)',
                border: '1px solid',
                borderColor: c.playerName ? 'rgba(78,205,196,0.2)' : 'rgba(255,100,100,0.15)',
              }}>
                <span style={{ fontWeight: 700, color: c.playerName ? 'var(--teal)' : '#ff6b6b' }}>{c.prompt}</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {c.playerName ?? '誰も回答できず'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <ScoreBoard scores={result.scores} />
        </div>

        {phase === 'finished' && result.winner ? (
          <div>
            <div className="winner-banner">
              <h2>ゲーム終了！</h2>
              <p style={{ fontSize: '1.5rem' }}>{result.winner.name} の勝利！</p>
              <p style={{ color: 'rgba(255,255,255,0.6)' }}>{result.winner.score} ポイント</p>
            </div>
            <button className="btn btn-primary mt-20" style={{ width: '100%' }} onClick={resetGame}>
              ロビーに戻る
            </button>
          </div>
        ) : (
          <button className="btn btn-primary mt-20" style={{ width: '100%' }} onClick={nextRound}>
            次のラウンドへ
          </button>
        )}
      </div>
    );
  }

  // Playing phase
  const barPct = Math.max(0, remaining / timeLimit) * 100;
  const barColor = remaining > timeLimit * 0.5
    ? 'var(--teal)'
    : remaining > timeLimit * 0.25
      ? 'var(--gold)'
      : 'var(--accent)';

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>ラウンド {roundNumber}</h3>
          <div className={`timer ${remaining <= 10 ? 'warning' : ''}`}>{remaining}s</div>
        </div>
        {/* タイマーバー */}
        <div className="timer-bar-track">
          <div className="timer-bar-fill" style={{ width: `${barPct}%`, backgroundColor: barColor }} />
        </div>
        {/* 画像エリア（時間切れオーバーレイ付き） */}
        <div style={{ position: 'relative', marginTop: 14 }}>
          {currentImage && <img src={currentImage} alt="AI generated" className="game-image" style={{ margin: 0 }} />}
          {timeUpKey !== null && (
            <div key={timeUpKey} className="time-up-overlay">
              <div className="time-up-emoji">⏰</div>
              <div className="time-up-title">時間切れ！</div>
            </div>
          )}
        </div>
        <p className="text-center mt-10" style={{ color: 'rgba(255,255,255,0.5)' }}>
          プレイヤーが {promptCount}個のキーワードを推測中...
        </p>
      </div>

      <div className="card">
        <h3 className="mb-10">ヒントを送る</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            type="text"
            placeholder="ヒントを入力..."
            value={hintText}
            onChange={(e) => setHintText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendHint()}
            disabled={timeUpKey !== null}
            style={{ flex: 1 }}
          />
          <button className="btn btn-secondary" onClick={sendHint} disabled={!hintText.trim() || timeUpKey !== null}>
            送信
          </button>
        </div>
      </div>
    </div>
  );
}

export default GameMaster;
