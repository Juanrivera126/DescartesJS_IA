const GENERATE_URL = 'https://enter.pollinations.ai/api/generate/image/';
const ASPECT_RATIOS = [
  { value: '1:1', width: 1024, height: 1024 },
  { value: '16:9', width: 1280, height: 720 },
  { value: '3:4', width: 768, height: 1024 }
];
const PROVIDERS = ['free', 'pollinations', 'openrouter'];
const PROVIDER_NAMES = ['Red Descartes', 'Pollinations', 'OpenRouter'];
const CATALOGS = {
  free: [
    ['zimage', 'zimage (Rápido)'], ['flux', 'flux (Detallado)'], ['gptimage', 'GPT image 1 (Creativo)'],
    ['klein', 'klein (Realista)'], ['black-forest-labs/flux-3-image-klein', 'Flux 3 Image (Nuevo)'], ['recraft/recraft-v4.1-flash', 'Recraft 4.1']
  ],
  pollinations: [
    ['zimage', 'zimage (Rápido / Muy permisivo)'], ['krea/krea-2-medium', 'krea/krea-2-medium (Artístico)'],
    ['black-forest-labs/flux.2-pro', 'flux.2-pro (Alta fidelidad)'], ['x-ai/grok-imagine-image', 'grok-imagine-image (Grok)'],
    ['ideogram-ai/ideogram-v4-turbo', 'ideogram-v4-turbo'], ['alibaba/wan-2.7-image-pro', 'wan-2.7-image-pro'],
    ['openai/gpt-image-2.5-flare', 'gpt-image-2.5-flare (OpenAI)'], ['openai/gpt-image-2.5-sunburst', 'gpt-image-2.5-sunburst (OpenAI)'],
    ['klein', 'klein (Realista)'], ['gptimage', 'gptimage (Creativo)']
  ],
  openrouter: [
    ['google/gemini-2.5-flash-image', 'Gemini 2.5 Flash Image'], ['openai/gpt-5-image-mini', 'GPT Image mini'],
    ['google/gemini-3.1-flash-image-preview', 'Gemini 3.1 Flash Image'], ['openai/gpt-5.4-image-2', 'GPT Image 2'],
    ['black-forest-labs/flux.2-klein-4b', 'Klein'], ['microsoft/mai-image-2.5', 'MAI Image 2.5'],
    ['x-ai/grok-imagine-image-quality', 'Grok xAI'], ['recraft/recraft-v4.1-vector', 'Recraft V4.1'],
    ['bytedance-seed/seedream-4.5', 'Seedream 4.5'], ['black-forest-labs/flux.2-flex', 'Flux.2 Flex']
  ]
};
const DEFAULT_MODEL_INDEX = { free: 0, pollinations: 0, openrouter: 0 };
let provider = PROVIDERS.includes(localStorage.getItem('preferred_provider')) ? localStorage.getItem('preferred_provider') : 'pollinations';
let controlsBound = false;
let descartesApp = null;
let responseFrameText = '';
let responseFrameImage = '';
let generatedImages = [];

function app() { return window.descartesJS?.apps?.[0]; }
function nativeSelect(id) { return document.getElementById(`${id}_menuSelect`); }
function nativeInput(id) { return document.querySelector(`#${id} input, #${id}TextField, #${id}`); }
function nativeTextArea(id) { return document.querySelector(`#${id} textarea, #${id}TextArea, #${id}`); }
function readValue(control) { return typeof control?.value === 'string' ? control.value.trim() : ''; }
function maskApiKeyField() {
  document.querySelectorAll('#apiKey input, #apiKeyfield, #apiKeyTextField, input[id="apiKey"]').forEach(field => {
    if (field instanceof HTMLInputElement) {
      field.type = 'password';
      field.style.webkitTextSecurity = 'disc';
      field.style.textSecurity = 'disc';
      field.autocomplete = 'off';
    }
  });
}
function keyRequired() { return provider !== 'free'; }
function currentKey() { return readValue(nativeInput('apiKey')) || String(evaluatorValue('apiKey') || '').trim(); }
function evaluatorValue(name) { try { return descartesApp?.evaluator.getVariable(name); } catch (_) { return ''; } }
function currentModel() { return CATALOGS[provider]?.[Number(evaluatorValue('imageModel'))]?.[0] || CATALOGS[provider]?.[0]?.[0]; }
function currentAspectRatio() { return ASPECT_RATIOS[Number(evaluatorValue('RA'))] || ASPECT_RATIOS[2]; }

function responseFrames() {
  const frames = [];
  const space = descartesApp?.spaces?.find(item => item.id === 'Respuesta');
  if (space?.MyIFrame) frames.push(space.MyIFrame);
  document.querySelectorAll('#Respuesta iframe, .DescartesSpaceIframeContainer iframe').forEach(frame => { if (!frames.includes(frame)) frames.push(frame); });
  return frames;
}
function postResponseToFrame() {
  const deliver = () => responseFrames().forEach(frame => {
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(responseFrameImage ? { type: 'descartes-image-response', src: responseFrameImage, images: generatedImages, status: responseFrameText } : { type: 'descartes-response', text: responseFrameText }, '*');
  });
  deliver();
  [100, 500, 1000].forEach(delay => window.setTimeout(deliver, delay));
}
function showMessage(text) {
  responseFrameText = String(text || '');
  // Keep the last image and gallery available while a new request is pending or fails.
  if (!responseFrameImage || generatedImages.length === 0) responseFrameImage = '';
  postResponseToFrame();
}
function showImage(src) {
  responseFrameText = '';
  responseFrameImage = String(src || '');
  if (responseFrameImage && !generatedImages.includes(responseFrameImage)) generatedImages.push(responseFrameImage);
  postResponseToFrame();
}
function blobToDataUrl(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); }

function syncProviderFromScene() { const index = Number(evaluatorValue('provider')); if (Number.isInteger(index) && PROVIDERS[index]) provider = PROVIDERS[index]; }
function updateModelMenu() { if (!descartesApp) return; descartesApp.evaluator.setVariable('imageModel', DEFAULT_MODEL_INDEX[provider]); descartesApp.update(); }
function selectProvider(event) {
  provider = PROVIDERS[Number(event.target.value)] || 'pollinations';
  localStorage.setItem('preferred_provider', provider);
  const key = nativeInput('apiKey');
  if (key) key.value = localStorage.getItem(`${provider}_api_key`) || '';
  updateModelMenu();
}

async function requestImage(prompt) {
  const key = currentKey();
  if (keyRequired() && !key) throw new Error(`Introduce la API key de ${PROVIDER_NAMES[PROVIDERS.indexOf(provider)]}.`);
  const model = currentModel();
  const aspectRatio = currentAspectRatio();
  const seed = Math.floor(Math.random() * 1000000);
  if (provider === 'free') {
    const response = await fetch('https://node.proyectodescartes.org/api/ia/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, model, seed, aspectRatio: aspectRatio.value, width: aspectRatio.width, height: aspectRatio.height }) });
    if (!response.ok) throw new Error(`La API de Red Descartes respondió HTTP ${response.status}`);
    return blobToDataUrl(await response.blob());
  }
  if (provider === 'pollinations') {
    const query = `model=${encodeURIComponent(model)}&seed=${seed}&aspectRatio=${encodeURIComponent(aspectRatio.value)}&width=${aspectRatio.width}&height=${aspectRatio.height}&nologo=true`;
    let response = await fetch(`${GENERATE_URL}${encodeURIComponent(prompt)}?key=${encodeURIComponent(key)}&${query}`);
    if (!response.ok && response.status === 401) response = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${query}`);
    if (!response.ok) throw new Error(`La API de Pollinations respondió HTTP ${response.status}`);
    return blobToDataUrl(await response.blob());
  }
  const pureImage = ['black-forest-labs/flux.2-klein-4b', 'microsoft/mai-image-2.5', 'x-ai/grok-imagine-image-quality', 'recraft/recraft-v4.1-vector', 'bytedance-seed/seedream-4.5', 'black-forest-labs/flux.2-flex'].includes(model);
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'HTTP-Referer': location.origin, 'X-Title': 'Chatbot Red Descartes' }, body: JSON.stringify({ model, modalities: pureImage ? ['image'] : ['image', 'text'], messages: [{ role: 'user', content: prompt }], ...(!pureImage ? { image_config: { aspect_ratio: aspectRatio.value } } : {}) }) });
  if (!response.ok) throw new Error(`OpenRouter respondió HTTP ${response.status}`);
  const message = (await response.json()).choices?.[0]?.message;
  const image = message?.images?.[0]?.image_url?.url || message?.images?.[0]?.imageUrl?.url || (Array.isArray(message?.content) ? message.content.find(part => part.type === 'image_url')?.image_url?.url : null);
  if (!image) throw new Error('OpenRouter no devolvió una imagen');
  return image.startsWith('data:') ? image : blobToDataUrl(await (await fetch(image)).blob());
}

async function sendPrompt() {
  syncProviderFromScene();
  const prompt = readValue(nativeTextArea('prompt')) || String(evaluatorValue('prompt') || '').trim();
  if (!prompt) { showMessage('Escribe una solicitud antes de pulsar «Enviar».'); return; }
  if (keyRequired() && !currentKey()) { showMessage(`Introduce la API key de ${PROVIDER_NAMES[PROVIDERS.indexOf(provider)]} antes de continuar.`); nativeInput('apiKey')?.focus(); return; }
  showMessage('¡Generando imagen!');
  try { showImage(await requestImage(prompt)); if (currentKey()) localStorage.setItem(`${provider}_api_key`, currentKey()); }
  catch (error) { showMessage(`No se pudo generar la imagen.\n\n${error.message}`); }
}

function bindResponseFrame() { responseFrames().forEach(frame => frame.addEventListener('load', postResponseToFrame)); window.addEventListener('message', event => { if (event.data?.type === 'descartes-response-ready') postResponseToFrame(); }); }
function bindSceneControls(event) {
  if (controlsBound) return;
  descartesApp = event?.detail || app();
  const providerSelect = nativeSelect('provider');
  const send = document.getElementById('send');
  if (!descartesApp || !providerSelect || !send) return;
  controlsBound = true;
  bindResponseFrame();
  descartesApp.evaluator.setFunction('sendPrompt', () => { sendPrompt(); return 0; });
  providerSelect.addEventListener('change', selectProvider);
  const savedIndex = Math.max(0, PROVIDERS.indexOf(provider));
  providerSelect.value = String(savedIndex);
  descartesApp.evaluator.setVariable('provider', savedIndex);
  const key = nativeInput('apiKey');
  if (key) {
    key.value = localStorage.getItem(`${provider}_api_key`) || '';
    key.addEventListener('input', () => key.value.trim() ? localStorage.setItem(`${provider}_api_key`, key.value.trim()) : localStorage.removeItem(`${provider}_api_key`));
  }
  maskApiKeyField();
  new MutationObserver(maskApiKeyField).observe(document.body, { childList: true, subtree: true });
  updateModelMenu();
}
window.addEventListener('descartesReady', bindSceneControls, { once: true });
window.addEventListener('DOMContentLoaded', () => setTimeout(() => bindSceneControls({ detail: app() }), 250), { once: true });
bindSceneControls({ detail: app() });
