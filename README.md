# 殷墟论文分类助手

面向学生的 Windows 单机版殷墟研究论文分类工具。它将 PDF 导入为独立本地项目，使用 Pi Agent 编排提取、分类与校验，并按社科院殷墟论文分类目录导出 Excel。

## 当前第一版能力

- 导入电子版或扫描版 PDF；
- 检测低文本页面，配置 OCR 后调用 PaddleOCR-VL-1.5（自动转 PNG）或 DeepSeek-OCR；
- 使用 Pi 支持的 Provider 与模型完成分类编排；
- 内置 4 个一级、16 个二级、72 个三级分类；
- 生成 26 个论文分类字段、主分类、互见分类、证据和置信度；
- 人工修改并保存复核结果；
- 导出 `论文分类结果`、`三级分类目录`、`处理说明`、`图像素材库` 四个工作表；
- 每篇论文在本机独立项目目录中保存输入、提取文本、Agent 会话和结果。

## 学生使用流程

1. 打开“设置”。
2. 输入 Pi Provider、模型 ID 与该 Provider 的 API Key。
3. 配置扫描件 OCR：默认服务地址为 `https://api.siliconflow.cn/v1`，默认模型为 `PaddlePaddle/PaddleOCR-VL-1.5`；该模型会在本机将待识别 PDF 页转换为 PNG 后调用。
4. 进入“导入论文”，选择一篇 PDF。
5. 进入“处理分类”，点击“开始 AI 分类”。
6. 在“复核导出”检查黄色或红色结果，保存人工修改。
7. 点击“导出 Excel”。

API Key 仅发送到 Electron Main Process，并通过当前 Windows 用户的系统安全存储保护；不会写入 Excel 或论文项目文件。

## 本地开发

开发机需要 Node.js。学生安装包不需要额外安装 Node.js、Python、Docker 或开发工具。

```bash
npm install
npm run dev
```

验证：

```bash
npm run test:run
npm run typecheck
npm run test:e2e
```

Windows 构建：

```bash
npm run package:win
```

该命令输出 NSIS 安装程序与 portable 可执行文件到 `release/`。

## 数据位置

Windows 中项目默认保存于：

```text
%LOCALAPPDATA%/YinxuPaperClassifier/
```

卸载应用不会自动删除论文项目。

## 当前限制

- 第一版是单人单机工具，不提供班级共享、教师后台或云同步；
- 图像素材库工作表目前作为空模板导出，不自动提取论文图片；
- Agent 保留 Pi 默认工具能力，首版不实现权限审批或沙箱；
- 扫描 PDF 的 OCR 依赖网络与学生自己的 OCR API Key；
- 论文上传到所选 Agent/OCR Provider 前，使用者应确认拥有相应授权。
