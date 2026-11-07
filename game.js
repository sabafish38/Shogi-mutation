(function() {
  'use strict';

const BOARD_SIZE = 9;

/**
 * 無法将棋 - SHOGI: MUTATION
 * メインゲームロジック & CPU思考エンジン
 * ・駒の表面表記＝現在の持ちポイント（数字）
 * ・獲得ポイントは所持バンクに貯金可能
 * ・手番では「駒を動かす」か「所持ポイントを使って駒を進化させる」のどちらかを選択
 */


// ==========================================
// Googleアナリティクス イベント追跡ヘルパー
// ==========================================
function trackAnalyticsEvent(eventName, params = {}) {
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, params);
    }
  } catch (e) {
    // 追跡失敗時もゲーム動作には一切影響を与えない安全設計
  }
}

// ==========================================
// Web Audio API プロシージャル効果音エンジン
// ==========================================
const SoundSystem = (() => {
  let audioCtx = null;
  let isSoundEnabled = true;

  try {
    const saved = localStorage.getItem('muhou_shogi_sound_enabled');
    if (saved !== null) {
      isSoundEnabled = (saved === 'true');
    }
  } catch (e) {}

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, type, duration, gainStart, gainEnd = 0.001) {
    if (!isSoundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(gainStart, now);
      gain.gain.exponentialRampToValueAtTime(gainEnd, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {}
  }

  return {
    isEnabled() { return isSoundEnabled; },
    toggle() {
      isSoundEnabled = !isSoundEnabled;
      try {
        localStorage.setItem('muhou_shogi_sound_enabled', isSoundEnabled ? 'true' : 'false');
      } catch (e) {}
      return isSoundEnabled;
    },
    // 駒の着手音（心地よい「パチッ」という木片打音）
    playMove() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.06);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.06);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(850, now);
        osc2.frequency.exponentialRampToValueAtTime(300, now + 0.03);
        gain2.gain.setValueAtTime(0.25, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now);
        osc2.stop(now + 0.03);
      } catch (e) {}
    },
    // 駒の捕獲・撃破音（重みのある衝撃音）
    playCapture() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.12);
        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(1200, now);
        osc2.frequency.exponentialRampToValueAtTime(350, now + 0.05);
        gain2.gain.setValueAtTime(0.18, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now);
        osc2.stop(now + 0.05);
      } catch (e) {}
    },
    // 進化割り振り・確定音（クリスタル調の上昇チャイム）
    playEvolve() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const freqs = [523.25, 659.25, 783.99, 1046.5];
        freqs.forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = now + idx * 0.045;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, t);
          gain.gain.setValueAtTime(0.2, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.14);
        });
      } catch (e) {}
    },
    // 進化キャンセル音
    playCancel() {
      playTone(260, 'sine', 0.06, 0.15, 0.001);
    },
    // 王手アラート音（緊張感のある警告チャイム）
    playCheck() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        [740, 880].forEach(f => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, now);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.35);
        });
      } catch (e) {}
    },
    // 天王山占拠・サドンデス音（重低音）
    playTennozan() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.4);
        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
      } catch (e) {}
    },
    // 勝利ファンファーレ
    playVictory() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((f, idx) => {
          const t = now + idx * 0.08;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, t);
          gain.gain.setValueAtTime(0.25, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.4);
        });
      } catch (e) {}
    },
    // 敗北チャイム
    playDefeat() {
      if (!isSoundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const notes = [392.00, 311.13, 261.63];
        notes.forEach((f, idx) => {
          const t = now + idx * 0.12;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, t);
          gain.gain.setValueAtTime(0.2, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.35);
        });
      } catch (e) {}
    }
  };
})();

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
    subTag: '前∞',
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
  validMoves: [],
  guardSquares: [],          // [{ r, c, isCapture }]
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

// オフライン2人対戦（対面）専用：後手用トップドック
const elEvoBoxTop = document.getElementById('evolution-box-top');
const elEvoRemainingTop = document.getElementById('evo-remaining-pt-top');
const elEvoSpendingTop = document.getElementById('evo-spending-pt-top');
const elEvoMsgTop = document.getElementById('evo-capture-msg-top');
const elBtnEvoResetTop = document.getElementById('btn-evo-reset-top');
const elBtnEvoConfirmTop = document.getElementById('btn-evo-confirm-top');
const elMoveMatrixTop = document.getElementById('move-matrix-top');
const elInspKanjiTop = document.getElementById('insp-kanji-top');
const elInspNameTop = document.getElementById('insp-name-top');
const elInspPointsTop = document.getElementById('insp-points-top');
const elInspTierTop = document.getElementById('insp-tier-top');
const elInspOwnerBadgeTop = document.getElementById('inspector-owner-badge-top');
const elDirHintTop = document.getElementById('matrix-direction-hint-top');
const elDirHintBottomTop = document.getElementById('matrix-direction-hint-bottom-top');
const elCheckBanner = document.getElementById('check-banner');
const elCheckBannerTarget = document.getElementById('check-banner-target');
const elSuddenDeathBanner = document.getElementById('sudden-death-banner');

let checkBannerTimer = null;
let suddenDeathBannerTimer = null;

// 王手バナー（画面全体・一時的演出）を表示
function showCheckBanner(targetOwner) {
  if (!elCheckBanner) return;
  const targetLabel = targetOwner === 'sente' ? '先手玉に王手！' : '後手玉に王手！';
  if (elCheckBannerTarget) {
    elCheckBannerTarget.textContent = `${targetLabel} (CHECK!)`;
  }

  SoundSystem.playCheck();
  const boardEl = document.getElementById('board-container');
  if (boardEl) {
    boardEl.classList.remove('screen-shake');
    void boardEl.offsetWidth;
    boardEl.classList.add('screen-shake');
    setTimeout(() => boardEl.classList.remove('screen-shake'), 400);
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
  SoundSystem.playTennozan();
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
// ユーザープロファイル・レーティング・称号・シーズン管理
// ==========================================
const USER_PROFILE_KEY = 'muhou_shogi_user_profile_v1';

const TITLE_DEFS = [
  { id: 'novice', name: '新進気鋭の駒遣い', desc: '初期所持', cond: () => true },
  { id: 'streak_3', name: '連勝の火付け役', desc: '3連勝を達成する', cond: p => p.maxStreak >= 3 },
  { id: 'streak_5', name: '電光石火の常勝', desc: '5連勝を達成する', cond: p => p.maxStreak >= 5 },
  { id: 'rate_1300', name: '2級の猛者', desc: 'レート1300到達', cond: p => p.rating >= 1300 },
  { id: 'rate_1500', name: '初段の風格', desc: 'レート1500到達', cond: p => p.rating >= 1500 },
  { id: 'rate_1800', name: '三段の覚醒', desc: 'レート1800到達', cond: p => p.rating >= 1800 },
  { id: 'rate_2100', name: '無法竜王', desc: 'レート2100到達', cond: p => p.rating >= 2100 },
  { id: 'wins_10', name: '歴戦の変異師', desc: '通算10勝達成', cond: p => p.wins >= 10 },
  { id: 'bounty_hunter', name: '賞金首ハンター', desc: '賞金首を1回以上討伐', cond: p => (p.bountiesClaimed || 0) >= 1 }
];

// ==========================================
// ユーザーネーム管理 ＆ 過激ワード (NGワード) フィルター
// ==========================================
const NG_WORDS = [
  // 脅迫・暴力・死
  '死ね', 'しね', 'シネ', '氏ね', '殺す', 'ころす', 'コロス', '殺害', '自殺', '首吊り', 'ぶっ殺す', 'くたばれ', '消えろ', '刺す',
  // 差別・中傷
  'ガイジ', 'がいじ', '障害者', 'キチガイ', 'きちがい', '気違い', '白痴', '池沼', '部落',
  // 罵倒
  'カス', 'かす', 'ゴミ', 'ごみ', 'クソ', 'くそ', '糞', '馬鹿', 'バカ', 'ばか', '阿呆', 'アホ', 'あほ', '低能',
  // 性的・ハラスメント
  'ちんぽ', 'チンポ', 'ちんこ', 'チンコ', 'ペニス', 'まんこ', 'マンコ', 'おまんこ', 'オマンコ', 'ヴァギナ',
  'セックス', 'せっくす', '性交', 'オナニー', 'おなにー', '射精', '精液', '巨乳', 'パイパン',
  'レイプ', 'れいぷ', '強姦', '輪姦', '痴漢', '乱交', '露出狂',
  // 英語スラング・暴言・ヘイト
  'fuck', 'fck', 'fuk', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'cock', 'asshole', 'bastard',
  'motherfucker', 'retard', 'nigger', 'nigga', 'whore', 'slut', 'kill', 'die', 'suicide',
  'sex', 'porn', 'hentai', 'rape', 'hitler', 'nazi'
];

function validateUserName(rawName) {
  if (!rawName) {
    return { valid: false, error: 'ユーザーネームを入力してください' };
  }
  const trimmed = rawName.trim();
  if (trimmed.length < 1 || trimmed.length > 10) {
    return { valid: false, error: '1文字以上10文字以内で入力してください' };
  }

  // Unicode NFKC正規化（全角英数記号を半角へ、濁点合字の統一など）
  const normalized = trimmed.normalize('NFKC').toLowerCase();
  // 記号や空白を除去した連続テキスト（例: 死_ね、f.u.c.k などの回避を検出）
  const stripped = normalized.replace(/[\s_\-\.\*\/\\\+~!?#&@~〜・、。]/g, '');

  for (const ng of NG_WORDS) {
    const ngNorm = ng.normalize('NFKC').toLowerCase();
    if (stripped.includes(ngNorm) || normalized.includes(ngNorm)) {
      return { valid: false, error: '不適切な表現が含まれているため設定できません' };
    }
  }

  return { valid: true, name: trimmed };
}

let userProfile = {
  name: '名無し棋士',
  rating: 1200,
  wins: 0,
  losses: 0,
  streak: 0,
  maxStreak: 0,
  equippedTitle: '新進気鋭の駒遣い',
  bountiesClaimed: 0
};

// ==========================================
// 【防御レベル2】プロフィール改変検知・ソルト付きハッシュ署名
// ==========================================
const PROFILE_SALT = 'MUHOU_2026_ANTI_TAMPER_!k8x#q';

function computeProfileChecksum(data) {
  const payload = [
    data.name || '',
    data.rating != null ? data.rating : 1200,
    data.wins != null ? data.wins : 0,
    data.losses != null ? data.losses : 0,
    data.streak != null ? data.streak : 0,
    data.maxStreak != null ? data.maxStreak : 0,
    data.equippedTitle || '',
    data.bountiesClaimed != null ? data.bountiesClaimed : 0,
    PROFILE_SALT
  ].join(':');

  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function loadUserProfile() {
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const expectedSig = computeProfileChecksum(data);
      // 過去バージョン（署名なし）の正規データ移行用緩和判定
      const isLegacyValid = !data._sig && (data.rating >= 800 && data.rating <= 1500) && (data.wins >= 0 && data.wins <= 10);
      const isSigValid = (data._sig === expectedSig);

      if (isSigValid || isLegacyValid) {
        userProfile = {
          name: (typeof data.name === 'string' && data.name.trim()) ? data.name.trim().slice(0, 10) : '名無し棋士',
          rating: typeof data.rating === 'number' ? Math.max(800, Math.min(3000, data.rating)) : 1200,
          wins: typeof data.wins === 'number' ? Math.max(0, data.wins) : 0,
          losses: typeof data.losses === 'number' ? Math.max(0, data.losses) : 0,
          streak: typeof data.streak === 'number' ? Math.max(0, data.streak) : 0,
          maxStreak: typeof data.maxStreak === 'number' ? Math.max(0, data.maxStreak) : 0,
          equippedTitle: data.equippedTitle || '新進気鋭の駒遣い',
          bountiesClaimed: typeof data.bountiesClaimed === 'number' ? Math.max(0, data.bountiesClaimed) : 0
        };
        saveUserProfile();
      } else {
        console.warn('Tamper detected in user profile! Resetting to safe defaults.');
        userProfile = {
          name: '名無し棋士',
          rating: 1200,
          wins: 0,
          losses: 0,
          streak: 0,
          maxStreak: 0,
          equippedTitle: '新進気鋭の駒遣い',
          bountiesClaimed: 0
        };
        saveUserProfile();
      }
    }
  } catch (e) {
    console.warn('Failed to load user profile:', e);
  }
}

function saveUserProfile() {
  try {
    const toSave = {
      ...userProfile,
      _sig: computeProfileChecksum(userProfile)
    };
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn('Failed to save user profile:', e);
  }
}

function getRankInfo(rating) {
  if (rating < 1000) return { title: '6級', progress: Math.max(0, (rating - 800) / 200) };
  if (rating < 1100) return { title: '5級', progress: (rating - 1000) / 100 };
  if (rating < 1200) return { title: '4級', progress: (rating - 1100) / 100 };
  if (rating < 1300) return { title: '3級', progress: (rating - 1200) / 100 };
  if (rating < 1400) return { title: '2級', progress: (rating - 1300) / 100 };
  if (rating < 1500) return { title: '1級', progress: (rating - 1400) / 100 };
  if (rating < 1650) return { title: '初段', progress: (rating - 1500) / 150 };
  if (rating < 1800) return { title: '二段', progress: (rating - 1650) / 150 };
  if (rating < 1950) return { title: '三段', progress: (rating - 1800) / 150 };
  if (rating < 2100) return { title: '四段', progress: (rating - 1950) / 150 };
  if (rating < 2300) return { title: '竜王', progress: (rating - 2100) / 200 };
  return { title: '名人', progress: 1 };
}

// 週間シーズン情報の算出
function getSeasonInfo() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const pastDaysOfYear = (now - startOfYear) / 86400000;
  const weekNum = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
  
  // 今週の日曜23:59:59までの残り日数
  const dayOfWeek = now.getDay(); // 0: 日曜, 1: 月曜...
  const daysLeft = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const hoursLeft = 24 - now.getHours();

  return {
    year: now.getFullYear(),
    seasonNumber: weekNum,
    daysLeftText: daysLeft > 0 ? `残り ${daysLeft}日` : `残り ${hoursLeft}時間 (本日集計!)`
  };
}

function renderUserProfile() {
  const rankInfo = getRankInfo(userProfile.rating);
  const elTitle = document.getElementById('player-rank-title');
  const elTitleBadge = document.getElementById('player-title-badge');
  const elRating = document.getElementById('player-rating-val');
  const elProgress = document.getElementById('player-rank-progress');
  const elWins = document.getElementById('player-wins');
  const elLosses = document.getElementById('player-losses');
  const elWinrate = document.getElementById('player-winrate');
  const elStreak = document.getElementById('player-streak');
  const elMaxStreak = document.getElementById('player-max-streak');

  const elPlayerDisplayName = document.getElementById('player-display-name');
  if (elPlayerDisplayName) elPlayerDisplayName.textContent = userProfile.name || '名無し棋士';
  if (elTitle) elTitle.textContent = rankInfo.title;
  if (elTitleBadge) elTitleBadge.textContent = userProfile.equippedTitle;
  if (elRating) elRating.textContent = userProfile.rating;
  if (elProgress) elProgress.style.width = `${Math.min(100, Math.max(0, rankInfo.progress * 100))}%`;
  if (elWins) elWins.textContent = userProfile.wins;
  if (elLosses) elLosses.textContent = userProfile.losses;

  const total = userProfile.wins + userProfile.losses;
  const rate = total > 0 ? Math.round((userProfile.wins / total) * 100) : 0;
  if (elWinrate) elWinrate.textContent = `${rate}%`;
  if (elStreak) elStreak.textContent = `${userProfile.streak}`;
  if (elMaxStreak) elMaxStreak.textContent = userProfile.maxStreak;

  renderSeasonAndRanking();
}

// ==========================================
// 週間シーズン＆全国ランキングボード
// ==========================================
let currentRankingTab = 'top'; // 'top' | 'near' | 'rivals'
const RIVALS_STORAGE_KEY = 'muhou_shogi_rivals_v1';

// 全国TOP棋士データ（殿堂1〜15位）
const NATIONWIDE_TOP_PLAYERS = [
  { pos: 1, name: '無法名人・零式', title: '無法竜王', rank: '名人', rating: 2420, medal: 'gold', medalLabel: '1位', isBounty: true },
  { pos: 2, name: '天王山マスター', title: '天王山の覇者', rank: '竜王', rating: 2280, medal: 'silver', medalLabel: '2位' },
  { pos: 3, name: '覚醒桂馬キング', title: '電光石火の常勝', rank: '四段', rating: 2050, medal: 'bronze', medalLabel: '3位' },
  { pos: 4, name: '鉄壁の防壁将軍', title: '堅陣の守護神', rank: '四段', rating: 2010 },
  { pos: 5, name: '神速歩兵隊長', title: '先駆けの一撃', rank: '三段', rating: 1985 },
  { pos: 6, name: '変異銀将の使徒', title: '変異調律士', rank: '三段', rating: 1940, isBounty: true },
  { pos: 7, name: '飛翔の角行マスター', title: '斜線の支配者', rank: '二段', rating: 1915 },
  { pos: 8, name: '盤上の奇術師', title: '変幻自在の指し手', rank: '二段', rating: 1880 },
  { pos: 9, name: '堅牢金将・不動', title: '金城鉄壁', rank: '初段', rating: 1850 },
  { pos: 10, name: '機動歩兵の達人', title: '新進気鋭の駒遣い', rank: '初段', rating: 1820 },
  { pos: 11, name: '疾風怒濤の香車', title: '猪突猛進の覇気', rank: '初段', rating: 1790 },
  { pos: 12, name: '覚醒飛車ストライカー', title: '盤上の大砲', rank: '1級', rating: 1765 },
  { pos: 13, name: '深淵の読み手', title: '終盤の魔術師', rank: '1級', rating: 1740 },
  { pos: 14, name: '変異狂騒曲', title: '混沌の設計者', rank: '2級', rating: 1710 },
  { pos: 15, name: '盤上の黒豹', title: '奇襲のスペシャリスト', rank: '2級', rating: 1680 }
];

function loadRivalPlayers() {
  try {
    const raw = localStorage.getItem(RIVALS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveRivalPlayers(list) {
  try {
    localStorage.setItem(RIVALS_STORAGE_KEY, JSON.stringify(list.slice(0, 30)));
  } catch (e) {
    console.error('Failed to save rival players', e);
  }
}

function recordRivalPlayer(name, rating, rankTitle, isWin, extra = {}) {
  const rivals = loadRivalPlayers();
  const dateStr = new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const entry = {
    id: `rival_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: name,
    rating: rating,
    rankTitle: rankTitle,
    isWin: !!isWin,
    isBounty: !!extra.isBounty,
    date: dateStr,
    timestamp: Date.now()
  };
  rivals.unshift(entry);
  saveRivalPlayers(rivals);
}

// 週間シーズン＆全国ランキングボード描画
function renderSeasonAndRanking() {
  const sInfo = getSeasonInfo();
  const elSeasonBadge = document.getElementById('season-badge');
  const elSeasonTimer = document.getElementById('season-timer');
  if (elSeasonBadge) elSeasonBadge.textContent = `${sInfo.year} 第${sInfo.seasonNumber}期 週間シーズン`;
  if (elSeasonTimer) elSeasonTimer.textContent = sInfo.daysLeftText;

  // プレイヤーのレートから仮想順位を算出（レートが高いほど上位）
  // 名人(2300+): 1〜5位, 初段(1500): 40〜60位, 3級(1200): 120〜150位
  const basePos = Math.max(1, Math.round(1800 - (userProfile.rating - 900) * 1.25));
  const elPlayerPos = document.getElementById('player-rank-pos-text');
  if (elPlayerPos) elPlayerPos.textContent = `現在 ${basePos}位 (上位${Math.max(1, Math.round(basePos / 20))}%)`;

  // タブボタンのアクティブ更新
  const tabTop = document.getElementById('tab-ranking-top');
  const tabNear = document.getElementById('tab-ranking-near');
  const tabRivals = document.getElementById('tab-ranking-rivals');
  if (tabTop) {
    tabTop.classList.toggle('active', currentRankingTab === 'top');
    tabTop.setAttribute('aria-selected', currentRankingTab === 'top' ? 'true' : 'false');
  }
  if (tabNear) {
    tabNear.classList.toggle('active', currentRankingTab === 'near');
    tabNear.setAttribute('aria-selected', currentRankingTab === 'near' ? 'true' : 'false');
  }
  if (tabRivals) {
    tabRivals.classList.toggle('active', currentRankingTab === 'rivals');
    tabRivals.setAttribute('aria-selected', currentRankingTab === 'rivals' ? 'true' : 'false');
  }

  const rankingListEl = document.getElementById('ranking-list');
  if (!rankingListEl) return;
  rankingListEl.innerHTML = '';

  const pRank = getRankInfo(userProfile.rating).title;

  if (currentRankingTab === 'top') {
    // 全国TOP表示（1〜15位 ＋ 圏外なら区切り線＆プレイヤー現在位置）
    const list = [...NATIONWIDE_TOP_PLAYERS];
    let playerIncluded = false;

    // もしプレイヤーが15位以内なら差し替え/挿入
    const displayList = [];
    list.forEach(p => {
      if (!playerIncluded && basePos === p.pos) {
        displayList.push({
          pos: basePos,
          name: `${userProfile.name} (あなた)`,
          title: userProfile.equippedTitle,
          rank: pRank,
          rating: userProfile.rating,
          isPlayer: true
        });
        playerIncluded = true;
      } else {
        displayList.push({ ...p, isPlayer: false });
      }
    });

    displayList.forEach(row => {
      rankingListEl.appendChild(createRankingRowElement(row));
    });

    // プレイヤーが15位より下の場合は区切り線とプレイヤー位置を表示
    if (!playerIncluded && basePos > 15) {
      const divider = document.createElement('div');
      divider.className = 'ranking-divider';
      divider.textContent = '······';
      rankingListEl.appendChild(divider);

      const playerRow = {
        pos: basePos,
        name: `${userProfile.name} (あなた)`,
        title: userProfile.equippedTitle,
        rank: pRank,
        rating: userProfile.rating,
        isPlayer: true
      };
      rankingListEl.appendChild(createRankingRowElement(playerRow));
    }
  } else if (currentRankingTab === 'near') {
    // あなたの周辺表示（前後ライバル）
    const surroundingPool = [
      { offsetPos: -3, offsetRate: +42, name: '変異の探求者', title: '連勝の火付け役' },
      { offsetPos: -2, offsetRate: +28, name: '天王山チェイサー', title: '中央制圧の鬼' },
      { offsetPos: -1, offsetRate: +14, name: '桂馬跳梁', title: '奇襲電撃戦' },
      { offsetPos: 0,  offsetRate: 0,   name: `${userProfile.name} (あなた)`, title: userProfile.equippedTitle, isPlayer: true },
      { offsetPos: +1, offsetRate: -14, name: '不動の金将', title: '堅守の闘志' },
      { offsetPos: +2, offsetRate: -26, name: '機動歩兵の達人', title: '新進気鋭の駒遣い' },
      { offsetPos: +3, offsetRate: -40, name: '香車疾駆士', title: '一直線の気概' }
    ];

    surroundingPool.forEach(item => {
      const pos = Math.max(1, basePos + item.offsetPos);
      const rating = Math.max(1000, userProfile.rating + item.offsetRate);
      const rank = item.isPlayer ? pRank : getRankInfo(rating).title;
      const row = {
        pos,
        name: item.name,
        title: item.title,
        rank,
        rating,
        isPlayer: !!item.isPlayer
      };
      rankingListEl.appendChild(createRankingRowElement(row));
    });
  } else if (currentRankingTab === 'rivals') {
    // 対戦ライバル表示（過去に対戦したプレイヤー履歴）
    const rivals = loadRivalPlayers();
    if (rivals.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'ranking-empty';
      emptyEl.innerHTML = '対戦履歴はまだありません。<br>「真剣勝負（格付戦）」や「通信対局」を行うと、拳を交えた棋士がここに刻まれます。';
      rankingListEl.appendChild(emptyEl);
    } else {
      rivals.forEach((r, idx) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'ranking-row';

        const resultTag = r.isWin
          ? '<span class="ranking-tag-win">勝利</span>'
          : '<span class="ranking-tag-loss">敗北</span>';
        const bountyTag = r.isBounty ? '<span class="ranking-tag-bounty">賞金首</span>' : '';

        rowEl.innerHTML = `
          <div class="ranking-left">
            <span class="rank-pos-num">${idx + 1}</span>
            <span class="ranking-player-name">${r.name}</span>
            <span class="ranking-player-title">${r.date || ''}</span>
          </div>
          <div class="ranking-right">
            ${bountyTag}
            ${resultTag}
            <span class="ranking-tier-badge">${r.rankTitle || '初段'}</span>
            <span class="ranking-rate-val">R ${r.rating}</span>
          </div>
        `;
        rankingListEl.appendChild(rowEl);
      });
    }
  }
}

function createRankingRowElement(row) {
  const rowEl = document.createElement('div');
  rowEl.className = `ranking-row ${row.isPlayer ? 'is-player' : ''}`;

  const posBadge = row.medalLabel
    ? `<span class="rank-pos-num ${row.medal}">${row.medalLabel}</span>`
    : `<span class="rank-pos-num">${row.pos}</span>`;

  const bountyBadge = row.isBounty ? '<span class="ranking-tag-bounty">賞金首</span>' : '';

  rowEl.innerHTML = `
    <div class="ranking-left">
      ${posBadge}
      <span class="ranking-player-name">${row.name}</span>
      <span class="ranking-player-title">${row.title || ''}</span>
    </div>
    <div class="ranking-right">
      ${bountyBadge}
      <span class="ranking-tier-badge">${row.rank}</span>
      <span class="ranking-rate-val">R ${row.rating}</span>
    </div>
  `;
  return rowEl;
}

// 画面切替制御
function showScreen(screen) {
  const elEntrance = document.getElementById('view-entrance');
  const elGame = document.getElementById('view-game');
  if (screen === 'entrance') {
    if (elEntrance) elEntrance.classList.remove('hidden');
    if (elGame) elGame.classList.add('hidden');
    renderUserProfile();
    checkSavedGameResumeButton();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    if (elEntrance) elEntrance.classList.add('hidden');
    if (elGame) elGame.classList.remove('hidden');
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function checkSavedGameResumeButton() {
  const btnResume = document.getElementById('btn-resume-game');
  if (!btnResume) return;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data && data.phase === 'play' && data.movesCount > 0) {
        if (data._sig && data._sig !== computeStateChecksum(data)) {
          btnResume.classList.add('hidden');
          return;
        }
        btnResume.classList.remove('hidden');
        btnResume.textContent = `前回の対局を再開 (${data.movesCount}手目)`;
        return;
      }
    } catch (e) {}
  }
  btnResume.classList.add('hidden');
}

// ==========================================
// ローカルストレージ自動保存・復元（リロード対策）
// ==========================================
const STORAGE_KEY = 'muhou_shogi_saved_state_v1';
const STATE_SALT = 'MUHOU_MIDGAME_SEC_#89p!z';

function computeStateChecksum(data) {
  const payload = [
    data.turn,
    data.movesCount,
    data.bank ? `${data.bank.sente},${data.bank.gote}` : '',
    data.tennozanStreak,
    data.mode,
    STATE_SALT
  ].join(':');

  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function saveGameToStorage() {
  if (state.mode === 'online' || state.mode === 'rank') return;
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
      rankOpponent: state.rankOpponent || null,
      recentLogs: state.recentLogs || [],
      inGameScreen: (state.phase === 'play')
    };
    data._sig = computeStateChecksum(data);
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

    // 改変検知
    if (data._sig && data._sig !== computeStateChecksum(data)) {
      console.warn('Tamper detected in midgame state! Discarding saved game.');
      clearGameStorage();
      return false;
    }

    state.board = data.board;
    state.turn = data.turn || 'sente';
    state.phase = data.phase || 'play';
    state.bank = data.bank || { sente: 0, gote: 0 };
    state.lastMove = data.lastMove || null;
    state.nextPieceId = data.nextPieceId || 100;
    state.movesCount = data.movesCount || 0;
    state.tennozanStreak = data.tennozanStreak || 0;
    state.lastTennozanPieceId = data.lastTennozanPieceId || null;
    state.lastTennozanOwner = data.lastTennozanOwner || null;
    state.isSuddenDeath = !!data.isSuddenDeath;
    state.history = data.history || [];
    state.mode = data.mode || 'com';
    state.playerSide = data.playerSide || 'sente';
    state.rankOpponent = data.rankOpponent || null;
    state.recentLogs = data.recentLogs || [];

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

// ランクマッチ用のバーチャルライバルプール
const RANK_OPPONENTS = [
  { name: '歩兵の鬼', minR: 900, maxR: 1150 },
  { name: '香車ロケット丸', minR: 1000, maxR: 1250 },
  { name: '銀将スラッシャー', minR: 1100, maxR: 1350 },
  { name: '金城鉄壁', minR: 1200, maxR: 1400 },
  { name: '覚醒の飛龍', minR: 1300, maxR: 1550 },
  { name: '無限角マスター', minR: 1400, maxR: 1650 },
  { name: '天王山の覇者', minR: 1500, maxR: 1800 },
  { name: '変異の極致', minR: 1600, maxR: 1950 },
  { name: '無法竜王', minR: 1800, maxR: 2200 },
  { name: '無法名人', minR: 2000, maxR: 2500 }
];

// 初期化
function initGame() {
  const elGameMode = document.getElementById('game-mode');
  const elPlayerSide = document.getElementById('player-side');
  if (state.mode && elGameMode) {
    elGameMode.value = state.mode;
  }
  if (state.playerSide && elPlayerSide) {
    elPlayerSide.value = state.playerSide;
  }
  state.turn = 'sente';
  state.phase = 'play';
  state.bank = { sente: 0, gote: 0 }; // 初期0ptフラット
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
  closeInstantEvolutionModal();

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
  
  if (state.mode === 'rank' && state.rankOpponent) {
    addLog(`真剣勝負開始！ 対戦相手: ${state.rankOpponent.name} (${state.rankOpponent.rankTitle} R${state.rankOpponent.rating})`);
  } else if (state.mode === 'online') {
    const opp = state.onlineOpponent || { name: '対戦相手' };
    const mySideSymbol = state.playerSide === 'sente' ? '先手（青）' : '後手（赤）';
    addLog(`通信対局開始！ あなたは【${mySideSymbol}】です。対戦相手: ${opp.name}`, 'log-capture');
  } else {
    addLog('対局開始！駒の数字は「持ちポイント」です。敵を倒してポイントを貯め、手番で「移動」か「進化」を選びましょう。');
  }

  updatePlayerNames();
  renderAll();
  trackAnalyticsEvent('game_start', {
    mode: state.mode,
    player_side: state.playerSide
  });
  checkTriggerCPU();
}

function updatePlayerNames() {
  const senteNameEl = document.getElementById('sente-name');
  const goteNameEl = document.getElementById('gote-name');
  if (state.mode === 'pvp') {
    senteNameEl.textContent = 'プレイヤー1 (先手)';
    goteNameEl.textContent = 'プレイヤー2 (後手)';
  } else if (state.mode === 'rank') {
    const opp = state.rankOpponent || state.onlineOpponent || { name: '全国の棋士', rank: '初段', rating: 1200 };
    const pRank = getRankInfo(userProfile.rating).title;
    const playerLabel = `あなた (${pRank} R${userProfile.rating})`;
    const bountyTag = opp.isBounty ? ' [賞金首 TARGET]' : '';
    const oppTitle = opp.rankTitle || opp.rank || '初段';
    const oppLabel = `${opp.name} (${oppTitle} R${opp.rating || 1200})${bountyTag}`;
    if (state.playerSide === 'sente') {
      senteNameEl.textContent = playerLabel;
      goteNameEl.textContent = oppLabel;
    } else {
      senteNameEl.textContent = oppLabel;
      goteNameEl.textContent = playerLabel;
    }
  } else if (state.mode === 'online') {
    const opp = state.onlineOpponent || { name: '通信相手', rank: '初段', rating: 1200 };
    const pRank = getRankInfo(userProfile.rating).title;
    const playerLabel = `あなた (${pRank} R${userProfile.rating})`;
    const oppLabel = `${opp.name || '通信相手'} (${opp.rank || '初段'} R${opp.rating || 1200})`;
    if (state.playerSide === 'sente') {
      senteNameEl.textContent = playerLabel;
      goteNameEl.textContent = oppLabel;
    } else {
      senteNameEl.textContent = oppLabel;
      goteNameEl.textContent = playerLabel;
    }
  } else {
    const cpuLabel = state.mode === 'cpu-hard' ? 'CPU (強敵)' : state.mode === 'cpu-easy' ? 'CPU (入門)' : 'CPU (標準)';
    const myLabel = userProfile.name || 'あなた';
    if (state.playerSide === 'sente') {
      senteNameEl.textContent = myLabel;
      goteNameEl.textContent = cpuLabel;
    } else {
      senteNameEl.textContent = cpuLabel;
      goteNameEl.textContent = myLabel;
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

// 駒の表示ラベル（例: "8" や "4"）
function getPieceDisplayLabel(piece, includePending = false) {
  const pt = getPieceTotalPt(piece, includePending);
  return piece.type === 'ou' ? `王${pt}` : `${pt}`;
}

// 6と9の判別用下線フォーマッタ（反転時・多視点での誤認完全防止）
function formatPointWithUnderline(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  return str.replace(/([69])/g, '<span class="digit-underline">$1</span>');
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
  const isStraight = (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy));
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

// 盤面上の指定駒の攻撃範囲（合法移動手 + 自軍駒があり移動不可だが利いている援護マス）
function getPieceAttackCoverage(board, r, c) {
  const piece = board[r][c];
  if (!piece) return { validMoves: [], guardSquares: [] };
  const validMoves = [];
  const guardSquares = [];
  const sign = piece.owner === 'sente' ? 1 : -1;

  // 1. ステップ移動 (初期 + 進化追加)
  const allSteps = [...piece.initialSteps, ...piece.evolvedSteps];
  for (const [dx, dy] of allSteps) {
    if (hasRayInDir(piece, dx, dy, false)) continue;

    const nr = r + dy * sign;
    const nc = c + dx * sign;
    if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
      const target = board[nr][nc];
      if (!target) {
        validMoves.push({ r: nr, c: nc, isCapture: false });
      } else if (target.owner !== piece.owner) {
        validMoves.push({ r: nr, c: nc, isCapture: true });
      } else {
        // 自軍駒が存在し移動不可だが、攻撃範囲（利き・援護）であるマス
        guardSquares.push({ r: nr, c: nc });
      }
    }
  }

  // 2. 走り移動 (初期走り + 進化獲得走り)
  const allRays = [...piece.initialRays, ...(piece.evolvedRays || [])];
  for (const [rx, ry] of allRays) {
    const dr = ry * sign;
    const dc = rx * sign;
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
      const target = board[nr][nc];
      if (!target) {
        if (!validMoves.some(m => m.r === nr && m.c === nc)) {
          validMoves.push({ r: nr, c: nc, isCapture: false });
        }
      } else {
        if (target.owner !== piece.owner) {
          if (!validMoves.some(m => m.r === nr && m.c === nc)) {
            validMoves.push({ r: nr, c: nc, isCapture: true });
          }
        } else {
          // 自軍駒が存在し移動不可だが、攻撃範囲（利き・援護）であるマス（ここで直進は遮られる）
          if (!guardSquares.some(g => g.r === nr && g.c === nc)) {
            guardSquares.push({ r: nr, c: nc });
          }
        }
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  return { validMoves, guardSquares };
}

// 盤面上の指定駒の合法手を列挙
function getValidMovesForPiece(board, r, c) {
  return getPieceAttackCoverage(board, r, c).validMoves;
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
  if (state.mode === 'online' || state.mode === 'rank') {
    addLog('オンライン対局中は「待った」はできません。');
    return;
  }
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
  closeInstantEvolutionModal();

  addLog('待った: ひとつ前の自分の手番に戻しました。');
  renderAll();
}

// 盤面セルクリック処理
function onCellClick(r, c) {
  if (state.phase === 'gameover') return;
  if (isCPUTurn()) return;

  const clickedPiece = state.board[r][c];

  // オンライン対局で相手の手番中の場合、駒の移動はブロック（インスペクトのみ）
  if ((state.mode === 'online' || state.mode === 'rank') && state.turn !== state.playerSide) {
    if (clickedPiece) {
      state.inspectedPiece = clickedPiece;
      renderAll();
    }
    return;
  }
  if (clickedPiece) {
    state.inspectedPiece = clickedPiece;
  }

  // 重要バグ修正: 撃破即時進化フェーズ中、盤面クリックで移動が誤発火してフェーズが破壊されるのを完全防止！
  // 自軍の駒をクリックした場合は進化対象インスペクターを切り替えるのみ
  // 相手の進化待機中または撃破即時進化フェーズ中のガード
  if (state.phase === 'remote_evo') {
    if (clickedPiece) {
      state.inspectedPiece = clickedPiece;
      renderAll();
    }
    return;
  }

  if (state.phase === 'instant_evo') {
    if (clickedPiece && clickedPiece.owner === state.turn) {
      state.inspectedPiece = clickedPiece;
    }
    state.selectedCell = null;
    state.validMoves = [];
    state.guardSquares = [];
    renderAll();
    return;
  }

  // もし現在通常手番で進化ポイントを仮割り振り中の場合：
  // 盤上のどの味方駒をクリックしてもインスペクターが切り替わり、続けて別の味方駒にもポイントを振れる！
  if (state.pendingEvo.length > 0) {
    state.selectedCell = null;
    state.validMoves = [];
    state.guardSquares = [];
    renderAll();
    return;
  }

  // 1. すでに駒を選択中の場合
  if (state.selectedCell) {
    // 選択中のセルをもう一度クリックした場合 -> 選択解除（盤上の範囲表示を消去）
    if (state.selectedCell.r === r && state.selectedCell.c === c) {
      state.selectedCell = null;
      state.validMoves = [];
      state.guardSquares = [];
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
    const coverage = getPieceAttackCoverage(state.board, r, c);
    state.validMoves = coverage.validMoves;
    state.guardSquares = coverage.guardSquares;
    renderAll();
  } 
  // 3. 相手の駒をクリックした場合 -> 相手駒の動けるマス（赤色）＆援護マスをハイライト表示！
  else if (clickedPiece && clickedPiece.owner !== state.turn) {
    state.inspectedPiece = clickedPiece;
    state.selectedCell = { r, c, isEnemy: true };
    const coverage = getPieceAttackCoverage(state.board, r, c);
    state.validMoves = coverage.validMoves;
    state.guardSquares = coverage.guardSquares;
    renderAll();
  } 
  // 4. 空白マスをクリックした場合 -> 選択解除
  else {
    state.selectedCell = null;
    state.validMoves = [];
    state.guardSquares = [];
    renderAll();
  }
}

// 【アクションA：駒を動かす】の実行
function executeMove(fromR, fromC, toR, toC, syncOnline = true) {
  hideEnemyEvolutionNotification();
  closeInstantEvolutionModal();
  saveHistory();

  const movingPiece = state.board[fromR][fromC];
  const targetPiece = state.board[toR][toC];

  // 着手・捕獲プロシージャル効果音
  if (targetPiece) {
    SoundSystem.playCapture();
  } else {
    SoundSystem.playMove();
  }
  if (toR === 4 && toC === 4) {
    SoundSystem.playTennozan();
  }

  // オンライン対局時の指し手送信（通常通信対局および格付戦の両方で確実に同期）
  const isOnlineGame = (state.mode === 'online' || state.mode === 'rank');
  if (syncOnline && isOnlineGame && state.turn === state.playerSide && window.MuhouOnline && typeof window.MuhouOnline.sendOnlineMoveAction === 'function') {
    window.MuhouOnline.sendOnlineMoveAction(fromR, fromC, toR, toC, targetPiece);
  }

  state.board[toR][toC] = movingPiece;
  state.board[fromR][fromC] = null;
  state.lastMove = { fromR, fromC, toR, toC };
  state.selectedCell = null;
  state.validMoves = [];
  state.guardSquares = [];
  state.inspectedPiece = movingPiece;

  // 天王山（５五）へ入った場合は直近制圧プレイヤーを記録
  if (toR === 4 && toC === 4) {
    state.lastTennozanOwner = movingPiece.owner;
  }

  const sideSymbol = state.turn === 'sente' ? '先手' : '後手';
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
      `${sideSymbol} ${posStr}【${moverLabel}】が 敵の【${targetLabel}(${targetPiece.name})】を撃破！ ＋${gainedPt}pt 吸収！`,
      'log-capture'
    );

    // オンライン対戦で相手が撃破した場合：相手の進化確定パケット待ちフェーズへ
    if ((state.mode === 'online' || state.mode === 'rank') && !syncOnline) {
      state.bank[state.turn] += gainedPt;
      state.phase = 'remote_evo';
      state.inspectedPiece = movingPiece;
      renderAll();
      return;
    }

    // 【案1: 撃破時即時進化】手番をパスせず、撃破と同時に進化を実行！
    startInstantEvolution(gainedPt, targetPiece.name, movingPiece);
  } else {
    addLog(`${sideSymbol} ${posStr}へ【${moverLabel}(${movingPiece.name})】を移動`);
    endTurn();
  }
}

// 撃破時の即時進化フェーズ（手番消費なし・その場で強化して相手番へ）
let instantEvoModalTimer = null;

function showInstantEvolutionModal(points, enemyName, killerPiece) {
  const modal = document.getElementById('instant-evo-modal');
  const msgEl = document.getElementById('instant-evo-msg');
  if (!modal) return;

  if (msgEl) {
    const pName = enemyName || '敵駒';
    msgEl.innerHTML = `敵駒【<strong>${pName}</strong>】を撃破！ <span style="color:#fbbf24;font-weight:900">＋${points}pt</span> 獲得！`;
  }

  modal.classList.remove('hidden');

  if (instantEvoModalTimer) clearTimeout(instantEvoModalTimer);
  instantEvoModalTimer = setTimeout(() => {
    closeInstantEvolutionModal();
  }, 2200);
}

function closeInstantEvolutionModal() {
  const modal = document.getElementById('instant-evo-modal');
  if (modal) modal.classList.add('hidden');
  if (instantEvoModalTimer) {
    clearTimeout(instantEvoModalTimer);
    instantEvoModalTimer = null;
  }
}

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
    showInstantEvolutionModal(points, enemyName, killerPiece);
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
  const isStraight = (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy));
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
    state.guardSquares = [];
    renderAll();
    return;
  }

  // 3. 通常の新規ステップ解放（1マス目、または内周完了後の外周マス）
  if (canUnlockCoord(piece, dx, dy, true)) {
    state.pendingEvo.push({ pieceId: piece.id, dx, dy, type: 'step' });
    state.selectedCell = null;
    state.validMoves = [];
    state.guardSquares = [];
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
      const cov = getPieceAttackCoverage(state.board, found.r, found.c);
          state.validMoves = cov.validMoves;
          state.guardSquares = cov.guardSquares;
    }
  }
  renderAll();
}

// 駒の進化方向（盤面から見た矢印と説明）を取得
function getDirectionDescription(piece, dx, dy, isRay) {
  // その駒にとっての相対方向（dy < 0 が前進、dy > 0 が後退）
  const isGote = piece.owner === 'gote';
  const isStraight = (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy));

  // 直線8方向の走り（大駒化）
  if (isRay && isStraight) {
    if (dx === 0 && dy < 0) return isGote ? '前進（突撃ビーム・手前へ）' : '前進（突撃ビーム・敵陣へ）';
    if (dx === 0 && dy > 0) return isGote ? '後退（引きビーム・敵陣へ）' : '後退（引きビーム・自陣へ）';
    if (dx < 0 && dy === 0) return '左（横ビーム）';
    if (dx > 0 && dy === 0) return '右（横ビーム）';
    if (dx < 0 && dy < 0) return '左斜め前（斜めビーム）';
    if (dx > 0 && dy < 0) return '右斜め前（斜めビーム）';
    if (dx < 0 && dy > 0) return '左斜め後ろ（斜めビーム）';
    if (dx > 0 && dy > 0) return '右斜め後ろ（斜めビーム）';
  }

  // ステップ移動 (1マスまたは2マス)
  const ring = Math.max(Math.abs(dx), Math.abs(dy));
  if (ring === 1) {
    if (dx === 0 && dy < 0) return '前1マス（前進）';
    if (dx === 0 && dy > 0) return '後1マス（後退）';
    if (dx < 0 && dy < 0) return '左斜め前1マス';
    if (dx > 0 && dy < 0) return '右斜め前1マス';
    if (dx < 0 && dy === 0) return '左1マス';
    if (dx > 0 && dy === 0) return '右1マス';
    if (dx < 0 && dy > 0) return '左斜め後ろ1マス';
    if (dx > 0 && dy > 0) return '右斜め後ろ1マス';
  } else if (ring === 2) {
    // 2マス移動（直線）
    if (dx === 0 && dy === -2) return '前2マス（前進2歩）';
    if (dx === 0 && dy === 2) return '後2マス（後退2歩）';
    if (dx === -2 && dy === 0) return '左2マス移動';
    if (dx === 2 && dy === 0) return '右2マス移動';
    if (dx === -2 && dy === -2) return '左斜め前2マス移動';
    if (dx === 2 && dy === -2) return '右斜め前2マス移動';
    if (dx === -2 && dy === 2) return '左斜め後ろ2マス移動';
    if (dx === 2 && dy === 2) return '右斜め後ろ2マス移動';

    // 桂馬ジャンプ等（非直線）
    if (dx === -1 && dy === -2) return '左桂馬ジャンプ';
    if (dx === 1 && dy === -2) return '右桂馬ジャンプ';
    if (dx === -2 && dy === -1) return '左横前桂馬ジャンプ';
    if (dx === 2 && dy === -1) return '右横前桂馬ジャンプ';
    if (dx === -2 && dy === 1) return '左横後ろ桂馬ジャンプ';
    if (dx === 2 && dy === 1) return '右横後ろ桂馬ジャンプ';
    if (dx === -1 && dy === 2) return '左後ろ桂馬ジャンプ';
    if (dx === 1 && dy === 2) return '右後ろ桂馬ジャンプ';
  }

  return `相対(${dx},${dy})移動`;
}

let enemyEvoNotificationTimer = null;

function showEnemyEvolutionNotification(reports) {
  const elToast = document.getElementById('enemy-evo-notification');
  const elBody = document.getElementById('enemy-evo-body');
  const elTitle = document.getElementById('enemy-evo-title-text');
  const btnInspect = document.getElementById('btn-inspect-enemy-evo');
  if (!elToast || !elBody || !reports || reports.length === 0) return;

  if (enemyEvoNotificationTimer) {
    clearTimeout(enemyEvoNotificationTimer);
    enemyEvoNotificationTimer = null;
  }

  const first = reports[0];
  const sideSymbol = first && first.owner === 'sente' ? '先手' : '相手';
  if (elTitle) {
    elTitle.textContent = `${sideSymbol}が駒を変異・進化させました`;
  }

  elBody.innerHTML = '';
  for (const rep of reports) {
    const card = document.createElement('div');
    card.className = 'enemy-evo-piece-card';

    // 駒情報の取得
    let piece = rep.piece;
    if (!piece && rep.pieceId) {
      const found = findPieceById(state.board, rep.pieceId);
      if (found) piece = found.piece;
    }

    const pSide = rep.owner === 'sente' ? '先手' : '後手';
    const isOwnerGote = rep.owner === 'gote';

    // 1. ヘッダー行
    const cardHeader = document.createElement('div');
    cardHeader.className = 'enemy-evo-piece-header';
    cardHeader.innerHTML = `
      <div class="enemy-evo-meta-title">
        <span class="owner-mini-badge ${isOwnerGote ? 'gote-badge' : 'sente-badge'}">${pSide}</span>
        <strong>【${rep.name}】</strong>
        <span class="enemy-evo-pos-tag">${rep.posStr || ''}</span>
      </div>
      <div class="enemy-evo-delta-tag">+${rep.count}pt (計${formatPointWithUnderline(rep.totalPt)}pt)</div>
    `;
    card.appendChild(cardHeader);

    // 2. ビジュアル5x5マトリックス図（文章ではなく画像的なグリッドで表示）
    const visualBox = document.createElement('div');
    visualBox.className = 'enemy-evo-visual-box';

    const gridEl = document.createElement('div');
    gridEl.className = 'enemy-evo-mini-grid';

    // 盤面上の実際の攻撃方向と同期（相手駒の進行方向を手前▼・自陣向きに完全同期）
    const shouldFlip = true;

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const cell = document.createElement('div');
        cell.className = 'mini-matrix-cell';

        if (dx === 0 && dy === 0) {
          // 中央（駒本体：相手の駒として必ず180度反転＆将棋駒形状表示）
          cell.classList.add('is-center');
          const rawLabel = piece ? getPieceDisplayLabel(piece, true) : (rep.name ? rep.name[0] : '駒');
          cell.innerHTML = formatPointWithUnderline(rawLabel);
        } else {
          const checkDx = shouldFlip ? -dx : dx;
          const checkDy = shouldFlip ? -dy : dy;

          const dirX = Math.sign(checkDx);
          const dirY = Math.sign(checkDy);
          const isStraight = (checkDx === 0 || checkDy === 0 || Math.abs(checkDx) === Math.abs(checkDy));
          const is2ndStep = isStraight && (checkDx === dirX * 2 && checkDy === dirY * 2);

          // 【赤】新しく追加された範囲の判定
          const isNewMove = rep.changes && rep.changes.some(ch => {
            if (ch.isRay) {
              return isStraight && (Math.sign(ch.dx) === dirX && Math.sign(ch.dy) === dirY);
            }
            return ch.dx === checkDx && ch.dy === checkDy;
          });

          // 【緑】既存の動ける範囲の判定
          let isExistingMove = false;
          if (!isNewMove && piece) {
            const hasStep = hasStepAt(piece, checkDx, checkDy, false);
            const hasRay = hasRayInDir(piece, checkDx, checkDy, false);
            if (hasStep || hasRay) {
              isExistingMove = true;
            }
          }

          if (isNewMove) {
            cell.classList.add('is-new-range');
            const isRayChange = rep.changes.some(ch => ch.isRay && isStraight && Math.sign(ch.dx) === dirX && Math.sign(ch.dy) === dirY);
            cell.textContent = isRayChange ? '∞' : '新';
            cell.title = '新しく追加された移動範囲';
          } else if (isExistingMove) {
            cell.classList.add('is-existing-range');
            const isRay = piece && hasRayInDir(piece, checkDx, checkDy, false);
            cell.textContent = isRay ? '∞' : '●';
            cell.title = '既存の移動範囲';
          } else {
            cell.classList.add('is-empty');
          }
        }
        gridEl.appendChild(cell);
      }
    }
    visualBox.appendChild(gridEl);

    // 3. 凡例と進行方向
    const metaEl = document.createElement('div');
    metaEl.className = 'enemy-evo-meta-desc';
    const dirText = shouldFlip ? '▼ 手前（自陣向き）' : '▲ 奥（敵陣向き）';
    metaEl.innerHTML = `
      <div class="enemy-evo-dir-chip">${dirText}</div>
      <div class="enemy-evo-legend-pills">
        <div class="legend-pill-item"><span class="chip-color green-chip"></span><span>緑: 既存の移動域</span></div>
        <div class="legend-pill-item"><span class="chip-color red-chip"></span><span>赤: 今回の進化マス</span></div>
      </div>
    `;
    visualBox.appendChild(metaEl);

    card.appendChild(visualBox);

    // 1タップで盤面フォーカス・インスペクト（UI/UXガイドライン Rule 4.1準拠）
    card.title = 'タップしてこの駒を盤面フォーカス・インスペクト';
    const repPieceId = rep.pieceId;
    card.addEventListener('click', () => {
      if (repPieceId) {
        const found = findPieceById(state.board, repPieceId);
        if (found) {
          state.inspectedPiece = found.piece;
          state.selectedCell = { r: found.r, c: found.c, isEnemy: true };
          const cov = getPieceAttackCoverage(state.board, found.r, found.c);
          state.validMoves = cov.validMoves;
          state.guardSquares = cov.guardSquares;
          renderAll();
        }
      }
      hideEnemyEvolutionNotification();
  closeInstantEvolutionModal();
    });

    elBody.appendChild(card);
  }

  if (btnInspect && first) {
    btnInspect.onclick = () => {
      const found = findPieceById(state.board, first.pieceId);
      if (found) {
        state.inspectedPiece = found.piece;
        state.selectedCell = { r: found.r, c: found.c, isEnemy: true };
        const cov = getPieceAttackCoverage(state.board, found.r, found.c);
          state.validMoves = cov.validMoves;
          state.guardSquares = cov.guardSquares;
        renderAll();
      }
      hideEnemyEvolutionNotification();
  closeInstantEvolutionModal();
    };
  }

  elToast.classList.remove('hidden');

  enemyEvoNotificationTimer = setTimeout(() => {
    hideEnemyEvolutionNotification();
  closeInstantEvolutionModal();
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

  const sideSymbol = state.turn === 'sente' ? '先手' : '後手';
  if (spentPt > 0) {
    const details = [];
    for (const { found, count, rays } of evolvedSummary.values()) {
      const posStr = formatPos(found.r, found.c);
      const newTotal = getPieceTotalPt(found.piece, false);
      const rayText = rays > 0 ? ` (走り+${rays})` : '';
      details.push(`${posStr}【${found.piece.name}】を+${count}pt強化${rayText}(計${newTotal}pt)`);
    }

    addLog(
      `${sideSymbol}が進化：${details.join('、')} （残り所持: ${state.bank[state.turn]}pt）`,
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

  // オンライン対局時の進化確定データ送信 (0pt割り振りの場合も含め必ず送信して相手クライアントのフェーズを完了)
  const isOnlineGame = (state.mode === 'online' || state.mode === 'rank');
  if (isOnlineGame && state.turn === state.playerSide && window.MuhouOnline && typeof window.MuhouOnline.sendOnlineEvolutionAction === 'function') {
    const pendingCopy = state.pendingEvo.map(p => ({ ...p }));
    const details = [];
    for (const { found, count, rays } of evolvedSummary.values()) {
      const posStr = formatPos(found.r, found.c);
      const rayText = rays > 0 ? ` (走り+${rays})` : '';
      details.push({
        name: found.piece.name,
        pieceId: found.piece.id,
        posStr,
        count,
        totalPt: getPieceTotalPt(found.piece, false),
        changes: state.pendingEvo.filter(p => p.pieceId === found.piece.id).map(alloc => ({
          isRay: alloc.type === 'ray',
          dx: alloc.dx,
          dy: alloc.dy,
          desc: getDirectionDescription(found.piece, alloc.dx, alloc.dy, alloc.type === 'ray')
        }))
      });
    }
    window.MuhouOnline.sendOnlineEvolutionAction(pendingCopy, spentPt, details);
  }

  if (spentPt > 0) {
    trackAnalyticsEvent('piece_evolution', {
      mode: state.mode,
      spent_pt: spentPt
    });
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
  state.selectedCell = null;
  state.validMoves = [];
  state.guardSquares = [];
  state.movesCount++;
  state.turn = state.turn === 'sente' ? 'gote' : 'sente';
  const sideSymbol = state.turn === 'sente' ? '先手' : '後手';

  // 1. サドンデス突入判定（80手以上）
  if (state.movesCount >= 80 && !state.isSuddenDeath && state.phase !== 'gameover') {
    state.isSuddenDeath = true;
    showSuddenDeathBanner();
    addLog(
      '【サドンデス発動！】80手を超えたためサドンデスに突入！毎ターン両軍に過熱エネルギー(+1pt)が供給されます！120手到達で総ポイント判定！',
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
    addLog(`【サドンデス過熱】${sideSymbol}に過熱エネルギー ＋1pt！ (残り ${120 - state.movesCount}手で総pt判定)`, 'log-evo');
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
        `【天王山制圧】${sideSymbol}が５五（中央）を支配中（${state.tennozanStreak[state.turn]}/3回目）！ ＋1pt ボーナス獲得！（所持: ${state.bank[state.turn]}pt）`,
        'log-capture'
      );
    } else {
      addLog(
        `【天王山上限】５五の居座りボーナス上限（3回）に達しています。別の駒で入り直すか敵から奪回すると再獲得できます。`
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
    addLog(`【王手！】${sideSymbol}の玉に王手がかかりました！`, 'log-capture');
    showCheckBanner(state.turn);
  }

  checkTriggerCPU();
}

// ゲーム終了
function endGame(winner, reasonText) {
  state.phase = 'gameover';
  state.winner = winner;
  renderAll();

  // 勝敗サウンド再生
  const isHumanWinner = (state.mode === 'pvp')
    ? (winner === state.turn)
    : (winner === state.playerSide);
  if (isHumanWinner) {
    SoundSystem.playVictory();
  } else {
    SoundSystem.playDefeat();
  }

  trackAnalyticsEvent('game_complete', {
    mode: state.mode,
    winner: winner,
    moves: state.movesCount,
    is_victory: isHumanWinner
  });

  const modal = document.getElementById('gameover-modal');
  const title = document.getElementById('gameover-title');
  const desc = document.getElementById('gameover-desc');

  const winnerLabel = winner === 'sente' ? '先手' : '後手';
  title.textContent = `${winnerLabel}の勝利！`;
  desc.textContent = reasonText;

  // ランクマッチ時のレート計算と演出
  const rankBox = document.getElementById('gameover-rank-result');
  const rankDiffEl = document.getElementById('rank-result-diff');
  const rankCurrEl = document.getElementById('rank-result-current');
  const rankUpBanner = document.getElementById('rank-up-banner');
  const rankBountyEl = document.getElementById('rank-bounty-bonus-desc');

  const isRanked = (state.mode === 'rank');
  if (isRanked) {
    const isWin = (winner === state.playerSide);
    const oldRating = userProfile.rating;
    const oldRank = getRankInfo(oldRating).title;
    const isBounty = !!(state.rankOpponent && state.rankOpponent.isBounty);

    const resultBadgeEl = document.getElementById('rank-result-badge');
    if (resultBadgeEl) {
      resultBadgeEl.textContent = '真剣勝負（格付戦）結果';
    }

    let delta = 0;
    if (isWin) {
      userProfile.wins++;
      userProfile.streak++;
      if (userProfile.streak > userProfile.maxStreak) userProfile.maxStreak = userProfile.streak;
      const streakBonus = Math.min(8, (userProfile.streak - 1) * 2);
      let baseDelta = 26 + Math.floor(Math.random() * 5) + Math.max(0, streakBonus);

      // ③ 賞金首討伐ボーナス
      if (isBounty) {
        userProfile.bountiesClaimed = (userProfile.bountiesClaimed || 0) + 1;
        baseDelta += 20;
        if (rankBountyEl) {
          const reason = (state.rankOpponent && state.rankOpponent.bountyReason) ? ` (${state.rankOpponent.bountyReason})` : '';
          rankBountyEl.textContent = `賞金首討伐ボーナス獲得！ (+20 R${reason})`;
          rankBountyEl.classList.remove('hidden');
        }
      } else {
        if (rankBountyEl) rankBountyEl.classList.add('hidden');
      }

      delta = baseDelta;
      userProfile.rating += delta;
    } else {
      userProfile.losses++;
      userProfile.streak = 0;
      delta = -(14 + Math.floor(Math.random() * 5));
      userProfile.rating = Math.max(1000, userProfile.rating + delta);
      if (rankBountyEl) rankBountyEl.classList.add('hidden');
    }
    saveUserProfile();
    renderUserProfile();

    const newRating = userProfile.rating;
    const newRank = getRankInfo(newRating).title;

    if (rankBox) {
      rankBox.classList.remove('hidden');
      if (isWin) {
        rankDiffEl.className = 'rank-result-diff plus';
        rankDiffEl.textContent = `+${delta} R`;
      } else {
        rankDiffEl.className = 'rank-result-diff minus';
        rankDiffEl.textContent = `${delta} R`;
      }
      rankCurrEl.textContent = `新レート: ${newRating} (${newRank})`;

      if (isWin && oldRank !== newRank) {
        rankUpBanner.textContent = `昇級・昇段！ ${oldRank} から ${newRank}`;
        rankUpBanner.classList.remove('hidden');
      } else {
        rankUpBanner.classList.add('hidden');
      }
    }
  } else {
    if (rankBox) rankBox.classList.add('hidden');
  }

  // 対戦ライバル履歴の記録（格付戦またはオンライン対局）
  if (state.mode === 'rank' || state.mode === 'online') {
    const opp = (state.mode === 'rank' ? state.rankOpponent : state.onlineOpponent) || {
      name: '全国の棋士',
      rankTitle: '初段',
      rating: 1200
    };
    const isPlayerWinner = (winner === state.playerSide);
    recordRivalPlayer(
      opp.name || '対戦相手',
      opp.rating || 1200,
      opp.rankTitle || opp.rank || '初段',
      isPlayerWinner,
      { isBounty: !!(opp.isBounty) }
    );
  }

  modal.classList.remove('hidden');
  addLog(`${winnerLabel}の勝利！ (${reasonText})`);
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
      if (p && (p.id === id || String(p.id) === String(id))) return { r, c, piece: p };
    }
  }
  return null;
}

function isCPUTurn() {
  if (state.mode === 'pvp' || state.mode === 'online' || state.mode === 'rank') return false;
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

    const isRankMatch = state.mode === 'rank';
    const isHard = state.mode === 'cpu-hard' || (isRankMatch && userProfile.rating >= 1500);
    const isEasy = state.mode === 'cpu-easy' || (isRankMatch && userProfile.rating < 1150);
    const depth = isHard ? 2 : (isEasy ? 1 : 2);
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

      const jitter = isEasy ? (Math.random() * 160 - 80) : isHard ? (Math.random() * 8 - 4) : (Math.random() * 18 - 9);
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


// プレイヤー視点における盤面反転判定（通信対局・CPU戦で自分が後手の場合、自軍を手前に配置）
function isFlippedPerspective() {
  if (state.mode === 'pvp') return false;
  return state.playerSide === 'gote';
}

// 盤面とラベルの同期（プレイヤー視点に合わせて手前を自陣、奥を敵陣に自動配置）
function updateBoardPerspective() {
  const flipped = isFlippedPerspective();
  const boardEl = document.getElementById('shogi-board');
  const mainLayout = document.querySelector('.main-layout');
  const colLabels = document.querySelector('.col-labels');
  const rowLabels = document.querySelector('.row-labels');

  if (boardEl) {
    boardEl.classList.toggle('flipped-perspective', flipped);
  }
  if (mainLayout) {
    mainLayout.classList.toggle('flip-players', flipped);
  }
  if (colLabels) {
    const cols = flipped ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [9, 8, 7, 6, 5, 4, 3, 2, 1];
    colLabels.innerHTML = cols.map(n => `<span>${n}</span>`).join('');
  }
  if (rowLabels) {
    const rows = flipped ? ['九', '八', '七', '六', '五', '四', '三', '二', '一'] : ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
    rowLabels.innerHTML = rows.map(s => `<span>${s}</span>`).join('');
  }
}

function renderAll() {
  updateBoardPerspective();
  renderBoard();
  renderStatsAndStatus();
  renderEvolutionBox();
  renderInspector();
  saveGameToStorage();
}

function renderBoard() {
  // 駒が存在しないマスがselectedCellに残っている場合の自動クリーンアップ
  if (state.selectedCell) {
    const selectedPiece = state.board[state.selectedCell.r] && state.board[state.selectedCell.r][state.selectedCell.c];
    if (!selectedPiece) {
      state.selectedCell = null;
      state.validMoves = [];
      state.guardSquares = [];
    }
  }

  elBoard.innerHTML = '';
  const flipped = isFlippedPerspective();

  for (let displayR = 0; displayR < 9; displayR++) {
    for (let displayC = 0; displayC < 9; displayC++) {
      const r = flipped ? (8 - displayR) : displayR;
      const c = flipped ? (8 - displayC) : displayC;
      const cell = document.createElement('div');
      cell.className = 'board-cell';
      cell.dataset.r = r;
      cell.dataset.c = c;

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

      // 駒が選択されている場合のみ、移動可能マスや利き・援護マスをハイライト表示
      if (state.selectedCell) {
        // 移動可能マスのハイライト
        const validMove = state.validMoves && state.validMoves.find(m => m.r === r && m.c === c);
        if (validMove) {
          if (state.selectedCell.isEnemy) {
            // 相手駒の利き：赤色で表示（味方駒がターゲットになっている場合はさらに強調）
            cell.classList.add(validMove.isCapture ? 'enemy-target-capture' : 'enemy-valid-move');
          } else {
            // 自軍駒の移動先：緑色（敵駒がいる場合は赤枠）
            cell.classList.add(validMove.isCapture ? 'valid-capture' : 'valid-move');
          }
        }

        // 攻撃範囲内にある自軍・相手軍の駒（移動不可だが利き・援護があるマス）のハイライト
        const isGuard = state.guardSquares && state.guardSquares.some(g => g.r === r && g.c === c);
        if (isGuard) {
          if (state.selectedCell.isEnemy) {
            cell.classList.add('enemy-guard-move');
          } else {
            cell.classList.add('ally-guard-move');
          }
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
        const visualSign = flipped
          ? (piece.owner === 'gote' ? 1 : -1)
          : (piece.owner === 'sente' ? 1 : -1);

        for (const [dx, dy] of INNER_COORDS) {
          const stepType = hasStepAt(piece, dx, dy, true);
          const isRay = hasRayInDir(piece, dx, dy, true);
          if (stepType || isRay) {
            const boardDx = dx * visualSign;
            const boardDy = dy * visualSign;
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
          crownEl.textContent = '王';
          pieceEl.appendChild(crownEl);
        }

        // 中央の持ちポイント数字（6と9の判別用下線付き）
        const ptNumEl = document.createElement('span');
        ptNumEl.className = 'piece-pt-num';
        ptNumEl.innerHTML = formatPointWithUnderline(totalPt);
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
    document.getElementById(`${owner}-piece-count`).textContent = pieces.length;
    document.getElementById(`${owner}-total-pt`).textContent = totalPt;
    document.getElementById(`${owner}-max-piece`).textContent =
      maxPiece ? getPieceDisplayLabel(maxPiece, true) : '-';
  }

  elCardSente.classList.toggle('active-turn', state.turn === 'sente');
  elCardGote.classList.toggle('active-turn', state.turn === 'gote');

  let turnLabel;
  if (state.mode === 'pvp') {
    turnLabel = state.turn === 'sente' ? '先手' : '後手';
  } else {
    turnLabel = state.turn === state.playerSide ? 'あなた' : '相手';
  }
  const movesText = state.movesCount > 0 ? ` (${state.movesCount}手目)` : '';

  elStatusBanner.classList.toggle('sudden-death-mode', state.isSuddenDeath && state.phase !== 'gameover');

  if (state.phase === 'gameover') {
    elStatusBanner.classList.remove('evo-mode', 'sudden-death-mode');
    elTurnIndicator.textContent = '対局終了';
    elSubStatus.textContent = '「新規対局」で最初から遊べます';
  } else if (state.phase === 'remote_evo') {
    elStatusBanner.classList.add('evo-mode');
    elTurnIndicator.textContent = `相手が霊力を配分中...${movesText}`;
    elSubStatus.textContent = '相手プレイヤーが獲得した霊力で駒を変異・進化させています（待機中）';
  } else if (state.phase === 'instant_evo') {
    elStatusBanner.classList.add('evo-mode');
    elTurnIndicator.textContent = `撃破ボーナス！ ${turnLabel}の即時進化${movesText}`;
    elSubStatus.textContent = '倒した駒や味方駒の移動マスを解放し、「進化を確定」で相手番へ進みます（手番消費なし！）';
  } else if (state.pendingEvo.length > 0) {
    elStatusBanner.classList.add('evo-mode');
    elTurnIndicator.textContent = `${turnLabel}：進化ポイントを割り振り中${movesText}`;
    elSubStatus.textContent = `「進化を確定してターン終了」を押すと手番を終了します（振り直しで移動に戻れます）`;
  } else {
    const inCheck = isKingInCheck(state.board, state.turn);
    if (inCheck) {
      elStatusBanner.classList.add('evo-mode');
      elTurnIndicator.textContent = `${turnLabel}の番（王手）${movesText}`;
      elSubStatus.textContent = '王手をかけられています！玉を逃がすか、防いでください！';
    } else if (state.isSuddenDeath) {
      elTurnIndicator.textContent = `【サドンデス】${turnLabel}の番${movesText}`;
      if (isCPUTurn()) {
        elSubStatus.textContent = `CPU思考中...（残り ${120 - state.movesCount}手で総ポイント判定）`;
      } else {
        elSubStatus.textContent = `過熱エネルギー毎ターン+1pt供給！ 残り ${120 - state.movesCount}手で総ポイント判定決着！`;
      }
    } else {
      elStatusBanner.classList.remove('evo-mode');
      elTurnIndicator.textContent = `${turnLabel}の番です${movesText}`;
      if (state.mode === 'online' || state.mode === 'rank') {
        if (state.turn === state.playerSide) {
          if (state.mode === 'rank' && state.rankOpponent && state.rankOpponent.isBounty) {
            elSubStatus.textContent = `【賞金首戦: ${state.rankOpponent.bountyReason || '強敵'}】撃破でレート大量ボーナス獲得！`;
          } else {
            elSubStatus.textContent = 'あなたの番です！動かす駒を選択してください';
          }
        } else {
          elSubStatus.textContent = '相手プレイヤーが考え中... (着手を待っています)';
        }
      } else if (isCPUTurn()) {
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
  const isPvp = (state.mode === 'pvp');
  const mainLayout = document.querySelector('.main-layout');
  if (mainLayout) {
    mainLayout.classList.toggle('pvp-mode', isPvp);
  }
  if (elCardGote) {
    elCardGote.classList.toggle('pvp-facing', isPvp);
  }
  if (elEvoBoxTop) {
    elEvoBoxTop.classList.toggle('hidden', !isPvp);
  }

  const remaining = getRemainingBankPt();
  const spending = state.pendingEvo.length;
  const totalBank = state.bank[state.turn];

  if (elEvoRemaining) elEvoRemaining.textContent = remaining;
  if (elEvoSpending) elEvoSpending.textContent = spending;
  const elEvoLabel = document.getElementById('evo-label-remaining');
  const elEvoSpendingBadge = document.getElementById('evo-spending-badge');
  if (elEvoLabel) elEvoLabel.textContent = spending > 0 ? '残' : '所持';
  if (elEvoSpendingBadge) elEvoSpendingBadge.classList.toggle('hidden', spending === 0);

  // 下側ドック（先手側）の制御
  const isSenteTurn = state.turn === 'sente';
  elEvoBox.classList.toggle('is-turn-active', !isPvp || isSenteTurn);
  elEvoBox.classList.toggle('is-turn-inactive', isPvp && !isSenteTurn);
  elEvoBox.classList.toggle('has-points', (isSenteTurn || !isPvp) && totalBank > 0 && !isCPUTurn());
  elEvoBox.classList.toggle('is-allocating', (isSenteTurn || !isPvp) && spending > 0 && !isCPUTurn());

  if (isPvp && !isSenteTurn && state.phase !== 'instant_evo') {
    if (elEvoMsg) elEvoMsg.textContent = '後手の手番中です。盤面を見守りながら次手を構想できます';
    elBtnEvoConfirm.disabled = true;
    elBtnEvoReset.disabled = true;
  } else if (state.phase === 'instant_evo') {
    if (elEvoMsg) elEvoMsg.textContent = `撃破した霊力を即時配分中！確定するとそのまま相手番へ進みます（手番消費なし）`;
    elBtnEvoConfirm.disabled = isCPUTurn() || state.phase === 'gameover';
    elBtnEvoReset.disabled = spending === 0 || isCPUTurn() || state.phase === 'gameover';
  } else if (spending > 0) {
    if (elEvoMsg) elEvoMsg.textContent = `${spending}pt 割り振り中（確定すると1手消費してターン終了）`;
    elBtnEvoConfirm.disabled = spending === 0 || isCPUTurn() || state.phase === 'gameover';
    elBtnEvoReset.disabled = spending === 0 || isCPUTurn() || state.phase === 'gameover';
  } else if (totalBank > 0) {
    if (elEvoMsg) elEvoMsg.textContent = `所持 ${totalBank}pt 使用可能！味方駒を選び下の「＋」で手番を使って進化できます`;
    elBtnEvoConfirm.disabled = true;
    elBtnEvoReset.disabled = true;
  } else {
    if (elEvoMsg) elEvoMsg.textContent = '敵駒を撃破すると即時進化が発動し、ポイントが貯まります';
    elBtnEvoConfirm.disabled = true;
    elBtnEvoReset.disabled = true;
  }

  // 上側ドック（オフライン2人対戦・後手側）の制御
  if (isPvp && elEvoBoxTop) {
    const isGoteTurn = state.turn === 'gote';
    const goteBank = state.bank.gote;
    const remainingTop = isGoteTurn ? remaining : goteBank;
    const spendingTop = isGoteTurn ? spending : 0;

    if (elEvoRemainingTop) elEvoRemainingTop.textContent = remainingTop;
    if (elEvoSpendingTop) elEvoSpendingTop.textContent = spendingTop;
    const elEvoLabelTop = document.getElementById('evo-label-remaining-top');
    const elEvoSpendingBadgeTop = document.getElementById('evo-spending-badge-top');
    if (elEvoLabelTop) elEvoLabelTop.textContent = spendingTop > 0 ? '残' : '所持';
    if (elEvoSpendingBadgeTop) elEvoSpendingBadgeTop.classList.toggle('hidden', spendingTop === 0);

    elEvoBoxTop.classList.toggle('is-turn-active', isGoteTurn);
    elEvoBoxTop.classList.toggle('is-turn-inactive', !isGoteTurn);
    elEvoBoxTop.classList.toggle('has-points', isGoteTurn && goteBank > 0);
    elEvoBoxTop.classList.toggle('is-allocating', isGoteTurn && spendingTop > 0);

    if (elBtnEvoConfirmTop && elBtnEvoResetTop) {
      if (isGoteTurn && state.phase === 'instant_evo') {
        if (elEvoMsgTop) elEvoMsgTop.textContent = '撃破した霊力を即時配分中！確定するとそのまま相手番へ進みます';
        elBtnEvoConfirmTop.disabled = false;
        elBtnEvoResetTop.disabled = spendingTop === 0;
      } else if (isGoteTurn && spendingTop > 0) {
        if (elEvoMsgTop) elEvoMsgTop.textContent = `${spendingTop}pt 割当中（確定すると1手消費してターン終了）`;
        elBtnEvoConfirmTop.disabled = false;
        elBtnEvoResetTop.disabled = false;
      } else if (isGoteTurn && goteBank > 0) {
        if (elEvoMsgTop) elEvoMsgTop.textContent = `所持 ${goteBank}pt 使用可能！自軍駒を選び「＋」で進化できます`;
        elBtnEvoConfirmTop.disabled = true;
        elBtnEvoResetTop.disabled = true;
      } else if (isGoteTurn) {
        if (elEvoMsgTop) elEvoMsgTop.textContent = '敵駒を撃破すると即時進化が発動し、ポイントが貯まります';
        elBtnEvoConfirmTop.disabled = true;
        elBtnEvoResetTop.disabled = true;
      } else {
        if (elEvoMsgTop) elEvoMsgTop.textContent = '先手の手番中です。思考しながら次手を検討できます';
        elBtnEvoConfirmTop.disabled = true;
        elBtnEvoResetTop.disabled = true;
      }
    }
  }
}

function renderInspector() {
  const piece = state.inspectedPiece;
  elMoveMatrix.innerHTML = '';
  if (elMoveMatrixTop) elMoveMatrixTop.innerHTML = '';

  const elDirHint = document.getElementById('matrix-direction-hint');
  const elDirHintBottom = document.getElementById('matrix-direction-hint-bottom');
  const isPvp = (state.mode === 'pvp');

  if (!piece) {
    elInspKanji.textContent = '？';
    elInspKanji.classList.remove('gote');
    elInspName.textContent = '駒を選択してください';
    if (elInspPoints) elInspPoints.textContent = '持ちポイント: - pt';
    if (elInspTier) elInspTier.textContent = '状態: -';
    elInspOwnerBadge.classList.add('hidden');
    if (elDirHint) {
      elDirHint.textContent = '▲ 進行方向 ▲';
      elDirHint.classList.remove('gote-dir');
    }
    if (elDirHintBottom) {
      elDirHintBottom.classList.add('hidden');
    }

    if (isPvp && elInspKanjiTop) {
      elInspKanjiTop.textContent = '？';
      elInspKanjiTop.classList.add('gote');
      elInspNameTop.textContent = '駒を選択してください';
      if (elInspPointsTop) elInspPointsTop.textContent = '持ちポイント: - pt';
      if (elInspTierTop) elInspTierTop.textContent = '状態: -';
      elInspOwnerBadgeTop.classList.add('hidden');
      if (elDirHintTop) elDirHintTop.textContent = '▲ 進行方向（盤面向き）▲';
      if (elDirHintBottomTop) elDirHintBottomTop.classList.add('hidden');
    }
    return;
  }

  const totalPt = getPieceTotalPt(piece, true);
  const addedPt = totalPt - piece.basePt;
  const innerComplete = isInnerRingComplete(piece, true);

  const isGote = piece.owner === 'gote';
  // プレイヤー視点における敵駒判定（自軍の駒は先手・後手問わず常に上向き▲、敵駒は下向き▼）
  // プレイヤー視点による敵駒判定（自軍の駒は先・後問わずに上、敵は下）
  // PvPの先手ドック（下側）は後手駒（gote）が相手向きとして反転
  const isOpponent = (state.mode === 'pvp')
    ? (piece.owner === 'gote')
    : (piece.owner !== state.playerSide);
  const shouldFlipMatrix = isOpponent;

  elInspKanji.innerHTML = formatPointWithUnderline(getPieceDisplayLabel(piece, true));
  elInspKanji.classList.toggle('gote', isGote);
  elInspName.textContent = addedPt > 0 ? `${piece.name} (+${addedPt}pt)` : piece.name;
  if (elInspPoints) elInspPoints.textContent = '';

  if (elInspTier) elInspTier.textContent = '';

  elInspOwnerBadge.classList.remove('hidden', 'sente-badge', 'gote-badge');
  elInspOwnerBadge.classList.add(piece.owner === 'sente' ? 'sente-badge' : 'gote-badge');
  elInspOwnerBadge.textContent = piece.owner === 'sente' ? '先手' : '後手';

  if (isPvp && elInspKanjiTop) {
    elInspKanjiTop.innerHTML = formatPointWithUnderline(getPieceDisplayLabel(piece, true));
    elInspKanjiTop.classList.toggle('gote', isGote);
    elInspNameTop.textContent = addedPt > 0 ? `${piece.name} (+${addedPt}pt)` : piece.name;
    if (elInspPointsTop) elInspPointsTop.textContent = '';

    if (elInspTierTop) elInspTierTop.textContent = '';
    elInspOwnerBadgeTop.classList.remove('hidden', 'sente-badge', 'gote-badge');
    elInspOwnerBadgeTop.classList.add(piece.owner === 'sente' ? 'sente-badge' : 'gote-badge');
    elInspOwnerBadgeTop.textContent = piece.owner === 'sente' ? '先手' : '後手';

    if (elDirHintTop) {
      if (piece.owner === 'sente') {
        elDirHintTop.textContent = '▼ 進行方向（手前・後手側） ▼';
        elDirHintTop.classList.add('gote-dir');
      } else {
        elDirHintTop.textContent = '▲ 進行方向（盤面奥） ▲';
        elDirHintTop.classList.remove('gote-dir');
      }
    }
    if (elDirHintBottomTop) {
      if (piece.owner === 'sente') {
        elDirHintBottomTop.textContent = '▲ 進行方向 ▲';
        elDirHintBottomTop.classList.remove('hidden');
      } else {
        elDirHintBottomTop.classList.add('hidden');
      }
    }
  }

  // 進行方向ヒントの向きを更新（敵駒なら手前向き▼、自軍駒なら奥向き▲）
  if (elDirHint) {
    if (shouldFlipMatrix) {
      elDirHint.textContent = '▼ 進行方向（手前・自陣向き）▼';
      elDirHint.classList.add('gote-dir');
    } else {
      elDirHint.textContent = '▲ 進行方向（奥・敵陣向き）▲';
      elDirHint.classList.remove('gote-dir');
    }
  }
  if (elDirHintBottom) {
    if (shouldFlipMatrix) {
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
        mCell.innerHTML = formatPointWithUnderline(getPieceDisplayLabel(piece, true));
      } else {
        // 相手駒の場合は盤面の実際の攻撃向きに合わせて上下・左右を反転表示
        const checkDx = shouldFlipMatrix ? -dx : dx;
        const checkDy = shouldFlipMatrix ? -dy : dy;

        const dirX = Math.sign(checkDx);
        const dirY = Math.sign(checkDy);
        const isStraight = (checkDx === 0 || checkDy === 0 || Math.abs(checkDx) === Math.abs(checkDy));
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
          mCell.innerHTML = '<span>+1</span><small style="font-size:0.55rem">取消可</small>';
          mCell.title = 'クリックで割り振りを取り消します';
        } else if (isRay) {
          mCell.classList.add('has-ray');
          mCell.textContent = '∞';
        } else if (rayUpgradable) {
          // 2マス開放済みの外周マス：クリックで走りに昇格可能！
          mCell.classList.add('can-unlock', 'can-ray-upgrade');
          mCell.innerHTML = '<span>覚醒</span>';
          mCell.title = '2マス開放完了！1pt消費してこの方向を「走り(直進無限)」に覚醒！';
        } else if (stepType === 'evolved') {
          mCell.classList.add('has-evolved');
          mCell.textContent = '済';
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

      // 上側（後手視点）ドック用マトリックスセルの生成
      if (isPvp && elMoveMatrixTop) {
        const mCellTop = document.createElement('div');
        mCellTop.className = 'matrix-cell';
        if (ring === 1) mCellTop.classList.add('inner-ring');

        if (dx === 0 && dy === 0) {
          mCellTop.classList.add('center-self');
          if (isGote) mCellTop.classList.add('gote');
          mCellTop.innerHTML = formatPointWithUnderline(getPieceDisplayLabel(piece, true));
        } else {
          // 後手プレイヤーから見て：先手駒なら反転、後手自身の駒なら正対
          const shouldFlipTop = (piece.owner === 'sente');
          const checkDxTop = shouldFlipTop ? -dx : dx;
          const checkDyTop = shouldFlipTop ? -dy : dy;

          const dirXTop = Math.sign(checkDxTop);
          const dirYTop = Math.sign(checkDyTop);
          const isStraightTop = (checkDxTop === 0 || checkDyTop === 0 || Math.abs(checkDxTop) === Math.abs(checkDyTop));
          const is2ndStepTop = isStraightTop && (checkDxTop === dirXTop * 2 && checkDyTop === dirYTop * 2);

          const stepTypeTop = hasStepAt(piece, checkDxTop, checkDyTop, true);
          const isRayTop = hasRayInDir(piece, checkDxTop, checkDyTop, true);
          const isPendingRayTop = state.pendingEvo.some(p => p.pieceId === piece.id && p.type === 'ray' &&
            p.dx === dirXTop && p.dy === dirYTop);
          const unlockableTop = isEditable && remainingPt > 0 && canUnlockCoord(piece, checkDxTop, checkDyTop, true);
          const rayUpgradableTop = isEditable && remainingPt > 0 && is2ndStepTop && canUpgradeToRay(piece, dirXTop, dirYTop, true);

          if (isPendingRayTop && is2ndStepTop) {
            mCellTop.classList.add('pending-unlock');
            mCellTop.innerHTML = '<span>∞覚醒</span><small style="font-size:0.55rem">取消可</small>';
          } else if (isPendingRayTop && ring === 1) {
            mCellTop.classList.add('pending-unlock');
            mCellTop.innerHTML = '<span>∞</span>';
          } else if (stepTypeTop === 'pending') {
            mCellTop.classList.add('pending-unlock');
            mCellTop.innerHTML = '<span>+1</span><small style="font-size:0.55rem">取消可</small>';
          } else if (isRayTop) {
            mCellTop.classList.add('has-ray');
            mCellTop.textContent = '∞';
          } else if (rayUpgradableTop) {
            mCellTop.classList.add('can-unlock', 'can-ray-upgrade');
            mCellTop.innerHTML = '<span>覚醒</span>';
          } else if (stepTypeTop === 'evolved') {
            mCellTop.classList.add('has-evolved');
            mCellTop.textContent = '済';
          } else if (stepTypeTop === 'initial') {
            mCellTop.classList.add('has-step');
            mCellTop.textContent = '●';
          } else if (unlockableTop) {
            mCellTop.classList.add('can-unlock');
            mCellTop.textContent = '＋';
          }

          mCellTop.addEventListener('click', () => onMatrixCellClick(checkDxTop, checkDyTop));
        }
        elMoveMatrixTop.appendChild(mCellTop);
      }
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

// ==========================================
// モード切替・マッチング・エントランス制御
// ==========================================
let currentRankOpponent = null;
let selectedComDiff = 'cpu-normal';
let selectedComSide = 'sente';

function prepareRankMatchModal() {
  const playerRank = getRankInfo(userProfile.rating);
  // レート差 ±35 程度の対戦相手を動的算出
  const delta = Math.floor(Math.random() * 50) - 20;
  const oppRating = Math.max(900, userProfile.rating + delta);
  const oppRank = getRankInfo(oppRating);

  const matched = RANK_OPPONENTS.filter(o => oppRating >= o.minR - 100 && oppRating <= o.maxR + 100);
  const chosen = matched.length > 0
    ? matched[Math.floor(Math.random() * matched.length)]
    : RANK_OPPONENTS[Math.floor(Math.random() * RANK_OPPONENTS.length)];

  // ③ 賞金首（Bounty）判定：相手レートが自分より高い、または確率(35%)で発生
  const isBounty = (oppRating > userProfile.rating + 10) || (Math.random() < 0.35);

  currentRankOpponent = {
    name: chosen.name,
    rating: oppRating,
    rankTitle: oppRank.title,
    isBounty
  };

  const elPlayerRank = document.getElementById('rank-matchup-player-rank');
  const elPlayerRate = document.getElementById('rank-matchup-player-rating');
  const elOppName = document.getElementById('rank-matchup-opp-name');
  const elOppRank = document.getElementById('rank-matchup-opp-rank');
  const elOppRate = document.getElementById('rank-matchup-opp-rating');
  const bountyBanner = document.getElementById('bounty-match-banner');
  const oppTag = document.getElementById('rank-opp-tag');
  const ruleHint = document.getElementById('rank-match-rule-hint');

  if (elPlayerRank) elPlayerRank.textContent = playerRank.title;
  if (elPlayerRate) elPlayerRate.textContent = `R ${userProfile.rating}`;
  if (elOppName) elOppName.textContent = currentRankOpponent.name;
  if (elOppRank) elOppRank.textContent = currentRankOpponent.rankTitle;
  if (elOppRate) elOppRate.textContent = `R ${currentRankOpponent.rating}`;

  if (isBounty) {
    if (bountyBanner) bountyBanner.classList.remove('hidden');
    if (oppTag) {
      oppTag.textContent = '賞金首 TARGET';
      oppTag.style.background = '#ef4444';
      oppTag.style.color = '#fff';
    }
    if (ruleHint) {
      ruleHint.innerHTML = '<span style="color:#f87171;font-weight:800">賞金首マッチ！勝利時：レート大量ボーナス (+46〜+52pt) / 敗北時：通常減少</span>';
    }
  } else {
    if (bountyBanner) bountyBanner.classList.add('hidden');
    if (oppTag) {
      oppTag.textContent = '対戦相手';
      oppTag.style.background = 'rgba(255, 255, 255, 0.08)';
      oppTag.style.color = '#94a3b8';
    }
    if (ruleHint) {
      ruleHint.innerHTML = '<span>勝敗によりレートが変動します（勝：+28pt前後 / 負：-16pt前後）</span>';
    }
  }

  const modal = document.getElementById('modal-rank-match');
  if (modal) modal.classList.remove('hidden');
}

function startRankMatch() {
  const modal = document.getElementById('modal-rank-match');
  if (modal) modal.classList.add('hidden');
  state.mode = 'rank';
  state.rankOpponent = currentRankOpponent;
  // 手番はランダム（先手または後手）
  state.playerSide = Math.random() < 0.5 ? 'sente' : 'gote';
  showScreen('game');
  restartNewGame();
}

function openComSelectModal() {
  const modal = document.getElementById('modal-com-select');
  if (modal) modal.classList.remove('hidden');
}

function startComMatch() {
  const modal = document.getElementById('modal-com-select');
  if (modal) modal.classList.add('hidden');
  state.mode = selectedComDiff;
  state.playerSide = selectedComSide;
  state.rankOpponent = null;
  const elGameMode = document.getElementById('game-mode');
  if (elGameMode) elGameMode.value = selectedComDiff;
  const elPlayerSide = document.getElementById('player-side');
  if (elPlayerSide) elPlayerSide.value = selectedComSide;
  showScreen('game');
  restartNewGame();
}

function startFreeMatch() {
  state.mode = 'pvp';
  state.playerSide = 'sente';
  state.rankOpponent = null;
  const elGameMode = document.getElementById('game-mode');
  if (elGameMode) elGameMode.value = 'pvp';
  showScreen('game');
  restartNewGame();
}

// 称号選択モーダル展開
function openTitleSelectModal() {
  const container = document.getElementById('title-list-container');
  if (!container) return;
  container.innerHTML = '';

  TITLE_DEFS.forEach(def => {
    const isUnlocked = def.cond(userProfile);
    const isEquipped = userProfile.equippedTitle === def.name;

    const card = document.createElement('div');
    card.className = `title-card-item ${isEquipped ? 'active' : ''} ${!isUnlocked ? 'locked' : ''}`;

    let statusHtml = '';
    if (isEquipped) {
      statusHtml = '<span class="title-card-status equipped">セット中</span>';
    } else if (isUnlocked) {
      statusHtml = '<span class="title-card-status unlocked">セット可能</span>';
    } else {
      statusHtml = '<span class="title-card-status locked-badge">未解放</span>';
    }

    card.innerHTML = `
      <div>
        <div class="title-card-name">${def.name}</div>
        <div class="title-card-cond">${def.desc}</div>
      </div>
      <div>${statusHtml}</div>
    `;

    if (isUnlocked && !isEquipped) {
      card.addEventListener('click', () => {
        userProfile.equippedTitle = def.name;
        saveUserProfile();
        renderUserProfile();
        document.getElementById('modal-title-select').classList.add('hidden');
      });
    }

    container.appendChild(card);
  });

  document.getElementById('modal-title-select').classList.remove('hidden');
}

// ==========================================
// ⑤ 戦績証明書（リザルトカード）Canvas描画
// ==========================================
function generateRankCertificateCanvas() {
  const canvas = document.getElementById('cert-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // 1. 背景：World of Demons (百鬼魔道) 和紙・濃墨・金泥グラデーション
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, '#0a0c10');
  bgGrad.addColorStop(0.5, '#131722');
  bgGrad.addColorStop(1, '#08090d');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 金箔散らし（上品な金泥の星屑）
  ctx.fillStyle = 'rgba(212, 175, 55, 0.15)';
  for (let i = 0; i < 40; i++) {
    const gx = ((i * 137) % (w - 40)) + 20;
    const gy = ((i * 241) % (h - 40)) + 20;
    const gr = ((i % 3) + 1);
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. 金箔と漆の二重和枠
  ctx.strokeStyle = 'rgba(198, 160, 82, 0.65)';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.strokeStyle = 'rgba(198, 160, 82, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(18, 18, w - 36, h - 36);

  // 四隅の和風飾り金具
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 3;
  const cLen = 20;
  // 左上
  ctx.beginPath(); ctx.moveTo(14, 14 + cLen); ctx.lineTo(14, 14); ctx.lineTo(14 + cLen, 14); ctx.stroke();
  // 右上
  ctx.beginPath(); ctx.moveTo(w - 14 - cLen, 14); ctx.lineTo(w - 14, 14); ctx.lineTo(w - 14, 14 + cLen); ctx.stroke();
  // 左下
  ctx.beginPath(); ctx.moveTo(14, h - 14 - cLen); ctx.lineTo(14, h - 14); ctx.lineTo(14 + cLen, h - 14); ctx.stroke();
  // 右下
  ctx.beginPath(); ctx.moveTo(w - 14 - cLen, h - 14); ctx.lineTo(w - 14, h - 14); ctx.lineTo(w - 14, h - 14 - cLen); ctx.stroke();

  // 3. タイトルヘッダー（百鬼魔道・墨絵絵巻）
  ctx.fillStyle = '#d4af37';
  ctx.font = 'bold 12px "Noto Serif JP", serif';
  ctx.fillText('SHOGI: MUTATION  —  百鬼変異 公式戦績免状', 36, 46);

  ctx.fillStyle = '#f5f0e6';
  ctx.font = '900 24px "Yuji Boku", "Noto Serif JP", serif';
  ctx.fillText('無法将棋 公式戦績免状', 36, 78);

  // 朱漆の落款印（Hanko Stamp）
  ctx.strokeStyle = '#c93a2b';
  ctx.lineWidth = 2;
  ctx.strokeRect(280, 56, 32, 32);
  ctx.fillStyle = 'rgba(201, 58, 43, 0.15)';
  ctx.fillRect(280, 56, 32, 32);
  ctx.fillStyle = '#c93a2b';
  ctx.font = '900 11px "Yuji Boku", "Noto Serif JP", serif';
  ctx.fillText('公認', 285, 76);

  ctx.fillStyle = '#fde68a';
  ctx.font = 'bold 15px "Noto Serif JP", serif';
  ctx.fillText(`棋士名: ${userProfile.name || '名無し棋士'} 殿`, 36, 108);

  // プレイヤー称号
  ctx.fillStyle = 'rgba(212, 175, 55, 0.15)';
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 1;
  const titleText = `${userProfile.equippedTitle}`;
  ctx.font = 'bold 12px "Noto Serif JP", serif';
  const titleWidth = ctx.measureText(titleText).width + 18;
  ctx.fillRect(36, 118, titleWidth, 24);
  ctx.strokeRect(36, 118, titleWidth, 24);
  ctx.fillStyle = '#fef08a';
  ctx.fillText(titleText, 45, 134);

  // 4. レーティング＆段位（大文字）
  const rankInfo = getRankInfo(userProfile.rating);
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 12px -apple-system, sans-serif';
  ctx.fillText('CURRENT TIER', 36, 155);

  ctx.fillStyle = '#fde68a';
  ctx.font = '900 46px -apple-system, sans-serif';
  ctx.fillText(rankInfo.title, 36, 202);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 12px -apple-system, sans-serif';
  ctx.fillText('OFFICIAL RATING', 210, 155);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '900 46px -apple-system, sans-serif';
  ctx.fillText(`${userProfile.rating} R`, 210, 202);

  // 5. 通算戦績ブロック
  const total = userProfile.wins + userProfile.losses;
  const winRate = total > 0 ? Math.round((userProfile.wins / total) * 100) : 0;
  const sInfo = getSeasonInfo();

  ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(36, 230, 430, 180);
  ctx.strokeRect(36, 230, 430, 180);

  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 15px -apple-system, sans-serif';
  ctx.fillText(`通算戦績:  ${userProfile.wins}勝 ${userProfile.losses}敗  (勝率 ${winRate}%)`, 54, 266);
  ctx.fillText(`最高連勝記録:  ${userProfile.maxStreak} 連勝`, 54, 302);
  ctx.fillText(`賞金首討伐実績:  ${userProfile.bountiesClaimed || 0} 体`, 54, 338);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 13px -apple-system, sans-serif';
  ctx.fillText(`参加シーズン:  ${sInfo.year} 第${sInfo.seasonNumber}期 週間シーズン`, 54, 384);

  // 6. 右側：代表変異駒の5x5マトリックス図面
  // 本局の味方最強駒、または高pt駒を取得
  let repPiece = null;
  const allyList = getAllAllyPieces(state.board, state.playerSide);
  if (allyList.length > 0) {
    allyList.sort((a, b) => getPieceTotalPt(b.piece) - getPieceTotalPt(a.piece));
    repPiece = allyList[0].piece;
  }

  const rightBoxX = 490;
  ctx.fillStyle = 'rgba(18, 22, 32, 0.95)';
  ctx.strokeStyle = 'rgba(198, 160, 82, 0.45)';
  ctx.fillRect(rightBoxX, 48, 314, 362);
  ctx.strokeRect(rightBoxX, 48, 314, 362);

  ctx.fillStyle = '#e5be59';
  ctx.font = 'bold 12px "Noto Serif JP", serif';
  ctx.fillText('FEATURED MUTATION UNIT — 秘伝陣形図', rightBoxX + 16, 74);

  const pieceName = repPiece ? `${repPiece.name} (${getPieceTotalPt(repPiece)}pt)` : '無法の歩兵 (8pt)';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px -apple-system, sans-serif';
  ctx.fillText(pieceName, rightBoxX + 16, 100);

  // 5x5 ミニマトリックス描画
  const mStartX = rightBoxX + 38;
  const mStartY = 130;
  const mCellSz = 46;

  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const cx = mStartX + (dx + 2) * mCellSz;
      const cy = mStartY + (dy + 2) * mCellSz;

      if (dx === 0 && dy === 0) {
        ctx.fillStyle = '#1e3a8a';
        ctx.strokeStyle = '#38bdf8';
        ctx.fillRect(cx + 2, cy + 2, mCellSz - 4, mCellSz - 4);
        ctx.strokeRect(cx + 2, cy + 2, mCellSz - 4, mCellSz - 4);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(repPiece ? repPiece.kanji : '歩', cx + mCellSz / 2, cy + mCellSz / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      } else {
        const isRay = repPiece ? hasRayInDir(repPiece, dx, dy, true) : false;
        const stepType = repPiece ? hasStepAt(repPiece, dx, dy, true) : 'none';

        if (isRay) {
          ctx.fillStyle = 'rgba(6, 182, 212, 0.35)';
          ctx.strokeStyle = '#06b6d4';
          ctx.fillRect(cx + 2, cy + 2, mCellSz - 4, mCellSz - 4);
          ctx.strokeRect(cx + 2, cy + 2, mCellSz - 4, mCellSz - 4);
          ctx.fillStyle = '#06b6d4';
          ctx.font = 'bold 16px -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('∞', cx + mCellSz / 2, cy + mCellSz / 2);
        } else if (stepType === 'evolved') {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
          ctx.strokeStyle = '#f59e0b';
          ctx.fillRect(cx + 2, cy + 2, mCellSz - 4, mCellSz - 4);
          ctx.strokeRect(cx + 2, cy + 2, mCellSz - 4, mCellSz - 4);
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 14px -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('済', cx + mCellSz / 2, cy + mCellSz / 2);
        } else if (stepType === 'initial') {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
          ctx.fillRect(cx + 2, cy + 2, mCellSz - 4, mCellSz - 4);
          ctx.strokeRect(cx + 2, cy + 2, mCellSz - 4, mCellSz - 4);
          ctx.fillStyle = '#34d399';
          ctx.font = 'bold 12px -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('●', cx + mCellSz / 2, cy + mCellSz / 2);
        } else {
          ctx.fillStyle = 'rgba(30, 41, 59, 0.4)';
          ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
          ctx.fillRect(cx + 2, cy + 2, mCellSz - 4, mCellSz - 4);
          ctx.strokeRect(cx + 2, cy + 2, mCellSz - 4, mCellSz - 4);
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    }
  }

  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px -apple-system, sans-serif';
  ctx.fillText('初期 / 変異済 / 直進無限', rightBoxX + 46, 392);

  // 7. フッターURL
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.fillText('shogi.pop-ghost.com  |  無法将棋 MUTATION', 36, 442);
}

function openCertModal() {
  generateRankCertificateCanvas();
  const modal = document.getElementById('modal-cert-card');
  if (modal) modal.classList.remove('hidden');
}

//  でカードをシェア（Web Share API / Twitter Intent 連動）
async function shareCertImage() {
  const canvas = document.getElementById('cert-canvas');
  if (!canvas) return;

  const rankInfo = getRankInfo(userProfile.rating);
  const tweetText = `『無法将棋』公式戦績証明書！\n段位: ${rankInfo.title} (${userProfile.rating} R) | 称号: ${userProfile.equippedTitle}\n最高連勝:  ${userProfile.maxStreak}連勝 | 賞金首:  ${userProfile.bountiesClaimed || 0}体討伐\n駒を変異・進化させて戦う新感覚Web将棋！\n#無法将棋 #将棋`;
  const shareUrl = 'https://shogi.pop-ghost.com/';

  // 1. Web Share APIで画像直接共有を試行
  if (navigator.share && canvas.toBlob) {
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], `muhou_shogi_rank_${userProfile.rating}R.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: '無法将棋 公式戦績証明書',
          text: tweetText,
          url: shareUrl,
          files: [file]
        });
        return;
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Web Share failed, falling back:', err);
      } else {
        return;
      }
    }
  }

  // 2. フォールバック: 画像を自動保存し、Twitter Web Intentを開く
  downloadCertImage();
  const twitterIntent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`;
  window.open(twitterIntent, '_blank', 'noopener,noreferrer');
}

function downloadCertImage() {
  const canvas = document.getElementById('cert-canvas');
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = `muhou_shogi_rank_${userProfile.rating}R.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// イベントリスナー登録
document.getElementById('btn-restart').addEventListener('click', restartNewGame);
document.getElementById('btn-undo').addEventListener('click', undoMove);

// 効果音ボタンの初期化 & リスナー登録
const btnSoundToggle = document.getElementById('btn-sound-toggle');
const soundToggleIcon = document.getElementById('sound-toggle-icon');

function updateSoundButtonUI() {
  if (!btnSoundToggle || !soundToggleIcon) return;
  const enabled = SoundSystem.isEnabled();
  soundToggleIcon.textContent = enabled ? '音 ON' : '音 OFF';
  btnSoundToggle.classList.toggle('is-active', enabled);
  btnSoundToggle.title = enabled ? '効果音: ON（タップでミュート）' : '効果音: OFF（タップで有効化）';
}

if (btnSoundToggle) {
  updateSoundButtonUI();
  btnSoundToggle.addEventListener('click', () => {
    SoundSystem.toggle();
    updateSoundButtonUI();
  });
}

// 盤面背景・余白・ラベルタップによるスマート選択解除（UI/UXガイドライン Rule 1.2準拠）
document.addEventListener('click', (e) => {
  if (!state.selectedCell) return;
  // board-cellまたはその子要素(piece)、インスペクター、ボタンをクリックした場合は各処理で扱われるため除外
  if (e.target.closest('.board-cell') || e.target.closest('.evolution-inspector-dock') || e.target.closest('.btn') || e.target.closest('button')) {
    return;
  }
  // 盤面外枠、余白、ラベル、プレイヤーバーなどをタップした場合は即座に選択解除
  state.selectedCell = null;
  state.validMoves = [];
  state.guardSquares = [];
  renderAll();
});

// ブラウザ標準のドラッグ・テキスト選択による青色範囲ハイライト誤爆を根絶
document.addEventListener('selectstart', (e) => {
  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
  }
});
document.addEventListener('dragstart', (e) => {
  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
  }
});


const elGameMode = document.getElementById('game-mode');
if (elGameMode) {
  elGameMode.addEventListener('change', () => {
    state.mode = elGameMode.value;
    restartNewGame();
  });
}

const elPlayerSide = document.getElementById('player-side');
if (elPlayerSide) {
  elPlayerSide.addEventListener('change', () => {
    state.playerSide = elPlayerSide.value;
    restartNewGame();
  });
}

elBtnEvoReset.addEventListener('click', resetEvolutionPending);
elBtnEvoConfirm.addEventListener('click', confirmEvolutionTurn);
if (elBtnEvoResetTop) elBtnEvoResetTop.addEventListener('click', resetEvolutionPending);
if (elBtnEvoConfirmTop) elBtnEvoConfirmTop.addEventListener('click', confirmEvolutionTurn);

// ランキングタブ切り替え
const tabTopBtn = document.getElementById('tab-ranking-top');
const tabNearBtn = document.getElementById('tab-ranking-near');
const tabRivalsBtn = document.getElementById('tab-ranking-rivals');

if (tabTopBtn) {
  tabTopBtn.addEventListener('click', () => {
    currentRankingTab = 'top';
    renderSeasonAndRanking();
  });
}
if (tabNearBtn) {
  tabNearBtn.addEventListener('click', () => {
    currentRankingTab = 'near';
    renderSeasonAndRanking();
  });
}
if (tabRivalsBtn) {
  tabRivalsBtn.addEventListener('click', () => {
    currentRankingTab = 'rivals';
    renderSeasonAndRanking();
  });
}

// エントランス・モードカードクリック
const btnModeRank = document.getElementById('btn-mode-rank');
if (btnModeRank) {
  btnModeRank.addEventListener('click', () => {
    if (window.MuhouOnline) {
      window.MuhouOnline.startRankMatchmaking();
    }
  });
}

const btnModeCom = document.getElementById('btn-mode-com');
if (btnModeCom) btnModeCom.addEventListener('click', openComSelectModal);

const btnModeFree = document.getElementById('btn-mode-free');
if (btnModeFree) btnModeFree.addEventListener('click', startFreeMatch);

// ランクマッチモーダル
const btnStartRank = document.getElementById('btn-start-rank-match');
if (btnStartRank) btnStartRank.addEventListener('click', startRankMatch);

const btnCloseRank = document.getElementById('btn-close-rank-modal');
if (btnCloseRank) {
  btnCloseRank.addEventListener('click', () => {
    document.getElementById('modal-rank-match').classList.add('hidden');
  });
}

// COM選択モーダル
const btnStartCom = document.getElementById('btn-start-com-match');
if (btnStartCom) btnStartCom.addEventListener('click', startComMatch);

const btnCloseCom = document.getElementById('btn-close-com-select');
if (btnCloseCom) {
  btnCloseCom.addEventListener('click', () => {
    document.getElementById('modal-com-select').classList.add('hidden');
  });
}

// COM選択ピルボタンのクリック挙動
const diffPills = document.querySelectorAll('#com-difficulty-pills .pill-btn');
diffPills.forEach(pill => {
  pill.addEventListener('click', () => {
    diffPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    selectedComDiff = pill.dataset.diff || 'cpu-normal';
  });
});

const sidePills = document.querySelectorAll('#com-side-pills .pill-btn');
sidePills.forEach(pill => {
  pill.addEventListener('click', () => {
    sidePills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    selectedComSide = pill.dataset.side || 'sente';
  });
});


// ユーザーネーム編集モーダル関連
function openNameEditModal() {
  const modal = document.getElementById('modal-name-edit');
  const input = document.getElementById('input-user-name');
  const err = document.getElementById('name-error-msg');
  if (!modal || !input) return;
  input.value = userProfile.name || '';
  if (err) {
    err.textContent = '';
    err.classList.add('hidden');
  }
  modal.classList.remove('hidden');
  setTimeout(() => input.focus(), 50);
}

function closeNameEditModal() {
  const modal = document.getElementById('modal-name-edit');
  if (modal) modal.classList.add('hidden');
}

function handleSaveUserName() {
  const input = document.getElementById('input-user-name');
  const err = document.getElementById('name-error-msg');
  if (!input) return;
  const res = validateUserName(input.value);
  if (!res.valid) {
    if (err) {
      err.textContent = res.error;
      err.classList.remove('hidden');
    }
    return;
  }
  userProfile.name = res.name;
  saveUserProfile();
  renderUserProfile();
  updatePlayerNames();
  closeNameEditModal();
  showToast(`ユーザーネームを「${res.name}」に変更しました`);
}

const btnChangeName = document.getElementById('btn-change-name');
if (btnChangeName) btnChangeName.addEventListener('click', openNameEditModal);

const btnCloseNameModal = document.getElementById('btn-close-name-modal');
if (btnCloseNameModal) btnCloseNameModal.addEventListener('click', closeNameEditModal);

const btnSaveUserName = document.getElementById('btn-save-user-name');
if (btnSaveUserName) btnSaveUserName.addEventListener('click', handleSaveUserName);

const inputUserName = document.getElementById('input-user-name');
if (inputUserName) {
  inputUserName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveUserName();
    }
  });
}

// 称号選択モーダル関連
const btnChangeTitle = document.getElementById('btn-change-title');
if (btnChangeTitle) btnChangeTitle.addEventListener('click', openTitleSelectModal);

const btnCloseTitleModal = document.getElementById('btn-close-title-modal');
if (btnCloseTitleModal) {
  btnCloseTitleModal.addEventListener('click', () => {
    document.getElementById('modal-title-select').classList.add('hidden');
  });
}

// 戦績証明書モーダル関連
const btnOpenCert = document.getElementById('btn-open-cert');
if (btnOpenCert) btnOpenCert.addEventListener('click', openCertModal);

const btnGameoverCert = document.getElementById('btn-gameover-cert');
if (btnGameoverCert) btnGameoverCert.addEventListener('click', openCertModal);

const btnCloseCertModal = document.getElementById('btn-close-cert-modal');
if (btnCloseCertModal) {
  btnCloseCertModal.addEventListener('click', () => {
    document.getElementById('modal-cert-card').classList.add('hidden');
  });
}

const btnCertShareX = document.getElementById('btn-cert-share-x');
if (btnCertShareX) btnCertShareX.addEventListener('click', shareCertImage);

const btnCertDownload = document.getElementById('btn-cert-download');
if (btnCertDownload) btnCertDownload.addEventListener('click', downloadCertImage);

// エントランス補助ボタン
const btnResume = document.getElementById('btn-resume-game');
if (btnResume) {
  btnResume.addEventListener('click', () => {
    showScreen('game');
  });
}

const btnEntranceRules = document.getElementById('btn-entrance-rules');
if (btnEntranceRules) {
  btnEntranceRules.addEventListener('click', () => {
    document.getElementById('rules-modal').classList.remove('hidden');
  });
}

const btnEntranceAbout = document.getElementById('btn-entrance-about');
if (btnEntranceAbout) {
  btnEntranceAbout.addEventListener('click', () => {
    const rulesModal = document.getElementById('rules-modal');
    if (rulesModal) rulesModal.classList.remove('hidden');
  });
}

const btnFooterRules = document.getElementById('btn-footer-rules');
if (btnFooterRules) {
  btnFooterRules.addEventListener('click', () => {
    const rulesModal = document.getElementById('rules-modal');
    if (rulesModal) rulesModal.classList.remove('hidden');
  });
}

// 対局画面からタイトルへ戻るボタン
const btnBackEntrance = document.getElementById('btn-back-entrance');
if (btnBackEntrance) {
  btnBackEntrance.addEventListener('click', () => {
    saveGameToStorage();
    showScreen('entrance');
  });
}

const btnGameoverEntrance = document.getElementById('btn-gameover-entrance');
if (btnGameoverEntrance) {
  btnGameoverEntrance.addEventListener('click', () => {
    document.getElementById('gameover-modal').classList.add('hidden');
    showScreen('entrance');
  });
}

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
    const resultText = isWin ? '勝利しました！' : '対局終了';
    const rankInfo = getRankInfo(userProfile.rating);
    const modeText = state.mode === 'rank' ? ` [ランクマッチ ${rankInfo.title} R${userProfile.rating}]` : '';
    const tweetText = `『無法将棋』で${resultText}${modeText}（${state.movesCount}手 / 軍勢: 先手${sentePt}pt vs 後手${gotePt}pt）\n駒を自由に変異・進化させて戦う新感覚Web将棋！\n#無法将棋 #将棋`;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent('https://shogi.pop-ghost.com/')}`;
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  });
}

const btnCloseEnemyEvo = document.getElementById('btn-close-enemy-evo');
if (btnCloseEnemyEvo) {
  btnCloseEnemyEvo.addEventListener('click', hideEnemyEvolutionNotification);
}

// 初回起動処理
loadUserProfile();
const hasSavedGame = loadGameFromStorage();
if (!hasSavedGame) {
  initGame();
}
// プレイ途中のリロード時は何事もなかったかのように直前の対局画面を即時復元
if (hasSavedGame && state.wasInGameScreen && state.phase === 'play' && state.movesCount > 0) {
  showScreen('game');
} else {
  showScreen('entrance');
}

// ==========================================
// オンライン対戦（Firebase）UIリスナー
// ==========================================
const btnModeOnline = document.getElementById('btn-mode-online');
if (btnModeOnline) {
  btnModeOnline.addEventListener('click', () => {
    document.getElementById('modal-online-select').classList.remove('hidden');
  });
}

const btnCloseOnlineModal = document.getElementById('btn-close-online-modal');
if (btnCloseOnlineModal) {
  btnCloseOnlineModal.addEventListener('click', () => {
    document.getElementById('modal-online-select').classList.add('hidden');
  });
}

const btnOnlineQuick = document.getElementById('btn-online-quick');
if (btnOnlineQuick) {
  btnOnlineQuick.addEventListener('click', () => {
    document.getElementById('modal-online-select').classList.add('hidden');
    if (window.MuhouOnline) window.MuhouOnline.startQuickMatchmaking();
  });
}

const btnCancelMatchmaking = document.getElementById('btn-cancel-matchmaking');
if (btnCancelMatchmaking) {
  btnCancelMatchmaking.addEventListener('click', () => {
    if (window.MuhouOnline) window.MuhouOnline.cancelMatchmaking();
  });
}

const btnOnlineCreateFriend = document.getElementById('btn-online-create-friend');
if (btnOnlineCreateFriend) {
  btnOnlineCreateFriend.addEventListener('click', () => {
    document.getElementById('modal-online-select').classList.add('hidden');
    if (window.MuhouOnline) window.MuhouOnline.createFriendRoom();
  });
}

const btnCancelFriendWaiting = document.getElementById('btn-cancel-friend-waiting');
if (btnCancelFriendWaiting) {
  btnCancelFriendWaiting.addEventListener('click', () => {
    if (window.MuhouOnline) window.MuhouOnline.hideFriendModal();
  });
}

const btnOnlineJoinFriend = document.getElementById('btn-online-join-friend');
if (btnOnlineJoinFriend) {
  btnOnlineJoinFriend.addEventListener('click', () => {
    const inputCode = document.getElementById('input-room-code');
    if (inputCode && inputCode.value) {
      if (window.MuhouOnline) window.MuhouOnline.joinFriendRoom(inputCode.value);
    } else {
      alert('合言葉（4桁の数字）を入力してください');
    }
  });
}



const btnCopyFriendLink = document.getElementById('btn-copy-friend-link');
if (btnCopyFriendLink) {
  btnCopyFriendLink.addEventListener('click', () => {
    const codeEl = document.getElementById('friend-room-code-display');
    const code = codeEl ? codeEl.textContent.trim() : '';
    if (code && code !== '----') {
      const inviteUrl = `https://shogi.pop-ghost.com/?room=${code}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(inviteUrl).then(() => {
          alert(`招待リンクをコピーしました！友達に送信してください:\n${inviteUrl}`);
        }).catch(() => {
          prompt('招待リンクをコピーしてください:', inviteUrl);
        });
      } else {
        prompt('招待リンクをコピーしてください:', inviteUrl);
      }
    }
  });
}


// ==========================================
// 【防御レベル1】P2P相互着手・進化検証エンジン
// ==========================================

function validateRemoteMove(fromR, fromC, toR, toC, remoteSide) {
  if (state.phase !== 'play') {
    return { valid: false, reason: '現在対局フェーズではありません' };
  }
  if (state.turn !== remoteSide) {
    return { valid: false, reason: '手番ではないプレイヤーからの着手です' };
  }
  if (!Number.isInteger(fromR) || !Number.isInteger(fromC) || !Number.isInteger(toR) || !Number.isInteger(toC)) {
    return { valid: false, reason: '着手座標が整数ではありません' };
  }
  if (fromR < 0 || fromR >= BOARD_SIZE || fromC < 0 || fromC >= BOARD_SIZE ||
      toR < 0 || toR >= BOARD_SIZE || toC < 0 || toC >= BOARD_SIZE) {
    return { valid: false, reason: '盤面範囲外への不正な移動です' };
  }
  const piece = state.board[fromR][fromC];
  if (!piece) {
    return { valid: false, reason: '指定された移動元に駒が存在しません' };
  }
  if (piece.owner !== remoteSide) {
    return { valid: false, reason: '自軍以外の駒を移動させることはできません' };
  }
  const validMoves = getValidMovesForPiece(state.board, fromR, fromC);
  const isMoveLegal = validMoves.some(m => {
    const mr = Array.isArray(m) ? m[0] : m.r;
    const mc = Array.isArray(m) ? m[1] : m.c;
    return mr === toR && mc === toC;
  });
  if (!isMoveLegal) {
    return { valid: false, reason: 'ルール上移動不可能な位置への着手です' };
  }
  return { valid: true };
}

function validateRemoteEvolution(pendingList, spendingPt, remoteSide) {
  if (state.phase !== 'play' && state.phase !== 'remote_evo') {
    return { valid: false, reason: '現在対局中ではありません' };
  }
  if (state.turn !== remoteSide) {
    return { valid: false, reason: '手番ではないプレイヤーからの進化です' };
  }
  if (!Number.isInteger(spendingPt) || spendingPt < 0) {
    return { valid: false, reason: '消費ポイントが不正です' };
  }
  if (spendingPt > state.bank[remoteSide]) {
    return { valid: false, reason: `所持ポイント(${state.bank[remoteSide]}pt)を超過する消費(${spendingPt}pt)です` };
  }
  if (!Array.isArray(pendingList)) {
    return { valid: false, reason: '進化データが配列ではありません' };
  }
  if (spendingPt !== pendingList.length) {
    return { valid: false, reason: '消費ポイントと進化指定数が一致しません' };
  }

  // 0ptパス（スキップ）の場合は合格
  if (pendingList.length === 0) {
    return { valid: true };
  }

  // 駒ごとのシミュレーションによる厳格な逐次適法性チェック
  const simulatedPieces = new Map();
  for (let i = 0; i < pendingList.length; i++) {
    const item = pendingList[i];
    if (!item || (typeof item.pieceId !== 'string' && typeof item.pieceId !== 'number')) {
      return { valid: false, reason: '進化データの形式が不正です' };
    }
    let simPiece = simulatedPieces.get(item.pieceId);
    if (!simPiece) {
      const found = findPieceById(state.board, item.pieceId);
      if (!found) {
        return { valid: false, reason: '盤面に存在しない駒への進化指定です' };
      }
      if (found.piece.owner !== remoteSide) {
        return { valid: false, reason: '相手軍の駒を進化させることはできません' };
      }
      if (found.piece.type === 'ou') {
        return { valid: false, reason: '王将は進化できません' };
      }
      // クローンを作成して段階検証
      simPiece = JSON.parse(JSON.stringify(found.piece));
      if (!simPiece.evolvedSteps) simPiece.evolvedSteps = [];
      if (!simPiece.evolvedRays) simPiece.evolvedRays = [];
      simulatedPieces.set(item.pieceId, simPiece);
    }

    const { dx, dy, type } = item;
    if (!Number.isInteger(dx) || !Number.isInteger(dy)) {
      return { valid: false, reason: '進化相対座標が整数ではありません' };
    }
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2 || (dx === 0 && dy === 0)) {
      return { valid: false, reason: '進化相対座標が許容範囲外です' };
    }

    if (type === 'ray') {
      if (!canUpgradeToRay(simPiece, dx, dy, false)) {
        return { valid: false, reason: `大駒直線化の条件を満たしていません (dx:${dx}, dy:${dy})` };
      }
      simPiece.evolvedRays.push([dx, dy]);
    } else {
      if (!canUnlockCoord(simPiece, dx, dy, false)) {
        return { valid: false, reason: `指定座標への進化は不可能です (dx:${dx}, dy:${dy})` };
      }
      simPiece.evolvedSteps.push([dx, dy]);
    }
  }

  return { valid: true };
}

function executeRemoteMove(fromR, fromC, toR, toC, remoteSide) {
  const check = validateRemoteMove(fromR, fromC, toR, toC, remoteSide);
  if (!check.valid) {
    return check;
  }
  executeMove(fromR, fromC, toR, toC, false);
  return { valid: true };
}

function executeRemoteEvolution(pendingList, spendingPt, evoLogs, remoteSide) {
  const check = validateRemoteEvolution(pendingList, spendingPt, remoteSide);
  if (!check.valid) {
    return check;
  }

  if (typeof spendingPt === 'number' && spendingPt > 0) {
    state.bank[remoteSide] = Math.max(0, state.bank[remoteSide] - spendingPt);
  }

  if (Array.isArray(pendingList) && pendingList.length > 0) {
    applyRemoteEvolution(pendingList, remoteSide);
  }

  if (Array.isArray(evoLogs) && evoLogs.length > 0) {
    showEnemyEvolutionNotification(evoLogs);
  }

  state.phase = 'play';
  state.pendingEvo = [];
  endTurn();
  return { valid: true };
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

// 人間対局時の賞金首判定（連勝中・格上高段位・高勝率・歴戦の討伐者）
function evaluateHumanBounty(opp) {
  if (!opp) return { isBounty: false, reason: '' };

  const streak = Number.isInteger(opp.streak) ? opp.streak : 0;
  const rating = typeof opp.rating === 'number' ? opp.rating : 1200;
  const wins = Number.isInteger(opp.wins) ? opp.wins : 0;
  const losses = Number.isInteger(opp.losses) ? opp.losses : 0;
  const total = wins + losses;
  const winRate = total > 0 ? (wins / total) : 0;
  const bounties = Number.isInteger(opp.bountiesClaimed) ? opp.bountiesClaimed : 0;

  // 条件1: 連勝中の強敵 (2連勝以上)
  if (streak >= 2) {
    return { isBounty: true, reason: `${streak}連勝中` };
  }
  // 条件2: 格上・高段位の猛者 (自分より50pt以上高い、またはR1400以上)
  if (rating >= userProfile.rating + 50) {
    return { isBounty: true, reason: `格上実力者 (R${rating})` };
  }
  if (rating >= 1400) {
    return { isBounty: true, reason: `高段位棋士 (R${rating})` };
  }
  // 条件3: 5勝以上かつ勝率60%以上の猛者
  if (wins >= 5 && winRate >= 0.6) {
    return { isBounty: true, reason: `高勝率猛者 (勝率${Math.round(winRate * 100)}%)` };
  }
  // 条件4: 歴戦の賞金狩り (2回以上討伐実績)
  if (bounties >= 2) {
    return { isBounty: true, reason: `歴戦の賞金狩り (${bounties}回討伐)` };
  }

  return { isBounty: false, reason: '' };
}

function startOnlineGameSession(mySide, oppPlayer, mode = 'online') {
  state.mode = mode;
  state.playerSide = mySide;
  state.onlineOpponent = oppPlayer || {
    name: '通信相手',
    title: '全国の猛者',
    rank: '初段',
    rating: 1200,
    streak: 0,
    maxStreak: 0,
    wins: 0,
    losses: 0,
    bountiesClaimed: 0
  };

  if (mode === 'rank') {
    const bountyResult = evaluateHumanBounty(state.onlineOpponent);
    state.onlineOpponent.isBounty = bountyResult.isBounty;
    state.onlineOpponent.bountyReason = bountyResult.reason;
    state.rankOpponent = state.onlineOpponent;
  } else {
    state.rankOpponent = null;
  }

  showScreen('game');
  restartNewGame();
}

// ==========================================
// 【防御レベル2】不変（Frozen）ゲームエンジン公開ブリッジ
// ==========================================
  const btnCloseInstantEvo = document.getElementById('btn-close-instant-evo');
  if (btnCloseInstantEvo) btnCloseInstantEvo.addEventListener('click', closeInstantEvolutionModal);
  const instantEvoModal = document.getElementById('instant-evo-modal');
  if (instantEvoModal) instantEvoModal.addEventListener('click', (e) => {
    if (e.target === instantEvoModal || e.target.closest('#btn-close-instant-evo')) {
      closeInstantEvolutionModal();
    }
  });

window.MuhouEngine = Object.freeze({
  validateRemoteMove,
  validateRemoteEvolution,
  executeRemoteMove,
  executeRemoteEvolution,
  startOnlineGameSession,
  endGame,
  isGameOver: () => state.phase === 'gameover',
  getUserProfile: () => ({ ...userProfile }),
  getRankInfo,
  validateUserName,
  renderAll,
  showScreen,
  renderSeasonAndRanking,
  recordRivalPlayer,
  loadRivalPlayers,
  getState: () => state,
  executeMove,
  addBattleLog: addLog,
  getSoundSystem: () => SoundSystem
});

})();