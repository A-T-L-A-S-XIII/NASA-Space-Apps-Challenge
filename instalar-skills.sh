#!/usr/bin/env bash
# Extrai as skills para .claude/skills/ (onde o Claude Code procura skills do projeto)
set -e
cd "$(dirname "$0")"
mkdir -p .claude/skills
for z in skills-zip/*.zip; do unzip -oq "$z" -d .claude/skills; done
echo "Skills instaladas:"; ls .claude/skills
