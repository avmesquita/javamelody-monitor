import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { BffConfig, MetricPoint, HourlyPoint, HistoryAlert } from '../models/client.model';

const BFF_URL = 'http://localhost:3000';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private http = inject(HttpClient);

  private _config$ = new BehaviorSubject<BffConfig | null>(null);
  readonly config$ = this._config$.asObservable();

  get config(): BffConfig | null { return this._config$.getValue(); }
  get historyUrl(): string | null { return this.config?.historyApiUrl ?? null; }
  get isPersisting(): boolean { return this.config?.persistenceEnabled ?? false; }

  // ── Carrega configuração do BFF na inicialização ──────────────────────────
  loadConfig(): Observable<BffConfig> {
    return this.http.get<BffConfig>(`${BFF_URL}/config`).pipe(
      tap(cfg => {
        this._config$.next(cfg);
        console.log('[HistoryService] Modo:', cfg.persistenceEnabled ? 'MongoDB ativo' : 'sem persistência');
      }),
      catchError(() => {
        console.warn('[HistoryService] BFF indisponível — modo sem persistência');
        return of({ persistenceEnabled: false, historyApiUrl: null, mongoConnected: false, pollIntervalMs: 30000 } as BffConfig);
      }),
    );
  }

  // ── Ativa/desativa persistência em runtime ────────────────────────────────
  setPersistence(enabled: boolean): Observable<any> {
    return this.http.post(`${BFF_URL}/config`, { persistenceEnabled: enabled }).pipe(
      tap((res: any) => this._config$.next({ ...this.config!, persistenceEnabled: res.persistenceEnabled })),
    );
  }

  // ── Série temporal (NestJS) ───────────────────────────────────────────────
  getLatest(clientId: number, limit = 60): Observable<MetricPoint[]> {
    if (!this.historyUrl) return of([]);
    return this.http.get<MetricPoint[]>(`${this.historyUrl}/api/history/clients/${clientId}/latest?limit=${limit}`)
      .pipe(catchError(() => of([])));
  }

  getHourly(clientId: number, hours = 24): Observable<HourlyPoint[]> {
    if (!this.historyUrl) return of([]);
    return this.http.get<HourlyPoint[]>(`${this.historyUrl}/api/history/clients/${clientId}/hourly?hours=${hours}`)
      .pipe(catchError(() => of([])));
  }

  getSeries(clientId: number, from?: Date, to?: Date, limit = 500): Observable<MetricPoint[]> {
    if (!this.historyUrl) return of([]);
    const params = new URLSearchParams({ limit: String(limit) });
    if (from) params.set('from', from.toISOString());
    if (to)   params.set('to',   to.toISOString());
    return this.http.get<MetricPoint[]>(`${this.historyUrl}/api/history/clients/${clientId}/series?${params}`)
      .pipe(catchError(() => of([])));
  }

  getAlerts(clientId?: number, limit = 50): Observable<HistoryAlert[]> {
    if (!this.historyUrl) return of([]);
    const params = new URLSearchParams({ limit: String(limit) });
    if (clientId) params.set('clientId', String(clientId));
    return this.http.get<HistoryAlert[]>(`${this.historyUrl}/api/history/alerts?${params}`)
      .pipe(catchError(() => of([])));
  }
}
