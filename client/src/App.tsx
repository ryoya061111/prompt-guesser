import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import GameMaster from './pages/GameMaster';
import Player from './pages/Player';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <h1 className="app-title">Prompt Guess</h1>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lobby/:roomId" element={<Lobby />} />
          <Route path="/game/master/:roomId" element={<GameMaster />} />
          <Route path="/game/player/:roomId" element={<Player />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
