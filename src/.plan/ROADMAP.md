WorkHub 产品需求文档 V1.1（完善版）
0. 文档说明
本文档在 V1.0 基础上补充：页面职责与边界、交互链路闭环、状态管理（Pinia store 字段）、路由设计、键盘交互规范、字段与中文文案定义、数据库与 IPC 接口、边界/异常态、各模块验收标准。
开发须遵循根目录 commands 约束：UI 全中文、基于已确认页面职责闭环推进、优先复用现有 store/路由/交互、新增组件需配套组件文档、复杂逻辑写中文注释。
术语统一：
主窗口：唯一的 900×600 应用窗口。
唤起：通过全局快捷键显示并聚焦主窗口。
闭环：页面内可完成“进入 → 操作 → 状态变更 → 持久化 → 反馈”的完整链路。
1. 项目简介（同 V1.0，补充非功能目标）
WorkHub 是一款基于 Tauri 的轻量级开发者桌面工具，解决项目多、文档散、代码片段难管理的问题，以键盘优先 + 搜索驱动的方式完成项目启动、片段检索、文件收藏等高频操作。

非功能目标（新增）

维度	目标
启动速度
全局快捷键唤起到可输入 < 200ms（窗口常驻后台）
搜索响应
输入到结果刷新 < 100ms（本地 SQLite，数据量 < 1 万条）
离线
全功能离线可用，无任何网络依赖
单实例
不允许多开，二次启动聚焦已有窗口
数据安全
所有数据本地存储，提供导入/导出/备份/恢复
2. 信息架构与导航（新增）
2.1 页面清单与职责边界
页面/视图	路由	核心职责	不负责
首页（搜索 + 最近使用）
/
全局搜索入口、最近使用聚合、键盘导航分发
不做项目/片段的详细编辑
项目列表
/projects
项目增删查、收藏、搜索、进入详情
不做常用链接/命令的逐条编辑
项目详情
/projects/:id
基础信息、常用链接、常用命令、项目文档、快速启动
不做跨项目搜索
代码片段列表
/snippets
片段增删查、分类/标签筛选、收藏、复制
不做语法执行
代码片段详情
/snippets/:id
查看/编辑单条片段、复制
—
文件收藏
/favorites
收藏（文件/文件夹/网址）增删查、快速打开
不做文件内容预览
设置中心
/settings
通用设置、快捷键、数据管理
不做业务数据编辑
约束对齐：每个页面都需满足“页面可访问 + 交互链路闭环 + 状态可追踪”。新增页面前先确认是否能在现有页面闭环内补齐。

2.2 全局布局
顶部：全局搜索框（首页常驻；其他页面顶部为返回 + 当前页搜索框）。
左侧（可选）：模块导航（首页 / 项目 / 片段 / 收藏 / 设置），支持 Ctrl+1~5 快速切换。
主区：当前页面内容。
底部：状态栏（显示当前快捷键提示、操作反馈 Toast 锚点）。
3. 全局键盘交互规范（新增，统一口径）
键盘优先是核心，所有页面必须遵守同一套键位，避免每个页面各自定义。

3.1 全局快捷键
快捷键	行为
Ctrl + Shift + K
唤起主窗口；窗口已显示时聚焦搜索框并全选已输入内容
Esc
列表/搜索态：清空搜索或关闭弹窗；无可关闭项时：隐藏窗口到托盘
Ctrl + 1~5
切换 首页/项目/片段/收藏/设置
Ctrl + ,
打开设置中心
3.2 列表内导航（项目/片段/收藏/搜索结果通用）
快捷键	行为
↑ / ↓
上一项 / 下一项（到边界循环或停住，统一为“停住”）
Enter
执行该项主操作（见各模块定义）
Ctrl + Enter
打开该项详情
Ctrl + C
复制该项可复制内容（命令/代码/路径/网址）
Ctrl + D
收藏 / 取消收藏当前项
Delete
删除当前项（需二次确认）
3.3 主操作（Enter）约定
项类型	Enter 主操作
项目
用 VSCode 打开项目（code <path>）
代码片段
复制代码到剪贴板
常用命令
复制命令到剪贴板
常用链接 / 网址收藏
默认浏览器打开
文件 / 文件夹收藏
系统默认程序/资源管理器打开
项目文档
系统默认程序打开
所有 Enter/复制/打开操作完成后，底部状态栏弹出中文 Toast（如“已复制”“已用 VSCode 打开”“已打开链接”），保证“操作有反馈”。

4. 首页（搜索 + 最近使用）补充
4.1 搜索框
位置：顶部常驻，唤起后自动聚焦。
行为：实时搜索 + 模糊匹配，输入防抖 100ms。
占位文案（中文）：搜索项目、文件、代码片段、收藏…
搜索范围：项目 / 文件（项目文档+文件收藏）/ 代码片段 / 收藏内容。
4.2 搜索结果（聚合展示）
分组展示：项目 / 代码片段 / 收藏 / 文件，每组默认最多 5 条，可“查看全部”跳转对应模块列表并带入关键词（复用路由 query：?q=关键词）。
命中高亮：标题/标签中命中的关键词高亮。
排序规则（新增）：
标题完全匹配 > 标题前缀匹配 > 标题包含 > 标签包含 > 描述包含；
同等匹配下按最近使用时间倒序；
已收藏项小幅加权。
4.3 最近使用
无搜索输入时展示，默认 10 条，来源 Recent 表，混合“最近打开项目 / 最近打开文件 / 最近复制片段”。
每条展示：图标（区分类型）+ 标题 + 类型标签 + 相对时间（如“刚刚/5 分钟前/昨天”）。
操作同 §3 列表导航。
空状态文案：还没有最近记录，开始搜索或添加项目吧。
4.4 首页验收标准
唤起即可输入；输入有实时结果；↑↓ 可选中、Enter 执行主操作并有 Toast 反馈；最近使用可正确写入与读取（持久化）。
5. 项目管理 补充
5.1 项目列表
列表项展示：名称、描述（单行省略）、标签（最多 3 个，超出 +N）、更新时间、收藏标记。
操作：新增 / 编辑 / 删除（二次确认）/ 收藏 / 搜索（顶部框，复用 ?q=）。
新增/编辑表单字段与中文文案：
字段	label（中文）	placeholder（中文）	校验
name
项目名称
请输入项目名称
必填，≤ 50 字
description
项目描述
一句话描述这个项目
选填，≤ 200 字
path
本地路径
选择或粘贴项目目录
必填，需为存在的目录（Tauri 校验）
git_url
Git 地址
例如 https://github.com/xxx/xxx.git
选填，URL 格式
tags
标签
回车添加标签
选填，单标签 ≤ 20 字
空状态：还没有项目，点击右上角“新增项目”创建第一个。
5.2 项目详情（四块内容，均需闭环）
基础信息
展示与编辑基础字段（同上）；保存后写库并更新 updated_at。
常用链接（新增数据结构）
每条：名称（如“测试环境”）+ url。
操作：新增 / 编辑 / 删除 / 点击或 Enter → 默认浏览器打开。
文案：链接名称 / 链接地址，空状态 暂无常用链接。
常用命令（新增数据结构）
每条：名称（可选）+ command。
操作：新增 / 编辑 / 删除 / 点击或 Enter → 复制到剪贴板（Toast：命令已复制）。
空状态 暂无常用命令。
项目文档
关联本地文件（PDF/Word/Excel/Markdown）。每条：文件名 + 文件路径。
操作：添加（文件选择器）/ 删除 / 双击或 Enter → 系统默认程序打开。
异常：文件不存在时提示 文件不存在或已被移动，并提供“重新选择/移除”。
快速启动
Enter / 按钮 → 执行 code <path>（通过 Tauri 调用系统命令）。
异常：未安装 VSCode / code 不在 PATH → 提示 未检测到 VSCode，请先安装或配置 code 命令。
5.3 项目模块验收标准
列表增删改查闭环并持久化；详情四块均可编辑且写库；快速启动可拉起 VSCode；所有打开/复制有中文 Toast；updated_at 随编辑刷新。
6. 代码片段管理 补充
6.1 列表与筛选
顶部：搜索框 + 分类下拉（§6.3）+ 标签筛选（多选）。
列表项：标题、分类徽标、标签、更新时间、收藏标记、代码预览（首行省略）。
操作：新增 / 编辑 / 删除 / 收藏 / 搜索 / 标签筛选。
6.2 片段表单字段与文案
字段	label	placeholder	校验
title
标题
请输入片段标题
必填，≤ 50 字
description
描述
简单说明用途
选填，≤ 200 字
category
分类
选择分类
必填，枚举（§6.3）
tags
标签
回车添加标签
选填
content
代码内容
粘贴你的代码
必填
6.3 分类枚举（中文显示，存英文 key）
JavaScript / TypeScript / Vue / React / NestJS / SQL / Rust / Shell / Docker / 其他(other)

6.4 快捷操作
Enter：复制代码（Toast：代码已复制）。
Ctrl + Enter：打开详情（/snippets/:id）。
详情页支持只读查看 + 编辑切换；代码区等宽字体、行号、语法高亮（仅展示，不执行）。
6.5 片段模块验收标准
增删改查 + 收藏 + 分类/标签筛选闭环并持久化；Enter 复制有反馈；详情可编辑保存。
7. 文件收藏 补充
7.1 收藏类型与字段
type	含义	target 内容	主操作（Enter）
file
文件
本地文件绝对路径
系统默认程序打开
folder
文件夹
本地目录绝对路径
资源管理器打开
url
网络地址
http(s) 链接
默认浏览器打开
通用字段补充：title（显示名）、tags（选填）。
表单文案：收藏名称 / 类型 / 路径或网址。
7.2 功能与异常
添加（按类型用文件/文件夹选择器或手输 URL）/ 删除（二次确认）/ 搜索 / 快速打开。
异常：本地路径不存在 → 路径不存在或已被移动，提供“重新选择/移除”。
空状态：还没有收藏，添加常用文档、目录或链接吧。
7.3 验收标准
三类收藏均可添加、打开、删除并持久化；打开异常有中文提示。
8. 全局搜索 行为细化（与首页搜索一致）
快捷键 Ctrl + Shift + K 唤起后输入即搜。
范围与排序见 §4.2。
示例（来自 V1.0，明确预期）：
输入 sql → 返回 SQL 分类相关代码片段；
输入 medical → 返回名称/标签含 medical 的项目；
输入 docker → 返回 Docker 相关命令/片段。
键盘操作见 §3.2（统一）。
9. 系统托盘 补充
托盘菜单（中文）：显示主窗口 / 设置 / 退出程序。
行为：点击窗口关闭按钮 = 最小化到托盘，程序继续运行；退出程序才真正结束进程。
托盘图标左键单击 = 显示并聚焦主窗口（等价快捷键唤起）。
边界：退出前若有未保存编辑，弹出确认 有未保存的修改，确定退出吗？。
10. 设置中心 补充
10.1 通用设置（字段 + 持久化）
设置项	文案	类型	默认
主题
主题切换
跟随系统/浅色/深色
跟随系统
窗口置顶
窗口置顶
开关
关
开机启动
开机启动
开关
关
自动更新
自动更新
开关
开
10.2 快捷键设置
可修改“全局唤起快捷键”，录制式输入，冲突检测并提示 该快捷键已被占用。
10.3 数据管理
导出数据（导出为 JSON/数据库文件）/ 导入数据（覆盖前确认）/ 数据库备份 / 数据库恢复。
危险操作（导入/恢复）需二次确认，文案明确风险。
10.4 设置存储
设置写入独立 Setting 表或本地配置文件（见 §11.5），变更即时生效并持久化。
11. 数据库设计 补充（类型、约束、索引、新增表）
统一约定：id 为自增主键或 UUID（择一，建议 UUID 文本）；created_at/updated_at 存储为 ISO8601 文本或 Unix 时间戳（统一一种）。tags 以 JSON 文本或逗号分隔存储（建议 JSON 文本）。

11.1 Project（项目表）
字段	类型	约束
id
TEXT
PK
name
TEXT
NOT NULL
description
TEXT
NULL
path
TEXT
NOT NULL
git_url
TEXT
NULL
tags
TEXT(JSON)
NULL
is_favorite
INTEGER(0/1)
默认 0（新增）
created_at
TEXT/INT
NOT NULL
updated_at
TEXT/INT
NOT NULL
索引：name、updated_at。

11.2 ProjectLink（项目常用链接，新增表）
id, project_id(FK), name, url, sort, created_at

11.3 ProjectCommand（项目常用命令，新增表）
id, project_id(FK), name, command, sort, created_at

11.4 ProjectDoc（项目文档关联，新增表）
id, project_id(FK), name, path, created_at

11.5 Snippet（代码片段表）
字段	类型	约束
id
TEXT
PK
title
TEXT
NOT NULL
description
TEXT
NULL
category
TEXT
NOT NULL（枚举 key）
tags
TEXT(JSON)
NULL
content
TEXT
NOT NULL
is_favorite
INTEGER
默认 0（新增）
created_at / updated_at
TEXT/INT
NOT NULL
索引：category、title、updated_at。

11.6 Favorite（收藏表）
id, type(file/folder/url), title, target, tags(JSON,NULL), created_at

11.7 Recent（最近访问表）
id, type(project/file/snippet), target_id, action(open/copy), created_at

写入时机：执行打开/复制主操作后写入；查询取最近 N 条并按 created_at 倒序去重。
11.8 Setting（设置表，新增）
key TEXT PK, value TEXT（存主题、置顶、开机启动、自动更新、全局快捷键等）。

12. 前端状态管理（Pinia store，新增）
约束对齐：优先复用现有 store；store 字段需让“状态可追踪”。

store	state（关键字段）	主要 actions
useAppStore
theme, alwaysOnTop, autoStart, autoUpdate, globalHotkey, windowVisible
读写设置、应用主题、注册/更新全局快捷键
useSearchStore
keyword, results(分组), activeIndex, loading
search()、moveSelection()、executeActive()
useProjectStore
list, current, filterKeyword
CRUD、toggleFavorite()、openInVSCode()、链接/命令/文档子项 CRUD
useSnippetStore
list, current, category, tagFilters
CRUD、copy()、toggleFavorite()
useFavoriteStore
list, filterKeyword
CRUD、open()
useRecentStore
list
record(type,target,action)、load()
13. 前后端接口（Tauri Command / IPC，新增）
前端通过 invoke 调用 Rust 命令，统一返回 { ok, data, error } 结构，错误信息为中文。

命令	入参	返回	说明
project_list / project_get / project_create / project_update / project_delete
见字段
Project
项目 CRUD
project_link_* / project_command_* / project_doc_*
…
…
子项 CRUD
snippet_*
…
Snippet
片段 CRUD
favorite_*
…
Favorite
收藏 CRUD
recent_list / recent_record
…
Recent
最近访问
search_all
{ keyword }
分组结果
全局搜索（后端聚合排序）
open_in_vscode
{ path }
ok
执行 code <path>
open_path
{ target, type }
ok
打开文件/文件夹/网址
copy_to_clipboard
{ text }
ok
复制
setting_get / setting_set
{ key, value }
ok
设置读写
data_export / data_import / db_backup / db_restore
…
ok
数据管理
register_global_hotkey
{ hotkey }
ok
注册/更新全局快捷键
window_show / window_hide / window_toggle_top
—
ok
窗口控制
14. 边界与异常（统一汇总，新增）
场景	处理
路径/文件不存在
中文提示 + “重新选择/移除”
未安装 VSCode
提示安装或配置 code
全局快捷键冲突
录制时检测并提示
删除操作
一律二次确认
导入/恢复数据
覆盖前强确认，提示风险
空数据
各页面提供专属中文空状态文案
二次启动
聚焦已有窗口，不新建实例
长文本
列表单行省略，详情完整展示
15. 组件文档要求（对齐 commands，新增）
新增组件须在组件目录下创建同名组件文档（如 SearchBox/README.md），至少包含：

组件功能简述；
Props（名称、类型、是否必填、默认值、中文含义）；
Emits/事件；
使用示例；
涉及的快捷键/交互说明。
V1 预计核心组件：SearchBox、ResultList、ResultItem、EmptyState、TagInput、FormModal、ConfirmDialog、Toast/StatusBar、CodeViewer、HotkeyRecorder。

16. V1 范围与验收清单（对齐 commands「完成标准」）
V1 必做：全局快捷键唤起、项目管理、代码片段管理、SQLite 存储、全局搜索、系统托盘。

整体验收（每条都要满足）：


 各页面可访问（路由可达、空状态正常）。

 交互链路闭环（进入→操作→状态变更→持久化→反馈）。

 状态可追踪（Pinia store 字段清晰，刷新后数据仍正确）。

 文案与字段一致（UI 全中文，表单字段与库字段对应）。

 不破坏已有演示能力。

 全局快捷键唤起 < 200ms；搜索响应 < 100ms；完全离线可用。
17. 未来规划（同 V1.0，保留）
V2：Markdown 笔记、项目模板、Git 快捷操作、SQL 收藏夹、SSH 连接管理。
V3：AI 代码生成/解释、本地知识库、RAG 检索、MCP 工具集成。
最终定位：开发者个人工作台（Developer Workspace）。