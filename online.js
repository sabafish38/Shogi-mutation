// ==========================================
// 無法将棋 MUTATION - 完全ゼロコンフィグ オンライン対戦エンジン
// (WebRTC / PeerJS + Firebase 自動ハイブリッド)
// ユーザー側のAPIキー取得・プロジェクト作成一切不要で今すぐ世界中と対戦可能！
// ==========================================

let activePeer = null;
let activePeerConn = null;
let onlinePlayerSide = null; // 'sente' | 'gote'
let currentOnlineRoomCode = null;
let isHost = false;
let onlineSearchTimer = null;
let onlineSearchSeconds = 0;
let myPlayerUid = null;

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
    }

    const peerId = customId || ('muhou_' + getMyPlayerUid() + '_' + Math.floor(Math.random() * 1000));
    const peer = new Peer(peerId, {
      debug: 1
    });

    peer.on('open', (id) => {
      activePeer = peer;
      resolve(peer);
    });

    peer.on('error', (err) => {
      console.warn('Peer error:', err);
      // ID衝突などの場合はフォールバック
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
  showMatchmakingOverlay('全国の対戦相手を探しています...');

  onlineSearchSeconds = 0;
  if (onlineSearchTimer) clearInterval(onlineSearchTimer);
  onlineSearchTimer = setInterval(() => {
    onlineSearchSeconds++;
    const timerEl = document.getElementById('matchmaking-timer-sec');
    if (timerEl) timerEl.textContent = `${onlineSearchSeconds}秒`;
  }, 1000);

  // マッチング待機ロビー（0〜7の8つの待機スロットを走査）
  const slotCount = 8;
  const startSlot = Math.floor(Math.random() * slotCount);
  let matched = false;

  const peer = await getOrCreatePeer();
  if (!peer) {
    hideMatchmakingOverlay();
    alert('通信の初期化に失敗しました。ページを再読み込みしてお試しください。');
    return;
  }

  // 既存の待機者がいるスロットへの接続を試みる
  for (let i = 0; i < slotCount; i++) {
    const slotIdx = (startSlot + i) % slotCount;
    const targetHostId = `muhou_quick_slot_${slotIdx}`;

    // 接続テスト
    try {
      const conn = peer.connect(targetHostId, { reliable: true });
      const connected = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 750);
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
        // マッチング成立！自分はゲスト（後手）として合流
        matched = true;
        isHost = false;
        onlinePlayerSide = 'gote';
        activePeerConn = conn;
        setupConnectionEvents(conn, '全国の猛者');
        conn.send({
          type: 'hello_guest',
          name: 'あなた (挑戦者)',
          rank: getRankInfo(userProfile.rating).title,
          rating: userProfile.rating,
          title: userProfile.equippedTitle
        });
        break;
      }
    } catch (e) {
      // 次のスロットへ
    }
  }

  // 誰も待機していなかった場合、自分が空いているスロットのホストになって待機
  if (!matched) {
    for (let slot = 0; slot < slotCount; slot++) {
      const hostSlotId = `muhou_quick_slot_${slot}`;
      const hostPeer = await getOrCreatePeer(hostSlotId);
      if (hostPeer) {
        // ホストとして待機成功！
        isHost = true;
        onlinePlayerSide = 'sente';
        hostPeer.on('connection', (conn) => {
          activePeerConn = conn;
          setupConnectionEvents(conn, '全国の猛者');
          conn.on('open', () => {
            conn.send({
              type: 'hello_host',
              name: '全国の対局者',
              rank: getRankInfo(userProfile.rating).title,
              rating: userProfile.rating,
              title: userProfile.equippedTitle
            });
          });
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
  hideMatchmakingOverlay();
}

// ------------------------------------------
// 2. 合言葉・フレンドルーム対戦
// ------------------------------------------
async function createFriendRoom() {
  // 4桁の合言葉
  const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
  currentOnlineRoomCode = roomCode;
  const peerId = `muhou_friend_${roomCode}`;

  showFriendRoomWaitingModal(roomCode);

  const peer = await getOrCreatePeer(peerId);
  if (!peer) {
    // 稀にIDが衝突した場合は再生成
    createFriendRoom();
    return;
  }

  isHost = true;
  onlinePlayerSide = 'sente'; // ホスト先手

  peer.on('connection', (conn) => {
    activePeerConn = conn;
    setupConnectionEvents(conn, '招待された友達');
    conn.on('open', () => {
      conn.send({
        type: 'hello_host',
        name: '部屋主 (先手)',
        rank: getRankInfo(userProfile.rating).title,
        rating: userProfile.rating,
        title: userProfile.equippedTitle
      });
    });
  });
}

async function joinFriendRoom(inputCode) {
  const cleanCode = (inputCode || '').toString().trim();
  if (!cleanCode || cleanCode.length !== 4) {
    alert('合言葉（4桁の半角数字）を入力してください');
    return;
  }

  const peer = await getOrCreatePeer();
  const targetPeerId = `muhou_friend_${cleanCode}`;
  const conn = peer.connect(targetPeerId, { reliable: true });

  showMatchmakingOverlay(`合言葉「${cleanCode}」の部屋へ接続中...`);

  const timer = setTimeout(() => {
    hideMatchmakingOverlay();
    alert(`合言葉「${cleanCode}」の部屋が見つかりませんでした。\n合言葉が合っているか確認してください。`);
    conn.close();
  }, 6000);

  conn.on('open', () => {
    clearTimeout(timer);
    isHost = false;
    onlinePlayerSide = 'gote'; // ゲスト後手
    activePeerConn = conn;
    setupConnectionEvents(conn, '友達 (部屋主)');
    conn.send({
      type: 'hello_guest',
      name: '友達 (後手)',
      rank: getRankInfo(userProfile.rating).title,
      rating: userProfile.rating,
      title: userProfile.equippedTitle
    });
  });

  conn.on('error', (err) => {
    clearTimeout(timer);
    hideMatchmakingOverlay();
    alert('部屋への接続でエラーが発生しました。合言葉を再確認してください。');
  });
}

// ------------------------------------------
// 3. 通信確立後のイベントバインド
// ------------------------------------------
function setupConnectionEvents(conn, defaultOpponentName) {
  hideMatchmakingOverlay();
  hideFriendModal();

  let opponentProfile = {
    name: defaultOpponentName,
    rank: '初段',
    rating: 1200,
    title: '全国の猛者'
  };

  conn.on('data', (data) => {
    if (!data) return;

    if (data.type === 'hello_host' || data.type === 'hello_guest') {
      // 相手のプロフィール情報を受信
      opponentProfile = {
        name: data.name || defaultOpponentName,
        rank: data.rank || '初段',
        rating: data.rating || 1200,
        title: data.title || '全国の猛者'
      };
      startOnlineGameSession(onlinePlayerSide, opponentProfile);
    } else if (data.type === 'move') {
      // 相手の移動アクションを受信
      executeMove(data.fromR, data.fromC, data.toR, data.toC, false);
    } else if (data.type === 'evolution') {
      // 相手の進化アクションを受信
      if (data.pendingEvo && data.pendingEvo.length > 0) {
        applyRemoteEvolution(data.pendingEvo, onlinePlayerSide === 'sente' ? 'gote' : 'sente');
      }
      if (data.evoLogs && data.evoLogs.length > 0) {
        showEnemyEvolutionNotification(data.evoLogs);
      }
      endTurn();
    }
  });

  // 切断検知（相手がブラウザを閉じた／回線切断）
  conn.on('close', () => {
    if (state.phase === 'play') {
      endGame(onlinePlayerSide, '相手プレイヤーの通信が切断されました（不戦勝）');
    }
  });

  // 接続直後に対局セッションを開始
  startOnlineGameSession(onlinePlayerSide, opponentProfile);
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

  showScreen('game');
  restartNewGame();
}

// ------------------------------------------
// UI制御
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
