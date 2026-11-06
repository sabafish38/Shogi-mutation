// ==========================================
// 無法将棋 MUTATION - 完全ゼロコンフィグ オンライン対戦エンジン
// (WebRTC / PeerJS P2P対局システム & レベル1・2 セキュリティ統制)
// ==========================================

(function() {
  'use strict';

  let activePeer = null;
  let activePeerConn = null;
  let onlinePlayerSide = null; // 'sente' | 'gote'
  let currentOnlineRoomCode = null;
  let currentSessionMode = 'online';
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
    return new Promise((resolve) => {
      function create() {
        if (activePeer && !activePeer.destroyed && !customId) {
          resolve(activePeer);
          return;
        }

        if (activePeer && !activePeer.destroyed) {
          activePeer.destroy();
          activePeer = null;
        }

        const peerId = customId || ('muhou_' + getMyPlayerUid() + '_' + Math.floor(Math.random() * 1000));
        try {
          const peer = new Peer(peerId, PEER_CONFIG);

          peer.on('open', (id) => {
            activePeer = peer;
            resolve(peer);
          });

          peer.on('error', (err) => {
            console.warn('Peer error:', err);
            resolve(null);
          });
        } catch (err) {
          console.warn('Peer constructor failed:', err);
          resolve(null);
        }
      }

      if (typeof Peer === 'undefined') {
        let checks = 0;
        const timer = setInterval(() => {
          checks++;
          if (typeof Peer !== 'undefined') {
            clearInterval(timer);
            create();
          } else if (checks > 12) {
            clearInterval(timer);
            resolve(null);
          }
        }, 250);
      } else {
        create();
      }
    });
  }

  // ------------------------------------------
  // 1. 全国マッチング（格付戦 / カジュアル戦）
  // ------------------------------------------
  async function executeMatchmaking({ mode, slotPrefix, overlayTitle, defaultOppName }) {
    hasSessionStarted = false;
    currentSessionMode = mode;
    showMatchmakingOverlay(overlayTitle);

    onlineSearchSeconds = 0;
    if (onlineSearchTimer) clearInterval(onlineSearchTimer);
    onlineSearchTimer = setInterval(() => {
      onlineSearchSeconds++;
      const timerEl = document.getElementById('matchmaking-timer-sec');
      if (timerEl) timerEl.textContent = `${onlineSearchSeconds}秒`;
    }, 1000);

    const slotCount = 4;
    let matched = false;

    const peer = await getOrCreatePeer();
    if (!peer) {
      hideAllOnlineModals();
      alert('通信の初期化に失敗しました。ページを再読み込みしてお試しください。');
      return;
    }

    // 1. スロット0〜3の既存待機者を高速プローブ (各550ms)
    for (let slot = 0; slot < slotCount; slot++) {
      const targetHostId = `${slotPrefix}${slot}`;
      try {
        const conn = peer.connect(targetHostId, { reliable: true });
        const connected = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(false), 550);
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
          setupConnectionEvents(conn, defaultOppName, 'guest');
          break;
        }
      } catch (e) {}
    }

    // 2. 待機者がいなければ、最上位の空きスロットでホスト待機
    if (!matched) {
      for (let slot = 0; slot < slotCount; slot++) {
        const hostSlotId = `${slotPrefix}${slot}`;
        const hostPeer = await getOrCreatePeer(hostSlotId);
        if (hostPeer) {
          isHost = true;
          onlinePlayerSide = 'sente';
          hostPeer.on('connection', (conn) => {
            if (hasSessionStarted) {
              try { conn.close(); } catch (e) {}
              return;
            }
            setupConnectionEvents(conn, defaultOppName, 'host');
          });
          break;
        }
      }
    }
  }

  async function startRankMatchmaking() {
    await executeMatchmaking({
      mode: 'rank',
      slotPrefix: 'muhou_rank_slot_',
      overlayTitle: '真剣勝負（格付戦）：全国の棋士を探索中...',
      defaultOppName: '全国の棋士'
    });
  }

  async function startQuickMatchmaking() {
    await executeMatchmaking({
      mode: 'online',
      slotPrefix: 'muhou_quick_slot_',
      overlayTitle: '通信対局（カジュアル戦）：全国の好敵手を探索中...',
      defaultOppName: '全国の好敵手'
    });
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
    currentSessionMode = 'online';
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
    currentSessionMode = 'online';
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

    // PeerServerからの即時エラー検知 (部屋が存在しない場合300msで即判定)
    const onPeerError = (err) => {
      if (err && (err.type === 'peer-unavailable' || (err.message && err.message.includes(targetPeerId)))) {
        clearTimeout(timer);
        hideAllOnlineModals();
        try { peer.off('error', onPeerError); } catch (e) {}
        alert(`合言葉「${cleanCode}」の対局室が見つかりませんでした。\n合言葉が合っているか確認してください。`);
        try { conn.close(); } catch (e) {}
      }
    };
    peer.on('error', onPeerError);

    const timer = setTimeout(() => {
      hideAllOnlineModals();
      alert(`合言葉「${cleanCode}」の対局室が見つかりませんでした。\n合言葉が合っているか確認してください。`);
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
  // 3. 通信確立後の堅牢な双方向ハンドシェイク & レベル1着手検証
  // ------------------------------------------
  function setupConnectionEvents(conn, defaultOpponentName, role) {
    activePeerConn = conn;

    let opponentProfile = {
      name: defaultOpponentName,
      rank: '初段',
      rating: 1200,
      title: '全国の猛者'
    };

    const getEngine = () => window.MuhouEngine;

    // プロフィール送信ヘルパー
    const sendMyHello = () => {
      if (!conn || !conn.open) return;
      const engine = getEngine();
      const prof = engine ? engine.getUserProfile() : {};
      const rating = prof.rating || 1200;
      const rankInfo = engine ? engine.getRankInfo(rating) : { title: '初段' };

      conn.send({
        type: role === 'host' ? 'hello_host' : 'hello_guest',
        name: prof.name || (role === 'host' ? '部屋主' : '挑戦者'),
        rank: rankInfo.title,
        rating: rating,
        streak: prof.streak || 0,
        maxStreak: prof.maxStreak || 0,
        wins: prof.wins || 0,
        losses: prof.losses || 0,
        bountiesClaimed: prof.bountiesClaimed || 0,
        title: prof.equippedTitle || '全国の猛者',
        mode: currentSessionMode
      });
    };

    if (conn.open) {
      sendMyHello();
    } else {
      conn.on('open', () => {
        sendMyHello();
      });
    }

    conn.on('data', (data) => {
      if (!data) return;
      const engine = getEngine();

      if (data.type === 'hello_host' || data.type === 'hello_guest' || data.type === 'hello_ack') {
        let oppName = (data.name || defaultOpponentName || '対局者').slice(0, 10);
        if (engine && typeof engine.validateUserName === 'function') {
          const v = engine.validateUserName(oppName);
          if (!v.valid) oppName = '対局者';
        }
        if (data.mode) {
          currentSessionMode = data.mode;
        }
        opponentProfile = {
          name: oppName,
          rank: data.rank || '初段',
          rating: typeof data.rating === 'number' ? data.rating : 1200,
          streak: typeof data.streak === 'number' ? data.streak : 0,
          maxStreak: typeof data.maxStreak === 'number' ? data.maxStreak : 0,
          wins: typeof data.wins === 'number' ? data.wins : 0,
          losses: typeof data.losses === 'number' ? data.losses : 0,
          bountiesClaimed: typeof data.bountiesClaimed === 'number' ? data.bountiesClaimed : 0,
          title: data.title || '全国の猛者'
        };

        if (data.type !== 'hello_ack') {
          try {
            const prof = engine ? engine.getUserProfile() : {};
            const rating = prof.rating || 1200;
            const rankInfo = engine ? engine.getRankInfo(rating) : { title: '初段' };
            conn.send({
              type: 'hello_ack',
              name: prof.name || (role === 'host' ? '部屋主' : '挑戦者'),
              rank: rankInfo.title,
              rating: rating,
              streak: prof.streak || 0,
              maxStreak: prof.maxStreak || 0,
              wins: prof.wins || 0,
              losses: prof.losses || 0,
              bountiesClaimed: prof.bountiesClaimed || 0,
              title: prof.equippedTitle || '全国の猛者',
              mode: currentSessionMode
            });
          } catch (e) {}
        }

        if (!hasSessionStarted) {
          hasSessionStarted = true;
          hideAllOnlineModals();
          if (engine && typeof engine.startOnlineGameSession === 'function') {
            engine.startOnlineGameSession(onlinePlayerSide, opponentProfile, currentSessionMode);
          }
        }
      } else if (data.type === 'move') {
        // ==========================================
        // 【防御レベル1】相手からの着手パケット相互検証
        // ==========================================
        const remoteSide = (onlinePlayerSide === 'sente' ? 'gote' : 'sente');
        if (!engine || typeof engine.executeRemoteMove !== 'function') {
          console.error('MuhouEngine is not ready to validate remote move');
          return;
        }

        try {
          const result = engine.executeRemoteMove(data.fromR, data.fromC, data.toR, data.toC, remoteSide);
          if (result && !result.valid) {
            console.error('TAMPER_DETECTED in remote move:', result.reason);
            try {
              conn.send({
                type: 'tamper_detected',
                reason: result.reason,
                senderSide: onlinePlayerSide
              });
            } catch (e) {}
            setTimeout(() => {
              try { conn.close(); } catch (e) {}
            }, 300);
            engine.endGame(onlinePlayerSide, `相手の不正な着手（${result.reason}）を検知したため、反則勝ちとなります。`);
          }
        } catch (err) {
          console.error('Error executing remote move:', err);
        }
      } else if (data.type === 'evolution') {
        // ==========================================
        // 【防御レベル1】相手からの進化パケット相互検証
        // ==========================================
        const remoteSide = (onlinePlayerSide === 'sente' ? 'gote' : 'sente');
        if (!engine || typeof engine.executeRemoteEvolution !== 'function') {
          console.error('MuhouEngine is not ready to validate remote evolution');
          return;
        }

        try {
          const result = engine.executeRemoteEvolution(data.pendingEvo, data.spendingPt, data.evoLogs, remoteSide);
          if (result && !result.valid) {
            console.error('TAMPER_DETECTED in remote evolution:', result.reason);
            try {
              conn.send({
                type: 'tamper_detected',
                reason: result.reason,
                senderSide: onlinePlayerSide
              });
            } catch (e) {}
            setTimeout(() => {
              try { conn.close(); } catch (e) {}
            }, 300);
            engine.endGame(onlinePlayerSide, `相手の不正な進化指定（${result.reason}）を検知したため、反則勝ちとなります。`);
          }
        } catch (err) {
          console.error('Error executing remote evolution:', err);
        }
      } else if (data.type === 'tamper_detected') {
        console.warn('Tamper notification received from peer:', data.reason);
        if (engine && !engine.isGameOver()) {
          engine.endGame(onlinePlayerSide, `通信相手からデータ不整合通知（${data.reason || '改変の疑い'}）を受信したため、対局を終了しました。`);
        }
      }
    });

    conn.on('close', () => {
      const engine = getEngine();
      if (engine && !engine.isGameOver()) {
        engine.endGame(onlinePlayerSide, '相手プレイヤーの通信が切断されました（不戦勝）');
      }
    });

    // 安全ネット：万が一相手のhelloパケットが遅延しても3秒後に自動開始
    setTimeout(() => {
      if (!hasSessionStarted && conn && conn.open) {
        hasSessionStarted = true;
        hideAllOnlineModals();
        const engine = getEngine();
        if (engine && typeof engine.startOnlineGameSession === 'function') {
          engine.startOnlineGameSession(onlinePlayerSide, opponentProfile);
        }
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
    if (activePeer && !activePeer.destroyed) {
      activePeer.destroy();
      activePeer = null;
    }
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

  // ==========================================
  // 【防御レベル2】不変（Frozen）オンラインブリッジの公開
  // ==========================================
  window.MuhouOnline = Object.freeze({
    startQuickMatchmaking,
    startRankMatchmaking,
    cancelMatchmaking,
    createFriendRoom,
    joinFriendRoom,
    hideFriendModal,
    hideAllOnlineModals,
    sendOnlineMoveAction,
    sendOnlineEvolutionAction
  });

})();
