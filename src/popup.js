// popup.js
document.addEventListener('DOMContentLoaded', () => {
  // --- 要素の取得 ---
  const visiblePanel = document.getElementById('visiblePanel');
  const enableNotification = document.getElementById('enableNotification');
  const enableFileSave = document.getElementById('enableFileSave');
  const settingsToSave = document.querySelectorAll('.savable');
  const enableReading = document.getElementById('enableReading');
  const enableOneComme = document.getElementById('enableOneComme');
  const bouyomiPort = document.getElementById('bouyomiPort');
  const openNgOptions = document.getElementById('openNgOptions');
  const downloadAllButton = document.getElementById('downloadAllImages');
  
  const readingStartPosition = document.getElementById('readingStartPosition');
  const startReadingResNumber = document.getElementById('startReadingResNumber');
  const startReadingResNumberGroup = document.getElementById('startReadingResNumberGroup');

  const oneCommeId = document.getElementById('oneCommeId');

  // 設定画面 タブ
  const menuTabs = document.querySelectorAll(".js-menutab");  //リンク
  const menuTabBlocks = document.querySelectorAll(".js-tabblock");  //block
  // 配信支援機能
  const enabledStream = document.getElementById('enableStream');  //配信支援の有無を切り替えるトグルスイッチ
  const streamItems = document.querySelectorAll('.js-enabled-stream');  //配信支援機能関連セレクタ

  // --- 関数定義 ---

  /**
   * 配信支援機能の可否によって関連項目の表示/非表示を切り替え
   */
  const changeEnableStream = (isEnabledStream) => {
    // 配信支援がONの場合、わんコメ連携トグルスイッチと配信支援設定タブを可視化する
    if (isEnabledStream) {
      streamItems.forEach(element => {
        element.classList.remove("d-none");
      });
    } else {
      streamItems.forEach(element => {
        element.classList.add("d-none");
      });
      // わんコメ連携を停止
      enableOneComme.checked = false;
    }
    // パネルの有効・無効も切り替え
    sendStateToTab('CHANGE_VISIBLE', { });
  }

  const tabActiveate = (activeTabId) => {
      // 一度すべてのタブからactiveを解除
      menuTabs.forEach(taskTab => {
        taskTab.classList.remove("active");
      });
      // クリック対象のタブをactiveにする
      document.querySelector(`[data-target-tab="${activeTabId}"]`).classList.add("active");

      // 対象ブロックのアクティブ化
      document.getElementById(activeTabId).classList.remove("d-none");
      // 対象以外のブロックを非表示
      menuTabBlocks.forEach(tabBlock => {
        if (tabBlock.id !== activeTabId) {
          tabBlock.classList.add("d-none");
        }
      });
  }

  /**
   * 設定の読み込み (ローカルに保存するもののみ)
   */
  const loadSettings = () => {
    // constants.js からデフォルト値を取得
    const defaults = SETTINGS_PARAMS.DEFAULT;

    // chrome.storage.localから設定を読み込む
    chrome.storage.local.get(defaults, (items) => {
      // 読み込んだ値でUIを更新
      settingsToSave.forEach(input => {
        const id = input.id;

        // readingStartPosition はローカル保存対象外
        if (id === 'readingStartPosition') return; 

        if (input.type === 'checkbox') {
          input.checked = items[id];
        } else if (input.type === 'select-one') {
          input.value = items[id];
        } else if (input.value !== undefined) {
          input.value = items[id];
        }
        
        // 配信支援可否の値で設定項目の表示/非表示を切り替え
        if (id === 'enableStream') {
          changeEnableStream(input.checked);
        }
      });
      
      // 仮表示
      updateResNumberInputVisibility(TAB_STATE_DEFAULT.readingStartPosition);
      validateResNumber();
    });
  };

  /**
   * 設定の保存 (ローカルに保存するもののみ)
   */
  const saveSetting = (e) => {
    const input = e.target;
    const id = input.id;
    let value = (input.type === 'checkbox') ? input.checked : 
                (input.type === 'select-one') ? input.value : 
                input.value;
    
    if (input.type === 'number') {
      value = Number(value);
    }

    // タブごとに保持する項目はローカルに保存しない
    if (id === 'startReadingResNumber' || id === 'readingStartPosition') {
      return; 
    }
    
    chrome.storage.local.set({ [id]: value });
  };

  /**
   * (保存しない)状態をアクティブタブのContent Scriptに送信
   */
  const sendStateToTab = (type, payload) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id && tabs[0].url.startsWith(URL_PARAM.MEBUKI_THREAD)) {
        // enabled だけでなく payload を送る
        chrome.tabs.sendMessage(tabs[0].id, { type, payload });
      }
    });
  };

  /**
   * 任意のテキストをContent Script経由で読み上げさせる
   */
  const speakTextInTab = (text) => {
    if (!text) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id && tabs[0].url.startsWith(URL_PARAM.MEBUKI_THREAD)) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SPEAK_TEXT', text: text });
      }
    });
  };

  /**
   * 任意のテキストをContent Script経由でわんコメに転送する
   */
  const sendOneCommeInTab = (text) => {
    if (!text) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id && tabs[0].url.startsWith(URL_PARAM.MEBUKI_THREAD)) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SEND_ONECOMME', text: text });
      }
    });
  };

  /**
   * Content Scriptから現在の状態を取得してUIに反映
   */
  const syncStateFromTab = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0] || !tabs[0].id) return;
      const tabId = tabs[0].id;
      const tabUrl = tabs[0].url || "";

      if (tabUrl.startsWith(URL_PARAM.MEBUKI_THREAD)) {
        chrome.tabs.sendMessage(tabId, { type: 'GET_CURRENT_STATE' }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn("Could not sync state from content script:", chrome.runtime.lastError.message);
          } else if (response) {
            enableNotification.checked = response.isNotification;
            enableFileSave.checked = response.isFileSaveActive;
            enableReading.checked = response.isReadingActive;
            readingStartPosition.value = response.readingStartPosition;
            startReadingResNumber.value = response.startReadingResNumber;
            enableOneComme.checked = response.isOneCommeActive;
            tabActiveate(response.currentTab);
            updateResNumberInputVisibility(readingStartPosition.value);
            
            // 棒読みちゃん連携中は開始位置設定を無効化
            if (response.isReadingActive) {
              readingStartPosition.disabled = true;
              startReadingResNumber.disabled = true;
              bouyomiPort.disabled = true;
            }
            // わんコメ連携中はわんコメID欄を無効化
            if (response.isOneCommeActive) {
              oneCommeId.disabled = true;
            }
          }
        });
      } else {
        // スレッドページ以外では無効化
        enableNotification.disabled = true;
        enableFileSave.disabled = true;
        enableReading.disabled = true;
        readingStartPosition.disabled = true;
        startReadingResNumber.disabled = true;
        downloadAllButton.disabled = true; 
        enableOneComme.disabled = true;
        oneCommeId.disabled = false;
      }
    });
  };
  
  /**
   * レス番号入力欄の表示/非表示
   */
  const updateResNumberInputVisibility = (selectedValue) => {
    if (selectedValue === "2") { // "指定レス番号から"
      startReadingResNumberGroup.classList.remove('d-none');
    } else {
      startReadingResNumberGroup.classList.add('d-none');
    }
  };
  
  /**
   * レス番号のバリデーション
   * @returns {number | null} - 有効なレス番号、または無効なら null
   */
  const validateResNumber = () => {
    const isPositionTwo = (readingStartPosition.value === "2");
    
    if (!isPositionTwo) {
      // "指定レス番号から" 以外が選択されている場合、
      // バリデーションは不要（読み上げは有効にできる）
      enableReading.disabled = false;
      return null;
    }

    // "指定レス番号から" が選択されている場合
    const value = startReadingResNumber.value;
    const num = parseInt(value, 10);

    if (value === "") {
      // 未入力
      alert(MESSAGES.ERROR.RES_NO_REQUIRED);
      enableReading.disabled = true;
      return null;
    }
    
    if (isNaN(num) || num < 1 || num > 1000) {
      // 範囲外
      alert(MESSAGES.ERROR.RES_NO_RANGE);
      enableReading.disabled = true;
      return null;
    }

    // バリデーションOK
    enableReading.disabled = false;
    return num;
  };

  // --- イベントリスナーの設定 ---
  loadSettings();
  syncStateFromTab();

  // ローカルに保存する設定
  settingsToSave.forEach(input => {
    const eventType = (input.type === 'checkbox' || input.type === 'select-one') ? 'change' : 'focusout';
    input.addEventListener(eventType, saveSetting);
  });

  // 画像の自動保存トグルスイッチchangeイベント
  enableFileSave.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    sendStateToTab('SET_FILESAVE_STATE', { enabled: isEnabled });
  });

  // 新着レス通知トグルスイッチchangeイベント
  enableNotification.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    sendStateToTab('SET_NOTIFICATION_STATE', { enabled: isEnabled });
  });

  // 棒読みちゃん連携トグルスイッチchangeイベント
  enableReading.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    let currentStartResNumber = null;

    if (isEnabled) {
      // ONにする時だけバリデーション
      startResNumber = validateResNumber();
      // 読み上げ開始位置が「指定レス番号から」の場合、開始レス番号がバリデーションNGかをチェック
      if (readingStartPosition.value === "2" && startResNumber === null) {
        // バリデーションNG
        e.target.checked = false; // チェックを戻す
        return;
      }

      // バリデーションOKの場合は指定レスNOをセット
      currentStartResNumber = startResNumber;
      
      // 実行中は設定を無効化
      readingStartPosition.disabled = true;
      startReadingResNumber.disabled = true;
      bouyomiPort.disabled = true;
    } else {
      // OFFにする時はバリデーション不要
      readingStartPosition.disabled = false;
      startReadingResNumber.disabled = false;
      bouyomiPort.disabled = false;
    }

    // content.js に状態と開始位置情報を送信
    sendStateToTab('SET_READING_STATE', {
      enabled: isEnabled,
      readingStartPosition: readingStartPosition.value,
      startReadingResNumber: currentStartResNumber // バリデーション結果を渡す
    });
  });

  // わんコメ連携トグルスイッチchangeイベント
  enableOneComme.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    sendStateToTab('SET_ONECOMME_STATE', { enabled: isEnabled });

    if (isEnabled) {
      // 実行中はわんコメIDの設定を無効化
      oneCommeId.disabled = true;
    } else {
      oneCommeId.disabled = false;
    }
  });

  // ポート番号のバリデーション
  bouyomiPort.addEventListener('focusout', (e) => {
    const port = parseInt(e.target.value, 10);
    if (isNaN(port) || port < 0 || port > 65535) {
      alert(MESSAGES.ERROR.PORT_NO);
      chrome.storage.local.get({ bouyomiPort: SETTINGS_PARAMS.BOUYOMI_PORT_DEFAULT }, (items) => {
        e.target.value = items.bouyomiPort;
      });
    }
  });

  // NGワード管理画面を開く
  openNgOptions.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // 全画像DLボタン
  if (downloadAllButton) {
    downloadAllButton.addEventListener('click', () => {
      if (confirm(MESSAGES.CONFIRM.ALL_IMG_DL)) {
        downloadAllButton.disabled = true; 
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'START_DOWNLOAD_ALL_IMAGES' });
          }
        });
      }
    });
  }
  
  // 読み上げ開始位置プルダウン
  readingStartPosition.addEventListener('change', (e) => {
    const selectedValue = e.target.value;
    updateResNumberInputVisibility(selectedValue);

    // content.js に状態を送信
    sendStateToTab('SET_READING_OPTIONS', { 
      readingStartPosition: selectedValue
    });
  });
  
  // 指定レス番号入力欄
  startReadingResNumber.addEventListener('focusout', (e) => {
    // バリデーション（読み上げボタンの有効/無効を更新するため）
    validateResNumber();
    // バリデーション後の値を content.js に送信
    sendStateToTab('SET_START_RES_NUMBER', { 
      startReadingResNumber: e.target.value 
    });
  });
  
  // content.js からの完了通知
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'DOWNLOAD_ALL_COMPLETE') {
      if (downloadAllButton) {
        downloadAllButton.disabled = false;
      }
    }
    // スレ落ち通知
    if (message.type === 'STOP_ALL_MONITORING') {
      enableReading.checked = false;
      enableFileSave.checked = false;
      readingStartPosition.disabled = false;
      startReadingResNumber.disabled = false;
    }
  });

  // 設定画面タブクリックイベント
  menuTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      // activeタブの場合は何もしない
      if (tab.classList.contains("active")) return;

      // アクティブにするブロックのIDを取得
      const activeTabId = tab.dataset.targetTab;
      
      // 対象タブ有効化
      tabActiveate(activeTabId);
      
      sendStateToTab('CURRENT_TAB_STATE', { currentTab: activeTabId });
    });
  });

  // 配信支援機能の有無切り替えイベント
  enabledStream.addEventListener('change', (e) => {
    changeEnableStream(enabledStream.checked);
  });

  // 右下パネルの表示有無切り替えイベント
  visiblePanel.addEventListener('change', (e) => {
    sendStateToTab('CHANGE_VISIBLE', { });
  });
});