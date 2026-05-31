import {
  Component, OnInit, inject, signal,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import {
  CatalogEntry, CatalogStats, CatalogStatus, AiAnalysis,
} from '../../models/client.model';
import { HistoryService } from '../../services/history.service';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalog.component.html',
  styleUrls:   ['./catalog.component.scss'],
})
export class CatalogComponent implements OnInit {
  readonly Math = Math;
  private http    = inject(HttpClient);
  private history = inject(HistoryService);
  private cdr     = inject(ChangeDetectorRef);

  stats    = signal<CatalogStats | null>(null);
  entries  = signal<CatalogEntry[]>([]);
  total    = signal(0);
  loading  = signal(false);
  selected = signal<CatalogEntry | null>(null);
  editing  = signal(false);

  // Filtros
  filterStatus   = '';
  filterSeverity = '';
  filterSearch   = '';
  page           = 0;
  pageSize       = 20;

  // Form de edição
  editStatus:   CatalogStatus = 'open';
  editSolution = '';
  editAuthor   = '';
  editNotes    = '';

  get apiUrl(): string {
    return this.history.historyUrl || 'http://localhost:3001';
  }

  ngOnInit(): void {
    this.loadStats();
    this.loadEntries();
  }

  loadStats(): void {
    this.http.get<CatalogStats>(`${this.apiUrl}/api/catalog/stats`).subscribe({
      next: s => { this.stats.set(s); this.cdr.markForCheck(); },
    });
  }

  loadEntries(): void {
    this.loading.set(true);
    const params = new URLSearchParams({
      limit: String(this.pageSize),
      skip:  String(this.page * this.pageSize),
    });
    if (this.filterStatus)   params.set('status',   this.filterStatus);
    if (this.filterSeverity) params.set('severity', this.filterSeverity);
    if (this.filterSearch)   params.set('search',   this.filterSearch);

    this.http.get<{ total: number; entries: CatalogEntry[] }>(
      `${this.apiUrl}/api/catalog?${params}`
    ).subscribe({
      next: r => {
        this.entries.set(r.entries);
        this.total.set(r.total);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: () => { this.loading.set(false); this.cdr.markForCheck(); },
    });
  }

  applyFilters(): void {
    this.page = 0;
    this.loadEntries();
  }

  clearFilters(): void {
    this.filterStatus = this.filterSeverity = this.filterSearch = '';
    this.page = 0;
    this.loadEntries();
  }

  select(entry: CatalogEntry): void {
    this.selected.set(entry);
    this.editing.set(false);
    this.editStatus   = entry.status;
    this.editSolution = entry.devSolution?.description || '';
    this.editAuthor   = entry.devSolution?.author      || '';
    this.editNotes    = entry.notes                    || '';
  }

  closeDetail(): void { this.selected.set(null); }

  startEdit(): void { this.editing.set(true); }

  saveEdit(): void {
    const entry = this.selected();
    if (!entry) return;

    const payload: any = {
      status: this.editStatus,
      notes:  this.editNotes,
    };

    if (this.editStatus === 'resolved' && this.editSolution) {
      payload.devSolution = {
        description: this.editSolution,
        author:      this.editAuthor || 'anônimo',
      };
    }

    this.http.patch(`${this.apiUrl}/api/catalog/${entry._id}/status`, payload)
      .subscribe({
        next: (updated: any) => {
          this.selected.set(updated);
          this.editing.set(false);
          this.loadEntries();
          this.loadStats();
          this.cdr.markForCheck();
        },
      });
  }

  reanalyze(entry: CatalogEntry): void {
    const updated = { ...entry, aiPending: true, aiAnalysis: null };
    this.selected.set(updated as CatalogEntry);
    this.cdr.markForCheck();

    this.http.post(`${this.apiUrl}/api/catalog/${entry._id}/reanalyze`, {})
      .subscribe({
        next: () => {
          // Poll até a análise chegar (máx 30s)
          this.pollAnalysis(entry._id, 0);
        },
      });
  }

  private pollAnalysis(id: string, attempt: number): void {
    if (attempt > 10) return;
    setTimeout(() => {
      this.http.get<CatalogEntry>(`${this.apiUrl}/api/catalog/${id}`).subscribe({
        next: updated => {
          if (updated.aiPending) {
            this.pollAnalysis(id, attempt + 1);
          } else {
            this.selected.set(updated);
            this.loadEntries();
            this.cdr.markForCheck();
          }
        },
      });
    }, 3000);
  }

  prevPage(): void { if (this.page > 0) { this.page--; this.loadEntries(); } }
  nextPage(): void {
    if ((this.page + 1) * this.pageSize < this.total()) { this.page++; this.loadEntries(); }
  }

  severityColor(s?: string): string {
    return { critical: '#E24B4A', high: '#EF9F27', medium: '#185fa5', low: '#1D9E75' }[s || ''] || '#888780';
  }

  severityBg(s?: string): string {
    return { critical: '#FCEBEB', high: '#FAEEDA', medium: '#e6f1fb', low: '#E1F5EE' }[s || ''] || '#f6f5f0';
  }

  statusLabel(s: CatalogStatus): string {
    return { open: 'Aberto', investigating: 'Investigando', resolved: 'Resolvido' }[s];
  }

  statusColor(s: CatalogStatus): string {
    return { open: '#E24B4A', investigating: '#EF9F27', resolved: '#1D9E75' }[s];
  }

  trackById(_: number, e: CatalogEntry): string { return e._id; }
}
