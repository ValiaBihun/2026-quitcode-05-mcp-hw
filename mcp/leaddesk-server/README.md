# LeadDesk MCP server

Доменний stdio-сервер LeadDesk (Task A воркшопу 5). Замість SQL на всю базу він дає агенту два
бізнес-дієслова й один ресурс:

| Ім'я | Що робить | Анотації |
|---|---|---|
| `leaddesk_find_leads` | ліди за статусом (`new`, `contacted`, `qualified`, `won`, `lost` або `any`), найновіші першими; лише `id`, `company`, `status`, `source`, `budget`, `createdAt` і `total` | `readOnlyHint: true` |
| `leaddesk_set_lead_status` | змінює статус одного ліда й повертає запис аудиту `{ action, leadId, at, from, to, reason }` | `readOnlyHint: false` |
| `leaddesk://reference/statuses` | ресурс `text/markdown`: що кожен статус означає для команди, коли й хто переводить лід | — |

Дані — `fixtures/leads.json`, незмінна копія `materials/leads.json` (20 синтетичних лідів
`lead_0001`–`lead_0020`). Сервер читає файл один раз, а зміни статусів і аудит тримає лише в
пам'яті процесу. Файл він не переписує, тож після перезапуску дані знову ті самі.

## Запуск

Потрібен Node.js ≥ 22.19. З цієї теки:

```bash
npm ci                 # рівно те, що в package-lock.json
node src/server.mjs    # stdio: сервер чекає на клієнта MCP, сам нічого не друкує в stdout
```

| Змінна оточення | Що робить |
|---|---|
| `LEADDESK_FIXTURE` | шлях до іншої копії лідів; без неї — `fixtures/leads.json` поруч із модулем |

Секретів сервер не потребує. Журнал іде лише в stderr і без персональних даних.

| Файл | Що в ньому |
|---|---|
| `src/leaddesk.mjs` | дані, два інструменти й ресурс; експортує `factory` |
| `src/server.mjs` | точка входу stdio: `serveStdio(factory)` |
| `src/http.mjs` | бонус E1: та сама `factory` по HTTP на `127.0.0.1:3333`, гварди Host і Origin |

## HTTP-режим (бонус E1)

```bash
npm run start:http    # http://127.0.0.1:3333/mcp
```

Сервер слухає **лише `127.0.0.1`** (порт можна змінити змінною `LEADDESK_HTTP_PORT`) і не має автентифікації: його не
можна виставляти назовні. Гварди `localhostHostValidation()` і `localhostOriginValidation()` з
`@modelcontextprotocol/node` викликаються в обробнику запиту **вручну**, перед MCP-обробником: підроблений `Host` або
`Origin` отримує `403`. Передати їх опцією в `toNodeHandler` не можна: опцій для цього там немає. Для цього режиму в
`package.json` додано `@modelcontextprotocol/node` точною версією `2.1.0`. Чотири відповіді `curl`, які це доводять
(200, 403, 403, 400), — у `docs/mcp/verification.md`, розділ «Task E». До Claude Code цей режим не підключають: у Task C
використано stdio.

## Перевірка Inspector'ом

Git Bash, з кореня репозиторію. Кожен виклик запускає сервер заново, тож `lead_0002` щоразу має
статус `new`.

```bash
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs --method tools/list
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method tools/call --tool-name leaddesk_find_leads --tool-arg status=qualified
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method tools/call --tool-name leaddesk_set_lead_status \
  --tool-arg leadId=lead_0002 --tool-arg status=contacted --tool-arg "reason=перевірка в Inspector"
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method resources/read --uri leaddesk://reference/statuses
```

Невалідний вхід, невідомий лід і той самий статус повертають `isError: true`; Inspector тоді
завершується з кодом 5. Збережені виводи лежать у `docs/mcp/*.json`.

## Підключення до Claude Code

Скоуп `local` (за замовчуванням): шлях до сервера потрапляє в `~/.claude.json`, у git нічого.
Git Bash, з кореня репозиторію (у macOS/Linux — `REPO="$(pwd)"`):

```bash
REPO="$(pwd -W)"
claude mcp add leaddesk -- node "$REPO/mcp/leaddesk-server/src/server.mjs"
```

Далі `/mcp` має показати `leaddesk` із двома інструментами. Кожен виклик `leaddesk_set_lead_status`
схвалюйте вручну: запит на схвалення має вигляд «змінити статус lead_0002 на contacted, причина …».
