'use strict';

require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const fetch     = require('node-fetch');
const { parse } = require('node-html-parser');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT        = parseInt(process.env.BFF_PORT || '3000', 10);
const CORS_LIST   = (process.env.CORS_ORIGINS || 'http://localhost:4200').split(',').map(s => s.trim());
const SESSION_TTL = 25 * 60 * 1000;

// ── Clientes ──────────────────────────────────────────────────────────────────
let CLIENT_CONFIGS = [];
try {
  CLIENT_CONFIGS = require('./clients.json');
  console.log(`[BFF] ${CLIENT_CONFIGS.length} cliente(s) carregado(s) de clients.json`);
} catch {
  console.warn('[BFF] clients.json não encontrado.');
}

const sessions = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTÊNCIA — MongoDB (opcional, controlada por MONGO_ENABLED)
// ─────────────────────────────────────────────────────────────────────────────

const { MongoClient } = require('mongodb');

let mongoClient   = null;
let mongoDB       = null;
let persistEnabled = (process.env.MONGO_ENABLED || 'false') === 'true';

async function connectMongo() {
  if (mongoClient) return;
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/javamelody';
  mongoClient = new MongoClient(uri);
  await mongoClient.connect();
  mongoDB = mongoClient.db();
  console.log('[BFF] MongoDB conectado:', uri);
}

async function disconnectMongo() {
  if (!mongoClient) return;
  await mongoClient.close();
  mongoClient = null;
  mongoDB = null;
  console.log('[BFF] MongoDB desconectado.');
}

// Rastreia o último status por cliente para detectar mudanças (alertas)
const lastStatus = new Map();

/**
 * Persiste um ponto de métrica e, se houver erros ou mudança de status, salva snapshots/alertas.
 */
async function persist(metrics) {
  if (!persistEnabled || !mongoDB) return;
  try {
    const col     = mongoDB.collection('metrics');
    const alertCol = mongoDB.collection('alerts');
    const now     = new Date();

    const doc = {
      clientId:    metrics.id,
      clientName:  metrics.name,
      collectedAt: now,
      cpu:         metrics.cpu,
      heap:        metrics.heap,
      heapUsed:    metrics.heapUsed,
      heapMax:     metrics.heapMax,
      sessions:    metrics.sessions,
      threads:     metrics.threads,
      status:      metrics.status,
      httpHits:    0, httpErrors: 0, httpAvgMs: 0,
      sqlHits:     0, sqlErrors:  0, sqlAvgMs:  0,
      springHits:  0, springErrors: 0,
      jsfHits:     0, jsfErrors:   0,
      httpErrorSnapshot: [],
      sqlErrorSnapshot:  [],
    };

    // Mapeia requests do payload
    for (const r of (metrics.requests || [])) {
      if (r.uri.includes('HTTP'))    { doc.httpHits   = r.hits; doc.httpErrors   = r.errors; doc.httpAvgMs   = r.avgMs; }
      if (r.uri.includes('SQL'))     { doc.sqlHits    = r.hits; doc.sqlErrors    = r.errors; doc.sqlAvgMs    = r.avgMs; }
      if (r.uri.includes('Spring'))  { doc.springHits = r.hits; doc.springErrors = r.errors; }
      if (r.uri.includes('JSF'))     { doc.jsfHits    = r.hits; doc.jsfErrors    = r.errors; }
    }

    // Se há erros, tenta buscar snapshot detalhado
    if (doc.httpErrors > 0 || doc.sqlErrors > 0) {
      try {
        const cfg = CLIENT_CONFIGS.find(c => c.id === metrics.id);
        if (cfg) {
          const errData = await fetchErrorDetails(cfg);
          doc.httpErrorSnapshot = errData.httpErrors || [];
          doc.sqlErrorSnapshot  = errData.sqlErrors  || [];
        }
      } catch (_) { /* snapshot é melhor esforço */ }
    }

    await col.insertOne(doc);

    // Detecta mudança de status → salva alerta
    const prev = lastStatus.get(metrics.id);
    if (prev && prev !== metrics.status) {
      await alertCol.insertOne({
        clientId:   metrics.id,
        clientName: metrics.name,
        occurredAt: now,
        fromStatus: prev,
        toStatus:   metrics.status,
        cpu:        metrics.cpu,
        heap:       metrics.heap,
        message:    `Status mudou de ${prev} → ${metrics.status} (CPU: ${metrics.cpu}%, Heap: ${metrics.heap}%)`,
      });
      console.log(`[BFF] Alerta: "${metrics.name}" ${prev} → ${metrics.status}`);
    }
    lastStatus.set(metrics.id, metrics.status);

  } catch (err) {
    console.error('[BFF] Erro ao persistir:', err.message);
  }
}


// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(cors({
  origin: (origin, cb) =>
    (!origin || CORS_LIST.includes(origin)) ? cb(null, true) : cb(new Error(`CORS bloqueado: ${origin}`)),
  credentials: true,
}));

// ─────────────────────────────────────────────────────────────────────────────
// PARSER PROMETHEUS
// ─────────────────────────────────────────────────────────────────────────────

function parsePrometheus(text) {
  const metrics = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const spaceIdx = trimmed.lastIndexOf(' ');
    if (spaceIdx === -1) continue;
    const key   = trimmed.substring(0, spaceIdx).trim();
    const value = parseFloat(trimmed.substring(spaceIdx + 1));
    if (!isNaN(value)) metrics[key] = value;
  }
  return metrics;
}

function mapPrometheusToMetrics(cfg, raw) {
  const m = parsePrometheus(raw);

  const heapUsedBytes = m['javamelody_memory_used_bytes']  || 0;
  const heapMaxBytes  = m['javamelody_memory_max_bytes']   || 1;
  const heapUsedMB    = Math.round(heapUsedBytes / 1_048_576);
  const heapMaxMB     = Math.round(heapMaxBytes  / 1_048_576);
  const heap          = Math.round(m['javamelody_memory_used_pct']      || 0);
  const cpu           = Math.round(m['javamelody_system_cpu_load_pct']  || 0);
  const sessions      = Math.round(m['javamelody_sessions_active_count']|| 0);
  const threads       = Math.round(m['javamelody_threads_count']        || 0);

  const httpHits     = Math.round(m['javamelody_http_hits_count']       || 0);
  const httpErrors   = Math.round(m['javamelody_http_errors_count']     || 0);
  const httpDuration = Math.round(m['javamelody_http_duration_millis']  || 0);
  const httpAvgMs    = httpHits > 0 ? Math.round(httpDuration / httpHits) : 0;

  const sqlHits      = Math.round(m['javamelody_sql_hits_count']        || 0);
  const sqlErrors    = Math.round(m['javamelody_sql_errors_count']      || 0);
  const sqlDuration  = Math.round(m['javamelody_sql_duration_millis']   || 0);
  const sqlAvgMs     = sqlHits > 0 ? Math.round(sqlDuration / sqlHits) : 0;

  const springHits     = Math.round(m['javamelody_spring_hits_count']      || 0);
  const springErrors   = Math.round(m['javamelody_spring_errors_count']    || 0);
  const springDuration = Math.round(m['javamelody_spring_duration_millis'] || 0);
  const springAvgMs    = springHits > 0 ? Math.round(springDuration / springHits) : 0;

  const jsfHits     = Math.round(m['javamelody_jsf_hits_count']      || 0);
  const jsfErrors   = Math.round(m['javamelody_jsf_errors_count']    || 0);
  const jsfDuration = Math.round(m['javamelody_jsf_duration_millis'] || 0);
  const jsfAvgMs    = jsfHits > 0 ? Math.round(jsfDuration / jsfHits) : 0;

  const jvmStartMs = m['javamelody_jvm_start_time'] || Date.now();
  const uptimeMs   = Date.now() - jvmStartMs;
  const uptimeDays = Math.floor(uptimeMs / 86_400_000);
  const uptimeHrs  = Math.floor((uptimeMs % 86_400_000) / 3_600_000);

  const status = cpu >= 80 || heap >= 85 ? 'err'
               : cpu >= 60 || heap >= 70 ? 'warn'
               : 'ok';

  return {
    id: cfg.id, name: cfg.name, baseUrl: cfg.baseUrl,
    status, cpu, heap, heapUsed: heapUsedMB, heapMax: heapMaxMB,
    sessions, threads,
    uptime: `${uptimeDays}d ${uptimeHrs}h`,
    processors: Math.round(m['javamelody_system_processors_count'] || 0),
    requests: [
      { uri: 'HTTP (total)',   hits: httpHits,   avgMs: httpAvgMs,   maxMs: 0, errors: httpErrors   },
      { uri: 'SQL (total)',    hits: sqlHits,     avgMs: sqlAvgMs,    maxMs: 0, errors: sqlErrors     },
      { uri: 'Spring (total)',hits: springHits,  avgMs: springAvgMs, maxMs: 0, errors: springErrors  },
      { uri: 'JSF (total)',   hits: jsfHits,     avgMs: jsfAvgMs,    maxMs: 0, errors: jsfErrors     },
    ].filter(r => r.hits > 0),
    extra: {
      gcMillis:          Math.round(m['javamelody_memory_gc_millis']            || 0),
      nonHeapMB:         Math.round((m['javamelody_memory_used_non_heap_bytes'] || 0) / 1_048_576),
      loadedClasses:     Math.round(m['javamelody_loaded_classes_count']        || 0),
      activeConnections: Math.round(m['javamelody_connections_active_count']    || 0),
      transactions:      Math.round(m['javamelody_transactions_count']          || 0),
      logHits:           Math.round(m['javamelody_log_hits_count']              || 0),
      sessionAvgAgeMin:  Math.round(m['javamelody_sessions_age_avg_minutes']    || 0),
    },
    lastUpdated: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE COOKIE
// ─────────────────────────────────────────────────────────────────────────────

function extractCookie(headers, name) {
  const raw = headers.raw?.()?.['set-cookie'] || [];
  for (const line of raw) {
    const part = line.split(';')[0].trim();
    if (part.toLowerCase().startsWith(name.toLowerCase() + '=')) return part;
  }
  return '';
}

function extractAllCookies(headers) {
  const raw = headers.raw?.()?.['set-cookie'] || [];
  return raw.map(line => line.split(';')[0].trim()).filter(Boolean).join('; ');
}

function mergeCookies(...parts) {
  const map = new Map();
  parts.filter(Boolean).forEach(part => {
    part.split(';').map(s => s.trim()).filter(Boolean).forEach(kv => {
      const [k] = kv.split('=');
      if (k) map.set(k.trim(), kv);
    });
  });
  return [...map.values()].join('; ');
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN — 3 ETAPAS
//
// Etapa 1: GET /login.jsf + POST fingerprint (ThumbMark/PrimeFaces)
// Etapa 2: POST /login.jsf — AJAX PrimeFaces com credenciais
// Etapa 3: POST /login     — Spring Security form login (emite JSESSIONID autenticado)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchLoginPage(baseUrl) {
  const res = await fetch(`${baseUrl}/login.jsf`, {
    method: 'GET', redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`GET /login.jsf retornou ${res.status}`);

  const html      = await res.text();
  const root      = parse(html);
  const preCookie = extractAllCookies(res.headers);

  const vsInput = root.querySelector('input[name="javax.faces.ViewState"]');
  if (!vsInput) throw new Error('javax.faces.ViewState não encontrado');
  const viewState = vsInput.getAttribute('value') || '';

  const fpInput  = root.querySelector('input[name*="browserFingerprint"]');
  const fpForm   = fpInput?.closest('form');
  const fpFormId = fpForm?.getAttribute('id') || 'j_idt79';
  const fpCompId = `${fpFormId}:j_idt80`;

  const userInput   = root.querySelector('input[name*="username"], input[placeholder="Usuário"]');
  const passInput   = root.querySelector('input[name*="password"], input[placeholder="Senha"]');
  const loginForm   = userInput?.closest('form');
  const loginFormId = loginForm?.getAttribute('id') || 'mfaLoginForm';
  const loginBtn    = loginForm?.querySelector('[id*="loginButton"]');
  const loginBtnId  = loginBtn?.getAttribute('id') || `${loginFormId}:mfaPanelLogin:loginButton:button`;

  // Nomes compostos JSF: formId:componentPath:fieldName
  const rawUserName = userInput?.getAttribute('name') || 'username';
  const rawPassName = passInput?.getAttribute('name') || 'password';
  const userField   = rawUserName.includes(':') ? rawUserName : `${loginFormId}:mfaPanelLogin:username`;
  const passField   = rawPassName.includes(':') ? rawPassName : `${loginFormId}:mfaPanelLogin:password`;

  // Campos hidden do form (excluindo credenciais e ViewState — enviados separadamente)
  const excludeNames = new Set(['javax.faces.ViewState', 'username', 'password', 'j_username', 'j_password']);
  const loginHidden  = { [loginFormId]: loginFormId };
  loginForm?.querySelectorAll('input[type="hidden"], input[type="text"], input[type="password"]').forEach(i => {
    const n = i.getAttribute('name');
    if (n && !excludeNames.has(n) && !n.includes('username') && !n.includes('password')) {
      loginHidden[n] = i.getAttribute('value') || '';
    }
  });

  return { preCookie, viewState, fpFormId, fpCompId, loginFormId, loginBtnId, userField, passField, loginHidden };
}

async function sendFingerprint(baseUrl, page) {
  const body = new URLSearchParams({
    'javax.faces.partial.ajax':    'true',
    'javax.faces.source':          page.fpCompId,
    'javax.faces.partial.execute': page.fpCompId,
    'javax.faces.partial.render':  '@none',
    [page.fpCompId]:               page.fpCompId,
    'browserFingerprint':          'bff00000000000000000000000000000',
    [page.fpFormId]:               page.fpFormId,
    'javax.faces.ViewState':       page.viewState,
  });

  const res = await fetch(`${baseUrl}/login.jsf`, {
    method: 'POST',
    headers: {
      'Content-Type':     'application/x-www-form-urlencoded; charset=UTF-8',
      'Faces-Request':    'partial/ajax',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept':           'application/xml, text/xml, */*; q=0.01',
      'Referer':          `${baseUrl}/login.jsf`,
      'Cookie':           page.preCookie,
    },
    body: body.toString(), redirect: 'manual',
  });

  if (res.status !== 200 && res.status !== 302)
    throw new Error(`Fingerprint retornou ${res.status}`);

  const xml   = await res.text();
  const match = xml.match(/id="javax\.faces\.ViewState"[^>]*><!\[CDATA\[(.*?)\]\]>/s)
             || xml.match(/id="javax\.faces\.ViewState"[^>]*>(.*?)<\/update>/s);
  const updatedVS  = match?.[1]?.trim() || page.viewState;
  const newCookies = extractAllCookies(res.headers);
  return { updatedVS, cookie: mergeCookies(page.preCookie, newCookies) };
}

async function sendJsfCredentials(baseUrl, page, step1, username, password) {
  const body = new URLSearchParams({
    'javax.faces.partial.ajax':    'true',
    'javax.faces.source':          page.loginBtnId,
    'javax.faces.partial.execute': '@all',
    'javax.faces.partial.render':  `${page.loginFormId} outputCaptcha`,
    [page.loginBtnId]:             page.loginBtnId,
    ...page.loginHidden,
    [page.userField]:              username,
    [page.passField]:              password,
    'javax.faces.ViewState':       step1.updatedVS,
  });

  const res = await fetch(`${baseUrl}/login.jsf`, {
    method: 'POST',
    headers: {
      'Content-Type':     'application/x-www-form-urlencoded; charset=UTF-8',
      'Faces-Request':    'partial/ajax',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept':           'application/xml, text/xml, */*; q=0.01',
      'Referer':          `${baseUrl}/login.jsf`,
      'Cookie':           step1.cookie,
    },
    body: body.toString(), redirect: 'manual',
  });

  if (res.status !== 200 && res.status !== 302)
    throw new Error(`JSF credentials retornou ${res.status}`);
}

async function sendSpringLogin(baseUrl, cookie, username, password) {
  const res = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept':       'text/html,application/xhtml+xml',
      'Referer':      `${baseUrl}/login.jsf`,
      'Cookie':       cookie,
    },
    body:     new URLSearchParams({ username, password }).toString(),
    redirect: 'manual',
  });

  const location = res.headers.get('location') || '';
  if (location.includes('error') || (res.status === 302 && location.includes('login'))) {
    throw new Error('Spring Security rejeitou as credenciais');
  }

  // Novo JSESSIONID autenticado vem no Set-Cookie do 302
  const newSession = extractCookie(res.headers, 'JSESSIONID');
  if (newSession) return newSession;

  // Fallback: segue o redirect e pega lá
  if (location && !location.includes('login')) {
    const nextUrl  = location.startsWith('http') ? location : `${baseUrl}${location}`;
    const followRes = await fetch(nextUrl, {
      method: 'GET',
      headers: { Cookie: cookie, 'User-Agent': 'Mozilla/5.0' },
      redirect: 'manual',
    });
    const followCookie = extractCookie(followRes.headers, 'JSESSIONID');
    if (followCookie) return followCookie;
  }

  throw new Error('JSESSIONID autenticado não encontrado após POST /login');
}

async function doLogin(cfg) {
  console.log(`[BFF] Login: "${cfg.name}" em ${cfg.baseUrl}`);

  const page  = await fetchLoginPage(cfg.baseUrl);
  console.log(`[BFF]   Etapa 1/3: fingerprint...`);
  const step1 = await sendFingerprint(cfg.baseUrl, page);
  console.log(`[BFF]   Etapa 2/3: JSF credentials...`);
  await sendJsfCredentials(cfg.baseUrl, page, step1, cfg.username, cfg.password);
  console.log(`[BFF]   Etapa 3/3: Spring Security...`);
  const cookie = await sendSpringLogin(cfg.baseUrl, step1.cookie, cfg.username, cfg.password);

  console.log(`[BFF] Login OK: "${cfg.name}"`);
  return cookie;
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSÕES E PROXY
// ─────────────────────────────────────────────────────────────────────────────

async function ensureSession(cfg) {
  // Modo manual: usa sessionCookie do clients.json (útil para debug ou MFA)
  if (cfg.sessionCookie) {
    if (!sessions.has(cfg.id)) {
      console.log(`[BFF] "${cfg.name}": usando sessionCookie manual`);
      sessions.set(cfg.id, { cookie: cfg.sessionCookie, expiry: Date.now() + SESSION_TTL });
    }
    return sessions.get(cfg.id).cookie;
  }

  const sess = sessions.get(cfg.id);
  if (sess?.cookie && Date.now() < sess.expiry) return sess.cookie;
  const cookie = await doLogin(cfg);
  sessions.set(cfg.id, { cookie, expiry: Date.now() + SESSION_TTL });
  return cookie;
}

async function fetchPrometheus(cfg) {
  const cookie = await ensureSession(cfg);
  const url    = `${cfg.baseUrl}/monitoring?format=prometheus`;

  let res = await fetch(url, {
    headers: { Cookie: cookie, Accept: 'text/plain', 'User-Agent': 'Mozilla/5.0' },
    redirect: 'manual',
  });

  // Sessão expirada — renova e tenta novamente
  if (res.status === 302 || res.status === 401) {
    console.warn(`[BFF] Sessão expirada para "${cfg.name}", renovando...`);
    sessions.delete(cfg.id);
    const fresh = await ensureSession(cfg);
    res = await fetch(url, {
      headers: { Cookie: fresh, Accept: 'text/plain' },
      redirect: 'manual',
    });
  }

  if (!res.ok && res.status !== 302)
    throw new Error(`/monitoring retornou ${res.status}`);

  const text = await res.text();
  if (!text.includes('javamelody_'))
    throw new Error('Resposta não é formato Prometheus do JavaMelody');

  const result = mapPrometheusToMetrics(cfg, text);
  // Persistência assíncrona — não bloqueia a resposta ao Angular
  persist(result).catch(() => {});

  // Se há erros, busca detalhes e envia ao catálogo (best-effort, assíncrono)
  if ((result.requests || []).some(r => r.errors > 0)) {
    fetchErrorDetails(cfg)
      .then(details => ingestErrorsToCatalog(cfg, details))
      .catch(() => {});
  }

  return result;
}

function findClient(id) {
  const cfg = CLIENT_CONFIGS.find(c => String(c.id) === String(id));
  if (!cfg) throw new Error(`Cliente "${id}" não encontrado em clients.json`);
  return cfg;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTAS
// ─────────────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    clients: CLIENT_CONFIGS.map(c => {
      const s = sessions.get(c.id);
      return { id: c.id, name: c.name, sessionActive: !!(s?.cookie && Date.now() < s.expiry) };
    }),
  });
});

app.get('/api/clients', (_req, res) => {
  res.json(CLIENT_CONFIGS.map(({ id, name, baseUrl }) => ({ id, name, baseUrl })));
});

app.post('/api/clients/:id/session/refresh', async (req, res) => {
  try {
    const cfg = findClient(req.params.id);
    sessions.delete(cfg.id);
    await ensureSession(cfg);
    res.json({ ok: true, message: `Sessão de "${cfg.name}" renovada.` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});



// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO DE ERROS — envia stack traces novos para a History API catalogar
// ─────────────────────────────────────────────────────────────────────────────

const HISTORY_API = process.env.HISTORY_API_URL || 'http://localhost:3001';

/**
 * Extrai o tipo da exception de um stack trace Java.
 * Ex: "java.lang.NullPointerException: cannot read field X"
 *     → { type: "NullPointerException", message: "cannot read field X" }
 */
function parseException(stackTrace) {
  if (!stackTrace) return { type: 'UnknownException', message: '' };
  const firstLine = stackTrace.split('\n')[0] || '';
  // Formato: "pacote.ExceptionType: mensagem"
  const match = firstLine.match(/([A-Za-z0-9_$.]+Exception|[A-Za-z0-9_$.]+Error):\s*(.*)/);
  if (match) {
    const parts = match[1].split('.');
    return {
      type:    parts[parts.length - 1],
      message: match[2].trim(),
    };
  }
  return { type: 'UnknownException', message: firstLine };
}

/**
 * Envia cada stack trace dos erros para o catálogo da History API.
 * Chamado após fetchPrometheus quando há erros HTTP ou SQL.
 * Usa best-effort: falhas não afetam o fluxo principal.
 */
async function ingestErrorsToCatalog(cfg, errorDetails) {
  if (!errorDetails) return;

  const allErrors = [
    ...(errorDetails.httpErrors || []).map(e => ({ ...e, sourceType: 'http' })),
    ...(errorDetails.sqlErrors  || []).map(e => ({ ...e, sourceType: 'sql'  })),
    ...(errorDetails.stackTraces || []).map(st => ({
      uri:        'unknown',
      errors:     1,
      statusHttp: 500,
      sourceType: 'stack',
      stackTrace: st.full,
      message:    st.message,
    })),
  ];

  for (const err of allErrors) {
    if (!err.errors && err.sourceType !== 'stack') continue;

    const exc = parseException(err.stackTrace || err.message || '');

    try {
      await fetch(`${HISTORY_API}/api/catalog/ingest`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId:      cfg.id,
          clientName:    cfg.name,
          exceptionType: exc.type,
          uri:           err.uri || 'unknown',
          statusHttp:    err.statusHttp || 500,
          stackTrace:    err.stackTrace || '',
          errorMessage:  exc.message || err.message || '',
        }),
      });
    } catch (_) {
      // Best-effort — não interrompe o fluxo
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO — habilita/desabilita persistência em runtime
// ─────────────────────────────────────────────────────────────────────────────

// GET /config — Angular chama isso na inicialização para saber o modo ativo
app.get('/config', (_req, res) => {
  res.json({
    persistenceEnabled: persistEnabled,
    historyApiUrl:      persistEnabled ? (process.env.HISTORY_API_URL || 'http://localhost:3001') : null,
    mongoConnected:     !!mongoDB,
    pollIntervalMs:     parseInt(process.env.POLL_INTERVAL_MS || '30000'),
  });
});

// POST /config — muda o modo em runtime (sem restart)
app.post('/config', async (req, res) => {
  const { persistenceEnabled } = req.body;
  if (typeof persistenceEnabled !== 'boolean') {
    return res.status(400).json({ error: 'persistenceEnabled deve ser boolean' });
  }

  if (persistenceEnabled && !persistEnabled) {
    try {
      await connectMongo();
      persistEnabled = true;
      console.log('[BFF] Persistência habilitada em runtime.');
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao conectar MongoDB: ' + err.message });
    }
  } else if (!persistenceEnabled && persistEnabled) {
    await disconnectMongo();
    persistEnabled = false;
    console.log('[BFF] Persistência desabilitada em runtime.');
  }

  res.json({ persistenceEnabled, mongoConnected: !!mongoDB });
});

// IMPORTANTE: /all antes de /:id para evitar conflito de rota
app.get('/api/clients/all/monitoring', async (_req, res) => {
  const results = await Promise.allSettled(
    CLIENT_CONFIGS.map(cfg => fetchPrometheus(cfg))
  );
  res.json(results.map((r, i) => ({
    id:      CLIENT_CONFIGS[i].id,
    name:    CLIENT_CONFIGS[i].name,
    baseUrl: CLIENT_CONFIGS[i].baseUrl,
    ...(r.status === 'fulfilled'
      ? { data: r.value }
      : { error: r.reason?.message || 'Erro desconhecido' }),
  })));
});

app.get('/api/clients/:id/monitoring', async (req, res) => {
  try {
    res.json(await fetchPrometheus(findClient(req.params.id)));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// DETALHES DE ERROS — busca lazy, apenas quando o usuário solicita
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Faz scraping do HTML do /monitoring para extrair:
 * - Top requisições HTTP com erro
 * - Top queries SQL com erro  
 * - Stack traces / últimas exceções
 */
async function fetchErrorDetails(cfg) {
  // Busca HTML de uma URL do monitoring com sessão válida
  const fetchHtml = async (url) => {
    const cookie = await ensureSession(cfg);
    let res = await fetch(url, {
      headers: { Cookie: cookie, Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' },
      redirect: 'manual',
    });
    if (res.status === 302 || res.status === 401) {
      sessions.delete(cfg.id);
      const fresh = await ensureSession(cfg);
      res = await fetch(url, {
        headers: { Cookie: fresh, Accept: 'text/html' },
        redirect: 'manual',
      });
    }
    return res.ok ? res.text() : '';
  };

  // Busca a página principal (tem tabela HTTP com erros) e a de database (SQL)
  const [mainHtml, dbHtml] = await Promise.all([
    fetchHtml(`${cfg.baseUrl}/monitoring`),
    fetchHtml(`${cfg.baseUrl}/monitoring?part=database`),
  ]);

  // ── Parser de tabelas do JavaMelody ──────────────────────────────────────
  // O JavaMelody renderiza cada seção como uma <table>. As colunas variam por
  // seção mas o padrão geral é: nome | hits | média | máx | erros | ...
  // Filtramos apenas linhas onde a coluna de erros (última numérica) > 0.
  const parseTable = (html, type, errorColIndex) => {
    if (!html) return [];
    const root = parse(html);
    const rows = [];

    root.querySelectorAll('table').forEach(table => {
      const trs = table.querySelectorAll('tr');
      // Detecta se esta tabela tem cabeçalho com "Erros" ou "Errors"
      const header = trs[0]?.text?.toLowerCase() || '';
      const isRelevant = header.includes('erro') || header.includes('error')
                      || header.includes('requ') || header.includes('sql');
      if (!isRelevant) return;

      for (let i = 1; i < trs.length && rows.length < 20; i++) {
        const tds  = trs[i].querySelectorAll('td');
        if (tds.length < 3) continue;

        // Extrai texto de cada coluna
        const cols = Array.from(tds).map(td => td.text?.trim() || '');
        const uri  = cols[0];
        if (!uri || uri.length < 2) continue;

        // Tenta encontrar a coluna de erros — geralmente é a última ou penúltima
        // com valor numérico. Usa errorColIndex se fornecido, senão auto-detecta.
        let errors = 0;
        if (errorColIndex !== undefined && cols[errorColIndex]) {
          errors = parseInt(cols[errorColIndex].replace(/[^0-9]/g, '')) || 0;
        } else {
          // Auto-detecta: última coluna numérica não-zero entre as últimas 4
          for (let c = cols.length - 1; c >= Math.max(1, cols.length - 4); c--) {
            const v = parseInt(cols[c].replace(/[^0-9]/g, ''));
            if (!isNaN(v) && v > 0) { errors = v; break; }
          }
        }

        if (errors === 0) continue; // só mostra quem tem erro

        // Extrai hits, avgMs, maxMs das colunas intermediárias (posições 1,2,3)
        const parseMs = (s) => {
          if (!s) return 0;
          const num = parseFloat(s.replace(',', '.').replace(/[^0-9.]/g, ''));
          return isNaN(num) ? 0 : Math.round(s.includes('s') && !s.includes('ms') ? num * 1000 : num);
        };

        rows.push({
          uri,
          hits:   parseInt(cols[1]?.replace(/[^0-9]/g, '') || '0') || 0,
          avgMs:  parseMs(cols[2]),
          maxMs:  parseMs(cols[3]),
          errors,
          type,
        });
      }
    });

    return rows;
  };

  // ── Stack traces ──────────────────────────────────────────────────────────
  // O JavaMelody mostra erros recentes em células <td> que contêm stack traces
  const parseStackTraces = (html) => {
    if (!html) return [];
    const root   = parse(html);
    const traces = [];
    const seen   = new Set();

    root.querySelectorAll('td, pre, div').forEach(el => {
      const text = el.text?.trim() || '';
      // Stack trace Java sempre tem "at " seguido de pacote
      if (
        text.length > 50 &&
        traces.length < 8 &&
        (text.includes('Exception') || text.includes('Error:')) &&
        text.match(/\tat /)  // tab + "at " é o padrão do stack trace Java
      ) {
        const key = text.substring(0, 80);
        if (!seen.has(key)) {
          seen.add(key);
          const firstLine = text.split(String.fromCharCode(10))[0] || text.substring(0, 200);
          traces.push({
            message: firstLine.trim().substring(0, 300),
            full:    text.substring(0, 3000),
          });
        }
      }
    });

    return traces;
  };

  const httpErrors  = parseTable(mainHtml, 'http');
  const sqlErrors   = parseTable(dbHtml,   'sql');
  const stackTraces = parseStackTraces(mainHtml);

  return {
    httpErrors:  httpErrors.slice(0, 15),
    sqlErrors:   sqlErrors.slice(0,  15),
    stackTraces,
    fetchedAt:   new Date().toISOString(),
  };
}

// GET /api/clients/:id/errors — detalhes de erros (lazy, só quando clicado)
app.get('/api/clients/:id/errors', async (req, res) => {
  try {
    const cfg  = findClient(req.params.id);
    const data = await fetchErrorDetails(cfg);
    res.json(data);
  } catch (err) {
    console.error(`[BFF] Erro em /errors cliente ${req.params.id}:`, err.message);
    res.status(502).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n✔ JavaMelody BFF rodando em http://localhost:${PORT}`);
  console.log(`  CORS liberado: ${CORS_LIST.join(', ')}\n`);
  // Conecta MongoDB se persistência estiver habilitada no .env
  if (persistEnabled) {
    try {
      await connectMongo();
    } catch (err) {
      console.error('  ✘ Falha ao conectar MongoDB:', err.message);
      console.error('    Continuando sem persistência.');
      persistEnabled = false;
    }
  }

  for (const cfg of CLIENT_CONFIGS) {
    try { await ensureSession(cfg); }
    catch (err) { console.error(`  ✘ Falha login "${cfg.name}": ${err.message}`); }
  }
  console.log('');
  if (persistEnabled) console.log('  💾 Persistência MongoDB ativa\n');
  else                console.log('  ℹ  Modo sem persistência (MONGO_ENABLED=false)\n');
});