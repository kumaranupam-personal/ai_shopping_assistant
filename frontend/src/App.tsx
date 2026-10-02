import { useState } from "react";

import ChatPanel from "./components/ChatPanel";
import Header from "./components/Header";
import ProductDrawer from "./components/ProductDrawer";
import ResultsPanel from "./components/ResultsPanel";
import ResultsStrip from "./components/ResultsStrip";
import { Banners, EmptyState, SkeletonCards } from "./components/States";
import { useChat } from "./useChat";

export default function App() {
  const chat = useChat();
  const { resultSets, selectedResultSet, turnRunning, loadingResults } = chat.state;
  const [openProduct, setOpenProduct] = useState<string | null>(null);
  const resultSet = selectedResultSet === null ? null : resultSets[selectedResultSet];
  const results = resultSet && {
    resultSet,
    onOpenProduct: setOpenProduct,
    onSuggestion: chat.send,
    turnRunning,
  };
  return (
    <div className="h-dvh">
      {/* Shell: 56 px header over the main area, centered at 1680 px; only the panels scroll. */}
      <div className="mx-auto grid h-full max-w-[1680px] grid-rows-[56px_auto_minmax(0,1fr)] bg-surface min-[1680px]:border-x min-[1680px]:border-line">
        <Header onNewChat={chat.newChat} />
        <Banners notice={chat.state.notice} onDismiss={chat.dismissNotice} />
        {/* Wide: chat beside results. Narrow: results strip above the chat. */}
        <main className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[clamp(340px,32vw,460px)_minmax(0,1fr)] lg:grid-rows-1">
          <section aria-label="Chat" className="flex min-h-0 min-w-0 flex-col lg:border-r lg:border-line">
            <ChatPanel chat={chat} />
          </section>
          <section aria-label="Results" className="order-first min-h-0 min-w-0 bg-surface-muted lg:order-none">
            {/* CSS picks the layout, so resizing never re-mounts or loses state. */}
            <div className="hidden h-full lg:block">
              {loadingResults ? <SkeletonCards /> : results ? <ResultsPanel {...results} /> : <EmptyState className="h-full justify-center px-6" />}
            </div>
            <div className="lg:hidden">{loadingResults ? <SkeletonCards compact /> : results && <ResultsStrip {...results} />}</div>
          </section>
        </main>
      </div>
      {openProduct && <ProductDrawer key={openProduct} productId={openProduct} onClose={() => setOpenProduct(null)} />}
    </div>
  );
}
