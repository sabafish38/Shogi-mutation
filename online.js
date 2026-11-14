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
  const getEngine = () => window.MuhouEngine;

  // Google & Cloudflare パブリック STUN サーバー設定（異なる回線・Wi-Fi間の接続成功率を飛躍的に向上）
  const PEER_CONFIG = {
    debug: 1,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ]
    }
  };

  // プレイヤー識別IDの生成・取得（サードパーティiframe等でlocalStorage制限時も安全動作）
  function getMyPlayerUid() {
    if (myPlayerUid) return myPlayerUid;
    let saved = null;
    try {
      saved = localStorage.getItem('muhou_shogi_player_uid_v1');
    } catch (e) {}
    if (!saved) {
      saved = 'u_' + Math.random().toString(36).substring(2, 9);
      try {
        localStorage.setItem('muhou_shogi_player_uid_v1', saved);
      } catch (e) {}
    }
    myPlayerUid = saved;
    return myPlayerUid;
  }

  let isMatchmakingActive = false;

  // Peerインスタンスの初期化
  function getOrCreatePeer(customId = null) {
    return new Promise((resolve) => {
      function create() {
        if (activePeer && !activePeer.destroyed && !customId) {
          resolve(activePeer);
          return;
        }

        if (activePeer && !activePeer.destroyed) {
          try { activePeer.destroy(); } catch (e) {}
          activePeer = null;
        }

        const peerId = customId || ('muhou_' + getMyPlayerUid() + '_' + Math.floor(Math.random() * 10000));
        try {
          const peer = new Peer(peerId, PEER_CONFIG);

          peer.on('open', (id) => {
            activePeer = peer;
            resolve(peer);
          });

          peer.on('error', (err) => {
            console.warn('Peer error:', err ? err.type || err.message : err);
            try { peer.destroy(); } catch (e) {}
            if (activePeer === peer) activePeer = null;
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
  // 堅牢なランダムバックオフ・ローテーション探査エンジン
  // ------------------------------------------
  async function executeMatchmaking({ mode, slotPrefix, overlayTitle, defaultOppName }) {
    hasSessionStarted = false;
    isMatchmakingActive = true;
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
    const PROBE_TIMEOUT_MS = 2500;

    // マッチング試行ループ（対局開始またはキャンセルまで継続探査＆待機）
    while (isMatchmakingActive && !hasSessionStarted) {
      // 1. 探査（ゲスト）フェーズ：空きスロットの待機ホストへ接続を試みる
      const probePeer = await getOrCreatePeer();
      if (!probePeer || !isMatchmakingActive) {
        if (!isMatchmakingActive) return;
        await new Promise(r => setTimeout(r, 600));
        continue;
      }

      let currentProbeUnavailable = false;
      const onProbeError = (err) => {
        if (err && (err.type === 'peer-unavailable' || (err.message && err.message.includes('Could not connect to peer')))) {
          currentProbeUnavailable = true;
        }
      };
      probePeer.on('error', onProbeError);

      for (let slot = 0; slot < slotCount; slot++) {
        if (!isMatchmakingActive || hasSessionStarted) break;
        const targetHostId = `${slotPrefix}${slot}`;
        currentProbeUnavailable = false;

        try {
          const conn = probePeer.connect(targetHostId, { reliable: true });
          const connected = await new Promise((resolve) => {
            const timer = setTimeout(() => {
              try { conn.close(); } catch (e) {}
              resolve(false);
            }, PROBE_TIMEOUT_MS);

            // 不在エラー（誰もいない）の場合は即座に次スロットへ進む
            const fastCheck = setInterval(() => {
              if (currentProbeUnavailable) {
                clearInterval(fastCheck);
                clearTimeout(timer);
                try { conn.close(); } catch (e) {}
                resolve(false);
              }
            }, 80);

            conn.on('open', () => {
              clearInterval(fastCheck);
              clearTimeout(timer);
              resolve(true);
            });
            conn.on('error', () => {
              clearInterval(fastCheck);
              clearTimeout(timer);
              resolve(false);
            });
          });

          if (connected && isMatchmakingActive && !hasSessionStarted) {
            isHost = false;
            onlinePlayerSide = 'gote';
            try { probePeer.off('error', onProbeError); } catch (e) {}
            setupConnectionEvents(conn, defaultOppName, 'guest');
            return; // ゲストとして接続確立！
          }
        } catch (e) {}
      }

      try { probePeer.off('error', onProbeError); } catch (e) {}
      if (!isMatchmakingActive || hasSessionStarted) return;

      // 2. 待機（ホスト）フェーズ：空いているスロットでホストを開設
      let myHostPeer = null;

      for (let slot = 0; slot < slotCount; slot++) {
        if (!isMatchmakingActive || hasSessionStarted) break;
        const candidateHostId = `${slotPrefix}${slot}`;
        const hostPeer = await getOrCreatePeer(candidateHostId);
        if (hostPeer && !hostPeer.destroyed) {
          myHostPeer = hostPeer;
          break;
        }
      }

      if (myHostPeer && isMatchmakingActive && !hasSessionStarted) {
        isHost = true;
        onlinePlayerSide = 'sente';

        let connectionReceived = false;
        myHostPeer.on('connection', (conn) => {
          if (hasSessionStarted || !isMatchmakingActive) {
            try { conn.close(); } catch (e) {}
            return;
          }
          connectionReceived = true;
          setupConnectionEvents(conn, defaultOppName, 'host');
        });

        // すれ違い防止のランダムジッター待機（4.5秒〜8秒）
        const waitTimeMs = 4500 + Math.floor(Math.random() * 3500);
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, waitTimeMs);
          const poll = setInterval(() => {
            if (!isMatchmakingActive || hasSessionStarted || connectionReceived) {
              clearInterval(poll);
              clearTimeout(timer);
              resolve();
            }
          }, 100);
        });

        if (hasSessionStarted || !isMatchmakingActive) return;

        // 接続を受信している場合は、ハンドシェイクが完了するまで最大8秒待機（勝手に破棄しない！）
        if (connectionReceived) {
          await new Promise((resolve) => {
            const hTimer = setTimeout(resolve, 8000);
            const hPoll = setInterval(() => {
              if (hasSessionStarted || !isMatchmakingActive) {
                clearInterval(hPoll);
                clearTimeout(hTimer);
                resolve();
              }
            }, 100);
          });
          if (hasSessionStarted || !isMatchmakingActive) return;
        }

        // 誰も来なかった場合のみ、ホストを安全に破棄して次の探査サイクルへ移行
        if (myHostPeer && !myHostPeer.destroyed) {
          try { myHostPeer.destroy(); } catch (e) {}
          activePeer = null;
        }
      } else {
        await new Promise(r => setTimeout(r, 600 + Math.floor(Math.random() * 400)));
      }
    }
  }

  async function startRankMatchmaking() {
    await executeMatchmaking({
      mode: 'rank',
      slotPrefix: 'muhou_v32_rank_s_',
      overlayTitle: '真剣勝負（格付戦）：全国の棋士を探索中...',
      defaultOppName: '全国の棋士'
    });
  }

  async function startQuickMatchmaking() {
    await executeMatchmaking({
      mode: 'online',
      slotPrefix: 'muhou_v32_quick_s_',
      overlayTitle: '通信対局（カジュアル戦）：全国の好敵手を探索中...',
      defaultOppName: '全国の好敵手'
    });
  }

  function cancelMatchmaking() {
    isMatchmakingActive = false;
    if (onlineSearchTimer) {
      clearInterval(onlineSearchTimer);
      onlineSearchTimer = null;
    }
    if (activePeer && !activePeer.destroyed) {
      try { activePeer.destroy(); } catch (e) {}
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

      const myKnownPlayers = (engine && typeof engine.getLocalRealPlayers === 'function')
        ? engine.getLocalRealPlayers()
        : [];
      conn.send({
        type: role === 'host' ? 'hello_host' : 'hello_guest',
        uid: getMyPlayerUid(),
        name: prof.name || (role === 'host' ? '部屋主' : '挑戦者'),
        rank: rankInfo.title,
        rating: rating,
        streak: prof.streak || 0,
        maxStreak: prof.maxStreak || 0,
        wins: prof.wins || 0,
        losses: prof.losses || 0,
        bountiesClaimed: prof.bountiesClaimed || 0,
        title: prof.equippedTitle || '全国の猛者',
        mode: currentSessionMode,
        knownRealPlayers: myKnownPlayers
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
          uid: data.uid || ('u_' + oppName),
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

        // 実在棋士レジストリへ即時自動登録 & P2Pゴシップ同期
        if (engine) {
          if (typeof engine.registerRealPlayer === 'function') {
            engine.registerRealPlayer({
              uid: opponentProfile.uid,
              name: opponentProfile.name,
              rank: opponentProfile.rank,
              rating: opponentProfile.rating,
              title: opponentProfile.title,
              wins: opponentProfile.wins,
              losses: opponentProfile.losses,
              streak: opponentProfile.streak,
              maxStreak: opponentProfile.maxStreak,
              isReal: true
            });
          }
          if (Array.isArray(data.knownRealPlayers) && typeof engine.mergeRealPlayers === 'function') {
            engine.mergeRealPlayers(data.knownRealPlayers);
          }
        }

        if (data.type !== 'hello_ack') {
          try {
            const prof = engine ? engine.getUserProfile() : {};
            const rating = prof.rating || 1200;
            const rankInfo = engine ? engine.getRankInfo(rating) : { title: '初段' };
            const myKnownAck = (engine && typeof engine.getLocalRealPlayers === 'function')
              ? engine.getLocalRealPlayers()
              : [];
            conn.send({
              type: 'hello_ack',
              uid: getMyPlayerUid(),
              name: prof.name || (role === 'host' ? '部屋主' : '挑戦者'),
              rank: rankInfo.title,
              rating: rating,
              streak: prof.streak || 0,
              maxStreak: prof.maxStreak || 0,
              wins: prof.wins || 0,
              losses: prof.losses || 0,
              bountiesClaimed: prof.bountiesClaimed || 0,
              title: prof.equippedTitle || '全国の猛者',
              mode: currentSessionMode,
              knownRealPlayers: myKnownAck
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
      } else if (data.type === 'player_left') {
        console.log('Opponent left match screen:', data);
        if (engine && !engine.isGameOver()) {
          engine.endGame(onlinePlayerSide, '相手が対戦画面を離脱しました（不戦勝）');
        } else if (engine && engine.isGameOver()) {
          if (typeof engine.handleRemotePlayerLeftPostgame === 'function') {
            engine.handleRemotePlayerLeftPostgame();
          }
        }
      } else if (data.type === 'player_left_postgame') {
        if (engine && engine.isGameOver()) {
          if (typeof engine.handleRemotePlayerLeftPostgame === 'function') {
            engine.handleRemotePlayerLeftPostgame();
          }
        }
      } else if (data.type === 'rematch_intent') {
        if (engine && typeof engine.handleRemoteRematchIntent === 'function') {
          engine.handleRemoteRematchIntent();
        }
      } else if (data.type === 'rematch_start') {
        if (engine && typeof engine.handleRemoteRematchStart === 'function') {
          engine.handleRemoteRematchStart();
        }
      }
    });

    conn.on('close', () => {
      const engine = getEngine();
      if (engine && !engine.isGameOver()) {
        engine.endGame(onlinePlayerSide, '相手プレイヤーが対戦画面を離脱しました（不戦勝）');
      } else if (engine && engine.isGameOver()) {
        if (typeof engine.handleRemotePlayerLeftPostgame === 'function') {
          engine.handleRemotePlayerLeftPostgame();
        }
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
    const engine = getEngine();
    if (!activePeerConn || !activePeerConn.open) {
      console.warn('sendOnlineMoveAction: activePeerConn is not open', activePeerConn);
      if (engine && typeof engine.addBattleLog === 'function') {
        engine.addBattleLog('通信注意: 相手端末との接続を確認中... (再試行中)', 'log-warning');
      }
      return;
    }

    try {
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
    } catch (e) {
      console.error('sendOnlineMoveAction failed:', e);
    }
  }

  function sendOnlineEvolutionAction(pendingEvoArray, spendingPt, evoLogs) {
    const engine = getEngine();
    if (!activePeerConn || !activePeerConn.open) {
      console.warn('sendOnlineEvolutionAction: activePeerConn is not open', activePeerConn);
      return;
    }

    try {
      activePeerConn.send({
        type: 'evolution',
        senderSide: onlinePlayerSide,
        pendingEvo: pendingEvoArray,
        spendingPt,
        evoLogs
      });
    } catch (e) {
      console.error('sendOnlineEvolutionAction failed:', e);
    }
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
  
  function sendOnlineRematchIntent() {
    if (!activePeerConn || !activePeerConn.open) return;
    try {
      activePeerConn.send({
        type: 'rematch_intent',
        senderSide: onlinePlayerSide
      });
    } catch (e) {
      console.warn('sendOnlineRematchIntent error:', e);
    }
  }

  function sendOnlineRematchStart() {
    if (!activePeerConn || !activePeerConn.open) return;
    try {
      activePeerConn.send({
        type: 'rematch_start',
        senderSide: onlinePlayerSide
      });
    } catch (e) {
      console.warn('sendOnlineRematchStart error:', e);
    }
  }

  function setOnlinePlayerSide(newSide) {
    onlinePlayerSide = newSide;
  }

  function leaveCurrentSession(reason = 'leave') {
    if (activePeerConn && activePeerConn.open) {
      try {
        activePeerConn.send({
          type: reason === 'postgame' ? 'player_left_postgame' : 'player_left',
          senderSide: onlinePlayerSide,
          isSurrender: reason !== 'postgame'
        });
      } catch (e) {}
      setTimeout(() => {
        try { if (activePeerConn) activePeerConn.close(); } catch (e) {}
        activePeerConn = null;
      }, 50);
    } else {
      activePeerConn = null;
    }

    if (activePeer && !activePeer.destroyed) {
      setTimeout(() => {
        try { if (activePeer) activePeer.destroy(); } catch (e) {}
        activePeer = null;
      }, 100);
    }

    hasSessionStarted = false;
    isMatchmakingActive = false;
  }

  window.MuhouOnline = Object.freeze({
    getMyPlayerUid,
    startQuickMatchmaking,
    startRankMatchmaking,
    cancelMatchmaking,
    createFriendRoom,
    joinFriendRoom,
    hideFriendModal,
    hideAllOnlineModals,
    sendOnlineMoveAction,
    sendOnlineEvolutionAction,
    sendOnlineRematchIntent,
    sendOnlineRematchStart,
    setOnlinePlayerSide,
    leaveCurrentSession
  });

})();
