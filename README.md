# qt4oh-studio

Qt for OpenHarmony 单元测试自动化执行与报告分析平台。该项目基于 Next.js（App Router）与 Electron 封装，提供 HAP 包管理、设备发现、批量测试执行、实时日志和测试报告分析的完整工作流，适用于开发者在 OpenHarmony 设备上运行和调试 Qt 单元测试。

## 主要功能

- HAP 包上传与解析：自动识别包内测试库并按架构/模块分类
- 设备管理：基于 HDC 自动发现设备，显示品牌、型号、系统版本、CPU 架构
- 批量测试执行：可按架构/模块/名称过滤下发测试，支持跳过已安装版本
- 实时监控：SSE 实时日志流、执行状态和进度显示
- 报告分析：会话汇总、函数级 XML 报告解析、崩溃日志采集与查看
- 桌面封装：Electron 打包支持 macOS DMG、Windows NSIS、Linux AppImage

## 技术栈概览

- 前端：Next.js（React，App Router）
- 桌面：Electron + electron-builder
- 运行时：Node.js（项目在打包后以内嵌 Node 启动 Next.js 服务）
- 设备通信：使用 HDC（Harmony Device Client）命令行
- 存储：本地 JSON 文件与文件系统（开发时位于 `data/`）
- 实时：Server-Sent Events（SSE）

## 快速上手

1) 前置条件

- Node.js 18+（开发）
- 已安装并可在终端中使用 `hdc`（HDC）
- OpenHarmony 设备已开启调试并通过 USB 连接

2) 安装依赖

```bash
npm install
```

3) 开发模式

- Web 开发（仅前端）：

```bash
npm run dev
```

访问 http://localhost:3000

- Electron 开发（在本机打开桌面窗口）：

```bash
npm run electron:dev
```

该命令会同时启动 Next.js 服务并打开 Electron 窗口。

4) 生产构建与启动（Web）

```bash
npm run build
npm run start
```

5) 打包桌面应用

- Windows: 在 `build/` 下准备 `node.exe`（项目配置要求），然后：

```bash
npm run electron:build
```

- macOS: 为不同架构准备 `build/node-${arch}` 与 `public/hdc/darwin-${arch}/hdc`，然后运行相同打包命令，生成 DMG 放在 `release/`。

- Linux: 准备 `build/node-x64` 与 `public/hdc/linux-x64/hdc`，运行打包命令生成 AppImage。

打包配置位于 `electron-builder.yml`，请根据目标平台准备相应的外部运行时文件（如 Node 二进制和 hdc 可执行文件）。

## 使用指南（典型流程）

1. 上传 HAP：在“测试执行”页上传 `.hap`，系统解析并列出可执行测试库（按架构/模块分类）。
2. 选择设备与过滤：从设备列表中选择目标设备，设定架构/模块/名称过滤、超时时间与是否跳过安装。 
3. 启动会话：点击开始，会话会在后台依次安装 HAP、启动每个测试库对应的 Ability 并执行。前端通过 SSE 接收并显示实时日志与状态。 
4. 查看报告：会话完成后在“报告分析”页查看汇总统计、XML 报告细节与崩溃日志。

## 常用命令摘要

 - `npm install` — 安装依赖
 - `npm run dev` — 启动 Next.js 开发服务器
 - `npm run electron:dev` — 启动 Electron 开发模式
 - `npm run build` — 生成生产构建（Web）
 - `npm run electron:build` — 打包桌面应用

## 项目结构（概要）

- `app/`：Next.js 页面与 API 路由（主 UI 与后端接口）
- `lib/`：核心业务逻辑（hdc 封装、HAP 解析、测试调度、XML 解析、持久化）
- `electron/`：Electron 主进程与预加载脚本
- `data/`：开发模式下的运行时数据（sessions、uploads、reports、logs）
- `build/`：打包时需要准备的二进制（非版本控制）

## 开发与调试提示

- 若无法识别设备，请确保 `hdc` 在终端可用并能列出设备（`hdc list`）。
- 打包时需将适当架构的 Node 二进制放入 `build/`，打包脚本会将其复制到安装包内的资源目录。参考 `electron-builder.yml` 中的 `extraResources` 配置。

## 许可

MIT

## 多语言支持（i18n）

项目已加入一个轻量级的客户端多语言支持实现（无额外依赖）。实现要点：

- 本地化 JSON 文件放在 `public/locales/{locale}.json`（示例已包含 `en.json` 与 `zh.json`）。
- 在 `app/i18n.tsx` 中提供了 `I18nProvider` 与 `useTranslation()` Hook。已在 `app/providers.tsx` 中挂载 `I18nProvider`。
- 使用示例：

```tsx
import { useTranslation } from "./i18n";

function MyComponent() {
	const { t, locale, setLocale, ready } = useTranslation();
	if (!ready) return null;
	return (
		<div>
			<h1>{t("site.welcome", "Welcome")}</h1>
			<button onClick={() => setLocale(locale === "zh" ? "en" : "zh")}>切换语言</button>
		</div>
	);
}
```

