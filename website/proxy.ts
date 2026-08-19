import { NextRequest, NextResponse } from 'next/server';

export default function proxy(request: NextRequest) {
  const basePath = request.nextUrl.basePath || '/j-aautomation';
  const pathname = request.nextUrl.pathname;

  if (pathname === '/' || pathname === basePath || pathname === `${basePath}/`) {
    const url = request.nextUrl.clone();
    url.pathname = `${basePath}/en`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
