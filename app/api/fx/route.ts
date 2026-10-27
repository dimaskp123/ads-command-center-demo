import { NextResponse } from "next/server";
import { FX_SNAPSHOT } from "@/lib/clients/fx";

// Demo build: always the fixed sample rates.
export async function GET() {
  return NextResponse.json(FX_SNAPSHOT);
}
