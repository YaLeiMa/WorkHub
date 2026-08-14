---
name: group-route
description: 群聊看到 @角色 就 kanban_create 交给对应同事 profile
version: 0.20.0
metadata:
  hermes:
    tags: [kanban, routing, group-chat]
    category: orchestration
---

# 群聊路由

在群聊 / gateway 入口使用。用户入口是现有 Hermes gateway，不新开端口。

## When to Use

- 消息里出现 `@产品经理` `@系统架构师` `@全栈工程师` `@测试工程师` `@运维工程师` `@Figma ui设计` `@everyone`
- 用户要把活交给某位同事
- 需要把一项群聊请求拆成同机 kanban 卡片

先 `skill_view("group-route")`，再 `kanban_create`。

## 花名册（只这些是同事）

| 提及 | assignee（profile） |
|------|---------------------|
| @产品经理 | pm |
| @系统架构师 | architect |
| @全栈工程师 | fullstack |
| @测试工程师 | tester |
| @运维工程师 | ops |
| @Figma ui设计 | figma |

也接受去掉 `@` 的全称，以及 profile 名本身（`pm` / `architect` / `fullstack` / `tester` / `ops` / `figma`）。

**不是同事：** `delegate_task` 子 agent、临时工、匿名 helper。不要把他们写成团队成员，不要把任务 assignee 设成子 agent 名。

## Procedure

1. 读消息，收集所有有效 @提及。没有提及时：若用户明显在对入口说话（闲聊、问进度、问谁在），你自己答；若是明确要某人做的活但写错了名字，先问一句，不要乱派。
2. `@everyone`：按请求内容挑选**相关**同事，各建一张卡。不要无脑六张。典型切分：
   - 要做什么 / 验收 → pm
   - 怎么拆系统 / 接口 → architect
   - 做出来 → fullstack
   - 界面 → figma
   - 怎么验 → tester
   - 怎么上、怎么看住 → ops
   不相关的角色不要建卡。
3. 每个目标角色调用一次 `kanban_create`：
   - `title`：短、可执行
   - `assignee`：上表 profile 名（`pm` 等），不要用中文称呼当 assignee
   - `body`：原文要点、验收、上下文。需要协作时用 `parents` / `kanban_link`
   - 同一次分派可用 `idempotency_key` 避免重复建卡
4. 同机只用 kanban。不要 A2A。不要建议新 gateway、新端口、机器 IP。
5. 向用户确认：已交给哪些**对外称呼**，以及卡片标题。不要提临时工/子 agent。

## 例子

```
kanban_create(
    title="写 MVP 验收标准",
    assignee="pm",
    body="用户在群里 @产品经理：……（附原文）",
)
```

```
kanban_create(
    title="补登录失败态设计",
    assignee="figma",
    body="……",
)
```

## Pitfalls

- assignee 必须是已安装 profile：`pm` `architect` `fullstack` `tester` `ops` `figma`。写错则 dispatcher 拉不起工人。
- 不要用 `delegate_task` 冒充同事。
- `kanban.auto_decompose` 在本产品层是 false：拆活是入口/同事用 `kanban_create` 完成，不靠内置分解器。
- 你是入口，不要自己把实现做完再假装「已交办」。
