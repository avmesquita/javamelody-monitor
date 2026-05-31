import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, interval, of } from 'rxjs';
import { catchError, startWith } from 'rxjs/operators';
import { ClientMetrics, ClientStatus } from '../models/client.model';

const BFF_URL    = 'http://localhost:3000';
export const POLL_MS = 30_000;
const USE_MOCK   = false; // mude para false para usar o BFF real

// ── Dados demo ────────────────────────────────────────────────────────────────
const MOCK_CLIENTS: ClientMetrics[] = [
  {
    id: 1, name: 'LogOne — Acesso', baseUrl: 'localhost:5000',
    status: 'ok', cpu: 15, heap: 8, heapMax: 8064, heapUsed: 645,
    sessions: 39, threads: 35, uptime: '1d 4h',
    requests: [
      { uri: 'HTTP (total)',    hits: 2366,  avgMs: 1637, maxMs: 0, errors: 309 },
      { uri: 'SQL (total)',     hits: 125000, avgMs: 2,   maxMs: 0, errors: 106 },
      { uri: 'Spring (total)', hits: 96488, avgMs: 83,   maxMs: 0, errors: 0   },
      { uri: 'JSF (total)',    hits: 577,   avgMs: 2933, maxMs: 0, errors: 0   },
    ],
    heapHistory: [7,7,8,8,8,9,8,8,8,8,8,8], lastUpdated: new Date(),
  },
  {
    id: 2, name: 'LogOne — ALZ', baseUrl: 'alz-teste.logone.com.br',
    status: 'warn', cpu: 62, heap: 72, heapMax: 4096, heapUsed: 2950,
    sessions: 18, threads: 28, uptime: '3d 2h',
    requests: [
      { uri: 'HTTP (total)',    hits: 8200,  avgMs: 420, maxMs: 0, errors: 42 },
      { uri: 'SQL (total)',     hits: 41000, avgMs: 3,   maxMs: 0, errors: 8  },
      { uri: 'Spring (total)', hits: 31000, avgMs: 95,  maxMs: 0, errors: 0  },
    ],
    heapHistory: [65,67,68,70,71,72,72,73,72,72,72,72], lastUpdated: new Date(),
  },
];

// ── Tipos do BFF ─────────────────────────────────────────────────────────────
interface BffResponse {
  id:      number;
  name:    string;
  baseUrl: string;
  data?:   ClientMetrics;
  error?:  string;
}

// ── Service ───────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class MelodyService {
  private http = inject(HttpClient);

  private _clients$     = new BehaviorSubject<ClientMetrics[]>(MOCK_CLIENTS);
  private _loading$     = new BehaviorSubject<boolean>(false);
  private _lastRefresh$ = new BehaviorSubject<Date>(new Date());

  readonly clients$     = this._clients$.asObservable();
  readonly loading$     = this._loading$.asObservable();
  readonly lastRefresh$ = this._lastRefresh$.asObservable();

  startPolling(): void {
    interval(POLL_MS).pipe(startWith(0)).subscribe(() => this.refresh());
  }

  refresh(): void {
    this._loading$.next(true);
    USE_MOCK ? this.simulateRefresh() : this.fetchFromBff();
  }

  // ── Fetch real via BFF ────────────────────────────────────────────────────
  private fetchFromBff(): void {
    this.http
      .get<BffResponse[]>(`${BFF_URL}/api/clients/all/monitoring`)
      .pipe(catchError(err => {
        console.error('[MelodyService] BFF indisponível:', err.message);
        return of([] as BffResponse[]);
      }))
      .subscribe(responses => {
        if (!responses.length) { this._loading$.next(false); return; }

        const prev    = this._clients$.getValue();
        const updated: ClientMetrics[] = responses.map(r => {
          const existing = prev.find(c => c.id === r.id);

          if (r.error || !r.data) {
            return {
              id: r.id, name: r.name, baseUrl: r.baseUrl,
              status: 'err' as ClientStatus,
              cpu: 0, heap: 0, heapMax: 0, heapUsed: 0,
              sessions: 0, threads: 0, uptime: '—',
              requests: [],
              heapHistory: existing?.heapHistory ?? [],
              lastUpdated: new Date(),
              error: r.error,
            };
          }

          // O BFF já entrega o objeto mapeado — só acrescenta o histórico de heap
          return {
            ...r.data,
            heapHistory: [...(existing?.heapHistory ?? []).slice(-11), r.data.heap],
            lastUpdated: new Date(),
          };
        });

        this._clients$.next(updated);
        this._loading$.next(false);
        this._lastRefresh$.next(new Date());
      });
  }

  // ── Demo com drift aleatório ──────────────────────────────────────────────
  private simulateRefresh(): void {
    const updated = this._clients$.getValue().map(c => {
      const cpu  = Math.min(100, Math.max(1,  c.cpu  + ((Math.random() * 6 - 3)  | 0)));
      const heap = Math.min(100, Math.max(1,  c.heap + ((Math.random() * 2 - 1)  | 0)));
      return {
        ...c, cpu, heap,
        heapHistory: [...c.heapHistory.slice(1), heap],
        status:      this.calcStatus(cpu, heap),
        lastUpdated: new Date(),
      };
    });
    this._clients$.next(updated);
    this._loading$.next(false);
    this._lastRefresh$.next(new Date());
  }

  private calcStatus(cpu: number, heap: number): ClientStatus {
    if (cpu >= 80 || heap >= 85) return 'err';
    if (cpu >= 60 || heap >= 70) return 'warn';
    return 'ok';
  }
}
