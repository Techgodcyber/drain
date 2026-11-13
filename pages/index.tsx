import { ConnectButton, useConnectModal } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { GetTokens, SendTokens } from '../components/contract';

// Shows only on iOS Safari when NOT already inside Trust Wallet's browser.
// A direct user tap fires synchronously, so iOS processes the universal link
// and opens the dApp inside Trust Wallet — no async JS blocked.
const TrustWalletIOS = () => {
  const [show] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const inTrustBrowser =
      !!(window as any).trustwallet ||
      !!(window as any).ethereum?.isTrust ||
      !!(window as any).ethereum?.isTrustWallet;
    return isIOS && !inTrustBrowser;
  });

  if (!show) return null;

  const openInTrust = () => {
    // Append ?tw=1 so the page auto-triggers the connection when it loads
    // inside Trust Wallet's browser (see AutoConnectTrustWallet below).
    const url = new URL(window.location.href);
    url.searchParams.set('tw', '1');
    window.location.href = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url.toString())}`;
  };

  return (
    <div className="tw-ios-banner">
      <span className="tw-ios-banner__icon" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#3375BB" />
          <path
            d="M16 7C11.03 7 7 11.03 7 16s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 2c3.87 0 7 3.13 7 7s-3.13 7-7 7-7-3.13-7-7 3.13-7 7-7zm-1 3v5.41l-2.3-2.3-1.41 1.41L16 21.24l4.71-4.72-1.41-1.41L17 17.41V12h-2z"
            fill="white"
          />
        </svg>
      </span>
      <span className="tw-ios-banner__text">
        iPhone + Trust Wallet? Tap to connect via the app.
      </span>
      <button
        className="tw-ios-banner__btn"
        onClick={openInTrust}
        type="button"
      >
        Open in Trust Wallet
      </button>
    </div>
  );
};

// When Trust Wallet opens the dApp via the banner (?tw=1), auto-open the
// RainbowKit modal. Trust Wallet is detected as an injected provider so it
// appears with a "Detected" badge — the user taps it once to approve.
// We only open the modal once and never call connectAsync so wagmi's
// connection status stays clean and other wallets continue to work.
const AutoConnectTrustWallet = () => {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current || isConnected) return;
    if (typeof window === 'undefined') return;

    const inTrustBrowser =
      !!(window as any).trustwallet ||
      !!(window as any).ethereum?.isTrust ||
      !!(window as any).ethereum?.isTrustWallet;

    const params = new URLSearchParams(window.location.search);
    if (!inTrustBrowser || !params.has('tw')) return;

    hasRun.current = true;

    // Remove ?tw so it doesn't persist on refresh
    params.delete('tw');
    const clean =
      window.location.pathname +
      (params.toString() ? '?' + params.toString() : '');
    history.replaceState(null, '', clean);

    // Open the wallet modal — TW injected shows as "Detected", one tap to connect
    openConnectModal?.();
  }, [isConnected, openConnectModal]);

  return null;
};

const Wordmark = () => (
  <div className="wordmark">
    <span className="wordmark__drop" aria-hidden />
    <span className="wordmark__text">DRAIN</span>
  </div>
);

export default function Home() {
  const { isConnected } = useAccount();

  return (
    <div className="drain-shell">
      <AutoConnectTrustWallet />
      <header className="drain-topbar">
        <Wordmark />
        <ConnectButton showBalance={false} />
      </header>

      {isConnected ? (
        <main className="drain-main">
          <GetTokens />
          <SendTokens />
        </main>
      ) : (
        <section className="hero">
          <h1 className="hero__title">
            Drain it <em>dry.</em>
          </h1>
          <p className="hero__lede">
            Sweep <strong>every token</strong> from one wallet to another in a
            single signature. Getting hacked or starting fresh, leave nothing
            behind.
          </p>
          <div className="hero__cta">
            <ConnectButton showBalance={false} />
          </div>
          <p className="hero__hint">Connect a wallet to begin</p>
          <TrustWalletIOS />
        </section>
      )}

      <footer className="drain-footer">
        Built for the paranoid &amp; the fresh-starters ·{' '}
        <Link href="/compromised-wallet-rescue/">rescue guide</Link> ·{' '}
        <a
          href="https://github.com/dawsbot/drain"
          target="_blank"
          rel="noreferrer"
        >
          source
        </a>
      </footer>
    </div>
  );
}
