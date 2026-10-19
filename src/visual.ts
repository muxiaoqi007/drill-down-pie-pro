"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { VisualFormattingSettingsModel } from "./settings";
import "./../style/visual.less";

import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import DataView = powerbi.DataView;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = Math.PI * 2;

interface RawRow {
    categories: string[];
    value: number;
    highlight: number | null;
    selectionId: ISelectionId;
    tooltips: Array<{ name: string; value: unknown; format?: string }>;
}

interface PiePoint {
    name: string;
    value: number;
    highlight: number | null;
    rows: RawRow[];
    color: string;
    isOthers: boolean;
    isPrevious: boolean;
    startAngle: number;
    endAngle: number;
    percent: number;
}

interface LabelLayout {
    point: PiePoint;
    side: -1 | 1;
    midAngle: number;
    anchorX: number;
    anchorY: number;
    controlX: number;
    controlY: number;
    targetY: number;
    textX: number;
    textWidth: number;
}

interface ParsedData {
    rows: RawRow[];
    categoryColumns: DataViewCategoryColumn[];
    categoryNames: string[];
    measureName: string;
    measureFormat?: string;
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly selectionManager: ISelectionManager;
    private readonly formattingService = new FormattingSettingsService();
    private settings = new VisualFormattingSettingsModel();
    private readonly root: HTMLDivElement;
    private readonly svg: SVGSVGElement;
    private readonly tooltip: HTMLDivElement;
    private parsed: ParsedData | null = null;
    private baseParsed: ParsedData | null = null;
    private drillPath: string[] = [];
    private othersPage = 0;
    private legendPage = 0;
    private viewport = { width: 570, height: 433 };
    private currentPoints: PiePoint[] = [];
    private valueFormat = valueFormatter.create({ format: "#,0.##" });

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.selectionManager = this.host.createSelectionManager();
        this.root = document.createElement("div");
        this.root.className = "ddp-root";

        this.svg = document.createElementNS(SVG_NS, "svg");
        this.svg.classList.add("ddp-svg");
        this.svg.setAttribute("role", "img");
        this.svg.setAttribute("aria-label", "Drill Down Pie Pro");

        this.tooltip = document.createElement("div");
        this.tooltip.className = "ddp-tooltip";
        this.root.appendChild(this.svg);
        this.root.appendChild(this.tooltip);
        options.element.appendChild(this.root);

        this.svg.addEventListener("click", (event) => {
            if (event.target === this.svg) {
                void this.selectionManager.clear();
                this.render();
            }
        });
    }

    public update(options: VisualUpdateOptions): void {
        if (options.viewport) {
            this.viewport = {
                width: Math.max(1, options.viewport.width),
                height: Math.max(1, options.viewport.height)
            };
        }

        const dataView = options.dataViews?.[0];
        if (!dataView) {
            this.parsed = null;
            this.render();
            return;
        }

        this.settings = this.formattingService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
        const incoming = this.parseData(dataView);
        if (!incoming) {
            this.parsed = null;
            this.render();
            return;
        }
        const sameSchema = !!this.baseParsed
            && this.baseParsed.measureName === incoming.measureName
            && this.baseParsed.categoryNames.join("\u001f") === incoming.categoryNames.join("\u001f");
        if (!this.drillPath.length || !sameSchema || incoming.rows.length >= (this.baseParsed?.rows.length || 0)) {
            this.baseParsed = incoming;
        }
        // Power BI can echo only the selected branch after our own drill selection.
        // Keep the pre-drill snapshot so the parent context ring remains complete.
        this.parsed = this.drillPath.length && sameSchema && this.baseParsed ? this.baseParsed : incoming;
        const maxDepth = Math.max(0, (this.parsed?.categoryColumns.length ?? 1) - 1);
        if (this.drillPath.length > maxDepth) {
            this.drillPath = this.drillPath.slice(0, maxDepth);
            this.othersPage = 0;
        }
        this.valueFormat = valueFormatter.create({ format: this.parsed?.measureFormat || "#,0.##" });
        this.render();
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingService.buildFormattingModel(this.settings);
    }

    private parseData(dataView: DataView): ParsedData | null {
        const categorical = dataView.categorical;
        const categoryColumns = categorical?.categories || [];
        const valueColumns = categorical?.values;
        if (!categoryColumns.length || !valueColumns?.length) return null;

        const measure = valueColumns[0];
        const rowCount = categoryColumns[0].values.length;
        const rows: RawRow[] = [];
        for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
            const rawValue = Number(measure.values[rowIndex]);
            if (!Number.isFinite(rawValue) || rawValue <= 0) continue;
            let selectionBuilder = this.host.createSelectionIdBuilder();
            for (const column of categoryColumns) {
                selectionBuilder = selectionBuilder.withCategory(column, rowIndex);
            }
            const highlightValue = measure.highlights ? Number(measure.highlights[rowIndex]) : NaN;
            const tooltips: RawRow["tooltips"] = [];
            for (let valueIndex = 1; valueIndex < valueColumns.length; valueIndex++) {
                const column = valueColumns[valueIndex];
                tooltips.push({
                    name: column.source.displayName,
                    value: column.values[rowIndex],
                    format: column.source.format
                });
            }
            rows.push({
                categories: categoryColumns.map(column => String(column.values[rowIndex] ?? "(空白)")),
                value: rawValue,
                highlight: Number.isFinite(highlightValue) ? Math.max(0, highlightValue) : null,
                selectionId: selectionBuilder.createSelectionId(),
                tooltips
            });
        }

        return {
            rows,
            categoryColumns,
            categoryNames: categoryColumns.map(column => column.source.displayName),
            measureName: measure.source.displayName || "数值",
            measureFormat: measure.source.format
        };
    }

    private getCurrentRows(): RawRow[] {
        if (!this.parsed) return [];
        return this.parsed.rows.filter(row => this.drillPath.every((value, index) => row.categories[index] === value));
    }

    private buildPoints(): PiePoint[] {
        if (!this.parsed) return [];
        const level = this.drillPath.length;
        const rows = this.getCurrentRows();
        const groups = new Map<string, RawRow[]>();
        for (const row of rows) {
            const name = row.categories[level] ?? "(空白)";
            const existing = groups.get(name);
            if (existing) existing.push(row); else groups.set(name, [row]);
        }

        const palette = this.getPalette();
        let points: PiePoint[] = Array.from(groups.entries()).map(([name, groupRows]) => ({
            name,
            value: groupRows.reduce((sum, row) => sum + row.value, 0),
            highlight: groupRows.some(row => row.highlight !== null)
                ? groupRows.reduce((sum, row) => sum + (row.highlight || 0), 0)
                : null,
            rows: groupRows,
            color: palette[0],
            isOthers: false,
            isPrevious: false,
            startAngle: 0,
            endAngle: 0,
            percent: 0
        })).sort((a, b) => b.value - a.value);
        points.forEach((point, index) => { point.color = palette[index % palette.length]; });

        const total = points.reduce((sum, point) => sum + point.value, 0);
        if (this.settings.othersCard.show.value && points.length > 1) {
            const mode = String(this.settings.othersCard.mode.value?.value || "topN");
            let visible: PiePoint[] = [];
            let grouped: PiePoint[] = [];
            let previous: PiePoint[] = [];
            if (mode === "percent") {
                this.othersPage = 0;
                const threshold = this.clamp(Number(this.settings.othersCard.percentThreshold.value), 0, 100) / 100;
                visible = points.filter(point => point.value / total >= threshold);
                grouped = points.filter(point => point.value / total < threshold);
                if (!visible.length) {
                    visible = [points[0]];
                    grouped = points.slice(1);
                }
            } else {
                const topN = Math.max(1, Math.floor(Number(this.settings.othersCard.topN.value) || 5));
                const maxPage = Math.max(0, Math.ceil(points.length / topN) - 1);
                this.othersPage = this.clamp(this.othersPage, 0, maxPage);
                const pageStart = this.othersPage * topN;
                previous = points.slice(0, pageStart);
                visible = points.slice(pageStart, pageStart + topN);
                grouped = points.slice(pageStart + topN);
            }
            if (previous.length) {
                visible.unshift({
                    name: "Previous",
                    value: previous.reduce((sum, point) => sum + point.value, 0),
                    highlight: previous.some(point => point.highlight !== null)
                        ? previous.reduce((sum, point) => sum + (point.highlight || 0), 0)
                        : null,
                    rows: previous.flatMap(point => point.rows),
                    color: "#d0d0d0",
                    isOthers: false,
                    isPrevious: true,
                    startAngle: 0,
                    endAngle: 0,
                    percent: 0
                });
            }
            if (grouped.length) {
                visible.push({
                    name: String(this.settings.othersCard.label.value || "Others"),
                    value: grouped.reduce((sum, point) => sum + point.value, 0),
                    highlight: grouped.some(point => point.highlight !== null)
                        ? grouped.reduce((sum, point) => sum + (point.highlight || 0), 0)
                        : null,
                    rows: grouped.flatMap(point => point.rows),
                    color: this.settings.othersCard.color.value.value,
                    isOthers: true,
                    isPrevious: false,
                    startAngle: 0,
                    endAngle: 0,
                    percent: 0
                });
            }
            points = visible;
        }

        const angleOffset = this.toRadians(Number(this.settings.pieCard.startAngle.value) || -90);
        let cursor = angleOffset;
        for (const point of points) {
            point.percent = total > 0 ? point.value / total : 0;
            point.startAngle = cursor;
            point.endAngle = cursor + point.percent * TAU;
            cursor = point.endAngle;
        }
        return points;
    }

    private buildContextPoints(level: number): PiePoint[] {
        if (!this.parsed || level < 0) return [];
        const prefix = this.drillPath.slice(0, level);
        const rows = this.parsed.rows.filter(row => prefix.every((value, index) => row.categories[index] === value));
        const groups = new Map<string, RawRow[]>();
        for (const row of rows) {
            const name = row.categories[level] ?? "(空白)";
            const existing = groups.get(name);
            if (existing) existing.push(row); else groups.set(name, [row]);
        }
        const palette = this.getPalette();
        const points: PiePoint[] = Array.from(groups.entries()).map(([name, groupRows]) => ({
            name,
            value: groupRows.reduce((sum, row) => sum + row.value, 0),
            highlight: null,
            rows: groupRows,
            color: palette[0],
            isOthers: false,
            isPrevious: false,
            startAngle: 0,
            endAngle: 0,
            percent: 0
        })).sort((a, b) => b.value - a.value);
        const total = points.reduce((sum, point) => sum + point.value, 0);
        let cursor = this.toRadians(Number(this.settings.pieCard.startAngle.value) || -90);
        points.forEach((point, index) => {
            point.color = palette[index % palette.length];
            point.percent = total > 0 ? point.value / total : 0;
            point.startAngle = cursor;
            point.endAngle = cursor + point.percent * TAU;
            cursor = point.endAngle;
        });
        return points;
    }

    private render(): void {
        const width = this.viewport.width;
        const height = this.viewport.height;
        this.root.style.background = this.settings.backgroundCard.color.value.value;
        this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        this.svg.replaceChildren();
        this.tooltip.style.display = "none";
        this.currentPoints = [];

        if (!this.parsed || !this.parsed.rows.length) {
            this.renderEmpty(width, height);
            return;
        }

        const compact = width < 320 || height < 230;
        const legendVisible = this.settings.legendCard.show.value && !compact;
        const legendHeight = legendVisible ? Math.max(38, Number(this.settings.legendCard.markerSize.value) + 22) : 0;
        const legendTop = String(this.settings.legendCard.position.value?.value || "bottom") === "top";
        const chartTop = 5 + (legendVisible && legendTop ? legendHeight : 0);
        const chartBottom = height - 5 - (legendVisible && !legendTop ? legendHeight : 0);
        const chartHeight = Math.max(30, chartBottom - chartTop);
        const points = this.buildPoints();
        const labelsVisible = this.settings.labelsCard.show.value && !compact;
        const fontSize = this.clamp(Number(this.settings.labelsCard.fontSize.value), 8, 32);
        const content = String(this.settings.labelsCard.content.value?.value || "categoryPercent");
        const reserves = [-1, 1].map(side => labelsVisible ? Math.max(0, ...points
            .filter(point => (Math.cos((point.startAngle + point.endAngle) / 2) >= 0 ? 1 : -1) === side)
            .map(point => Math.min(this.measureText(this.labelText(point), fontSize), width * 0.22, 120))) : 0);
        const left = 8 + reserves[0] + (reserves[0] ? 24 : 0);
        const right = width - 8 - reserves[1] - (reserves[1] ? 24 : 0);
        const radius = Math.max(1, Math.min((right - left) / 2, chartHeight * 0.46));
        const cx = (left + right) / 2;
        const cy = chartTop + chartHeight * 0.5;
        const contextVisible = this.drillPath.length > 0;
        const configuredInnerRadius = radius * this.clamp(Number(this.settings.pieCard.innerRadius.value), 0, 85) / 100;
        const contextRadius = contextVisible ? Math.min(radius * 0.65, Math.max(22, radius * 0.29)) : 0;
        const innerRadius = contextVisible ? contextRadius : configuredInnerRadius;

        this.currentPoints = points;
        if (!points.length) {
            this.renderEmpty(width, height, "当前层级没有可显示的数据");
            return;
        }

        const hasHighlights = points.some(point => point.highlight !== null);
        if (contextVisible) this.renderParentContext(cx, cy, contextRadius);
        for (const point of points) {
            this.renderSlice(point, cx, cy, radius, innerRadius, hasHighlights);
        }
        if (labelsVisible) {
            this.renderLabels(points, cx, cy, radius, chartTop, chartBottom, width);
        }
        if (legendVisible) {
            const y = legendTop ? 7 : height - legendHeight + 8;
            this.renderLegend(points, width, y);
        }
    }

    private renderParentContext(cx: number, cy: number, radius: number): void {
        const points = this.buildContextPoints(this.drillPath.length - 1);
        const selectedName = this.drillPath[this.drillPath.length - 1];
        const group = document.createElementNS(SVG_NS, "g");
        group.classList.add("ddp-parent-context");
        group.setAttribute("role", "button");
        group.setAttribute("aria-label", "返回上一层级");
        for (const point of points) {
            const path = document.createElementNS(SVG_NS, "path");
            path.setAttribute("d", this.slicePath(point, cx, cy, radius, 0));
            path.setAttribute("fill", point.name === selectedName ? "#8f8f8f" : "#d8d8d8");
            path.setAttribute("fill-opacity", "1");
            path.setAttribute("stroke", "#ffffff");
            path.setAttribute("stroke-width", "1.2");
            path.addEventListener("pointerenter", () => {
                path.setAttribute("fill", point.name === selectedName ? "#747474" : "#bdbdbd");
            });
            path.addEventListener("pointermove", event => this.showParentTooltip(event, point));
            path.addEventListener("pointerleave", () => {
                path.setAttribute("fill", point.name === selectedName ? "#8f8f8f" : "#d8d8d8");
                this.tooltip.style.display = "none";
            });
            group.appendChild(path);
        }
        const hub = document.createElementNS(SVG_NS, "circle");
        hub.setAttribute("cx", String(cx));
        hub.setAttribute("cy", String(cy));
        hub.setAttribute("r", String(Math.max(3, radius * 0.11)));
        hub.setAttribute("fill", "#ffffff");
        group.appendChild(hub);
        group.addEventListener("click", event => {
            event.stopPropagation();
            this.drillPath.pop();
            this.othersPage = 0;
            this.legendPage = 0;
            void this.selectionManager.clear();
            this.render();
        });
        this.svg.appendChild(group);
    }

    private showParentTooltip(event: PointerEvent, point: PiePoint): void {
        const levelName = this.parsed?.categoryNames[Math.max(0, this.drillPath.length - 1)] || "上一级";
        this.tooltip.innerHTML = `<div style="font-weight:600;margin-bottom:6px">${this.escapeHtml(point.name)}</div>
            <div class="ddp-tooltip-row"><span class="ddp-tooltip-name">${this.escapeHtml(levelName)}</span><span class="ddp-tooltip-value">${this.formatPercent(point.percent)}</span></div>
            <div style="margin-top:7px;color:#666">点击内圈返回上一级</div>`;
        this.tooltip.style.display = "block";
        const rootRect = this.root.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const localX = event.clientX - rootRect.left;
        const localY = event.clientY - rootRect.top;
        this.tooltip.style.left = `${Math.max(4, Math.min(this.viewport.width - tooltipRect.width - 4, localX + 13))}px`;
        this.tooltip.style.top = `${Math.max(4, Math.min(this.viewport.height - tooltipRect.height - 4, localY + 13))}px`;
    }

    private renderSlice(point: PiePoint, cx: number, cy: number, radius: number, innerRadius: number, hasHighlights: boolean): void {
        const path = document.createElementNS(SVG_NS, "path");
        path.classList.add("ddp-slice");
        path.setAttribute("d", this.slicePath(point, cx, cy, radius, innerRadius));
        path.setAttribute("fill", point.color);
        path.setAttribute("stroke", this.settings.pieCard.strokeColor.value.value);
        path.setAttribute("stroke-width", String(this.clamp(Number(this.settings.pieCard.strokeWidth.value), 0, 8)));
        path.setAttribute("stroke-linejoin", "round");
        if (hasHighlights && (point.highlight === null || point.highlight <= 0)) path.setAttribute("opacity", "0.32");
        path.setAttribute("aria-label", `${point.name} ${this.formatPercent(point.percent)}`);
        path.addEventListener("pointermove", event => this.showTooltip(event, point));
        path.addEventListener("pointerleave", () => { this.tooltip.style.display = "none"; });
        path.addEventListener("click", event => {
            event.stopPropagation();
            void this.handlePointClick(point, event as MouseEvent);
        });
        this.svg.appendChild(path);
    }

    private slicePath(point: PiePoint, cx: number, cy: number, outerRadius: number, innerRadius: number): string {
        const fullCircle = point.endAngle - point.startAngle >= TAU - 1e-5;
        const jagged = point.isOthers && this.settings.pieCard.jaggedOthers.value;
        const depth = this.clamp(Number(this.settings.pieCard.jaggedDepth.value), 1, outerRadius * 0.2);
        const angularSpan = Math.max(0.001, point.endAngle - point.startAngle);
        const teeth = jagged ? Math.max(6, Math.round(angularSpan * outerRadius / 9)) : Math.max(2, Math.ceil(angularSpan / (Math.PI / 24)));
        const outerPoints: Array<[number, number]> = [];
        const steps = jagged ? teeth * 2 : teeth;
        for (let index = 0; index <= steps; index++) {
            const angle = point.startAngle + angularSpan * index / steps;
            const r = jagged && index > 0 && index < steps && index % 2 === 1 ? outerRadius - depth : outerRadius;
            outerPoints.push(this.polar(cx, cy, r, angle));
        }

        if (fullCircle && innerRadius <= 0) {
            return `M ${outerPoints.map(pointValue => `${pointValue[0]} ${pointValue[1]}`).join(" L ")} Z`;
        }

        let d: string;
        if (innerRadius > 0) {
            const innerEnd = this.polar(cx, cy, innerRadius, point.endAngle);
            d = `M ${outerPoints[0][0]} ${outerPoints[0][1]} L ${outerPoints.slice(1).map(p => `${p[0]} ${p[1]}`).join(" L ")} L ${innerEnd[0]} ${innerEnd[1]}`;
            const innerSteps = Math.max(2, Math.ceil(angularSpan / (Math.PI / 24)));
            for (let index = 1; index <= innerSteps; index++) {
                const angle = point.endAngle - angularSpan * index / innerSteps;
                const p = this.polar(cx, cy, innerRadius, angle);
                d += ` L ${p[0]} ${p[1]}`;
            }
            return `${d} Z`;
        }
        d = `M ${cx} ${cy} L ${outerPoints.map(p => `${p[0]} ${p[1]}`).join(" L ")} Z`;
        return d;
    }

    private renderLabels(points: PiePoint[], cx: number, cy: number, radius: number, top: number, bottom: number, width: number): void {
        const fontSize = this.clamp(Number(this.settings.labelsCard.fontSize.value), 8, 32);
        const lineHeight = fontSize * 1.2;
        const content = String(this.settings.labelsCard.content.value?.value || "categoryPercent");
        const layouts = points.map(point => {
            const midAngle = (point.startAngle + point.endAngle) / 2;
            const side: -1 | 1 = Math.cos(midAngle) >= 0 ? 1 : -1;
            const anchor = this.polar(cx, cy, radius + 1, midAngle);
            const control = this.polar(cx, cy, radius + 9, midAngle);
            // Never move a long label inward over the pie to make it fit.
            const textX = cx + side * (radius + 8);
            const available = Math.max(0, side > 0 ? width - 8 - textX : textX - 8);
            const full = this.labelText(point);
            const value = content === "categoryValue" ? this.valueFormat.format(point.value) : this.formatPercent(point.percent);
            const lines = this.measureText(full, fontSize) <= available || content === "category" || content === "percent"
                ? [this.fitLabelText(full, available, fontSize)]
                : [this.fitLabelText(point.name, available, fontSize), this.fitLabelText(value, available, fontSize)];
            return {
                point, side, midAngle, anchorX: anchor[0], anchorY: anchor[1],
                controlX: control[0], controlY: control[1], targetY: control[1],
                textX, textWidth: available, lines, height: lines.length * lineHeight
            };
        });
        const visible: typeof layouts = [];
        for (const side of [-1, 1] as const) {
            const candidates = layouts.filter(item => item.side === side && item.lines.every(Boolean));
            const gap = 6;
            const minY = top + 2;
            const maxY = bottom - 2;
            // When the viewport cannot fit every label, omit smaller slices rather than overlap text.
            const ranked = candidates.slice().sort((a, b) => Number(b.point.isOthers || b.point.isPrevious) - Number(a.point.isOthers || a.point.isPrevious) || b.point.percent - a.point.percent);
            const selected: typeof layouts = [];
            let used = 0;
            for (const item of ranked) {
                const needed = item.height + (selected.length ? gap : 0);
                if (used + needed <= maxY - minY) { selected.push(item); used += needed; }
            }
            selected.sort((a, b) => a.anchorY - b.anchorY);
            for (let index = 0; index < selected.length; index++) {
                const item = selected[index];
                const previous = selected[index - 1];
                item.targetY = Math.max(this.clamp(item.targetY, minY + item.height / 2, maxY - item.height / 2),
                    previous ? previous.targetY + previous.height / 2 + gap + item.height / 2 : minY + item.height / 2);
            }
            for (let index = selected.length - 1; index >= 0; index--) {
                const item = selected[index];
                const next = selected[index + 1];
                item.targetY = Math.min(item.targetY, next ? next.targetY - next.height / 2 - gap - item.height / 2 : maxY - item.height / 2);
            }
            visible.push(...selected);
        }
        for (const layout of visible) {
            const lineEndX = layout.textX - layout.side * 5;
            const elbowX = cx + layout.side * (radius + 14);
            const bend = Math.max(12, Math.abs(layout.targetY - layout.anchorY) * 0.28);
            const connector = document.createElementNS(SVG_NS, "path");
            connector.classList.add("ddp-label-connector");
            connector.setAttribute("d", `M ${layout.anchorX} ${layout.anchorY} C ${layout.controlX} ${layout.controlY}, ${elbowX - layout.side * bend} ${layout.targetY}, ${elbowX} ${layout.targetY} L ${lineEndX} ${layout.targetY}`);
            connector.setAttribute("fill", "none");
            connector.setAttribute("stroke", this.settings.labelsCard.lineColor.value.value);
            connector.setAttribute("stroke-width", String(this.clamp(Number(this.settings.labelsCard.lineWidth.value), 0.5, 5)));
            connector.setAttribute("pointer-events", "none");
            this.svg.appendChild(connector);
            const text = this.addText(layout.textX, layout.targetY - layout.height / 2 + lineHeight / 2, "", "ddp-label", {
                fill: this.settings.labelsCard.fontColor.value.value, "font-size": fontSize,
                "dominant-baseline": "central", "text-anchor": layout.side > 0 ? "start" : "end"
            });
            const title = document.createElementNS(SVG_NS, "title");
            title.textContent = this.labelText(layout.point);
            text.appendChild(title);
            layout.lines.forEach((line, index) => {
                const span = document.createElementNS(SVG_NS, "tspan");
                span.setAttribute("x", String(layout.textX));
                span.setAttribute("dy", String(index ? lineHeight : 0));
                span.textContent = line;
                text.appendChild(span);
            });
        }
    }

    private fitLabelText(text: string, available: number, fontSize: number): string {
        if (this.measureText(text, fontSize) <= available) return text;
        if (this.measureText("…", fontSize) > available) return "";
        const chars = Array.from(text);
        let low = 0;
        let high = chars.length;
        while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            if (this.measureText(`${chars.slice(0, mid).join("")}…`, fontSize) <= available) low = mid;
            else high = mid - 1;
        }
        return `${chars.slice(0, low).join("")}…`;
    }

    private renderLegend(points: PiePoint[], width: number, y: number): void {
        const fontSize = this.clamp(Number(this.settings.legendCard.fontSize.value), 8, 28);
        const marker = this.clamp(Number(this.settings.legendCard.markerSize.value), 6, 30);
        const arrowSpace = 42;
        const available = Math.max(20, width - arrowSpace * 2);
        const itemWidths = points.map(point => marker + 6 + this.measureText(this.labelText(point), fontSize) + 18);
        const pages: number[][] = [];
        let page: number[] = [];
        let used = 0;
        itemWidths.forEach((itemWidth, index) => {
            if (page.length && used + itemWidth > available) {
                pages.push(page);
                page = [];
                used = 0;
            }
            page.push(index);
            used += Math.min(itemWidth, available);
        });
        if (page.length) pages.push(page);
        this.legendPage = this.clamp(this.legendPage, 0, Math.max(0, pages.length - 1));

        this.renderLegendArrow(28, y + marker / 2, -1, this.legendPage > 0, () => {
            this.legendPage--;
            this.render();
        });
        this.renderLegendArrow(width - 28, y + marker / 2, 1, this.legendPage < pages.length - 1, () => {
            this.legendPage++;
            this.render();
        });

        let x = arrowSpace;
        for (const index of pages[this.legendPage] || []) {
            const point = points[index];
            const rect = document.createElementNS(SVG_NS, "rect");
            rect.setAttribute("x", String(x));
            rect.setAttribute("y", String(y));
            rect.setAttribute("width", String(marker));
            rect.setAttribute("height", String(marker));
            rect.setAttribute("fill", point.color);
            this.svg.appendChild(rect);
            x += marker + 6;
            const maxWidth = Math.min(itemWidths[index] - marker - 14, width - arrowSpace - x);
            const maxChars = Math.max(3, Math.floor(maxWidth / (fontSize * 0.58)));
            this.addText(x, y + marker * 0.76, this.truncate(this.labelText(point), maxChars), "ddp-legend-text", {
                fill: this.settings.legendCard.fontColor.value.value,
                "font-size": fontSize
            });
            x += Math.min(this.measureText(this.labelText(point), fontSize) + 18, available);
        }
    }

    private renderLegendArrow(x: number, y: number, direction: -1 | 1, enabled: boolean, action: () => void): void {
        const path = document.createElementNS(SVG_NS, "path");
        const d = direction < 0
            ? `M ${x + 3} ${y - 7} L ${x - 2} ${y} L ${x + 3} ${y + 7}`
            : `M ${x - 3} ${y - 7} L ${x + 2} ${y} L ${x - 3} ${y + 7}`;
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#9c9c9c");
        path.setAttribute("stroke-width", "1.3");
        path.classList.add("ddp-legend-arrow");
        if (!enabled) path.classList.add("disabled");
        if (enabled) path.addEventListener("click", event => { event.stopPropagation(); action(); });
        this.svg.appendChild(path);
    }

    private async handlePointClick(point: PiePoint, event: MouseEvent): Promise<void> {
        if (point.isOthers) {
            this.othersPage++;
            this.legendPage = 0;
            this.render();
            return;
        }
        if (point.isPrevious) {
            this.othersPage = Math.max(0, this.othersPage - 1);
            this.legendPage = 0;
            this.render();
            return;
        }
        const hasNextLevel = !!this.parsed && this.drillPath.length < this.parsed.categoryColumns.length - 1;
        if (hasNextLevel && this.settings.interactionCard.drillOnClick.value) {
            this.drillPath.push(point.name);
            this.othersPage = 0;
            this.legendPage = 0;
            if (this.settings.interactionCard.crossFilter.value) {
                await this.selectionManager.select(point.rows.map(row => row.selectionId), false);
            }
            this.render();
            return;
        }
        if (this.settings.interactionCard.crossFilter.value) {
            await this.selectionManager.select(point.rows.map(row => row.selectionId), event.ctrlKey || event.metaKey);
            this.render();
        }
    }

    private showTooltip(event: PointerEvent, point: PiePoint): void {
        const members = point.isOthers || point.isPrevious
            ? `<div class="ddp-tooltip-row"><span class="ddp-tooltip-name">包含</span><span class="ddp-tooltip-value">${new Set(point.rows.map(row => row.categories[this.drillPath.length])).size} 项</span></div>`
            : "";
        const extraTotals = new Map<string, { total: number; sample: unknown; format?: string }>();
        for (const row of point.rows) {
            for (const extra of row.tooltips) {
                const existing = extraTotals.get(extra.name) || { total: 0, sample: extra.value, format: extra.format };
                const numeric = Number(extra.value);
                if (Number.isFinite(numeric)) existing.total += numeric;
                extraTotals.set(extra.name, existing);
            }
        }
        const extras = Array.from(extraTotals.entries()).map(([name, aggregate]) => {
            const formatted = Number.isFinite(Number(aggregate.sample))
                ? valueFormatter.create({ format: aggregate.format || "#,0.##" }).format(aggregate.total)
                : String(aggregate.sample ?? "");
            return `<div class="ddp-tooltip-row"><span class="ddp-tooltip-name">${this.escapeHtml(name)}</span><span class="ddp-tooltip-value">${this.escapeHtml(formatted)}</span></div>`;
        }).join("");
        this.tooltip.innerHTML = `<div style="font-weight:600;margin-bottom:6px">${this.escapeHtml(point.name)}</div>
            <div class="ddp-tooltip-row"><span class="ddp-tooltip-name">${this.escapeHtml(this.parsed?.measureName || "数值")}</span><span class="ddp-tooltip-value">${this.escapeHtml(this.valueFormat.format(point.value))}</span></div>
            <div class="ddp-tooltip-row"><span class="ddp-tooltip-name">占比</span><span class="ddp-tooltip-value">${this.formatPercent(point.percent)}</span></div>${members}${extras}`;
        this.tooltip.style.display = "block";
        const rootRect = this.root.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const localX = event.clientX - rootRect.left;
        const localY = event.clientY - rootRect.top;
        this.tooltip.style.left = `${Math.max(4, Math.min(this.viewport.width - tooltipRect.width - 4, localX + 13))}px`;
        this.tooltip.style.top = `${Math.max(4, Math.min(this.viewport.height - tooltipRect.height - 4, localY + 13))}px`;
    }

    private renderEmpty(width: number, height: number, message = "请将层级类别和数值字段拖入视觉对象"): void {
        this.addText(width / 2, height / 2, message, "ddp-empty", {
            fill: "#777777", "font-size": 13, "text-anchor": "middle"
        });
    }

    private labelText(point: PiePoint): string {
        const content = String(this.settings.labelsCard.content.value?.value || "categoryPercent");
        if (content === "category") return point.name;
        if (content === "percent") return this.formatPercent(point.percent);
        if (content === "categoryValue") return `${point.name} ${this.valueFormat.format(point.value)}`;
        return `${point.name} ${this.formatPercent(point.percent)}`;
    }

    private formatPercent(value: number): string {
        const decimals = Math.floor(this.clamp(Number(this.settings.labelsCard.decimalPlaces.value), 0, 6));
        return `${(value * 100).toFixed(decimals)}%`;
    }

    private getPalette(): string[] {
        const raw = String(this.settings.colorsCard.palette.value || "");
        const colors = raw.split(/[,;\s]+/).map(color => color.trim()).filter(color => /^#[0-9a-f]{3,8}$/i.test(color));
        return colors.length ? colors : ["#5d6a6a", "#f58b66", "#825273", "#6f6061", "#399bb8"];
    }

    private addText(x: number, y: number, value: string, className: string, attrs: Record<string, string | number>): SVGTextElement {
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("x", String(x));
        text.setAttribute("y", String(y));
        text.classList.add(className);
        text.textContent = value;
        Object.entries(attrs).forEach(([name, attrValue]) => text.setAttribute(name, String(attrValue)));
        this.svg.appendChild(text);
        return text;
    }

    private polar(cx: number, cy: number, radius: number, angle: number): [number, number] {
        return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
    }

    private measureText(text: string, fontSize: number): number {
        return Array.from(text).reduce((width, char) => width + (/^[\x00-\xff]$/.test(char) ? fontSize * 0.56 : fontSize), 0);
    }

    private truncate(text: string, maxChars: number): string {
        const chars = Array.from(text);
        if (chars.length <= maxChars) return text;
        return `${chars.slice(0, Math.max(1, maxChars - 1)).join("")}…`;
    }

    private escapeHtml(value: string): string {
        return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] || char));
    }

    private toRadians(degrees: number): number {
        return degrees * Math.PI / 180;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
    }
}
