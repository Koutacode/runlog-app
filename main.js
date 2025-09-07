// main.js - client-side logic for the runlog app

// Array to store log entries
let logs = [];

// Keep track of the start time of a trip when using the one‑click toggle.
// When `currentTripStartTime` is non‑null the app is waiting for the user to
// finish the trip.  This allows a driver to record a trip in two taps
// without needing to manually enter times while driving.
let currentTripStartTime = null;

// Store any events recorded during the current trip.  Events capture a
// timestamp, a location (resolved to an address when possible) and
// optional fields such as fuel quantity and price.  This array is reset
// each time a new trip is started and persisted into the log entry when
// the trip ends.  When no trip is active this variable remains unused.
let currentTripEvents = [];

/**
 * Toggle between starting and ending a trip.  When no trip is currently
 * recording, pressing the button stores the current date/time as the start
 * time and updates the button label to indicate the user should press again
 * when the trip ends.  When pressed while a trip is recording, it will
 * capture the end time, create a log entry with the captured times and
 * minimal details, save it, and reset the state back to “start”.  The list
 * view is shown after saving so the user can confirm the trip was
 * recorded.  Drivers can edit additional fields such as purpose or
 * distance later via the usual edit function.
 */
function toggleTrip() {
  const btn = document.getElementById('toggleTripBtn');
  if (!currentTripStartTime) {
    // Begin a new trip: record start time and change button label/icon/color
    currentTripStartTime = new Date();
    // Update the button to indicate recording in progress
    const icon = document.getElementById('toggleIcon');
    const label = document.getElementById('toggleLabel');
    if (icon) icon.textContent = '⏹';
    if (label) label.textContent = '運行終了';
    if (btn) {
      btn.classList.remove('start');
      btn.classList.add('stop');
    }
  } else {
    // End the current trip and save it
    const endTime = new Date();
    const startDate = currentTripStartTime;
    // Build a new log entry. Use ISO strings to extract date and time
    const date = startDate.toISOString().substr(0, 10);
    const startTimeStr = startDate.toTimeString().substr(0, 5);
    const endTimeStr = endTime.toTimeString().substr(0, 5);
    // Prompt for final odometer reading.  Allow blank if unknown.
    const finalOdoStr = prompt('最終オドメーターを入力してください:');
    const finalOdo = finalOdoStr ? finalOdoStr.trim() : '';
    // Build a new log entry including any recorded events and the final odometer.
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
      finalOdo: finalOdo
    };
    logs.push(logEntry);
    saveLogs();
    currentTripStartTime = null;
    currentTripEvents = [];
    // Reset button back to start state
    const icon = document.getElementById('toggleIcon');
    const label = document.getElementById('toggleLabel');
    if (icon) icon.textContent = '▶️';
    if (label) label.textContent = '運行開始';
    if (btn) {
      btn.classList.remove('stop');
      btn.classList.add('start');
    }
    // Show the list so the driver can quickly verify the entry
    showList();
  }
}

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
  // Preserve event and final odometer data when editing an existing log.  New logs get empty arrays.
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

/**
 * Record a generic event during an active trip.  This helper captures
 * the current time and attempts to resolve the user’s location to a
 * human‑readable address via the OpenStreetMap Nominatim API.  If
 * geolocation or reverse geocoding fails, the location field will be
 * left blank.  The recorded event is pushed into `currentTripEvents`.
 *
 * @param {string} type - A label describing the event (e.g., 荷積み, 荷卸し, 休憩)
 */
function recordEvent(type) {
  // Require that a trip is currently in progress
  if (!currentTripStartTime) {
    alert('運行を開始してからイベントを記録してください。');
    return;
  }
  // Construct basic event information
  const eventTime = new Date();
  const eventObj = {
    type,
    time: eventTime.toTimeString().substr(0, 5),
    location: '',
    fuelAmount: '',
    fuelPrice: ''
  };
  // Helper to finalize and store the event
  function finalize() {
    currentTripEvents.push(eventObj);
    alert(`${type} を記録しました。`);
  }
  // Attempt to obtain the current position
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        // Fetch a human‑readable address from Nominatim.  If the fetch fails
        // we still record the event without a location.
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`)
          .then((response) => response.json())
          .then((data) => {
            if (data && data.display_name) {
              eventObj.location = data.display_name;
            }
            finalize();
          })
          .catch(() => {
            finalize();
          });
      },
      () => {
        finalize();
      }
    );
  } else {
    finalize();
  }
}

/**
 * Record a refueling event during an active trip.  This function prompts
 * the driver for the amount of fuel added (in litres) and the price per
 * litre.  Price is optional.  It then records the time and attempts to
 * resolve the location similarly to `recordEvent()`.  The event is
 * stored in `currentTripEvents` with the extra fields populated.
 */
function recordFuelEvent() {
  if (!currentTripStartTime) {
    alert('運行を開始してからイベントを記録してください。');
    return;
  }
  // Prompt for fuel quantity
  const amountStr = prompt('給油量(リットル)を入力してください:');
  let fuelAmount = '';
  if (amountStr) {
    const amtNum = parseFloat(amountStr);
    fuelAmount = isNaN(amtNum) ? '' : amtNum;
  }
  // Prompt for fuel price per litre (optional)
  const priceStr = prompt('リッターあたりの値段(円)を入力してください(空白可):');
  let fuelPrice = '';
  if (priceStr) {
    const priceNum = parseFloat(priceStr);
    fuelPrice = isNaN(priceNum) ? '' : priceNum;
  }
  const type = '給油';
  const eventTime = new Date();
  const eventObj = {
    type,
    time: eventTime.toTimeString().substr(0, 5),
    location: '',
    fuelAmount: fuelAmount,
    fuelPrice: fuelPrice
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
            if (data && data.display_name) {
              eventObj.location = data.display_name;
            }
            finalize();
          })
          .catch(() => {
            finalize();
          });
      },
      () => {
        finalize();
      }
    );
  } else {
    finalize();
  }
}

// Export logs as CSV file
function exportCSV() {
  if (logs.length === 0) {
    alert('エクスポートする記録がありません。');
    return;
  }
  // Define CSV headers.  Additional columns for events and final odometer.
  const headers = [
    '日付',
    '開始時刻',
    '終了時刻',
    '目的',
    '出発地',
    '到着地',
    '距離(km)',
    '費用(円)',
    'メモ',
    'イベント',
    '最終オドメーター'
  ];
  const rows = logs.map((log) => {
    // Flatten events into a single string: time type (location) with optional fuel details
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
      log.notes.replace(/\n/g, '\\n'),
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
