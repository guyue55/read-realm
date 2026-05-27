# 开发者贡献指南 (Contributing Guide)

感谢你对 **我的阅读世界 (novel-reader-platform)** 的关注和支持！🎉 本项目是一个致力于打造极致体验的“个人小说聚合阅读平台”的高性能 Monorepo。

为了保持代码库的健康、可读性以及高效的协作，请在开始开发前仔细阅读本指南。

---

## 1. 快速上手

### 1.1 环境准备

在开始之前，请确保你的开发环境满足以下要求：

- **操作系统**：macOS, Linux 或 Windows (WSL2 推荐)
- **Node.js**：`>= 20.0.0` (推荐 LTS 版本)
- **包管理器**：`pnpm >= 9.0.0` (项目**强制**使用 pnpm，请勿使用 npm 或 yarn)

### 1.2 本地运行

1. **克隆项目**：

   ```bash
   git clone https://github.com/guyue/novel-reader-platform.git
   cd novel-reader-platform
   ```

2. **安装依赖**：

   ```bash
   pnpm install
   ```

3. **启动开发环境**：
   运行根目录下的开发脚本，会通过 Turborepo 并行启动各子应用并提供流式日志：

   ```bash
   pnpm dev
   ```

4. **打包构建**：
   在提交代码前建议进行本地构建验证：
   ```bash
   pnpm build
   ```

---

## 2. 架构说明

本项目采用基于 **Turborepo** 驱动的 **pnpm Workspace Monorepo** 架构，各核心模块职责划分明确。

```text
├── apps/                  # 应用层
│   ├── web-pwa/           # 客户端（Next.js App Router + Dexie + OPFS + PWA）
│   ├── api/               # 服务端（NestJS + SQLite + Drizzle ORM）
│   ├── desktop-tauri/     # 桌面端（Tauri）
│   ├── mobile-capacitor/  # 移动端（Capacitor）
│   ├── miniapp-lite/      # 小程序轻量版
│   └── worker/            # 辅助离线任务处理/后台脚本
│
└── packages/              # 核心业务与基础设施包（共享依赖）
    ├── reader-core/       # 核心阅读渲染引擎
    ├── parser-core/       # 文本及 EPUB/TXT 解析核心包
    ├── storage-core/      # 离线与持久化底层（OPFS & IndexedDB）
    ├── rules-engine/      # 书源与智能净化规则引擎
    ├── shared-types/      # 全局类型定义
    └── eslint-config/     # 统一 Lint 规范
```

- **开发新模块**：若需要开发新的公共逻辑，请在 `packages/` 下建立包，并在其 `package.json` 中定义好 exports 路径，再通过 `pnpm add <package-name> --workspace --filter <target-app>` 引用。

---

## 3. 代码规范

### 3.1 格式化与 Lint

我们使用 **Prettier** 进行代码格式化，使用 **ESLint** 保证代码质量。

- **保存自动修复**：强烈推荐使用 VS Code 并在本地启用推荐的插件。项目已配置了保存自动格式化及自动优化 Import 顺序。
- **手动运行校验**：
  ```bash
  # 代码格式化
  pnpm format
  # 代码静态质量检测
  pnpm lint
  ```

### 3.2 Git 提交规范 (Git Commits)

项目严格遵守 **[Conventional Commits](https://www.conventionalcommits.org/)** 规范。不符合规范的提交将无法通过自动化门禁。

提交格式：`<type>(<scope>): <subject>`

**常见 `<type>` 标识**：

- `feat`：新增功能（如 `feat(parser-core): 新增 EPUB 目录智能拆分算法`）
- `fix`：修复 Bug（如 `fix(web-pwa): 修复 IndexedDB 大文件读取内存溢出问题`）
- `docs`：仅文档修改（如 `docs: 完善项目架构说明文档`）
- `style`：不影响代码含义的修改（空格、格式化、缺少分号等）
- `refactor`：重构（既不修复 bug 也不添加新功能的代码更改）
- `perf`：性能优化
- `test`：增加测试或更新已有测试
- `chore`：构建过程或辅助工具、依赖的变动

---

## 4. 提交 Pull Request 流程

1. **拉取最新代码**：确保你的分支是基于主仓库最新代码切出的。
   ```bash
   git checkout main
   git pull origin main
   ```
2. **切出开发分支**：分支命名建议使用 `feat/` 或 `fix/` 前缀。
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **本地验证**：在提交之前，请确保以下命令在本地通过：
   ```bash
   pnpm lint
   pnpm build
   pnpm test
   ```
4. **推送分支并提单**：推送代码后，在 GitHub 上提 Pull Request。请务必使用我们提供的 **PR 模板** 完整填写变更说明并关联相关 Issue。
5. **Code Review**：核心维护者会对你的 PR 进行代码审查。通常需要获得至少一位维护者的 Approval 并且通过 CI 自动化构建流后，代码方能合并到主干分支。

再次感谢你的贡献！构建更美好的“阅读世界”，离不开每一位开发者的参与。☕️
