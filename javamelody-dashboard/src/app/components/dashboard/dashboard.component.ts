import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, AsyncPipe } from '@angular/common';
import { ClientMetrics } from '../../models/client.model';
import { MelodyService } from '../../services/melody.service';
import { HistoryService } from '../../services/history.service';
import { ClientCardComponent } from '../client-card/client-card.component';
import { DetailPanelComponent } from '../detail-panel/detail-panel.component';
import { CatalogComponent } from '../catalog/catalog.component';

type View = 'dashboard' | 'catalog';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, AsyncPipe, ClientCardComponent, DetailPanelComponent, CatalogComponent],
  templateUrl: './dashboard.component.html',
  styleUrls:   ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  private svc     = inject(MelodyService);
  private history = inject(HistoryService);

  clients$     = this.svc.clients$;
  loading$     = this.svc.loading$;
  lastRefresh$ = this.svc.lastRefresh$;
  config$      = this.history.config$;

  selected  = signal<ClientMetrics | null>(null);
  activeView = signal<View>('dashboard');

  ngOnInit(): void {
    this.history.loadConfig().subscribe(() => this.svc.startPolling());
  }

  select(c: ClientMetrics): void { this.selected.set(c); }
  refresh(): void { this.svc.refresh(); }
  setView(v: View): void { this.activeView.set(v); }
  trackById(_: number, c: ClientMetrics): number { return c.id; }
  togglePersistence(): void {
    this.history.setPersistence(!this.history.isPersisting).subscribe();
  }

  counts(clients: ClientMetrics[]): { ok: number; warn: number; err: number } {
    return {
      ok:   clients.filter(c => c.status === 'ok').length,
      warn: clients.filter(c => c.status === 'warn').length,
      err:  clients.filter(c => c.status === 'err').length,
    };
  }
}
