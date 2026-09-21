#!/usr/bin/env bash
#
# release.sh — единый релиз synapse-storage + homepage + examples.
#
# Версию НЕ бампает: берёт то, что уже проставлено в
# packages/synapse/package.json (её ты меняешь вручную перед запуском).
# Homepage-шапка читает эту же версию в build-time (packages/homepage/vite.config.ts),
# поэтому смысл скрипта — не дать сайту разойтись с опубликованным npm-релизом:
# сначала всё собирается и валидируется, и только потом происходят необратимые
# действия (npm publish + firebase deploy).
#
# Использование:
#   bash scripts/release.sh            # stable-релиз (npm publish --access public)
#   bash scripts/release.sh --beta     # beta-релиз  (npm publish --tag beta)
#   bash scripts/release.sh --yes      # без интерактивного подтверждения
#   bash scripts/release.sh --dry-run  # только Фаза 1 (валидация), без публикации/деплоя
#
# Флаги комбинируются: `bash scripts/release.sh --beta --yes`.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ── Параметры ────────────────────────────────────────────────────────────────
NPM_TAG="stable"      # stable | beta
ASSUME_YES=0
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --beta)    NPM_TAG="beta" ;;
    --stable)  NPM_TAG="stable" ;;
    --yes|-y)  ASSUME_YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    *) echo "Неизвестный аргумент: $arg" >&2; exit 2 ;;
  esac
done

# ── Хелперы ──────────────────────────────────────────────────────────────────
step()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
die()   { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

VERSION="$(node -p "require('$ROOT/packages/synapse/package.json').version")"

# ── План и подтверждение ─────────────────────────────────────────────────────
cat <<PLAN

  synapse-storage release
  ───────────────────────
  Версия (из packages/synapse/package.json): $VERSION
  npm-тег:                                   $NPM_TAG
  Режим:                                     $([ "$DRY_RUN" = 1 ] && echo 'DRY-RUN (только валидация)' || echo 'полный релиз')

  Фаза 1 — валидация (обратимо):
    1) тесты synapse (vitest)
    2) build synapse (dist)
    3) build examples (против свежего dist)
    4) build homepage (docs:generate + docs:llms + ssg + prerender)

  Фаза 2 — релиз (НЕОБРАТИМО):
    5) npm publish ($NPM_TAG)   ← prepublishOnly сам сделает fix+build
    6) firebase deploy homepage ← predeploy пересоберёт homepage с версией $VERSION

PLAN

if [ "$ASSUME_YES" != 1 ]; then
  read -r -p "Продолжить? [y/N] " reply
  case "$reply" in [yY]|[yY][eE][sS]) ;; *) die "Отменено." ;; esac
fi

# ── Прover-check npm-логина (до долгих сборок) ───────────────────────────────
if [ "$DRY_RUN" != 1 ]; then
  step "Проверка npm-аутентификации"
  # Не блокируем релиз по whoami: при токен-авторизации (_authToken в .npmrc)
  # whoami может отвечать 401, хотя `npm publish` при этом проходит. Источник
  # правды — сам publish на Фазе 5; здесь только мягкое предупреждение.
  if who="$(npm whoami 2>/dev/null)"; then
    ok "npm: $who"
  else
    printf '\033[1;33m● npm whoami не прошёл — если в .npmrc есть валидный _authToken, publish всё равно сработает. Если нет: npm login\033[0m\n'
  fi
fi

# ══ ФАЗА 1 — ВАЛИДАЦИЯ (обратимо) ════════════════════════════════════════════
step "1/6 Тесты synapse"
yarn workspace synapse-storage test
ok "тесты прошли"

step "2/6 Сборка synapse (dist)"
yarn workspace synapse-storage build
ok "dist собран"

step "3/6 Сборка examples (против свежего dist)"
yarn workspace examples build
ok "examples собраны"

step "4/6 Сборка homepage (docs + llms + ssg + prerender)"
# Полный build здесь — это валидационный гейт ДО публикации: ловит ошибки
# генерации доков/llms и пре-рендера прежде, чем что-либо уйдёт наружу.
# На Фазе 6 firebase predeploy соберёт homepage ещё раз (уже для деплоя).
yarn workspace synapse-homepage build
ok "homepage собран, llms/доки сгенерированы"

if [ "$DRY_RUN" = 1 ]; then
  printf '\n\033[1;33m● DRY-RUN: всё собралось. Публикация и деплой пропущены.\033[0m\n'
  exit 0
fi

# ══ ФАЗА 2 — РЕЛИЗ (НЕОБРАТИМО) ══════════════════════════════════════════════
# ВАЖНО про 2FA: на аккаунте включена двухфакторка, поэтому publish требует токен,
# обходящий 2FA. Интерактивный OTP тут не годится — код протухнет за время Фазы 1.
# Нужен Automation-токен (npmjs.com → Access Tokens → Classic → Automation) в ~/.npmrc:
#   //registry.npmjs.org/:_authToken=npm_XXXX
# Тогда publish проходит без запроса кода.
step "5/6 Публикация в npm (тег: $NPM_TAG)"
if [ "$NPM_TAG" = "beta" ]; then
  yarn workspace synapse-storage publish:beta
else
  yarn workspace synapse-storage publish:stable
fi
ok "synapse-storage@$VERSION опубликован ($NPM_TAG)"

step "6/6 Деплой homepage (firebase)"
yarn deploy:homepage
ok "homepage задеплоен с версией $VERSION"

printf '\n\033[1;32m✔ Готово: synapse-storage@%s (%s) опубликован, homepage синхронизирован.\033[0m\n' "$VERSION" "$NPM_TAG"
