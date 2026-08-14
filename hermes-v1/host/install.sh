#!/usr/bin/env bash
# Hermes 0.20 产品层安装：写角色档案 + 群聊路由。默认不重启 gateway。
# 不绑机器 IP，不写入密钥。模型 key 仍用各 profile 自己的 .env。
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: install.sh [--restart] [--hermes-home DIR]

  HERMES_HOME  默认 ~/.hermes（可用环境变量或 --hermes-home 覆盖）
  --restart    写完文件后再 hermes gateway restart（需要窗口时才用）

只写文件；现有主机、青岛不动。
EOF
}

RESTART=0
HERMES_HOME="${HERMES_HOME:-${HOME}/.hermes}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --restart) RESTART=1; shift ;;
    --hermes-home)
      HERMES_HOME="${2:?--hermes-home requires a directory}"
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export HERMES_HOME
mkdir -p "${HERMES_HOME}"

if ! command -v hermes >/dev/null 2>&1; then
  echo "hermes not found in PATH; cannot create profiles" >&2
  exit 1
fi

# --clone 继承本机已有 .env/模型；失败则退回空白 profile。
create_profile() {
  local name="$1"
  local desc="$2"
  local dest="${HERMES_HOME}/profiles/${name}"
  if [[ -d "${dest}" ]]; then
    echo "profile exists: ${name}"
    hermes profile describe "${name}" "${desc}" >/dev/null 2>&1 || \
      echo "note: could not refresh description for ${name}" >&2
    return 0
  fi
  if hermes profile create "${name}" --description "${desc}" --clone; then
    echo "created profile (cloned): ${name}"
  elif hermes profile create "${name}" --description "${desc}"; then
    echo "created profile: ${name}"
  else
    echo "failed to create profile: ${name}" >&2
    return 1
  fi
}

copy_soul() {
  local src="$1"
  local dest="$2"
  mkdir -p "$(dirname "${dest}")"
  cp -a "${src}" "${dest}"
  echo "copied SOUL -> ${dest}"
}

merge_with_python() {
  local dest="$1"
  local overlay="$2"
  python3 -c '
import sys
from pathlib import Path
import yaml

dest = Path(sys.argv[1])
overlay = Path(sys.argv[2])

def load(p):
    data = yaml.safe_load(p.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}

def merge(base, over):
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            merge(base[k], v)
        else:
            base[k] = v
    return base

base = load(dest)
over = load(overlay)
merge(base, over)
dest.write_text(yaml.safe_dump(base, allow_unicode=True, sort_keys=False), encoding="utf-8")
' "${dest}" "${overlay}"
}

hermes_config_fallback() {
  local dest="$1"
  local overlay="$2"
  local profile="${3:-}"
  local -a cmd=(hermes)
  if [[ -n "${profile}" ]]; then
    cmd+=(-p "${profile}")
  fi
  echo "PyYAML not found; falling back to hermes config set for ${dest}" >&2
  if grep -q "multiplex_profiles" "${overlay}"; then
    "${cmd[@]}" config set gateway.multiplex_profiles true || true
  fi
  if grep -q "dispatch_in_gateway" "${overlay}"; then
    "${cmd[@]}" config set kanban.dispatch_in_gateway true || true
  fi
  if grep -q "orchestrator_profile" "${overlay}"; then
    "${cmd[@]}" config set kanban.orchestrator_profile default || true
  fi
  if grep -q "auto_decompose" "${overlay}"; then
    "${cmd[@]}" config set kanban.auto_decompose false || true
  fi
  if grep -q "auto_subscribe_on_create" "${overlay}"; then
    "${cmd[@]}" config set kanban.auto_subscribe_on_create true || true
  fi
  if grep -q "^toolsets:" "${overlay}"; then
    "${cmd[@]}" config set toolsets '["hermes-cli","kanban"]' || true
  fi
}

# Deep-merge overlay YAML into dest config.yaml. Prefers PyYAML; else hermes config set.
merge_yaml() {
  local dest="$1"
  local overlay="$2"
  local profile="${3:-}"
  if [[ ! -f "${overlay}" ]]; then
    echo "missing overlay: ${overlay}" >&2
    return 1
  fi
  mkdir -p "$(dirname "${dest}")"
  if [[ ! -f "${dest}" ]]; then
    printf '%s\n' '{}' > "${dest}"
  fi
  if python3 -c "import yaml" >/dev/null 2>&1; then
    merge_with_python "${dest}" "${overlay}"
    echo "merged ${overlay} -> ${dest}"
  else
    hermes_config_fallback "${dest}" "${overlay}" "${profile}"
  fi
}

install_role() {
  local name="$1"
  local dest_home="$2"
  local profile_flag="${3:-}"
  local role_dir="${ROOT}/roles/${name}"
  mkdir -p "${dest_home}"
  copy_soul "${role_dir}/SOUL.md" "${dest_home}/SOUL.md"
  if [[ -f "${role_dir}/config.yaml" ]]; then
    merge_yaml "${dest_home}/config.yaml" "${role_dir}/config.yaml" "${profile_flag}"
  fi
  if [[ -f "${role_dir}/distribution.yaml" ]]; then
    cp -a "${role_dir}/distribution.yaml" "${dest_home}/distribution.yaml"
  fi
  if [[ -d "${role_dir}/skills" ]]; then
    mkdir -p "${dest_home}/skills"
    cp -a "${role_dir}/skills/." "${dest_home}/skills/"
    echo "copied skills -> ${dest_home}/skills"
  fi
}

echo "HERMES_HOME=${HERMES_HOME}"
echo "ROOT=${ROOT}"

create_profile pm "产品经理。需求、范围、验收标准与优先级。"
create_profile architect "系统架构师。系统边界、接口、数据与演进。"
create_profile fullstack "全栈工程师。实现前后端、接口与集成。"
create_profile tester "测试工程师。用例、回归、缺陷与验收证据。"
create_profile ops "运维工程师。部署、观测、备份与运行手册。"
create_profile figma "Figma ui设计。界面结构、组件与交付标注。"

# default / 路由：备份现有 SOUL，再写入产品层入口身份
if [[ -f "${HERMES_HOME}/SOUL.md" ]]; then
  cp -a "${HERMES_HOME}/SOUL.md" "${HERMES_HOME}/SOUL.md.v1bak"
  echo "backed up ${HERMES_HOME}/SOUL.md -> SOUL.md.v1bak"
fi
install_role router "${HERMES_HOME}" ""
merge_yaml "${HERMES_HOME}/config.yaml" "${ROOT}/host/gateway-snippet.yaml" ""

install_role pm "${HERMES_HOME}/profiles/pm" pm
install_role architect "${HERMES_HOME}/profiles/architect" architect
install_role fullstack "${HERMES_HOME}/profiles/fullstack" fullstack
install_role tester "${HERMES_HOME}/profiles/tester" tester
install_role ops "${HERMES_HOME}/profiles/ops" ops
install_role figma "${HERMES_HOME}/profiles/figma" figma

echo "install complete (files only)."
if [[ "${RESTART}" -eq 1 ]]; then
  echo "restarting gateway..."
  hermes gateway restart
else
  echo "gateway not restarted. After confirming, run: $0 --restart"
fi
