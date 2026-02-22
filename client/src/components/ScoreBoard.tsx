interface Score {
  id: string;
  name: string;
  score: number;
}

function ScoreBoard({ scores }: { scores: Score[] }) {
  return (
    <div>
      <h4 style={{ marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}>スコアボード</h4>
      <ul className="player-list">
        {scores.map((player, index) => (
          <li key={player.id}>
            <span>
              {index === 0 && '👑 '}
              {player.name}
            </span>
            <span className="score-badge">{player.score}pt</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ScoreBoard;
