import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket } from '../socket';
import ScoreBoard from '../components/ScoreBoard';

interface RoundResult {
  prompts: string[];
  claimedBy: { prompt: string; playerName: string | null }[];
  scores: { id: string; name: string; score: number }[];
  isGameOver: boolean;
  winner: { id: string; name: string; score: number } | null;
}

interface ClaimedWord {
  word: string;
  playerName: string;
}

function Player() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'waiting' | 'answering' | 'result' | 'finished'>('waiting');
  const [currentImage, setCurrentImage] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [timeLimit, setTimeLimit] = useState(60);
  const [promptCount, setPromptCount] = useState(0);
  const [roundNumber, setRoundNumber] = useState(0);
  const [answer, setAnswer] = useState('');
  const [wrongFeedback, setWrongFeedback] = useState<string | null>(null);
  const [correctFlashKey, setCorrectFlashKey] = useState<number | null>(null);
  const [allClearKey, setAllClearKey] = useState<number | null>(null);
  const [timeUpKey, setTimeUpKey] = useState<number | null>(null);
  const flashActiveRef = useRef(false);
  const [claimedWords, setClaimedWords] = useState<ClaimedWord[]>([]);
  const [hints, setHints] = useState<string[]>([]);
  const [result, setResult] = useState<RoundResult | null>(null);

  useEffect(() => {
    if (!socket.connected) { navigate('/'); return; }

    socket.on('game:show-image', (data: any) => {
      setPhase('answering');
      setCurrentImage(data.imageData);
      setPromptCount(data.promptCount);
      setRemaining(data.timeLimit);
      setTimeLimit(data.timeLimit);
      setRoundNumber(data.roundNumber);
      setAnswer('');
      setWrongFeedback(null);
      setCorrectFlashKey(null);
      setAllClearKey(null);
      setTimeUpKey(null);
      setClaimedWords([]);
      setHints([]);
      setResult(null);
      flashActiveRef.current = false;
    });

    socket.on('game:time-update', (data: any) => setRemaining(data.remaining));

    socket.on('game:time-up', () => {
      setTimeUpKey(Date.now());
      // Clear any active correct flash
      setCorrectFlashKey(null);
      flashActiveRef.current = false;
    });

    socket.on('game:answer-feedback', (data: any) => {
      if (data.correct && !data.alreadyClaimed) {
        setAnswer('');
        const key = Date.now();
        flashActiveRef.current = true;
        setCorrectFlashKey(key);
        setTimeout(() => {
          flashActiveRef.current = false;
          setCorrectFlashKey(null);
        }, 2000);
      } else {
        setWrongFeedback(data.alreadyClaimed ? 'already' : 'wrong');
        setTimeout(() => setWrongFeedback(null), 1200);
      }
    });

    socket.on('game:answer-correct', (data: any) => {
      setClaimedWords(prev => [...prev, { word: '???', playerName: data.playerName }]);
    });

    socket.on('game:hint', (data: any) => {
      setHints(prev => [...prev, data.text]);
    });

    socket.on('game:round-result', (data: RoundResult) => {
      const allClaimed = data.claimedBy.every(c => c.playerName !== null);

      const applyResult = () => {
        setAllClearKey(null);
        setTimeUpKey(null);
        flashActiveRef.current = false;
        setCorrectFlashKey(null);
        setPhase(data.isGameOver ? 'finished' : 'result');
        setResult(data);
      };

      if (allClaimed) {
        // 全問正解アナウンスを3秒表示してから結果へ
        setAllClearKey(Date.now());
        flashActiveRef.current = true;
        setTimeout(applyResult, 3200);
      } else if (flashActiveRef.current) {
        setTimeout(applyResult, 2100);
      } else {
        applyResult();
      }
    });

    socket.on('game:next-round', () => {
      setPhase('waiting');
      setResult(null);
      setClaimedWords([]);
      setTimeUpKey(null);
    });

    socket.on('room:updated', (data: any) => {
      if (data.gameState === 'waiting' && data.roundNumber === 0) {
        navigate(`/lobby/${roomId}`);
      }
    });

    socket.emit('room:get', (response: any) => {
      if (response.room?.gameState === 'answering' && response.gameImage) {
        setPhase('answering');
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
      socket.off('game:answer-feedback');
      socket.off('game:answer-correct');
      socket.off('game:hint');
      socket.off('game:round-result');
      socket.off('game:next-round');
      socket.off('room:updated');
    };
  }, [navigate, roomId]);

  const submitAnswer = () => {
    const trimmed = answer.trim();
    if (!trimmed) return;
    socket.emit('game:submit-answer', { answer: trimmed });
  };

  if (phase === 'waiting') {
    return (
      <div className="card loading">
        <div className="loading-spinner" />
        <p>ゲームマスターが次のラウンドを準備中...</p>
      </div>
    );
  }

  // Result / Finished
  if ((phase === 'result' || phase === 'finished') && result) {
    return (
      <div>
        <div className="card">
          <h3 className="mb-10">ラウンド {roundNumber} — 結果</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
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
          {currentImage && <img src={currentImage} alt="AI generated" className="game-image" />}
        </div>

        <div className="card">
          <ScoreBoard scores={result.scores} />
        </div>

        {phase === 'finished' && result.winner ? (
          <div className="winner-banner">
            <h2>ゲーム終了！</h2>
            <p style={{ fontSize: '1.5rem' }}>{result.winner.name} の勝利！</p>
            <p style={{ color: 'rgba(255,255,255,0.6)' }}>{result.winner.score} ポイント</p>
          </div>
        ) : (
          <div className="card text-center">
            <p style={{ color: 'var(--text-muted)' }}>ゲームマスターが次のラウンドを開始するのを待っています...</p>
          </div>
        )}
      </div>
    );
  }

  // Answering phase
  const claimedCount = claimedWords.length;
  const barPct = Math.max(0, remaining / timeLimit) * 100;
  const barColor = remaining > timeLimit * 0.5
    ? 'var(--teal)'
    : remaining > timeLimit * 0.25
      ? 'var(--gold)'
      : 'var(--accent)';

  return (
    <div>
      <div className="card">
        {/* ヘッダー：ラウンド番号 + タイマー */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>ラウンド {roundNumber}</h3>
          <div className={`timer ${remaining <= 10 ? 'warning' : ''}`}>{remaining}s</div>
        </div>
        {/* タイマーバー */}
        <div className="timer-bar-track">
          <div className="timer-bar-fill" style={{ width: `${barPct}%`, backgroundColor: barColor }} />
        </div>

        {/* 画像 + 正解状況を横並び */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginTop: 14 }}>
          {/* 画像エリア（エフェクトオーバーレイ付き） */}
          <div style={{ position: 'relative', flex: '0 0 auto', width: '75%' }}>
            {currentImage && (
              <img src={currentImage} alt="AI generated" className="game-image" style={{ margin: 0 }} />
            )}
            {correctFlashKey !== null && !allClearKey && !timeUpKey && (
              <div key={correctFlashKey} className="correct-flash-overlay">
                <div className="correct-flash-ring" />
                <div className="correct-flash-check">✓</div>
                <div className="correct-flash-label">正解！</div>
              </div>
            )}
            {allClearKey !== null && (
              <div key={allClearKey} className="all-clear-overlay">
                <div className="all-clear-ring" />
                <div className="all-clear-ring all-clear-ring-2" />
                <div className="all-clear-emoji">🎊</div>
                <div className="all-clear-title">全問クリア！</div>
                <div className="all-clear-sub">すべてのキーワードが正解されました</div>
              </div>
            )}
            {timeUpKey !== null && (
              <div key={timeUpKey} className="time-up-overlay">
                <div className="time-up-emoji">⏰</div>
                <div className="time-up-title">時間切れ！</div>
              </div>
            )}
          </div>

          {/* 右パネル */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.5)' }}>
              <span style={{ color: 'var(--teal)', fontWeight: 800, fontSize: '1.6rem' }}>{claimedCount}</span>
              <span style={{ margin: '0 6px' }}>/</span>
              <span style={{ fontSize: '1.1rem' }}>{promptCount}</span>
              <div style={{ fontSize: '0.85rem', marginTop: 2 }}>正解済み</div>
            </div>
            {claimedWords.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {claimedWords.map((cw, i) => (
                  <span key={i} style={{
                    padding: '7px 12px', borderRadius: 8, fontSize: '0.9rem',
                    background: 'rgba(78,205,196,0.15)', color: 'var(--teal)',
                    border: '1px solid rgba(78,205,196,0.25)',
                  }}>
                    {cw.playerName} が正解
                  </span>
                ))}
              </div>
            )}
            {hints.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ヒント</div>
                {hints.map((h, i) => (
                  <span key={i} style={{
                    padding: '7px 12px', borderRadius: 8, fontSize: '0.9rem',
                    background: 'rgba(255,215,0,0.1)', color: 'var(--gold)',
                    border: '1px solid rgba(255,215,0,0.25)',
                  }}>
                    {h}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-10">キーワードを入力</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className={`input ${wrongFeedback === 'wrong' ? 'input-shake input-wrong' : wrongFeedback === 'already' ? 'input-shake input-claimed' : ''}`}
            type="text"
            placeholder="キーワードを推測"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
            autoFocus
            disabled={timeUpKey !== null}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={submitAnswer} disabled={!answer.trim() || timeUpKey !== null}>
            回答
          </button>
        </div>
      </div>
    </div>
  );
}

export default Player;
