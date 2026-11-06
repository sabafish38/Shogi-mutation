// ==========================================
// 無法将棋 MUTATION - 完全ゼロコンフィグ オンライン対戦エンジン
// (WebRTC / PeerJS P2P対局システム)
// ==========================================

let activePeer = null;
let activePeerConn = null;
let onlinePlayerSide = null; // 'sente' | 'gote'
let currentOnlineRoomCode = null;
let isHost = false;
let onlineSearchTimer = null;
let onlineSearchSeconds = 0;
let myPlayerUid = null;
let hasSessionStarted = false;

// Google パブリック STUN サーバー設定（異なる回線・Wi-Fi間の接続成功率を飛躍的に向上）
const PEER_CONFIG = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ]
  }
};

// プレイヤー識別IDの生成・取得
function getMyPlayerUid() {
  if (myPlayerUid) return myPlayerUid;
  let saved = localStorage.getItem('muhou_shogi_player_uid_v1');
  if (!saved) {
    saved = 'u_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('muhou_shogi_player_uid_v1', saved);
  }
  myPlayerUid = saved;
  return myPlayerUid;
}

// Peerインスタンスの初期化
function getOrCreatePeer(customId = null) {
  return new Promise((resolve, reject) => {
    if (activePeer && !activePeer.destroyed && !customId) {
      resolve(activePeer);
      return;
    }

    if (activePeer && !activePeer.destroyed) {
      activePeer.destroy();
      activePeer = null;
    }

    const peerId = customId || ('muhou_' + getMyPlayerUid() + '_' + Math.floor(Math.random() * 1000));
    const peer = new Peer(peerId, PEER_CONFIG);

    peer.on('open', (id) => {
      activePeer = peer;
      resolve(peer);
    });

    peer.on('error', (err) => {
      console.warn('Peer error:', err);
      if (err.type === 'unavailable-id') {
        resolve(null);
      } else {
        reject(err);
      }
    });
  });
}

// ------------------------------------------
// 1. 全国ランダムマッチ（クイックマッチ）
// ------------------------------------------
async function startQuickMatchmaking() {
  hasSessionStarted = false;
  showMatchmakingOverlay('全国の対戦相手を探しています...');

  onlineSearchSeconds = 0;
  if (onlineSearchTimer) clearInterval(onlineSearchTimer);
  onlineSearchTimer = setInterval(() => {
    onlineSearchSeconds++;
    const timerEl = document.getElementById('matchmaking-timer-sec');
    if (timerEl) timerEl.textContent = `${onlineSearchSeconds}秒`;
  }, 1000);

  const slotCount = 8;
  const startSlot = Math.floor(Math.random() * slotCount);
  let matched = false;

  const peer = await getOrCreatePeer();
  if (!peer) {
    hideAllOnlineModals();
    alert('通信の初期化に失敗しました。ページを再読み込みしてお試しください。');
    return;
  }

  for (let i = 0; i < slotCount; i++) {
    const slotIdx = (startSlot + i) % slotCount;
    const targetHostId = `muhou_quick_slot_${slotIdx}`;

    try {
      const conn = peer.connect(targetHostId, { reliable: true });
      const connected = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 900);
        conn.on('open', () => {
          clearTimeout(timeout);
          resolve(true);
        });
        conn.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      });

      if (connected) {
        matched = true;
        isHost = false;
        onlinePlayerSide = 'gote';
        setupConnectionEvents(conn, '全国の好敵手', 'guest');
        break;
      }
    } catch (e) {
      // 次のスロットへ
    }
  }

  if (!matched) {
    for (let slot = 0; slot < slotCount; slot++) {
      const hostSlotId = `muhou_quick_slot_${slot}`;
      const hostPeer = await getOrCreatePeer(hostSlotId);
      if (hostPeer) {
        isHost = true;
        onlinePlayerSide = 'sente';
        hostPeer.on('connection', (conn) => {
          setupConnectionEvents(conn, '全国の好敵手', 'host');
        });
        break;
      }
    }
  }
}

function cancelMatchmaking() {
  if (onlineSearchTimer) {
    clearInterval(onlineSearchTimer);
    onlineSearchTimer = null;
  }
  if (activePeer && !activePeer.destroyed) {
    activePeer.destroy();
    activePeer = null;
  }
  hideAllOnlineModals();
}

// ------------------------------------------
// 2. 合言葉・フレンドルーム対戦
// ------------------------------------------
async function createFriendRoom() {
  hasSessionStarted = false;
  const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
  currentOnlineRoomCode = roomCode;
  const peerId = `muhou_friend_${roomCode}`;

  showFriendRoomWaitingModal(roomCode);

  const peer = await getOrCreatePeer(peerId);
  if (!peer) {
    createFriendRoom();
    return;
  }

  isHost = true;
  onlinePlayerSide = 'sente'; // 部屋主は先手

  peer.on('connection', (conn) => {
    setupConnectionEvents(conn, '招待された好敵手', 'host');
  });
}

async function joinFriendRoom(inputCode) {
  hasSessionStarted = false;
  // 全角数字を半角数字へ正規化し、空白を除去
  const cleanCode = (inputCode || '').toString().trim().normalize('NFKC').replace(/[^0-9]/g, '');
  if (!cleanCode || cleanCode.length !== 4) {
    alert('合言葉（4桁の数字）を入力してください');
    return;
  }

  const peer = await getOrCreatePeer();
  if (!peer) {
    alert('通信の初期化に失敗しました。');
    return;
  }

  const targetPeerId = `muhou_friend_${cleanCode}`;
  const conn = peer.connect(targetPeerId, { reliable: true });

  showMatchmakingOverlay(`合言葉「${cleanCode}」の部屋へ接続中...`);

  const timer = setTimeout(() => {
    hideAllOnlineModals();
    alert(`合言葉「${cleanCode}」の対局室が見つかりませんでした。
合言葉が合っているか確認してください。`);
    try { conn.close(); } catch (e) {}
  }, 12000);

  conn.on('open', () => {
    clearTimeout(timer);
    isHost = false;
    onlinePlayerSide = 'gote'; // 参加者は後手
    setupConnectionEvents(conn, '部屋主', 'guest');
  });

  conn.on('error', (err) => {
    clearTimeout(timer);
    hideAllOnlineModals();
    console.warn('Join room error:', err);
    alert('対局室への接続でエラーが発生しました。合言葉を再確認してください。');
  });
}

// ------------------------------------------
// 3. 通信確立後の堅牢な双方向ハンドシェイク
// ------------------------------------------
function setupConnectionEvents(conn, defaultOpponentName, role) {
  activePeerConn = conn;

  let opponentProfile = {
    name: defaultOpponentName,
    rank: '初段',
    rating: 1200,
    title: '全国の猛者'
  };

  // プロフィール送信ヘルパー
  const sendMyHello = () => {
    if (!conn || !conn.open) return;
    conn.send({
      type: role === 'host' ? 'hello_host' : 'hello_guest',
      name: userProfile.name || (role === 'host' ? '部屋主' : '挑戦者'),
      rank: getRankInfo(userProfile.rating).title,
      rating: userProfile.rating,
      title: userProfile.equippedTitle
    });
  };

  // 接続がすでにopenしている場合と、openイベント待ちの両方に対応
  if (conn.open) {
    sendMyHello();
  } else {
    conn.on('open', () => {
      sendMyHello();
    });
  }

  conn.on('data', (data) => {
    if (!data) return;

    if (data.type === 'hello_host' || data.type === 'hello_guest' || data.type === 'hello_ack') {
      let oppName = (data.name || defaultOpponentName || '対局者').slice(0, 10);
      if (typeof validateUserName === 'function') {
        const v = validateUserName(oppName);
        if (!v.valid) oppName = '対局者';
      }
      opponentProfile = {
        name: oppName,
        rank: data.rank || '初段',
        rating: typeof data.rating === 'number' ? data.rating : 1200,
        title: data.title || '全国の猛者'
      };

      // helloを受信したらACKを返送（相手も確実に接続完了できるようにする）
      if (data.type !== 'hello_ack') {
        try {
          conn.send({
            type: 'hello_ack',
            name: userProfile.name || (role === 'host' ? '部屋主' : '挑戦者'),
            rank: getRankInfo(userProfile.rating).title,
            rating: userProfile.rating,
            title: userProfile.equippedTitle
          });
        } catch (e) {}
      }

      // 両者確実に揃った瞬間にゲームセッション開始（多重発火防止）
      if (!hasSessionStarted) {
        hasSessionStarted = true;
        hideAllOnlineModals();
        startOnlineGameSession(onlinePlayerSide, opponentProfile);
      }
    } else if (data.type === 'move') {
      executeMove(data.fromR, data.fromC, data.toR, data.toC, false);
    } else if (data.type === 'evolution') {
      const remoteSide = (onlinePlayerSide === 'sente' ? 'gote' : 'sente');
      if (typeof data.spendingPt === 'number' && data.spendingPt > 0) {
        state.bank[remoteSide] = Math.max(0, state.bank[remoteSide] - data.spendingPt);
      }
      if (data.pendingEvo && data.pendingEvo.length > 0) {
        applyRemoteEvolution(data.pendingEvo, remoteSide);
      }
      if (data.evoLogs && data.evoLogs.length > 0) {
        showEnemyEvolutionNotification(data.evoLogs);
      }
      state.phase = 'play';
      state.pendingEvo = [];
      endTurn();
    }
  });

  conn.on('close', () => {
    if (state.phase !== 'gameover') {
      endGame(onlinePlayerSide, '相手プレイヤーの通信が切断されました（不戦勝）');
    }
  });

  // 安全ネット：万が一相手のhelloパケットが遅延しても3秒後に自動開始
  setTimeout(() => {
    if (!hasSessionStarted && conn && conn.open) {
      hasSessionStarted = true;
      hideAllOnlineModals();
      startOnlineGameSession(onlinePlayerSide, opponentProfile);
    }
  }, 3000);
}

// ------------------------------------------
// 4. データ送信フック（game.js から呼び出し）
// ------------------------------------------
function sendOnlineMoveAction(fromR, fromC, toR, toC, capturedPiece) {
  if (!activePeerConn || !activePeerConn.open) return;

  activePeerConn.send({
    type: 'move',
    senderSide: onlinePlayerSide,
    fromR,
    fromC,
    toR,
    toC,
    captured: capturedPiece ? {
      type: capturedPiece.type,
      name: capturedPiece.name,
      basePt: capturedPiece.basePt
    } : null
  });
}

function sendOnlineEvolutionAction(pendingEvoArray, spendingPt, evoLogs) {
  if (!activePeerConn || !activePeerConn.open) return;

  activePeerConn.send({
    type: 'evolution',
    senderSide: onlinePlayerSide,
    pendingEvo: pendingEvoArray,
    spendingPt,
    evoLogs
  });
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
  if (onlineSearchTimer) {
    clearInterval(onlineSearchTimer);
    onlineSearchTimer = null;
  }
  state.mode = 'online';
  state.playerSide = mySide;
  state.onlineOpponent = oppPlayer || {
    name: '通信相手',
    title: '全国の猛者',
    rank: '初段',
    rating: 1200
  };

  hideAllOnlineModals();
  showScreen('game');
  restartNewGame();
}

// ------------------------------------------
// UI制御：オンライン関連モーダルの全非表示
// ------------------------------------------
function hideAllOnlineModals() {
  const ids = [
    'modal-online-select',
    'matchmaking-overlay',
    'modal-friend-waiting'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function showMatchmakingOverlay(msg) {
  let overlay = document.getElementById('matchmaking-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  const msgEl = document.getElementById('matchmaking-status-text');
  if (msgEl) msgEl.textContent = msg;
}

function hideMatchmakingOverlay() {
  hideAllOnlineModals();
}

function showFriendRoomWaitingModal(roomCode) {
  const modal = document.getElementById('modal-friend-waiting');
  if (!modal) return;
  const codeEl = document.getElementById('friend-room-code-display');
  if (codeEl) codeEl.textContent = roomCode;
  modal.classList.remove('hidden');
}

function hideFriendModal() {
  hideAllOnlineModals();
}

// URLパラメータに ?room=1234 があれば自動で入室
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam && roomParam.length === 4) {
    setTimeout(() => {
      joinFriendRoom(roomParam);
    }, 800);
  }
});
