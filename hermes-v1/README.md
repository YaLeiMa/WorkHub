# V1 产品层：角色档案 + 群聊路由

Hermes 0.20 之上的薄层。不绑机器 IP。Runtime 不在客户端跑；`electron/` 只是连主机 Hermes gateway 的远程聊天窗。无云桌面、无 iOS、无计费。

## 范围

- 一角色一 profile（同事）。`delegate_task` 子 agent 是临时工，不对外、不当同事。
- 用户入口：现有主机上的 Hermes gateway（不新开端口）。
- 角色间交代：同机 kanban（不走 A2A；A2A 留给跨机/迁青岛）。
- 群聊路由：默认 gateway 当入口，看到 `@角色` 就 `kanban_create` 交给对应 profile。

## 角色（profile 名）

| profile | 对外称呼 |
|---------|----------|
| default | 群入口 / 路由（现有 gateway，不另开进程） |
| pm | 产品经理 |
| architect | 系统架构师 |
| fullstack | 全栈工程师 |
| tester | 测试工程师 |
| ops | 运维工程师 |
| figma | Figma ui设计 |

落盘：`~/.hermes/profiles/<name>/`（default 仍是 `~/.hermes/`）。

## 主机安装（运维）

现有主机、青岛不动。脚本只写文件，默认不重启 gateway。

```bash
git clone https://github.com/YaLeiMa/hermes-v1.git /opt/hermes-v1
sudo -u <hermes用户> /opt/hermes-v1/host/install.sh
# 确认后再重启（需要窗口）：
sudo -u <hermes用户> /opt/hermes-v1/host/install.sh --restart
```

模型 key 仍用各 profile 自己的 `.env`，本仓库不带密钥。

主机 `platforms.api_server` 需自行在该 profile 的 `.env` 打开（`API_SERVER_ENABLED` / `API_SERVER_KEY`），本仓库不写密钥、不写端口。

## Electron 薄壳（远程聊天窗）

不在本机 spawn `hermes`。窗口只对主机 OpenAI 兼容接口 `POST /v1/chat/completions`（SSE）发请求。连不上就显示「无法连接主机（can't reach host）」。

`HERMES_BASE_URL` 与 `HERMES_API_KEY` 从环境变量或 gitignored 的 `electron/config.local.json` 读取，代码里不写死 IP/端口。

```bash
cd electron
cp config.local.json.example config.local.json
# 填主机 gateway 的 api_server 根地址与 Bearer key（不要提交该文件）
npm install
npm start
```
