# Перевірка (Task A, Task B, бонус E)

- **Інструмент і версія, модель:** Claude Code: застосунок Claude для Windows (вкладка Code) 2.1.288 і CLI 2.1.296.
  Сервер Task A і документи писались у сесії застосунку (Opus 5.5, далі Sonnet 5.5); у всіх сесіях Task B із серверами
  (міграція, лог Vercel, знімки «до» і «після», обидві перевірки форми) відповідала модель Sonnet 5.5
  (`claude-sonnet-5-5`, за журналами сесій).
- **ОС і термінал, Node:** Windows 10 Pro 19045 · Git Bash · Node 24.21.0 · Inspector `@modelcontextprotocol/inspector@2.8.0`

## Task A — сервер в Inspector

- **Команди, якими зроблено чотири файли в `docs/mcp/`:** як у walkthrough (Task A, крок 4), Git Bash, з кореня
  репозиторію, без змін:

  ```bash
  npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
    --method tools/list > docs/mcp/tools-list.json                                   # exit=0
  npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
    --method tools/call --tool-name leaddesk_set_lead_status \
    --tool-arg leadId=lead_0002 --tool-arg status=contacted --tool-arg "reason=перевірка в Inspector" > docs/mcp/set-status.json   # exit=0
  npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
    --method tools/call --tool-name leaddesk_set_lead_status \
    --tool-arg leadId=nope --tool-arg status=won --tool-arg reason=ok > docs/mcp/bad-input.json   # exit=5
  npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
    --method resources/read --uri leaddesk://reference/statuses > docs/mcp/resource-read.json    # exit=0
  ```

- **`tools-list.json`:** рівно два інструменти.
  - `leaddesk_find_leads` — `{"readOnlyHint":true,"openWorldHint":false}`.
  - `leaddesk_set_lead_status` — `{"readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}`.
  - Кожен із п'яти параметрів має `description` з `.describe(…)`: модель бачить формат (`lead_0002`), допустимі
    статуси, межі `limit` (1–50, за замовчуванням 10) і те, що `reason` потрапляє в аудит.
  - Опис `leaddesk_set_lead_status` починається з «ЗМІНЮЄ ДАНІ» і вимагає показати людині лід, старий і новий
    статус та причину до виклику.
- **`bad-input.json`:** зламано два аргументи — `leadId=nope` (не проходить `^lead_\d{4}$`) і `reason=ok` (коротше
  3 символів). Результат — `"isError": true` з текстом `Input validation error: Invalid arguments for tool
  leaddesk_set_lead_status: leadId: Invalid string: must match pattern /^lead_\d{4}$/, reason: Too small: expected
  string to have >=3 characters`. Inspector завершився з кодом **5** і надрукував у stderr
  `{"error":{"code":"tool_is_error",…}}`.
- **`set-status.json`:** `lead_0002` (Rynok Books) `new` → `contacted`. Запис аудиту в `structuredContent.audit`:
  `{ "action": "lead.status_changed", "leadId": "lead_0002", "at": "2026-10-04T20:18:00.445Z", "from": "new",
  "to": "contacted", "reason": "перевірка в Inspector" }`. Поруч `structuredContent.lead` з новим станом ліда
  (лише `id`, `company`, `status`, `source`, `budget`, `createdAt`).
- **`resource-read.json`:** `leaddesk://reference/statuses`, `"mimeType": "text/markdown"`: таблиця п'яти статусів —
  що означає, коли переводимо, хто переводить.
- **Додатково перевірено Inspector'ом, у файли не збережено:**
  - невідомий лід у правильному форматі (`lead_9999`) → `isError: true` з підказкою знайти ідентифікатор через
    `leaddesk_find_leads`, exit=5;
  - той самий статус (`lead_0002` → `new`) → `isError: true`, exit=5;
  - `limit=0` → помилка валідації;
  - відповіді `leaddesk_find_leads` збігаються з ключем у `materials/ab-prompts.md`: qualified — 3 ліди
    (`lead_0001`, `lead_0013`, `lead_0015`); 5 найновіших new — `lead_0002`, `lead_0005`, `lead_0004`, `lead_0018`,
    `lead_0012`; won — 5 лідів, сума бюджетів 9000, `lead_0006` без бюджету.
- **Самоперевірки з walkthrough:** `grep -c '"isError": true' docs/mcp/bad-input.json` → 1; у `set-status.json` є
  `"action"`, `"at"`, `"leadId"`; `grep -rc 'console\.log' mcp/leaddesk-server/src` → 0 в обох файлах;
  `cmp materials/leads.json mcp/leaddesk-server/fixtures/leads.json` → однакові; `npm run lint` → без помилок.
- **Що було найважче в описах інструментів і параметрів:**
  - **Рахувати, не віддаючи зайвого.** На «скільки лідів у статусі X» модель без підказки просила б `limit=50` і
    рахувала б рядки. Тому `leaddesk_find_leads` повертає `total` поруч із `returned`, і опис `limit` про це каже.
    Перевірено: на `status=new`, `limit=5` відповідь — «Лідів зі статусом new: 6; показано 5».
  - **Запис має виглядати як запис.** `readOnlyHint: false` — лише підказка клієнту, сервер нею нічого не
    забороняє. Тому опис `leaddesk_set_lead_status` починається з «ЗМІНЮЄ ДАНІ», а `reason` обов'язковий: його
    видно в аргументах запиту на схвалення, і він потрапляє в аудит. Як саме Claude Code покаже цей запит людині,
    перевіряємо в Task C.
  - **Помилки мають два рівні.** Неправильний формат (`nope`) відсікає ще валідація SDK, до обробника. Модель
    отримує англійський текст з регулярним виразом `/^lead_\d{4}$/`, але без підказки, де взяти правильний
    ідентифікатор, тому приклад `lead_0002` і посилання на `leaddesk_find_leads` стоять в описі самого параметра.
    Правильний формат, але неіснуючий лід (`lead_9999`) доходить до обробника й отримує нашу підказку
    українською. У `bad-input.json` видно, що валідація повертає всі помилки одразу: і `leadId`, і `reason`.
  - **Ні тихих «успіхів», ні тихих значень за замовчуванням.** Той самий статус дає `isError`, а не «успішну»
    зміну, яка нічого не змінила. У `leaddesk_find_leads` поле `status` обов'язкове: «усі ліди» модель просить
    явно через `any`, а не отримує їх випадково, коли забула параметр.
  - **Опис читає модель, аргументи — людина.** Модель вирішує, що викликати, за `description` і схемами з
    `tools-list.json`. Людина в запиті на схвалення насамперед читає назву інструмента й аргументи, тож усе, що
    треба зрозуміти за секунду (який лід, який статус, чому), — це аргументи `leadId`, `status`, `reason`, а не
    абзац опису. Task C це підтвердив: запит на схвалення `leaddesk_set_lead_status` показує назву інструмента, аргументи
    (`leadId`, `status`, `reason`) і початок опису («ЗМІНЮЄ ДАНІ: …»), тоді як у прогоні A той самий запис був би
    сирим SQL у `Execute SQL` (див. `docs/mcp/ab-generic-vs-domain.md`).

## Task B — що зробили агенти з серверами

Факти нижче перевірено за журналами сесій на диску (назви інструментів, лічильники, початки SQL), а не за переказом
агентів. Окремо відзначено, що журнал не фіксує (наприклад, самі кліки схвалення).

- **Supabase:** агент викликав `apply_migration` ×1 (`0001_leaddesk`) і `execute_sql` ×2. SQL міграції збігається з
  `supabase/migrations/0001_leaddesk.sql` оператор за оператором (прибрано лише коментарі `--`). Перший `execute_sql` —
  один `insert` з усіма 20 рядками, значення дослівно збігаються з `supabase/seed/leads.sql`; другий —
  `select count(*) from public.leads` (20). Відхилень немає. Сесія працювала в режимі `default`, «Always allow» не
  обирали (у `.claude/settings.local.json` немає правил). Що кожен виклик показав запит на схвалення і що саме
  натискалось, журнал не фіксує. Окрема перевірка в SQL Editor: 20 рядків, за статусами 6/4/3/5/2, сума `budget` у
  won 9000, три ліди без `budget`, `lead_0001`–`lead_0020`. Сервер показує 9 інструментів.
- **Vercel:** деплой зроблено в дашборді через git-інтеграцію (форк, гілка `main`, налаштування за замовчуванням, без
  змінних оточення); білд успішний. MCP `list_deployments` чотири рази повернув 403 (двічі конектор claude.ai і двічі
  project `vercel`; другу пару викликали за проханням «перевір ще раз», без нового входу). `get_deployment_build_logs`
  не викликали: на сервері такого інструмента зараз немає. Лог отримано **не через MCP, а через CLI**: агент
  запропонував CLI-фолбек (так само радить інструкція сервера Vercel), користувачка дозволила («так, дозволяю npx
  vercel»), і агент через Bash виконав `npx --yes vercel list` (вхід CLI через device flow) та `vercel inspect … --logs`;
  `vercel logout` він виконав за окремим проханням користувачки. У `vercel-build-log.txt` повний вивід
  `vercel inspect --logs` (77 рядків; прибрано лише назву скоупу, URL деплою й автора, а логін власника репозиторію в рядку клонування замінено на `[owner]`): білд 51 с, помилок немає, лише
  попередження npm про застарілі пакети й `unrs-resolver`, усі маршрути зібралися, статус Ready.
- **Playwright:** чиста сесія (CLI 2.1.296, лише `playwright`, 16:39) — `browser_navigate`, `browser_snapshot`,
  `browser_fill_form`, `browser_click`, `browser_snapshot`, `browser_console_messages`, `browser_network_requests`;
  7 викликів, усі успішні, `Bash` не викликали. Форма відправилась («Дякуємо! Заявку отримано.»). Консоль: два
  інформаційні повідомлення, помилок немає. Мережа: єдиний показаний запит — `POST http://localhost:3000/` зі статусом
  200; ще 22 статичні запити інструмент не показав, тож твердження «лише `localhost`» стосується показаного запиту,
  консолі й знімків, а не всього переліку (HTML сторінки містить 18 ресурсів, усі з відносними адресами). Деталі, перша (замінена) спроба й прибирання — у
  `docs/mcp/evidence/playwright-form-check.md`. Перелік інструментів: 25 до `deny`, 21 після (зникли
  `browser_run_code_unsafe`, `browser_file_upload`, `browser_drop`, `browser_evaluate`); `/mcp` при цьому показує 25,
  тож «до/після» береться зі слів агента, а не з лічильника.
- Що агент зробив сам, без прохання:
  - Supabase: об'єднав 20 insert-ів в один запит і прибрав коментарі з SQL міграції (вміст не змінився).
  - Vercel: на прохання знайти останній деплой агент першими викликами пішов не в project-сервер, а в конектор claude.ai
    (`list_teams`, `list_projects`, потім `list_deployments`); результати лежать лише в локальному журналі сесії, у
    репозиторій не потрапили. CLI-фолбек запропонував сам, але `npx` виконано за дозволом користувачки, а `logout` — за
    її проханням.
  - Playwright (перша спроба): запустив `npm run dev` через Bash, а зупинивши його `TaskStop`, написав «stopped»; процес
    `node` лишився й слухав порт 3000, тож зупиняти довелося окремо. Результат дії агента треба перевіряти.
- **Відхилення від плану:** чотири сесії Task B (міграція, лог білду, знімок «до», перша перевірка форми) не були
  чистими. Три з них відбулись у чатах застосунку, де одночасно доступні вбудований браузер, Claude in Chrome і
  конектори claude.ai; у четвертій поряд із `playwright` лишились увімкненими `supabase` і `vercel`. Правило «браузер
  ніколи разом із Supabase» порушено за конфігурацією в усіх чотирьох сесіях, а в четвертій ще й за викликами:
  `playwright` відправив форму, поки `supabase` був увімкнений (викликів Supabase там не було). Перевірку форми повторили в чистій
  CLI-сесії, а знімок «після» зроблено в чистій сесії одразу. Подробиці й таблиця сесій — у
  `docs/mcp/connections.md`.

## Task E (бонус)

- **Варіант:** E1 — HTTP-версія сервера LeadDesk із захистом Host і Origin.
- **Що зроблено:** `mcp/leaddesk-server/src/http.mjs` перевикористовує ту саму `factory` з `src/leaddesk.mjs`, що й stdio
  (`server.mjs` не змінювався). До `mcp/leaddesk-server/package.json` додано `"@modelcontextprotocol/node": "2.1.0"` точною
  версією (дозволений виняток для E1) і скрипт `start:http`. У `package-lock.json` нові лише `@modelcontextprotocol/node`,
  `@modelcontextprotocol/core`, `hono` і `@hono/node-server`; `@modelcontextprotocol/sdk` не з'явився. Кореневі
  `package.json` і `package-lock.json` не змінені.
- **Як влаштовано:** `createMcpHandler(factory)` з `@modelcontextprotocol/server` загорнуто в `toNodeHandler` з
  `@modelcontextprotocol/node` (`src/http.mjs:18`). Гварди `localhostHostValidation()` і `localhostOriginValidation()` створено
  в рядках 21–22 і **викликано в обробнику запиту** перед `await mcp(req, res)` (рядки 25–27): кожен гвард сам відповідає `403`
  і повертає `false`. Сервер слухає лише `127.0.0.1` (рядок 15, `listen` у рядку 35); `netstat` показав
  `127.0.0.1:3333 LISTENING`. Журнал іде в stderr (`console.error`).
- **Пастка з walkthrough, перевірена за типами:** `ToNodeHandlerOptions` у `@modelcontextprotocol/node` має лише `onerror` і
  `maxRequestBodySize`, тож гварди опцією передати не можна. Експеримент із передачею опції ми **не проводили**: висновок
  зроблено за декларацією типів.
- **Докази — чотири відповіді `curl`** (Git Bash; сервер запущено командою `node src/http.mjs`, тіло запиту `body.json` лежало
  в тимчасовій теці поза репозиторієм і не комітиться):

  ```bash
  printf '%s' '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}' > body.json
  H=(-H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "MCP-Protocol-Version: 2026-07-28" -H "Mcp-Method: tools/list")

  curl -s -w '\nHTTP %{http_code}\n' "${H[@]}" --data-binary @body.json http://127.0.0.1:3333/mcp
  curl -s -w '\nHTTP %{http_code}\n' "${H[@]}" -H "Host: evil.example" --data-binary @body.json http://127.0.0.1:3333/mcp
  curl -s -w '\nHTTP %{http_code}\n' "${H[@]}" -H "Origin: https://evil.example" --data-binary @body.json http://127.0.0.1:3333/mcp
  curl -s -w '\nHTTP %{http_code}\n' -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Mcp-Method: tools/list" --data-binary @body.json http://127.0.0.1:3333/mcp
  ```

  Повний сирий вивід чотирьох запитів (`curl -s -i`: статус-рядок, заголовки й тіло без скорочень) лежить у
  `docs/mcp/evidence/e1-curl-raw.txt`. Його знято повторно 13.10.2026 з того самого `src/http.mjs` (без змін після
  першої перевірки), бо в першому прогоні відповіді зберегли лише у вигляді таблиці. Таблиця нижче — стислий підсумок:
  у ній тіло 200 і поле `data` відповіді 400 скорочено.

  | # | Запит | Відповідь |
  |---|---|---|
  | 1 | звичайний | `HTTP 200`, `{"result":{"tools":[…` — два інструменти: `leaddesk_find_leads` (`readOnlyHint: true`) і `leaddesk_set_lead_status` (`readOnlyHint: false`) |
  | 2 | `Host: evil.example` | `HTTP 403`, `{"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Host: evil.example"},"id":null}` |
  | 3 | `Origin: https://evil.example` | `HTTP 403`, `{"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Origin: evil.example"},"id":null}` |
  | 4 | без `MCP-Protocol-Version` | `HTTP 400`, `{"jsonrpc":"2.0","error":{"code":-32020,"message":"Bad Request: the request headers and body disagree: the body envelope names protocol version 2026-07-28 but the required MCP-Protocol-Version header is absent", …},"id":1}` |

- **Що це доводить, а що ні:** відповіді 2 і 3 дає гвард до MCP-обробника (у тілі стандартна помилка `-32000`, а не відповідь
  протоколу), відповідь 4 дає вже сам MCP-обробник (код `-32020`). Гварди захищають від DNS rebinding і від викликів з чужих
  веб-сторінок у браузері; від іншого локального процесу вони не захищають: автентифікації в сервері немає.
- **Регресія stdio:** після змін Inspector видає `tools-list.json`, `bad-input.json` і `resource-read.json`, байт у байт
  ідентичні закомітеним; `set-status.json` відрізняється лише часовими мітками.
- **Прибирання:** тестовий сервер зупинено, порт 3333 вільний (перевірено `netstat`, процесів `http.mjs` немає).
