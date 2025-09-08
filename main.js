// main.js - 運行管理アプリ（日本語UI）

// 走行ログ
let logs = [];
// メンテナンス記録
let maintenance = [];

// ワンタップ開始/終了の状態
let currentTripStartTime = null;
let currentTripEvents = [];

function toggleTrip() {
  const btn = document.getElementById('toggleTripBtn');
  if (!currentTripStartTime) {
    currentTripStartTime = new Date();
    const label = document.getElementById('toggleLabel');
    if (label) label.textContent = '運行終了';
    if (btn) {
      btn.classList.remove('start');
      btn.classList.add('stop');
    }
  } else {
    const endTime = new Date();
    const startDate = currentTripStartTime;
    const date = startDate.toISOString().slice(0, 10);
    const startTimeStr = startDate.toTimeString().slice(0, 5);
    const endTimeStr = endTime.toTimeString().slice(0, 5);
    const finalOdoStr = prompt('最終オドメーター（任意）:');
    const finalOdo = finalOdoStr ? finalOdoStr.trim() : '';
    const logEntry = {
      date,
      startTime: startTimeStr,
      endTime: endTimeStr,
      purpose: '',
      start: '',
      end: '',
      distance: '',
      cost: '',
      notes: '',
      events: currentTripEvents.slice(),
      finalOdo
    };
    logs.push(logEntry);
    saveLogs();
    currentTripStartTime = null;
    currentTripEvents = [];
    const label = document.getElementById('toggleLabel');
    if (label) label.textContent = '運行開始';
    if (btn) {
      btn.classList.remove('stop');
      btn.classList.add('start');
    }
    showList();
  }
}

// 走行ログ 保存/読込
function loadLogs() {
  try {
    const data = localStorage.getItem('runlog_logs');
    logs = data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to parse stored logs', e);
    logs = [];
  }
}
function saveLogs() {
  localStorage.setItem('runlog_logs', JSON.stringify(logs));
}

// メンテナンス 保存/読込
function loadMaintenance() {
  try {
    const data = localStorage.getItem('runlog_maintenance');
    maintenance = data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to parse maintenance', e);
    maintenance = [];
  }
}
function saveMaintenance() {
  localStorage.setItem('runlog_maintenance', JSON.stringify(maintenance));
}

// 走行ログ フォーム
function showForm(editIndex = -1) {
  const init = {
    date: '',
    startTime: '',
    endTime: '',
    purpose: '',
    start: '',
    end: '',
    distance: '',
    cost: '',
    notes: ''
  };
  let log = { ...init };
  if (editIndex >= 0) {
    log = { ...logs[editIndex] };
  } else {
    log.date = new Date().toISOString().slice(0, 10);
  }
  const html = `
    <h2>${editIndex >= 0 ? '記録を編集' : '新規記録'}</h2>
    <form id="logForm">
      <div>
        <label for="date">日付:</label>
        <input type="date" id="date" name="date" value="${log.date}">
      </div>
      <div>
        <label for="startTime">開始時刻:</label>
        <input type="time" id="startTime" name="startTime" value="${log.startTime || ''}">
      </div>
      <div>
        <label for="endTime">終了時刻:</label>
        <input type="time" id="endTime" name="endTime" value="${log.endTime || ''}">
      </div>
      <div>
        <label for="purpose">目的:</label>
        <input type="text" id="purpose" name="purpose" value="${log.purpose || ''}" placeholder="荷物・用途など">
      </div>
      <div>
        <label for="start">出発地:</label>
        <input type="text" id="start" name="start" value="${log.start || ''}">
      </div>
      <div>
        <label for="end">到着地:</label>
        <input type="text" id="end" name="end" value="${log.end || ''}">
      </div>
      <div>
        <label for="distance">距離 (km):</label>
        <input type="number" step="0.1" id="distance" name="distance" value="${log.distance || ''}">
      </div>
      <div>
        <label for="cost">費用 (円):</label>
        <input type="number" step="0.1" id="cost" name="cost" value="${log.cost || ''}">
      </div>
      <div>
        <label for="notes">メモ:</label>
        <textarea id="notes" name="notes" rows="3">${log.notes || ''}</textarea>
      </div>
      <div>
        <button type="submit">${editIndex >= 0 ? '保存' : '追加'}</button>
        <button type="button" onclick="showList()">キャンセル</button>
      </div>
      <div id="formError" class="error"></div>
    </form>
  `;
  document.getElementById('content').innerHTML = html;
  document.getElementById('logForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitLog(editIndex);
  });
}

function submitLog(editIndex) {
  const date = document.getElementById('date').value;
  const startTime = document.getElementById('startTime').value;
  const endTime = document.getElementById('endTime').value;
  const purpose = document.getElementById('purpose').value.trim();
  const start = document.getElementById('start').value.trim();
  const end = document.getElementById('end').value.trim();
  const distance = parseFloat(document.getElementById('distance').value);
  const cost = parseFloat(document.getElementById('cost').value);
  const notes = document.getElementById('notes').value.trim();
  const errors = [];
  if (!date) errors.push('日付を入力してください。');
  if (!startTime) errors.push('開始時刻を入力してください。');
  if (!endTime) errors.push('終了時刻を入力してください。');
  if (!isNaN(distance) && distance < 0) errors.push('距離は0以上で入力してください。');
  if (!isNaN(cost) && cost < 0) errors.push('費用は0以上で入力してください。');
  if (startTime && endTime && startTime > endTime) errors.push('開始時刻は終了時刻より前でなければなりません。');
  if (errors.length > 0) {
    document.getElementById('formError').innerText = errors.join('\n');
    return;
  }
  const existing = editIndex >= 0 ? logs[editIndex] : {};
  const logEntry = {
    date,
    startTime,
    endTime,
    purpose,
    start,
    end,
    distance: isNaN(distance) ? '' : distance,
    cost: isNaN(cost) ? '' : cost,
    notes,
    events: existing.events || [],
    finalOdo: existing.finalOdo || ''
  };
  if (editIndex >= 0) logs[editIndex] = logEntry; else logs.push(logEntry);
  saveLogs();
  showList();
}

function showList() {
  if (logs.length === 0) {
    document.getElementById('content').innerHTML = '<p>記録がありません。「新規記録」ボタンから追加してください。</p>';
    return;
  }
  const tableRows = logs
    .map((log, index) => `
      <tr>
        <td>${log.date}</td>
        <td>${log.startTime}</td>
        <td>${log.endTime}</td>
        <td>${log.purpose}</td>
        <td>${log.start}</td>
        <td>${log.end}</td>
        <td>${log.distance}</td>
        <td>${log.cost}</td>
        <td>
          <button onclick=\"showForm(${index})\">編集</button>
          <button onclick=\"deleteLog(${index})\">削除</button>
        </td>
      </tr>
    `)
    .join('');
  const html = `
    <h2>記録一覧</h2>
    <table>
      <thead>
        <tr>
          <th>日付</th>
          <th>開始</th>
          <th>終了</th>
          <th>目的</th>
          <th>出発地</th>
          <th>到着地</th>
          <th>距離(km)</th>
          <th>費用(円)</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;
  document.getElementById('content').innerHTML = html;
}

function deleteLog(index) {
  if (confirm('この記録を削除しますか？')) {
    logs.splice(index, 1);
    saveLogs();
    showList();
  }
}

function showSummary() {
  if (logs.length === 0) {
    document.getElementById('content').innerHTML = '<p>記録がありません。</p>';
    return;
  }
  let totalDistance = 0;
  let totalCost = 0;
  logs.forEach((log) => {
    if (log.distance !== '' && !isNaN(Number(log.distance))) totalDistance += Number(log.distance);
    if (log.cost !== '' && !isNaN(Number(log.cost))) totalCost += Number(log.cost);
  });
  const html = `
    <h2>集計</h2>
    <p>記録件数: ${logs.length}</p>
    <p>総距離: ${totalDistance.toFixed(1)} km</p>
    <p>総費用: ${totalCost.toFixed(0)} 円</p>
  `;
  document.getElementById('content').innerHTML = html;
}

function recordEvent(type) {
  if (!currentTripStartTime) {
    alert('運行を開始してからイベントを記録してください。');
    return;
  }
  const eventTime = new Date();
  const eventObj = {
    type,
    time: eventTime.toTimeString().slice(0, 5),
    location: '',
    fuelAmount: '',
    fuelPrice: ''
  };
  function finalize() {
    // UIボタンは英語（Load/Unload/Break）から呼ばれる可能性があるので日本語ラベルに変換
    const map = { 'Load': '荷積み', 'Unload': '荷卸し', 'Break': '休憩' };
    eventObj.type = map[type] || type;
    currentTripEvents.push(eventObj);
    alert(`${eventObj.type} を記録しました。`);
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`)
          .then((response) => response.json())
          .then((data) => {
            if (data && data.display_name) {
              eventObj.location = data.display_name;
            }
            finalize();
          })
          .catch(() => finalize());
      },
      () => finalize()
    );
  } else {
    finalize();
  }
}

function recordFuelEvent() {
  if (!currentTripStartTime) {
    alert('運行を開始してからイベントを記録してください。');
    return;
  }
  const amountStr = prompt('給油量（L）:');
  let fuelAmount = '';
  if (amountStr) {
    const amtNum = parseFloat(amountStr);
    fuelAmount = isNaN(amtNum) ? '' : amtNum;
  }
  const priceStr = prompt('1リットルあたりの単価（円・任意）:');
  let fuelPrice = '';
  if (priceStr) {
    const priceNum = parseFloat(priceStr);
    fuelPrice = isNaN(priceNum) ? '' : priceNum;
  }
  const type = '給油';
  const eventTime = new Date();
  const eventObj = {
    type,
    time: eventTime.toTimeString().slice(0, 5),
    location: '',
    fuelAmount,
    fuelPrice
  };
  function finalize() {
    currentTripEvents.push(eventObj);
    alert(`${type} を記録しました。`);
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`)
          .then((response) => response.json())
          .then((data) => {
            if (data && data.display_name) eventObj.location = data.display_name;
            finalize();
          })
          .catch(() => finalize());
      },
      () => finalize()
    );
  } else {
    finalize();
  }
}

function exportCSV() {
  if (logs.length === 0) {
    alert('エクスポートする記録がありません。');
    return;
  }
  const headers = ['日付','開始','終了','目的','出発地','到着地','距離(km)','費用(円)','メモ','イベント','最終オドメーター'];
  const rows = logs.map((log) => {
    let eventsStr = '';
    if (log.events && log.events.length) {
      eventsStr = log.events
        .map((ev) => {
          let s = `${ev.time} ${ev.type}`;
          if (ev.location) s += `(${ev.location})`;
          if (ev.type === '給油') {
            const amount = ev.fuelAmount !== '' ? `${ev.fuelAmount}L` : '';
            const price = ev.fuelPrice !== '' ? `${ev.fuelPrice}円/L` : '';
            const details = [amount, price].filter(Boolean).join(', ');
            if (details) s += `:${details}`;
          }
          return s;
        })
        .join('; ');
    }
    return [
      log.date,
      log.startTime,
      log.endTime,
      log.purpose,
      log.start,
      log.end,
      log.distance,
      log.cost,
      String(log.notes || '').replace(/\n/g, '\\n'),
      eventsStr,
      log.finalOdo || ''
    ].join(',');
  });
  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'runlog.csv';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// メンテナンス
function showMaintenanceList() {
  if (maintenance.length === 0) {
    document.getElementById('content').innerHTML = `
      <h2>メンテナンス</h2>
      <p>記録がありません。「新規メンテナンス」から追加してください。</p>
      <button onclick=\"showMaintenanceForm()\">新規メンテナンス</button>
    `;
    return;
  }
  const rows = maintenance
    .map((m, i) => `
      <tr>
        <td>${m.date}</td>
        <td>${m.type}</td>
        <td>${m.odometer}</td>
        <td>${m.cost}</td>
        <td>${m.notes || ''}</td>
        <td>
          <button onclick=\"showMaintenanceForm(${i})\">編集</button>
          <button onclick=\"deleteMaintenance(${i})\">削除</button>
        </td>
      </tr>
    `)
    .join('');
  const html = `
    <h2>メンテナンス</h2>
    <div style="margin: 0 0 0.5rem 0;">
      <button onclick=\"showMaintenanceForm()\">新規メンテナンス</button>
      <button onclick=\"exportMaintenanceCSV()\">CSV出力</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>日付</th>
          <th>内容</th>
          <th>オドメーター</th>
          <th>費用(円)</th>
          <th>メモ</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  document.getElementById('content').innerHTML = html;
}

function showMaintenanceForm(editIndex = -1) {
  const init = { date: new Date().toISOString().slice(0, 10), type: 'オイル交換', odometer: '', cost: '', notes: '' };
  const m = editIndex >= 0 ? { ...maintenance[editIndex] } : init;
  const html = `
    <h2>${editIndex >= 0 ? 'メンテナンス編集' : '新規メンテナンス'}</h2>
    <form id=\"mntForm\">
      <div>
        <label for=\"mDate\">日付:</label>
        <input type=\"date\" id=\"mDate\" value=\"${m.date}\">
      </div>
      <div>
        <label for=\"mType\">内容:</label>
        <select id=\"mType\">
          <option${m.type === 'オイル交換' ? ' selected' : ''}>オイル交換</option>
          <option${m.type === 'タイヤ交換' ? ' selected' : ''}>タイヤ交換</option>
          <option${m.type === '点検' ? ' selected' : ''}>点検</option>
          <option${m.type === '車検' ? ' selected' : ''}>車検</option>
          <option${m.type === 'バッテリー交換' ? ' selected' : ''}>バッテリー交換</option>
          <option${m.type === 'ワイパー交換' ? ' selected' : ''}>ワイパー交換</option>
          <option${m.type && !['オイル交換','タイヤ交換','点検','車検','バッテリー交換','ワイパー交換'].includes(m.type) ? ' selected' : ''}>その他</option>
        </select>
      </div>
      <div>
        <label for=\"mOdo\">オドメーター:</label>
        <input type=\"number\" id=\"mOdo\" value=\"${m.odometer}\">
      </div>
      <div>
        <label for=\"mCost\">費用(円):</label>
        <input type=\"number\" id=\"mCost\" value=\"${m.cost}\">
      </div>
      <div>
        <label for=\"mNotes\">メモ:</label>
        <textarea id=\"mNotes\" rows=\"3\">${m.notes || ''}</textarea>
      </div>
      <div>
        <button type=\"submit\">${editIndex >= 0 ? '保存' : '追加'}</button>
        <button type=\"button\" onclick=\"showMaintenanceList()\">キャンセル</button>
      </div>
      <div id=\"mntError\" class=\"error\"></div>
    </form>
  `;
  document.getElementById('content').innerHTML = html;
  document.getElementById('mntForm').addEventListener('submit', (e) => {
    e.preventDefault();
    submitMaintenance(editIndex);
  });
}

function submitMaintenance(editIndex) {
  const date = document.getElementById('mDate').value;
  const type = document.getElementById('mType').value;
  const odometerVal = document.getElementById('mOdo').value;
  const costVal = document.getElementById('mCost').value;
  const notes = document.getElementById('mNotes').value.trim();
  const errors = [];
  if (!date) errors.push('日付を入力してください。');
  const odometer = odometerVal === '' ? '' : Number(odometerVal);
  const cost = costVal === '' ? '' : Number(costVal);
  if (odometer !== '' && (isNaN(odometer) || odometer < 0)) errors.push('オドメーターは0以上で入力してください。');
  if (cost !== '' && (isNaN(cost) || cost < 0)) errors.push('費用は0以上で入力してください。');
  if (errors.length) {
    document.getElementById('mntError').innerText = errors.join('\n');
    return;
  }
  const entry = { date, type, odometer: odometer === '' ? '' : odometer, cost: cost === '' ? '' : cost, notes };
  if (editIndex >= 0) maintenance[editIndex] = entry; else maintenance.push(entry);
  saveMaintenance();
  showMaintenanceList();
}

function deleteMaintenance(index) {
  if (confirm('このメンテナンス記録を削除しますか？')) {
    maintenance.splice(index, 1);
    saveMaintenance();
    showMaintenanceList();
  }
}

function exportMaintenanceCSV() {
  if (maintenance.length === 0) {
    alert('エクスポートするメンテナンス記録がありません。');
    return;
  }
  const headers = ['日付','内容','オドメーター','費用(円)','メモ'];
  const rows = maintenance.map((m) => [
    m.date,
    m.type,
    m.odometer,
    m.cost,
    String(m.notes || '').replace(/\n/g, '\\n')
  ].join(','));
  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'maintenance.csv';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Service Worker 登録
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }
}

// 起動時処理
window.addEventListener('load', () => {
  loadLogs();
  loadMaintenance();
  applyJapaneseLabels();
  showList();
  registerServiceWorker();
});

// 画面の固定ラベル（ナビ等）を日本語に
function applyJapaneseLabels() {
  document.title = '運行管理アプリ';
  const h1 = document.querySelector('header h1');
  if (h1) h1.textContent = '運行管理アプリ';
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  setText('toggleLabel', '運行開始');
  setText('btnNewLog', '新規記録');
  setText('btnList', '一覧');
  setText('btnSummary', '集計');
  setText('btnExport', 'CSV出力');
  setText('btnMaintenance', 'メンテナンス');
  setText('btnLoad', '荷積み');
  setText('btnUnload', '荷卸し');
  setText('btnFuel', '給油');
  setText('btnBreak', '休憩');
}
