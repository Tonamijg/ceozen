// Génère dynamiquement l'icône CEOZEN en PNG (utilisé par le manifest PWA)
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const size = Math.min(512, Math.max(16, parseInt(req.nextUrl.searchParams.get('size') ?? '512')));
  const radius     = Math.round(size * 0.18);
  const fontSizeBig = Math.round(size * 0.27);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: '#050816',
          borderRadius: radius,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px solid #00d4ff44',
        }}
      >
        <span style={{ fontSize: fontSizeBig, fontWeight: 900, color: '#00d4ff', lineHeight: 1.1 }}>
          CEO
        </span>
        <span style={{ fontSize: fontSizeBig, fontWeight: 300, color: '#ffffff', lineHeight: 1.1 }}>
          ZEN
        </span>
      </div>
    ),
    { width: size, height: size }
  );
}
