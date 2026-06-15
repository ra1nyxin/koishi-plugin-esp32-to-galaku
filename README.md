# koishi-plugin-esp32-to-galaku

Koishi plugin that sends bot commands to an ESP32-S3 GALAKU bridge through a PowerShell TCP-to-serial bridge.

The chain is:

```text
Koishi command -> TCP bridge -> PowerShell/.NET SerialPort -> ESP32-S3 USB Serial/JTAG -> GALAKU BLE device
```

This repository intentionally avoids direct COM access from Koishi. The PowerShell bridge owns the serial port so Node.js does not repeatedly open the ESP32-S3 USB Serial/JTAG device.

## Commands

Register the plugin in Koishi, then use:

```text
galaku status
galaku ping
galaku scan
galaku services
galaku set 30
galaku hit 1.5
galaku stop
galaku bridge
```

`galaku raw <command>` is available only when `allowRaw` is enabled in plugin config.

## Plugin Config

| Field | Default | Meaning |
| --- | --- | --- |
| `host` | `127.0.0.1` | TCP bridge host. |
| `port` | `25363` | TCP bridge port. |
| `timeoutMs` | `3500` | Timeout for one command round trip. |
| `maxReplyBytes` | `4096` | Maximum TCP reply size read by the plugin. |
| `allowRaw` | `false` | Enables `galaku raw <command>`. |

## PowerShell Bridge

Start the bridge on the Windows machine that has the ESP32-S3 COM port:

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\tools\galaku-serial-bridge.ps1 `
  -SerialPort COM3 `
  -Baud 115200 `
  -ListenPort 25363
```

The bridge accepts one ASCII command per line. It forwards the line to the ESP32-S3 and writes the ESP32-S3 serial reply back to the TCP client.

Supported ESP32-S3 commands in the current firmware are:

```text
PING
STATUS
SCAN
SERVICES
SET <0-100>
HIT <damage>
STOP
```

For FRP or other remote access, expose the TCP bridge only through an authenticated or access-controlled tunnel. The plugin treats the bridge as a trusted control endpoint.

## Development Workflow

Do not run `npm init`, `npm install`, `npm run build`, or tests locally if disk space is tight. This repository is set up so GitHub Actions installs dependencies, builds TypeScript, runs tests, and checks package contents.

Local editing only needs source files:

```text
src/
tools/
test/
.github/workflows/
```

GitHub Actions runs:

```text
npm install
npm run build
npm test
npm pack --dry-run
```

## Koishi Notes

The package name starts with `koishi-plugin-` and `peerDependencies` includes `koishi`, matching Koishi plugin marketplace expectations.

The plugin can be used with the Discord adapter like any other Koishi plugin. The Discord adapter itself is configured in the Koishi app; this package only registers the `galaku` command.
