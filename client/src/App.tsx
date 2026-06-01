import { useEffect, useState } from 'react';
import { socketClient } from './services/SocketClient';
import { initPhaserGame, destroyPhaserGame } from './game/PhaserGame';

interface PlayerInfo {
  id: string;
  color: 'RED' | 'GREEN' | 'YELLOW' | 'BLUE';
}

function App() {
  const [gameState, setGameState] = useState<'LOBBY' | 'GAME'>('LOBBY');
  const [roomId, setRoomId] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [activePlayerId, setActivePlayerId] = useState('');
  const [currentTurnMsg, setCurrentTurnMsg] = useState('Waiting for dice roll...');
  const [diceRollValue, setDiceRollValue] = useState<number | null>(null);

  useEffect(() => {
    socketClient.connect('http://localhost:3001');

    socketClient.on('ROOM_CREATED', (data: any) => {
      setRoomId(data.roomId);
    });

    socketClient.on('PLAYER_JOINED', (data: any) => {
      console.log('Player joined room, count:', data.playersCount);
    });

    socketClient.on('MATCH_START', (data: any) => {
      setPlayers(data.players);
      setActivePlayerId(data.activePlayerId);
      setGameState('GAME');
    });

    socketClient.on('TURN_CHANGED', (data: any) => {
      setActivePlayerId(data.activePlayerId);
      setDiceRollValue(null);
      const activeColor = players.find(p => p.id === data.activePlayerId)?.color || 'Player';
      const isMyTurn = data.activePlayerId === socketClient.socket?.id || data.activePlayerId.includes(socketClient.socket?.id || '');
      setCurrentTurnMsg(isMyTurn ? "Your turn! Tap the dice." : `${activeColor}'s turn.`);
    });

    socketClient.on('DICE_RESULT', (data: any) => {
      setDiceRollValue(data.rollValue);
      const activeColor = players.find(p => p.id === data.playerId)?.color || 'Player';
      setCurrentTurnMsg(`${activeColor} rolled a ${data.rollValue}!`);
    });

    socketClient.on('ERROR', (data: any) => {
      alert(data.message || 'An error occurred');
    });

    return () => {
      destroyPhaserGame();
    };
  }, [players]);

  useEffect(() => {
    if (gameState === 'GAME') {
      initPhaserGame('phaser-container');
    } else {
      destroyPhaserGame();
    }
  }, [gameState]);

  const handleMatchmaking = () => {
    socketClient.emit('REQ_JOIN_MATCHMAKING');
  };

  const handlePrivateRoom = () => {
    socketClient.emit('REQ_CREATE_PRIVATE_ROOM');
  };

  const handleJoinPrivateRoom = () => {
    if (!inputRoomId.trim()) return;
    socketClient.emit('REQ_JOIN_PRIVATE_ROOM', { roomId: inputRoomId.toUpperCase().trim() });
    setRoomId(inputRoomId.toUpperCase().trim());
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-stone-900 via-stone-950 to-black text-white flex flex-col items-center justify-center font-sans p-4">
      
      {/* Premium Header */}
      <div className="text-center mb-6">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 drop-shadow-2xl">
          LUDO MULTIPLAYER
        </h1>
        <p className="text-xs text-amber-500/80 tracking-widest mt-2 uppercase">Authoritative Real-Time Board Engine</p>
      </div>
      
      {gameState === 'LOBBY' && (
        <div className="flex flex-col gap-5 bg-gradient-to-b from-stone-800 to-stone-900 p-8 rounded-2xl shadow-[0_0_50px_rgba(212,175,55,0.15)] border-2 border-amber-950/60 w-full max-w-md backdrop-blur-md">
          <h2 className="text-xl font-bold text-amber-400/90 text-center uppercase tracking-widest border-b border-amber-950/40 pb-3 mb-2">Game Lobby</h2>
          
          <button 
            onClick={handleMatchmaking}
            className="w-full py-4 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-black rounded-xl transition-all shadow-[0_4px_20px_rgba(217,119,6,0.3)] border border-amber-500/30 transform hover:-translate-y-0.5 active:translate-y-0 active:scale-98 cursor-pointer"
          >
            PLAY ONLINE (MATCHMAKING)
          </button>
          
          <div className="relative my-2 flex items-center justify-center">
            <span className="absolute bg-stone-850 px-4 text-xs font-semibold tracking-wider text-stone-500 uppercase">OR</span>
            <hr className="w-full border-stone-800" />
          </div>

          <button 
            onClick={handlePrivateRoom}
            className="w-full py-3.5 bg-stone-750 hover:bg-stone-700 text-stone-200 font-bold rounded-xl transition-all border border-stone-700/50 shadow-md transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          >
            CREATE PRIVATE ROOM
          </button>

          {/* Join Private Room Section */}
          <div className="flex gap-2 mt-2">
            <input 
              type="text" 
              placeholder="ENTER ROOM ID" 
              value={inputRoomId}
              onChange={(e) => setInputRoomId(e.target.value)}
              className="flex-1 bg-stone-950/80 border border-stone-800 focus:border-amber-600/80 focus:ring-1 focus:ring-amber-600 rounded-xl px-4 py-3 text-center font-mono tracking-widest text-amber-400 placeholder:text-stone-600 uppercase outline-none transition-all"
            />
            <button 
              onClick={handleJoinPrivateRoom}
              className="bg-amber-600/25 hover:bg-amber-600/90 border border-amber-600/40 hover:border-amber-500 text-amber-300 hover:text-white font-bold px-5 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
            >
              JOIN
            </button>
          </div>
          
          {roomId && (
            <div className="mt-4 p-5 bg-stone-950/60 rounded-xl border border-amber-950/60 text-center animate-fade-in">
              <p className="text-stone-500 text-xs font-bold uppercase tracking-wider">Your Room Code</p>
              <p className="text-3xl font-mono font-black tracking-widest text-amber-400 mt-1 select-all">{roomId}</p>
              
              <div className="flex items-center justify-center gap-2 mt-2 text-stone-400 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                <span>Waiting for players to connect...</span>
              </div>
              
              <button 
                onClick={() => socketClient.emit('REQ_START_GAME', { roomId })}
                className="w-full mt-4 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-black rounded-xl transition-all shadow-[0_4px_15px_rgba(16,185,129,0.2)] border border-emerald-500/20 cursor-pointer"
              >
                FORCE START MATCH
              </button>
            </div>
          )}
        </div>
      )}

      {gameState === 'GAME' && (
        <div className="flex flex-col xl:flex-row gap-6 w-full max-w-6xl justify-center items-stretch animate-fade-in">
          
          {/* Active Player Panel */}
          <div className="xl:w-64 bg-stone-900/90 rounded-2xl p-5 border border-stone-850 flex flex-col shadow-xl">
            <h3 className="text-xs font-black text-amber-500 tracking-widest uppercase border-b border-stone-850 pb-2.5 mb-4">
              PLAYERS IN MATCH
            </h3>
            <div className="flex flex-col gap-3 flex-1 justify-start">
              {players.map((player) => {
                const isActive = player.id === activePlayerId;
                const isMe = player.id === socketClient.socket?.id;
                
                // Color badges
                const colorMap = {
                  RED: 'bg-red-500/20 text-red-400 border-red-500/30',
                  GREEN: 'bg-green-500/20 text-green-400 border-green-500/30',
                  YELLOW: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
                  BLUE: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
                };

                return (
                  <div 
                    key={player.id} 
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      isActive 
                        ? 'bg-amber-950/20 border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.1)] scale-102 font-bold' 
                        : 'bg-stone-950/40 border-stone-850'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        player.color === 'RED' ? 'bg-red-500' :
                        player.color === 'GREEN' ? 'bg-green-500' :
                        player.color === 'YELLOW' ? 'bg-yellow-500' : 'bg-blue-500'
                      } ${isActive ? 'animate-pulse' : ''}`}></span>
                      <span className="text-sm tracking-wide text-stone-250 truncate max-w-[120px]">
                        {isMe ? 'YOU (Guest)' : `Player (${player.color})`}
                      </span>
                    </div>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-wider ${colorMap[player.color]}`}>
                      {player.color}
                    </span>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-4 p-3 bg-stone-950/50 rounded-xl border border-stone-850 text-center">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Room ID</span>
              <span className="font-mono text-sm tracking-wider text-amber-500/80 font-bold">{roomId || 'Multiplayer'}</span>
            </div>
          </div>
          
          {/* Main Board Container */}
          <div className="relative rounded-3xl overflow-hidden shadow-[0_10px_50px_rgba(0,0,0,0.8)] border-4 border-amber-950/80 flex items-center justify-center bg-stone-950 aspect-square max-w-[800px] w-full mx-auto">
            <div id="phaser-container" className="w-full h-full max-w-[800px] max-h-[800px] aspect-square"></div>
          </div>
          
          {/* Interactive Game Action Console */}
          <div className="xl:w-64 bg-stone-900/90 rounded-2xl p-5 border border-stone-850 flex flex-col justify-between shadow-xl">
            <div>
              <h3 className="text-xs font-black text-amber-500 tracking-widest uppercase border-b border-stone-850 pb-2.5 mb-4">
                GAME CONSOLE
              </h3>
              
              <div className="p-4 bg-stone-950/70 rounded-xl border border-stone-850/80 text-center shadow-inner min-h-[90px] flex flex-col justify-center items-center">
                <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5">Game State</p>
                <p className="text-sm font-bold text-amber-400 tracking-wide leading-relaxed">
                  {currentTurnMsg}
                </p>
              </div>

              {diceRollValue !== null && (
                <div className="mt-4 p-3 bg-gradient-to-r from-amber-600/10 to-amber-500/5 rounded-xl border border-amber-500/20 text-center animate-bounce">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">LAST ROLL</span>
                  <span className="text-4xl font-extrabold text-amber-400 mt-1 block">{['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][diceRollValue - 1] || diceRollValue}</span>
                </div>
              )}
            </div>

            {/* Quick Action Controls */}
            <div className="mt-6 flex flex-col gap-2">
              <button 
                onClick={() => socketClient.emit('REQ_ROLL_DICE')}
                disabled={!(activePlayerId === socketClient.socket?.id || activePlayerId.includes(socketClient.socket?.id || '')) || diceRollValue !== null}
                className="w-full py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-stone-800 disabled:to-stone-805 disabled:text-stone-500 disabled:border-stone-850 disabled:shadow-none text-white font-extrabold rounded-xl text-md shadow-[0_4px_15px_rgba(220,38,38,0.25)] border border-red-500/20 transition-all active:scale-98 cursor-pointer disabled:cursor-not-allowed"
              >
                ROLL DICE
              </button>
              
              <p className="text-[9px] text-stone-500 text-center tracking-wide leading-normal px-2 mt-1">
                Tip: You can also tap directly on the center Dice inside the game board!
              </p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

export default App;
