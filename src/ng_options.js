document.addEventListener('DOMContentLoaded', () => {
  // --- 要素の取得 ---
  const ngWordInput = document.getElementById('ngWordInput');
  const matchTypeSelect = document.getElementById('matchTypeSelect');
  const addNgWordButton = document.getElementById('addNgWordButton');
  const ngListBody = document.getElementById('ngListBody');

  // --- 翻訳マップ ---
  const matchTypeMap = {
    partial: '部分一致',
    prefix: '前方一致',
    suffix: '後方一致',
    regex: '正規表現'
  };

  // --- 関数定義 ---

  /**
   * NGワードのリストをストレージから取得
   */
  const getNgWords = async () => {
    const result = await chrome.storage.local.get({ ngWords: [] });
    return result.ngWords;
  };

  /**
   * NGワードのリストをストレージに保存
   */
  const setNgWords = async (ngWords) => {
    await chrome.storage.local.set({ ngWords });
  };

  /**
   * NGワード一覧をHTMLに描画
   */
  const renderNgList = async () => {
    const ngWords = await getNgWords();
    ngListBody.innerHTML = ''; // 一旦空にする

    if (ngWords.length === 0) {
      ngListBody.innerHTML = '<tr><td colspan="3">登録されているNGワードはありません。</td></tr>';
      return;
    }

    ngWords.forEach((item, index) => {
      const tr = document.createElement('tr');
      
      const tdWord = document.createElement('td');
      tdWord.textContent = item.word;
      
      const tdType = document.createElement('td');
      tdType.textContent = matchTypeMap[item.type] || item.type; // 翻訳
      
      const tdAction = document.createElement('td');
      const deleteButton = document.createElement('button');
      deleteButton.textContent = '削除';
      deleteButton.className = 'delete-btn';
      deleteButton.dataset.index = index; 
      
      tdAction.appendChild(deleteButton);
      tr.appendChild(tdWord);
      tr.appendChild(tdType);
      tr.appendChild(tdAction);
      
      ngListBody.appendChild(tr);
    });
  };

  /**
   * NGワード追加処理
   */
  const addNgWord = async () => {
    const word = ngWordInput.value.trim();
    const type = matchTypeSelect.value;

    if (word === '') {
      alert('NGワードが入力されていません。');
      return;
    }

    const ngWords = await getNgWords();

    const isDuplicate = ngWords.some(item => item.word === word && item.type === type);
    if (isDuplicate) {
      alert('このNGワードは既に登録されています。');
      return;
    }

    ngWords.push({ word, type });
    await setNgWords(ngWords);

    ngWordInput.value = '';
    matchTypeSelect.value = 'partial';
    await renderNgList();
  };

  /**
   * NGワード削除処理 (イベント委譲)
   */
  const deleteNgWord = async (e) => {
    if (!e.target.classList.contains('delete-btn')) {
      return;
    }
    const indexToDelete = parseInt(e.target.dataset.index, 10);
    const ngWords = await getNgWords();
    ngWords.splice(indexToDelete, 1);
    await setNgWords(ngWords);
    await renderNgList();
  };

  // --- イベントリスナーの設定 ---
  renderNgList();
  addNgWordButton.addEventListener('click', addNgWord);
  ngListBody.addEventListener('click', deleteNgWord);
});