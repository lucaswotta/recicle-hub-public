import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  ViewChild
} from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';

import { DataService } from '../../services/data.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

// #region External Libraries Declarations
declare var d3: any;
declare var lucide: any;
// #endregion

// #region D3 Locale Configuration
/**
 * Configuração de localização para o D3.js (Português - Brasil).
 * Define formatos de data, hora, dias da semana e meses.
 */
const d3LocalePt = d3.timeFormatLocale({
  dateTime: '%d/%m/%Y %H:%M:%S',
  date: '%d/%m/%Y',
  time: '%H:%M:%S',
  periods: ['AM', 'PM'],
  days: ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'],
  shortDays: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  months: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
  shortMonths: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
});
// #endregion

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  host: {
    '(window:resize)': 'onResize()' // Ouve redimensionamento da janela para ajustar gráficos
  }
})
export class HomeComponent implements OnInit, AfterViewInit {
  // #region View Children
  @ViewChild('barChart') private barChartContainer!: ElementRef;
  @ViewChild('lineChart') private lineChartContainer!: ElementRef;
  @ViewChild('pieChart') private pieChartContainer!: ElementRef;
  // #endregion

  // #region Injections
  private dataService = inject(DataService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  // #endregion

  // #region State Signals
  stats = this.dataService.dashboardStats;
  topClients = this.dataService.topClients;
  loading = this.dataService.dashboardDataLoading;
  recyclingData = this.dataService.recyclingData;
  registrationsData = this.dataService.registrationsData;
  materialsData = this.dataService.materialsData;

  balanceVisible = signal(false);
  // #endregion

  // #region Computed Signals
  isCurrentUserAdmin = computed(() => this.authService.currentUser()?.role === 'admin');
  isCurrentUserViewer = computed(() => this.authService.currentUser()?.role === 'viewer');
  // #endregion

  // #region Utils
  private resizeTimeout: any;
  private pieSlices: any = null;
  private pieArc: any = null;
  private pieArcHover: any = null;
  private legendItems: NodeListOf<Element> | null = null;
  // #endregion

  constructor() {
    // Efeito para desenhar gráficos quando os dados estiverem carregados
    effect(() => {
      if (!this.loading()) {
        // Pequeno atraso para garantir que o DOM esteja pronto
        setTimeout(() => {
          this.drawCharts();
          lucide.createIcons();
        }, 0);
      }
    });

    // Efeito para exibir erros de carregamento
    effect(() => {
      if (this.dataService.dashboardDataError()) {
        this.toastService.show('Falha ao conectar ao servidor. Verifique sua conexão.', 'error', 0);
      }
    });
  }

  // #region Lifecycle Hooks
  ngOnInit() {
    this.dataService.loadDashboardData();
  }

  ngAfterViewInit() {
    lucide.createIcons();
  }
  // #endregion

  // #region Event Handlers
  /**
   * Redesenha os gráficos ao redimensionar a janela (com debounce).
   */
  onResize() {
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      if (!this.loading()) {
        this.drawCharts();
      }
    }, 200);
  }
  // #endregion

  // #region UI Interaction Methods
  /**
   * Alterna a visibilidade do saldo.
   */
  toggleBalanceVisibility() {
    this.balanceVisible.update(v => !v);
  }

  /**
   * Highlights a specific pie chart slice when hovering over legend items.
   */
  highlightPieSlice(index: number, highlight: boolean): void {
    if (!this.pieSlices) return;

    const slice = d3.select(this.pieSlices.nodes()[index]);

    if (highlight) {
      slice
        .transition()
        .duration(150)
        .attr('d', this.pieArcHover as any);
    } else {
      slice
        .transition()
        .duration(150)
        .attr('d', this.pieArc as any);
    }
  }

  /**
   * Highlights a specific legend item when hovering over pie slices.
   */
  highlightLegendItem(index: number, highlight: boolean): void {
    if (!this.legendItems || index >= this.legendItems.length) return;

    const legendItem = this.legendItems[index] as HTMLElement;

    if (highlight) {
      legendItem.style.opacity = '0.7';
    } else {
      legendItem.style.opacity = '1';
    }
  }
  // #endregion

  // #region Formatters
  /**
   * Formata valores monetários para exibição compacta (mi, mil).
   */
  formatBalance(balance: number): string {
    if (balance >= 1_000_000) {
      const value = Math.floor((balance / 1_000_000) * 10) / 10;
      return `R$ ${value.toFixed(1).replace('.', ',')} mi`;
    }
    if (balance >= 10_000) {
      const value = Math.floor((balance / 1000) * 10) / 10;
      return `R$ ${value.toFixed(1).replace('.', ',')} mil`;
    }
    return new CurrencyPipe('pt').transform(balance, 'BRL', 'symbol', '1.2-2') || '';
  }

  /**
   * Formata peso em Kg sem casas decimais.
   */
  formatKg(kg: number): string {
    return `${kg.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kg`;
  }

  /**
   * Retorna a cor para um material baseado em seu nome/categoria.
   */
  getMaterialColor(index: number): string {
    const data = this.materialsData();
    if (!data || index >= data.length) return '#64748b'; // slate-500 fallback

    const category = data[index].category.toLowerCase();

    // Paleta oficial dos materiais
    const colorMap: { [key: string]: string } = {
      'papelão': '#EABA3A',
      'papel': '#C3E0E5',
      'plástico': '#026474',
      'pet': '#59981A',
      'alumínio': '#374243',
      'revista': '#D40941',
      'aerosol': '#D63697',
      'lata': '#92A4A3'
    };

    // Tenta encontrar uma cor correspondente
    for (const [key, color] of Object.entries(colorMap)) {
      if (category.includes(key)) {
        return color;
      }
    }

    // Fallback para variações de esmeralda
    const fallbackColors = ['#10b981', '#059669', '#047857', '#065f46'];
    return fallbackColors[index % fallbackColors.length];
  }
  // #endregion

  // #region Chart Creation Methods
  /**
   * Orquestra a criação de todos os gráficos.
   */
  private drawCharts(): void {
    if (this.barChartContainer?.nativeElement) this.createBarChart();
    if (this.lineChartContainer?.nativeElement) this.createLineChart();
    if (this.pieChartContainer?.nativeElement) this.createPieChart();
  }

  /**
   * Cria o Gráfico de Barras (Reciclagens por Mês).
   */
  private createBarChart(): void {
    const data = this.recyclingData();
    if (!data || data.length === 0) return;

    const element = this.barChartContainer.nativeElement;
    d3.select(element).select('svg').remove();
    d3.select(element).select('.d3-tooltip').remove();

    if (element.offsetWidth === 0 || element.offsetHeight === 0) return;

    const margin = { top: 20, right: 20, bottom: 30, left: 40 };
    const width = element.offsetWidth - margin.left - margin.right;
    const height = element.offsetHeight - margin.top - margin.bottom;

    const svg = d3.select(element).append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${element.offsetWidth} ${element.offsetHeight}`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Configuração do Tooltip
    const tooltip = this.createTooltip(element);

    // Escalas
    const x = d3.scaleBand().range([0, width]).padding(0.25);
    const y = d3.scaleLinear().range([height, 0]);

    x.domain(data.map((d: any) => d.month));
    y.domain([0, Math.max(10000, d3.max(data, (d: any) => d.value))]);

    // Eixo X
    const xAxisGroup = svg.append('g')
      .attr('class', 'axis axis--x')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x));

    // Ajuste de rótulos para telas pequenas
    if (width < 350) {
      xAxisGroup.selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-45)');
    }

    // Eixo Y
    svg.append('g')
      .attr('class', 'axis axis--y')
      .call(d3.axisLeft(y).ticks(5).tickFormat((d: number) => `${d / 1000}t`));

    // Cores (Monocromático Emerald)
    const originalFill = '#10b981';
    const hoverFill = '#059669';

    // Barras
    svg.selectAll('.bar')
      .data(data)
      .enter().append('rect')
      .attr('class', 'bar')
      .attr('x', (d: any) => x(d.month)!)
      .attr('width', x.bandwidth())
      .attr('y', (d: any) => y(d.value)!)
      .attr('height', (d: any) => height - y(d.value)!)
      .attr('fill', originalFill)
      .attr('rx', 4)
      .style('cursor', 'pointer')
      .on('mouseover', function (event: MouseEvent, d: any) {
        d3.select(this).attr('fill', hoverFill);
        tooltip.style('visibility', 'visible');
        tooltip.html(`
            <div class="font-bold text-slate-800">${d.month}</div>
            <div class="text-slate-600">${d.value.toLocaleString('pt-BR')} kg</div>
          `);
      })
      .on('mousemove', function (event: MouseEvent) {
        const [x, y] = d3.pointer(event, element);
        tooltip
          .style('top', (y + 5) + 'px')
          .style('left', (x + 5) + 'px');
      })
      .on('mouseout', function () {
        d3.select(this).attr('fill', originalFill);
        tooltip.style('visibility', 'hidden');
      });
  }

  /**
   * Cria o Gráfico de Linha (Cadastros por Mês).
   */
  private createLineChart(): void {
    const data = this.registrationsData();
    if (!data || data.length === 0) return;

    const element = this.lineChartContainer.nativeElement;
    d3.select(element).select('svg').remove();
    d3.select(element).select('.d3-tooltip').remove();

    if (element.offsetWidth === 0 || element.offsetHeight === 0) return;

    const margin = { top: 20, right: 20, bottom: 30, left: 50 };
    const width = element.offsetWidth - margin.left - margin.right;
    const height = element.offsetHeight - margin.top - margin.bottom;

    const svg = d3.select(element).append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${element.offsetWidth} ${element.offsetHeight}`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleTime().range([0, width]);
    const y = d3.scaleLinear().range([height, 0]);

    x.domain(d3.extent(data, (d: any) => d.date)!);
    y.domain([0, Math.max(10, d3.max(data, (d: any) => d.value)!)]);

    // Gradiente para a área sob a linha
    const gradient = svg.append("defs")
      .append("linearGradient")
      .attr("id", "area-gradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    gradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#10b981")
      .attr("stop-opacity", 0.3);

    gradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#10b981")
      .attr("stop-opacity", 0.05);

    const area = d3.area()
      .x((d: any) => x(d.date))
      .y0(height)
      .y1((d: any) => y(d.value))
      .curve(d3.curveMonotoneX);

    const line = d3.line()
      .x((d: any) => x(d.date))
      .y((d: any) => y(d.value))
      .curve(d3.curveMonotoneX);

    const xAxisTicks = width < 400 ? 4 : 6;

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(xAxisTicks).tickFormat(d3LocalePt.format("%b")));

    svg.append('g').call(d3.axisLeft(y).ticks(5));

    // Desenhar área
    svg.append('path')
      .datum(data)
      .attr('fill', 'url(#area-gradient)')
      .attr('d', area);

    // Desenhar linha
    svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 2.5)
      .attr('d', line);

    // Pontos de dados
    svg.selectAll('circle.data-point')
      .data(data)
      .enter()
      .append('circle')
      .attr('class', 'data-point')
      .attr('cx', (d: any) => x(d.date))
      .attr('cy', (d: any) => y(d.value))
      .attr('r', 4)
      .attr('fill', '#10b981')
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer');

    const tooltip = this.createTooltip(element);

    // Elementos de interação (overlay e focus)
    const focus = svg.append("g")
      .attr("class", "focus")
      .style("display", "none");

    focus.append("circle")
      .attr("r", 6)
      .style("fill", "#10b981")
      .style("stroke", "white")
      .style("stroke-width", "2px");

    svg.append("rect")
      .attr("class", "overlay")
      .attr("width", width)
      .attr("height", height)
      .style("fill", "none")
      .style("pointer-events", "all")
      .on("mouseover", () => {
        focus.style("display", null);
        tooltip.style("visibility", "visible");
      })
      .on("mouseout", () => {
        focus.style("display", "none");
        tooltip.style("visibility", "hidden");
      })
      .on("mousemove", (event: MouseEvent) => {
        const bisectDate = d3.bisector((d: any) => d.date).left;
        const x0 = x.invert(d3.pointer(event, svg.node())[0]);
        const i = bisectDate(data, x0, 1);
        const d0 = data[i - 1];
        const d1 = data[i];
        if (!d0 || !d1) return;
        const d = (x0.getTime() - d0.date.getTime() > d1.date.getTime() - x0.getTime()) ? d1 : d0;

        focus.attr("transform", `translate(${x(d.date)},${y(d.value)})`);

        const monthFormatter = d3LocalePt.format("%b");
        tooltip.html(`
              <div class="font-bold text-slate-800">${monthFormatter(d.date)}</div>
              <div class="text-slate-600">${d.value} cadastro${d.value !== 1 ? 's' : ''}</div>
          `);

        this.positionTooltip(tooltip, event, element);
      });
  }

  /**
   * Cria o Gráfico de Pizza (Distribuição de Materiais).
   */
  private createPieChart(): void {
    const data = this.materialsData();
    if (!data || data.length === 0) return;

    const element = this.pieChartContainer.nativeElement;
    d3.select(element).select('svg').remove();
    d3.select(element).select('.d3-tooltip').remove();

    if (element.offsetWidth === 0 || element.offsetHeight === 0) return;

    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const radius = Math.min(width, height) / 2.2;

    const svg = d3.select(element).append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    // Paleta de cores específica para materiais
    const component = this;
    const color = d3.scaleOrdinal()
      .domain(data.map((d: any) => d.category))
      .range(data.map((_: any, i: number) => component.getMaterialColor(i)));

    const pie = d3.pie().value((d: any) => d.value).sort(null);
    const data_ready = pie(data);

    const total = d3.sum(data, (d: any) => d.value);
    const tooltip = this.createTooltip(element);

    const arc = d3.arc().innerRadius(radius * 0.5).outerRadius(radius);
    const arcHover = d3.arc().innerRadius(radius * 0.5).outerRadius(radius * 1.05);

    // Armazena para interação com a legenda
    this.pieArc = arc;
    this.pieArcHover = arcHover;

    this.pieSlices = svg.selectAll('slices')
      .data(data_ready)
      .enter()
      .append('path')
      .attr('d', arc as any)
      .attr('fill', (d: any) => (color(d.data.category) as string))
      .attr('stroke', 'white')
      .style('stroke-width', '2px')
      .style('cursor', 'pointer')
      .on('mouseover', (event: MouseEvent, d: any) => {
        const index = data.findIndex((item: any) => item.category === d.data.category);

        d3.select(event.currentTarget as any)
          .transition()
          .duration(150)
          .attr('d', arcHover as any);

        // Destaca o item correspondente na legenda
        this.highlightLegendItem(index, true);

        tooltip.style('visibility', 'visible');
        const percentage = (total > 0 ? (d.data.value / total * 100) : 0).toFixed(1);
        tooltip.html(`
          <div class="font-bold text-slate-800">${d.data.category}</div>
          <div class="text-slate-600">${d.data.value.toLocaleString('pt-BR')} kg (${percentage}%)</div>
        `);
      })
      .on('mousemove', function (event: MouseEvent) {
        const [x, y] = d3.pointer(event, element);
        tooltip
          .style('top', (y + 5) + 'px')
          .style('left', (x + 5) + 'px');
      })
      .on('mouseout', (event: MouseEvent, d: any) => {
        const index = data.findIndex((item: any) => item.category === d.data.category);

        d3.select(event.currentTarget as any)
          .transition()
          .duration(150)
          .attr('d', arc as any);

        // Remove destaque do item na legenda
        this.highlightLegendItem(index, false);

        tooltip.style('visibility', 'hidden');
      });

    // Armazena referência aos itens da legenda após um pequeno delay para garantir que o DOM esteja pronto
    setTimeout(() => {
      this.legendItems = document.querySelectorAll('.materials-legend-item');
    }, 100);
  }

  /**
   * Helper para criar tooltips padronizados.
   */
  private createTooltip(element: any): any {
    return d3.select(element)
      .append('div')
      .attr('class', 'd3-tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('background', 'rgba(255, 255, 255, 0.95)')
      .style('border', '1px solid #e2e8f0')
      .style('border-radius', '0.5rem')
      .style('padding', '0.5rem 0.75rem')
      .style('box-shadow', '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)')
      .style('font-size', '13px')
      .style('pointer-events', 'none')
      .style('transition', 'opacity 0.2s');
  }

  /**
   * Helper para posicionar o tooltip e evitar que saia da tela.
   */
  private positionTooltip(tooltip: any, event: MouseEvent, element: any) {
    const tooltipNode = tooltip.node();
    if (!tooltipNode) return;

    const [posX, posY] = d3.pointer(event, element);
    const tooltipWidth = tooltipNode.offsetWidth;
    const containerWidth = element.offsetWidth;

    let left = posX + 5;
    if (left + tooltipWidth > containerWidth) {
      left = posX - tooltipWidth - 5;
    }
    if (left < 0) {
      left = posX + 5;
    }

    tooltip
      .style('top', (posY + 5) + 'px')
      .style('left', left + 'px');
  }
  // #endregion
}