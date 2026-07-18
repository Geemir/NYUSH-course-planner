import { NextResponse } from "next/server";

/** Compatibility redirect after the client moved to the bounded bootstrap API. */
export async function GET(request: Request) {
  return NextResponse.redirect(
    new URL("/api/catalog/bootstrap", request.url),
    308,
  );
}
