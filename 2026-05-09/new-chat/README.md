# 项目管理 Agent 本地化平台

当前版本已回退到添加“账户管理”子模块前的形态，只保留原始 3 个子模块：

- 周报助手
- ONES 迭代迁移
- 创建 ONES 工作项

## 选择的技术栈

- React + TypeScript：便于组件化和后续接入真实接口
- Vite：适合从空目录快速起项目
- Ant Design：后台管理场景成熟，表格、表单、弹窗都比较稳

## 当前目录结构

```text
src/
  agents/      agent 定义与模块注册
  modules/     业务子模块
  App.tsx      主框架和导航
  main.tsx     应用入口
.env.example
```

## 下一步建议

1. 完善周报助手的文件分析流程
2. 补充 ONES 迁移字段映射与预览能力
3. 补充工作项创建前的校验与确认流程

## 启动

当前环境未执行依赖安装；在可联网环境下运行：

```bash
npm install
npm run dev
```

## 接口配置

复制 `.env.example` 为 `.env`，按后端地址配置：

```bash
VITE_API_BASE_URL=http://localhost:8080/api
```
