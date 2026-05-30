import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * 工具透明约束扩展。
 * - 注入系统提示词，要求 LLM 在工具调用前写【目的】
 * - 拦截未说明目的的工具调用
 * - 工具执行时在 widget 面板展示目的，与工具调用融为一体
 */
export default function (pi: ExtensionAPI) {
  let reasoningText = "";
  let messageStarted = false;

  pi.on("before_agent_start", async (event, _ctx) => {
    return {
      systemPrompt:
        event.systemPrompt +
        "\n\n## 工具调用规则（硬性约束）\n" +
        "每次调用工具前，必须在同一条回复中先写出：\n" +
        "【目的】要做什么\n" +
        "然后才能发起工具调用。未写目的的工具调用会被自动拦截。\n",
    };
  });

  pi.on("message_start", async (event) => {
    if (event.message.role === "assistant") {
      messageStarted = true;
      reasoningText = "";
    }
  });

  pi.on("message_update", async (event) => {
    if (event.message.role !== "assistant") return;
    const text = extractText(event.message.content);
    if (text.length > 10) reasoningText = text;
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!messageStarted) return;
    if (!reasoningText) {
      return {
        block: true,
        reason: "工具调用被拦截：未在调用前说明目的。请先写【目的】描述要做什么，然后重试。",
      };
    }

    if (!ctx.hasUI) return;

    const snippet = reasoningText.replace(/\n/g, " ").slice(0, 80);
    const purpose = extractPurpose(reasoningText);

    ctx.ui.setWidget("tool-purpose", [
      `🔧 ${event.toolName}`,
      purpose ? `📌 ${purpose}` : `📌 ${snippet}`,
    ]);
  });

  pi.on("tool_execution_end", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    setTimeout(() => {
      ctx.ui.setWidget("tool-purpose", undefined);
    }, 2000);
  });
}

/** 从文本中提取【目的】后面的内容 */
function extractPurpose(text: string): string {
  const match = text.match(/【目的】\s*(.+?)(?:【|$)/);
  return match ? match[1].trim().slice(0, 60) : "";
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return (content as any[])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text ?? "")
      .join(" ");
  }
  return "";
}
