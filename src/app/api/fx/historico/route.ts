import { NextResponse } from "next/server";
import { fetchAllFxHistorico } from "@/lib/dolar/argentinadatos";

export const revalidate = 3600;

export async function GET() {
  try {
    const data = await fetchAllFxHistorico();
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
