import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// We need an absolute URL for the egg image since Satori requires it, or we fetch it.
// Assuming the app is deployed at the current host.
export async function GET(req: NextRequest) {
  try {
    const { searchParams, origin } = new URL(req.url);

    // Parse parameters
    const user = searchParams.get('user') || '0x0000...0000';
    const eggs = searchParams.get('eggs') || '0';
    const rank = searchParams.get('rank') || '-';
    const streak = searchParams.get('streak') || '0';
    const taps = searchParams.get('taps') || '0';
    const totalEggs = Number(searchParams.get('totalEggs') || '0');
    const target = Number(searchParams.get('target') || '1000000');
    const avatar = searchParams.get('avatar') || `https://effigy.im/a/${user}.svg`;

    // Abbreviate address if it's a full address
    const shortUser = user.startsWith('0x') && user.length === 42 
      ? `${user.slice(0, 6)}...${user.slice(-4)}` 
      : user;

    // Calculate progress bar width
    const progressPercent = Math.min(100, Math.max(0, (totalEggs / target) * 100));

    // Load the images dynamically to prevent Vercel from bundling heavy assets into the Edge Function (1MB limit)
    const eggImgData = await fetch(new URL('/egg.png', origin)).then((res) => res.arrayBuffer());
    const logoImgData = await fetch(new URL('/icon.png', origin)).then((res) => res.arrayBuffer());

    const imageResponse = new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            backgroundColor: '#0B0B0F', // Premium dark background
            fontFamily: 'Inter, sans-serif',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Background Glows */}
          <div
            style={{
              position: 'absolute',
              top: '-150px',
              right: '-150px',
              width: '800px',
              height: '800px',
              background: 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, rgba(11,11,15,0) 70%)',
              borderRadius: '50%',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '-200px',
              left: '-200px',
              width: '600px',
              height: '600px',
              background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, rgba(11,11,15,0) 70%)',
              borderRadius: '50%',
            }}
          />

          {/* MAIN CONTAINER */}
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: '100%',
              padding: '60px',
            }}
          >
            {/* LEFT COLUMN (Content) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '60%',
                height: '100%',
                justifyContent: 'space-between',
                zIndex: 10,
              }}
            >
              {/* Top: Logo & Title */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                  <img src={logoImgData as any} width={48} height={48} style={{ borderRadius: '12px', marginRight: '16px', border: '1px solid rgba(255,255,255,0.1)' }} />
                  <span style={{ fontSize: '32px', fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>1 Million Egg</span>
                </div>
                <h1 style={{ fontSize: '56px', fontWeight: 900, color: 'white', letterSpacing: '-1.5px', margin: 0, lineHeight: '1.1' }}>
                  Tap the Egg.<br />
                  <span style={{ color: '#F59E0B' }}>Earn Real USDC.</span>
                </h1>
              </div>

              {/* Middle: User Profile & Stats */}
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: '30px' }}>
                {/* User Info */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
                  <img 
                    src={avatar} 
                    width={64} 
                    height={64} 
                    style={{ 
                      borderRadius: '32px', 
                      marginRight: '16px',
                      border: '2px solid rgba(245,158,11,0.5)',
                      backgroundColor: '#111'
                    }} 
                  />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>{shortUser}</span>
                    <span style={{ fontSize: '16px', color: '#888', fontWeight: 500, letterSpacing: '1px' }}>PLAYER</span>
                  </div>
                </div>

                {/* Stats Grid (Satori supports flex wrap but explicit rows are safer) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', maxWidth: '500px' }}>
                  
                  {/* Stat Card: Season Eggs */}
                  <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px', width: '230px' }}>
                    <span style={{ fontSize: '14px', color: '#F59E0B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>🥚 Season Eggs</span>
                    <span style={{ fontSize: '32px', color: 'white', fontWeight: 800, marginTop: '8px' }}>{Number(eggs).toLocaleString('en-US')}</span>
                  </div>

                  {/* Stat Card: Global Rank */}
                  <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px', width: '230px' }}>
                    <span style={{ fontSize: '14px', color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>🏆 Global Rank</span>
                    <span style={{ fontSize: '32px', color: 'white', fontWeight: 800, marginTop: '8px' }}>#{rank}</span>
                  </div>

                  {/* Stat Card: Current Streak */}
                  <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px', width: '230px' }}>
                    <span style={{ fontSize: '14px', color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>🔥 Current Streak</span>
                    <span style={{ fontSize: '32px', color: 'white', fontWeight: 800, marginTop: '8px' }}>{streak} Days</span>
                  </div>

                  {/* Stat Card: Lifetime Taps */}
                  <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px', width: '230px' }}>
                    <span style={{ fontSize: '14px', color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>👆 Lifetime Taps</span>
                    <span style={{ fontSize: '32px', color: 'white', fontWeight: 800, marginTop: '8px' }}>{Number(taps).toLocaleString('en-US')}</span>
                  </div>

                </div>
              </div>

              {/* Bottom: Global Progress & Links */}
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
                <span style={{ fontSize: '14px', color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Global Progress</span>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {/* Premium Progress Bar */}
                  <div style={{ display: 'flex', width: '300px', height: '12px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', overflow: 'hidden', marginRight: '16px' }}>
                    <div style={{ display: 'flex', width: `${progressPercent}%`, height: '100%', background: 'linear-gradient(90deg, #F59E0B 0%, #FCD34D 100%)' }} />
                  </div>
                  <span style={{ fontSize: '16px', color: 'white', fontWeight: 700 }}>{totalEggs.toLocaleString('en-US')} / {target.toLocaleString('en-US')}</span>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN (Big Egg & CTA) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '40%',
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              {/* Egg Glow */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '350px',
                  height: '350px',
                  background: 'radial-gradient(circle, rgba(245,158,11,0.4) 0%, rgba(245,158,11,0) 70%)',
                  borderRadius: '50%',
                  zIndex: 0,
                }}
              />
              {/* Egg Image */}
              <img 
                src={eggImgData as any} 
                width={380} 
                height={380} 
                style={{ 
                  zIndex: 1, 
                  filter: 'drop-shadow(0px 20px 40px rgba(0,0,0,0.5))'
                }} 
              />

              {/* URL & Available On (Bottom Right) */}
              <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', bottom: 0, right: 0, alignItems: 'flex-end', opacity: 0.8 }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: 'white', letterSpacing: '1px', marginBottom: '8px' }}>1MillionEgg.xyz</span>
                <span style={{ fontSize: '14px', color: '#888', fontWeight: 600 }}>Available on Base & Farcaster</span>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );

    // Buffer the streaming ImageResponse to determine Content-Length
    // Twitterbot requires Content-Length to display the image.
    const buffer = await imageResponse.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e: any) {
    console.error('Failed to generate OG image', e);
    return new Response(`Failed to generate image`, {
      status: 500,
    });
  }
}
