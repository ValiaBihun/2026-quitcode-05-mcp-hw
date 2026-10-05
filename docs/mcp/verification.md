# Перевірка (Task A, Task B, бонус E)

- **Інструмент і версія, модель:** Claude Code (застосунок Claude для Windows, вкладка Code) · Claude Opus 5.5
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
    абзац опису. Що саме показує Claude Code у запиті, записуємо в Task C.

## Task B — що зробили агенти з серверами

- **Supabase:** <які інструменти викликав агент для міграції й сиду; що ви схвалили вручну; чи щось відхилили>
- **Vercel:** <як задеплоїли (git-інтеграція); яким інструментом отримали лог; що в ньому>
- **Playwright:** <ланцюжок інструментів; чи відправилась форма; що в консолі й мережі>
- Що агент зробив сам, без прохання (наприклад, викликав інструмент, який ви не очікували): <… / нічого>

## Task E (бонус)

- Варіант: E1 HTTP-сервер
- <команди, виводи, спостереження — див. walkthrough, Task E>
