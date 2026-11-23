const CHAT_URL = 'https://gen.pollinations.ai/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const FREE_TEXT_URL = 'https://node.proyectodescartes.org/api/ia/text';
const PROVIDERS = ['free', 'pollinations', 'openrouter', 'deepseek'];
const PROVIDER_NAMES = ['Red Descartes', 'Pollinations', 'OpenRouter', 'DeepSeek'];
const VALIDATION_URLS = { pollinations: 'https://gen.pollinations.ai/v1/models', openrouter: 'https://openrouter.ai/api/v1/key', deepseek: 'https://api.deepseek.com/models' };
const CATALOGS = {
  free: [{ value: 'openai', label: 'OpenAI (GPT)' }, { value: 'openai-fast', label: 'OpenAI Fast' }, { value: 'gemini-fast', label: 'Gemini Fast' }, { value: 'gemini-search', label: 'Gemini Search' }, { value: 'mistral', label: 'Mistral' }, { value: 'nova-fast', label: 'Nova Fast' }, { value: 'perplexity-fast', label: 'Perplexity Fast' }, { value: 'deepseek', label: 'DeepSeek' }],
  pollinations: [{ value: 'openai', label: 'GPT-5.4 Nano (Recomendado)' }, { value: 'openai/gpt-5.6-luna', label: 'openai/gpt-5.6-luna' }, { value: 'moonshotai/kimi-k2.6', label: 'moonshotai/kimi-k2.6' }, { value: 'x-ai/grok-4.3', label: 'x-ai/grok-4.3' }, { value: 'mistral-small-3.2', label: 'Mistral Small 3.2' }, { value: 'qwen-coder', label: 'Qwen3 Coder' }, { value: 'gemini-fast', label: 'Gemini Flash Lite' }],
  openrouter: [{ value: 'deepseek/deepseek-chat-v3-0324', label: 'DeepSeek V3' }, { value: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' }, { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' }, { value: 'openai/gpt-5-mini', label: 'GPT 5 Mini' }, { value: 'moonshotai/kimi-k2.6', label: 'Kimi k2.6' }, { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' }, { value: 'minimax/minimax-m3', label: 'Minimax M3' }, { value: 'mistralai/mistral-small-2603', label: 'Mistral 4 Small' }, { value: 'qwen/qwen3.5-flash-02-23', label: 'Qwen 3.5 Flash' }, { value: 'z-ai/glm-4.7-flash', label: 'GLM 4.7 Flash' }, { value: 'openrouter/free', label: 'Enrutador libre' }],
  deepseek: [{ value: 'deepseek-chat', label: 'DeepSeek Chat' }, { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' }, { value: 'deepseek-flash', label: 'DeepSeek Flash' }, { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }]
};
const DEFAULT_MODEL_INDEX = { free: 0, pollinations: 0, openrouter: 2, deepseek: 0 };
let provider = localStorage.getItem('preferred_provider') || 'free';
let controlsBound = false;
let descartesApp = null;
let responseFrameText = 'Escribe una solicitud y pulsa «Enviar» para comenzar.';

function app() { return window.descartesJS?.apps?.[0]; }
function nativeSelect(id) { return document.getElementById(`${id}_menuSelect`); }
function nativeInput(id) { return document.querySelector(`#${id} input, #${id}TextField, #${id}`); }
function nativeTextArea(id) { return document.querySelector(`#${id} textarea, #${id}TextArea, #${id}`); }
function setStatus(text, type = '') { const output = document.getElementById('response-text'); output.dataset.status = type; if (type === 'error') output.textContent = text; }
function keyRequired() { return provider !== 'free'; }
function readValue(control) { return typeof control?.value === 'string' ? control.value.trim() : ''; }
function showResponse(text) {
  responseFrameText = String(text ?? '');
  const output = document.getElementById('response-text');
  if (output) output.textContent = responseFrameText;
  postResponseToFrame();
}
function responseFrames() {
  const frames = [];
  const space = descartesApp?.spaces?.find(item => item.id === 'Respuesta');
  if (space?.MyIFrame) frames.push(space.MyIFrame);
  document.querySelectorAll('#Respuesta iframe, .DescartesSpaceIframeContainer iframe').forEach(frame => {
    if (!frames.includes(frame)) frames.push(frame);
  });
  return frames;
}
function updateFrameDocument(frame) {
  try {
    const output = frame?.contentDocument?.getElementById('response-text');
    if (output) output.textContent = responseFrameText;
  } catch (_) {
    // Cross-origin documents use the postMessage fallback below.
  }
}
function postResponseToFrame() {
  const deliver = () => {
    const setResponse = descartesApp?.evaluator?.getFunction?.('Respuesta.set');
    if (typeof setResponse === 'function') {
      setResponse('response', responseFrameText);
      return;
    }
    responseFrames().forEach(frame => {
      if (!frame?.contentWindow) return;
      updateFrameDocument(frame);
      const message = { type: 'descartes-response', text: responseFrameText };
      frame.contentWindow.postMessage(message, '*');
      frame.contentWindow.postMessage({ type: 'set', name: 'response', value: responseFrameText }, '*');
    });
  };
  deliver();
  [100, 500, 1000].forEach(delay => window.setTimeout(deliver, delay));
}
function bindResponseFrame() {
  responseFrames().forEach(frame => frame.addEventListener('load', postResponseToFrame));
  window.addEventListener('message', event => {
    if (event.data?.type !== 'descartes-response-ready') return;
    postResponseToFrame();
  });
}
function evaluatorValue(name) {
  try { return descartesApp?.evaluator.getVariable(name); } catch (_) { return ''; }
}
function syncProviderFromScene() {
  const index = Number(evaluatorValue('provider'));
  if (Number.isInteger(index) && PROVIDERS[index]) provider = PROVIDERS[index];
}
function currentKey() { return readValue(nativeInput('apiKey')) || String(evaluatorValue('apiKey') || '').trim(); }
function currentModel() {
  const index = Number(evaluatorValue('textModel'));
  return CATALOGS[provider]?.[index]?.value || CATALOGS[provider]?.[0]?.value;
}

function updateModelMenu() {
  const catalog = CATALOGS[provider];
  if (!descartesApp || !catalog) return;
  descartesApp.evaluator.setVariable('textModel', DEFAULT_MODEL_INDEX[provider] || 0);
  descartesApp.update();
}

function selectProvider(event) {
  const index = Number(event.target.value) || 0;
  provider = PROVIDERS[index] || 'free';
  localStorage.setItem('preferred_provider', provider);
  const key = nativeInput('apiKey');
  if (key) key.value = localStorage.getItem(`${provider}_api_key`) || '';
  updateModelMenu();
}

async function requestAnswer(prompt) {
  const key = currentKey();
  if (keyRequired() && !key) throw new Error(`Introduce la API key de ${PROVIDER_NAMES[PROVIDERS.indexOf(provider)]}.`);
  const model = currentModel();
  const headers = { 'Content-Type': 'application/json' };
  let url = CHAT_URL;
  let body;
  if (provider === 'free') { url = FREE_TEXT_URL; body = { prompt, model, system: 'Responde en español de forma clara y útil.', json: false }; }
  else {
    headers.Authorization = `Bearer ${key}`;
    if (provider === 'openrouter') { url = OPENROUTER_URL; headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'Chatbot Red Descartes'; }
    if (provider === 'deepseek') url = 'https://api.deepseek.com/chat/completions';
    body = { model, messages: [{ role: 'system', content: 'Responde en español de forma clara y útil.' }, { role: 'user', content: prompt }], temperature: 0.3 };
  }
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const raw = await response.text();
  let payload; try { payload = JSON.parse(raw); } catch { payload = raw; }
  if (!response.ok) throw new Error(payload?.error?.message || `La API respondió HTTP ${response.status}`);
  const content = payload?.choices?.[0]?.message?.content || payload?.response || payload?.text || payload?.data || payload;
  return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
}

async function sendPrompt() {
  syncProviderFromScene();
  const prompt = readValue(nativeTextArea('prompt')) || String(evaluatorValue('prompt') || '').trim();
  if (!prompt) { showResponse('Escribe una solicitud antes de pulsar «Enviar».'); return; }
  if (keyRequired() && !currentKey()) {
    showResponse(`Introduce la API key de ${PROVIDER_NAMES[PROVIDERS.indexOf(provider)]} antes de continuar.`);
    nativeInput('apiKey')?.focus();
    return;
  }
  showResponse('Procesando solicitud y esperando la respuesta de la IA...');
  try { showResponse(await requestAnswer(prompt)); localStorage.setItem(`${provider}_api_key`, currentKey()); }
  catch (error) { showResponse(`No se pudo obtener una respuesta.\n\n${error.message}`); }
}

function bindSceneControls(event) {
  if (controlsBound) return;
  descartesApp = event?.detail || app();
  const providerSelect = nativeSelect('provider');
  const send = document.getElementById('send');
  if (!descartesApp || !providerSelect || !send) return;
  controlsBound = true;
  bindResponseFrame();
  descartesApp.evaluator.setFunction('sendPrompt', () => { sendPrompt(); return 0; });
  providerSelect?.addEventListener('change', selectProvider);
  const savedIndex = Math.max(0, PROVIDERS.indexOf(provider));
  if (providerSelect) providerSelect.value = String(savedIndex);
  descartesApp.evaluator.setVariable('provider', savedIndex);
  descartesApp.update();
  const key = nativeInput('apiKey');
  if (key) {
    key.value = localStorage.getItem(`${provider}_api_key`) || '';
    key.addEventListener('input', () => {
      if (key.value.trim()) localStorage.setItem(`${provider}_api_key`, key.value.trim());
      else localStorage.removeItem(`${provider}_api_key`);
    });
  }
  updateModelMenu();
}

window.addEventListener('descartesReady', bindSceneControls, { once: true });
window.addEventListener('DOMContentLoaded', () => setTimeout(() => bindSceneControls({ detail: app() }), 250), { once: true });
bindSceneControls({ detail: app() });
