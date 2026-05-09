import { InboxOutlined } from "@ant-design/icons";
import { Button, Card, DatePicker, Form, Space, Typography, Upload } from "antd";

export function WeeklyAssistantModule() {
  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Card>
        <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
          周报助手
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
          选择本地 PPT/PDF，按开始和截止日期筛选包含“议题”的内容，默认只读分析。
        </Typography.Paragraph>

        <Form layout="vertical">
          <Form.Item label="PPT 或 PDF 文件">
            <Upload.Dragger beforeUpload={() => false} multiple>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到这里上传</p>
              <p className="ant-upload-hint">支持本地 PPT、PPTX、PDF，上传后仅做只读分析。</p>
            </Upload.Dragger>
          </Form.Item>

          <Space size={16} wrap style={{ width: "100%" }}>
            <Form.Item label="开始日期" style={{ minWidth: 220, marginBottom: 0 }}>
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="截止日期" style={{ minWidth: 220, marginBottom: 0 }}>
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label=" " style={{ marginBottom: 0 }}>
              <Button type="primary">开始分析</Button>
            </Form.Item>
          </Space>
        </Form>
      </Card>
    </Space>
  );
}
