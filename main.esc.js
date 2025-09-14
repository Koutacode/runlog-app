// main.js - 運行管理アプリ（日本語UI）

// 走行ログ
let logs = [];
// メンテナンス記録
let maintenance = [];
const maintenanceIntervals = {
  'オイル交換': 3,
  'タイヤ交換': 24,
  '点検': 6,
  '車検': 24,
  'バッテリー交換': 36,
  'ワイパー交換': 12
};

// ワンタップ開始/終了の状態
let currentTripStartTime = null;
let currentTripEvents = [];
let currentTripStartAddress = '';
let currentTripStartLat = null;
let currentTripStartLon = null;
let currentTripStartOdo = '';

const eventButtonMap = {
  '積み込み': { id: 'btnLoad', start: '積み込み', code: 'Load' },
  '荷下ろし': { id: 'btnUnload', start: '荷下ろし', code: 'Unload' },
  '休憩': { id: 'btnBreak', start: '休憩', code: 'Break' },
  '休息': { id: 'btnRest', start: '休息', code: 'Rest' }
};

const geoOptions = { enableHighAccuracy: false, maximumAge: 600000, timeout: 5000 };
let deferredInstallPrompt = null;

function updateEventButton(jpType, ongoing) {
  const map = eventButtonMap[jpType];
  if (!map) return;
  const btn = document.getElementById(map.id);
  if (!btn) return;
  if (ongoing) {
    btn.textContent = '終了';
    btn.disabled = false;
    btn.onclick = () => finishEvent(jpType);
  } else {
    btn.textContent = map.start;
    btn.disabled = false;
    btn.onclick = () => recordEvent(map.code);
  }
}

function resetEventButtons() {
  Object.values(eventButtonMap).forEach(({ id, start, code }) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.textContent = start;
      btn.disabled = false;
      btn.onclick = () => recordEvent(code);
    }
  });
}

function showOverlay(message = '記録中...') {
  const overlay = document.getElementById('overlay');
  if (overlay) {
    overlay.textContent = message;
    overlay.classList.remove('hidden');
  }
}

function hideOverlay() {
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.classList.add('hidden');
}

function toggleTrip() {
  const btn = document.getElementById('toggleTripBtn');
  if (!currentTripStartTime) {
    currentTripStartTime = new Date();
    currentTripStartAddress = '';
    currentTripStartOdo = '';
    const startOdoStr = prompt('開始オドメーター（任意）:');
    currentTripStartOdo = startOdoStr ? startOdoStr.trim() : '';
    currentTripStartLat = null;
    currentTripStartLon = null;
    const startTimeStr = currentTripStartTime.toTimeString().slice(0, 5);
    const label = document.getElementById('toggleLabel');
    if (label) label.textContent = '運行終了';
    if (btn) {
      btn.classList.remove('start');
      btn.classList.add('stop');
    }
    resetEventButtons();
    function finalizeStart(addr, lat, lon) {
      hideOverlay();
      currentTripStartAddress = addr || '';
      currentTripStartLat = lat;
      currentTripStartLon = lon;
      currentTripEvents.push({ type: '運航開始', startTime: startTimeStr, endTime: '', location: currentTripStartAddress, lat, lon, fuelAmount: '', fuelPrice: '' });
    }
    showOverlay();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ja&lat=${lat}&lon=${lon}`)
            .then((r) => r.json())
            .then((d) => finalizeStart(d.display_name, lat, lon))
            .catch(() => finalizeStart('', lat, lon));
        },
        () => finalizeStart('', null, null),
        geoOptions
      );
    } else {
      finalizeStart('', null, null);
    }
  } else {
    const endTime = new Date();
    const startDate = currentTripStartTime;
    const startDateStr = startDate.toISOString().slice(0, 10);
    const startTimeStr = startDate.toTimeString().slice(0, 5);
    const endDateStr = endTime.toISOString().slice(0, 10);
    const endTimeStr = endTime.toTimeString().slice(0, 5);
    const finalOdoStr = prompt('最終オドメーター（任意）:');
    const finalOdo = finalOdoStr ? finalOdoStr.trim() : '';
    function finalizeEnd(addr, lat, lon) {
      hideOverlay();
      const endAddr = addr || '';
      currentTripEvents.push({ type: '運航終了', startTime: endTimeStr, endTime: '', location: endAddr, lat, lon, fuelAmount: '', fuelPrice: '' });
      const logEntry = {
        startDate: startDateStr,
        startTime: startTimeStr,
        endDate: endDateStr,
        endTime: endTimeStr,
        purpose: '',
        start: currentTripStartAddress,
        startLat: currentTripStartLat,
        startLon: currentTripStartLon,
        end: endAddr,
        endLat: lat,
        endLon: lon,
        distance: '',
        cost: '',
        notes: '',
        events: currentTripEvents.slice(),
        startOdo: currentTripStartOdo,
        finalOdo
      };
      logs.push(logEntry);
      saveLogs();
      currentTripStartTime = null;
      currentTripEvents = [];
      currentTripStartOdo = '';
      currentTripStartLat = null;
      currentTripStartLon = null;
      const label = document.getElementById('toggleLabel');
      if (label) label.textContent = '運行開始';
      if (btn) {
        btn.classList.remove('stop');
        btn.classList.add('start');
      }
      resetEventButtons();
      showList();
    }
    showOverlay();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ja&lat=${lat}&lon=${lon}`)
            .then((r) => r.json())
            .then((d) => finalizeEnd(d.display_name, lat, lon))
            .catch(() => finalizeEnd('', lat, lon));
        },
        () => finalizeEnd('', null, null),
        geoOptions
      );
    } else {
      finalizeEnd('', null, null);
    }
  }
}

// 走行ログ 保存/読込
function loadLogs() {
  try {
    const data = localStorage.getItem('runlog_logs');
    logs = data ? JSON.parse(data) : [];
    logs = logs.map((l) => ({
      startDate: l.startDate || l.date || '',
      startTime: l.startTime || '',
      endDate: l.endDate || l.date || '',
      endTime: l.endTime || '',
      purpose: l.purpose || '',
      start: l.start || '',
      startLat: l.startLat || null,
      startLon: l.startLon || null,
      end: l.end || '',
      endLat: l.endLat || null,
      endLon: l.endLon || null,
      distance: l.distance || '',
      cost: l.cost || '',
      notes: l.notes || '',
      startOdo: l.startOdo || '',
      events: (l.events || []).map((e) => ({
        type: e.type || '',
        startTime: e.startTime || e.time || '',
        endTime: e.endTime || '',
        location: e.location || '',
        lat: e.lat || null,
        lon: e.lon || null,
        fuelAmount: e.fuelAmount || '',
        fuelPrice: e.fuelPrice || ''
      })),
      finalOdo: l.finalOdo || ''
    }));
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

function getNextMaintenanceDates() {
  const latest = {};
  maintenance.forEach((m) => {
    if (!latest[m.type] || new Date(latest[m.type]) < new Date(m.date)) {
      latest[m.type] = m.date;
    }
  });
  const result = {};
  Object.keys(maintenanceIntervals).forEach((type) => {
    const last = latest[type];
    if (last) {
      const d = new Date(last);
      d.setMonth(d.getMonth() + maintenanceIntervals[type]);
      result[type] = d.toISOString().slice(0, 10);
    } else {
      result[type] = '未記録';
    }
  });
  return result;
}

function maintenanceRecommendationsHTML() {
  const next = getNextMaintenanceDates();
  const items = Object.entries(next)
    .map(([type, date]) => `<li>${type}: ${date}</li>`)
    .join('');
  return `<h3>次回メンテナンス目安</h3><ul>${items}</ul>`;
}

// 走行ログ フォーム
function showForm(editIndex = -1) {
  const init = {
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    purpose: '',
    start: '',
    end: '',
    distance: '',
    cost: '',
    startOdo: '',
    finalOdo: '',
    notes: ''
  };
  let log = { ...init };
  if (editIndex >= 0) {
    log = { ...logs[editIndex] };
  } else {
    log.startDate = new Date().toISOString().slice(0, 10);
    log.endDate = log.startDate;
  }
  const html = `
    <h2>${editIndex >= 0 ? '記録を編集' : '新規記録'}</h2>
    <form id="logForm">
      <div>
        <label for="startDate">開始日:</label>
        <input type="date" id="startDate" value="${log.startDate}">
      </div>
      <div>
        <label for="startTime">開始時刻:</label>
        <input type="time" id="startTime" value="${log.startTime || ''}">
      </div>
      <div>
        <label for="endDate">終了日:</label>
        <input type="date" id="endDate" value="${log.endDate || ''}">
      </div>
      <div>
        <label for="endTime">終了時刻:</label>
        <input type="time" id="endTime" value="${log.endTime || ''}">
      </div>
      <div>
        <label for="purpose">目的:</label>
        <input type="text" id="purpose" value="${log.purpose || ''}" placeholder="荷物・用途など">
      </div>
      <div>
        <label for="start">出発地:</label>
        <input type="text" id="start" value="${log.start || ''}">
      </div>
      <div>
        <label for="end">到着地:</label>
        <input type="text" id="end" value="${log.end || ''}">
      </div>
      <div>
        <label for="distance">距離 (km):</label>
        <input type="number" step="0.1" id="distance" value="${log.distance || ''}">
      </div>
      <div>
        <label for="cost">費用 (円):</label>
        <input type="number" step="0.1" id="cost" value="${log.cost || ''}">
      </div>
      <div>
        <label for="startOdo">開始オドメーター:</label>
        <input type="number" id="startOdo" value="${log.startOdo || ''}">
      </div>
      <div>
        <label for="finalOdo">終了オドメーター:</label>
        <input type="number" id="finalOdo" value="${log.finalOdo || ''}">
      </div>
      <div>
        <label for="notes">メモ:</label>
        <textarea id="notes" rows="3">${log.notes || ''}</textarea>
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
  const startDate = document.getElementById('startDate').value;
  const startTime = document.getElementById('startTime').value;
  const endDate = document.getElementById('endDate').value;
  const endTime = document.getElementById('endTime').value;
  const purpose = document.getElementById('purpose').value.trim();
  const start = document.getElementById('start').value.trim();
  const end = document.getElementById('end').value.trim();
  const distance = parseFloat(document.getElementById('distance').value);
  const cost = parseFloat(document.getElementById('cost').value);
  const startOdoVal = document.getElementById('startOdo').value;
  const finalOdoVal = document.getElementById('finalOdo').value;
  const startOdo = startOdoVal === '' ? '' : Number(startOdoVal);
  const finalOdo = finalOdoVal === '' ? '' : Number(finalOdoVal);
  const notes = document.getElementById('notes').value.trim();
  const errors = [];
  if (!startDate) errors.push('開始日を入力してください。');
  if (!startTime) errors.push('開始時刻を入力してください。');
  if (!endDate) errors.push('終了日を入力してください。');
  if (!endTime) errors.push('終了時刻を入力してください。');
  if (!isNaN(distance) && distance < 0) errors.push('距離は0以上で入力してください。');
  if (!isNaN(cost) && cost < 0) errors.push('費用は0以上で入力してください。');
  if (startOdo !== '' && (isNaN(startOdo) || startOdo < 0)) errors.push('開始オドメーターは0以上で入力してください。');
  if (finalOdo !== '' && (isNaN(finalOdo) || finalOdo < 0)) errors.push('終了オドメーターは0以上で入力してください。');
  const startDateTime = new Date(`${startDate}T${startTime}`);
  const endDateTime = new Date(`${endDate}T${endTime}`);
  if (startDateTime > endDateTime) errors.push('開始日時は終了日時より前でなければなりません。');
  if (errors.length > 0) {
    document.getElementById('formError').innerText = errors.join('\n');
    return;
  }
  const existing = editIndex >= 0 ? logs[editIndex] : {};
  const logEntry = {
    startDate,
    startTime,
    endDate,
    endTime,
    purpose,
    start,
    startLat: existing.startLat || null,
    startLon: existing.startLon || null,
    end,
    endLat: existing.endLat || null,
    endLon: existing.endLon || null,
    distance: isNaN(distance) ? '' : distance,
    cost: isNaN(cost) ? '' : cost,
    startOdo: startOdo === '' ? '' : startOdo,
    finalOdo: finalOdo === '' ? '' : finalOdo,
    notes,
    events: existing.events || []
  };
  if (editIndex >= 0) logs[editIndex] = logEntry; else logs.push(logEntry);
  saveLogs();
  showList();
}

function formatEvents(events) {
  return (events || []).map((ev) => {
    const time = ev.endTime ? `${ev.startTime}～${ev.endTime}` : ev.startTime;
    const duration = ev.durationSec ? ` (${Math.floor(ev.durationSec / 60)}分${ev.durationSec % 60}秒)` : '';
    const fuel = ev.type === '給油' && ev.fuelAmount !== '' ? ` ${ev.fuelAmount}L` : '';
    return `${ev.type}${fuel}(${time})${duration}`;
  }).join('<br>');
}

function openMap(address, lat, lon) {
  if (!address && (lat === undefined || lon === undefined)) return;
  const dest = (lat !== undefined && lon !== undefined && lat !== null && lon !== null)
    ? `${lat},${lon}`
    : address;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
  window.open(url, '_blank');
}

function mapButton(address, lat, lon) {
  if (!address) return '';
  const safeAddr = address.replace(/'/g, "\\'");
  const latStr = lat === null || lat === undefined ? 'null' : lat;
  const lonStr = lon === null || lon === undefined ? 'null' : lon;
  return ` <button type="button" onclick="openMap('${safeAddr}', ${latStr}, ${lonStr})">地図</button>`;
}

function showList() {
  if (logs.length === 0 && !currentTripStartTime) {
    document.getElementById('content').innerHTML = '<p>記録がありません。「新規記録」ボタンから追加してください。</p>';
    return;
  }
  const tableRows = logs
    .map((log, index) => `
      <tr>
        <td>${log.startDate}</td>
        <td>${log.startTime}</td>
        <td>${log.endDate}</td>
        <td>${log.endTime}</td>
        <td>${log.startOdo || ''}</td>
        <td>${log.finalOdo || ''}</td>
        <td>${log.purpose}</td>
        <td>${log.start}</td>
        <td>${log.end}</td>
        <td>${log.distance}</td>
        <td>${log.cost}</td>
        <td>${formatEvents(log.events)}</td>
        <td>
          <button onclick=\"showForm(${index})\">編集</button>
          <button onclick=\"deleteLog(${index})\">削除</button>
        </td>
      </tr>
    `)
    .join('');
  const currentRow = currentTripStartTime
    ? `
      <tr>
        <td>${currentTripStartTime.toISOString().slice(0, 10)}</td>
        <td>${currentTripStartTime.toTimeString().slice(0, 5)}</td>
        <td>-</td>
        <td>-</td>
        <td>${currentTripStartOdo || ''}</td>
        <td>-</td>
        <td></td>
        <td>${currentTripStartAddress}</td>
        <td></td>
        <td></td>
        <td></td>
        <td>${formatEvents(currentTripEvents)}</td>
        <td></td>
      </tr>
    `
    : '';
  const html = `
    <h2>記録一覧</h2>
    <table>
      <thead>
        <tr>
          <th>開始日</th>
          <th>開始時刻</th>
          <th>終了日</th>
          <th>終了時刻</th>
          <th>開始オド</th>
          <th>終了オド</th>
          <th>目的</th>
          <th>出発地</th>
          <th>到着地</th>
          <th>距離(km)</th>
          <th>費用(円)</th>
          <th>イベント</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${currentRow}${tableRows}
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

function showDailyReport() {
  if (logs.length === 0) {
    document.getElementById('content').innerHTML = '<p>記録がありません。</p>';
    return;
  }
  const sections = logs
    .map((log) => {
      const events = (log.events || [])
        .map((ev) => `
          <tr>
            <td>${ev.startTime || ''}</td>
            <td>${ev.endTime || ''}</td>
            <td>${ev.type}</td>
            <td>${ev.location || ''}${mapButton(ev.location, ev.lat, ev.lon)}</td>
            <td>${ev.type === '給油' && ev.fuelAmount !== '' ? ev.fuelAmount : ''}</td>
          </tr>
        `)
        .join('');
      return `
        <section class="report">
          <h3>${log.startDate} ${log.startTime} ～ ${log.endDate} ${log.endTime}</h3>
          <p>出発地: ${log.start || ''}${mapButton(log.start, log.startLat, log.startLon)}</p>
          <p>到着地: ${log.end || ''}${mapButton(log.end, log.endLat, log.endLon)}</p>
          <p>目的: ${log.purpose || ''}</p>
          <table>
            <thead>
              <tr><th>開始</th><th>終了</th><th>内容</th><th>場所</th><th>給油量(L)</th></tr>
            </thead>
            <tbody>${events}</tbody>
          </table>
        </section>
      `;
    })
    .join('');
  document.getElementById('content').innerHTML = `<h2>日報</h2>${sections}`;
}

function showRecordsByDate() {
  if (logs.length === 0) {
    document.getElementById('content').innerHTML = '<p>記録がありません。</p>';
    return;
  }
  const dates = [...new Set(logs.map((l) => l.startDate))].sort();
  const options = dates.map((d) => `<option value="${d}">${d}</option>`).join('');
  const html = `
    <h2>日付別記録</h2>
    <label for="recordDate">日付:</label>
    <select id="recordDate">${options}</select>
    <div id="recordsByDate"></div>
  `;
  document.getElementById('content').innerHTML = html;
  document.getElementById('recordDate').addEventListener('change', update);
  update();
  function update() {
    const date = document.getElementById('recordDate').value;
    const filtered = logs.filter((l) => l.startDate === date);
    if (filtered.length === 0) {
      document.getElementById('recordsByDate').innerHTML = '<p>該当する記録がありません。</p>';
      return;
    }
    const rows = filtered
      .map((log) => `
        <tr>
          <td>${log.startTime}</td>
          <td>${log.endTime}</td>
          <td>${log.purpose}</td>
          <td>${log.start || ''}${mapButton(log.start, log.startLat, log.startLon)}</td>
          <td>${log.end || ''}${mapButton(log.end, log.endLat, log.endLon)}</td>
          <td>${log.distance}</td>
          <td>${log.cost}</td>
        </tr>
      `)
      .join('');
    document.getElementById('recordsByDate').innerHTML = `
      <table>
        <thead>
          <tr><th>開始時刻</th><th>終了時刻</th><th>目的</th><th>出発地</th><th>到着地</th><th>距離(km)</th><th>費用(円)</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }
}

function recordEvent(type) {
  if (!currentTripStartTime) {
    alert('運行を開始してからイベントを記録してください。');
    return;
  }
  const eventTime = new Date();
  const timeStr = eventTime.toTimeString().slice(0, 5);
  const map = { 'Load': '積み込み', 'Unload': '荷下ろし', 'Break': '休憩', 'Rest': '休息' };
  const jpType = map[type] || type;
  const ongoing = [...currentTripEvents].reverse().find((ev) => ev.type === jpType && !ev.endTime);
  if (ongoing) {
    alert(`${jpType} は既に記録中です。`);
    return;
  }
  showOverlay();
  function finalize(addr, lat, lon) {
    hideOverlay();
    const location = addr || '';
    const eventObj = {
      type: jpType,
      startTime: timeStr,
      endTime: '',
      location,
      lat,
      lon,
      fuelAmount: '',
      fuelPrice: '',
      startTimestamp: eventTime.getTime(),
      durationSec: ''
    };
    currentTripEvents.push(eventObj);
    updateEventButton(jpType, true);
    alert(`${jpType} 開始を記録しました。`);
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ja&lat=${lat}&lon=${lon}`)
          .then((response) => response.json())
          .then((data) => finalize(data && data.display_name, lat, lon))
          .catch(() => finalize('', lat, lon));
      },
      () => finalize('', null, null),
      geoOptions
    );
  } else {
    finalize('', null, null);
  }
}

function finishEvent(jpType) {
  const ongoing = [...currentTripEvents].reverse().find((ev) => ev.type === jpType && !ev.endTime);
  if (!ongoing) return;
  const eventTime = new Date();
  const timeStr = eventTime.toTimeString().slice(0, 5);
  showOverlay();
  function finalize(addr, lat, lon) {
    hideOverlay();
    ongoing.endTime = timeStr;
    if (!ongoing.location) ongoing.location = addr || '';
    if (lat !== null && lon !== null) {
      ongoing.lat = lat;
      ongoing.lon = lon;
    }
    ongoing.endTimestamp = eventTime.getTime();
    ongoing.durationSec = Math.round((ongoing.endTimestamp - ongoing.startTimestamp) / 1000);
    updateEventButton(jpType, false);
    alert(`${jpType} 終了を記録しました。`);
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ja&lat=${lat}&lon=${lon}`)
          .then((response) => response.json())
          .then((data) => finalize(data && data.display_name, lat, lon))
          .catch(() => finalize('', lat, lon));
      },
      () => finalize('', null, null),
      geoOptions
    );
  } else {
    finalize('', null, null);
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
  const timeStr = eventTime.toTimeString().slice(0, 5);
  const eventObj = {
    type,
    startTime: timeStr,
    endTime: timeStr,
    location: '',
    lat: null,
    lon: null,
    fuelAmount,
    fuelPrice
  };
  showOverlay();
  function finalize(addr, lat, lon) {
    hideOverlay();
    if (addr) eventObj.location = addr;
    if (lat !== null && lon !== null) {
      eventObj.lat = lat;
      eventObj.lon = lon;
    }
    currentTripEvents.push(eventObj);
    alert(`${type} を記録しました。`);
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ja&lat=${lat}&lon=${lon}`)
          .then((response) => response.json())
          .then((data) => finalize(data && data.display_name, lat, lon))
          .catch(() => finalize('', lat, lon));
      },
      () => finalize('', null, null),
      geoOptions
    );
  } else {
    finalize('', null, null);
  }
}

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCSV() {
  if (logs.length === 0) {
    alert('エクスポートする記録がありません。');
    return;
  }
  const headers = ['開始日','開始時刻','終了日','終了時刻','開始オドメーター','最終オドメーター','目的','出発地','到着地','距離(km)','費用(円)','メモ','イベント'];
  const rows = logs.map((log) => {
    let eventsStr = '';
    if (log.events && log.events.length) {
      eventsStr = log.events
        .map((ev) => {
          let s = `${ev.startTime}`;
          if (ev.endTime) s += `～${ev.endTime}`;
          s += ` ${ev.type}`;
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
      csvEscape(log.startDate),
      csvEscape(log.startTime),
      csvEscape(log.endDate),
      csvEscape(log.endTime),
      csvEscape(log.startOdo || ''),
      csvEscape(log.finalOdo || ''),
      csvEscape(log.purpose),
      csvEscape(log.start),
      csvEscape(log.end),
      csvEscape(log.distance),
      csvEscape(log.cost),
      csvEscape(log.notes || ''),
      csvEscape(eventsStr)
    ].join(',');
  });
  const csvContent = [headers.join(','), ...rows].join('\r\n');
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
    ${maintenanceRecommendationsHTML()}
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
    csvEscape(m.date),
    csvEscape(m.type),
    csvEscape(m.odometer),
    csvEscape(m.cost),
    csvEscape(m.notes || '')
  ].join(','));
  const csvContent = [headers.join(','), ...rows].join('\r\n');
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

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('btnInstall');
  if (btn) btn.classList.remove('hidden');
});

function setupInstallButton() {
  const btn = document.getElementById('btnInstall');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    btn.classList.add('hidden');
  });
}

window.addEventListener('appinstalled', () => {
  const btn = document.getElementById('btnInstall');
  if (btn) btn.classList.add('hidden');
});

// 起動時処理
window.addEventListener('load', () => {
  loadLogs();
  loadMaintenance();
  applyJapaneseLabels();
  showList();
  registerServiceWorker();
  setupInstallButton();
});

// 画面の固定ラベル（ナビ等）を日本語に
function applyJapaneseLabels() {
  document.title = 'ギャラクシーズホールド運行管理';
  const h1 = document.querySelector('header h1');
  if (h1) h1.textContent = 'ギャラクシーズホールド運行管理';
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  setText('toggleLabel', '運行開始');
  setText('btnNewLog', '新規記録');
  setText('btnList', '一覧');
  setText('btnSummary', '集計');
  setText('btnByDate', '日付別');
  setText('btnDaily', '日報');
  setText('btnExport', 'CSV出力');
  setText('btnMaintenance', '整備記録');
  setText('btnLoad', '積み込み');
  setText('btnUnload', '荷下ろし');
  setText('btnFuel', '給油');
  setText('btnBreak', '休憩');
  setText('btnRest', '休息');
}
