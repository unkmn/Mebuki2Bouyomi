// content.js

// --- グローバル変数・状態管理 ---
let currentSettings = {}; // ローカル保存設定 (共有)

//  以下はタブごとの状態
let isNotification = false; // 新着通知有効フラグ
let isReadingActive = false; // 読み上げ実行中フラグ
let tabReadingStartPosition = TAB_STATE_DEFAULT.readingStartPosition; // 開始位置 ("0")
let tabStartReadingResNumber = TAB_STATE_DEFAULT.startReadingResNumber; // 指定レス番号 ("")
let isFileSaveActive = false; // ファイル保存有効フラグ
let isOneCommeActive = false; // わんコメ連携有効フラグ
let currentTab = DEFAULT_TAB_TARGET_BLOCK; // 選択中の設定タブ

// エラーフラグ
let isReadingErrorFlag = false; // 棒読みちゃん連携失敗処理中フラグ
let isOneCommeErrorFlag = false; // わんコメ連携失敗処理中フラグ

let messageObserver = null; // レス監視用
let threadStatusObserver = null; // スレ落ち監視用
let titleObserver = null; // スレタイ監視用
let currentObservedUrl = ""; // 監視中のスレタイ
let isProcessingInitialRead = false; // 初回読み上げ処理中フラグ
let ngWordsList = []; // NGワードリスト
const bouyomiBaseUrl = "http://localhost:";

// --- UI要素 (content.js が挿入) ---
let controlPanel, btnNotificationEnable, btnAutoSaveEnable, btnReadEnable, liOneComme, btnOneCommeEnable

/**
 * 指定されたセレクタの要素がDOMに登場するまで待機する
 */
async function waitForElement(selector, root = document, timeout = 5000) {
  return new Promise((resolve) => {
    const existingElement = root.querySelector(selector);
    if (existingElement) {
      resolve(existingElement);
      return;
    }
    const intervalTime = 100;
    let elapsedTime = 0;
    const interval = setInterval(() => {
      const element = root.querySelector(selector);
      if (element) {
        clearInterval(interval);
        resolve(element);
      }
      elapsedTime += intervalTime;
      if (elapsedTime >= timeout) {
        clearInterval(interval);
        resolve(null);
      }
    }, intervalTime);
  });
}

/**
 * 起動時の初期化処理
 */
(async () => {
  await loadSettings();
  const currentUrl = window.location.href;
  if (currentUrl.startsWith(URL_PARAM.MEBUKI_PARENT)) {
    await initializeThreadPage();
  }
})();

/**
 * スレッドページ専用の初期化
 */
async function initializeThreadPage() {
  const currentUrl = window.location.href;
  // スレッドページの時のみ実行する初期化処理
  if (currentUrl.startsWith(URL_PARAM.MEBUKI_THREAD)) {
    const threadAreaElement = await waitForElement(SELECTORS.FIXED_AREA);
    if (!threadAreaElement) return;
    // 操作パネル表示
    const panelArea = threadAreaElement.parentElement;
    insertControlUI(panelArea);
    // 自動連携開始処理
    await checkAutoStart();
  }
  // ページタイトルの監視を開始
  await startTitleObserver(); 
}

/**
 * （URL変化検知時）状態をリセットし、UIを再挿入し、自動開始を再チェックする
 */
async function reInitialize() {
    // 1. 状態をリセット
    isNotification = false;
    isReadingActive = false;
    isFileSaveActive = false;
    tabReadingStartPosition = TAB_STATE_DEFAULT.readingStartPosition;
    tabStartReadingResNumber = TAB_STATE_DEFAULT.startReadingResNumber;
    isProcessingInitialRead = false;
    isOneCommeActive = false;
    currentTab = DEFAULT_TAB_TARGET_BLOCK;
    currentObservedUrl = "";
    
    // 2. 監視を停止
    if (messageObserver) messageObserver.disconnect();
    if (threadStatusObserver) threadStatusObserver.disconnect();
    if (titleObserver) titleObserver.disconnect();
    messageObserver = null;
    threadStatusObserver = null;
    titleObserver = null;
    
    // 3. 既存のUIを削除
    if (controlPanel) {
        controlPanel.remove();
        controlPanel = null;
    }
    
    // 4. UIを再挿入し、自動開始を再チェック
    await initializeThreadPage();
}

/**
 * 設定をストレージから読み込む (ローカル保存分のみ)
 */
async function loadSettings() {
  currentSettings = await chrome.storage.local.get(SETTINGS_PARAMS.DEFAULT);
  ngWordsList = currentSettings.ngWords || [];
  
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      for (let key in changes) {
        currentSettings[key] = changes[key].newValue;
        if (key === 'ngWords') {
          ngWordsList = changes[key].newValue || [];
        }
      }
    }
  });
}

/**
 * ページタイトル監視を開始する
 */
async function startTitleObserver() {
  if (titleObserver) return; // 既に監視中
  
  // 現在のURLを初期値として保存
  const titleElement = document.querySelector('title');
  currentObservedUrl = window.location.href;
  
  titleObserver = new MutationObserver(handleTitleChanges);
  
  // ヘッダー内のDOMツリーの変更（要素の追加/削除、テキストの変更）を監視
  titleObserver.observe(titleElement, {
      subtree: true,
      characterData: true
  });
}

/**
 * ページタイトル監視コールバック
 */
function handleTitleChanges(mutationsList) {
  
  const newUrl = window.location.href;
  
  // URLが変わった場合
  if (newUrl !== currentObservedUrl) {
      // reInitialize が呼ばれると、中で currentObservedUrl はリセットされる
      reInitialize();
  }
}

/**
 * 読み上げ制御UIをページに挿入
 */
function insertControlUI(panelArea) {
  const body = document.querySelector('body');

  // 枠を作成
  controlPanel = document.createElement('div');
  controlPanel.className = 'mebuki-bouyomi-controller';
  controlPanel.style.position = "fixed";
  controlPanel.style.width = "10rem";
  controlPanel.style.right = "20px";
  controlPanel.style.bottom = "100px";
  controlPanel.style.opacity = "0.6";
  controlPanel.style.background = "#feffef";
  controlPanel.style.color = "#800000";
  controlPanel.style.display = "none";

  const controllPanelUl = document.createElement('ul');
  controllPanelUl.style.width = "100%";

  // 見出し
  const liTitle = document.createElement('li');
  liTitle.textContent = APP_NAME;
  liTitle.style.width = "100%";
  liTitle.style.textAlign = "center";
  controllPanelUl.appendChild(liTitle);

  // 新着レス通知ボタン
  const liNotification = document.createElement('li');
  liNotification.style.width="100%";
  btnNotificationEnable = document.createElement('button');
  btnNotificationEnable.id = "btnNotificationEnable";
  btnNotificationEnable.textContent = "新着レス通知";
  btnNotificationEnable.style.background = STYLES.BUTTON_BGCOLOR_OFF;
  btnNotificationEnable.style.color = STYLES.BUTTON_TEXTCOLOR_OFF;
  btnNotificationEnable.style.width="100%";
  liNotification.appendChild(btnNotificationEnable);
  controllPanelUl.appendChild(liNotification);

  // ファイル自動保存ボタン
  const liAutoSave = document.createElement('li');
  liAutoSave.style.width="100%";
  btnAutoSaveEnable = document.createElement('button');
  btnAutoSaveEnable.id = "btnAutoSaveEnable";
  btnAutoSaveEnable.textContent = "ファイル自動保存"
  btnAutoSaveEnable.style.background = STYLES.BUTTON_BGCOLOR_OFF;
  btnAutoSaveEnable.style.color = STYLES.BUTTON_TEXTCOLOR_OFF;
  btnAutoSaveEnable.style.width="100%";
  liAutoSave.appendChild(btnAutoSaveEnable);
  controllPanelUl.appendChild(liAutoSave);
  // 棒読みちゃん連携ボタン
  const liRead = document.createElement('li');
  liRead.style.width="100%";
  btnReadEnable = document.createElement('button');
  btnReadEnable.id = 'btnReadEnable';
  btnReadEnable.textContent = '棒読みちゃん';
  btnReadEnable.style.background = STYLES.BUTTON_BGCOLOR_OFF;
  btnReadEnable.style.color = STYLES.BUTTON_TEXTCOLOR_OFF;
  btnReadEnable.style.width="100%";
  liRead.appendChild(btnReadEnable);
  controllPanelUl.appendChild(liRead);
  // わんコメ連携ボタン
  liOneComme = document.createElement('li');
  liOneComme.style.width="100%";
  btnOneCommeEnable = document.createElement('button');
  btnOneCommeEnable.id = "btnOneCommeEnable";
  btnOneCommeEnable.textContent = "わんコメ";
  btnOneCommeEnable.style.background = STYLES.BUTTON_BGCOLOR_OFF;
  btnOneCommeEnable.style.color = STYLES.BUTTON_TEXTCOLOR_OFF;
  btnOneCommeEnable.style.width="100%";
  liOneComme.appendChild(btnOneCommeEnable);
  controllPanelUl.appendChild(liOneComme);

  controlPanel.appendChild(controllPanelUl);
  
  body.appendChild(controlPanel);

  updateControlUI();

  btnNotificationEnable.addEventListener('click', () => {
    isNotification = !isNotification;
    updateControlUI();
    updateMonitoringState();
  });
  btnAutoSaveEnable.addEventListener('click', () => {
    if (!isFileSaveActive) {
      startAutoSave();
    } else {
      stopAutoSave();
    }
  });
  btnReadEnable.addEventListener('click', () => {
    if (!isReadingActive) {
      startReading(0, null); 
    } else {
      stopReadingInternal();
    }
    
  });
  btnOneCommeEnable.addEventListener('click', () => {
    if (!isOneCommeActive) {
      startOneComme();
    } else {
      stopOneComme();
    }
  });
}

/**
 * 制御UIの表示/非表示を更新
 */
function updateControlUI() {
  if (!controlPanel) return;

  if (currentSettings.visiblePanel) {
    controlPanel.style.display = "";
  } else {
    controlPanel.style.display = "none";
  }
  
  if (isNotification) {
    btnNotificationEnable.style.background = STYLES.BUTTON_BGCOLOR_ON;
    btnNotificationEnable.style.color = STYLES.BUTTON_TEXTCOLOR_ON;
  } else {
    btnNotificationEnable.style.background = STYLES.BUTTON_BGCOLOR_OFF;
    btnNotificationEnable.style.color = STYLES.BUTTON_TEXTCOLOR_OFF;
  }

  if (isFileSaveActive) {
    btnAutoSaveEnable.style.background = STYLES.BUTTON_BGCOLOR_ON;
    btnAutoSaveEnable.style.color = STYLES.BUTTON_TEXTCOLOR_ON;
  } else {
    btnAutoSaveEnable.style.background = STYLES.BUTTON_BGCOLOR_OFF;
    btnAutoSaveEnable.style.color = STYLES.BUTTON_TEXTCOLOR_OFF;
  }
  
  if (isReadingActive) {
    btnReadEnable.style.background = STYLES.BUTTON_BGCOLOR_ON;
    btnReadEnable.style.color = STYLES.BUTTON_TEXTCOLOR_ON;
  } else {
    btnReadEnable.style.background = STYLES.BUTTON_BGCOLOR_OFF;
    btnReadEnable.style.color = STYLES.BUTTON_TEXTCOLOR_OFF;
  }

  if (currentSettings.enableStream) {
    liOneComme.style.display = "";  // パネルのわんコメ連携ボタンを表示
  } else {
    liOneComme.style.display = "none";  // パネルのわんコメ連携ボタンを非表示
    isOneCommeActive = false;           // わんコメ連携も無効化する
  }

  if (isOneCommeActive) {
    btnOneCommeEnable.style.background = STYLES.BUTTON_BGCOLOR_ON;
    btnOneCommeEnable.style.color = STYLES.BUTTON_TEXTCOLOR_ON;
  } else {
    btnOneCommeEnable.style.background = STYLES.BUTTON_BGCOLOR_OFF;
    btnOneCommeEnable.style.color = STYLES.BUTTON_TEXTCOLOR_OFF;
  }
}

/**
 * スレッド本文を取得 (仕様書定義)
 */
async function getThreadBodyElement() {
  const selector = `${SELECTORS.THREAD_MESSAGES} ${SELECTORS.RES_BLOCK}:first-child`;
  try {
    const firstMessage = await waitForElement(selector, document, 5000); 
    if (!firstMessage) {
      console.warn("Thread first message not found.");
      return null;
    }
    return firstMessage.querySelector(SELECTORS.RES_CONTENT);
  } catch (error) {
    console.warn("スレッド本文の取得に失敗しました:", error);
    return null;
  }
}

/**
 * スレッド本文のテキストを前処理して取得
 */
async function getProcessedThreadBodyTexts() {
  const bodyElement = await getThreadBodyElement(); 
  if (!bodyElement) return [];
  const threadBodyText = bodyElement.textContent || "";
  return [ threadBodyText ];
}

/**
 * 2. ページ読み込み完了時の自動開始チェック (仕様書定義)
  */
async function checkAutoStart() {
  // スレタイトルチェック
  let titleMatchRead = false;
  let titleMatchSave = false;
  let titleMatchOneComme = false;
  
  const headerRoot = await waitForElement(SELECTORS.THREAD_HEADER_ROOT);
  if (headerRoot) {
    const titleElement = headerRoot.querySelector(SELECTORS.THREAD_TITLE);
    if (titleElement) {
      const titleText = titleElement.textContent || "";
      if (currentSettings.autoStartKeywordByTitle) {
        titleMatchRead = titleText.includes(currentSettings.autoStartKeywordByTitle);
      }
      if (currentSettings.autoSaveKeywordByTitle) {
        titleMatchSave = titleText.includes(currentSettings.autoSaveKeywordByTitle);
      }
      if (currentSettings.oneCommeAutoStartKeywordByTitle) {
        titleMatchOneComme = titleText.includes(currentSettings.oneCommeAutoStartKeywordByTitle);
      }
    }
  }

  // スレ本文チェック
  const bodyTexts = await getProcessedThreadBodyTexts();
  let bodyMatchRead = false;
  let bodyMatchSave = false;
  let bodyMatchOneComme = false;
  
  if (bodyTexts.length > 0) {
    const bodyText = bodyTexts[0];
    if (currentSettings.autoStartKeywordByBody) {
      bodyMatchRead = bodyText.includes(currentSettings.autoStartKeywordByBody);
    }
    if (currentSettings.autoSaveKeywordByBody) {
      bodyMatchSave = bodyText.includes(currentSettings.autoSaveKeywordByBody);
    }
    if (currentSettings.oneCommeAutoStartKeywordByBody) {
      bodyMatchOneComme = bodyText.includes(currentSettings.oneCommeAutoStartKeywordByBody);
    }
  }
  
  // 自動読み上げ開始
  if (bodyMatchRead || titleMatchRead) {
    if (!isReadingActive) {
      // 棒読みちゃん連携を有効化
      isReadingActive = true;
      updateMonitoringState(); 
      // ローカル保存の readingStartPosition を使う
      startReading(currentSettings.readingStartPosition, null);
      await new Promise(r => setTimeout(r, 10));
    }
  }

  // 自動わんコメ連携開始
  if (currentSettings.enableStream) { //配信支援機能が有効な場合のみ処理を実施
    if (bodyMatchOneComme || titleMatchOneComme) {
      if (!isOneCommeActive) {
        // わんコメ連携を有効化
        startOneComme();
        await new Promise(r => setTimeout(r, 10));
      }
    }
  }

  // 棒読みちゃん連携orわんコメ連携が有効になった場合、スレッドID保存処理を実施
  if (isReadingActive || isOneCommeActive) {
    saveThreadIdIfNeeded();
  }

  // 自動ファイル保存
  if (bodyMatchSave || titleMatchSave) {
    if (!isFileSaveActive) {
      // ファイルの自動保存を有効化
      startAutoSave();
    }
  }

  updateControlUI();
}

/**
 * 棒読みちゃんへの転送ラッパー関数
 */
const sendToBouyomiWrapper = async (text, compSpeakFlag = false) => {
  if (!text) return;
  if (!isReadingActive && !compSpeakFlag) return;
  
  const sendResult = await sendToBouyomi(text);

  // 連携が失敗した場合
  if (!sendResult) {
    if (!isReadingErrorFlag) {
      isReadingErrorFlag = true;

      // 棒読みちゃんへリクエストできなかった場合は連携を停止
      isReadingActive = false;
      // 監視状態の更新
      updateMonitoringState();
      
      alert(SEND_FAILED_MESSAGES.BOUYOMI);
    }
    isReadingErrorFlag = false;

    // パネルの状態更新
    updateControlUI();

    // 連携失敗時
    return false;
  }

  // パネルの状態更新
  updateControlUI();
  // 連携成功時
  return true;
};

/**
 * システムによるわんコメへのメッセージ転送
 */
const sendToOneCommeBySystem = async (text, compSendFlag = false) => {
  if (!text) return;
  if (!isOneCommeActive && !compSendFlag) return;
  // 現在日時を元にユニークなメッセージIDを生成
  const date = new Date();
  messageId = "mebuki_" + date.getFullYear().toString().padStart(4, '0') + (date.getMonth() + 1).toString().padStart(2, '0') + date.getDate().toString().padStart(2, '0') + date.getHours().toString().padStart(2, '0') + date.getMinutes().toString().padStart(2, '0') + date.getSeconds().toString().padStart(2, '0') + date.getMilliseconds().toString().padStart(3, '0');

  const sendResult = await sendToOneComme(messageId, STREAM_PARAMS.ONECOMME_EXTENTION_ID, STREAM_PARAMS.ONECOMME_EXTENTION_NAME, text)

  if (!sendResult) {
    if (!isOneCommeErrorFlag) {
      isOneCommeErrorFlag = true;

      // わんコメへリクエストできなかった場合は連携を停止
      isOneCommeActive = false;
      // パネルの状態更新
      updateControlUI();
      // 監視状態の更新
      updateMonitoringState();
      
      alert(SEND_FAILED_MESSAGES.ONECOMME);
    }
    isOneCommeErrorFlag = false;
  }
  return sendResult;
}

/**
 * popup.js からわんコメ連携リクエストを処理
 */
const sendOneCommeInTab = async (text) => {
  if (!text) return;
  await sendToOneCommeBySystem(text);
}

/**
 * 3. ポップアップやBackgroundからのメッセージ受信
 */
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  switch (message.type) {
    case 'SET_NOTIFICATION_STATE':
      isNotification = message.payload.enabled;
      updateControlUI();
      updateMonitoringState();
      break;

    case 'SET_READING_STATE':
      const wasReading = isReadingActive;
      isReadingActive = message.payload.enabled;
      
      if (isReadingActive && !wasReading) { // OFF -> ON
        // popup.js から開始位置とレス番号を受け取り、タブ変数に保存
        tabReadingStartPosition = message.payload.readingStartPosition;
        // レス番号も payload から取得しタブ変数に保存
        tabStartReadingResNumber = message.payload.startReadingResNumber !== null ? String(message.payload.startReadingResNumber) : ""; 
        
        saveThreadIdIfNeeded();
        startReading(message.payload.readingStartPosition, message.payload.startReadingResNumber);
        
      } else if (!isReadingActive && wasReading) { // ON -> OFF
        stopReadingInternal();
      }
      break;
      
    // popup.js から開始位置の変更を受け取る
    case 'SET_READING_OPTIONS':
      if (message.payload.readingStartPosition !== undefined) {
        tabReadingStartPosition = message.payload.readingStartPosition;
        // プルダウンが "2" 以外になったらレス番号をリセット
        if (tabReadingStartPosition !== "2") {
          tabStartReadingResNumber = "";
        }
      }
      // レス番号は読み上げ開始時にのみ受け取る
      break;
    
    // 指定レス番号入力欄の変更
    case 'SET_START_RES_NUMBER':
      if (message.payload.startReadingResNumber !== undefined) {
        tabStartReadingResNumber = message.payload.startReadingResNumber;
      }
      break;
    
    case 'SET_FILESAVE_STATE':
      const wasFileSave = isFileSaveActive;
      isFileSaveActive = message.payload.enabled;

      if (isFileSaveActive && !wasFileSave) { // OFF -> ON
        startAutoSave();
      } else if (!isFileSaveActive && wasFileSave) { // ON -> OFF
        stopAutoSave();
      }

      updateControlUI();
      updateMonitoringState();
      break;

    case 'SET_ONECOMME_STATE':
      const wasOneComme = isOneCommeActive;
      isOneCommeActive = message.payload.enabled;
      
      if (isOneCommeActive && !wasOneComme) { // OFF -> ON
        startOneComme();
        // 有効化の場合はスレID保存処理を実行
        if (isOneCommeActive) {
          saveThreadIdIfNeeded();
        }
      } else if (!isOneCommeActive && wasOneComme) {  // ON -> OFF
        stopOneComme();
      }
      
      break;

    case 'CHANGE_VISIBLE':
      updateControlUI();
      updateMonitoringState();      
      break;
    
    case 'CURRENT_TAB_STATE':
      currentTab = message.payload.currentTab;
      break;
      

    case 'SPEAK_TEXT': // popup.jsからの読み上げ指示
      await sendToBouyomiWrapper(message.text);
      break;
  
    case 'SEND_ONECOMME': // popup.jsからのわんコメ送信リクエスト
      sendOneCommeInTab(message.text);
      break;

    case 'GET_CURRENT_STATE':
      // タブごとの状態を返す
      sendResponse({
        isNotification: isNotification,
        isReadingActive: isReadingActive,
        readingStartPosition: tabReadingStartPosition,
        startReadingResNumber: tabStartReadingResNumber,
        isFileSaveActive: isFileSaveActive,
        isOneCommeActive: isOneCommeActive,
        currentTab: currentTab,
      });
      break;
      
    case 'START_DOWNLOAD_ALL_IMAGES':
      const threadElement = document.querySelector(SELECTORS.THREAD_MESSAGES);
      if (!threadElement) {
        alert(MESSAGES.ERROR.THREAD_NOTHING);
        chrome.runtime.sendMessage({ type: 'DOWNLOAD_ALL_COMPLETE' });
        return;
      }
      
      const messageContainers = threadElement.querySelectorAll(SELECTORS.RES_BLOCK);
      if (!messageContainers || messageContainers.length === 0) {
        alert(MESSAGES.ERROR.RES_NOTHING);
        chrome.runtime.sendMessage({ type: 'DOWNLOAD_ALL_COMPLETE' });
        return;
      }
      
      let totalDownloadCount = 0;
      
      for (const messageElement of messageContainers) {
        const { downloadCount, imageFlag } = await handleFileSaving(messageElement, true);
        totalDownloadCount += downloadCount;
        if (downloadCount > 0) {
            await new Promise(r => setTimeout(r, 800));
        }
      }
      
      chrome.runtime.sendMessage({ 
        type: 'SHOW_NOTIFICATION', 
        title: APP_NAME,
        message: `${MESSAGES.SUCCESS.ALL_IMG_DL}${totalDownloadCount}` 
      });
      
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_ALL_COMPLETE' });
      break;
    
  }
  return true;
});


/**
 * 棒読みちゃんにHTTPリクエストを送信
 */
async function sendToBouyomi(text) {
  if (!text || text.trim() === "") return;
  const port = currentSettings.bouyomiPort || SETTINGS_PARAMS.BOUYOMI_PORT_DEFAULT;
  const url = `${bouyomiBaseUrl}${port}/Talk?text=${encodeURIComponent(text)}`;
  try {
    await fetch(url, { method: 'GET', mode: 'no-cors' });
  } catch (error) {
    return false;
  }

  return true;
}

/**
 * わんコメにHTTPリクエストを送信
 */
async function sendToOneComme(messageId, userId, name, text) {
  // わんコメ連携先IDを取得
  const oneCommeId = currentSettings.oneCommeId;

  if (!oneCommeId || oneCommeId.trim() === "") return;
  if (!text || text.trim() === "") return;

  try {
    // わんコメへPOSTリクエストを実施
    await fetch(STREAM_PARAMS.ONECOMME_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            service: {
                id: oneCommeId
            },
            comment: {
                id: messageId,
                userId: userId,
                profileImage: STREAM_PARAMS.ONECOMME_PROFILE_IMAGE,
                name: name,
                comment: text
            }
        })
    })
    .then(response => {
        if (!response.ok) {
            // 異常終了
            return false;
        }
    });

  } catch (error) {
    // 異常終了
    return false;
  }

  return true;
}

/**
 * スレッドID保存処理
 */
function saveThreadIdIfNeeded() {
  // 配信支援機能が無効の場合は処理を終了
  if (!currentSettings.enableStream) return;

  if (currentSettings.saveThreadId) {
    const threadIdMatch = window.location.href.match(/app\/t\/([^\/?]+)/);
    if (threadIdMatch && threadIdMatch[1]) {
      const threadId = threadIdMatch[1];
      const savePath = STREAM_PARAMS.FILE_TXT_THREAD_ID;
      const dataUri = 'data:text/plain;charset=utf-8,' + encodeURIComponent(threadId);

      chrome.runtime.sendMessage({
        type: 'DOWNLOAD_FILE',
        url: dataUri,
        filename: DIR_AUTO_SAVE + savePath,
        isBlobUrl: false 
      }, (response) => {
        if (response && !response.success) {
          console.error("Failed to save thread ID:", response.error);
        }
      });
    } else {
      console.warn("Could not determine thread ID for saving.");
    }
  }
}

/**
 * 監視状態を更新する
 * 監視ONの場合、めぶきの「自動更新」をONにして非表示にする
 */
function updateMonitoringState() {
  const shouldBeMonitoring = isNotification || isReadingActive || isFileSaveActive || isOneCommeActive;
  const autoReloadButton = document.getElementById('auto-reload');
  const autoReloadLabel = document.querySelector('label[for="auto-reload"]');

  if (shouldBeMonitoring) {
    if (autoReloadButton) {
      if (autoReloadButton.dataset.state !== 'checked') {
        autoReloadButton.click();
      }
      autoReloadButton.style.visibility = 'hidden';
      if (autoReloadLabel) {
        autoReloadLabel.style.visibility = 'hidden';
      }
    }
    
    if (!messageObserver) {
      const threadElement = document.querySelector(SELECTORS.THREAD_MESSAGES);
      if (!threadElement) {
        console.error("Thread element not found. Cannot start monitoring.");
        return;
      }
      messageObserver = new MutationObserver(handleDomChanges);
      messageObserver.observe(threadElement, { childList: true });
    }
    
    if (!threadStatusObserver) {
      const statusRoot = document.querySelector(SELECTORS.THREAD_STATUS_ROOT);
      if (statusRoot) {
        threadStatusObserver = new MutationObserver(handleThreadStatusChanges);
        threadStatusObserver.observe(statusRoot, { childList: true, subtree: true });
      }
    }
    
  } else {
    if (messageObserver) {
      messageObserver.disconnect();
      messageObserver = null;
    }
    if (threadStatusObserver) {
      threadStatusObserver.disconnect();
      threadStatusObserver = null;
    }
    
    if (autoReloadButton) {
      autoReloadButton.style.visibility = 'visible';
      if (autoReloadLabel) {
        autoReloadLabel.style.visibility = 'visible';
      }
    }
  }
}

/**
 * "読み上げを開始する" (ボタンクリック時, 自動開始, popup.jsから)
 * @param {string} startPosition - "0", "1", "2"
 * @param {number | null} startResNumber - レス番号
 */
async function startReading(startPosition, startResNumber) {
  // 読み上げ開始時に isReadingActive を true にする
  if (!isReadingActive) {
    isReadingActive = true;
  }

  const sendResult = await sendToBouyomiWrapper(currentSettings.startText);
  if (!sendResult) return;
  updateMonitoringState();
  updateControlUI();
  
  // --- 開始位置に応じた初回読み上げ ---
  if (startPosition === "1" || startPosition === "2") {
    const threadElement = document.querySelector(SELECTORS.THREAD_MESSAGES);
    if (!threadElement) return;

    isProcessingInitialRead = true;
    let foundStart = (startPosition === "1"); // "最初から" なら即true
    
    // 全てのレス（スレ本文含む）を取得
    const allMessages = threadElement.getElementsByTagName(SELECTORS.RES_TAG);

    for (let i = 0; i < allMessages.length; i++) {
      const messageElement = allMessages[i];
      if (!messageElement.matches(SELECTORS.RES_BLOCK)) continue;
      
      if (!foundStart && startPosition === "2") {
        const resNumEl = messageElement.querySelector(SELECTORS.RES_NUMBER);
        if (resNumEl) {
          const resNum = parseInt(resNumEl.textContent, 10);
          if (resNum === startResNumber) {
            foundStart = true;
          }
        }
      }
      
      if (foundStart) {
        await processReading(messageElement, true);
      }
    }
    isProcessingInitialRead = false;
  }
}

/**
 * 読み上げ停止（内部処理）
 */
async function stopReadingInternal() {
  if (isReadingActive) isReadingActive = false;
  await sendToBouyomiWrapper(currentSettings.endText, true);

  updateControlUI();
  updateMonitoringState();
}

/**
 * "読み上げを停止する" (ボタンクリック時)
 */
function stopReading() {
  stopReadingInternal();
}

/**
 * わんコメ連携開始 (ボタンクリック時, 自動開始, popup.jsから)
 */
async function startOneComme() {
  // 読み上げ開始時に isOneCommeActive を true にする
  if (!isOneCommeActive) {
    isOneCommeActive = true;
  }

  const sendResult = await sendToOneCommeBySystem(currentSettings.oneCommeStartText);
  if (!sendResult) return;
 
  updateMonitoringState();
  updateControlUI();
}

/**
 * わんコメ連携停止（内部処理）
 */
async function stopOneComme() {
  if (isOneCommeActive) isOneCommeActive = false;
  await sendToOneCommeBySystem(currentSettings.oneCommeEndText, true);

  isOneCommeActive = false;

  updateControlUI();
  updateMonitoringState();
}

/**
 * ファイル自動保存開始 (ボタンクリック時, 自動開始, popup.jsから)
 */
async function startAutoSave() {
  // ファイル自動保存の開始時に isFileSaveActive を true にする
  if (!isFileSaveActive) {
    isFileSaveActive = true;
  }

  if (isReadingActive) {
    await sendToBouyomiWrapper(currentSettings.fileSaveStartText);
  }
  if (isOneCommeActive) {
    await sendToOneCommeBySystem(currentSettings.fileSaveStartText);
  }
 
  updateMonitoringState();
  updateControlUI();
}

/**
 * ファイル自動保存停止（内部処理）
 */
async function stopAutoSave() {
  if (isFileSaveActive) isFileSaveActive = false;

  if (isReadingActive) {
    await sendToBouyomiWrapper(currentSettings.fileSaveEndText);
  }
  if (isOneCommeActive) {
    await sendToOneCommeBySystem(currentSettings.fileSaveEndText);
  }

  updateControlUI();
  updateMonitoringState();
}

/**
 * スレ落ち監視コールバック
 */
function handleThreadStatusChanges(mutationsList) {
  for (const mutation of mutationsList) {
    if (mutation.addedNodes.length > 0) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        
        let targetElement = null;
        if (node.matches(SELECTORS.THREAD_CLOSED_NOTICE)) {
          targetElement = node;
        } else if (node.querySelector) {
          targetElement = node.querySelector(SELECTORS.THREAD_CLOSED_NOTICE);
        }

        if (targetElement && targetElement.textContent.includes(MESSAGES.THREAD_CLOSED_TEXT)) {
          sendToBouyomiWrapper(currentSettings.threadClosedText);
          
          isReadingActive = false;
          isFileSaveActive = false;
          
          updateControlUI();
          updateMonitoringState();
          
          chrome.runtime.sendMessage({ type: 'STOP_ALL_MONITORING' });
          
          if (messageObserver) messageObserver.disconnect();
          if (threadStatusObserver) threadStatusObserver.disconnect();
          return;
        }
      }
    }
  }
}

/**
 * DOM変更監視コールバック (レス監視)
 */
async function handleDomChanges(mutationsList) {
  if (isProcessingInitialRead) return;
  if (!(isNotification || isReadingActive || isFileSaveActive || isOneCommeActive)) return;

  for (const mutation of mutationsList) {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      let nodeLength = mutation.addedNodes.length;
      mutation.addedNodes.forEach(async node => {
        if (node.nodeType === Node.ELEMENT_NODE && node.matches(SELECTORS.RES_BLOCK)) {
          await processNewMessage(node);
          nodeLength = nodeLength - 1;
          if (nodeLength > 1) {
            await new Promise(r => setTimeout(r, 10));
          }
        }
      });
    }
    await new Promise(r => setTimeout(r, 10));
  }
}

/**
 * ファイル保存処理
 */
async function handleFileSaving(messageElement, forceSave = false) {
  let downloadCount = 0;
  let imageFlag = false; 

  if (isFileSaveActive || forceSave) {
    
    if (currentSettings.saveSpoilerImages) {
      const spoilerButtons = messageElement.querySelectorAll(SELECTORS.IMG_SPOILER_BUTTON);
      spoilerButtons.forEach(button => {
        button.click(); 
      });
      await new Promise(r => setTimeout(r, 100));
    }

    const links = messageElement.querySelectorAll(SELECTORS.IMG_LINK);
    if (links.length > 0) {
      for (const a of links) {
        const url = a.dataset.pswpSrc;
        if (!url) continue;
        
        const extension = (url.split('?')[0].split('.').pop() || "").toLowerCase();
        
        const shouldSave = 
             (currentSettings.saveJpg && (extension === 'jpg' || extension === 'jpeg' || extension === 'jfif' || extension === 'pjpeg')) ||
             (currentSettings.saveGif && extension === 'gif') ||
             (currentSettings.savePng && extension === 'png') ||
             (currentSettings.saveWebp && extension === 'webp');
                           
        if (shouldSave) {
          const threadIdMatch = window.location.href.match(/app\/t\/([^\/?]+)/);
          const threadId = threadIdMatch ? threadIdMatch[1] : 'unknown_thread';
          const saveDirPath = currentSettings.fileSavePath.replace("${thread_id}", threadId);
          let filename;
          try {
             const urlPath = new URL(url).pathname;
             filename = decodeURIComponent(urlPath.substring(urlPath.lastIndexOf('/') + 1));
          } catch (e) {
             filename = url.substring(urlPath.lastIndexOf('/') + 1).split('?')[0];
          }
          const savePath = (saveDirPath.endsWith('/') ? saveDirPath : saveDirPath + '/') + filename;
          
          chrome.runtime.sendMessage({ type: 'DOWNLOAD_FILE', url: url, filename: DIR_AUTO_SAVE + savePath, isBlobUrl: false });
          downloadCount++;
        } else {
          imageFlag = true;
        }
      } 
    }
  } else {
    if (messageElement.querySelector(SELECTORS.IMG_LINK)) {
      imageFlag = true;
    }
  }
  
  return { downloadCount, imageFlag };
}

/**
 * レス更新検知時 読み上げ処理
 */
async function processReading(messageElement, oneCommeNotSend=false) {
  if (!(isReadingActive || isOneCommeActive)) return;

  // レス本文のDOM要素
  const contentElement = messageElement.querySelector(SELECTORS.RES_CONTENT);
  if (!contentElement) return;

  //棒読みちゃん向けelement (途中まで共用)
  const processingElement = contentElement.cloneNode(true);

  processingElement.innerHTML = processingElement.innerHTML.replace(/&ZeroWidthSpace;/g, '');
  
  // NGフィルター有効の場合
  if (currentSettings.enableNgFilter) {
    const plainText = processingElement.textContent;
    // NGワードが含まれている場合は処理を中断する
    if (checkForNgWords(plainText)) {
      return; 
    }
  }

  // 引用ブロックを削除
  processingElement.querySelectorAll('blockquote').forEach(bq => bq.remove());
  // インラインコードを削除
  processingElement.querySelectorAll('code').forEach(code => code.remove());
  // コードブロックを削除
  processingElement.querySelectorAll('pre').forEach(pre => pre.remove());

  // 本文中にリンクが含まれる場合
  if (processingElement.querySelector('a')) {
    // プレビュー枠を除去
    processingElement.querySelectorAll(SELECTORS.URL_PREVIEW).forEach(preview => preview.remove());
    // URLを置換
    processingElement.querySelectorAll('a').forEach(a => {
      const linkText = a.textContent || "";
      if (linkText.startsWith("https://") || linkText.startsWith("http://")) {
        a.replaceWith(document.createTextNode(' (URL省略) '));
      }
    });
  }

  // わんコメ連携用のelementをcloneで作る
  const oneCommeElement = processingElement.cloneNode(true);
  
  // ===== ここから棒読みちゃんとわんコメで処理が分岐 =====

  // 棒読みちゃん連携処理
  if (isReadingActive) {
    // スポイラーを読み上げない場合、スポイラー領域を伏せ字に置換する
    if (!currentSettings.readSpoiler) {
      processingElement.querySelectorAll(SELECTORS.TXT_SPOILER).forEach(spoiler => {
        spoiler.replaceWith(document.createTextNode('*****'));
      });
    }

    // カスタム絵文字処理
    // 棒読みちゃんの場合は<im>タグをaltプロパティ値に置換する
    processingElement.querySelectorAll(SELECTORS.CUSTOM_EMOJI).forEach(img => {
      img.parentElement.replaceWith(document.createTextNode(img.alt));
    });
      

    if (currentSettings.ignoreNewlines) {
      // 改行を無視する場合、<br>タグを半角スペースに置換
      processingElement.querySelectorAll('br').forEach(br => {
        br.parentElement.replaceWith(document.createTextNode(' '));
      });
      let text = processingElement.textContent;

      // ｷﾀｰを読み上げない
      if (currentSettings.ignoreKita) { 
        text = text.replace(/ｷﾀ━━━━━━\(ﾟ∀ﾟ\)━━━━━━ !!!!!/g, '');
      }
      text = text.trim().replace(/\s+/g, ' ');

      if (text) {
        //棒読みちゃんへ転送
        await sendToBouyomiWrapper(text);
      }

    } else {
      // 改行が有効の場合、<br>タグでsplitして複数のテキストに分割
      const lines = processingElement.innerHTML.split(/<br\s*\/?>/gi);
      for (const lineHtml of lines) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = lineHtml;
        let text = tempDiv.textContent;

        // ｷﾀｰを読み上げない
        if (currentSettings.ignoreKita) { 
          text = text.replace(/ｷﾀ━━━━━━\(ﾟ∀ﾟ\)━━━━━━ !!!!!/g, '');
        }
        text = text.trim().replace(/\s+/g, ' ');

        if (text) {
          //棒読みちゃんへ
          await sendToBouyomiWrapper(text);
        }
      }
    }
  }

  // わんコメ連携処理
  if (isOneCommeActive && !oneCommeNotSend) {
    // スポイラーを読み上げない場合、スポイラー領域を伏せ字に置換する
    if (!currentSettings.oneCommeReadSpoiler) {
      oneCommeElement.querySelectorAll(SELECTORS.TXT_SPOILER).forEach(spoiler => {
        spoiler.replaceWith(document.createTextNode('*****'));
      });
    }

    // カスタム絵文字の要素を取得
    const oneCommeEmojiElement = oneCommeElement.querySelectorAll(SELECTORS.CUSTOM_EMOJI);
    // <img>タグを特殊文字に置換する
    oneCommeElement.querySelectorAll(SELECTORS.CUSTOM_EMOJI).forEach(img => {
      img.parentElement.replaceWith(document.createTextNode(STREAM_PARAMS.ONECOMME_REPLACE_IMG_TEXT));
    });

    if (currentSettings.oneCommeIgnoreNewlines) {
      // 改行を無視する場合、<br>タグを半角スペースに置換
      oneCommeElement.querySelectorAll('br').forEach(br => {
        br.parentNode.replaceChild(document.createTextNode(' '), br);
      });
    } else {
      // 改行が有効な場合、<br>を特殊文字に置換する
      // ※改行部分で読み上げを区切るように半角スペースを付与する
      oneCommeElement.querySelectorAll('br').forEach(br => {
        br.parentNode.replaceChild(document.createTextNode(' ' + STREAM_PARAMS.ONECOMME_REPLACE_BR_TEXT), br);
      });
    }

    // textContentで文字列としてレス内容を取得
    let text = oneCommeElement.textContent;

    // レス本文内にカスタム文字列が存在している場合、特殊文字から<img>タグに置換する
    oneCommeEmojiElement.forEach(img => {
      // 置換する<img>タグの生成
      const imgTag = `<img src="${img.src}" alt="${img.alt}">`;
      // 置換処理
      text = text.replace(STREAM_PARAMS.ONECOMME_REPLACE_IMG_TEXT, imgTag);
    });
    // 改行が有効な場合、改行特殊文字を<br>に置換する
    if (!currentSettings.oneCommeIgnoreNewlines) {
      text = text.replaceAll(STREAM_PARAMS.ONECOMME_REPLACE_BR_TEXT, "<br>");
    }
      
    // ｷﾀｰを読み上げない
    if (currentSettings.oneCommeIgnoreKita) { 
      text = text.replace(/ｷﾀ━━━━━━\(ﾟ∀ﾟ\)━━━━━━ !!!!!/g, '');
    }
    text = text.trim().replace(/\s+/g, ' ');

    if (text) {
      // スレID＋レス番号でメッセージIDを作る
      const threadIdMatch = window.location.href.match(/app\/t\/([^\/?]+)/);  //URLを "/app/" で分割して配列に格納する
      const threadId = threadIdMatch ? threadIdMatch[1] : 'unknown_thread'; //スレID
      const resNumber = messageElement.querySelector(".text-destructive").textContent;  // レス番号
      const messageId = threadId + "_" + resNumber; // スレID＋"_"＋レス番号 でメッセージIDを生成
      // わんコメへ転送
      const sendResult = await sendToOneComme(messageId, STREAM_PARAMS.ONECOMME_USER_ID, currentSettings.oneCommeName, text);
      if (sendResult) {
        // 連続でレスを送信する時に処理を安定させるため待機時間を空ける
        await new Promise(r => setTimeout(r, 50));
      } else {
        if (!isOneCommeErrorFlag) {
          isOneCommeErrorFlag = true;

          // わんコメへリクエストできなかった場合は連携を停止
          isOneCommeActive = false;
          // 監視状態の更新
          updateMonitoringState();
          
          alert(SEND_FAILED_MESSAGES.ONECOMME);
        }
        isOneCommeErrorFlag = false;
      }
      
    }
  } 
}

/**
 * レス更新検知時 通知処理
 */
async function processNotification(messageElement, downloadText) {
  if (!isNotification) return;

  // スレタイの取得
  const threadHeader = document.querySelector(SELECTORS.THREAD_HEADER_ROOT);
  const threadTitleElement = threadHeader.querySelector(SELECTORS.THREAD_TITLE);
  if (!threadTitleElement) return;
  const threadTitle = threadTitleElement.textContent;

  // レス本文のDOM要素
  const contentElement = messageElement.querySelector(SELECTORS.RES_CONTENT);
  if (!contentElement) return;

  // element取得
  const processingElement = contentElement.cloneNode(true);

  processingElement.innerHTML = processingElement.innerHTML.replace(/&ZeroWidthSpace;/g, '');
  
  // NGフィルター有効の場合
  if (currentSettings.enableNgFilter) {
    const plainText = processingElement.textContent;
    // NGワードが含まれている場合は処理を中断する
    if (checkForNgWords(plainText)) {
      return; 
    }
  }

  // 引用ブロックを削除
  processingElement.querySelectorAll('blockquote').forEach(bq => bq.remove());
  // インラインコードを削除
  processingElement.querySelectorAll('code').forEach(code => code.remove());
  // コードブロックを削除
  processingElement.querySelectorAll('pre').forEach(pre => pre.remove());

  // 本文中にリンクが含まれる場合
  if (processingElement.querySelector('a')) {
    // プレビュー枠を除去
    processingElement.querySelectorAll(SELECTORS.URL_PREVIEW).forEach(preview => preview.remove());
    // URLを置換
    processingElement.querySelectorAll('a').forEach(a => {
      const linkText = a.textContent || "";
      if (linkText.startsWith("https://") || linkText.startsWith("http://")) {
        a.replaceWith(document.createTextNode(' (URL省略) '));
      }
    });
  }

  // カスタム絵文字処理
  // <img>タグをaltプロパティ値に置換する
  processingElement.querySelectorAll(SELECTORS.CUSTOM_EMOJI).forEach(img => {
    img.parentElement.replaceWith(document.createTextNode(img.alt));
  });

  // <br>タグを改行コードに置換
  processingElement.querySelectorAll('br').forEach(br => {
    br.parentNode.replaceChild(document.createTextNode('\n'), br);
  });

  // textContentで文字列としてレス内容を取得
  let text = processingElement.textContent;
   
  // ｷﾀｰを読み上げない
  text = text.replace(/ｷﾀ━━━━━━\(ﾟ∀ﾟ\)━━━━━━ !!!!!/g, '');
  text = text.trim().replace(/\s+/g, ' ');

  // 画像に関するテキストがある場合は結合
  if (downloadText) {
    text = downloadText + "\n" + text;
  }

  if (text) {
    // background.js の通知処理へ送る
    chrome.runtime.sendMessage({ 
      type: 'SHOW_NOTIFICATION', 
      title: threadTitle,
      message: text
    });
  }
}

/**
 * 新しいレスを検知した場合の処理
 */
async function processNewMessage(messageElement) {
    const { downloadCount, imageFlag } = await handleFileSaving(messageElement, false);

    // 棒読みちゃん連携が有効の場合
    if (isReadingActive) {
      if (imageFlag) {
        await sendToBouyomiWrapper(MESSAGES.SUCCESS.IMG_DOWNLOADED);
      }
      if (downloadCount > 0) {
        await sendToBouyomiWrapper(currentSettings.fileSaveNotificationText);
      }
    }

    // わんコメ連携が有効の場合
    if (isOneCommeActive) {
      if (imageFlag) {
        await sendToOneCommeBySystem(MESSAGES.SUCCESS.IMG_DOWNLOADED);
      }
      if (downloadCount > 0) {
        await sendToOneCommeBySystem(currentSettings.fileSaveNotificationText);
      }
    }

    if (isReadingActive || isOneCommeActive) {
      // 読み上げ処理
      await processReading(messageElement);
    }

    // 新着レス通知
    if (isNotification) {
      let downloadText = "";
      if (imageFlag) {
        downloadText = MESSAGES.SUCCESS.IMG_DOWNLOADED;
      }
      if (downloadCount > 0) {
        downloadText = currentSettings.fileSaveNotificationText;
      }
      await processNotification(messageElement, downloadText);
    }

} 

/**
 * NGワードチェック処理
 */
function checkForNgWords(text) {
  if (!ngWordsList || ngWordsList.length === 0) {
    return false;
  }
  const targetText = text || "";
  for (const ngItem of ngWordsList) {
    const word = ngItem.word;
    if (!word) continue;
    try {
      switch (ngItem.type) {
        case 'partial':
          if (targetText.includes(word)) return true;
          break;
        case 'prefix':
          if (targetText.startsWith(word)) return true;
          break;
        case 'suffix':
          if (targetText.endsWith(word)) return true;
          break;
        case 'regex':
          const regex = new RegExp(word);
          if (regex.test(targetText)) return true;
          break;
      }
    } catch (e) {
      console.warn(`Invalid NG Word (Regex?): ${word}`, e);
    }
  }
  return false;
}

