# qt4oh-studio

**Qt for OpenHarmony 单元测试自动化执行与报告分析平台**

基于 Next.js + Electron 构建的跨平台桌面应用，用于在 OpenHarmony 设备上批量执行 Qt 单元测试并可视化分析结果。

---

## 功能特性

- 📦 **HAP 包管理** — 上传 Qt for OpenHarmony 测试包（`.hap`），自动解析测试库列表（按架构/模块分类）
- 📱 **设备管理** — 通过 HDC 自动发现并管理已连接的 OpenHarmony 设备，展示品牌、型号、系统版本、CPU 架构等详情
- ▶️ **测试执行** — 按架构/模块/名称过滤，批量下发并执行单元测试，SSE 实时日志流式输出
- 📊 **报告分析** — 测试结果统计（总计/通过/超时/崩溃/失败）、分布图表、XML 测试报告详情、崩溃日志查看
- 🔄 **状态恢复** — 服务重启后自动将未完成会话标记为已停止
- 🖥️ **桌面应用** — 基于 Electron 封装，支持打包为 Windows 安装包（NSIS），内嵌 Next.js 服务，无需用户额外安装 Node.js

---

## 技术栈

| 类别 | 技术 |
|---|---|
| 前端框架 | [Next.js 16](https://nextjs.org)（App Router，Turbopack） |
| UI 组件库 | [HeroUI](https://heroui.com) + Tailwind CSS v4 |
| 桌面封装 | [Electron 40](https://electronjs.org) + electron-builder |
| 运行时 | Node.js，通过 `hdc` 命令行工具与 OpenHarmony 设备通信 |
| 数据存储 | 本地 JSON 文件 + 文件系统；打包后写入系统用户数据目录 |
| 实时推送 | Server-Sent Events（SSE）流式日志 |

---

## 快速开始

### 前置条件

- Node.js 18+
- [HDC 工具](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/hdc-V5)已安装并加入 `PATH`
- OpenHarmony 设备已通过 USB 连接并开启调试模式

### 安装依赖

```bash
npm install
```

### Web 开发模式

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

### Electron 开发模式

同时启动 Next.js 开发服务器与 Electron 窗口：

```bash
npm run electron:dev
```

### 生产构建（Web）

```bash
npm run build
npm run start
```

### 打包桌面应用（Windows）

1. 将 `node.exe` 复制到 `build/node.exe`（打包时内嵌，用于在无 Node.js 环境下启动 Next.js 服务）
2. 执行打包命令：

```bash
npm run electron:build
```

输出的安装包（`.exe`）位于 `release/` 目录，支持中文界面、自定义安装路径、创建桌面快捷方式。

---

## 使用流程

### 第一步：上传 HAP 测试包

在「测试执行」页拖拽或点击上传 `.hap` 文件，系统会自动解析包内的测试库列表，并按架构
（`arm64-v8a` / `armeabi-v7a` / `x86_64`）和模块（`qtbase` / `widgets` 等）分类展示。

HAP 包内的测试库结构示例：
```
app.hap (ZIP)
  └── libs/
      ├── arm64-v8a/tests/qtbase/char/libtst_qatomicinteger_char.so
      ├── arm64-v8a/tests/qtbase/collections/libtst_qlist.so
      ├── armeabi-v7a/tests/...
      └── x86_64/tests/...
```

### 第二步：配置测试参数

| 参数 | 说明 | 默认值 |
|---|---|---|
| 目标设备 | 从已连接设备中选择 | — |
| 架构过滤 | arm64-v8a / armeabi-v7a / x86_64 | 全部 |
| 模块过滤 | qtbase / widgets 等 | 全部 |
| 名称过滤 | 支持通配符匹配库名 | 全部 |
| 超时时间 | 单个测试库最长执行秒数（60~600） | 300 秒 |
| 包名 | 应用包名 | `com.qtsig.qtest` |
| Ability 名 | 入口 Ability | `EntryAbility` |
| 跳过安装 | 设备已安装同版本时可跳过 | 否 |

### 第三步：执行与监控

点击「开始测试」后：
- 后台依次安装 HAP、逐一启动各测试库对应的 Ability
- 前端通过 SSE 实时接收日志，显示每条测试库的执行状态
- 可点击「停止」随时终止会话

### 第四步：查看报告

测试完成后在「报告分析」页查看：
- 会话汇总统计（总计 / 通过 / 超时 / 崩溃 / 失败）
- 各测试项的详细状态和日志
- XML 格式的 Qt 测试报告（按函数级别展示结果）
- 自动采集的 HarmonyOS 崩溃日志（Faultlogger）

---

## 内部架构

```
Next.js (React UI + API Routes)
├── 前端页面 (app/(dashboard)/)
│   ├── DeviceContext        全局设备状态（跨页面共享）
│   ├── /                    仪表盘：总览统计 + 快速操作
│   ├── /devices             设备管理：5 秒轮询自动刷新
│   ├── /tests               测试执行：上传 HAP + 配置过滤
│   ├── /tests/[id]          实时监控：SSE 日志流 + 进度
│   ├── /reports             报告列表：汇总统计 + 崩溃日志
│   └── /reports/[id]        报告详情：XML 解析 + 筛选过滤
├── API 路由 (app/api/)
│   ├── /api/devices         GET 设备列表 + HDC 版本
│   ├── /api/devices/[id]    GET 设备详情（品牌/型号/架构）
│   ├── /api/hap             POST 上传解析 / GET 查询已上传
│   ├── /api/tests           GET 会话列表 / POST 创建会话 / DELETE 批量删除
│   ├── /api/tests/[id]      GET 会话详情 / DELETE 停止或删除
│   ├── /api/tests/[id]/stream  GET SSE 实时日志流
│   ├── /api/reports         GET 汇总统计（含崩溃文件列表）
│   ├── /api/reports/crash/[filename]  GET 崩溃日志原文
│   └── /api/reports/xml/[sessionId]/[...path]  GET XML 报告
└── 业务库 (lib/)
    ├── hdc.ts               HDC 设备交互（安装/启动/监控/崩溃/下载）
    ├── hap-parser.ts        HAP 包解析与测试库过滤
    ├── test-runner.ts       测试调度执行引擎 + SSE 日志广播
    ├── store.ts             会话持久化（JSON 文件读写）
    ├── xml-report.ts        Qt XML 测试报告解析
    ├── paths.ts             数据目录集中管理（兼容 Electron userData）
    └── utils.ts             通用工具函数

Electron (桌面封装)
├── electron/main.ts         主进程：启动 Next.js 子进程 + 创建 BrowserWindow
└── electron/preload.ts      预加载脚本：contextBridge 安全隔离

数据目录（开发模式：data/；打包后：系统用户数据目录）
├── sessions.json            会话列表（TestSession[]）
├── uploads/                 上传的 HAP 文件
├── Faultlogger/             从设备下载的崩溃日志
├── reports/                 XML 测试报告（按会话 ID 分目录）
└── logs/                    JSONL 格式的流式日志缓存
```

---

## API 参考

### 设备

| 方法 | 路由 | 说明 |
|---|---|---|
| GET | `/api/devices` | 获取设备列表及 HDC 版本信息 |
| GET | `/api/devices/[id]` | 获取单台设备详情（品牌、型号、系统版本、CPU 架构等） |

### HAP 文件

| 方法 | 路由 | 说明 |
|---|---|---|
| POST | `/api/hap` | 上传 HAP 文件并解析测试库（multipart/form-data） |
| GET | `/api/hap?file=xxx` | 查询已上传 HAP 的测试库信息 |

**响应示例**：
```json
{
  "testLibs": [
    { "arch": "arm64-v8a", "path": "libs/arm64-v8a/tests/qtbase/char/libtst_qchar.so", "name": "libtst_qchar.so", "module": "qtbase" }
  ],
  "modules": ["qtbase", "widgets"],
  "archs": ["arm64-v8a", "armeabi-v7a"]
}
```

### 测试会话

| 方法 | 路由 | 说明 |
|---|---|---|
| GET | `/api/tests` | 获取会话列表 |
| POST | `/api/tests` | 创建新会话并在后台异步开始执行 |
| GET | `/api/tests/[id]` | 获取会话详情（含测试结果列表） |
| DELETE | `/api/tests/[id]` | 停止运行中的会话 |
| DELETE | `/api/tests/[id]?action=delete` | 删除历史会话及其相关文件 |
| DELETE | `/api/tests` | 删除全部历史会话 |
| GET | `/api/tests/[id]/stream` | SSE 实时日志流（`Content-Type: text/event-stream`） |

**创建会话请求体**：
```json
{
  "hapFilePath": "uploads/entry-default-signed.hap",
  "deviceId": "XXXXXXXXXXXXX",
  "packageName": "com.qtsig.qtest",
  "abilityName": "EntryAbility",
  "filterArch": "arm64-v8a",
  "filterModule": "qtbase",
  "filterPattern": "libtst_q*",
  "timeout": 300,
  "skipInstall": false
}
```

**SSE 事件格式**：
```
// 日志行
data: {"type":"log","message":"[INFO] 正在安装 HAP...","time":"2026-03-02T04:00:00Z"}

// 状态更新（每 2 秒推送一次）
data: {"type":"status","session":{...}}

// 执行完成
data: {"type":"done","session":{...}}
```

### 报告

| 方法 | 路由 | 说明 |
|---|---|---|
| GET | `/api/reports` | 获取汇总统计（overview、会话列表、崩溃文件列表） |
| GET | `/api/reports/crash/[filename]` | 获取指定崩溃日志文件内容 |
| GET | `/api/reports/xml/[sessionId]/[...path]` | 获取 XML 报告（JSON 格式；追加 `?raw=1` 返回原始 XML） |

---

## 数据模型

```typescript
// 测试会话
interface TestSession {
  id: string
  deviceId: string
  hapFile: string                  // HAP 文件名
  status: "running" | "completed" | "stopped"
  startTime: string                // ISO 8601
  endTime?: string
  results: TestResult[]
  summary: {
    total: number
    success: number
    failed: number
    timeout: number
    crash: number
  }
}

// 单个测试库结果
interface TestResult {
  id: string
  name: string                     // e.g. "libtst_qchar.so"
  arch: string                     // e.g. "arm64-v8a"
  module: string                   // e.g. "qtbase"
  path: string                     // 库相对路径
  status: "pending" | "running" | "success" | "failed" | "timeout" | "crash"
  startTime?: string
  endTime?: string
  crashLogs?: string[]             // 崩溃文件名列表
  reportFile?: string              // XML 报告相对路径
}

// XML 报告解析结果
interface XmlReportResult {
  testCaseName: string
  qtVersion?: string
  totalDurationMs?: number
  passed: boolean
  functions: {
    name: string
    type: "pass" | "fail" | "xfail" | "skip" | "error"
    message?: string
    file?: string
    line?: number
    durationMs?: number
    dataTags?: string[]            // 数据驱动用例的 tag 列表
  }[]
}
```

---

## 项目结构

```
app/
  (dashboard)/
    page.tsx                   # 仪表盘（统计概览 + 近期会话）
    layout.tsx                 # 带 Sidebar 的主布局
    devices-context.tsx        # 全局设备状态 Context
    devices/page.tsx           # 设备管理（自动轮询 + 详情展开）
    tests/
      page.tsx                 # 测试执行（上传 HAP + 配置 + 历史会话）
      [id]/page.tsx            # 实时监控（SSE 日志 + 状态过滤）
    reports/
      page.tsx                 # 报告列表（统计图表 + 崩溃日志列表）
      [id]/page.tsx            # 报告详情（XML 解析 + 按状态/模块过滤）
  api/
    devices/route.ts           # 设备列表 API
    devices/[id]/route.ts      # 设备详情 API
    hap/route.ts               # HAP 上传解析 API
    tests/route.ts             # 会话列表/创建/批量删除 API
    tests/[id]/route.ts        # 会话详情/停止/删除 API
    tests/[id]/stream/route.ts # SSE 实时日志流
    reports/route.ts           # 汇总报告 API
    reports/crash/[filename]/route.ts   # 崩溃日志 API
    reports/xml/[sessionId]/[...path]/route.ts  # XML 报告 API
  globals.css                  # 全局样式
  layout.tsx                   # 根布局（HeroUIProvider）
  providers.tsx                # 客户端 Provider 封装
components/
  Sidebar.tsx                  # 侧边导航栏
electron/
  main.ts                      # Electron 主进程
  preload.ts                   # 预加载脚本
electron-dist/                 # Electron TS 编译输出（gitignore）
lib/
  hdc.ts                       # HDC 命令封装
  hap-parser.ts                # HAP 包解析
  test-runner.ts               # 测试执行引擎
  store.ts                     # 数据持久化
  xml-report.ts                # XML 报告解析
  paths.ts                     # 数据目录管理
  utils.ts                     # 通用工具
data/                          # 开发模式运行时数据（gitignore 运行时文件）
  sessions.json
  uploads/
  Faultlogger/
  reports/
  logs/
build/
  node.exe                     # 打包内嵌的 Node.js（需手动放置，不提交 git）
instrumentation.ts             # Next.js 服务启动钩子（重置异常会话）
electron-builder.yml           # 桌面打包配置
tsconfig.electron.json         # Electron TS 配置
```

---

## License

MIT
