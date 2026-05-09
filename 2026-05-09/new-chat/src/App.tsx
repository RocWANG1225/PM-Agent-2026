import { useState } from "react";
import { Layout, Menu, Typography } from "antd";
import {
  projectManagementAgentMeta,
  projectManagementModules,
  type ProjectManagementModuleKey,
} from "./agents/projectManagementAgent";

const { Header, Content, Sider } = Layout;

export default function App() {
  const [activeKey, setActiveKey] = useState<ProjectManagementModuleKey>("weekly-assistant");
  const activeModule =
    projectManagementModules.find((module) => module.key === activeKey) ?? projectManagementModules[0];

  return (
    <Layout className="app-shell">
      <Sider width={258} breakpoint="lg" collapsedWidth="0" theme="dark" className="app-sider">
        <div className="brand-block">
          <div className="brand-badge">PM</div>
          <div>
            <Typography.Title level={4} className="brand-title">
              {projectManagementAgentMeta.title}
            </Typography.Title>
            <Typography.Paragraph className="brand-copy">{projectManagementAgentMeta.subtitle}</Typography.Paragraph>
          </div>
        </div>
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={[activeKey]}
          onClick={({ key }) => setActiveKey(key as ProjectManagementModuleKey)}
          items={projectManagementModules.map((module) => ({
            key: module.key,
            label: module.label,
          }))}
          className="app-menu"
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {projectManagementAgentMeta.pageTitle}
            </Typography.Title>
            <Typography.Paragraph className="header-copy">{projectManagementAgentMeta.pageSubtitle}</Typography.Paragraph>
          </div>
        </Header>
        <Content className="app-content">{activeModule.render()}</Content>
      </Layout>
    </Layout>
  );
}
