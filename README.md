# 项目管理 Agent 本地化平台

这是一个本地化 MVP，把 3 个项目管理自动化能力组织成一个大项目下的 3 个子项目：

- 周报助手：选择本地 PPT/PDF，按开始日期和截止日期筛选包含“议题”的页面，生成老板版周报草稿，并输出 Word 文件。
- 创建 ONES 工作项清单：从固定目录选择需求表，填写 ONES 目标迭代，按自动化规则生成批量导入 CSV 和确认规则。
- ONES 工作项迁移：输入 ONES 链接、当前迭代、目标迭代和筛选规则，输出建议移动清单。

## 本地运行

```bash
npm start
```

如果本机没有安装 `npm`，也可以直接运行：

```bash
node apps/api/server.js
```

桌面/本地快捷脚本 `start-local.command` 会以自动监控模式启动。之后修改页面、后端脚本或 Word 模板时，服务会自动重启，刷新浏览器页面即可看到更新。

打开：

```text
http://localhost:4173
```

默认登录账号：

```text
账号：wangpeng5
密码：pm-agent-2026
```

登录页支持 macOS Touch ID：

1. 首次使用时，输入账号和密码，点击 `绑定 Touch ID`。
2. 浏览器弹出 Touch ID/本机验证后完成绑定。
3. 之后进入登录页会自动唤起 Touch ID；验证成功后直接进入系统。
4. 如果浏览器没有自动弹出验证，可点击 `使用 Touch ID 登录` 作为备用入口。

Touch ID 需要使用支持 WebAuthn 的浏览器，例如 Safari 或 Chrome，并建议保持访问地址一致，例如始终使用 `http://localhost:4173`。不要用 `http://127.0.0.1:4173` 绑定 Touch ID，因为浏览器不会把 IP 地址当作有效的 Touch ID 域名。

如需修改账号密码，可在启动前设置环境变量：

```bash
PM_AGENT_USER=你的账号 PM_AGENT_PASSWORD=你的密码 node apps/api/server.js
```

如需修改“创建 ONES 工作项清单”读取表格的固定目录，可设置：

```bash
PM_AGENT_MATERIALS_DIR=/你的/表格目录 node apps/api/server.js
```

## Docker 部署

```bash
docker compose -f deploy/docker-compose.yml up --build
```

Docker 镜像会安装脚本所需的 Python 依赖，并在容器内使用 `python3` 执行周报和 ONES 清单分析脚本。容器默认监听 `0.0.0.0:4173`。

## 安全边界

- ONES 模块当前只做分析，不会移动、保存或提交工作项。
- 创建 ONES 工作项清单模块当前只保存运行计划，不会直接创建 ONES 工作项。
- PPT/PDF 文件会上传到本机服务并保存在 `data/uploads/`，只在本地使用。
- Word 周报会继承 `templates/weekly-report-template.docx` 的版式。
- 创建 ONES 工作项清单要求每次手动选择需求表格并输入 ONES 目标迭代。
- 平台已加入本地账号访问；生产或内网多人使用时请修改默认密码。
- Touch ID 登录只保存本机公钥，不保存指纹或私钥。
- 真正执行工作项移动前，应增加企业登录、权限校验、二次确认和操作审计。
