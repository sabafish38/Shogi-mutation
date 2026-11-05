// ==========================================
// 無法将棋 MUTATION - オンライン対戦モジュール (Firebase Realtime Database)
// ==========================================

let firebaseApp = null;
let firebaseDb = null;
let currentOnlineRoomId = null;
let onlinePlayerSide = null; // 'sente' | 'gote'
let roomListenerRef = null;
let isHost = false;
let myPlayerUid = null;
let onlineSearchTimer = null;
let onlineSearchSeconds = 0;

// プレイヤーの一意IDを取得・生成
function getMyPlayerUid() {
  if (myPlayerUid) return myPlayerUid;
  let saved = localStorage.getItem('muhou_shogi_player_uid_v1');
  if (!saved) {
    saved = 'usr_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem('muhou_shogi_player_uid_v1', saved);
  }
  myPlayerUid = saved;
  return myPlayerUid;
}

// Firebaseの初期化
function initFirebaseApp() {
  if (firebaseApp && firebaseDb) return true;
  const config = getFirebaseConfig();
  if (!config || !config.apiKey || !config.databaseURL) {
    return false;
  }
  try {
    if (!firebase.apps.length) {
      firebaseApp = firebase.initializeApp(config);
    } else {
      firebaseApp = firebase.app();
    }
    firebaseDb = firebase.database();
    return true;
  } catch (err) {
    console.error('Firebase initialization error:', err);
    return false;
  }
}

// ------------------------------------------
// クイックマッチ（全国ランダム対戦）
// ------------------------------------------
function startQuickMatchmaking() {
  if (!initFirebaseApp()) {
    openFirebaseSetupModal();
    return;
  }

  const uid = getMyPlayerUid();
  const rankInfo = getRankInfo(userProfile.rating);
  const queueRef = firebaseDb.ref('matchmaking_queue');

  showMatchmakingOverlay('全国の対戦相手を探しています...');

  onlineSearchSeconds = 0;
  if (onlineSearchTimer) clearInterval(onlineSearchTimer);
  onlineSearchTimer = setInterval(() => {
    onlineSearchSeconds++;
    const timerEl = document.getElementById('matchmaking-timer-sec');
    if (timerEl) timerEl.textContent = `${onlineSearchSeconds}秒`;
  }, 1000);

  // トランザクションでキューを検索・登録
  queueRef.transaction((currentQueue) => {
    if (!currentQueue) {
      // 待機者がいないので自分が登録
      return {
        [uid]: {
          uid,
          name: '名無し棋士',
          title: userProfile.equippedTitle,
          rank: rankInfo.title,
          rating: userProfile.rating,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        }
      };
    }

    // 待機者一覧を取得
    const waitingUids = Object.keys(currentQueue).filter(id => id !== uid);
    if (waitingUids.length > 0) {
      // 誰か待っている人がいた！一番古い人とマッチング成立
      const targetUid = waitingUids[0];
      const roomId = 'room_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

      // マッチング情報を渡すため、相手のノードに roomId を書き込む
      currentQueue[targetUid].matchedRoomId = roomId;
      currentQueue[targetUid].opponentUid = uid;
      return currentQueue;
    } else {
      // 待機登録
      currentQueue[uid] = {
        uid,
        name: '名無し棋士',
        title: userProfile.equippedTitle,
        rank: rankInfo.title,
        rating: userProfile.rating,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      };
      return currentQueue;
    }
  }, (error, committed, snapshot) => {
    if (error) {
      console.error('Matchmaking transaction failed:', error);
      hideMatchmakingOverlay();
      alert('マッチング通信でエラーが発生しました。時間を置いて再度お試しください。');
      return;
    }

    // 自分のキューノードを監視してマッチング通知を待つ
    const myQueueNode = firebaseDb.ref(`matchmaking_queue/${uid}`);
    myQueueNode.on('value', (snap) => {
      const data = snap.val();
      if (!data) return;

      if (data.matchedRoomId) {
        // 誰かが自分とマッチングしてくれた！
        myQueueNode.off();
        myQueueNode.remove();
        joinMatchedRoom(data.matchedRoomId, false, data.opponentUid);
      }
    });

    // 逆に自分が誰かをマッチング相手に選んだ場合
    const snapVal = snapshot.val();
    if (snapVal && snapVal[uid] && snapVal[uid].matchedRoomId) {
      const roomId = snapVal[uid].matchedRoomId;
      const oppUid = snapVal[uid].opponentUid;
      myQueueNode.off();
      myQueueNode.remove();
      // 自分が部屋を作る側 (Host: 先手/後手割り当て)
      createAndJoinMatchedRoom(roomId, uid, oppUid);
    }
  });
}

function cancelMatchmaking() {
  if (onlineSearchTimer) {
    clearInterval(onlineSearchTimer);
    onlineSearchTimer = null;
  }
  if (firebaseDb) {
    const uid = getMyPlayerUid();
    const myQueueNode = firebaseDb.ref(`matchmaking_queue/${uid}`);
    myQueueNode.off();
    myQueueNode.remove();
  }
  hideMatchmakingOverlay();
}

// ------------------------------------------
// ルーム生成＆合流
// ------------------------------------------
function createAndJoinMatchedRoom(roomId, hostUid, guestUid) {
  currentOnlineRoomId = roomId;
  isHost = true;
  // 先手・後手をランダム割り当て (50%で先手)
  onlinePlayerSide = Math.random() < 0.5 ? 'sente' : 'gote';
  const guestSide = onlinePlayerSide === 'sente' ? 'gote' : 'sente';

  const roomRef = firebaseDb.ref(`rooms/${roomId}`);
  const rankInfo = getRankInfo(userProfile.rating);

  const initialData = {
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    status: 'playing',
    movesCount: 0,
    turn: 'sente',
    hostSide: onlinePlayerSide,
    players: {
      [hostUid]: {
        uid: hostUid,
        side: onlinePlayerSide,
        title: userProfile.equippedTitle,
        rank: rankInfo.title,
        rating: userProfile.rating,
        connected: true
      },
      [guestUid]: {
        uid: guestUid,
        side: guestSide,
        connected: true
      }
    },
    syncAction: null
  };

  roomRef.set(initialData).then(() => {
    listenToRoom(roomId);
  });
}

function joinMatchedRoom(roomId, hostFlag, oppUid) {
  currentOnlineRoomId = roomId;
  isHost = hostFlag;

  const roomRef = firebaseDb.ref(`rooms/${roomId}`);
  roomRef.once('value').then((snap) => {
    const data = snap.val();
    if (!data) return;

    const myUid = getMyPlayerUid();
    const myPlayerInfo = data.players && data.players[myUid];
    onlinePlayerSide = myPlayerInfo ? myPlayerInfo.side : 'gote';

    // 自分の最新プロフィールを登録
    const rankInfo = getRankInfo(userProfile.rating);
    roomRef.child(`players/${myUid}`).update({
      title: userProfile.equippedTitle,
      rank: rankInfo.title,
      rating: userProfile.rating,
      connected: true
    });

    listenToRoom(roomId);
  });
}

// ------------------------------------------
// 合言葉・フレンドルーム対戦
// ------------------------------------------
function createFriendRoom() {
  if (!initFirebaseApp()) {
    openFirebaseSetupModal();
    return;
  }

  // 4桁の合言葉
  const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
  const roomId = 'friend_' + roomCode;
  currentOnlineRoomId = roomId;
  isHost = true;
  onlinePlayerSide = 'sente'; // ホスト先手

  const uid = getMyPlayerUid();
  const rankInfo = getRankInfo(userProfile.rating);
  const roomRef = firebaseDb.ref(`rooms/${roomId}`);

  roomRef.set({
    roomCode,
    isFriendRoom: true,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    status: 'waiting',
    movesCount: 0,
    turn: 'sente',
    hostSide: 'sente',
    players: {
      [uid]: {
        uid,
        side: 'sente',
        title: userProfile.equippedTitle,
        rank: rankInfo.title,
        rating: userProfile.rating,
        connected: true
      }
    }
  }).then(() => {
    showFriendRoomWaitingModal(roomCode);
    listenToFriendRoom(roomId);
  });
}

function joinFriendRoom(inputCode) {
  if (!initFirebaseApp()) {
    openFirebaseSetupModal();
    return;
  }

  const cleanCode = inputCode.trim();
  if (!cleanCode) {
    alert('合言葉（4桁の数字）を入力してください');
    return;
  }

  const roomId = 'friend_' + cleanCode;
  const roomRef = firebaseDb.ref(`rooms/${roomId}`);

  roomRef.once('value').then((snap) => {
    const data = snap.val();
    if (!data) {
      alert(`合言葉「${cleanCode}」の対局室が見つかりませんでした。\n合言葉を確認して再度お試しください。`);
      return;
    }

    if (data.status !== 'waiting') {
      alert('この対局室は既に対局が開始されているか、終了しています。');
      return;
    }

    currentOnlineRoomId = roomId;
    isHost = false;
    onlinePlayerSide = 'gote'; // ゲスト後手

    const uid = getMyPlayerUid();
    const rankInfo = getRankInfo(userProfile.rating);

    roomRef.child(`players/${uid}`).set({
      uid,
      side: 'gote',
      title: userProfile.equippedTitle,
      rank: rankInfo.title,
      rating: userProfile.rating,
      connected: true
    }).then(() => {
      roomRef.update({ status: 'playing' });
      hideFriendModal();
      listenToRoom(roomId);
    });
  });
}

// ------------------------------------------
// ルーム監視 ＆ リアルタイム通信
// ------------------------------------------
function listenToFriendRoom(roomId) {
  const roomRef = firebaseDb.ref(`rooms/${roomId}`);
  roomRef.on('value', (snap) => {
    const data = snap.val();
    if (!data) return;

    if (data.status === 'playing') {
      // 相手が合流した！
      roomRef.off();
      hideFriendModal();
      listenToRoom(roomId);
    }
  });
}

function listenToRoom(roomId) {
  hideMatchmakingOverlay();

  // 切断検知の登録 (自分が回線切断したときの処理)
  const myUid = getMyPlayerUid();
  const myPresenceRef = firebaseDb.ref(`rooms/${roomId}/players/${myUid}/connected`);
  myPresenceRef.onDisconnect().set(false);

  // 相手の情報を取得
  const roomRef = firebaseDb.ref(`rooms/${roomId}`);
  roomRef.once('value', (snap) => {
    const data = snap.val();
    if (!data) return;

    let oppPlayer = null;
    if (data.players) {
      for (const pUid of Object.keys(data.players)) {
        if (pUid !== myUid) {
          oppPlayer = data.players[pUid];
          break;
        }
      }
    }

    // オンライン対局開始！
    startOnlineGameSession(onlinePlayerSide, oppPlayer);
  });

  // 指し手・進化の同期リスナー
  const actionRef = firebaseDb.ref(`rooms/${roomId}/syncAction`);
  if (roomListenerRef) roomListenerRef.off();
  roomListenerRef = actionRef;

  actionRef.on('value', (snap) => {
    const action = snap.val();
    if (!action) return;

    // 相手からのアクションのみ盤面に反映
    if (action.senderSide !== onlinePlayerSide) {
      handleRemoteAction(action);
    }
  });

  // 切断・ゲーム終了監視
  const playersRef = firebaseDb.ref(`rooms/${roomId}/players`);
  playersRef.on('child_changed', (snap) => {
    const player = snap.val();
    if (player && player.connected === false && state.phase === 'play') {
      // 相手が切断した場合
      if (player.side !== onlinePlayerSide) {
        endGame(onlinePlayerSide, '相手プレイヤーの通信が切断されました（不戦勝）');
      }
    }
  });
}

// 相手に自分の指し手を送信
function sendOnlineMoveAction(fromR, fromC, toR, toC, capturedPiece) {
  if (!firebaseDb || !currentOnlineRoomId) return;

  const action = {
    type: 'move',
    senderSide: onlinePlayerSide,
    fromR,
    fromC,
    toR,
    toC,
    capturedPiece: capturedPiece ? {
      id: capturedPiece.id,
      basePt: capturedPiece.basePt,
      type: capturedPiece.type,
      name: capturedPiece.name
    } : null,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };

  firebaseDb.ref(`rooms/${currentOnlineRoomId}/syncAction`).set(action);
}

// 相手に進化確定を送信
function sendOnlineEvolutionAction(pendingEvoArray, spendingPt, evoLogs) {
  if (!firebaseDb || !currentOnlineRoomId) return;

  const action = {
    type: 'evolution',
    senderSide: onlinePlayerSide,
    pendingEvo: pendingEvoArray,
    spendingPt,
    evoLogs,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };

  firebaseDb.ref(`rooms/${currentOnlineRoomId}/syncAction`).set(action);
}

// 相手からのアクションを自陣盤面に反映
function handleRemoteAction(action) {
  if (action.type === 'move') {
    // 相手の移動を実行
    executeMove(action.fromR, action.fromC, action.toR, action.toC, false);
  } else if (action.type === 'evolution') {
    // 相手の進化を盤面に適用
    if (action.pendingEvo && action.pendingEvo.length > 0) {
      applyRemoteEvolution(action.pendingEvo, action.senderSide);
    }
    // 進化通知を表示
    if (action.evoLogs && action.evoLogs.length > 0) {
      showEnemyEvolutionNotification(action.evoLogs);
    }
    // 手番交代
    endTurn();
  }
}

function applyRemoteEvolution(pendingList, owner) {
  pendingList.forEach(item => {
    const found = findPieceById(state.board, item.pieceId);
    if (!found) return;
    const p = found.piece;

    if (item.type === 'ray') {
      if (!p.evolvedRays) p.evolvedRays = [];
      p.evolvedRays.push([item.dx, item.dy]);
    } else {
      if (!p.evolvedSteps) p.evolvedSteps = [];
      p.evolvedSteps.push([item.dx, item.dy]);
    }
  });

  renderAll();
}

function startOnlineGameSession(mySide, oppPlayer) {
  state.mode = 'online';
  state.playerSide = mySide;
  state.onlineOpponent = oppPlayer || {
    name: 'オンライン対戦相手',
    title: '全国の猛者',
    rank: '初段',
    rating: 1200
  };

  showScreen('game');
  restartNewGame();
}

// ------------------------------------------
// UI制御・モーダル開閉
// ------------------------------------------
function showMatchmakingOverlay(msg) {
  let overlay = document.getElementById('matchmaking-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  const msgEl = document.getElementById('matchmaking-status-text');
  if (msgEl) msgEl.textContent = msg;
}

function hideMatchmakingOverlay() {
  let overlay = document.getElementById('matchmaking-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function showFriendRoomWaitingModal(roomCode) {
  const modal = document.getElementById('modal-friend-waiting');
  if (!modal) return;
  const codeEl = document.getElementById('friend-room-code-display');
  if (codeEl) codeEl.textContent = roomCode;
  modal.classList.remove('hidden');
}

function hideFriendModal() {
  const modalWaiting = document.getElementById('modal-friend-waiting');
  if (modalWaiting) modalWaiting.classList.add('hidden');
  const modalSelect = document.getElementById('modal-online-select');
  if (modalSelect) modalSelect.classList.add('hidden');
}

function openFirebaseSetupModal() {
  const modal = document.getElementById('modal-firebase-setup');
  if (!modal) return;

  const config = getFirebaseConfig();
  const txtApiKey = document.getElementById('fb-input-apiKey');
  const txtDbUrl = document.getElementById('fb-input-databaseURL');
  const txtProjId = document.getElementById('fb-input-projectId');
  const txtAppId = document.getElementById('fb-input-appId');

  if (txtApiKey && config.apiKey) txtApiKey.value = config.apiKey;
  if (txtDbUrl && config.databaseURL) txtDbUrl.value = config.databaseURL;
  if (txtProjId && config.projectId) txtProjId.value = config.projectId;
  if (txtAppId && config.appId) txtAppId.value = config.appId;

  modal.classList.remove('hidden');
}
