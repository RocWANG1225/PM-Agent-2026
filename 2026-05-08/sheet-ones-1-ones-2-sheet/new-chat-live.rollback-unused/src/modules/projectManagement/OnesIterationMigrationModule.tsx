import { Button, Card, List, Space, Steps, Tag, Typography } from "antd";

export function OnesIterationMigrationModule() {
  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        ONES 迭代迁移
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        将既有项目计划映射到 ONES 迭代结构中，先分析和预览，再由人工确认执行迁移。
      </Typography.Paragraph>

      <Card>
        <Steps
          current={1}
          items={[
            { title: "读取源数据", description: "扫描本地或导出的项目结构" },
            { title: "映射迭代字段", description: "对齐里程碑、负责人、日期" },
            { title: "人工确认", description: "确认后才允许写入 ONES" },
          ]}
        />
      </Card>

      <Card title="待迁移项预览">
        <List
          dataSource={[
            "迭代名称与 ONES Sprint 对齐",
            "负责人映射到 ONES 成员",
            "开始/截止日期做格式校验",
          ]}
          renderItem={(item) => (
            <List.Item>
              <Space>
                <Tag color="processing">预检</Tag>
                <span>{item}</span>
              </Space>
            </List.Item>
          )}
        />
        <Button type="primary">生成迁移预览</Button>
      </Card>
    </Space>
  );
}
