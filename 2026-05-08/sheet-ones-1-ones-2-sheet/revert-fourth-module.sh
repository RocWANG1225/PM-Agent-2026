#!/usr/bin/env bash
set -euo pipefail

PROJECT="/Users/wangpeng5/Documents/Codex/2026-05-09/new-chat"
AGENT_FILE="$PROJECT/src/agents/projectManagementAgent.tsx"
FOURTH_MODULE="$PROJECT/src/modules/projectManagement/AccountAccessManagementModule.tsx"

cat > "$AGENT_FILE" <<'TSX'
import {
  FileTextOutlined,
  FormOutlined,
  RocketOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Space } from "antd";
import type { ReactNode } from "react";
import { CreateOnesWorkItemModule } from "../modules/projectManagement/CreateOnesWorkItemModule";
import { OnesIterationMigrationModule } from "../modules/projectManagement/OnesIterationMigrationModule";
import { WeeklyAssistantModule } from "../modules/projectManagement/WeeklyAssistantModule";

export type ProjectManagementModuleKey =
  | "weekly-assistant"
  | "ones-iteration-migration"
  | "create-ones-work-item";

export interface ProjectManagementModuleDefinition {
  key: ProjectManagementModuleKey;
  label: string;
  icon: ReactNode;
  description: string;
  render: () => ReactNode;
}

export const projectManagementModules: ProjectManagementModuleDefinition[] = [
  {
    key: "weekly-assistant",
    label: "周报助手",
    icon: <FileTextOutlined />,
    description: "选择本地 PPT/PDF，按开始和截止日期筛选议题，生成周报辅助内容。",
    render: () => <WeeklyAssistantModule />,
  },
  {
    key: "ones-iteration-migration",
    label: "ONES 迭代迁移",
    icon: <RocketOutlined />,
    description: "将既有项目数据映射并迁移到 ONES 迭代结构中。",
    render: () => <OnesIterationMigrationModule />,
  },
  {
    key: "create-ones-work-item",
    label: "创建 ONES 工作项",
    icon: <FormOutlined />,
    description: "基于分析结果创建 ONES 工作项，默认需要人工确认后再执行。",
    render: () => <CreateOnesWorkItemModule />,
  },
];

export const projectManagementAgentMeta = {
  title: "项目管理 Agent",
  subtitle: "本地化 MVP",
  pageTitle: "项目管理 Agent 本地化平台",
  pageSubtitle: "默认只读分析，涉及工作项移动前必须人工确认。",
  tags: [
    { color: "processing", text: "本地化 MVP" },
    { color: "success", text: "默认只读分析" },
  ],
  icon: <SettingOutlined />,
};
TSX

rm -f "$FOURTH_MODULE"

cd "$PROJECT"
npm run build

PID="$(lsof -tiTCP:4173 -sTCP:LISTEN || true)"
if [[ -n "$PID" ]]; then
  kill "$PID" || true
fi

nohup npm run preview -- --host 127.0.0.1 --port 4173 > /tmp/new-chat-preview-4173.log 2>&1 &
echo "Restored to 3 modules and restarted http://localhost:4173"
