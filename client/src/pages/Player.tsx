import { useEffect, useState } from 'react';
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
  const [promptCount, setPromptCount] = useState(0);
  const [roundNumber, setRoundNumber] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; type: 'correct' | 'wrong' | 'claimed' } | null>(null);
  const [claimedWords, setClaimedWords] = useState<ClaimedWord[]>([]);
  const [result, setResult] = useState<RoundResult | null>(null);

  useEffect(() => {
    if (!socket.connected) { navigate('/'); return; }

    socket.on('game:show-image', (data: any) => {
      setPhase('answering');
      setCurrentImage(data.imageData);
      setPromptCount(data.promptCount);
      setRemaining(data.timeLimit);
      setRoundNumber(data.roundNumber);
      setAnswer('');
      setFeedback(null);
      setClaimedWords([]);
      setResult(null);
    });

    socket.on('game:time-update', (data: any) => setRemaining(data.remaining));

    socket.on('game:answer-feedback', (data: any) => {
      if (data.correct && !data.alreadyClaimed) {
        setFeedback({ message: data.message, type: 'correct' });
        setAnswer('');
      } else if (data.correct && data.alreadyClaimed) {
        setFeedback({ message: data.message, type: 'claimed' });
      } else {
        setFeedback({ message: data.message, type: 'wrong' });
      }
      // Clear feedback after 2s
      setTimeout(() => setFeedback(null), 2000);
    });

    socket.on('game:answer-correct', (data: any) => {
      setClaimedWords(prev => [...prev, { word: '???', playerName: data.playerName }]);
      // Update claimed count from broadcast
    });

    socket.on('game:round-result', (data: RoundResult) => {
      setPhase(data.isGameOver ? 'finished' : 'result');
      setResult(data);
    });

    socket.on('game:next-round', () => {
      setPhase('waiting');
      setResult(null);
      setClaimedWords([]);
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
        setRoundNumber(response.gameImage.roundNumber);
      }
    });

    return () => {
      socket.off('game:show-image');
      socket.off('game:time-update');
      socket.off('game:answer-feedback');
      socket.off('game:answer-correct');
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
                <span style={{
                  fontWeight: 700,
                  color: c.playerName ? 'var(--teal)' : '#ff6b6b',
                }}>{c.prompt}</span>
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

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3>ラウンド {roundNumber}</h3>
          <div className={`timer ${remaining <= 10 ? 'warning' : ''}`}>{remaining}s</div>
        </div>

        {/* 画像 + 正解状況を横並び */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {currentImage && (
            <img src={currentImage} alt="AI generated" className="game-image"
              style={{ flex: '0 0 auto', width: '58%', margin: 0 }} />
          )}
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
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-10">キーワードを入力</h3>

        {feedback && (
          <div style={{
            padding: '12px 18px', borderRadius: 8, marginBottom: 14,
            background: feedback.type === 'correct' ? 'rgba(78,205,196,0.15)'
              : feedback.type === 'claimed' ? 'rgba(255,165,0,0.15)'
              : 'rgba(255,100,100,0.15)',
            color: feedback.type === 'correct' ? 'var(--teal)'
              : feedback.type === 'claimed' ? '#ffaa00'
              : '#ff6b6b',
            fontWeight: 600, fontSize: '1rem',
          }}>
            {feedback.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            type="text"
            placeholder="キーワードを推測"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
            autoFocus
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={submitAnswer} disabled={!answer.trim()}>
            回答
          </button>
        </div>
      </div>
    </div>
  );
}

export default Player;
