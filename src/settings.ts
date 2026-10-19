"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import Card = formattingSettings.SimpleCard;
import Slice = formattingSettings.Slice;
import Model = formattingSettings.Model;

class PieCard extends Card {
    innerRadius = new formattingSettings.NumUpDown({ name: "innerRadius", displayName: "内半径 (%)", value: 0 });
    startAngle = new formattingSettings.NumUpDown({ name: "startAngle", displayName: "起始角度", value: -90 });
    strokeColor = new formattingSettings.ColorPicker({ name: "strokeColor", displayName: "分隔线颜色", value: { value: "#f5f5f5" } });
    strokeWidth = new formattingSettings.NumUpDown({ name: "strokeWidth", displayName: "分隔线宽度", value: 1.5 });
    jaggedOthers = new formattingSettings.ToggleSwitch({ name: "jaggedOthers", displayName: "Others 锯齿边缘", value: true });
    jaggedDepth = new formattingSettings.NumUpDown({ name: "jaggedDepth", displayName: "锯齿深度", value: 6 });
    name = "pie";
    displayName = "饼图";
    slices: Slice[] = [this.innerRadius, this.startAngle, this.strokeColor, this.strokeWidth, this.jaggedOthers, this.jaggedDepth];
}

class OthersCard extends Card {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "启用分组", value: true });
    mode = new formattingSettings.ItemDropdown({
        name: "mode", displayName: "分组方式",
        items: [{ displayName: "仅显示前 N 项", value: "topN" }, { displayName: "小于百分比", value: "percent" }],
        value: { displayName: "仅显示前 N 项", value: "topN" } as any
    });
    topN = new formattingSettings.NumUpDown({ name: "topN", displayName: "单独显示项数", value: 5 });
    percentThreshold = new formattingSettings.NumUpDown({ name: "percentThreshold", displayName: "百分比阈值", value: 3 });
    label = new formattingSettings.TextInput({ name: "label", displayName: "分组名称", value: "Others", placeholder: "Others" });
    color = new formattingSettings.ColorPicker({ name: "color", displayName: "分组颜色", value: { value: "#c9c9c9" } });
    name = "others";
    displayName = "Others 分组";
    slices: Slice[] = [this.show, this.mode, this.topN, this.percentThreshold, this.label, this.color];
}

class LabelsCard extends Card {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "显示", value: true });
    content = new formattingSettings.ItemDropdown({
        name: "content", displayName: "标签内容",
        items: [
            { displayName: "类别 + 百分比", value: "categoryPercent" },
            { displayName: "类别 + 数值", value: "categoryValue" },
            { displayName: "仅类别", value: "category" },
            { displayName: "仅百分比", value: "percent" }
        ],
        value: { displayName: "类别 + 百分比", value: "categoryPercent" } as any
    });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "字号", value: 12 });
    fontColor = new formattingSettings.ColorPicker({ name: "fontColor", displayName: "文字颜色", value: { value: "#303030" } });
    lineColor = new formattingSettings.ColorPicker({ name: "lineColor", displayName: "引导线颜色", value: { value: "#555555" } });
    lineWidth = new formattingSettings.NumUpDown({ name: "lineWidth", displayName: "引导线宽度", value: 1 });
    decimalPlaces = new formattingSettings.NumUpDown({ name: "decimalPlaces", displayName: "百分比小数位", value: 2 });
    name = "labels";
    displayName = "详细标签";
    slices: Slice[] = [this.show, this.content, this.fontSize, this.fontColor, this.lineColor, this.lineWidth, this.decimalPlaces];
}

class LegendCard extends Card {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "显示", value: true });
    position = new formattingSettings.ItemDropdown({
        name: "position", displayName: "位置",
        items: [{ displayName: "底部", value: "bottom" }, { displayName: "顶部", value: "top" }],
        value: { displayName: "底部", value: "bottom" } as any
    });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "字号", value: 12 });
    fontColor = new formattingSettings.ColorPicker({ name: "fontColor", displayName: "文字颜色", value: { value: "#333333" } });
    markerSize = new formattingSettings.NumUpDown({ name: "markerSize", displayName: "色块大小", value: 15 });
    name = "legend";
    displayName = "图例";
    slices: Slice[] = [this.show, this.position, this.fontSize, this.fontColor, this.markerSize];
}

class ColorsCard extends Card {
    palette = new formattingSettings.TextInput({
        name: "palette", displayName: "调色板（逗号分隔）",
        value: "#5d6a6a,#f58b66,#825273,#6f6061,#399bb8,#6f89a0,#c6a15b,#789b62,#a46958,#6677a8",
        placeholder: "#5d6a6a,#f58b66,..."
    });
    name = "colors";
    displayName = "数据颜色";
    slices: Slice[] = [this.palette];
}

class InteractionCard extends Card {
    drillOnClick = new formattingSettings.ToggleSwitch({ name: "drillOnClick", displayName: "单击下钻", value: true });
    crossFilter = new formattingSettings.ToggleSwitch({ name: "crossFilter", displayName: "同步交叉筛选", value: true });
    name = "interaction";
    displayName = "交互";
    slices: Slice[] = [this.drillOnClick, this.crossFilter];
}

class BackgroundCard extends Card {
    color = new formattingSettings.ColorPicker({ name: "color", displayName: "背景色", value: { value: "#ffffff" } });
    name = "background";
    displayName = "背景";
    slices: Slice[] = [this.color];
}

export class VisualFormattingSettingsModel extends Model {
    pieCard = new PieCard();
    othersCard = new OthersCard();
    labelsCard = new LabelsCard();
    legendCard = new LegendCard();
    colorsCard = new ColorsCard();
    interactionCard = new InteractionCard();
    backgroundCard = new BackgroundCard();
    cards = [this.pieCard, this.othersCard, this.labelsCard, this.legendCard, this.colorsCard, this.interactionCard, this.backgroundCard];
}
