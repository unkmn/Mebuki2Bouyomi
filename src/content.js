// content.js

// --- グローバル変数・状態管理 ---
let currentSettings = {}; // ローカル保存設定 (共有)

//  以下はタブごとの状態
let isReadingActive = false; // 読み上げ実行中フラグ
let tabReadingStartPosition = TAB_STATE_DEFAULT.readingStartPosition; // 開始位置 ("0")
let tabStartReadingResNumber = TAB_STATE_DEFAULT.startReadingResNumber; // 指定レス番号 ("")
let isFileSaveActive = false; // ファイル保存有効フラグ
let isOneCommeActive = false; // わんコメ連携有効フラグ

let messageObserver = null; // レス監視用
let threadStatusObserver = null; // スレ落ち監視用
let isProcessingInitialRead = false; // 初回読み上げ処理中フラグ
let ngWordsList = []; // NGワードリスト
const bouyomiBaseUrl = "http://localhost:";

// --- UI要素 (content.js が挿入) ---
let controlPanel, btnStartFromNew, btnStop, statusTextRunning, statusTextStopped;

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
        console.warn(`Element not found (timeout): ${selector}`);
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
  if (currentUrl.startsWith(URL_PARAM.MEBUKI_THREAD)) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', async () => {
        await initializeThreadPage();
      });
    } else {
      await initializeThreadPage();
    }
  }
})();

/**
 * スレッドページ専用の初期化
 */
async function initializeThreadPage() {
  //insertControlUI();
  await checkAutoStart();
}

/**
 * 1. 設定をストレージから読み込む (ローカル保存分のみ)
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
 * 読み上げ制御UIをページに挿入
 */
function insertControlUI() {
  const mainElement = document.querySelector('main[data-slot="sidebar-inset"]');
  if (!mainElement) return;

  controlPanel = document.createElement('div');
  controlPanel.className = 'mebuki-bouyomi-controller';
  btnStartFromNew = document.createElement('button');
  btnStartFromNew.id = 'btnStartFromNew';
  btnStartFromNew.textContent = '新着レスから読み上げる';
  btnStop = document.createElement('button');
  btnStop.id = 'btnStop';
  btnStop.textContent = '読み上げ停止';
  statusTextRunning = document.createElement('span');
  statusTextRunning.id = 'statusTextRunning';
  statusTextRunning.textContent = '読み上げ：実行中';
  statusTextStopped = document.createElement('span');
  statusTextStopped.id = 'statusTextStopped';
  statusTextStopped.textContent = '読み上げ：停止中';

  controlPanel.appendChild(btnStartFromNew);
  controlPanel.appendChild(btnStop);
  controlPanel.appendChild(statusTextRunning);
  controlPanel.appendChild(statusTextStopped);
  mainElement.prepend(controlPanel);

  updateControlUI(false);

  btnStartFromNew.addEventListener('click', () => {
    // ボタン押下時は、タブが現在保持している開始位置で開始
    startReading(tabReadingStartPosition, null); 
  });
  btnStop.addEventListener('click', () => {
    stopReading();
  });
}

/**
 * 制御UIの表示/非表示を更新
 */
function updateControlUI(isReading) {
  if (!controlPanel) return;
  btnStartFromNew.style.display = isReading ? 'none' : 'inline-block';
  statusTextStopped.style.display = isReading ? 'none' : 'inline-block';
  btnStop.style.display = isReading ? 'inline-block' : 'none';
  statusTextRunning.style.display = isReading ? 'inline-block' : 'none';
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
    console.warn("Error waiting for thread body:", error);
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
    }
  }

  // 自動わんコメ連携開始
  if (currentSettings.enableStream) {
    if (bodyMatchOneComme || titleMatchOneComme) {
      if (!isOneCommeActive) {
        // わんコメ連携を有効化
        isOneCommeActive = true;
        updateMonitoringState();
        // ローカル保存の oneCommeStartText を使う
        sendToOneCommeBySystem(currentSettings.oneCommeStartText);
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
      isFileSaveActive = true;
      updateMonitoringState(); 
      if (isReadingActive) {
        speakTextInTab(currentSettings.fileSaveStartText);
      }
      if (isOneCommeActive) {
        // わんコメ連携開始メッセージと同一メッセージIDにならないよう10ミリ秒待機する
        await new Promise(r => setTimeout(r, 10));
        sendToOneCommeBySystem(currentSettings.fileSaveStartText);
      }
    }
  }
}

/**
 * popup.js からの読み上げリクエストを処理
 */
const speakTextInTab = (text) => {
  if (!text) return;
  sendToBouyomi(text);
};

/**
 * システムによるわんコメへのメッセージ転送
 */
const sendToOneCommeBySystem = (text) => {
  if (!text) return;
  sendToOneComme(STREAM_PARAMS.ONECOMME_EXTENTION_ID, STREAM_PARAMS.ONECOMME_EXTENTION_NAME, text);
}

/**
 * popup.js からわんコメ連携リクエストを処理
 */
const sendOneCommeInTab = (text) => {
  if (!text) return;
  sendToOneCommeBySystem(text);
}

/**
 * 3. ポップアップやBackgroundからのメッセージ受信
 */
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  switch (message.type) {
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
      isFileSaveActive = message.payload.enabled;
      updateMonitoringState();
      break;

    case 'SET_ONECOMME_STATE':
      isOneCommeActive = message.payload.enabled;
      updateMonitoringState();
      // 有効化の場合はスレID保存処理を実行
      if (isOneCommeActive) {
        saveThreadIdIfNeeded();
      }
      break;

    case 'SPEAK_TEXT': // popup.jsからの読み上げ指示
      speakTextInTab(message.text);
      break;
  
    case 'SEND_ONECOMME': // popup.jsからのわんコメ送信リクエスト
      sendOneCommeInTab(message.text);
      break;

    case 'GET_CURRENT_STATE':
      // タブごとの状態を返す
      sendResponse({
        isReadingActive: isReadingActive,
        readingStartPosition: tabReadingStartPosition,
        startReadingResNumber: tabStartReadingResNumber,
        isFileSaveActive: isFileSaveActive,
        isOneCommeActive: isOneCommeActive
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
    console.warn("Bouyomi-chan request failed.", error);
  }
}

/**
 * わんコメにHTTPリクエストを送信
 */
async function sendToOneComme(userId, name, text) {
  // わんコメ連携先IDを取得
  const oneCommeId = currentSettings.oneCommeId;

  if (!oneCommeId || oneCommeId.trim() === "") return;
  if (!text || text.trim() === "") return;

  // 現在日時を元にユニークなメッセージIDを生成
  const date = new Date();
  const messageId = "mebuki_" + date.getFullYear().toString().padStart(4, '0') + (date.getMonth() + 1).toString().padStart(2, '0') + date.getDate().toString().padStart(2, '0') + date.getHours().toString().padStart(2, '0') + date.getMinutes().toString().padStart(2, '0') + date.getMilliseconds().toString().padStart(3, '0');

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
            console.error("Bouyomi-chan request failed. " + response.statusText);
            return false;
        }
    })
    .catch(error => {
      console.warn("One-Comme request failed.", error);
      return false;
    });

    //正常終了
    return true;
  } catch (error) {
    // 異常終了
    console.warn("One-Comme request failed.", error);
    return false;
  }
}

/**
 * スレッドID保存処理
 */
function saveThreadIdIfNeeded() {
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
  const shouldBeMonitoring = isReadingActive || isFileSaveActive || isOneCommeActive;
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

  sendToBouyomi(currentSettings.startText);
  updateControlUI(true);
  updateMonitoringState();
  
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
function stopReadingInternal() {
  if (isReadingActive) return;
  isReadingActive = false;
  
  sendToBouyomi(currentSettings.endText);
  updateControlUI(false);
  updateMonitoringState();
}

/**
 * "読み上げを停止する" (ボタンクリック時)
 */
function stopReading() {
  stopReadingInternal();
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
          sendToBouyomi(currentSettings.threadClosedText);
          
          isReadingActive = false;
          isFileSaveActive = false;
          
          updateControlUI(false);
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
  if (!(isReadingActive || isFileSaveActive || isOneCommeActive)) return;

  for (const mutation of mutationsList) {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      let nodeLength = mutation.addedNodes.length;
      mutation.addedNodes.forEach(async node => {
        if (node.nodeType === Node.ELEMENT_NODE && node.matches(SELECTORS.RES_BLOCK)) {
          processNewMessage(node);
          nodeLength  = nodeLength - 1;
          if (nodeLength > 1) {
            // 複数レスを一括受信したときに順次読み上げられるように待機時間を300ミリ秒設ける
            await new Promise(r => setTimeout(r, 300));
          }
        }
      });
      await new Promise(r => setTimeout(r, 100));
    }
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
        sendToBouyomi(text);
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
          sendToBouyomi(text);
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
      // 改行が有効な場合、<br>を特殊文字に置換してtextContentを取得
      oneCommeElement.querySelectorAll('br').forEach(br => {
        br.parentNode.replaceChild(document.createTextNode(STREAM_PARAMS.ONECOMME_REPLACE_BR_TEXT), br);
      });
    }

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
      // わんコメへ転送
      sendToOneComme(STREAM_PARAMS.ONECOMME_USER_ID, currentSettings.oneCommeName, text);
    }

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
        sendToBouyomi("(画像が投稿されました)");
        await new Promise(r => setTimeout(r, 100));
      }
      if (downloadCount > 0) {
        sendToBouyomi(currentSettings.fileSaveNotificationText);
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // わんコメ連携が有効の場合
    if (isOneCommeActive) {
      if (imageFlag) {
        sendToOneCommeBySystem("(画像が投稿されました)");
        await new Promise(r => setTimeout(r, 100));
      }
      if (downloadCount > 0) {
        sendToOneCommeBySystem(currentSettings.fileSaveNotificationText);
        await new Promise(r => setTimeout(r, 100));
      }
    }

    if (isReadingActive || isOneCommeActive) {
      // 読み上げ処理
      await processReading(messageElement);
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

