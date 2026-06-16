import { execSync } from "node:child_process";

/** CI 环境跳过 vue-tsc，加快 release 构建；本地仍做全量类型检查。 */
const cmd = process.env.CI ? "vite build" : "vue-tsc --noEmit && vite build";

execSync(cmd, { stdio: "inherit", shell: true });
