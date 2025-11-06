// constants.js

const APP_NAME = "Mebuki2Bouyomi";

// 設定画面のデフォルト値
const SETTINGS_PARAMS = {
  // ポート番号のデフォルト
  BOUYOMI_PORT_DEFAULT: 50080,
  
  // chrome.storage.local のデフォルト値
  DEFAULT: {
    // [簡易表示パネルの表示可否]
    visiblePanel: true,

    // [配信支援機能の可否]
    enableStream: false,

    // [読み上げ設定]
    readingStartPosition: "0", // 0:新着, 1:最初から, 2:指定レス
    autoStartKeywordByTitle: "",
    autoStartKeywordByBody: "",
    bouyomiPort: 50080,
    startText: "スレッドの読み上げを開始します",
    endText: "スレッドの読み上げを停止します",
    readSpoiler: false,
    ignoreNewlines: false,
    ignoreKita: true,
    threadClosedText: "スレッドが落ちました", // スレ落ち時
    
    // [ファイル保存設定]
    autoSaveKeywordByTitle: "",
    autoSaveKeywordByBody: "",
    fileSavePath: "files/${thread_id}",
    saveJpg: true,
    saveGif: true,
    savePng: true,
    saveWebp: true,
    saveSpoilerImages: false,
    fileSaveStartText: "ファイルの自動保存を開始します",
    fileSaveEndText: "ファイルの自動保存を停止します",
    fileSaveNotificationText: "ファイルを保存しました",

    // [配信支援設定]
    saveThreadId: false,
    oneCommeAutoStartKeywordByTitle: "",
    oneCommeAutoStartKeywordByBody: "",
    oneCommeId: "",
    oneCommeStartText: "わんコメ連携を開始します",
    oneCommeEndText: "わんコメ連携を停止します",
    oneCommeReadSpoiler: false,
    oneCommeIgnoreNewlines: false,
    oneCommeIgnoreKita: true,
    oneCommeName: "めぶっきー",
    oneCommeThreadClosedText: "スレッドが落ちました", // スレ落ち時

    // [NG設定]
    enableNgFilter: true,
    ngWords: []
    
  }
};

// デフォルト表示タブ
const DEFAULT_TAB_TARGET_BLOCK = "settingTabDownload";

// タブごとの状態のデフォルト値
const TAB_STATE_DEFAULT = {
  readingStartPosition: "0", // "以降の新着レスのみ"
  startReadingResNumber: "" // 指定レス番号
};

// ファイル保存先 親ディレクトリパス（固定）
const DIR_AUTO_SAVE = "mebuki_auto_save/";

// 配信支援機能関連
const STREAM_PARAMS = {
  FILE_TXT_THREAD_ID: "mebuki_thread_id.txt",  // スレッドID保存ファイル名  
  ONECOMME_EXTENTION_ID: "mebuki2onecomme_system",
  ONECOMME_EXTENTION_NAME: "Mebuki2Bouyomi",
  ONECOMME_USER_ID: "mebuki2onecomme_user",
  ONECOMME_REPLACE_IMG_TEXT: "${{oneCommeImg}}",
  ONECOMME_REPLACE_BR_TEXT: "${{oneCommeBr}}",
  ONECOMME_URL: "http://localhost:11180/api/comments",  // わんコメPOSTリクエスト送信先
  ONECOMME_PROFILE_IMAGE: "https://raw.githubusercontent.com/unkmn/Mebuki2Bouyomi/refs/heads/main/src/images/mebuki.png" // 発言者アイコン
}

// URL関連
const URL_PARAM = {
  MEBUKI_PARENT: "https://mebuki.moe/",
  MEBUKI_THREAD: "https://mebuki.moe/app/t/"
};

// 連携失敗時エラーメッセージ
const SEND_FAILED_MESSAGES = {
  BOUYOMI: "【Mebuki2Bouyomi - エラー】\n棒読みちゃんとの連携に失敗しました。",
  ONECOMME: "【Mebuki2Bouyomi - エラー】\nわんコメとの連携に失敗しました。",
}

// セレクタ
const SELECTORS = {
  // スレッド/レス
  PAGE_HEADER_ROOT: 'header.pt-safe', //ページヘッダー
  THREAD_HEADER_ROOT: 'main[data-slot="sidebar-inset"] header', // スレタイ検索の起点
  THREAD_TITLE: 'div.line-clamp-1', // スレタイ (THREAD_HEADER_ROOT の中で探す)
  THREAD_MESSAGES: 'div.thread-messages',
  FIXED_AREA: 'div.pb-safe',
  RES_TAG: 'div', //レス領域のタグ（仕様変更での変化に対応しやすいように）
  RES_BLOCK: 'div.message-container',
  RES_CONTENT: 'div.message-content',
  RES_NUMBER: 'span.text-destructive', // レス番号
  
  // スレ落ち検出
  THREAD_STATUS_ROOT: 'main[data-slot="sidebar-inset"] > main',
  THREAD_CLOSED_NOTICE: 'div.text-destructive',
  
  // コンテンツ
  IMG_SPOILER_BUTTON: 'button.leading-0', // 画像スポイラー
  IMG_LINK: 'a.pspw-item',
  CUSTOM_EMOJI: 'span.custom-emoji img', // カスタム絵文字
  TXT_SPOILER: 'span.transition-opacity', // テキストスポイラー
  URL_PREVIEW: 'div.leading-normal', // URLプレビュー
  URL_LINK: 'a[rel="noreferrer"]' // URLリンク
};

// メッセージ
const MESSAGES = {
  ERROR: {
    PORT_NO: "ポート番号が不正です。0～65535の範囲で入力してください。",
    RES_NO_REQUIRED: "指定レス番号を入力してください。",
    RES_NO_RANGE: "1～1000の範囲で入力してください。",
    THREAD_NOTHING: "【エラー】スレッドが見つかりません。",
    RES_NOTHING: "【エラー】レスの検出に失敗しました。"
  },
  CONFIRM: {
    ALL_IMG_DL: "現在のタブで表示しているスレッドの画像を全てダウンロードします。\nよろしいですか？\n※画像の数によっては長時間かかる恐れがあります。\n※保存済の画像であっても保存します。"
  },
  SUCCESS: {
    COMPLETE: "処理が完了しました。",
    ALL_IMG_DL: "スレ内の画像保存が完了しました。保存件数 = ",
    IMG_DOWNLOADED: "(画像が投稿されました)"
  },
  THREAD_CLOSED_TEXT: "このスレはもう書き込みできません" // 検出する文字列
};

// style (CSS)
const STYLES = {
  BUTTON_BGCOLOR_OFF: "#e4e4e4ff",
  BUTTON_BGCOLOR_ON: "#9aacfaff",
  BUTTON_TEXTCOLOR_OFF: "#800000",
  BUTTON_TEXTCOLOR_ON: "#3b0000ff"
}