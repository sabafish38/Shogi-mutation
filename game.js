/**
 * 無法将棋 - SHOGI: MUTATION
 * メインゲームロジック & CPU思考エンジン
 * ・駒の表面表記＝現在の持ちポイント（数字）
 * ・獲得ポイントは所持バンクに貯金可能
 * ・手番では「駒を動かす」か「所持ポイントを使って駒を進化させる」のどちらかを選択
 */

const PIECE_DEFS = {
  fu: {
    kanji: '歩',
    name: '歩兵',
    subTag: '',
    basePt: 1,
    steps: [[0, -1]],
    rays: []
  },
  kyo: {
    kanji: '香',
    name: '香車',
    subTag: '↑∞',
    basePt: 1,
    steps: [],
    rays: [[0, -1]]
  },
  kei: {
    kanji: '桂',
    name: '桂馬',
    subTag: '跳',
    basePt: 2,
    steps: [[-1, -2], [1, -2]],
    rays: []
  },
  gin: {
    kanji: '銀',
    name: '銀将',
    subTag: '',
    basePt: 5,
    steps: [[-1, -1], [0, -1], [1, -1], [-1, 1], [1, 1]],
    rays: []
  },
  kin: {
    kanji: '金',
    name: '金将',
    subTag: '',
    basePt: 6,
    steps: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [0, 1]],
    rays: []
  },
  kaku: {
    kanji: '角',
    name: '角行',
    subTag: '×∞',
    basePt: 4,
    steps: [],
    rays: [[-1, -1], [1, -1], [-1, 1], [1, 1]]
  },
  hisha: {
    kanji: '飛',
    name: '飛車',
    subTag: '＋∞',
    basePt: 4,
    steps: [],
    rays: [[0, -1], [0, 1], [-1, 0], [1, 0]]
  },
  ou: {
    kanji: '王',
    kanjiGote: '玉',
    name: '王将',
    subTag: 'KING',
    basePt: 8,
    steps: [
      [-1, -1], [0, -1], [1, -1],
      [-1,  0],          [1,  0],
      [-1,  1], [0,  1], [1,  1]
    ],
    rays: []
  }
};

// 内周8マス座標リスト (Tier 1)
const INNER_COORDS = [
  [-1, -1], [0, -1], [1, -1],
  [-1,  0],          [1,  0],
  [-1,  1], [0,  1], [1,  1]
];

const KANJI_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const FULL_NUMS = ['９', '８', '７', '６', '５', '４', '３', '２', '１'];

// ゲーム状態
let state = {
  board: [],               // 9x9: null or piece object
  turn: 'sente',           // 'sente' | 'gote'
  phase: 'play',           // 'play' | 'gameover'
  bank: {                  // 貯金されている所持ポイント (案A: 初期0ptフラット)
    sente: 0,
    gote: 0
  },
  pendingEvo: [],          // 現ターン中に仮割り振りしている進化 [{ pieceId, dx, dy }]
  selectedCell: null,      // { r, c }
  validMoves: [],          // [{ r, c, isCapture }]
  inspectedPiece: null,    // 現在右パネルに表示中の駒オブジェクト
  lastMove: null,          // { fromR, fromC, toR, toC }
  history: [],             // 待った用のスナップショット配列
  mode: 'cpu-normal',      // 'pvp' | 'cpu-easy' | 'cpu-normal' | 'cpu-hard'
  playerSide: 'sente',
  nextPieceId: 1,
  movesCount: 0,           // 総手数
  tennozanStreak: { sente: 0, gote: 0 }, // ５五連続居座りカウント (最大3回まで)
  lastTennozanPieceId: null, // ５五に現在いる駒のID
  lastTennozanOwner: null,   // 最後に天王山（５五）を制圧・占拠したプレイヤー ('sente' | 'gote')
  isSuddenDeath: false,    // 80手到達でサドンデスモード発動
  pendingOpponentEvoNotification: null // 相手が進化した場合の通知用データ
};

// DOM要素参照
const elBoard = document.getElementById('shogi-board');
const elTurnIndicator = document.getElementById('turn-indicator');
const elSubStatus = document.getElementById('sub-status');
const elStatusBanner = document.getElementById('status-banner');
const elCardSente = document.getElementById('card-sente');
const elCardGote = document.getElementById('card-gote');
const elBattleLog = document.getElementById('battle-log');
const elEvoBox = document.getElementById('evolution-box');
const elEvoRemaining = document.getElementById('evo-remaining-pt');
const elEvoSpending = document.getElementById('evo-spending-pt');
const elEvoMsg = document.getElementById('evo-capture-msg');
const elBtnEvoReset = document.getElementById('btn-evo-reset');
const elBtnEvoConfirm = document.getElementById('btn-evo-confirm');
const elMoveMatrix = document.getElementById('move-matrix');
const elInspKanji = document.getElementById('insp-kanji');
const elInspName = document.getElementById('insp-name');
const elInspPoints = document.getElementById('insp-points');
const elInspTier = document.getElementById('insp-tier');
const elInspOwnerBadge = document.getElementById('inspector-owner-badge');
const elCheckBanner = document.getElementById('check-banner');
const elCheckBannerTarget = document.getElementById('check-banner-target');
const elSuddenDeathBanner = document.getElementById('sudden-death-banner');

let checkBannerTimer = null;
let suddenDeathBannerTimer = null;

// 王手バナー（画面全体・一時的演出）を表示
function showCheckBanner(targetOwner) {
  if (!elCheckBanner) return;
  const targetLabel = targetOwner === 'sente' ? '☗ 先手玉に王手！' : '☖ 後手玉に王手！';
  if (elCheckBannerTarget) {
    elCheckBannerTarget.textContent = `${targetLabel} (CHECK!)`;
  }

  // アニメーションを確実に再トリガーするため再描画
  elCheckBanner.classList.add('hidden');
  void elCheckBanner.offsetWidth; // リフロー発生
  elCheckBanner.classList.remove('hidden');

  if (checkBannerTimer) {
    clearTimeout(checkBannerTimer);
  }
  checkBannerTimer = setTimeout(() => {
    elCheckBanner.classList.add('hidden');
  }, 1350);
}

// サドンデスバナー演出を表示
function showSuddenDeathBanner() {
  if (!elSuddenDeathBanner) return;
  elSuddenDeathBanner.classList.remove('hidden');
  void elSuddenDeathBanner.offsetWidth;
  if (suddenDeathBannerTimer) {
    clearTimeout(suddenDeathBannerTimer);
  }
  suddenDeathBannerTimer = setTimeout(() => {
    elSuddenDeathBanner.classList.add('hidden');
  }, 2200);
}

// ==========================================
// ローカルストレージ自動保存・復元（リロード対策）
// ==========================================
const STORAGE_KEY = 'muhou_shogi_saved_state_v1';

function saveGameToStorage() {
  try {
    const data = {
      board: state.board,
      turn: state.turn,
      phase: state.phase,
      bank: state.bank,
      lastMove: state.lastMove,
      nextPieceId: state.nextPieceId,
      movesCount: state.movesCount,
      tennozanStreak: state.tennozanStreak,
      lastTennozanPieceId: state.lastTennozanPieceId,
      lastTennozanOwner: state.lastTennozanOwner,
      isSuddenDeath: state.isSuddenDeath,
      history: state.history,
      mode: state.mode,
      playerSide: state.playerSide,
      recentLogs: state.recentLogs || []
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('LocalStorage save error:', err);
  }
}

function loadGameFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !data.board || !Array.isArray(data.board) || data.board.length !== 9) return false;

    state.board = data.board;
    state.turn = data.turn || 'sente';
    state.phase = data.phase || 'play';
    state.bank = data.bank || { sente: 0, gote: 0 };
    state.lastMove = data.lastMove || null;
    state.nextPieceId = data.nextPieceId || 1;
    state.movesCount = data.movesCount || 0;
    state.tennozanStreak = data.tennozanStreak || { sente: 0, gote: 0 };
    state.lastTennozanPieceId = data.lastTennozanPieceId || null;
    state.lastTennozanOwner = data.lastTennozanOwner || null;
    state.isSuddenDeath = data.isSuddenDeath || false;
    state.history = data.history || [];
    state.mode = data.mode || 'cpu-normal';
    state.playerSide = data.playerSide || 'sente';
    state.pendingEvo = [];
    state.selectedCell = null;
    state.validMoves = [];
    state.inspectedPiece = null;
    state.recentLogs = data.recentLogs || [];

    const elGameMode = document.getElementById('game-mode');
    if (elGameMode) elGameMode.value = state.mode;
    const elPlayerSide = document.getElementById('player-side');
    if (elPlayerSide) elPlayerSide.value = state.playerSide;

    updatePlayerNames();

    // ログ復元
    if (elBattleLog) elBattleLog.innerHTML = '';
    if (state.recentLogs && state.recentLogs.length > 0) {
      for (let i = state.recentLogs.length - 1; i >= 0; i--) {
        const item = state.recentLogs[i];
        const entry = document.createElement('div');
        entry.className = `log-entry ${item.extraClass || ''}`;
        entry.textContent = item.text;
        if (elBattleLog) elBattleLog.prepend(entry);
      }
      const ticker = document.getElementById('latest-log-text');
      if (ticker && state.recentLogs[0]) {
        ticker.textContent = state.recentLogs[0].text;
      }
    }

    addLog('💾 前回の対局データを再開しました');
    renderAll();

    // 再読み込み時にCPU番なら自動で思考再開
    if (isCPUTurn() && state.phase === 'play') {
      setTimeout(cpuDecideAction, 600);
    }

    return true;
  } catch (err) {
    console.warn('LocalStorage load error:', err);
    return false;
  }
}

function clearGameStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {}
}

function restartNewGame() {
  clearGameStorage();
  initGame();
}

// 初期化
function initGame() {
  state.mode = document.getElementById('game-mode').value;
  state.playerSide = document.getElementById('player-side').value;
  state.turn = 'sente';
  state.phase = 'play';
  state.bank = { sente: 0, gote: 0 }; // 案A: 初期0ptフラット（先後完全対等スタート）
  state.pendingEvo = [];
  state.selectedCell = null;
  state.validMoves = [];
  state.inspectedPiece = null;
  state.lastMove = null;
  state.history = [];
  state.recentLogs = [];
  state.nextPieceId = 1;
  state.movesCount = 0;
  state.tennozanStreak = { sente: 0, gote: 0 };
  state.lastTennozanPieceId = null;
  state.lastTennozanOwner = null;
  state.isSuddenDeath = false;
  state.pendingOpponentEvoNotification = null;
  hideEnemyEvolutionNotification();

  if (checkBannerTimer) {
    clearTimeout(checkBannerTimer);
    checkBannerTimer = null;
  }
  if (elCheckBanner) {
    elCheckBanner.classList.add('hidden');
  }
  if (suddenDeathBannerTimer) {
    clearTimeout(suddenDeathBannerTimer);
    suddenDeathBannerTimer = null;
  }
  if (elSuddenDeathBanner) {
    elSuddenDeathBanner.classList.add('hidden');
  }

  setupInitialBoard();
  elBattleLog.innerHTML = '';
  addLog('対局開始！駒の数字は「持ちポイント」です。敵を倒してポイントを貯め、手番で「移動」か「進化」を選びましょう。');

  updatePlayerNames();
  renderAll();
  checkTriggerCPU();
}

function updatePlayerNames() {
  const senteNameEl = document.getElementById('sente-name');
  const goteNameEl = document.getElementById('gote-name');
  if (state.mode === 'pvp') {
    senteNameEl.textContent = 'プレイヤー1';
    goteNameEl.textContent = 'プレイヤー2';
  } else {
    const cpuLabel = state.mode === 'cpu-hard' ? 'CPU (強敵)' : state.mode === 'cpu-easy' ? 'CPU (入門)' : 'CPU (標準)';
    if (state.playerSide === 'sente') {
      senteNameEl.textContent = 'あなた';
      goteNameEl.textContent = cpuLabel;
    } else {
      senteNameEl.textContent = cpuLabel;
      goteNameEl.textContent = 'あなた';
    }
  }
}

function createPiece(type, owner) {
  const def = PIECE_DEFS[type];
  return {
    id: state.nextPieceId++,
    type,
    owner,
    kanji: owner === 'gote' && def.kanjiGote ? def.kanjiGote : def.kanji,
    name: def.name,
    subTag: def.subTag,
    basePt: def.basePt,
    initialSteps: def.steps.map(s => [...s]),
    initialRays: def.rays.map(r => [...r]),
    evolvedSteps: [], // [[dx, dy], ...]
    evolvedRays: []   // [[rx, ry], ...] 案A: 進化で獲得した走り方向！
  };
}

function setupInitialBoard() {
  state.board = Array.from({ length: 9 }, () => Array(9).fill(null));

  // 後手 (上側: row 0..2)
  const backRow = ['kyo', 'kei', 'gin', 'kin', 'ou', 'kin', 'gin', 'kei', 'kyo'];
  for (let c = 0; c < 9; c++) {
    state.board[0][c] = createPiece(backRow[c], 'gote');
    state.board[2][c] = createPiece('fu', 'gote');
  }
  state.board[1][1] = createPiece('hisha', 'gote');
  state.board[1][7] = createPiece('kaku', 'gote');

  // 先手 (下側: row 6..8)
  for (let c = 0; c < 9; c++) {
    state.board[6][c] = createPiece('fu', 'sente');
    state.board[8][c] = createPiece(backRow[c], 'sente');
  }
  state.board[7][1] = createPiece('kaku', 'sente');
  state.board[7][7] = createPiece('hisha', 'sente');

  // デフォルトで自軍の飛車をインスペクターに表示
  state.inspectedPiece = state.playerSide === 'gote' ? state.board[1][1] : state.board[7][7];
}

// 駒の現在の持ちポイントを計算
function getPieceTotalPt(piece, includePending = false) {
  let pt = piece.basePt + piece.evolvedSteps.length + (piece.evolvedRays ? piece.evolvedRays.length : 0);
  if (includePending && state.pendingEvo.length > 0) {
    pt += state.pendingEvo.filter(p => p.pieceId === piece.id).length;
  }
  return pt;
}

// 駒の表示ラベル（例: "👑8" や "4"）
function getPieceDisplayLabel(piece, includePending = false) {
  const pt = getPieceTotalPt(piece, includePending);
  return piece.type === 'ou' ? `👑${pt}` : `${pt}`;
}

// 相対座標(dx, dy)にその駒がステップ移動を持っているか判定
function hasStepAt(piece, dx, dy, includePending = false) {
  if (piece.initialSteps.some(([sx, sy]) => sx === dx && sy === dy)) return 'initial';
  if (piece.evolvedSteps.some(([ex, ey]) => ex === dx && ey === dy)) return 'evolved';
  if (includePending && state.pendingEvo.length > 0) {
    if (state.pendingEvo.some(p => p.pieceId === piece.id && p.dx === dx && p.dy === dy && p.type !== 'ray')) {
      return 'pending';
    }
  }
  return null;
}

function hasRayInDir(piece, dx, dy, includePending = false) {
  const allRays = [...piece.initialRays, ...(piece.evolvedRays || [])];
  const hasBase = allRays.some(([rx, ry]) => {
    if (rx === 0 && ry === 0) return false;
    if (Math.sign(dx) !== Math.sign(rx) || Math.sign(dy) !== Math.sign(ry)) return false;
    if (rx === 0) return dx === 0;
    if (ry === 0) return dy === 0;
    return Math.abs(dx) === Math.abs(dy);
  });
  if (hasBase) return true;

  if (includePending && state.pendingEvo.length > 0) {
    return state.pendingEvo.some(p => {
      if (p.pieceId !== piece.id || p.type !== 'ray') return false;
      if (Math.sign(dx) !== Math.sign(p.dx) || Math.sign(dy) !== Math.sign(p.dy)) return false;
      if (p.dx === 0) return dx === 0;
      if (p.dy === 0) return dy === 0;
      return Math.abs(dx) === Math.abs(dy);
    });
  }
  return false;
}

// 新仕様: 1マス目と2マス目の「両方を開放した方向のみ」走り(直進無限)へアップグレード可能！
function canUpgradeToRay(piece, dx, dy, includePending = true) {
  if (!piece || piece.type === 'ou') return false; // 王は進化不可
  if (dx === 0 && dy === 0) return false;

  const dirX = Math.sign(dx);
  const dirY = Math.sign(dy);

  // 直進8方向以外（桂馬ジャンプ等）は走り化不可
  const isStraight = (dirX === 0 || dirY === 0 || Math.abs(dirX) === Math.abs(dirY));
  if (!isStraight) return false;

  // すでにその方向に走りを持っているなら不可
  if (hasRayInDir(piece, dirX, dirY, includePending)) return false;

  // 1マス目と2マス目の両方をステップ移動として持っているか？
  const hasStep1 = hasStepAt(piece, dirX, dirY, includePending) !== null;
  const hasStep2 = hasStepAt(piece, dirX * 2, dirY * 2, includePending) !== null;

  return hasStep1 && hasStep2;
}

// 内周8マスすべてが移動可能か判定（第2段階解放条件）
function isInnerRingComplete(piece, includePending = false) {
  return INNER_COORDS.every(([dx, dy]) => {
    return hasStepAt(piece, dx, dy, includePending) !== null || hasRayInDir(piece, dx, dy);
  });
}

// 指定した駒の相対座標(dx, dy)が現在解放可能かどうか
function canUnlockCoord(piece, dx, dy, includePending = true) {
  // 王将・玉将は守るべき神聖なシンボルのため進化不可（8pt固定）
  if (piece.type === 'ou') return false;

  if (dx === 0 && dy === 0) return false;
  if (hasStepAt(piece, dx, dy, includePending) !== null) return false;
  if (hasRayInDir(piece, dx, dy, includePending)) return false;

  // 改善: 周囲プラス2マス（内周1マス・外周2マス・桂馬ジャンプ等）を制限なく自由に1ptで解放可能！
  const ring = Math.max(Math.abs(dx), Math.abs(dy));
  return (ring === 1 || ring === 2);
}

// 現手番プレイヤーの残り使用可能ポイント
function getRemainingBankPt() {
  return state.bank[state.turn] - state.pendingEvo.length;
}

// 盤面上の指定駒の合法手を列挙
function getValidMovesForPiece(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const moves = [];
  const sign = piece.owner === 'sente' ? 1 : -1;

  // 1. ステップ移動 (初期 + 進化追加)
  const allSteps = [...piece.initialSteps, ...piece.evolvedSteps];
  for (const [dx, dy] of allSteps) {
    // 走りに昇格済みの方向なら走りでカバーされるのでスキップ
    if (hasRayInDir(piece, dx, dy, false)) continue;

    const nr = r + dy * sign;
    const nc = c + dx * sign;
    if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
      const target = board[nr][nc];
      if (!target) {
        moves.push({ r: nr, c: nc, isCapture: false });
      } else if (target.owner !== piece.owner) {
        moves.push({ r: nr, c: nc, isCapture: true });
      }
    }
  }

  // 2. 走り移動 (初期走り + 案A: 進化獲得走り)
  const allRays = [...piece.initialRays, ...(piece.evolvedRays || [])];
  for (const [rx, ry] of allRays) {
    const dr = ry * sign;
    const dc = rx * sign;
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
      const target = board[nr][nc];
      if (!target) {
        if (!moves.some(m => m.r === nr && m.c === nc)) {
          moves.push({ r: nr, c: nc, isCapture: false });
        }
      } else {
        if (target.owner !== piece.owner) {
          if (!moves.some(m => m.r === nr && m.c === nc)) {
            moves.push({ r: nr, c: nc, isCapture: true });
          }
        }
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  return moves;
}

// 座標を将棋表記（例: ７六）に変換
function formatPos(r, c) {
  return `${FULL_NUMS[c]}${KANJI_NUMS[r]}`;
}

// 履歴保存（待った用）
function saveHistory() {
  const snapshot = JSON.stringify({
    board: state.board,
    turn: state.turn,
    phase: state.phase,
    bank: state.bank,
    lastMove: state.lastMove,
    nextPieceId: state.nextPieceId,
    movesCount: state.movesCount,
    tennozanStreak: state.tennozanStreak,
    lastTennozanPieceId: state.lastTennozanPieceId,
    lastTennozanOwner: state.lastTennozanOwner,
    isSuddenDeath: state.isSuddenDeath
  });
  state.history.push(snapshot);
  if (state.history.length > 80) state.history.shift();
}

// ひとつ前の自分の番に戻す
function undoMove() {
  if (state.history.length === 0) {
    addLog('これ以上待ったはできません。');
    return;
  }

  const currentMoves = state.movesCount;
  let chosenSnapshot = null;

  if (state.mode !== 'pvp') {
    // CPU対戦時：ひとつ前の自分の手番（自分の手番かつ手数が現在より前、または終局時）まで巻き戻す
    while (state.history.length > 0) {
      const raw = state.history.pop();
      const snap = JSON.parse(raw);
      if (snap.turn === state.playerSide && (snap.movesCount < currentMoves || state.phase === 'gameover')) {
        chosenSnapshot = snap;
        break;
      }
    }
  } else {
    // 対人戦（PvP）時：直前の1手前に戻す
    if (state.history.length > 0) {
      chosenSnapshot = JSON.parse(state.history.pop());
    }
  }

  if (!chosenSnapshot) {
    addLog('これ以上待ったはできません。');
    return;
  }

  state.board = chosenSnapshot.board;
  state.turn = chosenSnapshot.turn;
  state.phase = chosenSnapshot.phase || 'play';
  state.bank = chosenSnapshot.bank;
  state.lastMove = chosenSnapshot.lastMove;
  state.nextPieceId = chosenSnapshot.nextPieceId;
  state.movesCount = chosenSnapshot.movesCount || 0;
  state.tennozanStreak = chosenSnapshot.tennozanStreak || { sente: 0, gote: 0 };
  state.lastTennozanPieceId = chosenSnapshot.lastTennozanPieceId || null;
  state.lastTennozanOwner = chosenSnapshot.lastTennozanOwner || null;
  state.isSuddenDeath = chosenSnapshot.isSuddenDeath || false;
  state.pendingEvo = [];
  state.selectedCell = null;
  state.validMoves = [];
  state.inspectedPiece = null;

  if (gameoverModal) gameoverModal.classList.add('hidden');
  hideEnemyEvolutionNotification();

  addLog('↩ ひとつ前の自分の番に戻しました。');
  renderAll();
}

// 盤面セルクリック処理
function onCellClick(r, c) {
  if (state.phase === 'gameover') return;
  if (isCPUTurn()) return;

  const clickedPiece = state.board[r][c];
  if (clickedPiece) {
    state.inspectedPiece = clickedPiece;
  }

  // ★重要バグ修正: 撃破即時進化フェーズ中、盤面クリックで移動が誤発火してフェーズが破壊されるのを完全防止！
  // 自軍の駒をクリックした場合は進化対象インスペクターを切り替えるのみ
  if (state.phase === 'instant_evo') {
    if (clickedPiece && clickedPiece.owner === state.turn) {
      state.inspectedPiece = clickedPiece;
    }
    state.selectedCell = null;
    state.validMoves = [];
    renderAll();
    return;
  }

  // もし現在通常手番で進化ポイントを仮割り振り中の場合：
  // 盤上のどの味方駒をクリックしてもインスペクターが切り替わり、続けて別の味方駒にもポイントを振れる！
  if (state.pendingEvo.length > 0) {
    state.selectedCell = null;
    state.validMoves = [];
    renderAll();
    return;
  }

  // 1. すでに駒を選択中の場合
  if (state.selectedCell) {
    // 選択中のセルをもう一度クリックした場合 -> 選択解除（盤上の範囲表示を消去）
    if (state.selectedCell.r === r && state.selectedCell.c === c) {
      state.selectedCell = null;
      state.validMoves = [];
      renderAll();
      return;
    }

    // 自軍駒を選択中かつ、移動可能マス（敵駒含む）をクリックした場合 -> 移動/捕獲を実行
    if (!state.selectedCell.isEnemy) {
      const move = state.validMoves.find(m => m.r === r && m.c === c);
      if (move) {
        executeMove(state.selectedCell.r, state.selectedCell.c, r, c);
        return;
      }
    }
  }

  // 2. 自軍の駒をクリックした場合 -> 移動候補（緑）を表示 ＆ 下パネルで進化マトリックスを表示
  if (clickedPiece && clickedPiece.owner === state.turn) {
    state.inspectedPiece = clickedPiece;
    state.selectedCell = { r, c, isEnemy: false };
    state.validMoves = getValidMovesForPiece(state.board, r, c);
    renderAll();
  } 
  // 3. 相手の駒をクリックした場合 -> 相手駒の動けるマス（赤色）をハイライト表示！
  else if (clickedPiece && clickedPiece.owner !== state.turn) {
    state.inspectedPiece = clickedPiece;
    state.selectedCell = { r, c, isEnemy: true };
    state.validMoves = getValidMovesForPiece(state.board, r, c);
    renderAll();
  } 
  // 4. 空白マスをクリックした場合 -> 選択解除
  else {
    state.selectedCell = null;
    state.validMoves = [];
    renderAll();
  }
}

// 【アクションA：駒を動かす】の実行
function executeMove(fromR, fromC, toR, toC) {
  hideEnemyEvolutionNotification();
  saveHistory();

  const movingPiece = state.board[fromR][fromC];
  const targetPiece = state.board[toR][toC];

  state.board[toR][toC] = movingPiece;
  state.board[fromR][fromC] = null;
  state.lastMove = { fromR, fromC, toR, toC };
  state.selectedCell = null;
  state.validMoves = [];
  state.inspectedPiece = movingPiece;

  // 天王山（５五）へ入った場合は直近制圧プレイヤーを記録
  if (toR === 4 && toC === 4) {
    state.lastTennozanOwner = movingPiece.owner;
  }

  const sideSymbol = state.turn === 'sente' ? '☗先手' : '☖後手';
  const posStr = formatPos(toR, toC);
  const moverLabel = getPieceDisplayLabel(movingPiece);

  if (targetPiece) {
    const gainedPt = getPieceTotalPt(targetPiece);
    const targetLabel = getPieceDisplayLabel(targetPiece);

    // 王を取ったら即勝利！
    if (targetPiece.type === 'ou') {
      addLog(
        `${sideSymbol} ${posStr}【${moverLabel}】が 敵の王【${targetLabel}】を討ち取った！`,
        'log-capture'
      );
      endGame(state.turn, `${sideSymbol}が相手の王を討ち取りました！`);
      return;
    }

    addLog(
      `${sideSymbol} ${posStr}【${moverLabel}】が 敵の【${targetLabel}(${targetPiece.name})】を撃破！ ⚡＋${gainedPt}pt 吸収！`,
      'log-capture'
    );

    // 【案1: 撃破時即時進化】手番をパスせず、撃破と同時に進化を実行！
    startInstantEvolution(gainedPt, targetPiece.name, movingPiece);
  } else {
    addLog(`${sideSymbol} ${posStr}へ【${moverLabel}(${movingPiece.name})】を移動`);
    endTurn();
  }
}

// 撃破時の即時進化フェーズ（手番消費なし・その場で強化して相手番へ）
function startInstantEvolution(points, enemyName, killerPiece) {
  state.phase = 'instant_evo';
  state.bank[state.turn] += points;
  state.pendingEvo = [];
  // 倒した駒自身をデフォルト選択
  state.inspectedPiece = killerPiece;

  // CPU手番の場合は即座に最適配分して終了
  if (isCPUTurn()) {
    renderAll();
    setTimeout(() => {
      cpuExecuteInstantEvolution(killerPiece, points);
    }, 450);
  } else {
    renderAll();
  }
}

// 5x5マトリックスのセルクリック（進化ポイントの仮割り振り / 取り消し / 走りアップグレード）
function onMatrixCellClick(dx, dy) {
  if (state.phase === 'gameover' || isCPUTurn()) return;
  const piece = state.inspectedPiece;
  if (!piece || piece.owner !== state.turn) return;

  const dirX = Math.sign(dx);
  const dirY = Math.sign(dy);
  const isStraight = (dirX === 0 || dirY === 0 || Math.abs(dirX) === Math.abs(dirY));
  const is2ndStep = isStraight && (dx === dirX * 2 && dy === dirY * 2);

  // 1. 取り消し処理：すでに仮割り振りがある場合
  // 走り覚醒(ray)の取り消し
  const pendingRayIdx = state.pendingEvo.findIndex(
    p => p.pieceId === piece.id && p.type === 'ray' && p.dx === dirX && p.dy === dirY
  );
  if (pendingRayIdx !== -1 && is2ndStep) {
    state.pendingEvo.splice(pendingRayIdx, 1);
    renderAll();
    return;
  }

  // ステップ(step)の取り消し
  const pendingStepIdx = state.pendingEvo.findIndex(
    p => p.pieceId === piece.id && p.type !== 'ray' && p.dx === dx && p.dy === dy
  );
  if (pendingStepIdx !== -1) {
    state.pendingEvo.splice(pendingStepIdx, 1);

    // もしステップを取り消したことで、その方向の走り覚醒条件が満たされなくなった場合は、その走りのpendingも自動取り消し
    if (isStraight && !canUpgradeToRay(piece, dirX, dirY, true)) {
      const depRayIdx = state.pendingEvo.findIndex(
        p => p.pieceId === piece.id && p.type === 'ray' && p.dx === dirX && p.dy === dirY
      );
      if (depRayIdx !== -1) {
        state.pendingEvo.splice(depRayIdx, 1);
      }
    }

    renderAll();
    return;
  }

  // ポイントが残っていない場合は割り振れない
  if (getRemainingBankPt() <= 0) return;

  // 2. 新仕様: 「1マス目と2マス目の両方を開放した方向のみ」走り(直進無限)へアップグレード！
  // 2マス目（外周の直進マス）をクリックした際に走りを覚醒可能！
  if (is2ndStep && canUpgradeToRay(piece, dirX, dirY, true)) {
    state.pendingEvo.push({ pieceId: piece.id, dx: dirX, dy: dirY, type: 'ray' });
    state.selectedCell = null;
    state.validMoves = [];
    renderAll();
    return;
  }

  // 3. 通常の新規ステップ解放（1マス目、または内周完了後の外周マス）
  if (canUnlockCoord(piece, dx, dy, true)) {
    state.pendingEvo.push({ pieceId: piece.id, dx, dy, type: 'step' });
    state.selectedCell = null;
    state.validMoves = [];
    renderAll();
  }
}

// 進化の振り直し（キャンセルして移動に戻れる）
function resetEvolutionPending() {
  state.pendingEvo = [];
  if (state.inspectedPiece && state.inspectedPiece.owner === state.turn) {
    const found = findPieceById(state.board, state.inspectedPiece.id);
    if (found) {
      state.selectedCell = { r: found.r, c: found.c };
      state.validMoves = getValidMovesForPiece(state.board, found.r, found.c);
    }
  }
  renderAll();
}

// 駒の進化方向（盤面から見た矢印と説明）を取得
function getDirectionDescription(piece, dx, dy, isRay) {
  // 盤面上の実際の進行方向（Sente視点）に変換
  const sign = piece.owner === 'sente' ? 1 : -1;
  const boardDx = dx * sign;
  const boardDy = dy * sign;
  const isGote = piece.owner === 'gote';

  if (isRay) {
    if (boardDx === 0 && boardDy > 0) return isGote ? '⬇️ 手前直進無限（前進ビーム！∞）' : '⬇️ 手前直進無限（後退ビーム！∞）';
    if (boardDx === 0 && boardDy < 0) return isGote ? '⬆️ 奥直進無限（後退ビーム！∞）' : '⬆️ 奥直進無限（前進ビーム・香車化！∞）';
    if (boardDx < 0 && boardDy === 0) return '⬅️ 左横直進無限（左ビーム！∞）';
    if (boardDx > 0 && boardDy === 0) return '➡️ 右横直進無限（右ビーム！∞）';
    if (boardDx < 0 && boardDy > 0) return '↙️ 手前左斜め直進無限（斜めビーム！∞）';
    if (boardDx > 0 && boardDy > 0) return '↘️ 手前右斜め直進無限（斜めビーム！∞）';
    if (boardDx < 0 && boardDy < 0) return '↖️ 奥左斜め直進無限（斜めビーム！∞）';
    if (boardDx > 0 && boardDy < 0) return '↗️ 奥右斜め直進無限（斜めビーム！∞）';
    return '∞ 直進無限（走り覚醒！）';
  }

  // ステップ移動 (1マスまたは2マス)
  const ring = Math.max(Math.abs(boardDx), Math.abs(boardDy));
  if (ring === 1) {
    if (boardDx === 0 && boardDy > 0) return isGote ? '⬇️ 手前1マス（前進）' : '⬇️ 手前1マス（引く手・後退）';
    if (boardDx === 0 && boardDy < 0) return isGote ? '⬆️ 奥1マス（引く手・後退）' : '⬆️ 奥1マス（前進）';
    if (boardDx < 0 && boardDy > 0) return '↙️ 手前左斜め1マス';
    if (boardDx > 0 && boardDy > 0) return '↘️ 手前右斜め1マス';
    if (boardDx < 0 && boardDy === 0) return '⬅️ 左横1マス';
    if (boardDx > 0 && boardDy === 0) return '➡️ 右横1マス';
    if (boardDx < 0 && boardDy < 0) return '↖️ 奥左斜め1マス';
    if (boardDx > 0 && boardDy < 0) return '↗️ 奥右斜め1マス';
  } else if (ring === 2) {
    // 2マス直進
    if (boardDx === 0 && boardDy === 2) return isGote ? '⬇️ 手前2マス直進（2歩跳び）' : '⬇️ 手前2マス直進（後退）';
    if (boardDx === 0 && boardDy === -2) return isGote ? '⬆️ 奥2マス直進（後退）' : '⬆️ 奥2マス直進（2歩跳び）';
    if (boardDx === -2 && boardDy === 0) return '⬅️ 左2マス直進';
    if (boardDx === 2 && boardDy === 0) return '➡️ 右2マス直進';
    if (boardDx === -2 && boardDy === 2) return '↙️ 手前左斜め2マス跳び';
    if (boardDx === 2 && boardDy === 2) return '↘️ 手前右斜め2マス跳び';
    if (boardDx === -2 && boardDy === -2) return '↖️ 奥左斜め2マス跳び';
    if (boardDx === 2 && boardDy === -2) return '↗️ 奥右斜め2マス跳び';

    // 桂馬ジャンプ (8方向)
    if (boardDy === 2 && boardDx === -1) return '⬇️↙️ 手前左の桂馬ジャンプ';
    if (boardDy === 2 && boardDx === 1) return '⬇️↘️ 手前右の桂馬ジャンプ';
    if (boardDy === -2 && boardDx === -1) return '⬆️↖️ 奥左の桂馬ジャンプ';
    if (boardDy === -2 && boardDx === 1) return '⬆️↗️ 奥右の桂馬ジャンプ';
    if (boardDx === -2 && boardDy === 1) return '⬅️↙️ 左横手前の桂馬ジャンプ';
    if (boardDx === -2 && boardDy === -1) return '⬅️↖️ 左横奥の桂馬ジャンプ';
    if (boardDx === 2 && boardDy === 1) return '➡️↘️ 右横手前の桂馬ジャンプ';
    if (boardDx === 2 && boardDy === -1) return '➡️↗️ 右横奥の桂馬ジャンプ';
  }

  return `マス移動 (${dx}, ${dy})`;
}

let enemyEvoNotificationTimer = null;

function showEnemyEvolutionNotification(reports) {
  const elToast = document.getElementById('enemy-evo-notification');
  const elBody = document.getElementById('enemy-evo-body');
  const elTitle = document.getElementById('enemy-evo-title-text');
  const btnInspect = document.getElementById('btn-inspect-enemy-evo');
  if (!elToast || !elBody) return;

  if (enemyEvoNotificationTimer) {
    clearTimeout(enemyEvoNotificationTimer);
    enemyEvoNotificationTimer = null;
  }

  const first = reports[0];
  const sideSymbol = first && first.owner === 'sente' ? '☗先手' : '☖相手';
  if (elTitle) {
    elTitle.textContent = `${sideSymbol}が駒を進化させました！`;
  }

  elBody.innerHTML = '';
  for (const rep of reports) {
    const card = document.createElement('div');
    card.className = 'enemy-evo-piece-card';

    const pSide = rep.owner === 'sente' ? '☗' : '☖';
    const changesHtml = rep.changes
      .map(ch => `<li class="enemy-evo-change-item ${ch.isRay ? 'is-ray' : ''}">${ch.desc}</li>`)
      .join('');

    card.innerHTML = `
      <div class="enemy-evo-piece-name">
        <span>${pSide}【${rep.name}】（現在 ${rep.totalPt}pt / +${rep.count}pt強化）</span>
        <span class="enemy-evo-piece-pos">${rep.posStr}</span>
      </div>
      <ul class="enemy-evo-changes-list">
        ${changesHtml}
      </ul>
    `;
    elBody.appendChild(card);
  }

  if (btnInspect && first) {
    btnInspect.onclick = () => {
      // 盤上でその敵駒を選択し、移動範囲と反転マトリックスを表示
      const found = findPieceById(state.board, first.pieceId);
      if (found) {
        state.inspectedPiece = found.piece;
        state.selectedCell = { r: found.r, c: found.c, isEnemy: true };
        state.validMoves = getValidMovesForPiece(state.board, found.r, found.c);
        renderAll();
      }
      hideEnemyEvolutionNotification();
    };
  }

  elToast.classList.remove('hidden');

  // 12秒後に自動消去
  enemyEvoNotificationTimer = setTimeout(() => {
    hideEnemyEvolutionNotification();
  }, 12000);
}

function hideEnemyEvolutionNotification() {
  const elToast = document.getElementById('enemy-evo-notification');
  if (elToast) {
    elToast.classList.add('hidden');
  }
  if (enemyEvoNotificationTimer) {
    clearTimeout(enemyEvoNotificationTimer);
    enemyEvoNotificationTimer = null;
  }
}

// 【アクションB：駒を進化させる】の確定
function confirmEvolutionTurn() {
  const isInstant = state.phase === 'instant_evo';
  if (!isInstant && state.pendingEvo.length === 0) return;

  saveHistory();

  const spentPt = state.pendingEvo.length;
  state.bank[state.turn] -= spentPt;

  const evolvedSummary = new Map();
  let lastEvolvedCoords = null;

  for (const alloc of state.pendingEvo) {
    const found = findPieceById(state.board, alloc.pieceId);
    if (found) {
      if (alloc.type === 'ray') {
        if (!found.piece.evolvedRays) found.piece.evolvedRays = [];
        found.piece.evolvedRays.push([alloc.dx, alloc.dy]);
      } else {
        found.piece.evolvedSteps.push([alloc.dx, alloc.dy]);
      }
      const count = evolvedSummary.get(found.piece.id) || { found, count: 0, rays: 0 };
      count.count++;
      if (alloc.type === 'ray') count.rays++;
      evolvedSummary.set(found.piece.id, count);
      lastEvolvedCoords = { r: found.r, c: found.c };
    }
  }

  const sideSymbol = state.turn === 'sente' ? '☗先手' : '☖後手';
  if (spentPt > 0) {
    const details = [];
    for (const { found, count, rays } of evolvedSummary.values()) {
      const posStr = formatPos(found.r, found.c);
      const newTotal = getPieceTotalPt(found.piece, false);
      const rayText = rays > 0 ? ` (走り+${rays})` : '';
      details.push(`${posStr}【${found.piece.name}】を+${count}pt強化${rayText}(→${newTotal}pt)`);
    }

    addLog(
      `⚡ ${sideSymbol}が進化：${details.join('、')} （残り所持: ${state.bank[state.turn]}pt）`,
      'log-evo'
    );

    // 相手が進化した場合、ターン終了時に通知するデータを保持
    const isOpponentEvo = (state.mode === 'pvp') || (state.turn !== state.playerSide);
    if (isOpponentEvo) {
      const evoReports = [];
      for (const [pieceId, { found, count, rays }] of evolvedSummary.entries()) {
        const pieceAllocs = state.pendingEvo.filter(p => p.pieceId === pieceId);
        const changes = pieceAllocs.map(alloc => {
          const isRay = alloc.type === 'ray';
          const desc = getDirectionDescription(found.piece, alloc.dx, alloc.dy, isRay);
          return { isRay, desc, dx: alloc.dx, dy: alloc.dy };
        });
        evoReports.push({
          pieceId,
          piece: found.piece,
          owner: found.piece.owner,
          posStr: formatPos(found.r, found.c),
          name: found.piece.name,
          totalPt: getPieceTotalPt(found.piece, false),
          count,
          rays,
          changes
        });
      }
      state.pendingOpponentEvoNotification = evoReports;
    }
  }

  state.phase = 'play';
  state.pendingEvo = [];
  state.selectedCell = null;
  state.validMoves = [];
  endTurn();
}

// 陣営の総獲得ポイント（盤上の全駒ポイント合計 ＋ バンク所持ポイント）
function getTotalArmyPoints(owner) {
  const pieces = getAllAllyPieces(state.board, owner);
  let total = state.bank[owner];
  for (const { piece } of pieces) {
    total += getPieceTotalPt(piece, false);
  }
  return total;
}

// ターン終了・交代
function endTurn() {
  state.movesCount++;
  state.turn = state.turn === 'sente' ? 'gote' : 'sente';
  const sideSymbol = state.turn === 'sente' ? '☗先手' : '☖後手';

  // 1. サドンデス突入判定（80手以上）
  if (state.movesCount >= 80 && !state.isSuddenDeath && state.phase !== 'gameover') {
    state.isSuddenDeath = true;
    showSuddenDeathBanner();
    addLog(
      '🔥【サドンデス発動！】80手を超えたためサドンデスに突入！毎ターン両軍に過熱エネルギー(+1pt)が供給されます！120手到達で総ポイント判定！',
      'log-capture'
    );
  }

  // 2. サドンデス・リミット判定（120手到達時）
  if (state.movesCount >= 120 && state.phase !== 'gameover') {
    const senteTotal = getTotalArmyPoints('sente');
    const goteTotal = getTotalArmyPoints('gote');
    if (senteTotal > goteTotal) {
      endGame('sente', `サドンデス判定勝利！（先手 ${senteTotal}pt vs 後手 ${goteTotal}pt）`);
      return;
    } else if (goteTotal > senteTotal) {
      endGame('gote', `サドンデス判定勝利！（後手 ${goteTotal}pt vs 先手 ${senteTotal}pt）`);
      return;
    } else {
      const centerPiece = state.board[4][4];
      const currentHolder = centerPiece ? centerPiece.owner : null;
      const tieWinner = currentHolder || state.lastTennozanOwner || 'gote';
      const winnerLabel = tieWinner === 'sente' ? '先手' : '後手';
      const reasonDetail = currentHolder
        ? `現在天王山（５五）を支配中の${winnerLabel}の勝利`
        : (state.lastTennozanOwner
            ? `最後に天王山（５五）を制圧していた${winnerLabel}の勝利`
            : `後手優位判定による${winnerLabel}の勝利`);
      endGame(tieWinner, `サドンデス同点判定勝利！（${reasonDetail}）`);
      return;
    }
  }

  // 3. サドンデス過熱ボーナス（毎ターン手番側に +1pt 自動支給）
  if (state.isSuddenDeath && state.phase !== 'gameover') {
    state.bank[state.turn] += 1;
    addLog(`🔥【サドンデス過熱】${sideSymbol}に過熱エネルギー ＋1pt！ (残り ${120 - state.movesCount}手で総pt判定)`, 'log-evo');
  }

  // 4. 【案A: 天王山（５五）連続居座り上限3回ルール】
  const centerPiece = state.board[4][4];
  if (centerPiece) {
    state.lastTennozanOwner = centerPiece.owner;
  }
  if (centerPiece && centerPiece.owner === state.turn && state.phase !== 'gameover') {
    if (state.lastTennozanPieceId !== centerPiece.id) {
      state.lastTennozanPieceId = centerPiece.id;
      state.tennozanStreak[state.turn] = 0;
    }

    if (state.tennozanStreak[state.turn] < 3) {
      state.bank[state.turn] += 1;
      state.tennozanStreak[state.turn]++;
      addLog(
        `👑【天王山制圧】${sideSymbol}が５五（中央）を支配中（${state.tennozanStreak[state.turn]}/3回目）！ ＋1pt ボーナス獲得！（所持: ${state.bank[state.turn]}pt）`,
        'log-capture'
      );
    } else {
      addLog(
        `👑【天王山上限】５五の居座りボーナス上限（3回）に達しています。別の駒で入り直すか敵から奪回すると再獲得できます。`
      );
    }
  } else {
    state.tennozanStreak[state.turn] = 0;
    if (!centerPiece) {
      state.lastTennozanPieceId = null;
    }
  }

  renderAll();

  // 相手が進化を行っていた場合、手番開始時に通知タブを表示！
  if (state.pendingOpponentEvoNotification && state.pendingOpponentEvoNotification.length > 0) {
    showEnemyEvolutionNotification(state.pendingOpponentEvoNotification);
    state.pendingOpponentEvoNotification = null;
  }

  // 手番が回ってきた側の玉が王手されているかチェック
  if (state.phase !== 'gameover' && isKingInCheck(state.board, state.turn)) {
    addLog(`⚠️【王手！】${sideSymbol}の玉に王手がかかりました！`, 'log-capture');
    showCheckBanner(state.turn);
  }

  checkTriggerCPU();
}

// ゲーム終了
function endGame(winner, reasonText) {
  state.phase = 'gameover';
  state.winner = winner;
  renderAll();

  const modal = document.getElementById('gameover-modal');
  const title = document.getElementById('gameover-title');
  const desc = document.getElementById('gameover-desc');

  const winnerLabel = winner === 'sente' ? '☗ 先手' : '☖ 後手';
  title.textContent = `${winnerLabel}の勝利！`;
  desc.textContent = reasonText;
  modal.classList.remove('hidden');
  addLog(`🏆 ${winnerLabel}の勝利！ (${reasonText})`);
}

// ヘルパー：盤上の指定陣営の駒一覧を取得
function getAllAllyPieces(board, owner) {
  const list = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p && p.owner === owner) {
        list.push({ r, c, piece: p });
      }
    }
  }
  return list;
}

function findPieceById(board, id) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p && p.id === id) return { r, c, piece: p };
    }
  }
  return null;
}

function isCPUTurn() {
  if (state.mode === 'pvp') return false;
  return state.turn !== state.playerSide;
}

// ==========================================
// CPU 思考エンジン（「移動」と「進化」の選択＆探索）
// ==========================================

function checkTriggerCPU() {
  if (state.phase === 'play' && isCPUTurn()) {
    setTimeout(() => {
      cpuDecideAction();
    }, 450);
  }
}

function cloneBoardForSearch(board) {
  const newBoard = Array.from({ length: 9 }, () => Array(9).fill(null));
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p) {
        newBoard[r][c] = {
          id: p.id,
          type: p.type,
          owner: p.owner,
          kanji: p.kanji,
          name: p.name,
          subTag: p.subTag,
          basePt: p.basePt,
          initialSteps: p.initialSteps,
          initialRays: p.initialRays,
          evolvedSteps: (p.evolvedSteps || []).map(s => [...s]),
          evolvedRays: (p.evolvedRays || []).map(r => [...r])
        };
      }
    }
  }
  return newBoard;
}

// 盤面評価関数（cpuOwner視点のスコア）
function evaluateBoard(board, cpuOwner, bankDiff = 0) {
  // 貯金されているポイントは将来の進化に使えるため高価値（ただし盤上で既に機能している進化よりは少し控えめにして進化を促す）
  let score = bankDiff * 115;
  let senteKing = null;
  let goteKing = null;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (p.type === 'ou') {
        if (p.owner === 'sente') senteKing = { r, c };
        else goteKing = { r, c };
      }
    }
  }

  if (!senteKing) return cpuOwner === 'gote' ? 99999 : -99999;
  if (!goteKing) return cpuOwner === 'sente' ? 99999 : -99999;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (!p) continue;

      const totalPt = p.basePt + p.evolvedSteps.length;
      let val = totalPt * 135;

      // 走り駒ボーナス
      if (p.type === 'hisha' || p.type === 'kaku') {
        val += 320 + p.evolvedSteps.length * 50;
      } else if (p.type === 'kyo') {
        val += 90;
      }

      // 前進・敵玉接近ボーナス
      if (p.type !== 'ou') {
        const progress = p.owner === 'sente' ? (8 - r) : r;
        val += progress * 12;
        const centerDist = Math.abs(4 - c);
        val += (4 - centerDist) * 6;

        const enemyKing = p.owner === 'sente' ? goteKing : senteKing;
        const distToKing = Math.abs(r - enemyKing.r) + Math.abs(c - enemyKing.c);
        val += (14 - distToKing) * (totalPt * 3);

        // 天王山（中央5五マス）制圧ボーナス
        if (r === 4 && c === 4) {
          val += 240;
        }
      }

      if (p.owner === cpuOwner) {
        score += val;
      } else {
        score -= val;
      }
    }
  }

  return score;
}

// すべての合法手を生成
function generateAllMoves(board, owner) {
  const moves = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p && p.owner === owner) {
        const pMoves = getValidMovesForPiece(board, r, c);
        for (const m of pMoves) {
          const target = board[m.r][m.c];
          const captureValue = target ? (target.type === 'ou' ? 10000 : getPieceTotalPt(target)) : 0;
          moves.push({
            fromR: r,
            fromC: c,
            toR: m.r,
            toC: m.c,
            captureValue
          });
        }
      }
    }
  }
  moves.sort((a, b) => b.captureValue - a.captureValue);
  return moves;
}

// 指定した陣営の王が現在王手されている（相手から次に取られる状態）かチェック
function isKingInCheck(board, owner) {
  const enemy = owner === 'sente' ? 'gote' : 'sente';
  const enemyMoves = generateAllMoves(board, enemy);
  return enemyMoves.some(m => m.captureValue >= 10000);
}

// CPUの手番行動決定（移動 vs 進化）
function cpuDecideAction() {
  if (state.phase !== 'play') return;
  const cpuOwner = state.turn;
  const allMoves = generateAllMoves(state.board, cpuOwner);

  if (allMoves.length === 0) {
    const winner = cpuOwner === 'sente' ? 'gote' : 'sente';
    endGame(winner, '指せる手がなくなりました。');
    return;
  }

  try {
    // 1. 敵の王を直接取れる手があれば最優先で指す！
    const kingCapture = allMoves.find(m => m.captureValue >= 10000);
    if (kingCapture) {
      executeMove(kingCapture.fromR, kingCapture.fromC, kingCapture.toR, kingCapture.toC);
      return;
    }

    // 2. 自玉が王手されているか確認
    const inCheck = isKingInCheck(state.board, cpuOwner);

    // 3. 所持ポイントがあり、王手されていない場合、進化を選ぶか検討
    const availablePt = state.bank[cpuOwner];
    if (!inCheck && availablePt > 0) {
      // 盤上で敵の大物（4pt以上）を直ちに取れる手があるか？
      const hasBigCapture = allMoves.some(m => m.captureValue >= 4);

      // 進化を選ぶ確率・条件（ポイントが3pt以上貯まっているか、大物取りがない場合に進化を実行）
      const shouldEvolve =
        (availablePt >= 4 && !hasBigCapture) ||
        (availablePt >= 2 && !hasBigCapture && Math.random() < 0.72) ||
        (availablePt === 1 && allMoves[0].captureValue === 0 && Math.random() < 0.45);

      if (shouldEvolve) {
        const evolved = cpuExecuteEvolutionTurn();
        if (evolved) return;
      }
    }

    // 4. 通常の移動探索を実行
    // パフォーマンス最適化: 全合法手(80〜120手以上)を深層探索するとブラウザがフリーズするため、
    // 捕獲手 + 上位静止手(計最大16手)に絞って高速に評価
    const searchCandidates = [];
    let quietAdded = 0;
    for (const m of allMoves) {
      if (m.captureValue > 0) {
        searchCandidates.push(m);
      } else if (quietAdded < 12) {
        searchCandidates.push(m);
        quietAdded++;
      }
    }
    if (searchCandidates.length === 0) {
      searchCandidates.push(...allMoves.slice(0, 12));
    }

    const depth = state.mode === 'cpu-hard' ? 2 : state.mode === 'cpu-normal' ? 2 : 1;
    let bestMove = searchCandidates[0];
    let bestScore = -Infinity;

    for (const move of searchCandidates) {
      const nextBoard = cloneBoardForSearch(state.board);
      const movingPiece = nextBoard[move.fromR][move.fromC];
      const captured = nextBoard[move.toR][move.toC];
      nextBoard[move.toR][move.toC] = movingPiece;
      nextBoard[move.fromR][move.fromC] = null;

      let bankDiff = 0;
      if (captured) {
        bankDiff += getPieceTotalPt(captured);
      }

      let score = minimax(
        nextBoard,
        depth - 1,
        -Infinity,
        Infinity,
        false,
        cpuOwner,
        bankDiff
      );

      // タダ捨てペナルティ（敵の利きへの自殺ダイブ抑制）
      const enemyOwner = cpuOwner === 'sente' ? 'gote' : 'sente';
      const enemyCounterMoves = generateAllMoves(nextBoard, enemyOwner);
      const isTargeted = enemyCounterMoves.some(em => em.toR === move.toR && em.toC === move.toC);
      if (isTargeted) {
        let risk = getPieceTotalPt(movingPiece) * 140;
        if (captured) {
          risk -= getPieceTotalPt(captured) * 140;
        }
        if (risk > 0) {
          score -= risk;
        }
      }

      const jitter = state.mode === 'cpu-easy' ? (Math.random() * 180 - 90) : (Math.random() * 16 - 8);
      score += jitter;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    executeMove(bestMove.fromR, bestMove.fromC, bestMove.toR, bestMove.toC);
  } catch (err) {
    console.error('CPU思考中に例外が発生したため、安全なフォールバック手を指します:', err);
    executeMove(allMoves[0].fromR, allMoves[0].fromC, allMoves[0].toR, allMoves[0].toC);
  }
}

function minimax(board, depth, alpha, beta, isMaximizing, cpuOwner, bankDiff) {
  const currentOwner = isMaximizing ? cpuOwner : (cpuOwner === 'sente' ? 'gote' : 'sente');

  let senteAlive = false;
  let goteAlive = false;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p && p.type === 'ou') {
        if (p.owner === 'sente') senteAlive = true;
        else goteAlive = true;
      }
    }
  }
  if (!senteAlive) return cpuOwner === 'gote' ? 90000 + depth * 100 : -90000 - depth * 100;
  if (!goteAlive) return cpuOwner === 'sente' ? 90000 + depth * 100 : -90000 - depth * 100;

  if (depth <= 0) {
    return evaluateBoard(board, cpuOwner, bankDiff);
  }

  const moves = generateAllMoves(board, currentOwner);
  if (moves.length === 0) {
    return isMaximizing ? -80000 : 80000;
  }

  const maxBranches = depth >= 2 ? 14 : 10;
  const candidateMoves = moves.slice(0, maxBranches);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const m of candidateMoves) {
      const nextBoard = cloneBoardForSearch(board);
      const mp = nextBoard[m.fromR][m.fromC];
      const cap = nextBoard[m.toR][m.toC];
      nextBoard[m.toR][m.toC] = mp;
      nextBoard[m.fromR][m.fromC] = null;

      let nextBank = bankDiff;
      if (cap && cap.type !== 'ou') {
        nextBank += getPieceTotalPt(cap);
      }

      const ev = minimax(nextBoard, depth - 1, alpha, beta, false, cpuOwner, nextBank);
      if (ev > maxEval) maxEval = ev;
      if (ev > alpha) alpha = ev;
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const m of candidateMoves) {
      const nextBoard = cloneBoardForSearch(board);
      const mp = nextBoard[m.fromR][m.fromC];
      const cap = nextBoard[m.toR][m.toC];
      nextBoard[m.toR][m.toC] = mp;
      nextBoard[m.fromR][m.fromC] = null;

      let nextBank = bankDiff;
      if (cap && cap.type !== 'ou') {
        nextBank -= getPieceTotalPt(cap);
      }

      const ev = minimax(nextBoard, depth - 1, alpha, beta, true, cpuOwner, nextBank);
      if (ev < minEval) minEval = ev;
      if (ev < beta) beta = ev;
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// CPUが進化で手番を使う処理
function cpuExecuteEvolutionTurn() {
  const cpuOwner = state.turn;
  const availablePt = state.bank[cpuOwner];
  if (availablePt <= 0) return false;

  // 今回使うポイント量を決定（基本は全額使うが、たまに1〜2pt温存することも）
  let budget = availablePt;
  if (availablePt >= 5 && Math.random() < 0.25) {
    budget = availablePt - 1;
  }

  state.pendingEvo = [];

  for (let step = 0; step < budget; step++) {
    const allies = getAllAllyPieces(state.board, cpuOwner);
    let bestCandidate = null;
    let bestPriority = -Infinity;

    for (const { r, c, piece } of allies) {
      const currentPt = getPieceTotalPt(piece, true);

      // 走り覚醒の候補探索
      for (const [dx, dy] of INNER_COORDS) {
        if (canUpgradeToRay(piece, dx, dy, true)) {
          let prio = 55;
          if (dy < 0) prio += 25;
          else if (dy === 0) prio += 20;
          prio += Math.random() * 8;
          if (prio > bestPriority) {
            bestPriority = prio;
            bestCandidate = { piece, dx, dy, type: 'ray' };
          }
        }
      }

      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (!canUnlockCoord(piece, dx, dy, true)) continue;

          let priority = 0;

          // 飛車・角の竜王・竜馬化は最優先
          if (piece.type === 'hisha' || piece.type === 'kaku') {
            priority += 95;
          }
          // 銀・金・桂馬の補強
          if (piece.type === 'gin' || piece.type === 'kin' || piece.type === 'kei') {
            priority += 45;
          }

          // 前進している駒ほど優先
          const progress = cpuOwner === 'sente' ? (8 - r) : r;
          priority += progress * 8;

          if (dy < 0) priority += 25;
          else if (dy === 0) priority += 18;
          else if (dx === 0 && dy === 1) priority += 22;

          if (Math.max(Math.abs(dx), Math.abs(dy)) === 2) {
            priority += 38;
          }

          if (currentPt >= 16 && piece.type !== 'ou') {
            priority -= (currentPt - 14) * 8;
          }

          priority += Math.random() * 12;

          if (priority > bestPriority) {
            bestPriority = priority;
            bestCandidate = { piece, dx, dy, type: 'step' };
          }
        }
      }
    }

    if (!bestCandidate) break;

    state.pendingEvo.push({
      pieceId: bestCandidate.piece.id,
      dx: bestCandidate.dx,
      dy: bestCandidate.dy,
      type: bestCandidate.type
    });
    state.inspectedPiece = bestCandidate.piece;
  }

  if (state.pendingEvo.length === 0) return false;

  confirmEvolutionTurn();
  return true;
}

// 撃破時にCPUが即時進化を実行する処理
function cpuExecuteInstantEvolution(killerPiece, points) {
  try {
    const cpuOwner = state.turn;
    state.pendingEvo = [];

    let remaining = points;
    // 1. まず倒した駒自身に優先配分（走り覚醒 or 退路・横移動確保）
    if (killerPiece && killerPiece.owner === cpuOwner && killerPiece.type !== 'ou') {
      const selfQuota = Math.min(remaining, 3);
      for (let i = 0; i < selfQuota; i++) {
        let best = null;
        let bestPrio = -Infinity;

        // 走り覚醒を優先確認
        for (const [dx, dy] of INNER_COORDS) {
          if (canUpgradeToRay(killerPiece, dx, dy, true)) {
            let prio = 60;
            if (dy < 0) prio += 25;
            else if (dy === 0) prio += 20;
            prio += Math.random() * 8;
            if (prio > bestPrio) {
              bestPrio = prio;
              best = { dx, dy, type: 'ray' };
            }
          }
        }

        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (!canUnlockCoord(killerPiece, dx, dy, true)) continue;
            let prio = 0;
            if (dy > 0) prio += 35; // 退路
            else if (dy === 0) prio += 25; // 横
            else prio += 15;
            prio += Math.random() * 8;
            if (prio > bestPrio) {
              bestPrio = prio;
              best = { dx, dy, type: 'step' };
            }
          }
        }
        if (best) {
          state.pendingEvo.push({ pieceId: killerPiece.id, dx: best.dx, dy: best.dy, type: best.type });
          remaining--;
        } else {
          break;
        }
      }
    }

    // 2. 残りポイントを味方駒に配分
    while (remaining > 0) {
      const allies = getAllAllyPieces(state.board, cpuOwner);
      let bestCandidate = null;
      let bestPriority = -Infinity;

      for (const { piece } of allies) {
        if (piece.type === 'ou') continue;

        // 走り覚醒の候補探索（優先度大！）
        for (const [dx, dy] of INNER_COORDS) {
          if (canUpgradeToRay(piece, dx, dy, true)) {
            let prio = 55;
            if (dy < 0) prio += 25; // 前ビーム
            else if (dy === 0) prio += 20; // 横ビーム
            prio += Math.random() * 8;
            if (prio > bestPriority) {
              bestPriority = prio;
              bestCandidate = { piece, dx, dy, type: 'ray' };
            }
          }
        }

        // 通常ステップ解放の候補探索
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (!canUnlockCoord(piece, dx, dy, true)) continue;
            let prio = 0;
            if (piece.type === 'hisha' || piece.type === 'kaku') prio += 65;
            else if (piece.type === 'gin' || piece.type === 'kin') prio += 40;
            prio += Math.random() * 8;
            if (prio > bestPriority) {
              bestPriority = prio;
              bestCandidate = { piece, dx, dy, type: 'step' };
            }
          }
        }
      }

      if (!bestCandidate) break;
      state.pendingEvo.push({
        pieceId: bestCandidate.piece.id,
        dx: bestCandidate.dx,
        dy: bestCandidate.dy,
        type: bestCandidate.type
      });
      remaining--;
    }
  } catch (err) {
    console.error('CPU instant evo error:', err);
  } finally {
    confirmEvolutionTurn();
  }
}

// ==========================================
// レンダリング (UI描画)
// ==========================================

function renderAll() {
  renderBoard();
  renderStatsAndStatus();
  renderEvolutionBox();
  renderInspector();
  saveGameToStorage();
}

function renderBoard() {
  elBoard.innerHTML = '';

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'board-cell';

      // 直前の移動ハイライト
      if (state.lastMove) {
        if (state.lastMove.fromR === r && state.lastMove.fromC === c) {
          cell.classList.add('last-move-from');
        }
        if (state.lastMove.toR === r && state.lastMove.toC === c) {
          cell.classList.add('last-move-to');
        }
      }

      // 天王山（５五）マスの特別装飾
      if (r === 4 && c === 4) {
        cell.classList.add('tennozan-cell');
        const centerP = state.board[4][4];
        if (centerP) {
          cell.classList.add(centerP.owner === 'sente' ? 'tennozan-sente' : 'tennozan-gote');
        }
      }

      // 選択中のセル
      if (state.selectedCell && state.selectedCell.r === r && state.selectedCell.c === c) {
        if (state.selectedCell.isEnemy) {
          cell.classList.add('enemy-selected-cell');
        } else {
          cell.classList.add('selected-cell');
        }
      }

      // 移動可能マスのハイライト
      const validMove = state.validMoves.find(m => m.r === r && m.c === c);
      if (validMove) {
        if (state.selectedCell && state.selectedCell.isEnemy) {
          // 相手駒の利き：赤色で表示（味方駒がターゲットになっている場合はさらに強調）
          cell.classList.add(validMove.isCapture ? 'enemy-target-capture' : 'enemy-valid-move');
        } else {
          // 自軍駒の移動先：緑色（敵駒がいる場合は赤枠）
          cell.classList.add(validMove.isCapture ? 'valid-capture' : 'valid-move');
        }
      }

      const piece = state.board[r][c];
      if (piece) {
        // 今回進化ポイントを仮割り振り中の駒はゴールド枠で強調
        const hasPendingOnThis = state.pendingEvo.some(p => p.pieceId === piece.id);
        if (hasPendingOnThis || (state.inspectedPiece && state.inspectedPiece.id === piece.id && state.pendingEvo.length > 0)) {
          cell.classList.add('has-pending-evo');
        }

        // 駒の周囲8方向のミニインジケーター（盤面上の実際の向きで表示）
        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'dir-dots';
        const sign = piece.owner === 'sente' ? 1 : -1;

        for (const [dx, dy] of INNER_COORDS) {
          const stepType = hasStepAt(piece, dx, dy, true);
          const isRay = hasRayInDir(piece, dx, dy, true);
          if (stepType || isRay) {
            const boardDx = dx * sign;
            const boardDy = dy * sign;
            const dot = document.createElement('span');
            dot.className = `dir-dot d-${boardDx}-${boardDy}`;
            if (isRay) dot.classList.add('ray');
            else if (stepType === 'evolved' || stepType === 'pending') dot.classList.add('evolved');
            else dot.classList.add('step');
            dotsContainer.appendChild(dot);
          }
        }
        cell.appendChild(dotsContainer);

        // 駒本体（漢字ではなく「持ちポイント数字」を大きく表示）
        const pieceEl = document.createElement('div');
        pieceEl.className = `piece ${piece.owner}`;
        if (piece.type === 'ou') pieceEl.classList.add('is-king');

        const totalPt = getPieceTotalPt(piece, true);
        const addedCount = totalPt - piece.basePt;
        const hasOuter = piece.evolvedSteps.some(([dx, dy]) => Math.max(Math.abs(dx), Math.abs(dy)) === 2) ||
          state.pendingEvo.some(p => p.pieceId === piece.id && Math.max(Math.abs(p.dx), Math.abs(p.dy)) === 2);

        if (hasOuter) {
          pieceEl.classList.add('is-tier2');
        } else if (addedCount > 0) {
          pieceEl.classList.add('is-evolved');
        }

        // 王には王冠マーク
        if (piece.type === 'ou') {
          const crownEl = document.createElement('span');
          crownEl.className = 'piece-crown';
          crownEl.textContent = '👑';
          pieceEl.appendChild(crownEl);
        }

        // 中央の持ちポイント数字
        const ptNumEl = document.createElement('span');
        ptNumEl.className = 'piece-pt-num';
        ptNumEl.textContent = totalPt;
        pieceEl.appendChild(ptNumEl);

        // 走り駒や桂馬の識別サブタグ
        if (piece.subTag && piece.type !== 'ou') {
          const subEl = document.createElement('span');
          subEl.className = 'piece-sub-tag';
          subEl.textContent = piece.subTag;
          pieceEl.appendChild(subEl);
        }

        cell.appendChild(pieceEl);
      }

      cell.addEventListener('click', () => onCellClick(r, c));
      elBoard.appendChild(cell);
    }
  }
}

function renderStatsAndStatus() {
  for (const owner of ['sente', 'gote']) {
    const pieces = getAllAllyPieces(state.board, owner);
    let totalPt = 0;
    let maxPiece = null;
    let maxPt = -1;

    for (const { piece } of pieces) {
      const pt = getPieceTotalPt(piece, true);
      totalPt += pt;
      if (pt > maxPt) {
        maxPt = pt;
        maxPiece = piece;
      }
    }

    const bankVal = owner === state.turn
      ? state.bank[owner] - state.pendingEvo.length
      : state.bank[owner];

    document.getElementById(`${owner}-bank-pt`).textContent = bankVal;
    document.getElementById(`${owner}-piece-count`).textContent = `${pieces.length} 枚`;
    document.getElementById(`${owner}-total-pt`).textContent = `${totalPt} pt`;
    document.getElementById(`${owner}-max-piece`).textContent =
      maxPiece ? getPieceDisplayLabel(maxPiece, true) : '-';
  }

  elCardSente.classList.toggle('active-turn', state.turn === 'sente');
  elCardGote.classList.toggle('active-turn', state.turn === 'gote');

  const turnLabel = state.turn === 'sente' ? '☗ 先手' : '☖ 後手';
  const movesText = state.movesCount > 0 ? ` (${state.movesCount}手目)` : '';

  elStatusBanner.classList.toggle('sudden-death-mode', state.isSuddenDeath && state.phase !== 'gameover');

  if (state.phase === 'gameover') {
    elStatusBanner.classList.remove('evo-mode', 'sudden-death-mode');
    elTurnIndicator.textContent = '対局終了';
    elSubStatus.textContent = '「新規対局」で最初から遊べます';
  } else if (state.phase === 'instant_evo') {
    elStatusBanner.classList.add('evo-mode');
    elTurnIndicator.textContent = `⚡ 撃破ボーナス！ ${turnLabel}の即時進化${movesText}`;
    elSubStatus.textContent = '倒した駒や味方駒の移動マスを解放し、「進化を確定」で相手番へ進みます（手番消費なし！）';
  } else if (state.pendingEvo.length > 0) {
    elStatusBanner.classList.add('evo-mode');
    elTurnIndicator.textContent = `⚡ ${turnLabel}：進化ポイントを割り振り中${movesText}`;
    elSubStatus.textContent = `「進化を確定してターン終了」を押すと手番を終了します（振り直しで移動に戻れます）`;
  } else {
    const inCheck = isKingInCheck(state.board, state.turn);
    if (inCheck) {
      elStatusBanner.classList.add('evo-mode');
      elTurnIndicator.textContent = `⚠️ ${turnLabel}の番です（王手！）${movesText}`;
      elSubStatus.textContent = '王手をかけられています！玉を逃がすか、防いでください！';
    } else if (state.isSuddenDeath) {
      elTurnIndicator.textContent = `🔥【サドンデス】${turnLabel}の番${movesText}`;
      if (isCPUTurn()) {
        elSubStatus.textContent = `CPU思考中...（残り ${120 - state.movesCount}手で総ポイント判定）`;
      } else {
        elSubStatus.textContent = `過熱エネルギー毎ターン+1pt供給！ 残り ${120 - state.movesCount}手で総ポイント判定決着！`;
      }
    } else {
      elStatusBanner.classList.remove('evo-mode');
      elTurnIndicator.textContent = `${turnLabel}の番です${movesText}`;
      if (isCPUTurn()) {
        elSubStatus.textContent = 'CPUが思考中...';
      } else if (state.bank[state.turn] > 0) {
        elSubStatus.textContent = `【駒を動かす】か【所持 ${state.bank[state.turn]}pt で駒を進化】のどちらかを選べます`;
      } else {
        elSubStatus.textContent = '動かす駒を選択してください（敵を取ると進化ポイント獲得）';
      }
    }
  }
}

function renderEvolutionBox() {
  const remaining = getRemainingBankPt();
  const spending = state.pendingEvo.length;
  const totalBank = state.bank[state.turn];

  elEvoRemaining.textContent = remaining;
  elEvoSpending.textContent = spending;

  elEvoBox.classList.toggle('has-points', totalBank > 0 && !isCPUTurn());
  elEvoBox.classList.toggle('is-allocating', spending > 0 && !isCPUTurn());

  if (state.phase === 'instant_evo') {
    elEvoMsg.textContent = `撃破したポイントを即時配分中！確定するとそのまま相手番へ進みます（手番消費なし）`;
    elBtnEvoConfirm.disabled = isCPUTurn() || state.phase === 'gameover';
    elBtnEvoReset.disabled = spending === 0 || isCPUTurn() || state.phase === 'gameover';
  } else if (spending > 0) {
    elEvoMsg.textContent = `${spending}pt 割り振り中（確定すると1手消費してターン終了）`;
    elBtnEvoConfirm.disabled = spending === 0 || isCPUTurn() || state.phase === 'gameover';
    elBtnEvoReset.disabled = spending === 0 || isCPUTurn() || state.phase === 'gameover';
  } else if (totalBank > 0) {
    elEvoMsg.textContent = `所持 ${totalBank}pt 使用可能！味方駒を選び下の「＋」で手番を使って進化できます`;
    elBtnEvoConfirm.disabled = true;
    elBtnEvoReset.disabled = true;
  } else {
    elEvoMsg.textContent = '敵駒を撃破すると即時進化が発動し、ポイントが貯まります';
    elBtnEvoConfirm.disabled = true;
    elBtnEvoReset.disabled = true;
  }
}

function renderInspector() {
  const piece = state.inspectedPiece;
  elMoveMatrix.innerHTML = '';
  const elDirHint = document.getElementById('matrix-direction-hint');
  const elDirHintBottom = document.getElementById('matrix-direction-hint-bottom');

  if (!piece) {
    elInspKanji.textContent = '？';
    elInspKanji.classList.remove('gote');
    elInspName.textContent = '駒を選択してください';
    elInspPoints.textContent = '持ちポイント: - pt';
    elInspTier.textContent = '状態: -';
    elInspOwnerBadge.classList.add('hidden');
    if (elDirHint) {
      elDirHint.textContent = '▲ 進行方向 ▲';
      elDirHint.classList.remove('gote-dir');
    }
    if (elDirHintBottom) {
      elDirHintBottom.classList.add('hidden');
    }
    return;
  }

  const totalPt = getPieceTotalPt(piece, true);
  const addedPt = totalPt - piece.basePt;
  const innerComplete = isInnerRingComplete(piece, true);

  const isGote = piece.owner === 'gote';
  const isOpponent = piece.owner !== state.turn;

  elInspKanji.textContent = getPieceDisplayLabel(piece, true);
  elInspKanji.classList.toggle('gote', isGote);
  elInspName.textContent = `元駒: ${piece.name}（初期 ${piece.basePt}pt）`;
  elInspPoints.textContent = `現在の持ちポイント: ${totalPt} pt ${addedPt > 0 ? `(進化 +${addedPt}pt)` : ''}`;
  if (piece.type === 'ou') {
    elInspTier.textContent = '👑 神聖な王将（進化不可・全周囲8方向固定）';
  } else if (isOpponent) {
    elInspTier.textContent = '👁️ 相手駒（盤面の攻撃向きに合わせて上下反転表示中）';
  } else {
    elInspTier.textContent = '🌟 5×5全24マス（周囲2マス・桂馬ジャンプ等）を自由に1ptで解放可能！';
  }

  elInspOwnerBadge.classList.remove('hidden', 'sente-badge', 'gote-badge');
  elInspOwnerBadge.classList.add(piece.owner === 'sente' ? 'sente-badge' : 'gote-badge');
  elInspOwnerBadge.textContent = piece.owner === 'sente' ? '☗ 先手' : '☖ 後手';

  // 進行方向ヒントの向きを更新（相手駒・後手なら手前向き▼、先手なら奥向き▲）
  if (elDirHint) {
    if (isGote) {
      elDirHint.textContent = '▼ 進行方向（手前・自陣向き）▼';
      elDirHint.classList.add('gote-dir');
    } else {
      elDirHint.textContent = '▲ 進行方向（奥・敵陣向き）▲';
      elDirHint.classList.remove('gote-dir');
    }
  }
  if (elDirHintBottom) {
    if (isGote) {
      elDirHintBottom.textContent = '▼ 進行方向 ▼';
      elDirHintBottom.classList.remove('hidden');
    } else {
      elDirHintBottom.classList.add('hidden');
    }
  }

  const isEditable =
    (state.phase === 'play' || state.phase === 'instant_evo') &&
    piece.owner === state.turn &&
    !isCPUTurn();

  const remainingPt = getRemainingBankPt();

  // 5x5 マトリックス描画 (dy: -2..2, dx: -2..2)
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const mCell = document.createElement('div');
      mCell.className = 'matrix-cell';

      const ring = Math.max(Math.abs(dx), Math.abs(dy));
      if (ring === 1) mCell.classList.add('inner-ring');

      if (dx === 0 && dy === 0) {
        mCell.classList.add('center-self');
        if (isGote) {
          mCell.classList.add('gote');
        }
        mCell.textContent = getPieceDisplayLabel(piece, true);
      } else {
        // 相手駒（後手）の場合は盤面の実際の攻撃向きに合わせて上下・左右を反転表示
        const checkDx = isGote ? -dx : dx;
        const checkDy = isGote ? -dy : dy;

        const dirX = Math.sign(checkDx);
        const dirY = Math.sign(checkDy);
        const isStraight = (dirX === 0 || dirY === 0 || Math.abs(dirX) === Math.abs(dirY));
        const is2ndStep = isStraight && (checkDx === dirX * 2 && checkDy === dirY * 2);

        const stepType = hasStepAt(piece, checkDx, checkDy, true);
        const isRay = hasRayInDir(piece, checkDx, checkDy, true);
        const isPendingRay = state.pendingEvo.some(p => p.pieceId === piece.id && p.type === 'ray' &&
          p.dx === dirX && p.dy === dirY);
        const unlockable = isEditable && remainingPt > 0 && canUnlockCoord(piece, checkDx, checkDy, true);
        const rayUpgradable = isEditable && remainingPt > 0 && is2ndStep && canUpgradeToRay(piece, dirX, dirY, true);

        if (isPendingRay && is2ndStep) {
          mCell.classList.add('pending-unlock');
          mCell.innerHTML = '<span>∞覚醒</span><small style="font-size:0.55rem">取消可</small>';
          mCell.title = '走り(直進無限)への進化中！クリックで取消';
        } else if (isPendingRay && ring === 1) {
          mCell.classList.add('pending-unlock');
          mCell.innerHTML = '<span>∞</span>';
          mCell.title = '走り覚醒中';
        } else if (stepType === 'pending') {
          mCell.classList.add('pending-unlock');
          mCell.innerHTML = '<span>★+1</span><small style="font-size:0.55rem">取消可</small>';
          mCell.title = 'クリックで割り振りを取り消します';
        } else if (isRay) {
          mCell.classList.add('has-ray');
          mCell.textContent = '∞';
        } else if (rayUpgradable) {
          // 2マス開放済みの外周マス：クリックで走りに昇格可能！
          mCell.classList.add('can-unlock', 'can-ray-upgrade');
          mCell.innerHTML = '<span>★/＋∞</span>';
          mCell.title = '2マス開放完了！1pt消費してこの方向を「走り(直進無限)」に覚醒！';
        } else if (stepType === 'evolved') {
          mCell.classList.add('has-evolved');
          mCell.textContent = '★';
        } else if (stepType === 'initial') {
          mCell.classList.add('has-step');
          mCell.textContent = '●';
        } else if (unlockable) {
          mCell.classList.add('can-unlock');
          mCell.textContent = '＋';
          mCell.title = '1pt消費してこのマスへの移動を解放！';
        }

        mCell.addEventListener('click', () => onMatrixCellClick(checkDx, checkDy));
      }

      elMoveMatrix.appendChild(mCell);
    }
  }
}

function addLog(text, extraClass = '') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${extraClass}`;
  entry.textContent = text;
  if (elBattleLog) elBattleLog.prepend(entry);

  const ticker = document.getElementById('latest-log-text');
  if (ticker) {
    ticker.textContent = text;
  }

  if (!state.recentLogs) state.recentLogs = [];
  state.recentLogs.unshift({ text, extraClass });
  if (state.recentLogs.length > 30) state.recentLogs.pop();
}

// イベントリスナー登録
document.getElementById('btn-restart').addEventListener('click', restartNewGame);
document.getElementById('btn-undo').addEventListener('click', undoMove);

const elGameMode = document.getElementById('game-mode');
if (elGameMode) elGameMode.addEventListener('change', restartNewGame);

const elPlayerSide = document.getElementById('player-side');
if (elPlayerSide) elPlayerSide.addEventListener('change', restartNewGame);

elBtnEvoReset.addEventListener('click', resetEvolutionPending);
elBtnEvoConfirm.addEventListener('click', confirmEvolutionTurn);

// モーダル制御
const rulesModal = document.getElementById('rules-modal');
document.getElementById('btn-rules').addEventListener('click', () => rulesModal.classList.remove('hidden'));
document.getElementById('btn-close-rules').addEventListener('click', () => rulesModal.classList.add('hidden'));

const settingsModal = document.getElementById('settings-modal');
if (settingsModal) {
  document.getElementById('btn-settings').addEventListener('click', () => settingsModal.classList.remove('hidden'));
  document.getElementById('btn-close-settings').addEventListener('click', () => settingsModal.classList.add('hidden'));
  document.getElementById('btn-apply-settings').addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    restartNewGame();
  });
}

const logModal = document.getElementById('log-modal');
if (logModal) {
  const btnLog = document.getElementById('btn-view-log');
  if (btnLog) btnLog.addEventListener('click', () => logModal.classList.remove('hidden'));
  const btnCloseLog = document.getElementById('btn-close-log');
  if (btnCloseLog) btnCloseLog.addEventListener('click', () => logModal.classList.add('hidden'));
}

const gameoverModal = document.getElementById('gameover-modal');
document.getElementById('btn-gameover-close').addEventListener('click', () => gameoverModal.classList.add('hidden'));
document.getElementById('btn-gameover-restart').addEventListener('click', () => {
  gameoverModal.classList.add('hidden');
  restartNewGame();
});

const btnShare = document.getElementById('btn-gameover-share');
if (btnShare) {
  btnShare.addEventListener('click', () => {
    const isWin = state.winner === state.playerSide;
    const sentePt = getAllAllyPieces(state.board, 'sente').reduce((sum, { piece }) => sum + getPieceTotalPt(piece), 0);
    const gotePt = getAllAllyPieces(state.board, 'gote').reduce((sum, { piece }) => sum + getPieceTotalPt(piece), 0);
    const resultText = isWin ? '勝利しました！🎉' : '対局終了！';
    const tweetText = `『無法将棋』で${resultText}（${state.movesCount}手 / 軍勢: 先手${sentePt}pt vs 後手${gotePt}pt）\n駒を自由に変異・進化させて戦う新感覚Web将棋！\n#無法将棋 #将棋`;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent('https://pop-ghost.com/')}`;
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  });
}

const btnCloseEnemyEvo = document.getElementById('btn-close-enemy-evo');
if (btnCloseEnemyEvo) {
  btnCloseEnemyEvo.addEventListener('click', hideEnemyEvolutionNotification);
}

// 初回起動：保存データがあれば復元、なければ新規開始
if (!loadGameFromStorage()) {
  initGame();
}
