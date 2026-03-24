# AI Cost Envelope

## Model Selection

The agent uses `claude-haiku-4-5-20251001` by default. This is a deliberate cost/capability trade-off:

| Model | Input $/1M | Output $/1M | Use case |
|---|---|---|---|
| claude-haiku-4-5 | $0.80 | $4.00 | Default agent — fast, cheap, capable |
| claude-sonnet-4-6 | $3.00 | $15.00 | Complex reasoning tasks |
| claude-opus-4-6 | $15.00 | $75.00 | Highest capability |

Override via `AGENT_MODEL` env var.

## Per-Step Cost Estimate

Each agent step loop iteration:
- System prompt: ~400 tokens
- Tool definitions (4 tools): ~600 tokens
- Conversation history (grows with steps): ~200–2000 tokens per step
- Tool result (file read, shell output): ~100–5000 tokens

**Typical step (haiku):**
- Input: ~1500 tokens × $0.80/1M = **~$0.0012**
- Output: ~200 tokens × $4.00/1M = **~$0.0008**
- Per step total: **~$0.002**

## Per-Session Cost Estimate

A typical 10-step session:
- ~$0.02 (haiku)
- ~$0.08 (sonnet)
- ~$0.40 (opus)

Costs grow roughly linearly with steps due to context accumulation. Very long sessions (50+ steps) may see 2–3× the per-step cost from larger context.

## Monthly Cost at Scale

| Sessions/day | Model | Est. $/month |
|---|---|---|
| 10 | haiku | ~$6 |
| 100 | haiku | ~$60 |
| 10 | sonnet | ~$24 |
| 100 | sonnet | ~$240 |

## Cost Controls

1. **Model selection**: Use haiku for routine tasks, sonnet/opus only when needed.
2. **Step limit**: The step loop enforces a max-steps guard (default: 50) to prevent runaway sessions.
3. **Context pruning**: Tool results are truncated at 50KB to prevent large inputs.
4. **Stop signal**: Users can stop sessions at any step boundary, capping costs early.

## Eval Cost

The MVP eval suite (`npm run eval:mvp`) makes **no LLM calls** — all scenarios are deterministic HTTP tests. Eval cost is zero beyond server compute.
