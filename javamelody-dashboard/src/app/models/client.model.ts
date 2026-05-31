export type ClientStatus = 'ok' | 'warn' | 'err';

export interface HttpRequest {
  uri: string;
  hits: number;
  avgMs: number;
  maxMs: number;
  errors: number;
}

export interface ClientConfig {
  id: number;
  name: string;
  baseUrl: string;
  username?: string;
  password?: string;
}

export interface ClientMetrics {
  id: number;
  name: string;
  baseUrl: string;
  status: ClientStatus;
  cpu: number;
  heap: number;
  heapMax: number;
  heapUsed: number;
  sessions: number;
  threads: number;
  uptime: string;
  requests: HttpRequest[];
  heapHistory: number[];
  lastUpdated: Date;
  error?: string;
}

export interface ErrorRequest {
  uri: string;
  hits: number;
  avgMs: number;
  maxMs: number;
  errors: number;
  type: 'http' | 'sql';
}

export interface StackTrace {
  message: string;
  full: string;
}

export interface ErrorDetails {
  httpErrors: ErrorRequest[];
  sqlErrors: ErrorRequest[];
  stackTraces: StackTrace[];
  fetchedAt: string;
}

// ── Configuração retornada pelo BFF ──────────────────────────────────────────
export interface BffConfig {
  persistenceEnabled: boolean;
  historyApiUrl:      string | null;
  mongoConnected:     boolean;
  pollIntervalMs:     number;
}

// ── Série temporal (NestJS API) ───────────────────────────────────────────────
export interface MetricPoint {
  clientId:    number;
  clientName:  string;
  collectedAt: string;
  cpu:         number;
  heap:        number;
  heapUsed:    number;
  heapMax:     number;
  sessions:    number;
  threads:     number;
  status:      string;
  httpErrors:  number;
  sqlErrors:   number;
}

export interface HourlyPoint {
  from:         string;
  avgCpu:       number;
  maxCpu:       number;
  avgHeap:      number;
  maxHeap:      number;
  totalHttpErr: number;
  totalSqlErr:  number;
  samples:      number;
}

export interface HistoryAlert {
  clientId:   number;
  clientName: string;
  occurredAt: string;
  fromStatus: string;
  toStatus:   string;
  cpu:        number;
  heap:       number;
  message:    string;
}

// ── Catálogo de erros ─────────────────────────────────────────────────────────
export type CatalogStatus   = 'open' | 'investigating' | 'resolved';
export type ErrorSeverity   = 'low' | 'medium' | 'high' | 'critical';

export interface AiAnalysis {
  probableCause:  string;
  suggestedFixes: string[];
  severity:       ErrorSeverity;
  category:       string;
  context:        string;
  analyzedAt:     string;
  model:          string;
}

export interface DevSolution {
  description: string;
  author:      string;
  resolvedAt:  string;
}

export interface CatalogEntry {
  _id:           string;
  hash:          string;
  exceptionType: string;
  uri:           string;
  statusHttp:    number;
  clientId:      number;
  clientName:    string;
  stackTrace:    string;
  errorMessage:  string;
  occurrences:   number;
  firstSeenAt:   string;
  lastSeenAt:    string;
  aiAnalysis:    AiAnalysis | null;
  aiPending:     boolean;
  aiError:       string | null;
  devSolution:   DevSolution | null;
  status:        CatalogStatus;
  notes:         string | null;
}

export interface CatalogStats {
  total:         number;
  open:          number;
  investigating: number;
  resolved:      number;
  critical:      number;
  high:          number;
  totalOccurrences: number;
}
