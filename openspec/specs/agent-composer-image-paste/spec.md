# agent-composer-image-paste Specification

## Purpose
定义网页助手如何从系统剪贴板接收图片，预览并管理待发送附件，再将图片安全地作为 Agent 消息的一部分发送。

## Requirements

### Requirement: 网页助手可粘贴图片

网页助手 composer MUST 接受剪贴板中的 `image/*` 内容，并在发送前显示待发送图片预览和移除操作。图片 MUST 作为当前 Agent user 消息的图像内容随同可选文本发送，不得触发网页上传。

#### Scenario: 粘贴图片并发送

- **WHEN** 用户将图片粘贴到网页助手 composer 并发送
- **THEN** composer 显示图片预览，Agent 收到包含图像内容的 user 消息
- **AND** 图片由当前配置的 Agent 模型通过其已支持的图像协议处理

#### Scenario: 同时粘贴文本和图片

- **WHEN** 剪贴板同时包含文本和图片
- **THEN** 文本插入 composer 且光标位置保持合理
- **AND** 图片出现在待发送预览中并与文本一起提交

#### Scenario: 仅发送图片

- **WHEN** composer 没有文本但至少有一张有效图片
- **THEN** 用户仍可提交该图片消息

#### Scenario: 移除图片或图片超限

- **WHEN** 用户移除预览图片
- **THEN** 该图片不会包含在后续 Agent 消息中
- **WHEN** 粘贴图片的 data URL 超过 10,000,000 个字符或读取失败
- **THEN** 界面明确显示错误且不会静默丢弃附件
