const form = document.querySelector('#predictionForm');
const apiUrlInput = document.querySelector('#apiUrl');
const settingsDialog = document.querySelector('#settingsDialog');
const errorMessage = document.querySelector('#errorMessage');
const resultPanel = document.querySelector('#resultPanel');
const emptyState = document.querySelector('#emptyState');
const predictionState = document.querySelector('#predictionState');
const API_KEY = 'staywise-api-url';
const DEFAULT_API = 'http://127.0.0.1:8000';

function apiBase() { return (localStorage.getItem(API_KEY) || DEFAULT_API).replace(/\/+$/, ''); }
function setValue(name, value) { form.elements[name].value = value; }

document.querySelector('#settingsButton').addEventListener('click', () => {
  apiUrlInput.value = apiBase();
  document.querySelector('#connectionStatus').textContent = '';
  document.querySelector('#connectionStatus').className = 'connection-status';
  settingsDialog.showModal();
});
document.querySelector('#settingsForm').addEventListener('submit', event => {
  event.preventDefault();
  const value = apiUrlInput.value.trim().replace(/\/+$/, '');
  if (value) localStorage.setItem(API_KEY, value);
  settingsDialog.close();
});
document.querySelector('#checkApi').addEventListener('click', async () => {
  const status = document.querySelector('#connectionStatus');
  const base = apiUrlInput.value.trim().replace(/\/+$/, '') || DEFAULT_API;
  status.className = 'connection-status';
  status.textContent = 'Checking API…';
  try {
    const response = await fetch(`${base}/`);
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    status.textContent = 'Connected — FastAPI is responding.';
  } catch (error) {
    status.className = 'connection-status bad';
    status.textContent = 'Could not connect. Check the URL, server, and CORS settings.';
  }
});

document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
  const input = form.elements[button.dataset.step];
  input.value = Math.max(Number(input.min || 0), Math.min(Number(input.max || Infinity), Number(input.value || 0) + Number(button.dataset.change)));
}));
const availability = form.elements.availability_365;
availability.addEventListener('input', () => document.querySelector('#availabilityValue').textContent = `${availability.value} days`);

document.querySelector('#sampleButton').addEventListener('click', () => {
  const sample = {neighbourhood_group:'Manhattan',neighbourhood:'Harlem',latitude:40.8116,longitude:-73.9465,price:145,minimum_nights:2,availability_365:180,calculated_host_listings_count:1,number_of_reviews:38,reviews_per_month:1.3};
  Object.entries(sample).forEach(([key,value]) => setValue(key,value));
  document.querySelector('#availabilityValue').textContent = `${sample.availability_365} days`;
  errorMessage.style.display = 'none';
  form.classList.remove('sample-flash');
  void form.offsetWidth;
  form.classList.add('sample-flash');
});

document.querySelector('#resetButton').addEventListener('click', () => {
  form.reset();
  document.querySelector('#availabilityValue').textContent = `${availability.value} days`;
  errorMessage.style.display = 'none';
});

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
}
function renderPrediction(data) {
  const prediction = String(data.Predicted_room_type ?? 'Unknown');
  const raw = Array.isArray(data.Probability) ? data.Probability : [];
  const defaultRoomTypes = ['Entire home/apt', 'Private room', 'Shared room', 'Hotel room'];
  const classNames = Array.isArray(data.classes) ? data.classes : defaultRoomTypes;
  const probabilities = raw.map((item, index) => ({
    label: classNames[index] ?? `Class ${index + 1}`,
    value: Number(item),
    index
  })).filter(item => Number.isFinite(item.value));
  const max = Math.max(...probabilities.map(item => item.value), 0);
  const confidence = max <= 1 ? max * 100 : max;
  document.querySelector('#predictionName').textContent = prediction.replaceAll('_', ' ');
  document.querySelector('#confidenceValue').textContent = `${confidence.toFixed(1)}%`;
  document.querySelector('#confidenceFill').style.width = `${Math.max(0, Math.min(confidence,100))}%`;
  const list = document.querySelector('#probabilityList');
  list.replaceChildren();
  const classes = Array.isArray(data.classes) ? data.classes : [];
  probabilities.sort((a,b) => b.value - a.value).forEach((item, index) => {
    item.label = String(classes[item.index] ?? item.label);
    const percent = item.value <= 1 ? item.value * 100 : item.value;
    const row = document.createElement('div');
    row.className = `prob-row prob-row-${index % 4}`;
    const label = document.createElement('span');
    label.textContent = item.label.replaceAll('_',' ');
    const value = document.createElement('strong');
    value.textContent = `${percent.toFixed(1)}%`;
    const track = document.createElement('span');
    track.className = 'prob-track';
    const fill = document.createElement('i');
    track.append(fill);
    row.append(label,value,track);
    list.append(row);
    requestAnimationFrame(() => fill.style.width = `${Math.max(0,Math.min(percent,100))}%`);
  });
  if (!probabilities.length) {
    const note = document.createElement('p');
    note.className = 'dialog-help';
    note.textContent = 'The API returned no probability values.';
    list.append(note);
  }
  emptyState.classList.add('hidden');
  predictionState.classList.remove('hidden');
  resultPanel.scrollIntoView({behavior:'smooth',block:'nearest'});
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  errorMessage.style.display = 'none';
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form).entries());
  const numericFields = ['latitude','longitude','price','minimum_nights','number_of_reviews','reviews_per_month','calculated_host_listings_count','availability_365'];
  numericFields.forEach(key => values[key] = Number(values[key]));
  const button = form.querySelector('.submit-button');
  button.disabled = true;
  button.classList.add('loading');
  try {
    const response = await fetch(`${apiBase()}/predict`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(values)
    });
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) {
      const detail = data.detail;
      throw new Error(Array.isArray(detail) ? detail.map(e => `${e.loc?.at(-1) || 'Input'}: ${e.msg}`).join(' · ') : (detail || `Request failed (${response.status})`));
    }
    if (data.Predicted_room_type === undefined) throw new Error('Unexpected response. The API should return Predicted_room_type and Probability.');
    renderPrediction(data);
  } catch (error) {
    showError(error instanceof TypeError ? 'Could not reach the API. Confirm FastAPI is running and the API URL is correct in settings.' : error.message);
  } finally {
    button.disabled = false;
    button.classList.remove('loading');
  }
});

document.querySelector('#againButton').addEventListener('click', () => {
  predictionState.classList.add('hidden');
  emptyState.classList.remove('hidden');
  document.querySelector('#confidenceFill').style.width = '0';
  resultPanel.scrollIntoView({behavior:'smooth',block:'nearest'});
});
