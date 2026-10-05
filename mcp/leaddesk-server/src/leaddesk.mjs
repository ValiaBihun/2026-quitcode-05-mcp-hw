// LeadDesk as MCP tools: two business verbs instead of SQL on the whole database (Workshop 5, Task A).
// The factory is shared by every transport: server.mjs (stdio) and, for the bonus, http.mjs.
//
// Data: fixtures/leads.json (a copy of materials/leads.json, 20 synthetic leads), read once.
// Status changes and audit entries live only in this process's memory; the file is never written.
// Logs go to stderr only, without personal data: in a stdio server stdout is the protocol channel.
import { McpServer } from "@modelcontextprotocol/server";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Resolved from this module, not from the working directory: Claude Code starts the server from elsewhere.
const FIXTURE = process.env.LEADDESK_FIXTURE ?? fileURLToPath(new URL("../fixtures/leads.json", import.meta.url));

// The app's vocabulary, copied because a .mjs module cannot import TypeScript:
// LEAD_STATUSES in lib/types.ts and the id format of leadId() in lib/db.ts.
const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"];
const LEAD_ID = /^lead_\d{4}$/;

// Module-level state, so every server instance of this process sees the same leads and audit log.
const leads = new Map(JSON.parse(await readFile(FIXTURE, "utf8")).map((lead) => [lead.id, { ...lead }]));
const auditLog = [];

// Only what the two verbs need: no name, e-mail or message text.
const publicView = ({ id, company, status, source, budget, createdAt }) => ({ id, company, status, source, budget, createdAt });

const describeLead = (l) =>
  `- ${l.id} · ${l.company} · ${l.status} · ${l.source} · ${l.budget === null ? "без бюджету" : `бюджет ${l.budget}`} · ${l.createdAt.slice(0, 10)}`;

const fail = (text) => ({ isError: true, content: [{ type: "text", text }] });

const STATUSES_MD = `# Статуси лідів LeadDesk

Що означає кожен статус для команди Studio Nova. Звичайний шлях ліда: \`new\` → \`contacted\` →
\`qualified\` → \`won\` або \`lost\`. Статус змінюється лише інструментом \`leaddesk_set_lead_status\`, з
причиною, і кожна зміна потрапляє в аудит.

| Статус | Що означає | Коли переводимо | Хто переводить |
|---|---|---|---|
| \`new\` | Заявка надійшла з сайту, реклами чи вебінару; з клієнтом ще ніхто не говорив | Ставиться сам, коли заявка надходить | Система (форма заявки) |
| \`contacted\` | Менеджер поговорив із клієнтом: дзвінок, зустріч або відповідь на лист | Після першої розмови, а не після листа без відповіді | Менеджер, який веде лід |
| \`qualified\` | Є реальна задача, орієнтовний бюджет, дедлайн і людина, яка ухвалює рішення; готуємо кошторис | Після брифу, коли все це відомо | Менеджер, який веде лід |
| \`won\` | Клієнт погодив кошторис: підписано договір або отримано передоплату | Після підписання чи передоплати | Керівник акаунтів |
| \`lost\` | Угоди не буде: клієнт відмовився, обрав іншу агенцію, не відповідає 30 днів або задача не нашого профілю | У будь-який момент, з причиною | Менеджер, який веде лід |

- Повернути лід у роботу (наприклад, \`lost\` → \`contacted\`) можна, якщо клієнт повернувся; причину
  пишемо обов'язково.
- Перед кожною зміною статусу агент показує людині лід, старий і новий статус та причину й чекає
  підтвердження.
`;

export const factory = () => {
  const server = new McpServer({ name: "leaddesk", version: "0.1.0" });

  server.registerTool(
    "leaddesk_find_leads",
    {
      title: "Знайти ліди LeadDesk",
      description:
        "Повертає ліди LeadDesk із заданим статусом, найновіші першими: ідентифікатор, компанія, статус, джерело, бюджет і дата заявки, а також скільки всього лідів має цей статус. Імені, email і тексту заявки не повертає. Тільки читає, нічого не змінює. Що означає кожен статус — у ресурсі leaddesk://reference/statuses.",
      inputSchema: {
        status: z
          .enum([...LEAD_STATUSES, "any"])
          .describe("Статус, за яким шукати: new, contacted, qualified, won або lost; any — ліди з будь-яким статусом"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Скільки лідів повернути, від 1 до 50; за замовчуванням 10. Скільки всього знайдено, видно в total"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ status, limit }) => {
      const matched = [...leads.values()]
        .filter((l) => status === "any" || l.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const found = matched.slice(0, limit).map(publicView);
      const head = `Лідів зі статусом ${status}: ${matched.length}; показано ${found.length}, найновіші першими.`;
      return {
        content: [{ type: "text", text: [head, ...found.map(describeLead)].join("\n") }],
        structuredContent: { status, total: matched.length, returned: found.length, leads: found },
      };
    },
  );

  server.registerTool(
    "leaddesk_set_lead_status",
    {
      title: "Змінити статус ліда LeadDesk",
      description:
        "ЗМІНЮЄ ДАНІ: переводить один лід LeadDesk у новий статус і пише запис в аудит (дія, лід, час, старий і новий статус, причина). Перед викликом покажи людині ідентифікатор ліда, компанію, поточний і новий статус та причину й дочекайся її підтвердження. Статус — лише один із п'яти зі словника LeadDesk (що кожен означає — у ресурсі leaddesk://reference/statuses). Ідентифікатор не вгадуй: знайди його через leaddesk_find_leads.",
      inputSchema: {
        leadId: z
          .string()
          .regex(LEAD_ID)
          .describe("Ідентифікатор ліда: lead_ і чотири цифри, напр. lead_0002. Знайти його можна через leaddesk_find_leads"),
        status: z
          .enum(LEAD_STATUSES)
          .describe("Новий статус ліда: new, contacted, qualified, won або lost. Має відрізнятися від поточного"),
        reason: z
          .string()
          .trim()
          .min(3)
          .max(500)
          .describe("Чому змінюємо статус, 3–500 символів, напр. «зателефонували, клієнт чекає кошторис». Потрапляє в аудит"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ leadId, status, reason }) => {
      const lead = leads.get(leadId);
      if (!lead) {
        return fail(
          `Ліда ${leadId} у LeadDesk немає. Знайди правильний ідентифікатор через leaddesk_find_leads (status: any) і спробуй ще раз.`,
        );
      }
      if (lead.status === status) {
        return fail(
          `Лід ${leadId} (${lead.company}) уже має статус ${status}, змінювати нічого. Якщо мався на увазі інший статус, уточни в людини.`,
        );
      }

      const from = lead.status;
      lead.status = status;
      const audit = { action: "lead.status_changed", leadId, at: new Date().toISOString(), from, to: status, reason };
      auditLog.push(audit);
      console.error(`[leaddesk] ${audit.action} ${leadId} ${from} -> ${status} (audit entries: ${auditLog.length})`);

      return {
        content: [
          {
            type: "text",
            text: `Статус ${leadId} (${lead.company}) змінено: ${from} → ${status}. Запис аудиту: ${audit.action}, ${audit.at}.`,
          },
        ],
        structuredContent: { lead: publicView(lead), audit },
      };
    },
  );

  server.registerResource(
    "leaddesk-statuses",
    "leaddesk://reference/statuses",
    {
      title: "Статуси лідів LeadDesk",
      description: "П'ять статусів ліда: що кожен означає для команди Studio Nova, коли й хто переводить у нього лід",
      mimeType: "text/markdown",
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: STATUSES_MD }] }),
  );

  return server;
};
