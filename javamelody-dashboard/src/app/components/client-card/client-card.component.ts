import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClientMetrics } from '../../models/client.model';

@Component({
  selector: 'app-client-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './client-card.component.html',
  styleUrls: ['./client-card.component.scss'],
})
export class ClientCardComponent {
  @Input({ required: true }) client!: ClientMetrics;
  @Input() active = false;
  @Output() selected = new EventEmitter<ClientMetrics>();

  get statusLabel(): string {
    return { ok: 'Normal', warn: 'Atenção', err: 'Crítico' }[this.client.status];
  }

  heapColor(v: number): string {
    if (v >= 85) return '#E24B4A';
    if (v >= 70) return '#EF9F27';
    return '#1D9E75';
  }

  cpuColor(v: number): string {
    if (v >= 80) return '#E24B4A';
    if (v >= 60) return '#EF9F27';
    return '#1D9E75';
  }
}
