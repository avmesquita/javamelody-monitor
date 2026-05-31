import {
  Component, Input, Output, EventEmitter, OnChanges,
  SimpleChanges, inject, signal, ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ErrorDetails, ErrorRequest, StackTrace } from '../../models/client.model';
import { HeapChartComponent } from '../heap-chart/heap-chart.component';

const BFF_URL = 'http://localhost:3000';

@Component({
  selector: 'app-error-modal',
  standalone: true,
  imports: [CommonModule, HeapChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './error-modal.component.html',
  styleUrls: ['./error-modal.component.scss'],
})
export class ErrorModalComponent implements OnChanges {
  @Input() clientId: number | null = null;
  @Input() clientName = '';
  @Input() visible = false;
  @Output() closed = new EventEmitter<void>();

  private http = inject(HttpClient);
  private cdr  = inject(ChangeDetectorRef);

  loading  = signal(false);
  error    = signal('');
  details  = signal<ErrorDetails | null>(null);
  activeTab = signal<'http' | 'sql' | 'stack'>('http');

  // Histórico de contagem de erros acumulado para o mini-gráfico
  httpErrorHistory: number[] = [];
  sqlErrorHistory:  number[] = [];

  expandedTrace: number | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true && this.clientId !== null) {
      this.load();
    }
    if (changes['visible']?.currentValue === false) {
      this.details.set(null);
      this.error.set('');
      this.expandedTrace = null;
    }
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ErrorDetails>(`${BFF_URL}/api/clients/${this.clientId}/errors`)
      .subscribe({
        next: (data) => {
          this.details.set(data);
          this.loading.set(false);
          // Acumula histórico para o mini-gráfico
          this.httpErrorHistory = [...this.httpErrorHistory.slice(-11),
            data.httpErrors.reduce((s, r) => s + r.errors, 0)];
          this.sqlErrorHistory  = [...this.sqlErrorHistory.slice(-11),
            data.sqlErrors.reduce((s, r) => s + r.errors, 0)];
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.error.set(err.message || 'Erro ao buscar detalhes');
          this.loading.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  setTab(t: 'http' | 'sql' | 'stack'): void { this.activeTab.set(t); }

  toggleTrace(i: number): void {
    this.expandedTrace = this.expandedTrace === i ? null : i;
  }

  errColor(n: number): string {
    return n > 10 ? '#E24B4A' : n > 0 ? '#EF9F27' : '#888780';
  }

  fmtMs(ms: number): string {
    return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms';
  }

  close(): void { this.closed.emit(); }

  onBackdropClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) this.close();
  }
}
