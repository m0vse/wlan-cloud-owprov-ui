#!/bin/ash
set -eu

ENV_CONFIG_PATH=/usr/share/nginx/html/env-config.js
staged=$(mktemp "${ENV_CONFIG_PATH}.XXXXXX")
trap 'rm -f "$staged"' EXIT HUP INT TERM
# Read the environment directly: values may contain spaces, quotes or newlines.
# This is public frontend configuration; never place credentials here.
awk '
function escaped(value, result, i, character) {
  result = ""
  for (i = 1; i <= length(value); i++) {
    character = substr(value, i, 1)
    if (character == "\\") result = result "\\\\"
    else if (character == "\"") result = result "\\\""
    else if (character == "\n") result = result "\\n"
    else if (character == "\r") result = result "\\r"
    else if (character == "\t") result = result "\\t"
    else if (character ~ /[[:cntrl:]]/) exit 1
    else result = result character
  }
  return result
}
BEGIN {
  print "window._env_ = {"
  for (name in ENVIRON)
    if (name ~ /^REACT_[A-Za-z0-9_]+$/)
      printf "  %s: \"%s\",\n", name, escaped(ENVIRON[name])
  print "};"
}' > "$staged"
chmod 644 "$staged"
mv "$staged" "$ENV_CONFIG_PATH"
