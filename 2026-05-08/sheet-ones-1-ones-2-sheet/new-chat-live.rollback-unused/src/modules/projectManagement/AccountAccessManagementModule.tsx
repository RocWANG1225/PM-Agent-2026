import { KeyOutlined, SafetyCertificateOutlined, UserAddOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Checkbox, Form, Input, Select, Space, Steps, Typography } from "antd";

export function AccountAccessManagementModule() {
  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        添加新账户和访问权限管理
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        收集新账户开通信息，确认访问范围和权限级别，生成权限类工作项前保留人工确认。
      </Typography.Paragraph>

      <Alert
        type="info"
        showIcon
        message="权限变更需要确认"
        description="涉及账号创建、权限开通、权限升级或跨系统访问时，先生成申请草稿并确认审批人。"
      />

      <Card>
        <Steps
          current={1}
          items={[
            {
              title: "账户信息",
              description: "确认姓名、邮箱、所属团队",
              icon: <UserAddOutlined />,
            },
            {
              title: "访问范围",
              description: "选择系统、项目和权限级别",
              icon: <KeyOutlined />,
            },
            {
              title: "审批确认",
              description: "记录负责人并生成工作项",
              icon: <SafetyCertificateOutlined />,
            },
          ]}
        />
      </Card>

      <Card title="访问权限申请">
        <Form layout="vertical">
          <Form.Item label="账户邮箱">
            <Input placeholder="输入新账户邮箱" />
          </Form.Item>
          <Form.Item label="账户姓名">
            <Input placeholder="输入账户使用人姓名" />
          </Form.Item>
          <Form.Item label="访问系统">
            <Checkbox.Group options={["ONES", "SharePoint", "GitHub", "数据平台", "模型平台"]} />
          </Form.Item>
          <Form.Item label="权限级别">
            <Select
              placeholder="选择权限级别"
              options={[
                { label: "只读访问", value: "read-only" },
                { label: "编辑协作", value: "editor" },
                { label: "项目管理员", value: "project-admin" },
                { label: "临时访问", value: "temporary" },
              ]}
            />
          </Form.Item>
          <Form.Item label="访问原因">
            <Input.TextArea rows={4} placeholder="说明账户用途、访问范围和有效期" />
          </Form.Item>
          <Space>
            <Button>生成申请预览</Button>
            <Button type="primary">人工确认后创建权限工作项</Button>
          </Space>
        </Form>
      </Card>
    </Space>
  );
}
