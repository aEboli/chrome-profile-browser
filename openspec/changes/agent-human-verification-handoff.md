# Agent 人机验证人工接管

> 扩展 [`agent-model-browser-control.md`](agent-model-browser-control.md)，为网页 Agent 增加人机验证暂停和人工恢复流程。

## 目的

- 识别当前活动页面中常见的人机验证控件或明确提示。
- 在远程 Agent 可能执行页面动作前暂停，并把当前网页留给用户手动完成验证。
- 用户在页面中完成验证后，应用自动检查页面；验证标记消失后恢复原 Agent 任务。

## 行为

- 观察结果增加 `humanVerification` 状态，但不读取或解析验证码答案。
- 检测到验证时显示人工接管提示；`browser_click`、`browser_type`、`browser_keypress`、`browser_scroll`、`browser_drag`、`browser_open` 和浏览器控制配置动作暂停等待人工确认。
- 用户可以直接使用当前浏览器页面完成验证；应用每秒重新检查页面，验证仍存在时不恢复 Agent，也可点击“立即检查”提前触发检查。
- 停止 Agent、切换到其他标签或关闭环境会取消等待，不会自动提交验证。
- 普通网页动作仍使用现有受控 Electron `<webview>` 合成输入，不伪装成实体鼠标或键盘，也不调用操作系统全局输入接口。

## 安全边界

- 不识别、点击、拖拽、输入或绕过 CAPTCHA、Turnstile、reCAPTCHA、hCaptcha 等验证内容。
- 不调用第三方验证码代解服务或额外模型来完成验证。
- 检测结果仅用于暂停和人工接管，发送给 Agent 的内容不包含验证码答案、Cookie、Token 或密码。

## 可验证成功标准

1. 包含明确验证提示或常见验证控件的页面返回 `humanVerification.required=true`。
2. Agent 在验证状态下不能执行会改变页面的工具动作，并显示人工接管按钮。
3. 用户完成验证后，只有重新检查确认验证标记消失，Agent 才能继续执行；无需额外确认步骤。
4. 用户停止 Agent、切换标签或关闭环境时，等待状态会结束且不会产生验证动作。
5. 现有输入动作仍经过原有白名单和 `<webview>.sendInputEvent()` 路径；不新增 OS 级输入通道。
6. `npm test` 和 `npm run check` 通过。

## 任务

- [x] 增加固定的人机验证检测脚本和观察结果字段。
- [x] 增加 Agent 动作暂停、人工恢复和停止清理流程。
- [x] 增加人工接管面板、状态提示和自动化测试。
- [x] 更新 README 与总规范的安全边界。

状态：已实现。

验证记录：本次相关测试与涉及文件语法检查通过；全量检查当前还受到工作区既有的 `renderer.js` 孤立注释和管理页旧断言影响。
