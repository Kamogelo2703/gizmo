import { useApp } from "./store.jsx";

export default function PairsSheet() {
  const { pairsOpen, setPairsOpen, catalog, appSymbols, removeSymbolEverywhere } = useApp();
  if (!pairsOpen) return null;

  const selected = catalog.filter((s) => appSymbols.has(s));
  const available = catalog.filter((s) => !appSymbols.has(s));

  return (
    <div className="pairs-sheet">
      <div className="pairs-backdrop" onClick={() => setPairsOpen(false)} />
      <div className="pairs-panel" role="dialog" aria-modal="true">
        <header className="pairs-header">
          <button
            className="pairs-back"
            type="button"
            onClick={() => setPairsOpen(false)}
            aria-label="Close pairs"
          >
            ←
          </button>
          <h2>Pairs</h2>
          <span className="pairs-count">{selected.length} on app</span>
        </header>
        <section className="pairs-section">
          <h3>Selected Symbols</h3>
          <p className="pairs-note">Synced from Manage EA — remove here or on the EA.</p>
          <div className="symbol-list">
            {selected.map((symbol) => (
              <button
                key={symbol}
                type="button"
                className="symbol-chip is-selected"
                onClick={() => removeSymbolEverywhere(symbol)}
              >
                <span>{symbol}</span>
                <span className="chip-x">×</span>
              </button>
            ))}
          </div>
          {selected.length === 0 ? (
            <p className="pairs-empty">No symbols yet — choose them in Manage EA</p>
          ) : null}
        </section>
        <section className="pairs-section">
          <h3>Catalog</h3>
          <p className="pairs-note">Add symbols from Manage EA to put them on the app.</p>
          <div className="symbol-list">
            {available.map((symbol) => (
              <span key={symbol} className="symbol-chip is-available">
                <span>{symbol}</span>
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
