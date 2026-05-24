import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const size = Math.min(512, Math.max(16, parseInt(req.nextUrl.searchParams.get('size') ?? '512')));
  const fontSize = Math.round(size * 0.26);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: '#050816',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize, fontWeight: 'bold', color: '#00d4ff', lineHeight: '1.15' }}>
          CEO
        </span>
        <span style={{ fontSize, fontWeight: 'normal', color: '#ffffff', lineHeight: '1.15' }}>
          ZEN
        </span>
      </div>
    ),
    { width: size, height: size }
  );
}
