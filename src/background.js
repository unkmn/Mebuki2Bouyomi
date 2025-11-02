// background.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // content.jsからDOWNLOAD_FILEメッセージを受け取る
  if (message.type === 'DOWNLOAD_FILE') {
    chrome.downloads.download({
      url: message.url,
      filename: message.filename,
      conflictAction: 'overwrite' // 仕様: 強制的に上書き
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('Download failed:', message.filename, chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });
    // 非同期応答のため true を返す
    return true;
  }
  
  // content.jsからデスクトップ通知の要求を受け取る
  if (message.type === 'SHOW_NOTIFICATION') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'images/icon.png', // manifest.jsonで指定したアイコン
      title: 'Mebuki2Bouyomi',
      message: message.message || '処理が完了しました。'
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Notification error:", chrome.runtime.lastError.message);
      }
    });
  }
});

