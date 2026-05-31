import { Component, Input, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ClientMetrics } from '../../models/client.model';
import { HeapChartComponent } from '../heap-chart/heap-chart.component';
import { ErrorModalComponent } from '../error-modal/error-modal.component';

type Tab = 'requests' | 'memory' | 'infra';

@Component({
  selector: 'app-detail-panel',
  standalone: true,
  imports: [CommonModule, DecimalPipe, HeapChartComponent, ErrorModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './detail-panel.component.html',
  styleUrls: ['./detail-panel.component.scss'],
})
export class DetailPanelComponent {
  @Input() client: ClientMetrics | null = null;

  activeTab: Tab = 'requests';
  showErrorModal = signal(false);

  get statusLabel(): string {
    if (!this.client) return '';
    return { ok: 'Normal', warn: 'Atenção', err: 'Crítico' }[this.client.status];
  }

  get heapColor(): string {
    const h = this.client?.heap ?? 0;
    if (h >= 85) return '#E24B4A';
    if (h >= 70) return '#EF9F27';
    return '#1D9E75';
  }

  get totalErrors(): number {
    return this.client?.requests.reduce((s, r) => s + r.errors, 0) ?? 0;
  }

  maxHits(): number {
    return Math.max(1, ...(this.client?.requests.map(r => r.hits) ?? [1]));
  }

  fmtMs(ms: number): string {
    return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms';
  }

  avgColor(ms: number): string {
    if (ms > 1000) return '#BA7517';
    if (ms > 500)  return '#EF9F27';
    return 'inherit';
  }

  maxColor(ms: number): string {
    return ms > 5000 ? '#A32D2D' : '#888780';
  }

  errColor(n: number): string {
    return n > 0 ? '#A32D2D' : '#888780';
  }

  barWidth(hits: number): number {
    return Math.round((hits / this.maxHits()) * 80);
  }

  setTab(t: Tab): void { this.activeTab = t; }

  openErrorModal(): void  { this.showErrorModal.set(true); }
  closeErrorModal(): void { this.showErrorModal.set(false); }
}
