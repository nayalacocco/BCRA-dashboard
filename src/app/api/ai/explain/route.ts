import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      "⚠️ ANTHROPIC_API_KEY no está configurada. Agregála en las variables de entorno de Vercel para usar esta función.",
      { status: 503 }
    );
  }

  let body: {
    variableName?: string;
    unit?: string;
    lastValue?: number;
    lastDate?: string;
    recentData?: { fecha: string; valor: number }[];
    period?: string;
    question?: string;
  };

  try {
    body = await req.json();
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const { variableName, unit, lastValue, lastDate, recentData, period, question } = body;

  // Build context string
  const dataSnippet = (recentData ?? [])
    .slice(-8)
    .map((d) => `${d.fecha}: ${d.valor}`)
    .join(", ");

  const context = [
    `Variable del BCRA: "${variableName}"`,
    unit ? `Unidad: ${unit}` : null,
    lastValue != null ? `Último valor: ${lastValue}` : null,
    lastDate ? `Fecha: ${lastDate}` : null,
    period ? `Período analizado en el gráfico: ${period}` : null,
    dataSnippet ? `Valores recientes: ${dataSnippet}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  const defaultPrompt = `${context}.\n\nExplicame brevemente qué mide esta variable, qué significan los valores recientes, y cómo interpretarlo en el contexto de la economía argentina. Sé directo, máximo 3 párrafos cortos.`;

  const userContent = question ? `${context}.\n\nPregunta: ${question}` : defaultPrompt;

  const client = new Anthropic();

  try {
    // Use streaming API — iterate over raw SSE events and emit text_delta chunks
    const stream = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 600,
      stream: true,
      system: `Sos un economista especializado en Argentina.
Explicás variables del BCRA de forma clara, concisa y sin tecnicismos innecesarios.
Respondés siempre en español rioplatense.
Cuando sea relevante, hacés referencia al contexto macroeconómico argentino reciente.
Si el dato indica algo preocupante o positivo, lo señalás con claridad.
No usás asteriscos ni markdown, solo texto plano.`,
      messages: [{ role: "user", content: userContent }],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return new Response(`Error al consultar la IA: ${msg}`, { status: 500 });
  }
}
