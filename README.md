# qtoh-test

**Qt for OpenHarmony 单元测试自动化执行与报告分析平台**

基于 Next.js 构建的 Web 平台，用于在 OpenHarmony 设备上批量执行 Qt 单元测试并可视化分析结果。

---

## 功能特性

- 📦 **HAP 包管理** — 上传 Qt for OpenHarmony 测试包（`.hap`），自动解析测试库列表
- 📱 **设备管理** — 通过 HDC 自动发现并管理已连接的 OpenHarmony 设备
- ▶️ **测试执行** — 按架构/模块/名称过滤，批量下发并执行单元测试，实时日志流式输出
- 📊 **报告分析** — 测试结果统计、通过率图表、崩溃日志查看
- 🔄 **状态恢复** — 服务重启后自动将未完成会话标记为已停止

---

## 技术栈

- **Framework**: [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- **UI**: [HeroUI](https://heroui.com) + Tailwind CSS v4
- **Runtime**: Node.js，通过 `hdc` 命令行工具与设备通信
- **存储**: 本地 JSON 文件（`data/sessions.json`）

---

## 快速开始

### 前置条件

- Node.js 18+
- [HDC 工具](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/hdc-V5)已安装并加入 PATH
- OpenHarmony 设备已通过 USB 连接

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

### 生产构建

```bash
npm run build
npm run start
```

---

## 使用流程

1. **上传 HAP** — 在「测试执行」页上传 `.hap` 文件
2. **选择设备** — 从已连接设备中选择目标设备
3. **配置过滤** — 按架构（arm64/armeabi/x86_64）、模块或名称过滤测试
4. **启动测试** — 点击运行，实时查看日志输出
5. **查看报告** — 在「报告分析」页查看历史结果与崩溃日志

---

## 项目结构

```
app/
  (dashboard)/          # 主界面路由组（含 Sidebar 布局）
    page.tsx            # 仪表盘
    devices/            # 设备管理
    tests/              # 测试执行 & 实时日志
    reports/            # 报告列表 & 详情
  api/                  # API 路由
    devices/            # 设备列表
    hap/                # HAP 上传
    tests/              # 会话管理 & SSE 日志流
    reports/            # 报告查询 & 崩溃日志
components/
  Sidebar.tsx           # 侧边导航
lib/
  store.ts              # 会话持久化
  hap-parser.ts         # HAP 包解析
  hdc.ts                # HDC 设备通信
  test-runner.ts        # 测试调度执行
instrumentation.ts      # 服务启动钩子
```

---

## License

MIT
