# ESP32-S3 GALAKU Bridge Firmware

这是用于 ESP32-S3 的 ESP-IDF 固件源码。它负责通过 BLE 连接 GALAKU/GK36 设备，并通过 ESP32-S3 USB Serial/JTAG 接收上位机命令。

链路：

```text
Koishi 插件
  -> tools/galaku-serial-bridge.ps1
  -> ESP32-S3 USB Serial/JTAG
  -> ESP32-S3 BLE
  -> GALAKU/GK36 设备
```

## 许可证

本目录固件源码使用 PolyForm Noncommercial License 1.0.0，见 [LICENSE](./LICENSE)。

仓库根目录的 Koishi 插件代码使用 MIT License。两个部分的许可证不同，二次分发或商用前请分别确认许可条件。

## 环境

- ESP32-S3 开发板
- ESP-IDF 5.5 或更新版本
- USB Serial/JTAG 可用
- 目标 BLE 设备广播名默认为 `GK36`

## 构建

在本目录打开 ESP-IDF 终端：

```powershell
idf.py set-target esp32s3
idf.py build
```

本仓库不会提交 `build/`、`sdkconfig`、`sdkconfig.old` 这类本机构建产物。`sdkconfig.defaults` 已包含本固件需要的基础配置。

## 烧录和监视

把 `COMx` 换成设备管理器里 ESP32-S3 的实际串口：

```powershell
idf.py -p COMx flash monitor
```

启动后串口会输出类似：

```text
GALAKU ESP32S3 bridge boot
Serial commands: PING, STATUS, SET <0-100>, HIT <damage>, STOP
```

## 串口命令

固件按行读取 USB Serial/JTAG 命令，命令以换行结束。

| 命令 | 说明 |
| --- | --- |
| `PING` | 返回 `PONG`，用于链路探活。 |
| `STATUS` | 返回 BLE、扫描、连接、服务发现、当前强度等状态。 |
| `SCAN` | 在未连接时触发扫描。 |
| `SERVICES` | 已连接时列出 BLE 服务。 |
| `SET <0-100>` | 直接设置强度，固件会限制在 `0..100`。 |
| `HIT <damage>` | 按伤害值叠加强度，适合聊天消息或游戏事件触发。 |
| `STOP` | 立即把强度设为 `0`。 |

## 和 PS1 桥配合

Windows 上插着 ESP32-S3 时，在仓库根目录启动：

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\tools\galaku-serial-bridge.ps1 `
  -SerialPort COMx `
  -Baud 115200 `
  -ListenPort 25363
```

默认只监听 `127.0.0.1`。如果确实需要让另一台机器访问桥，可以显式加 `-ListenAddress 0.0.0.0`，并用防火墙、frp 访问控制或内网隔离保护这个端口。

Tip：首次烧录后先用 `PING` 和 `STATUS` 验证 ESP32-S3 串口链路，再测试 `SET 10` 和 `STOP`。
