// ==========================================
// Firebase 設定管理モジュール
// ==========================================

// デフォルトのFirebase構成
// ユーザーがプロジェクト作成後、ここに値を貼り付けるか、
// またはアプリ内の「Firebase設定」画面から保存できます。
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const FIREBASE_STORAGE_KEY = 'muhou_shogi_firebase_config_v1';

function getFirebaseConfig() {
  try {
    const saved = localStorage.getItem(FIREBASE_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.apiKey && parsed.databaseURL) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to read firebase config from storage:', e);
  }
  return DEFAULT_FIREBASE_CONFIG;
}

function saveFirebaseConfig(config) {
  try {
    localStorage.setItem(FIREBASE_STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch (e) {
    console.error('Failed to save firebase config:', e);
    return false;
  }
}

function isFirebaseConfigured() {
  const config = getFirebaseConfig();
  return Boolean(config && config.apiKey && config.databaseURL);
}
