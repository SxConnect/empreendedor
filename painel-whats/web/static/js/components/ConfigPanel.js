import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import htm from 'htm';
import { testApiKey } from '../services/api.js';
import { ModelSelect } from './ModelSelect.js';

const html = htm.bind(h);

function Section({ title, children }) {
  return html`
    <div class="bg-white rounded-xl p-5 border border-wa-border shadow-sm">
      ${title ? html`
        <h3 class="text-xs font-semibold text-wa-secondary uppercase tracking-wider mb-4">${title}</h3>
      ` : null}
      <div class="flex flex-col gap-4">
        ${children}
      </div>
    </div>
  `;
}

export function ConfigPanel({ config, saving, onSave, onNotify }) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [audioModel, setAudioModel] = useState('');
  const [imageModel, setImageModel] = useState('');
  const [llmProvider, setLlmProvider] = useState('');
  const [localLlmUrl, setLocalLlmUrl] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [autoReply, setAutoReply] = useState(true);
  const [maxContext, setMaxContext] = useState(10);
  const [batchDelay, setBatchDelay] = useState(3);
  const [splitMessages, setSplitMessages] = useState(true);
  const [splitDelay, setSplitDelay] = useState(2);
  const [audioTranscriptionEnabled, setAudioTranscriptionEnabled] = useState(true);
  const [imageTranscriptionEnabled, setImageTranscriptionEnabled] = useState(true);
  const [transferAlertEnabled, setTransferAlertEnabled] = useState(true);
  const [transferAlertDuration, setTransferAlertDuration] = useState(5);
  const [maxExecutions, setMaxExecutions] = useState(200);
  const [defaultAiEnabled, setDefaultAiEnabled] = useState(true);
  const [testing, setTesting] = useState(false);
  const [webPassword, setWebPassword] = useState('');
  const [webPasswordConfirm, setWebPasswordConfirm] = useState('');
  const [removePassword, setRemovePassword] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [promptFullscreen, setPromptFullscreen] = useState(false);

  useEffect(() => {
    if (config) {
      setApiKey('');
      setModel(config.model || '');
      setAudioModel(config.audio_model || '');
      setImageModel(config.image_model || '');
      setSystemPrompt(config.system_prompt || '');
      setAutoReply(config.auto_reply ?? true);
      setMaxContext(config.max_context_messages ?? 10);
      setBatchDelay(config.message_batch_delay ?? 3);
      setSplitMessages(config.split_messages ?? true);
      setSplitDelay(config.split_message_delay ?? 2);
      setAudioTranscriptionEnabled(config.audio_transcription_enabled ?? true);
      setImageTranscriptionEnabled(config.image_transcription_enabled ?? true);
      setTransferAlertEnabled(config.transfer_alert_enabled ?? true);
      setTransferAlertDuration(config.transfer_alert_duration ?? 5);
      setMaxExecutions(config.max_executions ?? 200);
      setDefaultAiEnabled(config.default_ai_enabled ?? true);
      setLlmProvider(config.llm_provider || 'openrouter');
      setLocalLlmUrl(config.local_llm_url || 'http://localhost:20128/v1');
      }
  }, [config]);

  async function handleTestKey() {
    const key = apiKey.trim();
    if (!key) {
      onNotify('Insira uma API key primeiro.');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testApiKey(key);
      if (res.ok) {
        setTestResult({ ok: res.data.valid, message: res.data.message });
        onNotify(res.data.message);
        if (res.data.valid) {
          await onSave({ openrouter_api_key: key });
        }
      } else {
        setTestResult({ ok: false, message: res.error || 'Erro ao testar.' });
        onNotify(res.error || 'Erro ao testar.');
      }
    } catch {
      setTestResult({ ok: false, message: 'Erro de conexão.' });
      onNotify('Erro de conexão.');
    }
    setTesting(false);
  }

  async function handleSave() {
    const data = {
      model: model.trim() || 'openai/gpt-4o-mini',
      audio_model: audioModel.trim() || 'google/gemini-2.0-flash-001',
      image_model: imageModel.trim() || 'google/gemini-2.0-flash-001',
      system_prompt: systemPrompt,
      auto_reply: autoReply,
      max_context_messages: parseInt(maxContext, 10) || 10,
      message_batch_delay: isNaN(parseFloat(batchDelay)) ? 0 : parseFloat(batchDelay),
      split_messages: splitMessages,
      split_message_delay: isNaN(parseFloat(splitDelay)) ? 0 : parseFloat(splitDelay),
      audio_transcription_enabled: audioTranscriptionEnabled,
      image_transcription_enabled: imageTranscriptionEnabled,
      transfer_alert_enabled: transferAlertEnabled,
      transfer_alert_duration: parseInt(transferAlertDuration, 10) || 5,
      max_executions: parseInt(maxExecutions, 10) || 200,
      default_ai_enabled: defaultAiEnabled,
      llm_provider: llmProvider || 'openrouter',
      local_llm_url: localLlmUrl || 'http://localhost:20128/v1',
    };
    if (apiKey.trim()) {
      data.openrouter_api_key = apiKey.trim();
    }
    if (removePassword) {
      data.web_password = '';
    } else if (webPassword.trim()) {
      if (webPassword !== webPasswordConfirm) {
        onNotify('As senhas não coincidem.');
        return;
      }
      data.web_password = webPassword;
    }
    setSaveSuccess(false);
    const result = await onSave(data);
    if (result !== false) {
      setSaveSuccess(true);
      setWebPassword('');
      setWebPasswordConfirm('');
      setRemovePassword(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  }

  if (!config) {
    return html`<div class="bg-white rounded-xl p-5 animate-pulse-slow text-wa-secondary border border-wa-border">Carregando...</div>`;
  }

  return html`
    <div class="flex flex-col gap-4 flex-1">

      <!-- Section: Automacao -->
      <${Section} title="Automação">
        <label class="flex items-center gap-3 text-sm font-semibold text-wa-text cursor-pointer p-3 rounded-lg border ${autoReply ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}">
          <input
            type="checkbox"
            checked=${autoReply}
            onChange=${(e) => setAutoReply(e.target.checked)}
            class="w-4 h-4 rounded border-wa-border accent-wa-teal"
          />
          Ativar agente de IA para responder mensagens
        </label>

        <label class="flex items-center gap-3 text-sm font-semibold text-wa-text cursor-pointer p-3 rounded-lg border ${defaultAiEnabled ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}">
          <input
            type="checkbox"
            checked=${defaultAiEnabled}
            onChange=${(e) => setDefaultAiEnabled(e.target.checked)}
            class="w-4 h-4 rounded border-wa-border accent-wa-teal"
          />
          IA ativada por padrão para novos contatos
        </label>
      <//>

      <!-- Section: API e Modelos -->
      <${Section} title="API e Modelos">
        <!-- Provedor LLM -->
        <label class="block text-sm font-semibold text-wa-text mb-1">Provedor de IA</label>
        <select
          value=${llmProvider}
          onChange=${(e) => setLlmProvider(e.target.value)}
          class="w-full rounded-lg border border-wa-border bg-white px-3 py-2 text-sm text-wa-text"
        >
          <option value="openrouter">OpenRouter</option>
          <option value="omniroute">OmniRoute</option>
          <option value="hermes">Hermes</option>
        </select>
        ${llmProvider === 'omniroute' || llmProvider === 'hermes' ? html`
          <div class="mt-3">
            <label class="block text-sm font-semibold text-wa-text mb-1">URL base OpenAI compatível</label>
            <input
              type="text"
              value=${localLlmUrl}
              onInput=${(e) => setLocalLlmUrl(e.target.value)}
              placeholder="http://localhost:20128/v1"
              class="w-full rounded-lg border border-wa-border bg-white px-3 py-2 text-sm text-wa-text"
            />
            <p class="text-xs text-wa-secondary mt-1">
              ${llmProvider === 'hermes'
                ? 'Sem API key; o Hermes assume com seus agentes atuais.'
                : 'Informe a URL do seu OmniRoute, ex: http://localhost:20128/v1'}
            </p>
          </div>
        ` : null}

        <!-- API Key -->
        <div>
          <label class="block text-sm font-semibold text-wa-text mb-1">API Key</label>
          <div class="flex gap-2">
            <input
              type="password"
              value=${apiKey}
              onInput=${(e) => setApiKey(e.target.value)}
              placeholder=${config.openrouter_api_key || 'sk-or-...'}
              disabled=${llmProvider === 'hermes'}
              class="flex-1 bg-wa-panel text-wa-text px-3 py-2 rounded-lg text-sm border border-wa-border focus:border-wa-teal focus:outline-none disabled:opacity-60"
            />
            <button
              onClick=${handleTestKey}
              disabled=${testing || llmProvider === 'hermes'}
              class="px-4 py-2 bg-wa-panel hover:bg-wa-hover disabled:opacity-50 text-wa-text text-sm rounded-lg transition-colors whitespace-nowrap border border-wa-border"
            >
              ${testing ? '...' : 'Testar'}
            </button>
          </div>
          ${testResult ? html`
            <p class="text-xs mt-1 ${testResult.ok ? 'text-green-600' : 'text-red-500'}">
              ${testResult.ok ? '\u2713' : '\u2717'} ${testResult.message}
            </p>
          ` : config.openrouter_api_key ? html`
            <p class="text-xs mt-1 text-wa-secondary">Chave salva: ${config.openrouter_api_key}</p>
          ` : null}
        </div>

        <!-- Model -->
        <div>
          <label class="block text-sm font-semibold text-wa-text mb-1">Modelo de IA (chat)</label>
          <${ModelSelect}
            value=${model}
            onChange=${setModel}
            disabled=${llmProvider === 'hermes'}
            placeholder="openai/gpt-4o-mini"
          />
        </div>

        <!-- Audio & Image models -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-semibold text-wa-text mb-1">Modelo transcrição áudio</label>
            <${ModelSelect}
              value=${audioModel}
              onChange=${setAudioModel}
              disabled=${llmProvider === 'hermes'}
              placeholder="google/gemini-2.0-flash-001"
            />
          </div>
          <div>
            <label class="block text-sm font-semibold text-wa-text mb-1">Modelo transcrição imagem</label>
            <${ModelSelect}
              value=${imageModel}
              onChange=${setImageModel}
              placeholder="google/gemini-2.0-flash-001"
            />
          </div>
        </div>

        ${llmProvider !== 'hermes' ? html`
        <!-- System Prompt -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="block text-sm font-semibold text-wa-text">Prompt do sistema</label>
            <button
              onClick=${() => setPromptFullscreen((v) => !v)}
              class="text-xs text-wa-secondary hover:text-wa-text"
            >
              ${promptFullscreen ? 'Recolher' : 'Expandir'}
            </button>
          </div>
          <textarea
            value=${systemPrompt}
            onInput=${(e) => setSystemPrompt(e.target.value)}
            rows=${promptFullscreen ? 12 : 4}
            class="w-full bg-white text-wa-text px-3 py-2 rounded-lg text-sm border border-wa-border focus:border-wa-teal focus:outline-none"
          ></textarea>
        </div>
        ` : null}
      <//>

      <!-- Section: Comportamento -->
      <${Section} title="Comportamento">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-semibold text-wa-text mb-1">Mensagens no contexto</label>
            <input
              type="number"
              min="1"
              max="30"
              step="1"
              value=${maxContext}
              onInput=${(e) => setMaxContext(e.target.value)}
              class="w-full bg-white text-wa-text px-3 py-2 rounded-lg text-sm border border-wa-border focus:border-wa-teal focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-sm font-semibold text-wa-text mb-1">Lote de espera (s)</label>
            <input
              type="number"
              min="0"
              max="15"
              step="0.5"
              value=${batchDelay}
              onInput=${(e) => setBatchDelay(e.target.value)}
              class="w-full bg-white text-wa-text px-3 py-2 rounded-lg text-sm border border-wa-border focus:border-wa-teal focus:outline-none"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-semibold text-wa-text mb-1">Atraso min. resposta (s)</label>
            <input
              type="number"
              min="0"
              max="10"
              step="0.5"
              value=${config.response_delay_min ?? 1}
              disabled
              class="w-full bg-gray-50 text-wa-text px-3 py-2 rounded-lg text-sm border border-wa-border"
            />
          </div>
          <div>
            <label class="block text-sm font-semibold text-wa-text mb-1">Atraso max. resposta (s)</label>
            <input
              type="number"
              min="0"
              max="20"
              step="0.5"
              value=${config.response_delay_max ?? 3}
              disabled
              class="w-full bg-gray-50 text-wa-text px-3 py-2 rounded-lg text-sm border border-wa-border"
            />
          </div>
        </div>

        <label class="flex items-center gap-3 text-sm font-semibold text-wa-text cursor-pointer p-3 rounded-lg border ${splitMessages ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}">
          <input
            type="checkbox"
            checked=${splitMessages}
            onChange=${(e) => setSplitMessages(e.target.checked)}
            class="w-4 h-4 rounded border-wa-border accent-wa-teal"
          />
          Dividir mensagens longas
        </label>
        ${splitMessages ? html`
          <div>
            <label class="block text-sm font-semibold text-wa-text mb-1">Intervalo entre partes (s)</label>
            <input
              type="number"
              min="0"
              max="10"
              step="0.5"
              value=${splitDelay}
              onInput=${(e) => setSplitDelay(e.target.value)}
              class="w-full bg-white text-wa-text px-3 py-2 rounded-lg text-sm border border-wa-border focus:border-wa-teal focus:outline-none"
            />
          </div>
        ` : null}

        <label class="flex items-center gap-3 text-sm font-semibold text-wa-text cursor-pointer p-3 rounded-lg border ${audioTranscriptionEnabled ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}">
          <input
            type="checkbox"
            checked=${audioTranscriptionEnabled}
            onChange=${(e) => setAudioTranscriptionEnabled(e.target.checked)}
            class="w-4 h-4 rounded border-wa-border accent-wa-teal"
          />
          Transcrever áudio
        </label>
        <label class="flex items-center gap-3 text-sm font-semibold text-wa-text cursor-pointer p-3 rounded-lg border ${imageTranscriptionEnabled ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}">
          <input
            type="checkbox"
            checked=${imageTranscriptionEnabled}
            onChange=${(e) => setImageTranscriptionEnabled(e.target.checked)}
            class="w-4 h-4 rounded border-wa-border accent-wa-teal"
          />
          Transcrever imagem
        </label>
      <//>

      <!-- Section: Transferencia -->
      <${Section} title="Transferência">
        <label class="flex items-center gap-3 text-sm font-semibold text-wa-text cursor-pointer p-3 rounded-lg border ${transferAlertEnabled ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}">
          <input
            type="checkbox"
            checked=${transferAlertEnabled}
            onChange=${(e) => setTransferAlertEnabled(e.target.checked)}
            class="w-4 h-4 rounded border-wa-border accent-wa-teal"
          />
          Alerta sonoro ao transferir para humano
        </label>
        <span class="text-xs text-wa-secondary">Emite um alerta sonoro quando a IA transfere o atendimento para um humano</span>
        ${transferAlertEnabled ? html`
          <div class="mt-1">
            <label class="block text-xs font-medium text-wa-text mb-1">Duração do alerta (segundos)</label>
            <input
              type="number"
              min="1"
              max="30"
              step="1"
              value=${transferAlertDuration}
              onInput=${(e) => setTransferAlertDuration(e.target.value)}
              class="w-32 bg-white text-wa-text px-3 py-1.5 rounded-lg text-sm border border-wa-border focus:border-wa-teal focus:outline-none"
            />
          </div>
        ` : null}
      <//>

      <!-- Section: Avancado -->
      <${Section} title="Avançado">
        <!-- Max Executions -->
        <div>
          <label class="block text-sm font-semibold text-wa-text mb-1">Execuções salvas</label>
          <input
            type="number"
            min="10"
            max="10000"
            step="10"
            value=${maxExecutions}
            onInput=${(e) => setMaxExecutions(e.target.value)}
            class="w-full bg-wa-panel text-wa-text px-3 py-2 rounded-lg text-sm border border-wa-border focus:border-wa-teal focus:outline-none"
          />
          <span class="text-xs text-wa-secondary">Quantidade máxima de execuções e payloads mantidos no banco</span>
        </div>

        <!-- Panel Password -->
        <div class="flex flex-col gap-2 p-3 bg-wa-panel rounded-lg border border-wa-border">
          <div class="flex items-center justify-between">
            <label class="text-sm font-semibold text-wa-text">Senha do Painel</label>
            ${config.has_password ? html`
              <span class="text-xs bg-wa-teal text-white px-2 py-0.5 rounded-full">Ativa</span>
            ` : html`
              <span class="text-xs bg-wa-secondary/20 text-wa-secondary px-2 py-0.5 rounded-full">Desativada</span>
            `}
          </div>
          <span class="text-xs text-wa-secondary">Protege o acesso ao painel web com senha</span>
          ${!removePassword ? html`
            <input
              type="password"
              value=${webPassword}
              onInput=${(e) => setWebPassword(e.target.value)}
              placeholder=${config.has_password ? 'Nova senha (deixe vazio para manter)' : 'Definir senha'}
              class="w-full bg-white text-wa-text px-3 py-2 rounded-lg text-sm border border-wa-border focus:border-wa-teal focus:outline-none"
            />
            ${webPassword ? html`
              <input
                type="password"
                value=${webPasswordConfirm}
                onInput=${(e) => setWebPasswordConfirm(e.target.value)}
                placeholder="Confirmar senha"
                class="w-full bg-white text-wa-text px-3 py-2 rounded-lg text-sm border border-wa-border focus:border-wa-teal focus:outline-none ${webPassword && webPasswordConfirm && webPassword !== webPasswordConfirm ? 'border-red-400' : ''}"
              />
              ${webPassword && webPasswordConfirm && webPassword !== webPasswordConfirm ? html`
                <span class="text-xs text-red-500">As senhas não coincidem</span>
              ` : null}
            ` : null}
          ` : null}
          ${config.has_password ? html`
            <label class="flex items-center gap-2 text-sm text-red-600 cursor-pointer mt-1">
              <input
                type="checkbox"
                checked=${removePassword}
                onChange=${(e) => { setRemovePassword(e.target.checked); if (e.target.checked) { setWebPassword(''); setWebPasswordConfirm(''); } }}
                class="w-4 h-4 rounded border-wa-border accent-red-600"
              />
              Remover senha
            </label>
          ` : null}
        </div>
      <//>

      <!-- Save Button -->
      <div class="flex flex-col gap-1">
        <button
          onClick=${handleSave}
          disabled=${saving}
          class="w-full py-2.5 ${saveSuccess ? 'bg-green-600' : 'bg-wa-teal hover:bg-wa-tealDark'} disabled:opacity-50 text-white font-medium rounded-lg transition-colors shadow-sm"
        >
          ${saving ? 'Salvando...' : saveSuccess ? '\u2713 Salvo!' : 'Salvar Configurações'}
        </button>
      </div>
    </div>
  `;
}
