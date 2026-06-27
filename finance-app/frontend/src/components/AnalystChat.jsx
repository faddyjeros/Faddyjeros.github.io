import { useRef, useState } from "react";
import { api } from "../api";
import ChatMessage from "./ChatMessage";

const SUGGESTED_QUERIES = [
  "How much can I invest this month?",
  "How is my portfolio performing?",
  "Show my spending breakdown for the last 3 months",
  "What's my savings rate trend?",
];

export default function AnalystChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [toolCalls, setToolCalls] = useState([]);
  const scrollRef = useRef(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  };

  const sendMessage = async (text) => {
    if (!text.trim() || streaming) return;

    const userMsg = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);
    setToolCalls([]);
    scrollToBottom();

    const apiMessages = newMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await api.streamAnalystChat(apiMessages);
      if (!response.ok) {
        const err = await response.text();
        setMessages([...newMessages, { role: "assistant", content: `Error: ${err}` }]);
        setStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      let currentToolCalls = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const event = JSON.parse(data);
            if (event.type === "text") {
              assistantText += event.content;
              setMessages([...newMessages, { role: "assistant", content: assistantText }]);
              scrollToBottom();
            } else if (event.type === "tool_call") {
              currentToolCalls = [...currentToolCalls, { name: event.name, input: event.input }];
              setToolCalls(currentToolCalls);
            } else if (event.type === "done") {
              break;
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }

      if (assistantText) {
        setMessages([...newMessages, { role: "assistant", content: assistantText }]);
      }
    } catch (e) {
      setMessages([...newMessages, { role: "assistant", content: `Connection error: ${e.message}` }]);
    } finally {
      setStreaming(false);
      setToolCalls([]);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-2 pt-4">
            <p className="text-content-muted text-xs">Try asking:</p>
            {SUGGESTED_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="block w-full text-left text-xs bg-surface-hover/50 hover:bg-surface-hover text-content-secondary rounded-lg px-3 py-2 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}

        {streaming && toolCalls.length > 0 && (
          <div className="text-xs text-content-muted space-y-1">
            {toolCalls.map((tc, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="animate-pulse">●</span>
                <span>{tc.name.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        )}

        {streaming && toolCalls.length === 0 && messages[messages.length - 1]?.role === "user" && (
          <div className="text-content-muted text-sm animate-pulse">Thinking...</div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-line p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your finances..."
            disabled={streaming}
            className="flex-1 bg-base border border-line rounded-lg px-3 py-2 text-sm text-content placeholder-zinc-500 focus:outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="bg-accent hover:bg-accent-hover disabled:bg-line text-zinc-900 font-medium px-3 py-2 rounded-lg text-sm transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
