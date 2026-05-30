const { Server } = require('socket.io');

const io = new Server(8080, {
  cors: {
    origin: "http://localhost:3000"
  }
});

const rooms = {};

const WORDS = [
  "apple", "banana", "cat", "dog", "elephant", "flower", "house", "sun", "moon", "tree",
  "car", "airplane", "boat", "computer", "phone", "guitar", "pizza", "burger", "chair", 
  "table", "clock", "shoe", "bird", "lion", "monkey", "rocket", "train", "pencil", "window",
  "camera", "spider", "cheese", "jacket", "rabbit", "castle", "cookie", "cactus", "violin"
];

function getRoomPayload(room) {
  const currentDrawer = room.activeDrawersInRound && room.activeDrawersInRound[room.turnIndex];
  return {
    id: room.id,
    players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score, disconnected: !!p.disconnected })),
    gameState: room.gameState,
    round: room.round,
    turnIndex: room.turnIndex,
    timeLeft: room.timeLeft,
    drawerId: currentDrawer ? currentDrawer.id : null,
    drawerName: currentDrawer ? currentDrawer.name : null,
  };
}

function checkLobbyStart(room) {
  if (room.gameState !== 'LOBBY') return;

  const activePlayers = room.players.filter(p => !p.disconnected);
  const count = activePlayers.length;

  if (count >= 5) {
    if (room.countdownInterval) {
      clearInterval(room.countdownInterval);
      room.countdownInterval = null;
    }
    startGame(room);
  } else if (count >= 2) {
    if (!room.countdownInterval) {
      room.countdown = 10;
      io.to(room.id).emit('lobby-countdown', room.countdown);
      room.countdownInterval = setInterval(() => {
        room.countdown -= 1;
        io.to(room.id).emit('lobby-countdown', room.countdown);
        if (room.countdown <= 0) {
          clearInterval(room.countdownInterval);
          room.countdownInterval = null;
          startGame(room);
        }
      }, 1000);
    }
  } else {
    if (room.countdownInterval) {
      clearInterval(room.countdownInterval);
      room.countdownInterval = null;
      io.to(room.id).emit('lobby-countdown', null);
    }
  }
}

function startGame(room) {
  room.gameState = 'PLAYING';
  room.round = 1;
  room.turnIndex = 0;
  room.activeDrawersInRound = [...room.players];
  io.to(room.id).emit('room-state', getRoomPayload(room));
  startTurn(room);
}

function startTurn(room) {
  if (room.gameState !== 'PLAYING') return;

  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }

  // Ensure active drawers exists
  if (!room.activeDrawersInRound || room.activeDrawersInRound.length === 0) {
    room.activeDrawersInRound = [...room.players];
  }

  const drawer = room.activeDrawersInRound[room.turnIndex];
  if (!drawer || drawer.disconnected) {
    advanceTurnIndex(room);
    return;
  }

  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  room.currentWord = word;
  room.hasGuessed = new Set();
  room.timeLeft = 60;

  room.players.forEach(p => {
    if (p.disconnected) return;
    const playerSocket = io.sockets.sockets.get(p.id);
    if (playerSocket) {
      playerSocket.emit('turn-start', {
        drawerId: drawer.id,
        drawerName: drawer.name,
        word: p.id === drawer.id ? word : "_ ".repeat(word.length).trim(),
        round: room.round,
        timeLeft: room.timeLeft
      });
    }
  });

  io.to(room.id).emit('chat-message', {
    senderName: 'System',
    text: `${drawer.name} is drawing now!`,
    channel: 'public'
  });

  io.to(room.id).emit('draw-event', { type: 'clear' });
  io.to(room.id).emit('room-state', getRoomPayload(room));

  room.timerInterval = setInterval(() => {
    room.timeLeft -= 1;
    io.to(room.id).emit('timer-update', room.timeLeft);
    if (room.timeLeft <= 0) {
      clearInterval(room.timerInterval);
      room.timerInterval = null;
      endTurn(room);
    }
  }, 1000);
}

function endTurn(room) {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }

  if (room.gameState !== 'PLAYING') return;

  const drawer = room.activeDrawersInRound[room.turnIndex];
  const guessers = room.players.filter(p => (!drawer || p.id !== drawer.id) && !p.disconnected);
  if (drawer && guessers.length > 0) {
    const ratio = room.hasGuessed.size / guessers.length;
    const drawerPoints = Math.round(ratio * 100);
    drawer.score += drawerPoints;
  }

  advanceTurnIndex(room);
}

function advanceTurnIndex(room) {
  room.turnIndex += 1;
  if (room.turnIndex >= room.activeDrawersInRound.length) {
    room.turnIndex = 0;
    room.round += 1;
    room.activeDrawersInRound = [...room.players];
  }

  if (room.round > 3) {
    endGame(room);
  } else {
    io.to(room.id).emit('turn-end', { word: room.currentWord });
    setTimeout(() => {
      const nextDrawer = room.activeDrawersInRound[room.turnIndex];
      if (nextDrawer && nextDrawer.disconnected) {
        advanceTurnIndex(room);
      } else {
        startTurn(room);
      }
    }, 5000);
  }
}

function endGame(room) {
  room.gameState = 'GAME_OVER';
  io.to(room.id).emit('room-state', getRoomPayload(room));
  const sortedPlayers = [...room.players]
    .sort((a, b) => b.score - a.score)
    .map(p => ({ id: p.id, name: p.name, score: p.score, disconnected: !!p.disconnected }));
  const winner = sortedPlayers[0] ? sortedPlayers[0].name : 'Nobody';
  io.to(room.id).emit('game-over', {
    players: sortedPlayers,
    winner: winner
  });
}

io.on("connection", (socket) => {
  const username = socket.handshake.auth.username || 'Anonymous';
  socket.username = username;

  // Rejoin Logic
  let targetRoom = null;
  let rejoinedPlayer = null;

  for (const r of Object.values(rooms)) {
    const p = r.players.find(pl => pl.name.toLowerCase() === username.toLowerCase());
    if (p) {
      targetRoom = r;
      rejoinedPlayer = p;
      break;
    }
  }

  if (targetRoom && rejoinedPlayer) {
    rejoinedPlayer.id = socket.id;
    rejoinedPlayer.disconnected = false;

    if (rejoinedPlayer.disconnectTimeout) {
      clearTimeout(rejoinedPlayer.disconnectTimeout);
      delete rejoinedPlayer.disconnectTimeout;
    }

    socket.join(targetRoom.id);
    socket.roomId = targetRoom.id;

    io.to(targetRoom.id).emit('room-state', getRoomPayload(targetRoom));

    if (targetRoom.gameState === 'PLAYING') {
      const drawer = targetRoom.activeDrawersInRound[targetRoom.turnIndex];
      const isDrawer = drawer && drawer.id === socket.id;
      
      socket.emit('turn-start', {
        drawerId: drawer ? drawer.id : null,
        drawerName: drawer ? drawer.name : null,
        word: isDrawer ? targetRoom.currentWord : "_ ".repeat(targetRoom.currentWord.length).trim(),
        round: targetRoom.round,
        timeLeft: targetRoom.timeLeft
      });
    } else {
      checkLobbyStart(targetRoom);
    }
    return;
  }

  // Matchmaking: Find oldest incomplete lobby or active game with space (< 5 players)
  const incompleteRooms = Object.values(rooms).filter(r => r.players.length < 5 && r.gameState !== 'GAME_OVER');
  incompleteRooms.sort((a, b) => a.createdAt - b.createdAt);

  if (incompleteRooms.length > 0) {
    targetRoom = incompleteRooms[0];
  } else {
    const roomId = "room_" + Math.random().toString(36).substring(2, 9);
    rooms[roomId] = {
      id: roomId,
      createdAt: Date.now(),
      players: [],
      gameState: 'LOBBY',
      round: 1,
      turnIndex: 0,
      currentWord: '',
      timeLeft: 60,
      timerInterval: null,
      countdown: null,
      countdownInterval: null,
      activeDrawersInRound: []
    };
    targetRoom = rooms[roomId];
  }

  socket.join(targetRoom.id);
  socket.roomId = targetRoom.id;

  const newPlayer = {
    id: socket.id,
    name: username,
    score: 0,
    disconnected: false
  };
  targetRoom.players.push(newPlayer);

  io.to(targetRoom.id).emit('room-state', getRoomPayload(targetRoom));

  if (targetRoom.gameState === 'PLAYING') {
    // If joining mid-game, trigger turn context sync for them
    const drawer = targetRoom.activeDrawersInRound[targetRoom.turnIndex];
    socket.emit('turn-start', {
      drawerId: drawer ? drawer.id : null,
      drawerName: drawer ? drawer.name : null,
      word: "_ ".repeat(targetRoom.currentWord.length).trim(),
      round: targetRoom.round,
      timeLeft: targetRoom.timeLeft
    });
  } else {
    checkLobbyStart(targetRoom);
  }

  socket.on('chat-message', (text) => {
    const room = rooms[socket.roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const drawer = room.activeDrawersInRound ? room.activeDrawersInRound[room.turnIndex] : null;
    const isDrawer = drawer && drawer.id === socket.id;
    const hasGuessed = room.hasGuessed.has(socket.id);

    // Private channel chat routing
    if (isDrawer || hasGuessed) {
      room.players.forEach(p => {
        if (p.disconnected) return;
        const isTargetDrawer = drawer && drawer.id === p.id;
        const targetHasGuessed = room.hasGuessed.has(p.id);

        if (isTargetDrawer || targetHasGuessed) {
          const targetSocket = io.sockets.sockets.get(p.id);
          if (targetSocket) {
            targetSocket.emit('chat-message', {
              senderName: player.name,
              text: text,
              channel: 'guessed'
            });
          }
        }
      });
      return;
    }

    // Guesser check
    if (room.gameState === 'PLAYING') {
      const normalizedGuess = text.trim().toLowerCase();
      const normalizedWord = room.currentWord.trim().toLowerCase();

      if (normalizedGuess === normalizedWord) {
        room.hasGuessed.add(socket.id);
        
        const points = Math.max(10, Math.round(100 * (room.timeLeft / 60)));
        player.score += points;
        
        io.to(room.id).emit('chat-message', {
          senderName: 'System',
          text: `${player.name} guessed the word!`,
          channel: 'public'
        });

        // Broadcast correct guess text only to guessed + drawer channel
        room.players.forEach(p => {
          if (p.disconnected) return;
          const isTargetDrawer = drawer && drawer.id === p.id;
          const targetHasGuessed = room.hasGuessed.has(p.id);

          if (isTargetDrawer || targetHasGuessed) {
            const targetSocket = io.sockets.sockets.get(p.id);
            if (targetSocket) {
              targetSocket.emit('chat-message', {
                senderName: player.name,
                text: text,
                channel: 'guessed'
              });
            }
          }
        });

        io.to(room.id).emit('room-state', getRoomPayload(room));

        const activeGuessers = room.players.filter(p => (!drawer || p.id !== drawer.id) && !p.disconnected);
        if (room.hasGuessed.size === activeGuessers.length && activeGuessers.length > 0) {
          endTurn(room);
        }
        return;
      }
    }

    // Public chat message
    io.to(room.id).emit('chat-message', {
      senderName: player.name,
      text: text,
      channel: 'public'
    });
  });

  socket.on('draw-event', (data) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('draw-event', data);
    }
  });

  socket.on('disconnect', () => {
    const room = rooms[socket.roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.disconnected = true;
    io.to(room.id).emit('room-state', getRoomPayload(room));

    if (room.gameState === 'LOBBY') {
      checkLobbyStart(room);
    }

    player.disconnectTimeout = setTimeout(() => {
      const idx = room.players.findIndex(p => p.name === player.name);
      if (idx !== -1 && room.players[idx].disconnected) {
        room.players.splice(idx, 1);

        if (room.activeDrawersInRound) {
          const roundIdx = room.activeDrawersInRound.findIndex(p => p.name === player.name);
          if (roundIdx !== -1) {
            room.activeDrawersInRound.splice(roundIdx, 1);
            if (room.turnIndex > roundIdx) {
              room.turnIndex -= 1;
            }
          }
        }

        if (room.gameState === 'LOBBY') {
          io.to(room.id).emit('room-state', getRoomPayload(room));
          checkLobbyStart(room);
        } else if (room.gameState === 'PLAYING') {
          const activePlayers = room.players.filter(p => !p.disconnected);
          if (activePlayers.length < 2) {
            endGame(room);
          } else {
            const currentDrawer = room.activeDrawersInRound ? room.activeDrawersInRound[room.turnIndex] : null;
            const wasDrawer = currentDrawer && currentDrawer.name === player.name;
            if (wasDrawer) {
              if (room.turnIndex >= room.activeDrawersInRound.length) {
                room.turnIndex = 0;
              }
              endTurn(room);
            } else {
              io.to(room.id).emit('room-state', getRoomPayload(room));
            }
          }
        }
      }

      const activeCount = room.players.filter(p => !p.disconnected).length;
      if (activeCount === 0) {
        if (room.timerInterval) clearInterval(room.timerInterval);
        if (room.countdownInterval) clearInterval(room.countdownInterval);
        delete rooms[room.id];
      }
    }, 6000);
  });
});
