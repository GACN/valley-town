#!/data/data/com.termux/files/usr/bin/bash
# 《宫阙疑云：第七码》：打印当前可用地址；服务没跑就起来（可反复执行）
cd "$(dirname "$0")" || exit 1
PORT="${1:-8123}"
show() {
  echo "──────────────────────────────────────────────"
  echo " 宫阙疑云：第七码"
  echo " 本机     http://127.0.0.1:${PORT}/"
  for ip in $(ifconfig 2>/dev/null | awk '/inet /{print $2}' | grep -v '^127\.'); do
    echo " 局域网   http://${ip}:${PORT}/"
  done
  echo " 低画质   ?q=low　　自检页 /diag.html"
  echo "──────────────────────────────────────────────"
}
if curl -s -m 2 -o /dev/null "http://127.0.0.1:${PORT}/index.html"; then
  echo "服务已在运行。"
  show
  exit 0
fi
show
exec python3 serve.py "$PORT"
