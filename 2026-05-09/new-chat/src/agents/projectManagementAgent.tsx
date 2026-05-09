import {
  FileTextOutlined,
  FormOutlined,
  KeyOutlined,
  RocketOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Space } from "antd";
import type { ReactNode } from "react";
import { AccountAccessManagementModule } from "../modules/projectManagement/AccountAccessManagementModule";
import { CreateOnesWorkItemModule } from "../modules/projectManagement/CreateOnesWorkItemModule";
import { OnesIterationMigrationModule } from "../modules/projectManagement/OnesIterationMigrationModule";
import { WeeklyAssistantModule } from "../modules/projectManagement/WeeklyAssistantModule";

export type ProjectManagementModuleKey =
  | "weekly-assistant"
  | "ones-iteration-migration"
  | "create-ones-work-item"
  | "account-access-management";

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
  {
    key: "account-access-management",
    label: "添加新账户和访问权限管理",
    icon: <KeyOutlined />,
    description: "管理账户新增、访问权限开通和权限变更申请，生成工作项前保留人工确认。",
    render: () => <AccountAccessManagementModule />,
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
