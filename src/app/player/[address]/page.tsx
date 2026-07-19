export default function PlayerPage() {
  // We MUST NOT use server-side redirect() here!
  // If we return HTTP 307, Twitter/Farcaster bots will follow the redirect to "/" 
  // and scrape the default layout metadata (egg.png) instead of this page's dynamic OG image.
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0B0F', color: '#F59E0B', fontFamily: 'sans-serif' }}>
      <p>Loading player profile...</p>
      <script dangerouslySetInnerHTML={{ __html: `window.location.href = "/";` }} />
    </div>
  );
}
