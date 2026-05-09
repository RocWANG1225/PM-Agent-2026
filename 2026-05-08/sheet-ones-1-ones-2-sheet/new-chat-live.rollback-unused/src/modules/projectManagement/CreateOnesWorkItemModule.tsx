import { Alert, Button, Card, Form, Input, Select, Space, Typography } from "antd";

export function CreateOnesWorkItemModule() {
  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        创建 ONES 工作项
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        根据分析结果生成工作项草稿，默认只生成预览，提交到 ONES 前必须人工确认。
      </Typography.Paragraph>

      <Alert
        type="warning"
        showIcon
        message="默认只读分析"
        description="涉及工作项创建、移动或批量写入前，必须人工确认。"
      />

      <Card title="工作项草稿">
        <Form layout="vertical">
          <Form.Item label="工作项标题">
            <Input placeholder="输入将要创建的 ONES 工作项标题" />
          </Form.Item>
          <Form.Item label="工作项类型">
            <Select
              options={[
                { label: "需求", value: "requirement" },
                { label: "任务", value: "task" },
                { label: "缺陷", value: "bug" },
              ]}
            />
          </Form.Item>
          <Form.Item label="描述">
            <Input.TextArea rows={5} placeholder="输入工作项描述或贴入分析生成内容" />
          </Form.Item>
          <Space>
            <Button>生成预览</Button>
            <Button type="primary">人工确认后创建</Button>
          </Space>
        </Form>
      </Card>
    </Space>
  );
}
