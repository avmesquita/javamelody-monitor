import {
  Component, Input, OnChanges, OnDestroy,
  ElementRef, ViewChild, AfterViewInit, ChangeDetectionStrategy,
} from '@angular/core';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-heap-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="position:relative;width:100%;height:200px">
      <canvas #canvas role="img" aria-label="Gráfico de uso de heap ao longo do tempo"></canvas>
    </div>
  `,
})
export class HeapChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @Input({ required: true }) data: number[] = [];
  @Input() color = '#1D9E75';

  private chart?: Chart;

  ngAfterViewInit(): void { this.build(); }

  ngOnChanges(): void {
    if (this.chart) {
      this.chart.data.datasets[0].data = this.data;
      this.chart.data.datasets[0].borderColor = this.color;
      (this.chart.data.datasets[0] as any).backgroundColor = this.color + '22';
      this.chart.update('none');
    }
  }

  ngOnDestroy(): void { this.chart?.destroy(); }

  private build(): void {
    const labels = ['-55m','-50m','-45m','-40m','-35m','-30m','-25m','-20m','-15m','-10m','-5m','agora'];
    this.chart = new Chart(this.canvasRef.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Heap %',
          data: this.data,
          borderColor: this.color,
          backgroundColor: this.color + '22',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: this.color,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            min: 0, max: 100,
            ticks: { callback: (v) => v + '%', font: { size: 11 } },
            grid: { color: 'rgba(128,128,128,0.1)' },
          },
          x: {
            ticks: { font: { size: 10 } },
            grid: { display: false },
          },
        },
      },
    });
  }
}
