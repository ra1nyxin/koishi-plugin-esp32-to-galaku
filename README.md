# koishi-plugin-esp32-to-galaku

这是一个 Koishi 插件，用 Discord 机器人命令控制本机或远端的 ESP32-S3 GALAKU 桥。

完整链路：

```text
Discord 消息
  -> Koishi Discord adapter
  -> koishi-plugin-esp32-to-galaku
  -> TCP
  -> tools/galaku-serial-bridge.ps1
  -> ESP32-S3 USB Serial/JTAG
  -> ESP32-S3 BLE
  -> GALAKU 设备
```

插件本身不直接打开 COM 串口。COM 口只由 PowerShell/.NET `SerialPort` 桥接脚本持有，Koishi 只走 TCP，这样能避开 Node.js/Koishi 直接控制 ESP32-S3 USB Serial/JTAG 时容易遇到的复位、占用和重连问题。

## 当前状态

- 插件命令已可用：`galaku status`、`galaku ping`、`galaku scan`、`galaku services`、`galaku set <0-100>`、`galaku hit <damage>`、`galaku stop`。
- PS1 桥脚本已放在 `tools/galaku-serial-bridge.ps1`，并且会把 ESP32-S3 串口回复写回 TCP 客户端。
- GitHub Actions 已配置，依赖安装、TypeScript 构建、Node 测试、`npm pack --dry-run` 都在 Actions 里跑。
- 当前仓库开发机不需要执行 `npm init`、`npm install`、`npm run build` 或测试。
- 还没有发布到 npm 时，可以在实际 Koishi 部署项目中通过 GitHub 依赖安装。

## 一、准备 Discord 账号、服务器和机器人

### 1. 注册 Discord 账号

1. 打开 Discord 官网并注册账号。
2. 登录 Discord 客户端或网页版。
3. 创建一个只用于测试的服务器，或者使用你已有的私人测试服务器。

建议先用私人服务器测试，不要一开始把机器人拉进公开服务器。

### 2. 创建 Discord Developer 应用

1. 打开 Discord Developer Portal：<https://discord.com/developers/applications>
2. 点击 `New Application`。
3. 输入应用名称，例如 `GALAKU Koishi Test Bot`。
4. 进入应用后，打开左侧 `Bot` 页面。
5. 点击 `Add Bot`，创建机器人用户。
6. 在 `Token` 区域点击 `Reset Token` 或 `View Token`，复制 Bot Token。

Bot Token 等同于机器人账号密码，不要提交到 GitHub，不要发给别人。

### 3. 打开需要的 Bot Intents

在 Developer Portal 的 `Bot` 页面，找到 `Privileged Gateway Intents`：

1. 打开 `Message Content Intent`。
2. 如果你的 Koishi/Discord 配置需要读取成员相关事件，再打开 `Server Members Intent`；本插件的基本命令不强依赖它。
3. 保存设置。

这个插件注册的是 Koishi 文本命令，不是 Discord 原生 slash command。要让机器人能读到普通频道消息里的 `galaku status` 这类文本命令，通常需要 `Message Content Intent`。

### 4. 邀请机器人进入服务器

1. 在 Developer Portal 打开 `OAuth2` -> `URL Generator`。
2. `Scopes` 勾选：
   - `bot`
   - `applications.commands`
3. `Bot Permissions` 至少勾选：
   - `View Channels`
   - `Send Messages`
   - `Read Message History`
4. 复制生成的 URL，在浏览器打开。
5. 选择你的测试服务器并授权。

如果只是用 Koishi 文本命令，核心权限是看频道和发消息；`applications.commands` 预留给 Discord/Koishi 侧后续需要注册交互命令的场景。

## 二、准备 Koishi 和 Discord 适配器

下面操作在真正运行机器人的 Koishi 项目里做，不是在本仓库开发目录里做。

### 方案 A：用 Koishi 控制台安装

1. 启动你的 Koishi 实例。
2. 打开 Koishi 控制台。
3. 在插件市场安装 Discord 适配器，插件通常显示为 `adapter-discord`。
4. 在 Discord 适配器配置里填入刚才复制的 Bot Token。
5. 启用 Discord 适配器。
6. 在插件市场或依赖管理里安装本插件。

如果本插件还没发布到 npm，Koishi 控制台可能搜不到它。这时用方案 B，从 GitHub 依赖安装。

### 方案 B：在 Koishi 项目中从 GitHub 安装本插件

在你的 Koishi 项目目录中添加依赖。示例：

```json
{
  "dependencies": {
    "@koishijs/plugin-adapter-discord": "latest",
    "koishi-plugin-esp32-to-galaku": "github:ra1nyxin/koishi-plugin-esp32-to-galaku"
  }
}
```

然后在 Koishi 项目目录运行安装命令。注意，这是部署 Koishi 的项目，不是本仓库开发目录。

```bash
npm install
```

本仓库已经配置了 `prepare`，从 GitHub 安装时 npm 会自动编译 TypeScript。

### 3. 配置本插件

插件配置项：

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `host` | `127.0.0.1` | PS1 TCP 串口桥地址。 |
| `port` | `25363` | PS1 TCP 串口桥端口。 |
| `timeoutMs` | `3500` | 单次命令等待桥脚本回复的超时时间，单位毫秒。 |
| `maxReplyBytes` | `4096` | 单次最多读取的 TCP 回复字节数。 |
| `allowRaw` | `false` | 是否允许 `galaku raw <command>`。 |

本机 Koishi + 本机 ESP32-S3 时保持默认：

```yaml
host: 127.0.0.1
port: 25363
timeoutMs: 3500
maxReplyBytes: 4096
allowRaw: false
```

朋友的 Koishi 机器人通过 frp 连回你的 ESP32-S3 时，把 `host` 和 `port` 改成 frp 暴露出来的地址和端口。

## 三、启动 ESP32-S3 串口桥

这一步在插着 ESP32-S3 的 Windows 机器上执行。

### 1. 确认 ESP32-S3 固件

ESP32-S3 固件需要支持这些串口命令：

```text
PING
STATUS
SCAN
SERVICES
SET <0-100>
HIT <damage>
STOP
```

当前 ESP32-S3 项目默认信息：

| 项目 | 值 |
| --- | --- |
| 串口 | `COM3` |
| 波特率 | `115200` |
| TCP 桥默认监听 | `127.0.0.1:25363` |

如果你的设备管理器里 ESP32-S3 不是 `COM3`，启动脚本时改 `-SerialPort`。

### 2. 启动 PS1 桥

在本仓库目录运行：

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\tools\galaku-serial-bridge.ps1 `
  -SerialPort COM3 `
  -Baud 115200 `
  -ListenPort 25363
```

正常启动后会看到类似：

```text
GALAKU TCP bridge listening on 127.0.0.1:25363
COM <= PING
COM => PONG
```

### 3. frp 场景

推荐让 PS1 桥继续只监听 `127.0.0.1`，再由 frpc 把本机 `127.0.0.1:25363` 映射出去。不要无保护地把桥脚本监听到公网。

示意：

```ini
[galaku-bridge]
type = tcp
local_ip = 127.0.0.1
local_port = 25363
remote_port = 25363
```

frp server、token、访问控制、防火墙规则按你的实际环境配置。这个 TCP 端点收到命令就会控制设备，必须把它当作受信控制接口处理。

## 四、在 Discord 中发送控制命令

确认这三件事都已完成：

1. Discord 机器人已在线。
2. Koishi 已启用 Discord adapter 和本插件。
3. PS1 桥脚本已连接到 ESP32-S3。

然后在 Discord 测试频道发送：

```text
galaku ping
```

期望回复：

```text
GALAKU <= PING
GALAKU => PONG
```

继续测试：

```text
galaku status
galaku scan
galaku services
galaku set 30
galaku hit 1.5
galaku stop
```

如果你的 Koishi 设置了全局命令前缀，例如 `/`、`.`、`!`，就在 Discord 里按该前缀发送：

```text
!galaku status
```

如果频道里机器人很多，也可以提及机器人后发送命令：

```text
@你的机器人 galaku status
```

可用别名：

```text
galaku status
galaku-esp32s3 status
gk status
```

`galaku raw <command>` 默认禁用。只有你明确打开 `allowRaw` 后才可用，例如：

```text
galaku raw STATUS
```

## 五、推荐测试顺序

1. 先不连 GALAKU 设备，只插 ESP32-S3，启动 PS1 桥。
2. 在 Discord 发 `galaku ping`，确认 Koishi -> TCP -> PS1 -> ESP32-S3 串口通。
3. 发 `galaku status`，看 ESP32-S3 当前 BLE 状态。
4. 打开 GALAKU 设备，确保手机 App 没占用 BLE 连接。
5. 发 `galaku scan`，让 ESP32-S3 扫描/连接目标设备。
6. 发 `galaku set 10` 做低强度测试。
7. 发 `galaku stop` 停止。
8. 确认稳定后再测试 `galaku hit 1.5` 这类动态命令。

## 六、常见问题

### 机器人在线但不响应 `galaku status`

检查：

- Discord Developer Portal 里是否打开了 `Message Content Intent`。
- Koishi Discord adapter 是否填了正确 Bot Token。
- 机器人是否有当前频道的 `View Channels` 和 `Send Messages` 权限。
- Koishi 是否设置了命令前缀；如果设置了，就要带前缀发送。

### 返回 `GALAKU 命令失败：connect ECONNREFUSED`

说明 Koishi 连不上 PS1 桥。

检查：

- PS1 桥脚本是否正在运行。
- 插件 `host` / `port` 是否正确。
- 本机部署时是否使用 `127.0.0.1:25363`。
- frp 部署时远端端口是否开放，frpc 是否在线。

### 返回超时

说明 TCP 连接可能建立了，但桥脚本没有在 `timeoutMs` 内返回。

检查：

- ESP32-S3 是否插好。
- `SerialPort` 是否是正确 COM 口。
- ESP32-S3 固件是否正在读 USB Serial/JTAG。
- PS1 桥窗口里是否有 `COM <=` 和 `COM =>` 日志。

### PS1 桥启动时报 COM 口错误

检查：

- 设备管理器里的实际 COM 口。
- 是否有 Arduino IDE、ESP-IDF monitor、串口助手占用了同一个 COM 口。
- 重新插拔 ESP32-S3 后 COM 口是否变化。

### Discord 里 `galaku set 200` 为什么变成 `SET 100`

插件会把 `SET` 强度限制在 ESP32-S3 固件接受的 `0..100` 范围内，超出范围会自动夹紧。

## 七、开发和 CI

这个仓库的开发策略是：本机只写代码，不在本机缓存 Node.js 依赖。

本仓库不要执行：

```text
npm init
npm install
npm run build
npm test
```

GitHub Actions 会在云端执行：

```text
npm install
npm run build
npm test
npm pack --dry-run
```

当前 workflow 在 Node.js 22 和 24 上构建测试。

## 八、发布到 npm 和 Koishi 插件市场

Koishi 插件市场主要收录 npm registry 上符合 Koishi 插件规则的公开包。当前项目已经满足关键前提：

- 包名是 `koishi-plugin-esp32-to-galaku`。
- `peerDependencies` 里声明了 `koishi`。
- `package.json` 里有 `koishi` 元数据。
- GitHub 仓库是公开仓库。
- GitHub Actions 能完成构建、测试和打包检查。
- npm registry 当前没有占用这个包名。

还缺的一步是：把包发布到 npm。

### 1. 创建 npm 账号

1. 打开 <https://www.npmjs.com/signup> 注册 npm 账号。
2. 登录后建议开启 2FA。
3. 进入 Access Tokens 页面创建 token。
4. token 类型建议选择可用于发布包的 Automation / Publish token。

### 2. 把 npm token 写入 GitHub Secrets

1. 打开 GitHub 仓库：<https://github.com/ra1nyxin/koishi-plugin-esp32-to-galaku>
2. 进入 `Settings` -> `Secrets and variables` -> `Actions`。
3. 点击 `New repository secret`。
4. 名称填：

```text
NPM_TOKEN
```

5. 值填刚才从 npm 创建的 token。

### 3. 手动触发发布 workflow

1. 打开 GitHub 仓库的 `Actions` 页面。
2. 选择 `Publish to npm` workflow。
3. 点击 `Run workflow`。
4. workflow 会执行：

```text
npm install
npm run build
npm test
npm pack --dry-run
npm publish --access public --provenance
```

发布成功后，npm 包地址会是：

```text
https://www.npmjs.com/package/koishi-plugin-esp32-to-galaku
```

### 4. 等待 Koishi 插件市场收录

发布到 npm 后，Koishi 插件市场通常会自动索引符合规则的包。不是 GitHub Actions 直接扫描 GitHub 仓库，而是 Koishi 市场侧扫描 npm 包。

如果发布后没有马上出现，先等一段时间，再检查：

- npm 包是否公开。
- 包名是否仍是 `koishi-plugin-esp32-to-galaku`。
- `peerDependencies.koishi` 是否存在。
- README 和 `package.json` 是否已随 npm 包发布。
- npm 页面是否能正常访问。

Tip：第一次发布建议保持版本 `0.1.0`，确认 npm 和 Koishi 市场链路通了，再按实际测试结果发 `0.1.1`、`0.2.0` 或 `1.0.0`。

## 九、参考文档

- Koishi 模板项目：<https://koishi.chat/zh-CN/manual/starter/boilerplate.html>
- Koishi Discord 适配器：<https://koishi.chat/zh-CN/plugins/adapter/discord.html>
- Koishi 插件发布：<https://koishi.chat/zh-CN/guide/develop/publish.html>
- Discord Developer Portal：<https://discord.com/developers/applications>
- Discord Gateway / Intents 文档：<https://discord.com/developers/docs/topics/gateway>
- npm 注册账号：<https://docs.npmjs.com/creating-a-new-npm-user-account>

Tip：第一次端到端测试时，先用 `galaku ping` 和 `galaku status` 验证链路，不要直接从高强度 `set` 或复杂 frp 场景开始。
