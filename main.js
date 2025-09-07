// main.js - client-side logic for the runlog app

// Array to store log entries
let logs = [];

// Load logs from localStorage
function loadLogs() {
  const data = localStorage.getItem('runlog_logs');
  try {
    logs = data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to parse stored logs', e);
    logs = [];
  }
}

// Save logs back to localStorage
function saveLogs() {
  localStorage.setItem('runlog_logs', JSON.stringify(logs));
}

// Display the form for adding or editing a log
function showForm(editIndex = -1) {
  // Determine initial values
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
    // default date to today
    const today = new Date();
    log.date = today.toISOString().substr(0, 10);
  }
  // Build HTML form
  const html = `
    <h2>${editIndex >= 0 ? '記録を編集' : '新規記録'}</h2>
    <form id="logForm">
      <div>
        <label for="date">日付:</label>
        <input type="date" id="date" name="date" value="${log.date}">
      </div>
      <div>
        <label for="startTime">開始時刻:</label>
        <input type="time" id="startTime" name="startTime" value="${log.startTime}">
      </div>
      <div>
        <label for="endTime">終了時刻:</label>
        <input type="time" id="endTime" name="endTime" value="${log.endTime}">
      </div>
      <div>
        <label for="purpose">目的:</label>
        <input type="text" id="purpose" name="purpose" value="${log.purpose}" placeholder="目的地や内容など">
      </div>
      <div>
        <label for="start">出発地:</label>
        <input type="text" id="start" name="start" value="${log.start}">
      </div>
      <div>
        <label for="end">到着地:</label>
        <input type="text" id="end" name="end" value="${log.end}">
      </div>
      <div>
        <label for="distance">距離 (km):</label>
        <input type="number" step="0.1" id="distance" name="distance" value="${log.distance}">
      </div>
      <div>
        <label for="cost">費用 (円):</label>
        <input type="number" step="0.1" id="cost" name="cost" value="${log.cost}">
      </div>
      <div>
        <label for="notes">メモ:</label>
        <textarea id="notes" name="notes" rows="3">${log.notes}</textarea>
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

// Validate and add/update a log
function submitLog(editIndex) {
  // Gather values
  const date = document.getElementById('date').value;
  const startTime = document.getElementById('startTime').value;
  const endTime = document.getElementById('endTime').value;
  const purpose = document.getElementById('purpose').value.trim();
  const start = document.getElementById('start').value.trim();
  const end = document.getElementById('end').value.trim();
  const distance = parseFloat(document.getElementById('distance').value);
  const cost = parseFloat(document.getElementById('cost').value);
  const notes = document.getElementById('notes').value.trim();
  // Basic validation
  const errors = [];
  if (!date) errors.push('日付を入力してください。');
  if (!startTime) errors.push('開始時刻を入力してください。');
  if (!endTime) errors.push('終了時刻を入力してください。');
  if (distance && distance < 0) errors.push('距離は0以上で入力してください。');
  if (cost && cost < 0) errors.push('費用は0以上で入力してください。');
  if (startTime && endTime && startTime > endTime) errors.push('開始時刻は終了時刻より前でなければなりません。');
  if (errors.length > 0) {
    document.getElementById('formError').innerText = errors.join('\n');
    return;
  }
  const logEntry = {
    date,
    startTime,
    endTime,
    purpose,
    start,
    end,
    distance: isNaN(distance) ? '' : distance,
    cost: isNaN(cost) ? '' : cost,
    notes
  };
  if (editIndex >= 0) {
    logs[editIndex] = logEntry;
  } else {
    logs.push(logEntry);
  }
  saveLogs();
  showList();
}

// Display the list of logs
function showList() {
  if (logs.length === 0) {
    document.getElementById('content').innerHTML = '<p>記録がありません."新規記録"ボタンから追加してください。</p>';
    return;
  }
  let tableRows = logs
    .map((log, index) => {
      return `
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
            <button onclick="showForm(${index})">編集</button>
            <button onclick="deleteLog(${index})">削除</button>
          </td>
        </tr>
      `;
    })
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

// Delete a log entry
function deleteLog(index) {
  if (confirm('この記録を削除しますか？')) {
    logs.splice(index, 1);
    saveLogs();
    showList();
  }
}

// Show summary statistics
function showSummary() {
  if (logs.length === 0) {
    document.getElementById('content').innerHTML = '<p>記録がありません。</p>';
    return;
  }
  let totalDistance = 0;
  let totalCost = 0;
  logs.forEach((log) => {
    if (log.distance) totalDistance += Number(log.distance);
    if (log.cost) totalCost += Number(log.cost);
  });
  const html = `
    <h2>集計</h2>
    <p>記録件数: ${logs.length}</p>
    <p>総距離: ${totalDistance.toFixed(1)} km</p>
    <p>総費用: ${totalCost.toFixed(0)} 円</p>
  `;
  document.getElementById('content').innerHTML = html;
}

// Export logs as CSV file
function exportCSV() {
  if (logs.length === 0) {
    alert('エクスポートする記録がありません。');
    return;
  }
  // Define CSV headers
  const headers = ['日付', '開始時刻', '終了時刻', '目的', '出発地', '到着地', '距離(km)', '費用(円)', 'メモ'];
  const rows = logs.map((log) => {
    return [
      log.date,
      log.startTime,
      log.endTime,
      log.purpose,
      log.start,
      log.end,
      log.distance,
      log.cost,
      log.notes.replace(/\n/g, '\\n')
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

// Register service worker for PWA if supported
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }
}

// Initialize app on page load
window.addEventListener('load', () => {
  loadLogs();
  showList();
  registerServiceWorker();
});
