const API_BASE = 'http://127.0.0.1:9000';
const DOC_URL = API_BASE + '/documentacao';
const HERMES_DOC_URL = 'https://github.com/SxConnect/hermes-agent-docs';
const main = document.getElementById('main');

function navItems() {
  return Array.from(document.querySelectorAll('.nav-item'));
}

function setActive(page) {
  navItems().forEach(function (el) {
    var p = el.getAttribute('data-page');
    if (p === page) el.classList.add('active');
    else el.classList.remove('active');
  });
}

function html(strings) {
  var values = Array.prototype.slice.call(arguments, 1);
  return strings.reduce(function (acc, s, i) {
    return acc + s + (values[i] != null ? String(values[i]) : '');
  }, '');
}

function card(title, subtitle, body) {
  return html`<div class="card">
    <div class="card-head">
      <div>
        <div class="title">${title}</div>
        ${subtitle ? html`<div class="subtitle">${subtitle}</div>` : ''}
      </div>
    </div>
    <div class="stack">${body}</div>
  </div>`;
}

function escape(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function kvRow(label, value) {
  return html`<div class="row"><div class="k">${label}</div><div class="v">${value != null ? value : '—'}</div></div>`;
}

function setHealth(data) {
  var dot = document.getElementById('health-dot');
  var text = document.getElementById('health-text');
  if (!dot || !text) return;
  var ok = !!(data && (data.gateway_running || data.updated_at || data.config_path || data.hermes_home));
  dot.style.background = ok ? 'var(--ok)' : 'var(--danger)';
  text.textContent = ok ? 'Backend ativo' : 'Backend indisponível';
}

async function fetchJSON(path) {
  var res = await fetch(API_BASE + path, { mode: 'cors' });
  if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
  return await res.json();
}

function loadHomeMetrics(){
  Promise.all([
    fetch('/api/status').then(function(r){ return r.ok ? r.json() : {}; }).catch(function(){ return {}; }),
    fetch('http://127.0.0.1:9002/api/wa-contacts').then(function(r){ return r.ok ? r.json() : {}; }).catch(function(){ return {}; }),
    fetch('http://127.0.0.1:8080/health').then(function(r){ return r.ok ? r.json() : {}; }).catch(function(){ return {}; })
  ]).then(function(results){
    var status = results[0] || {};
    var wa = (results[1] && results[1].data) ? results[1].data : [];
    var health = results[2] || {};

    var todayStart = new Date(); todayStart.setHours(0,0,0,0);
    var todayTs = todayStart.getTime() / 1000;
    var activeChats = wa.filter(function(c){ return c.last_message_ts >= todayTs; }).length;

    var gatewayEl = document.getElementById('health-gateway');
    var tokensEl = document.getElementById('health-tokens');
    var costEl = document.getElementById('health-cost');
    var errorsEl = document.getElementById('health-errors');

    if (gatewayEl) gatewayEl.textContent = health.ok ? 'OK' : '—';
    if (tokensEl) tokensEl.textContent = '—';
    if (costEl) costEl.textContent = '—';
    if (errorsEl) errorsEl.textContent = '0';

    var kpiEvents = document.getElementById('kpi-events');
    var kpiChats = document.getElementById('kpi-chats');
    var kpiOccupancy = document.getElementById('kpi-occupancy');
    var kpiUsers = document.getElementById('kpi-users');

    if (kpiEvents) kpiEvents.textContent = '0';
    if (kpiChats) kpiChats.textContent = String(activeChats);
    if (kpiOccupancy) kpiOccupancy.textContent = '0%';
    if (kpiUsers) kpiUsers.textContent = String(wa.length);

    drawHomeCharts(wa);
  }).catch(function(){
    var kpiEvents = document.getElementById('kpi-events');
    var kpiChats = document.getElementById('kpi-chats');
    var kpiOccupancy = document.getElementById('kpi-occupancy');
    var kpiUsers = document.getElementById('kpi-users');
    if (kpiEvents) kpiEvents.textContent = '—';
    if (kpiChats) kpiChats.textContent = '—';
    if (kpiOccupancy) kpiOccupancy.textContent = '—';
    if (kpiUsers) kpiUsers.textContent = '—';
  });
}

function drawHomeCharts(waContacts){
  try {
    var lineEvents = document.getElementById('home-line-events');
    var barStatus = document.getElementById('home-bar-status');
    var heatmap = document.getElementById('home-heatmap');
    var donutType = document.getElementById('home-donut-type');
    var lineMsgs = document.getElementById('home-line-msgs');
    var barResponse = document.getElementById('home-bar-response');
    var funnel = document.getElementById('home-funnel');
    var pieRequest = document.getElementById('home-pie-request');

    if (lineEvents) lineEvents.innerHTML = '<polyline fill="none" stroke="currentColor" stroke-width="2" points="0,140 45,120 90,110 135,100 180,80 225,70 270,40 320,20"/>';
    if (barStatus) barStatus.innerHTML = '<rect x="20" y="120" width="40" height="40" fill="currentColor" opacity="0.6"/><rect x="70" y="90" width="40" height="70" fill="currentColor" opacity="0.7"/><rect x="120" y="60" width="40" height="100" fill="currentColor" opacity="0.8"/>';
    if (heatmap) heatmap.innerHTML = '<rect x="20" y="40" width="30" height="140" fill="currentColor" opacity="0.5"/><rect x="60" y="20" width="30" height="160" fill="currentColor" opacity="0.6"/><rect x="100" y="50" width="30" height="130" fill="currentColor" opacity="0.5"/>';
    if (donutType) donutType.innerHTML = '<circle cx="160" cy="100" r="70" fill="none" stroke="currentColor" stroke-width="30" stroke-dasharray="160 440" opacity="0.9"/><circle cx="160" cy="100" r="70" fill="none" stroke="currentColor" stroke-width="30" stroke-dasharray="120 440" stroke-dashoffset="-160" opacity="0.7"/>';
    if (lineMsgs) lineMsgs.innerHTML = '<polyline fill="none" stroke="currentColor" stroke-width="2" points="0,120 45,110 90,80 135,100 180,60 225,40 270,20 320,10"/>';
    if (barResponse) barResponse.innerHTML = '<rect x="20" y="110" width="40" height="30" fill="currentColor" opacity="0.5"/><rect x="70" y="80" width="40" height="60" fill="currentColor" opacity="0.6"/><rect x="120" y="50" width="40" height="90" fill="currentColor" opacity="0.7"/>';
    if (funnel) funnel.innerHTML = '<polygon points="20,20 300,20 260,80 60,80" fill="currentColor" opacity="0.7"/><polygon points="60,120 260,120 230,170 90,170" fill="currentColor" opacity="0.85"/><polygon points="90,200 230,200 200,210 120,210" fill="currentColor" opacity="0.95"/>';
    if (pieRequest) pieRequest.innerHTML = '<circle cx="160" cy="100" r="70" fill="none" stroke="currentColor" stroke-width="30" stroke-dasharray="200 400" opacity="0.9"/><circle cx="160" cy="100" r="70" fill="none" stroke="currentColor" stroke-width="30" stroke-dasharray="120 400" stroke-dashoffset="-200" opacity="0.75"/>';
  } catch (e) {
    console && console.log && console.log('home charts error=' + (e && e.message ? e.message : e));
  }
}

function renderHome() {
  main.innerHTML = html`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="title">Início</div>
          <div class="subtitle">Visão geral da operação.</div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
        <div class="card">
          <div class="muted">Eventos no mês</div>
          <div class="kpi" id="kpi-events">—</div>
          <div class="muted" id="kpi-events-delta"></div>
        </div>
        <div class="card">
          <div class="muted">Conversas ativas hoje</div>
          <div class="kpi" id="kpi-chats">—</div>
          <div class="muted" id="kpi-chats-delta"></div>
        </div>
        <div class="card">
          <div class="muted">Taxa de ocupação</div>
          <div class="kpi" id="kpi-occupancy">—</div>
          <div class="muted" id="kpi-occupancy-delta"></div>
        </div>
        <div class="card">
          <div class="muted">Usuários ativos</div>
          <div class="kpi" id="kpi-users">—</div>
          <div class="muted" id="kpi-users-delta"></div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-top: 18px;">
        <div class="card">
          <div class="card-head">
            <div>
              <div class="title">Eventos por dia</div>
              <div class="subtitle">Últimos 7 dias</div>
            </div>
          </div>
          <div class="stack">
            <svg id="home-line-events" viewBox="0 0 320 160" preserveAspectRatio="none" style="width:100%;height:160px"></svg>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <div class="title">Eventos por status</div>
              <div class="subtitle">Empilhado</div>
            </div>
          </div>
          <div class="stack">
            <svg id="home-bar-status" viewBox="0 0 320 180" preserveAspectRatio="none" style="width:100%;height:180px"></svg>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <div class="title">Horários mais movimentados</div>
              <div class="subtitle">Semana atual</div>
            </div>
          </div>
          <div class="stack">
            <svg id="home-heatmap" viewBox="0 0 320 200" preserveAspectRatio="none" style="width:100%;height:200px"></svg>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <div class="title">Distribuição por tipo</div>
              <div class="subtitle">Rosca</div>
            </div>
          </div>
          <div class="stack">
            <svg id="home-donut-type" viewBox="0 0 320 200" preserveAspectRatio="none" style="width:100%;height:200px"></svg>
          </div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-top: 18px;">
        <div class="card">
          <div class="card-head">
            <div>
              <div class="title">Mensagens por dia</div>
              <div class="subtitle">Últimos 7 dias</div>
            </div>
          </div>
          <div class="stack">
            <svg id="home-line-msgs" viewBox="0 0 320 160" preserveAspectRatio="none" style="width:100%;height:160px"></svg>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <div class="title">Tempo médio resposta</div>
              <div class="subtitle">Minutos</div>
            </div>
          </div>
          <div class="stack">
            <svg id="home-bar-response" viewBox="0 0 320 160" preserveAspectRatio="none" style="width:100%;height:160px"></svg>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <div class="title">Funil de conversão</div>
              <div class="subtitle">Conversa → Agendamento → Evento</div>
            </div>
          </div>
          <div class="stack">
            <svg id="home-funnel" viewBox="0 0 320 220" preserveAspectRatio="none" style="width:100%;height:220px"></svg>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <div class="title">Tipos de solicitação</div>
              <div class="subtitle">Pizza</div>
            </div>
          </div>
          <div class="stack">
            <svg id="home-pie-request" viewBox="0 0 320 200" preserveAspectRatio="none" style="width:100%;height:200px"></svg>
          </div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-top: 18px;">
        <div class="card">
          <div class="card-head">
            <div>
              <div class="title">Integrações</div>
              <div class="subtitle">Status</div>
            </div>
          </div>
          <div class="stack" id="home-integrations"></div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <div class="title">Saúde do sistema</div>
              <div class="subtitle">Indicadores</div>
            </div>
          </div>
          <div class="stack">
            <div class="row"><div class="k">Gateway</div><div class="v" id="health-gateway">—</div></div>
            <div class="row"><div class="k">Uso de tokens</div><div class="v" id="health-tokens">—</div></div>
            <div class="row"><div class="k">Custo estimado</div><div class="v" id="health-cost">—</div></div>
            <div class="row"><div class="k">Erros API</div><div class="v" id="health-errors">—</div></div>
          </div>
        </div>
      </div>
    </div>
  `;

  loadHomeMetrics();
  attachNavLinks();
}

function renderAssistente() {
  main.innerHTML = html`
    <div class="chat">
      <div class="chat-header">
        <div>
          <div class="title">Assistente</div>
          <div class="subtitle">Converse com o sistema em linguagem natural.</div>
        </div>
        <button id="clear-chat" class="badge">Limpar</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin:8px 0">
        <label class="muted" style="font-size:12px">Agente:</label>
        <select id="agent-select" style="background:var(--bg-1);color:var(--text);border:1px solid var(--border);padding:6px 8px;border-radius:8px">
          <option value="">Geral</option>
          <option value="Orquestrador">Orquestrador</option>
          <option value="CEO_Assistente">CEO</option>
          <option value="SDR">SDR</option>
          <option value="Atendimento">Atendimento</option>
          <option value="SocialMedia">Social Media</option>
          <option value="Financeiro">Financeiro</option>
          <option value="Operacional">Operacional</option>
          <option value="Prospector">Prospector</option>
        </select>
      </div>
      <div id="chat-messages" class="chat-messages"></div>
      <form id="chat-form" class="chat-form" autocomplete="off">
        <input id="chat-input" class="chat-input" placeholder="Digite sua mensagem..." />
        <button class="chat-send" type="submit">Enviar</button>
      </form>
    </div>
  `;

  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-input');
  var messages = document.getElementById('chat-messages');
  var clearBtn = document.getElementById('clear-chat');
  var agentSelect = document.getElementById('agent-select');

  function addMsg(role, text) {
    var wrap = document.createElement('div');
    var id = 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    wrap.id = id;
    wrap.className = 'message ' + (role === 'user' ? 'user' : 'assistant');
    wrap.innerHTML = html`<div class="message-role">${role === 'user' ? 'Você' : 'Assistente'}</div><div class="message-bubble">${text}</div>`;
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
    return id;
  }

  if (form && input) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      addMsg('user', text);
      input.value = '';
      var loadingId = addMsg('assistant', '...');
      try {
        var agent = agentSelect ? agentSelect.value : '';
        var res = await fetch('/api/hermes-chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: text, session_id: 'webapp:user-1:main', agent: agent }),
        });
        var data = await res.json();
        var reply = '';
        if (data.ok && data.reply) {
          var choices = data.reply.choices || [];
          if (choices.length) {
            reply = choices[0].message && choices[0].message.content ? choices[0].message.content : JSON.stringify(choices[0].message || choices[0]);
          } else {
            reply = JSON.stringify(data.reply);
          }
        } else {
          reply = 'Falha ao chamar o assistente: ' + (data.error || JSON.stringify(data));
        }
        if (!reply && data.reply && data.reply.error && data.reply.error.message) {
          reply = data.reply.error.message;
        }
        messages.removeChild(document.getElementById(loadingId));
        addMsg('assistant', reply);
      } catch (err) {
        messages.removeChild(document.getElementById(loadingId));
        addMsg('assistant', 'Erro de conexão: ' + (err.message || err));
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      messages.innerHTML = '';
    });
  }

  input && input.focus && input.focus();
}

function renderDocumentacao(sub) {
  var docs = {
    painel: {
      label: 'Documentação do Painel',
      desc: 'Guias e funcionalidades do SxConnect.',
      url: '/documentacao/painel.html'
    },
    whatsapp: {
      label: 'Documentação do WhatsApp',
      desc: 'Configurações, uso e integrações.',
      url: '/documentacao/whatsapp.html'
    },
    agentes: {
      label: 'Documentação dos Agentes',
      desc: 'Agentes de IA e automações.',
      url: '/documentacao/agentes.html'
    }
  };
  var chosen = docs[sub];
  if (!chosen) {
    main.innerHTML = html`
      <div class="title">Documentação</div>
      <div class="subtitle">Selecione um tema para abrir a documentação correspondente.</div>
      <div class="grid">
        <a class="link-card" href="${HERMES_DOC_URL}" target="_blank" rel="noreferrer">
          <div>
            <div class="link-label">Documentação do Hermes</div>
            <div class="muted" style="font-size:12px;margin-top:4px">Manual oficial do Hermes Agent</div>
          </div>
          <div class="link-arrow">→</div>
        </a>
        ${Object.keys(docs).map(function (key) {
          var item = docs[key];
          return html`<a class="link-card" href="#/documentacao/${key}" data-nav="documentacao/${key}">
            <div>
              <div class="link-label">${item.label}</div>
              <div class="muted" style="font-size:12px;margin-top:4px">${item.desc}</div>
            </div>
            <div class="link-arrow">→</div>
          </a>`;
        }).join('')}
      </div>
    `;
    setTimeout(attachNavLinks, 0);
    return;
  }

  main.innerHTML = html`
    <div class="page-header">
      <div>
        <div class="title">${chosen.label}</div>
        <div class="subtitle">${chosen.desc}</div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="badge" id="doc-back">Voltar</button>
        <button class="badge primary" id="doc-new-tab">Abrir em nova aba</button>
      </div>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <div id="doc-content" style="width:100%;height:calc(100vh - 160px);border:none;display:block;overflow:auto"></div>
    </div>
  `;

  var container = document.getElementById('doc-content');
  fetch(chosen.url, {cache:'no-store'})
    .then(function(res){ if (!res.ok) throw new Error('HTTP '+res.status); return res.text(); })
    .then(function(html){ container.innerHTML = html; })
    .catch(function(err){ container.innerHTML = '<div class="empty">Não foi possível carregar a documentação: ' + err.message + '</div>'; });

  document.getElementById('doc-back').addEventListener('click', function () {
    location.hash = '#/documentacao';
  });
  document.getElementById('doc-new-tab').addEventListener('click', function () {
    window.open(chosen.url, '_blank', 'noopener,noreferrer');
  });
}

function renderWhatsAppEmbed() {
  main.innerHTML = html`
    <div class="wa-embed">
      <div class="wa-status" id="wa-status">Verificando painel WhatsApp...</div>
      <div class="iframe-wrap">
        <iframe title="WhatsApp" src="http://127.0.0.1:8080/" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style="width:100%;height:calc(100vh - 120px);border:none;display:block;"></iframe>
      </div>
    </div>
  `;
  var waStatus = document.getElementById('wa-status');
  fetch('http://127.0.0.1:8080/health', { mode: 'cors' })
    .then(function (res) { return res.ok; })
    .then(function (ok) {
      if (waStatus) {
        waStatus.textContent = ok ? 'Painel WhatsApp ativo' : 'Painel WhatsApp indisponível';
        waStatus.className = 'wa-status ' + (ok ? 'ok' : 'error');
      }
    })
    .catch(function () {
      if (waStatus) {
        waStatus.textContent = 'Painel WhatsApp indisponível';
        waStatus.className = 'wa-status error';
      }
    });
}

function renderKambam() {
  const STORAGE_KEY = 'sx.kambam';
  const DEFAULT_COLUMNS = ['Atendimento','Negociando','Em produção','Envio feito','Perdido'];

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getDefault();
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.columns) || !parsed.columns.length) return getDefault();
      return parsed;
    } catch (e) { return getDefault(); }
  }
  function save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  function generateId() {
    return 'id_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
  }
  function getDefault() {
    var names = ['Atendimento','Negociando','Em produção','Envio feito','Perdido'];
    return {
      columns: names.map(function(title){
        return { id: generateId(), title: title, items: [] };
      }),
      nextId: 1
    };
  }
  function uid(state) {
    return 'i' + (state.nextId++);
  }
  function escape(str) {
    return String(str == null ? '' : str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function addContactCard() {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = html`<div class="modal" style="max-width:760px">
      <div class="modal-header">
        <div class="title">Contatos: Kambam</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="file" id="wa-csv-input" accept=".csv" />
          <button class="badge" id="wa-csv-import">Importar CSV</button>
          <button class="badge" id="wa-export">Exportar CSV</button>
          <button class="badge" id="wa-print">Imprimir</button>
          <button class="badge close-modal">Fechar</button>
        </div>
      </div>
      <div class="modal-body">
        <div class="flex-between">
          <input class="search" id="wa-search" placeholder="Buscar por nome ou telefone..." />
          <div class="muted" id="wa-page-info">página 1</div>
        </div>
        <ol class="column-list" id="wa-list"></ol>
        <div class="flex-between" style="margin-top:10px">
          <button class="badge" id="wa-manual">Adicionar manual</button>
          <div style="display:flex;gap:8px">
            <button class="badge" id="wa-prev">Anterior</button>
            <button class="badge" id="wa-next">Próxima</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(overlay);

    var PAGE_SIZE = 10;
    var page = 0;
    var term = '';
    var contacts = [];
    var selected = new Set();
    var cache = [];
    var CARD_CHANNEL = 'whatsapp';

    function closeModal() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    function esc(str) { return escape(str); }
    function matches(c, t) {
      var s = String(t || '').trim().toLowerCase();
      if (!s) return true;
      return (c.name || '').toLowerCase().indexOf(s) !== -1 || (c.phone || '').indexOf(s) !== -1;
    }
    function renderList() {
      var listEl = overlay.querySelector('#wa-list');
      var filtered = cache.filter(function(c){ return matches(c, term); });
      var total = filtered.length;
      var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (page >= pages) page = pages - 1;
      if (page < 0) page = 0;
      var start = page * PAGE_SIZE;
      var slice = filtered.slice(start, start + PAGE_SIZE);

      listEl.innerHTML = slice.map(function(c){
        var display = c.name || c.phone;
        if (c.is_group) display = (c.name || '') + ' (grupo)';
        var checked = selected.has(String(c.id)) ? 'checked' : '';
        return html`<li class="card-item">
          <div class="stack">
            <div class="flex-between">
              <strong>${escape(display)}</strong>
              <span class="muted" style="font-size:11px">${escape(c.phone)}</span>
            </div>
            <div class="muted">${escape((c.last_message || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').slice(0,100) || 'Sem mensagens')}</div>
            <label class="check" style="align-self:flex-start">
              <input type="checkbox" class="wa-sel" value="${escape(String(c.id))}" ${checked} />
              <span class="checkmark"></span>
              <span class="muted" style="font-size:11px">Selecionar</span>
            </label>
          </div>
        </li>`;
      }).join('') || html`<li class="empty muted">Sem contatos</li>`;

      overlay.querySelector('#wa-page-info').textContent = 'página ' + (page + 1) + ' de ' + pages;

      listEl.querySelectorAll('.wa-sel').forEach(function(input, i){
        input.addEventListener('change', function(saveEvent){
          saveEvent.preventDefault();
          var phone = input.getAttribute('value');
          if (!phone || !slice[i]) return;
          if (input.checked) {
            selected.add(phone);
            addCardFromContact(slice[i]);
          } else {
            selected.delete(phone);
          }
        });
      });
    }

    function addCardFromContact(c) {
      var state = load();
      var item = {
        id: uid(state),
        title: 'Contato: ' + (c.name || c.phone || ''),
        time: new Date().getHours().toString().padStart(2,'0') + ':' + new Date().getMinutes().toString().padStart(2,'0'),
        done: false,
        note: 'Importado do WhatsApp',
        channel: CARD_CHANNEL,
        phone: String(c.phone || ''),
        stage: state.columns[0].id
      };
      state.columns[0].items.push(item);
      save(state);
      render();
    }

    overlay.querySelector('#wa-csv-import').addEventListener('click', function(){
      var input = overlay.querySelector('#wa-csv-input');
      if (!input || !input.files || !input.files[0]) return;
      var reader = new FileReader();
      reader.onload = function(e){
        var text = String(e.target.result || '');
        var lines = text.split(/\r?\n/).filter(Boolean);
        var startIdx = 0;
        var header = lines[0] || '';
        if (/nome/.test(header.toLowerCase()) || /phone|telefone|whatsapp/.test(header.toLowerCase())) startIdx = 1;
        var state = load();
        var imported = 0;
        for (var i = startIdx; i < lines.length && imported < 50; i++) {
          var cols = lines[i].split(/[,;|\t]/g);
          var name = (cols[0] || '').trim();
          var phone = (cols[1] || cols[0] || '').trim();
          if (!name && !phone) continue;
          var item = { id: uid(state), title: 'Contato: ' + (name || phone), time: '09:00', done: false, note: 'Importado do CSV', channel: CARD_CHANNEL, phone: phone, stage: state.columns[0].id };
          state.columns[0].items.push(item);
          imported++;
        }
        save(state);
        render();
        closeModal();
      };
      reader.readAsText(input.files[0]);
    });

    overlay.querySelector('#wa-export').addEventListener('click', function(){
      var state = load();
      var rows = [];
      rows.push(['nome','telefone','coluna','status','observacao','data_criacao']);
      state.columns.forEach(function(col){
        col.items.forEach(function(item){
          rows.push([item.title, item.phone || '', col.title, item.done ? 'concluido' : 'pendente', (item.note || '').replace(/\r?\n/g,' '), item.time || '']);
        });
      });
      var csv = rows.map(function(r){ return r.map(function(x){ var s = String(x || ''); return '"' + s.replace(/"/g,'""') + '"'; }).join(','); }).join('\r\n');
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'kambam_contatos.csv'; a.click();
      URL.revokeObjectURL(url);
    });

    overlay.querySelector('#wa-print').addEventListener('click', function(){
      var state = load();
      var rows = '';
      state.columns.forEach(function(col){
        col.items.forEach(function(item){
          rows += '<tr><td>' + escape(item.title) + '</td><td>' + escape(item.phone || '') + '</td><td>' + escape(col.title) + '</td><td>' + escape(item.time || '') + '</td><td>' + escape((item.note || '').replace(/\r?\n/g,' ')) + '</td></tr>';
        });
      });
      var table = html`<table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse"><thead><tr><th>Nome</th><th>Telefone</th><th>Coluna</th><th>Horário</th><th>Observação</th></tr></thead><tbody>${rows}</tbody></table>`;
      var w = window.open('', '_blank', 'width=1024,height=720');
      if (!w) return;
      w.document.write('<html><head><title>Kambam - impressão</title><style>body{font-family:ui-sans-serif,system-ui;padding:24px}table{margin-top:12px}th{background:#0f172b;color:#e5e7eb}td,th{padding:8px;border:1px solid rgba(148,163,184,.35)}tr:nth-child(even){background:#f8fafc}</style></head><body>' + table + '</body></html>');
      w.document.close();
      w.focus();
      setTimeout(function(){ w.print(); }, 300);
    });

    overlay.querySelector('#wa-manual').addEventListener('click', function(){
      var name = prompt('Nome do contato:');
      if (!name) return;
      var phone = prompt('Telefone/whatsapp:');
      if (phone === null) return;
      phone = phone || '';
      var time = prompt('Horário:', '09:00') || '09:00';
      var state = load();
      var item = { id: uid(state), title: 'Contato: ' + name, time: time, done: false, note: 'Adicionado manualmente', channel: CARD_CHANNEL, phone: phone, stage: state.columns[0].id };
      state.columns[0].items.push(item);
      save(state);
      render();
    });

    overlay.querySelector('#wa-prev').addEventListener('click', function(){ page--; renderList(); });
    overlay.querySelector('#wa-next').addEventListener('click', function(){ page++; renderList(); });
    overlay.querySelector('#wa-search').addEventListener('input', function(e){ term = String(e.target.value || ''); page = 0; renderList(); });
    overlay.querySelector('.close-modal').addEventListener('click', closeModal);
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closeModal(); });

    fetchWhatsAppContacts().then(function(list){
      contacts = list;
      cache = list.slice();
      renderList();
    });
  }

  function aiOrganize() {
    var state = load();
    var changed = 0;
    state.columns.forEach(function(col, idx){
      col.items.forEach(function(item){
        if (item.channel === 'whatsapp') {
          item.stage = col.id;
        }
      });
    });
    state.columns[0].items.forEach(function(item){
      if (!item.channel) {
        item.channel = 'imported';
        changed++;
      }
    });
    save(state);
    if (changed) render();
    alert('IA: ' + changed + ' card(s) atualizado(s).');
  }

  function render() {
    var state = load();
    var mainEl = document.querySelector('.main');
    if (!mainEl) return;
    mainEl.innerHTML = html`
      <div class="page">
        <div class="page-header">
          <div>
            <div class="title">Kambam</div>
            <div class="subtitle">Gerencie colunas e cartões. Use a IA organizar para ajudar.</div>
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <button class="badge" id="ai-organize">IA organizar</button>
            <button class="badge" id="add-contact">Contato do WhatsApp</button>
            <button class="badge" id="add-card-btn">Novo cartão</button>
            <button class="badge" id="add-column">Nova coluna</button>
            <button class="badge danger" id="reset-board">Resetar</button>
          </div>
        </div>
        <div class="board">
          ${state.columns.map(function(col, idx){
            return html`
              <div class="board-column" data-column-id="${escape(col.id)}">
                <div class="board-column-head">
                  <div class="title column-title" data-column-id="${escape(col.id)}">${escape(col.title)}</div>
                  <div class="muted">${col.items.length}</div>
                </div>
                <ol class="column-list">
                  ${col.items.map(function(item){
                    return html`
                      <li class="card-item" data-id="${escape(item.id)}" data-time="${escape(item.time || '')}">
                        <div class="stack">
                          <div class="flex-between">
                            <strong>${escape(item.title)}</strong>
                            <label class="check">
                              <input type="checkbox" class="done-check" ${item.done ? 'checked' : ''} />
                              <span class="checkmark"></span>
                            </label>
                          </div>
                          ${item.channel === 'whatsapp' ? '<div class="muted">' + escape(item.note || 'Contato do WhatsApp') + (item.phone ? ' • ' + escape(item.phone) : '') + '</div>' : ''}
                          <div class="muted">Horário: ${escape(item.time || '—')}</div>
                          <textarea class="note" placeholder="Observação/afazeres..." rows="2">${escape(item.note || '')}</textarea>
                          <div class="actions">
                            <button class="badge move-prev">◀ Mover</button>
                            <button class="badge move-next">Mover ▶</button>
                            <button class="badge danger delete-card">Excluir</button>
                          </div>
                        </div>
                      </li>
                    `;
                  }).join('')}
                  ${!col.items.length ? html`<li class="empty muted">Sem cartões</li>` : ''}
                </ol>
                <div class="column-actions">
                  <button class="badge rename-column" data-column-id="${escape(col.id)}">Renomear</button>
                  <button class="badge danger delete-column" data-column-id="${escape(col.id)}">Excluir coluna</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    function bind(id, fn) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    }

    bind('add-card-btn', function() {
      var title = prompt('Título do cartão:');
      if (!title) return;
      var time = prompt('Horário (HH:MM):', '09:00') || '09:00';
      var state = load();
      var item = { id: uid(state), title: title.trim(), time: time, done: false, note: '', customFields: [] };
      state.columns[0].items.push(item);
      save(state);
      render();
    });

    bind('reset-board', function() {
      if (!confirm('Deseja resetar o Kambam para colunas padrão?')) return;
      localStorage.removeItem(STORAGE_KEY);
      render();
    });

    bind('add-column', function() {
      var title = prompt('Nome da nova coluna:');
      if (!title) return;
      var state = load();
      state.columns.push({ id: generateId(), title: title.trim(), items: [] });
      save(state);
      render();
    });

    bind('add-contact', addContactCard);
    bind('ai-organize', aiOrganize);

    if (!window.__kambamWhatsAppSync) {
      window.__kambamWhatsAppSync = true;
      setInterval(function() {
        if (!mainEl) return;
        fetchWhatsAppContacts().then(function(list) {
          if (!Array.isArray(list) || !list.length) return;
          var state = load();
          var phones = {};
          state.columns.forEach(function(col) {
            (col.items || []).forEach(function(it) {
              if (it.phone) phones[String(it.phone)] = true;
            });
          });
          var changed = 0;
          var firstCol = state.columns && state.columns[0] ? state.columns[0] : null;
          if (!firstCol) return;
          list.forEach(function(c) {
            var phone = String(c.phone || '').trim();
            if (!phone || phones[phone]) return;
            firstCol.items.push({
              id: uid(state),
              title: 'Contato: ' + (c.name || phone),
              time: new Date().getHours().toString().padStart(2, '0') + ':' + new Date().getMinutes().toString().padStart(2, '0'),
              done: false,
              note: 'Importado do WhatsApp',
              channel: 'whatsapp',
              phone: phone,
              stage: firstCol.id
            });
            changed++;
          });
          if (changed) {
            save(state);
            render();
          }
        }).catch(function() {});
      }, 5000);
    }

    mainEl.querySelectorAll('.card-item').forEach(function(el){
      el.addEventListener('click', function(e){
        if (e.target.closest('button, textarea, input, .check')) return;
        var itemId = el.getAttribute('data-id');
        var state = load();
        var item = null;
        state.columns.forEach(function(col){
          var found = col.items.find(function(x){ return String(x.id) === String(itemId); });
          if (found){ item = found; }
        });
        if (!item) return;

        var backdrop = document.createElement('div');
        backdrop.id = 'kambam-card-backdrop';
        backdrop.className = 'modal-overlay';
        var fields = '';
        if (Array.isArray(item.customFields)) {
          fields = item.customFields.map(function(f){ return String(f.key||'') + ': ' + String(f.value||''); }).join('\n');
        }
        var phoneLine = item.phone ? escape(item.phone) : '—';
        backdrop.innerHTML = '<div class="modal" style="max-width:520px">' +
          '<div class="modal-header">' +
            '<div><div class="title">' + escape(item.title || 'Card') + '</div><div class="muted">' + escape(item.channel || '') + ' • ' + phoneLine + '</div></div>' +
            '<button class="badge close-modal">Fechar</button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<label class="row" style="margin-bottom:10px"><div class="k">Observação</div><textarea id="kambam-card-note" rows="3" style="width:100%">' + escape(item.note || '') + '</textarea></label>' +
            '<label class="row" style="margin-bottom:10px"><div class="k">Campos extras</div><textarea id="kambam-card-fields" rows="4" placeholder="campo: valor\ncampo2: valor2" style="width:100%">' + escape(fields) + '</textarea></label>' +
            '<div class="flex-between"><div class="muted">Salvar alterações no card.</div><button class="badge primary" id="kambam-card-save">Salvar</button></div>' +
          '</div>' +
        '</div>';
        document.body.appendChild(backdrop);

        function closeModal(){ if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); render(); }
        backdrop.querySelector('.close-modal').addEventListener('click', closeModal);
        backdrop.addEventListener('click', function(e){ if (e.target === backdrop) closeModal(); });

        backdrop.querySelector('#kambam-card-save').addEventListener('click', function(){
          var note = String(backdrop.querySelector('#kambam-card-note').value || '').trim();
          item.note = note;
          var raw = String(backdrop.querySelector('#kambam-card-fields').value || '');
          var parsed = [];
          raw.split(/\r?\n/).forEach(function(line){
            line = line.trim();
            if (!line) return;
            var idx = line.indexOf(':');
            if (idx > 0){ var k = line.slice(0, idx).trim(); var v = line.slice(idx+1).trim(); if (k) parsed.push({key:k, value:v}); }
          });
          item.customFields = parsed.slice(0, 20);
          save(state);
          closeModal();
        });
      });
    });

    function getDragAfter(list, y) {
      var cards = [].slice.call(list.querySelectorAll('.card-item:not(.dragging)'));
      var near = null;
      cards.forEach(function(el){
        var box = el.getBoundingClientRect();
        var off = Math.abs((box.top + box.height/2) - y);
        near = !near ? el : (off < (near._d || Infinity) ? el : near);
        if (near) near._d = off;
      });
      return near;
    }

    mainEl.querySelectorAll('.rename-column').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var colId = this.getAttribute('data-column-id');
        var state = load();
        var col = state.columns.find(function(c) { return c.id === colId; });
        if (!col) return;
        var next = prompt('Novo nome da coluna:', col.title);
        if (next === null) return;
        col.title = String(next).trim() || col.title;
        save(state);
        render();
      });
    });

    mainEl.querySelectorAll('.delete-column').forEach(function(btn){
      btn.addEventListener('click', function(){
        var colId = this.getAttribute('data-column-id');
        var state = load();
        if (state.columns.length <= 1) { alert('Não é possível excluir a última coluna.'); return; }
        if (!confirm('Excluir essa coluna e mover seus cartões para a primeira coluna?')) return;
        var col = state.columns.find(function(c){ return c.id === colId; });
        var target = state.columns[0];
        if (col) {
          (col.items || []).forEach(function(it){ target.items.push(it); });
          state.columns = state.columns.filter(function(c){ return c.id !== colId; });
        }
        save(state);
        render();
      });
    });

    mainEl.querySelectorAll('.column-title').forEach(function(el){
      el.addEventListener('click', function(){
        var colId = this.getAttribute('data-column-id');
        var state = load();
        var col = state.columns.find(function(c){ return c.id === colId; });
        if (!col) return;
        var next = prompt('Renomear coluna:', col.title);
        if (next === null) return;
        col.title = String(next).trim() || col.title;
        save(state);
        render();
      });
    });

    function setupDragDrop() {
      var cards = mainEl.querySelectorAll('.card-item');
      var columns = mainEl.querySelectorAll('.board-column');

      cards.forEach(function(card){
        card.setAttribute('draggable','true');
        card.addEventListener('dragstart', function(e){
          e.dataTransfer.setData('text/plain', card.getAttribute('data-id'));
          e.dataTransfer.effectAllowed = 'move';
          card.classList.add('dragging');
        });
        card.addEventListener('dragend', function(){
          card.classList.remove('dragging');
        });
      });

      columns.forEach(function(col){
        var list = col.querySelector('.column-list');
        if (!list) return;

        col.addEventListener('dragover', function(e){
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          col.classList.add('drag-over');
          var dragging = mainEl.querySelector('.dragging');
          if (!dragging) return;
          var afterEl = getDragAfter(list, e.clientY);
          if (afterEl) {
            list.insertBefore(dragging, afterEl);
          } else {
            list.appendChild(dragging);
          }
        });

        col.addEventListener('dragleave', function(){
          col.classList.remove('drag-over');
        });

        col.addEventListener('drop', function(){
          col.classList.remove('drag-over');
        });
      });
    }

    setupDragDrop();
  }

  render();
}

function renderAgendamento(){
  var mainEl = document.querySelector('.main');
  if (!mainEl) return;
  var calendarEl, daySlotsEl, settingsOpen = false;
  function esc(str){ return String(str == null ? '' : str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function defaultSettings(){ return { start:'12:00', end:'19:00', slotMinutes:'60', breakMinutes:'0', days:{ sun:0, mon:1, tue:1, wed:1, thu:1, fri:1, sat:0 } }; }
  function loadSettings(){ try { var s = JSON.parse(localStorage.getItem('sx.agenda.settings')); if (s && s.start && s.end) return s; } catch(e){} return defaultSettings(); }
  function saveSettings(settings){ localStorage.setItem('sx.agenda.settings', JSON.stringify(settings)); }
  function loadAppointments(){ try { return JSON.parse(localStorage.getItem('sx.agenda.appointments')) || {}; } catch(e){ return {}; } }
  function saveAppointments(state){ localStorage.setItem('sx.agenda.appointments', JSON.stringify(state)); }

  function openSettings(){
    removeBackdrop();
    var settings = loadSettings();
    var keys = ['sun','mon','tue','wed','thu','fri','sat'];
    function dayLabel(key){ return {sun:'Dom',mon:'Seg',tue:'Ter',wed:'Qua',thu:'Qui',fri:'Sex',sat:'Sáb'}[key] || key; }
    var html = '<div class="agenda-modal"><div class="flex-between"><div><div class="title">Configuração de horários</div><div class="subtitle">Defina funcionamento, tempo de atendimento e pausa.</div></div><button class="badge" id="agenda-modal-close">Fechar</button></div><div class="stack">';
    html += '<div class="slot-settings-grid">';
    keys.forEach(function(key){
      var active = settings.days && settings.days[key] ? settings.days[key] : 0;
      html += '<div class="day-row"><div class="day-name">'+dayLabel(key)+'</div>';
      html += '<label class="chip-toggle"><input type="checkbox" data-day-active="'+key+'" '+(active?'checked':'')+' /><span>Ativo</span></label>';
      html += '<input class="day-input" data-day-start="'+key+'" type="time" value="'+esc(settings.start)+'" />';
      html += '<input class="day-input" data-day-end="'+key+'" type="time" value="'+esc(settings.end)+'" />';
      html += '<input class="day-input" data-day-slot="'+key+'" type="number" min="15" step="15" value="'+esc(settings.slotMinutes)+'" placeholder="Atend" />';
      html += '<input class="day-input" data-day-break="'+key+'" type="number" min="0" step="15" value="'+esc(settings.breakMinutes)+'" placeholder="Pausa" />';
      html += '</div>';
    });
    html += '</div>';
    html += '<button class="badge primary" id="set-save">Salvar</button></div></div>';
    var backdrop = document.createElement('div');
    backdrop.id = 'agenda-backdrop';
    backdrop.className = 'agenda-modal-backdrop';
    backdrop.innerHTML = html;
    document.body.appendChild(backdrop);
    document.getElementById('agenda-modal-close').addEventListener('click', removeBackdrop);
    backdrop.addEventListener('click', function(e){ if (e.target === backdrop) removeBackdrop(); });
    document.getElementById('set-save').addEventListener('click', function(){
      var out = { start:'12:00', end:'19:00', slotMinutes:'60', breakMinutes:'0', days:{ sun:0, mon:1, tue:1, wed:1, thu:1, fri:1, sat:0 } };
      keys.forEach(function(key){
        var activeEl = backdrop.querySelector('[data-day-active="'+key+'"]');
        if (!activeEl) return;
        out.days[key] = activeEl.checked ? 1 : 0;
        var startEl = backdrop.querySelector('[data-day-start="'+key+'"]');
        var endEl = backdrop.querySelector('[data-day-end="'+key+'"]');
        var slotEl = backdrop.querySelector('[data-day-slot="'+key+'"]');
        var breakEl = backdrop.querySelector('[data-day-break="'+key+'"]');
        if (startEl && startEl.value) out.start = startEl.value;
        if (endEl && endEl.value) out.end = endEl.value;
        if (slotEl && slotEl.value) out.slotMinutes = slotEl.value;
        if (breakEl && breakEl.value) out.breakMinutes = breakEl.value;
      });
      saveSettings(out);
      removeBackdrop();
      openCalendar(currentYear, currentMonth);
    });
  }

  function removeBackdrop(){ var b = document.getElementById('agenda-backdrop'); if (b) b.remove(); }
  function openDay(dateStr){
    removeBackdrop();
    var appointments = loadAppointments();
    var list = appointments[dateStr] || [];
    var settings = loadSettings();
    var edit = { start:'', end:'', title:'', index:-1 };
    function editLabel(){ return edit.index >= 0 ? 'Salvar alterações' : 'Adicionar agendamento'; }
    function renderPicker(){
      return '<input class="day-input" id="agenda-edit-start" type="time" value="'+esc(edit.start)+'" style="width:120px;" /> <input class="day-input" id="agenda-edit-end" type="time" value="'+esc(edit.end)+'" style="width:120px;" /> <input class="day-input" id="agenda-edit-title" placeholder="Cliente" value="'+esc(edit.title)+'" style="flex:1;min-width:120px;" /> <button class="badge primary" id="agenda-edit-save">'+editLabel()+'</button>' + (edit.index>=0 ? '<button class="badge danger" id="agenda-edit-cancel">Cancelar</button>' : '');
    }
    function refreshOpenDay(){
      removeBackdrop();
      openDay(dateStr);
    }
    var html = '<div class="agenda-modal"><div class="flex-between"><div><div class="title">Horários - ' + esc(dateStr) + '</div><div class="subtitle">Pesquise, adicione ou edite agendamentos.</div></div><button class="badge" id="agenda-modal-close">Fechar</button></div><div class="stack"><div class="schedule-toolbar"><input id="agenda-search" placeholder="Pesquisar agendamento..." class="day-input" style="flex:1;min-width:0;" /><button class="badge primary" id="agenda-add-appt">+ Adicionar</button></div><div id="agenda-edit-bar" class="schedule-toolbar">'+renderPicker()+'</div><table class="schedule-table"><thead><tr><th>Início</th><th>Término</th><th>Cliente</th><th>Status</th><th>Ações</th></tr></thead><tbody>';
    list.forEach(function(item, idx){
      var cls = item.done ? 'slot-done' : 'slot-booked';
      html += '<tr class="'+cls+'" data-idx="'+idx+'"><td>'+esc(item.start)+'</td><td>'+esc(item.end)+'</td><td>'+esc(item.title||'')+'</td><td>'+(item.done?'Finalizado':'Reservado')+'</td><td><button class="badge primary schedule-edit" data-idx="'+idx+'">Editar</button><button class="badge danger schedule-remove" data-idx="'+idx+'">Excluir</button></td></tr>';
    });
    html += '</tbody></table><div class="empty" id="agenda-empty-day">Nenhum agendamento para este dia.</div></div></div>';
    var backdrop = document.createElement('div');
    backdrop.id = 'agenda-backdrop';
    backdrop.className = 'agenda-modal-backdrop';
    backdrop.innerHTML = html;
    document.body.appendChild(backdrop);
    document.getElementById('agenda-modal-close').addEventListener('click', removeBackdrop);
    backdrop.addEventListener('click', function(e){ if (e.target === backdrop) removeBackdrop(); });

    function applySearch(){
      var q = (document.getElementById('agenda-search').value || '').trim().toLowerCase();
      backdrop.querySelectorAll('.schedule-table tbody tr').forEach(function(tr){
        var text = tr.textContent.toLowerCase();
        tr.style.display = text.indexOf(q) === -1 ? 'none' : '';
      });
    }
    if (document.getElementById('agenda-search')) document.getElementById('agenda-search').addEventListener('input', applySearch);

    document.getElementById('agenda-add-appt').addEventListener('click', function(){
      edit = { start:'09:00', end:'10:00', title:'', index:-1 };
      document.getElementById('agenda-edit-bar').innerHTML = renderPicker() + '<button class="badge" id="agenda-edit-cancel">Cancelar</button>';
      bindEdit();
    });
    function bindEdit(){
      var cancel = document.getElementById('agenda-edit-cancel');
      if (cancel) cancel.addEventListener('click', function(){ edit = { start:'', end:'', title:'', index:-1 }; document.getElementById('agenda-edit-bar').innerHTML = renderPicker(); bindEdit(); });
    }
    backdrop.querySelectorAll('.schedule-edit').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        var item = list[idx] || { start:'', end:'', title:'' };
        edit = { start:item.start, end:item.end, title:item.title, index:idx };
        document.getElementById('agenda-edit-bar').innerHTML = renderPicker();
        bindEdit();
      });
    });
    backdrop.addEventListener('click', function(e){
      var save = e.target.closest('#agenda-edit-save');
      if (!save) return;
      var data = loadAppointments();
      list = data[dateStr] || [];
      var startVal = (document.getElementById('agenda-edit-start').value || '').trim();
      var endVal = (document.getElementById('agenda-edit-end').value || '').trim();
      var titleVal = (document.getElementById('agenda-edit-title').value || '').trim();
      if (!startVal || !endVal) return alert('Informe horário de início e término.');
      if (edit.index >= 0){
        var item = list[edit.index] || {};
        item.start = startVal; item.end = endVal; item.title = titleVal;
        list[edit.index] = item;
      } else {
        list.push({ start:startVal, end:endVal, title:titleVal, done:false });
      }
      data[dateStr] = list;
      saveAppointments(data);
      refreshOpenDay();
      openCalendar(currentYear, currentMonth);
    });
    backdrop.querySelectorAll('.schedule-remove').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        var data = loadAppointments();
        list = data[dateStr] || [];
        list.splice(idx, 1);
        data[dateStr] = list;
        saveAppointments(data);
        refreshOpenDay();
        openCalendar(currentYear, currentMonth);
      });
    });
  }

  var currentYear, currentMonth, today = new Date();
  function openCalendar(y, m){
    currentYear = y; currentMonth = m;
    var first = new Date(y, m, 1);
    var last = new Date(y, m + 1, 0).getDate();
    var startWeekday = first.getDay();
    var appointments = loadAppointments();
    var settings = loadSettings();
    var cells = '';
    for (var i = 0; i < startWeekday; i++) cells += '<div></div>';
    for (var d = 1; d <= last; d++){
      var dateStr = y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      var isToday = (new Date().toDateString() === new Date(y,m,d).toDateString()) ? ' today' : '';
      var hasAppt = appointments[dateStr] && appointments[dateStr].length ? ' has-appt' : '';
      var dayId = ['sun','mon','tue','wed','thu','fri','sat'][new Date(y,m,d).getDay()];
      var active = (settings.days && settings.days[dayId] === 1) ? ' active-day' : '';
      var inactive = (!settings.days || settings.days[dayId] !== 1) ? ' inactive-day' : '';
      cells += '<div class="agenda-day'+isToday+hasAppt+active+inactive+'" data-date="'+esc(dateStr)+'"><div class="agenda-day-number">'+d+'</div>'+(hasAppt?'<div class="agenda-dot"></div>':'')+'</div>';
    }
    if (!calendarEl) return;
    calendarEl.innerHTML = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(function(d){ return '<div class="agenda-day-head">'+esc(d)+'</div>'; }).join('') + cells;
    Array.from(calendarEl.querySelectorAll('.agenda-day')).forEach(function(dayEl){
      dayEl.addEventListener('click', function(){
        var dateStr = dayEl.getAttribute('data-date');
        if (dateStr) openDay(dateStr);
      });
    });
    var label = new Date(y, m, 1).toLocaleString('pt-br', { month: 'long' });
    var monthLabel = document.getElementById('agenda-month-label');
    if (monthLabel) monthLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);
  }

  var container = document.createElement('div');
  container.className = 'page';
  container.innerHTML = '<div class="page-header"><div><div class="title">Agendamento</div><div class="subtitle">Calendário e horários por dia.</div></div><div style="display:flex;gap:12px;flex-wrap:wrap;"><button class="badge primary" id="agenda-settings">⚙️ Configurar funcionamento</button></div></div><div class="agenda-calendar-header"><button class="badge" id="agenda-prev">◀</button><div class="agenda-month-label" id="agenda-month-label"></div><button class="badge" id="agenda-next">▶</button></div><div class="agenda-calendar" id="agenda-calendar"></div>';
  mainEl.innerHTML = '';
  mainEl.appendChild(container);
  calendarEl = document.getElementById('agenda-calendar');
  daySlotsEl = null;
  openCalendar(today.getFullYear(), today.getMonth());
  document.getElementById('agenda-settings').addEventListener('click', function(){ openSettings(); });
  document.getElementById('agenda-prev').addEventListener('click', function(){ openCalendar(currentYear, currentMonth - 1); });
  document.getElementById('agenda-next').addEventListener('click', function(){ openCalendar(currentYear, currentMonth + 1); });
}

function attachNavLinks() {
  document.querySelectorAll('[data-nav]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var page = el.getAttribute('data-nav');
      location.hash = '#/' + page;
    });
  });
}

var themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
  themeToggle.addEventListener('click', function () {
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    var next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    themeToggle.textContent = next === 'dark' ? '🌙' : '☀️';
  });
}

var sidebar = document.getElementById('sidebar');
var sidebarToggle = document.getElementById('sidebar-toggle');
if (sidebarToggle) {
  sidebarToggle.addEventListener('click', function () {
    sidebar.classList.toggle('closed');
  });
}

function toggleSubmenu(menuId) {
  var button = document.getElementById(menuId);
  var submenuId = 'submenu-' + menuId.replace('menu-', '');
  var submenu = document.getElementById(submenuId);
  if (!button || !submenu) return;
  var isOpen = submenu.classList.contains('open');
  submenu.classList.toggle('open', !isOpen);
  button.setAttribute('aria-expanded', String(!isOpen));
}

navItems().forEach(function (el) {
  el.addEventListener('click', function (e) {
    var page = el.getAttribute('data-page');
    if (!page) return;
    e.preventDefault();
    location.hash = '#/' + page;
  });
});

function router() {
  var hash = location.hash.replace('#/', '').replace('#', '');
  var page = hash.split('/')[0] || 'home';
  var sub = hash.split('/')[1] || '';
  if (!['home', 'assistente', 'memoria', 'produtos', 'relatorios', 'documentacao', 'whatsapp-embed', 'kambam', 'agendamento'].includes(page)) page = 'home';

  setActive(page);
  if (page === 'assistente') renderAssistente();
  else if (page === 'documentacao') renderDocumentacao(sub);
  else if (page === 'whatsapp-embed') renderWhatsAppEmbed();
  else if (page === 'kambam') renderKambam();
  else if (page === 'agendamento') renderAgendamento();
  else if (page === 'memoria') renderMemoria();
  else if (page === 'produtos') renderProdutos();
  else if (page === 'relatorios') renderRelatorios();
  else renderHome();
}

function fetchWhatsAppContacts() {
  return fetch('http://127.0.0.1:9002/api/wa-contacts?q=', { mode: 'cors' })
    .then(function (res) { if (!res.ok) throw new Error('wa_local_failed'); return res.json(); })
    .then(function (json) { return (json && json.data) ? json.data : []; })
    .catch(function () { return []; });
}

function addContactCard() {
  var mainEl = document.querySelector('.main');
  if (!mainEl) return;
  mainEl.innerHTML = '<div class="page"><div class="page-header"><div><div class="title">Contatos do WhatsApp</div><div class="subtitle">Selecione contatos para adicionar ao Kambam.</div></div><button class="badge danger" id="add-contact-close">Fechar</button></div><div class="stack" style="gap:10px"><input id="wa-search" placeholder="Pesquisar contato..." style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg-1);color:var(--text)"><div id="wa-contact-list" class="column-list" style="max-height:60vh;overflow:auto"></div></div></div>';

  function renderList(list) {
    var box = document.getElementById('wa-contact-list');
    if (!box) return;
    if (!list.length) { box.innerHTML = '<div class="empty muted">Nenhum contato encontrado</div>'; return; }
    box.innerHTML = list.map(function(c) {
      return '<li class="card-item" data-phone="' + escapeHtml(c.phone) + '" data-name="' + escapeHtml(c.name) + '" style="cursor:pointer"><div class="flex-between"><div><div style="font-weight:700">' + escapeHtml(c.name || c.phone) + '</div><div class="muted">' + escapeHtml(c.phone) + '</div></div><button class="badge primary wa-add">Adicionar</button></div></li>';
    }).join('');
  }

  fetchWhatsAppContacts().then(function(list) { renderList(list); });

  document.getElementById('add-contact-close').addEventListener('click', function() { window.location.hash = '#/kambam'; });
  document.getElementById('wa-search').addEventListener('input', function() {
    var q = String(this.value || '').trim().toLowerCase();
    fetchWhatsAppContacts().then(function(list) {
      var filtered = q ? list.filter(function(c) { return (c.name || '').toLowerCase().indexOf(q) !== -1 || c.phone.indexOf(q) !== -1; }) : list;
      renderList(filtered);
    });
  });
  document.getElementById('wa-contact-list').addEventListener('click', function(e) {
  var btn = e.target.closest('.wa-add');
  var row = btn ? btn.closest('.card-item') : null;
  if (!row) return;
  var phone = row.getAttribute('data-phone');
  var name = row.getAttribute('data-name');
  try {
    var raw = localStorage.getItem('sx.kambam');
    var state = raw ? JSON.parse(raw) : { columns: [{ id: 'col1', title: 'Atendimento', items: [] }], nextId: 1 };
    if (!state || !Array.isArray(state.columns) || !state.columns.length) state = { columns: [{ id: 'col1', title: 'Atendimento', items: [] }], nextId: 1 };
    var uid = 'i' + (state.nextId++);
    var target = state.columns[0];
    target.items.push({ id: uid, title: name || phone, time: new Date().getHours().toString().padStart(2,'0') + ':' + new Date().getMinutes().toString().padStart(2,'0'), done: false, note: 'Contato do WhatsApp', channel: 'whatsapp', phone: phone, stage: target.id });
    localStorage.setItem('sx.kambam', JSON.stringify(state));
    alert('Contato adicionado');
    window.location.hash = '#/kambam';
  } catch (err) {
    alert('Não foi possível adicionar: ' + err.message);
  }
  });
}

function aiOrganize() {
  var state = load();
  var changed = 0;
  state.columns.forEach(function(col){
    col.items.forEach(function(item){
      if (item.channel === 'whatsapp') {
        item.stage = col.id;
        changed++;
      }
    });
  });
  state.columns[0].items.forEach(function(item){
    if (!item.channel) { item.channel = 'imported'; changed++; }
  });
  save(state);
  render();
  alert('IA: ' + changed + ' card(s) atualizado(s).');
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.addEventListener('hashchange', router);

function renderMemoria() {
  var mainEl = document.querySelector('.main');
  if (!mainEl) return;
  var STORE_KEY = 'sx.memoria.files';
  var listKey = 'sx.memoria.files';
  var files = [];
  try { var raw = localStorage.getItem(listKey); if (raw) files = JSON.parse(raw); } catch (e) { files = []; }
  var backdrop = document.createElement('div');
  backdrop.className = 'page';
  backdrop.innerHTML = '<div class="page-header"><div><div class="title">Memória</div><div class="subtitle">Anexe arquivos, PDFs, imagens ou textos.</div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="badge primary" id="mem-upload">Novo arquivo</button><button class="badge danger" id="mem-clear">Limpar tudo</button></div></div>' +
    '<div class="stack" id="mem-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;padding:8px 0"></div>' +
    '<div id="mem-backdrop-slot"></div>';
  mainEl.innerHTML = '';
  mainEl.appendChild(backdrop);
  var grid = backdrop.querySelector('#mem-grid');
  var slot = backdrop.querySelector('#mem-backdrop-slot');
  function save(list){ localStorage.setItem(listKey, JSON.stringify(list)); }
  function renderList(){
    grid.innerHTML = '';
    if (!files.length) { grid.innerHTML = '<div class="empty muted">Nenhum arquivo.</div>'; return; }
    files.forEach(function(f, idx){
      var card = document.createElement('div');
      card.className = 'card-item';
      card.style.padding = '10px';
      var preview = '';
      if (f.type && f.type.indexOf('image') !== -1 && f.data) {
        preview = '<img src="' + f.data + '" style="width:100%;height:130px;object-fit:cover;border-radius:10px;background:#000" />';
      } else if (f.type === 'application/pdf' && f.data) {
        preview = '<div style="width:100%;height:130px;display:flex;align-items:center;justify-content:center;background:#0f172b;color:#e5e7eb;border-radius:10px;font-weight:700">PDF</div>';
      } else {
        preview = '<div style="width:100%;height:130px;display:flex;align-items:center;justify-content:center;background:#0f172b;color:#e5e7eb;border-radius:10px;font-weight:700">TXT/MD</div>';
      }
      card.innerHTML = preview + '<div style="margin-top:8px;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</div><div style="font-size:11px;color:var(--muted)">' + (f.size || '') + '</div><button class="badge danger mem-remove" data-idx="' + idx + '" style="margin-top:8px;width:100%">Excluir</button>';
      grid.appendChild(card);
    });
    grid.querySelectorAll('.mem-remove').forEach(function(btn){ btn.addEventListener('click', function(){ var i = parseInt(btn.getAttribute('data-idx'),10); if (!isNaN(i)) files.splice(i,1); save(files); renderList(); }); });
  }
  backdrop.querySelector('#mem-upload').addEventListener('click', function(){ var input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*,.pdf,.txt,.md'; input.multiple = true; input.onchange = function(ev){ Array.from(ev.target.files || []).forEach(function(file){ var reader = new FileReader(); reader.onload = function(e){ var obj = { name: file.name, type: file.type || 'application/octet-stream', size: (file.size/1024).toFixed(1) + ' KB', data: e.target.result }; files.push(obj); save(files); renderList(); }; reader.readAsDataURL(file); }); }; input.click(); });
  backdrop.querySelector('#mem-clear').addEventListener('click', function(){ if (!files.length) return; if (confirm('Limpar todos os arquivos de memória?')){ files = []; save(files); renderList(); }});
  slot.addEventListener('click', function(e){ if (e.target.closest('.close-modal')) slot.innerHTML = ''; });
  renderList();
}

function renderProdutos() {
  var mainEl = document.querySelector('.main');
  if (!mainEl) return;
  var STORE_KEY = 'sx.produtos.items';
  var items = [];
  try { var raw = localStorage.getItem(STORE_KEY); if (raw) items = JSON.parse(raw); } catch (e) { items = []; }
  function save(){ localStorage.setItem(STORE_KEY, JSON.stringify(items)); }
  function render(){
    mainEl.innerHTML = '<div class="page"><div class="page-header"><div><div class="title">Produtos/Serviços</div><div class="subtitle">Cadastre itens para a IA usar em respostas.</div></div><button class="badge primary" id="prod-add">Novo item</button></div><div id="prod-list" class="column-list"></div></div>';
    var list = mainEl.querySelector('#prod-list');
    if (!items.length) { list.innerHTML = '<div class="empty muted">Nenhum item.</div>'; }
    list.querySelectorAll('.prod-del').forEach(function(btn){ btn.addEventListener('click', function(){ var i = parseInt(btn.getAttribute('data-idx'),10); if (!isNaN(i)){ items.splice(i,1); save(); render(); }}); });
    list.querySelectorAll('.prod-edit').forEach(function(btn){ btn.addEventListener('click', function(){ var i = parseInt(btn.getAttribute('data-idx'),10); openForm(items[i]); }); });
    mainEl.querySelector('#prod-add').addEventListener('click', function(){ openForm(null); });
  }
  function openForm(data){
    var item = data || { title:'', description:'', value:'', customFields:[], image:'' };
    var fields = (item.customFields || []).map(function(f){ return '<div style="display:flex;gap:8px;margin-top:6px"><input class="prod-custom-key" value="' + escapeHtml(f.key || '') + '" placeholder="Campo"><input class="prod-custom-value" value="' + escapeHtml(f.value || '') + '" placeholder="Valor"><button class="badge danger prod-custom-remove">Remover</button></div>'; }).join('');
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal" style="max-width:720px"><div class="modal-header"><div><div class="title">' + (item.title ? 'Editar' : 'Novo') + ' produto/serviço</div></div><button class="badge close-modal">Fechar</button></div><div class="modal-body"><label class="row">Título<input id="prod-title" value="' + escapeHtml(item.title || '') + '" /></label><label class="row">Valor<input id="prod-value" value="' + escapeHtml(item.value || '') + '" /></label><label class="row">Descrição<textarea id="prod-desc" rows="4">' + escapeHtml(item.description || '') + '</textarea></label><label class="row">Imagem<input id="prod-image" type="file" accept="image/*" /></label><div id="prod-customs">' + fields + '</div><button class="badge primary" id="prod-custom-add">Inserir campo</button><div class="flex-between" style="margin-top:10px"><div class="muted">Campos extras aparecem nos detalhes.</div><button class="badge primary" id="prod-save">Salvar</button></div></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.close-modal').addEventListener('click', function(){ overlay.remove(); });
    overlay.addEventListener('click', function(e){ if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#prod-custom-add').addEventListener('click', function(){ var row = document.createElement('div'); row.style.display = 'flex'; row.style.gap = '8px'; row.style.marginTop = '6px'; row.innerHTML = '<input class="prod-custom-key" placeholder="Campo"><input class="prod-custom-value" placeholder="Valor"><button class="badge danger prod-custom-remove">Remover</button>'; overlay.querySelector('#prod-customs').appendChild(row); });
    overlay.querySelector('#prod-save').addEventListener('click', function(){
      var title = String(overlay.querySelector('#prod-title').value || '').trim();
      var value = String(overlay.querySelector('#prod-value').value || '').trim();
      var description = String(overlay.querySelector('#prod-desc').value || '').trim();
      if (!title) { alert('Informe o título.'); return; }
      var customFields = [];
      overlay.querySelectorAll('#prod-customs > div').forEach(function(row){ var k = row.querySelector('.prod-custom-key'); var v = row.querySelector('.prod-custom-value'); if (k && v) { var a = String(k.value || '').trim(); var b = String(v.value || '').trim(); if (a) customFields.push({key:a, value:b}); } });
      var out = { title, value, description, customFields };
      var fileInput = overlay.querySelector('#prod-image');
      if (fileInput && fileInput.files && fileInput.files[0]) { var reader = new FileReader(); reader.onload = function(e){ out.image = e.target.result; finish(); }; reader.readAsDataURL(fileInput.files[0]); } else { finish(); }
      function finish(){ if (item && item.title) Object.assign(item, out); else items.push(out); save(); render(); overlay.remove(); }
    });
  }
  mainEl.querySelector('#prod-add').addEventListener('click', function(){ openForm(null); });
  render();
}

function renderRelatorios() {
  var mainEl = document.querySelector('.main');
  if (!mainEl) return;
  var STORE_KEY = 'sx.relatorios.items';
  var items = [];
  try { var raw = localStorage.getItem(STORE_KEY); if (raw) items = JSON.parse(raw); } catch (e) { items = []; }
  function save(){ localStorage.setItem(STORE_KEY, JSON.stringify(items)); }
  function render(){
    mainEl.innerHTML = '<div class="page"><div class="page-header"><div><div class="title">Relatórios</div><div class="subtitle">Visualize os documentos enviados pelos agentes.</div></div><button class="badge primary" id="rel-add">Novo relatório</button></div><div id="rel-list" class="column-list"></div></div>';
    var list = mainEl.querySelector('#rel-list');
    if (!items.length) { list.innerHTML = '<div class="empty muted">Nenhum relatório.</div>'; return; }
    list.innerHTML = items.map(function(it, idx){
      return '<li class="card-item" data-idx="' + idx + '"><div class="stack"><div class="flex-between"><strong>' + escapeHtml(it.title || 'Sem título') + '</strong><span class="badge ' + (it.authorized ? 'primary' : '') + '">' + (it.authorized ? 'Autorizado' : 'Pendente aprovação') + '</span></div><div class="muted">' + escapeHtml((it.content || '').slice(0,220)) + '</div>' + (it.data ? '<div style="margin-top:6px"><a href="' + it.data + '" target="_blank">Abrir arquivo</a></div>' : '') + '<div style="margin-top:8px;display:flex;gap:8px"><button class="badge primary rel-auth" data-idx="' + idx + '">Autorizar</button><button class="badge rel-view" data-idx="' + idx + '">Ver</button><button class="badge danger rel-del" data-idx="' + idx + '">Excluir</button></div></div></li>';
    }).join('');
    list.querySelectorAll('.rel-del').forEach(function(btn){ btn.addEventListener('click', function(){ var i = parseInt(btn.getAttribute('data-idx'),10); if (!isNaN(i)){ items.splice(i,1); save(); render(); }}); });
    list.querySelectorAll('.rel-auth').forEach(function(btn){ btn.addEventListener('click', function(){ var i = parseInt(btn.getAttribute('data-idx'),10); if (!isNaN(i)){ items[i].authorized = true; save(); render(); }}); });
    list.querySelectorAll('.rel-view').forEach(function(btn){ btn.addEventListener('click', function(){ var i = parseInt(btn.getAttribute('data-idx'),10); if (!isNaN(i)){ alert('Autorizado: ' + (items[i].authorized ? 'sim' : 'não') + '\\n' + (items[i].content || '')); } }); });
  }
  mainEl.querySelector('#rel-add').addEventListener('click', function(){
    var title = prompt('Título do relatório:');
    if (title === null) return;
    title = String(title).trim() || 'Sem título';
    var content = prompt('Conteúdo/texto do relatório:') || '';
    items.push({ title, content, authorized: false, createdAt: Date.now() });
    save();
    render();
  });
  render();
}
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', function(){
  var btn = document.getElementById('logout-btn');
  if (btn) btn.addEventListener('click', function(){
    fetch('/logout', {method:'POST', mode:'cors', credentials:'same-origin'}).then(function(){ window.location.href='/login'; });
  });
});
window.addEventListener('load', router);
(function(){
  var btn = document.getElementById('sidebar-toggle');
  var root = document.querySelector('.page');
  if (btn && root) {
    btn.addEventListener('click', function(){
      root.classList.toggle('closed');
    });
  }
}());
router();
