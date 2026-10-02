import Header from "./components/Header";

export default function App() {
  return (
    <div className="h-dvh">
      {/* Shell: 56 px header over the main area, centered at 1680 px; only the panels scroll. */}
      <div className="mx-auto grid h-full max-w-[1680px] grid-rows-[56px_minmax(0,1fr)] bg-surface min-[1680px]:border-x min-[1680px]:border-line">
        <Header onNewChat={() => {}} />
        {/* Wide: chat beside results. Narrow: results strip above the chat. */}
        <main className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[clamp(340px,32vw,460px)_minmax(0,1fr)] lg:grid-rows-1">
          <section aria-label="Chat" className="flex min-h-0 min-w-0 flex-col lg:border-r lg:border-line" />
          <section aria-label="Results" className="order-first min-h-0 min-w-0 bg-surface-muted lg:order-none" />
        </main>
      </div>
    </div>
  );
}
