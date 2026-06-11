# 反馈：Hermes write-article 接口 thesis 字段平台已对接，请确认上线状态

**日期**：2026-06-11
**反馈方**：hot-now 编辑台

## 背景

平台前端已完成 `thesis`（核心立意）字段的全链路对接，涉及两个写作入口：

1. **素材库写文章**：`POST /api/creative/source-items/:id/write-article` → 代理到 Hermes `POST /api/write-article`
2. **自定义内容写文章**：`POST /actions/creative/source-items/manual-write` → 创建素材后调用同一个 Hermes 接口

## 平台已传递的字段

```json
{
  "sourceItemId": 123,
  "mode": "B",
  "thesis": "两种焦虑：套餐中token消耗完的焦虑，和套餐中token消耗不完的焦虑"
}
```

| 字段 | 是否新增 | 说明 |
|---|---|---|
| `sourceItemId` | 已有 | 不变 |
| `mode` | 已有 | 不变 |
| `thesis` | **新增** | 可选，用户填了就传，没填不传 |

## 请 Hermes 确认

1. **`POST /api/write-article` 是否已支持 `thesis` 字段？**
   - 如果已上线：无需额外操作
   - 如果未上线：平台传了 `thesis` 过去，请确认 Hermes 会忽略未知字段不会报错，避免影响现有写作流程

2. **未传 thesis 时的行为是否和以前完全一致？** 平台大部分写作请求不会带 thesis，需要确保无副作用

3. **thesis 传入后的预期行为**：系统锁定该观点，不会被自动替换或反转。请确认这个理解是否正确

## 涉及的平台提交

- `feat: 手动写作接口新增 thesis 核心立意字段`
- `feat: 素材库写文章弹窗新增 thesis 核心立意输入`
