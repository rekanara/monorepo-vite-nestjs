import { Controller, Get, Header } from "@nestjs/common"
import { Public } from "../../common/auth-public.decorator"

const line = (name: string, value: number, help: string) =>
  `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${value}`

@Public()
@Controller("metrics")
export class MetricsController {
  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  metrics() {
    const mem = process.memoryUsage()
    const cpu = process.cpuUsage()
    return [
      line(
        "nodejs_uptime_seconds",
        process.uptime(),
        "Node.js process uptime."
      ),
      line(
        "nodejs_memory_rss_bytes",
        mem.rss,
        "Resident set size memory in bytes."
      ),
      line(
        "nodejs_heap_used_bytes",
        mem.heapUsed,
        "Used V8 heap memory in bytes."
      ),
      line(
        "nodejs_cpu_user_seconds_total",
        cpu.user / 1_000_000,
        "Total user CPU time in seconds."
      ),
      line(
        "nodejs_cpu_system_seconds_total",
        cpu.system / 1_000_000,
        "Total system CPU time in seconds."
      ),
    ].join("\n")
  }
}
