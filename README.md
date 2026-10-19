# Drill Down Pie Pro

面向 Microsoft Power BI 的层级下钻饼图自定义视觉对象。支持逐层浏览分类数据、将长尾项目聚合为 Others，并提供图表外标签、分页图例和 Power BI 交互。

- **Power BI visual 版本：** `1.0.5.0`
- **Power BI visuals API：** `5.9.0`
- **项目许可证：** MIT（见 `package.json`）

## 功能

- 最多支持 8 个层级类别，单击扇区逐层下钻。
- 下钻时保留上一层级的灰阶父级分布；单击内圈返回上一级。
- 支持 Top N 或百分比阈值聚合长尾数据为 Others，并可分页查看被聚合项目。
- 图表外侧标签支持类别、百分比或数值组合，提供引导线和密集标签避让。
- 图例支持顶部/底部位置及分页浏览。
- 可配置饼图起始角度、内半径、分隔线、Others 外观、调色板和背景。
- 支持 Power BI 选择、高亮、交叉筛选与工具提示。

## 安装

1. 从 [GitHub Releases](https://github.com/muxiaoqi007/drill-down-pie-pro/releases) 下载最新的 `.pbiviz` 文件。
2. 在 Power BI Desktop 的“可视化”窗格中选择“导入视觉对象”，然后选择下载的文件。
3. 将分类字段按层级顺序拖入“层级类别”，将度量拖入“数值”；可选字段可放入“工具提示”。
4. 单击扇区下钻；下钻后单击内圈返回上一级。

> 更新版本时，建议先从“可视化”窗格删除旧版本，再导入新的 `.pbiviz`，避免 Power BI 缓存旧的字段角色定义。

## 数据与交互说明

- “层级类别”按放入顺序定义下钻路径，例如省份 → 城市 → 区县。
- “数值”决定扇区大小；“工具提示”可添加额外度量信息。
- “Others 分组”可按 Top N 或百分比阈值聚合数据。单击 Others 浏览下一批项目，单击 Previous 返回上一批。
- 在格式面板中可设置标签内容、字号、颜色和引导线，以及图例位置、调色板和饼图样式。
- 图表标题和副标题使用 Power BI“常规 → 标题/副标题”设置。

## 从源码构建

需要 Node.js 和 npm。安装依赖并打包：

```powershell
npm install
npm run package
```

生成的 `.pbiviz` 位于 `dist/` 目录。也可使用 `npm start` 启动本地开发服务。

## 项目结构

- `src/visual.ts`：视觉对象渲染、标签布局、下钻和交互逻辑。
- `src/settings.ts`：格式面板设置。
- `style/visual.less`：样式。
- `capabilities.json`：Power BI 数据角色和视觉对象能力声明。
- `pbiviz.json`：Power BI 视觉对象元数据。

## 许可证

本项目声明采用 MIT 许可证；发布包与源码的使用请遵循项目分发时附带的许可证条款。
